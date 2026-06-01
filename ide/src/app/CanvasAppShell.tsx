import { useCallback, useEffect, useRef, useState } from "react";
import { listen, emitTo } from "@tauri-apps/api/event";
import { AgentRunBridge, useChatStore } from "@/modules/ai";
import { getModel, OPENCODE_DEFAULT_BASE_URL } from "@/modules/ai/config";
import { AiComposerProvider } from "@/modules/ai/lib/composer";
import { PinnedPanelsPortal, useCanvasStore } from "@/modules/canvas";
import { OnboardingWizard } from "@/modules/onboarding/OnboardingWizard";

import { useOrkestraStore } from "@/modules/canvas/orkestraStore";
import { V3InfiniteCanvas, V3CanvasTopBar, V3SecondaryCanvas } from "@/modules/v3-canvas";
import { CanvasSettingsOverlay } from "@/modules/canvas/CanvasSettingsOverlay";
import { ThemeProvider } from "@/modules/theme";
import { UpdaterDialog } from "@/modules/updater";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useVariableStore } from "@/modules/canvas/variableStore";
import { useApiKeys } from "./hooks/useApiKeys";
import { useMcpBridge } from "./hooks/useMcpBridge";
import { useVaultTrashCleanup } from "./hooks/useVaultTrashCleanup";
import { native } from "@/modules/ai/lib/native";
import { setLogVaultRoot } from "@/modules/logs/logStore";
import type { AiDiffStatus } from "@/modules/tabs";

type VaultWritePayload = {
  path: string;
  category: string;
  slug: string;
  previousVersion: string | null;
};

type UndoToast = {
  category: string;
  slug: string;
  originalPath: string;
  backupPath: string;
  expiresAt: number;
};

