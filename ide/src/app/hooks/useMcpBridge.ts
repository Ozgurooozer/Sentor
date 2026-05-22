import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { safeInvoke } from "@/lib/safeInvoke";
import { useAgentsStore } from "@/modules/ai/store/agentsStore";
import { useCanvasStore } from "@/modules/canvas";

type Args = {
  /** Hydrated flag — wait for canvas store to load before doing anything. */
  canvasHydrated: boolean;
  /** Effective workspace root (stored pref ?? home fallback). */
  workspaceRoot: string;
  /** Open helpers for vault/web tabs. */
  openVaultTab: (url: string) => void;
  openWebTab: (url: string) => void;
  /** Open the AI chat panel + focus the input. */
  openPanel: () => void;
  focusInput: (prefill?: string | null) => void;
};

/**
 * Bridges the IDE to external MCP tools via the API server's command queue.
 *
 * Two flows:
 *  1. Export canvas state whenever it changes so external tools can read it.
 *  2. Poll the queue every 3s; on each tick, dispatch any queued commands
 *     (add/remove panel, open tab, send AI message).
 *
 * Rust starts a filesystem watcher on the queue file via `mcp_watch_start`,
 * which emits `atlas:mcp-cmd` whenever an external tool writes to the
 * queue — we drain immediately on each event. A slow polling fallback
 * (every 30s) catches the rare case where the watcher misses an event
 * (e.g. queue dir didn't exist when the watcher was started).
 */
export function useMcpBridge({
  canvasHydrated,
  workspaceRoot,
  openVaultTab,
  openWebTab,
  openPanel,
  focusInput,
}: Args) {
  // ── Export canvas state ───────────────────────────────────────────────────
  const canvasPanels = useCanvasStore((s) => s.panels);
  const canvasConnections = useCanvasStore((s) => s.connections);
  const canvasViewport = useCanvasStore((s) => s.viewport);
  const canvasNextZ = useCanvasStore((s) => s.nextZ);

  useEffect(() => {
    if (!canvasHydrated) return;
    const state = JSON.stringify({
      panels: canvasPanels,
      connections: canvasConnections,
      viewport: canvasViewport,
      nextZ: canvasNextZ,
    });
    void safeInvoke("mcp_export_state", { root: workspaceRoot, state });
  }, [
    canvasHydrated,
    canvasPanels,
    canvasConnections,
    canvasViewport,
    canvasNextZ,
    workspaceRoot,
  ]);

  // ── Poll command queue ────────────────────────────────────────────────────
  const addPanel = useCanvasStore((s) => s.addPanel);
  const removePanel = useCanvasStore((s) => s.removePanel);
  const updatePanel = useCanvasStore((s) => s.updatePanel);

  useEffect(() => {
    if (!canvasHydrated) return;
    const drain = async () => {
      const cmds = await safeInvoke<Array<Record<string, unknown>>>(
        "mcp_dequeue",
        { root: workspaceRoot },
      );
      if (!cmds || cmds.length === 0) return;
      for (const cmd of cmds) {
        if (cmd.type === "add_panel") {
          const id = addPanel(
            cmd.panelType as Parameters<typeof addPanel>[0],
            cmd.x !== undefined
              ? { x: cmd.x as number, y: cmd.y as number }
              : undefined,
          );
          if (cmd.title || cmd.meta) {
            updatePanel(id, {
              ...(cmd.title ? { title: cmd.title as string } : {}),
              ...(cmd.meta
                ? { meta: cmd.meta as Record<string, unknown> }
                : {}),
            });
          }
        } else if (cmd.type === "remove_panel") {
          removePanel(cmd.id as string);
        } else if (cmd.type === "open_tab") {
          const url = cmd.url as string;
          if (url.startsWith("http")) openWebTab(url);
          else openVaultTab(url);
        } else if (cmd.type === "send_message") {
          if (cmd.agentId)
            useAgentsStore.getState().setActiveId(cmd.agentId as string);
          openPanel();
          setTimeout(() => {
            focusInput(cmd.message as string);
          }, 100);
        }
      }
    };
    // Start the Rust file watcher (idempotent — re-calls are no-ops). Drain
    // anything queued while the IDE was closed, then subscribe to watcher
    // events. The 30s polling timer is a defensive fallback only.
    void safeInvoke("mcp_watch_start", { root: workspaceRoot });
    void drain();
    const unlistenP = listen("atlas:mcp-cmd", () => void drain());
    const timer = setInterval(() => void drain(), 30_000);
    return () => {
      clearInterval(timer);
      void unlistenP.then((fn) => fn());
    };
  }, [
    canvasHydrated,
    workspaceRoot,
    addPanel,
    removePanel,
    updatePanel,
    openVaultTab,
    openWebTab,
    openPanel,
    focusInput,
  ]);
}