function CanvasAppShellInner() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [undoToast, setUndoToast] = useState<UndoToast | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prefsHydrated = usePreferencesStore((s) => s.hydrated);
  const isOnboarded   = usePreferencesStore((s) => s.onboarded);

  const setApiKeys = useChatStore((s) => s.setApiKeys);

  const workspaceRoot = usePreferencesStore((s) => s.workspaceRoot) ?? "C:\\Sentor";
  const canvasHydrated = useCanvasStore((s) => s.hydrated);
  const addPanel = useCanvasStore((s) => s.addPanel);
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const isSplit = useCanvasStore((s) => s.isSplit);

  const selectedModelId = useChatStore((s) => s.selectedModelId);
  const opencodeBase   = OPENCODE_DEFAULT_BASE_URL;
  const opencodeModel  = usePreferencesStore((s) => s.opencodeChatModelId) || "deepseek-v4-flash-free";

  useApiKeys(setApiKeys);
  useVaultTrashCleanup(workspaceRoot);

  useEffect(() => {
    void useVariableStore.getState().hydrate();
  }, []);

  useEffect(() => {
    setLogVaultRoot(workspaceRoot || "C:\\Sentor");
  }, [workspaceRoot]);

  // Switch canvas storage file when vault (workspace root) changes.
  // Without this, all vaults share the same sentor-canvas.json file.
  useEffect(() => {
    if (!prefsHydrated) return;
    void useCanvasStore.getState().switchVault(workspaceRoot);
  }, [workspaceRoot, prefsHydrated]);

  // ── Vault write undo toast ────────────────────────────────────────────────
  useEffect(() => {
    const unsub = listen<VaultWritePayload>("sentor://vault-page-written", ({ payload }) => {
      if (!payload.previousVersion) return;
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setUndoToast({
        category: payload.category,
        slug: payload.slug,
        originalPath: payload.path,
        backupPath: payload.previousVersion,
        expiresAt: Date.now() + 5000,
      });
      undoTimerRef.current = setTimeout(() => setUndoToast(null), 5000);
    });
    return () => {
      void unsub.then((fn) => fn());
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const handleUndo = useCallback(async () => {
    if (!undoToast) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoToast(null);
    try {
      const result = await native.readFile(undoToast.backupPath);
      if (result.kind !== "text") throw new Error("backup is not a text file");
      await native.writeFile(undoToast.originalPath, result.content);
    } catch (e) {
      console.error("[VaultUndo] restore failed:", e);
    }
  }, [undoToast]);

  // ── V3 Input → Canvas bridge ─────────────────────────────────────────────
  useEffect(() => {
    const ork = useOrkestraStore.getState();
    const promptP = listen<{ text: string }>("sentor:canvas-prompt", ({ payload }) => {
      ork.setCollapsed(false);
      ork.setV3InputActive(true);
      const model = getModel(selectedModelId);
      const keys = useChatStore.getState().apiKeys;
      void ork.send(payload.text, model.provider, "", "", "", "", keys.opencode ?? "", opencodeBase, opencodeModel);
    });
    const unlinkP = listen("sentor:canvas-unlink", () => {
      useOrkestraStore.getState().setV3InputActive(false);
    });
    return () => {
      void promptP.then((fn) => fn());
      void unlinkP.then((fn) => fn());
    };
  }, [selectedModelId, opencodeBase, opencodeModel]);

  // ── Canvas IPC for V3InputShell (separate Tauri window) ─────────────────
  useEffect(() => {
    const reqP = listen("sentor:request-canvases", async () => {
      const { canvases, activeCanvasId } = useCanvasStore.getState();
      await emitTo("v3-input", "sentor:canvas-list", { canvases, activeCanvasId }).catch(() => {});
    });
    const switchP = listen<{ id: string }>("sentor:canvas-switch", async ({ payload }) => {
      await useCanvasStore.getState().switchCanvas(payload.id);
      const { canvases, activeCanvasId } = useCanvasStore.getState();
      await emitTo("v3-input", "sentor:canvas-list", { canvases, activeCanvasId }).catch(() => {});
    });
    return () => {
      void reqP.then(fn => fn());
      void switchP.then(fn => fn());
    };
  }, []);

  const openVaultTab = useCallback(
    (url: string) => {
      const id = addPanel("preview");
      updatePanel(id, { meta: { path: url } });
    },
    [addPanel, updatePanel],
  );

  const openWebTab = useCallback(
    (url: string) => {
      const id = addPanel("web");
      const cur = useCanvasStore.getState().panels.find((p) => p.id === id);
      updatePanel(id, { meta: { ...(cur?.meta ?? {}), url } });
    },
    [addPanel, updatePanel],
  );

  useMcpBridge({
    canvasHydrated,
    workspaceRoot,
    openVaultTab,
    openWebTab,
    openPanel: () => {},
    focusInput: () => {},
  });

  const openAiDiffTab = useCallback(
    (_input: { path: string; originalContent: string; proposedContent: string; approvalId: string; isNewFile: boolean }) =>
      null as number | null,
    [],
  );

  const setAiDiffStatus = useCallback(
    (_approvalId: string, _status: AiDiffStatus) => undefined,
    [],
  );

  // Onboarding: prefs yüklendi ve henüz tamamlanmadıysa wizard göster
  if (prefsHydrated && !isOnboarded) {
    return (
      <OnboardingWizard onComplete={() => {
        // setOnboarded(true) wizard içinde çağrılıyor; preferences store event ile güncellenir
      }} />
    );
  }

  return (
    <div className="canvas-root relative h-screen overflow-hidden" style={{ background: "#050507" }}>
      {isSplit ? (
        /* ── Split view: two canvases side-by-side ── */
        <div className="flex h-full w-full">
          {/* Primary canvas */}
          <div className="relative flex-1 overflow-hidden" style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
            <V3InfiniteCanvas />
            <V3CanvasTopBar onOpenSettings={() => setSettingsOpen(true)} />
          </div>
          {/* Secondary canvas */}
          <div className="relative flex-1 overflow-hidden">
            <V3SecondaryCanvas />
            <V3CanvasTopBar secondary onOpenSettings={() => setSettingsOpen(true)} />
          </div>
        </div>
      ) : (
        /* ── Single canvas ── */
        <div className="relative h-full w-full overflow-hidden">
          <V3InfiniteCanvas />
          <V3CanvasTopBar onOpenSettings={() => setSettingsOpen(true)} />
        </div>
      )}

      <PinnedPanelsPortal />

<AgentRunBridge openAiDiffTab={openAiDiffTab} setAiDiffStatus={setAiDiffStatus} />

      {settingsOpen && <CanvasSettingsOverlay onClose={() => setSettingsOpen(false)} />}

      <UpdaterDialog />

      {/* Vault undo snackbar */}
      {undoToast && (
        <div
          className="animate-in fade-in slide-in-from-bottom-2 fixed bottom-6 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-2.5"
          style={{
            background: "rgba(18,18,22,0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(18px)",
            boxShadow: "none",
            fontFamily: "system-ui",
          }}
        >
          <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.55)" }}>
            Written:{" "}
            <span className="font-mono" style={{ color: "#f5f5f5" }}>
              vault/{undoToast.category}/{undoToast.slug}
            </span>
          </span>
          <button
            type="button"
            onClick={() => void handleUndo()}
            className="rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition-colors"
            style={{ background: "rgba(91,141,239,0.18)", color: "#5b8def", border: "1px solid rgba(91,141,239,0.28)" }}
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); setUndoToast(null); }}
            className="ml-0.5 text-[11px] transition-opacity hover:opacity-100 opacity-40"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export function CanvasAppShell() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <AiComposerProvider>
          <CanvasAppShellInner />
        </AiComposerProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
