/**
 * CanvasPanelContent — dispatches per panel.type to the right interactive
 * component. Each wrapper is intentionally minimal: it adapts the existing
 * pane component (TerminalPane, EditorPane, VaultHomePane) to the
 * `panel.meta`-driven contract canvas panels use.
 *
 * Notes:
 *   - Terminals get a stable leafId allocated from a high range so they
 *     never collide with the tab system's leafIds.
 *   - Editor/Preview read the file path from `panel.meta.path`.
 *   - Web uses a plain iframe (no native child WebView) because the native
 *     webview cannot follow the canvas pan/zoom transform.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ChatPanel } from "@/modules/ai/components/ChatPanel";
import { AgentEditorPanel } from "./AgentEditorPanel";
import { localToAsset } from "@/modules/browser/assetUrl";
import { EditorPane } from "@/modules/editor/EditorPane";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { TerminalPane, type TerminalPaneHandle } from "@/modules/terminal";
import { VaultHomePane } from "@/modules/vault-home/VaultHomePane";
import { useCanvasStore } from "./canvasStore";
import { ChecklistPanel } from "./ChecklistPanel";
import { CodeGraphPanel } from "./CodeGraphPanel";
import { FileBrowserPanel } from "./FileBrowserPanel";
import { GalleryPanel } from "./GalleryPanel";
import { HeaderPanel } from "./HeaderPanel";
import { InputPanel } from "./InputPanel";
import { PipelinePanel } from "./PipelinePanel";
import { SubCanvasContent } from "./SubCanvasContent";
import { webLayerManager } from "./webLayer/WebLayerManager";
import { useAgentsStore } from "@/modules/ai/store/agentsStore";
import type { Agent } from "@/modules/ai/lib/agents";
import type { CanvasPanelNode } from "./types";

let nextCanvasLeafId = 1_000_000;
const leafIdMap = new Map<string, number>();
function getLeafId(panelId: string): number {
  let id = leafIdMap.get(panelId);
  if (id === undefined) {
    id = nextCanvasLeafId++;
    leafIdMap.set(panelId, id);
  }
  return id;
}

function debounce<T extends unknown[]>(fn: (...args: T) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: T) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function CanvasPanelContent({ panel }: { panel: CanvasPanelNode }) {
  const removePanel = useCanvasStore((s) => s.removePanel);
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const addPanel = useCanvasStore((s) => s.addPanel);

  const handleAgentSave = (agent: Agent) => {
    // Switch the active agent to the newly created one.
    useAgentsStore.getState().setActiveId(agent.id);
    // Open a Chat panel near the agent panel's position.
    const chatId = addPanel("chat", { x: panel.x + panel.width + 20, y: panel.y });
    updatePanel(chatId, { title: agent.name });
    // Remove the agent editor panel.
    removePanel(panel.id);
  };

  switch (panel.type) {
    case "canvas":
      return <SubCanvasContent panel={panel} />;
    case "input":
      return <InputPanel panel={panel} />;
    case "chat":
      return (
        <ChatPanel
          panelId={panel.id}
          savedSessionId={panel.meta?.sessionId as string | undefined}
          onSessionCreated={(sid) =>
            updatePanel(panel.id, { meta: { ...panel.meta, sessionId: sid } })
          }
        />
      );
    case "terminal":
      return <CanvasTerminal panel={panel} />;
    case "editor":
      return <CanvasEditor panel={panel} />;
    case "preview":
      return <CanvasPreview panel={panel} />;
    case "vault-home":
      return <CanvasVaultHome panel={panel} />;
    case "web":
      return <CanvasWeb panel={panel} />;
    case "agent":
      return (
        <AgentEditorPanel
          panelId={panel.id}
          onSave={handleAgentSave}
          onCancel={() => removePanel(panel.id)}
        />
      );
    case "instance":
      return <CanvasInstance panel={panel} />;
    case "codegraph":
      return <CodeGraphPanel panel={panel} />;
    case "pipeline":
      return <PipelinePanel panel={panel} />;
    case "header":
      return <HeaderPanel panel={panel} />;
    case "checklist":
      return <ChecklistPanel panel={panel} />;
    case "gallery":
      return <GalleryPanel panel={panel} />;
    case "filebrowser":
      return <FileBrowserPanel panel={panel} />;
  }
}

function CanvasTerminal({ panel }: { panel: CanvasPanelNode }) {
  const leafId = getLeafId(panel.id);
  const cwd = (panel.meta?.cwd as string | undefined) || undefined;
  const initCmd = (panel.meta?.initCmd as string | undefined) || undefined;
  const paneRef = useRef<TerminalPaneHandle>(null);
  const setOutputData = useCanvasStore((s) => s.setOutputData);

  useEffect(() => {
    if (!initCmd) return;
    const t = setTimeout(() => {
      paneRef.current?.write(initCmd + "\r");
    }, 1800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push last 80 lines to the wire every 3 seconds.
  useEffect(() => {
    const timer = setInterval(() => {
      const buf = paneRef.current?.getBuffer(80) ?? "";
      if (buf.trim()) {
        setOutputData(panel.id, { kind: "text", value: buf.slice(0, 4000) });
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [panel.id, setOutputData]);

  // Listen for trigger-wire pulses: when a chat node connected by a trigger
  // wire dispatches a message, ChatPanel emits `atlas:terminal-trigger` with
  // {panelId, text}. We match on our own panel.id and write text + CR to the
  // PTY as if the user had typed it.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ panelId: string; text: string }>).detail;
      if (!detail || detail.panelId !== panel.id) return;
      const cmd = (detail.text ?? "").trim();
      if (!cmd) return;
      paneRef.current?.write(cmd + "\r");
    };
    window.addEventListener("atlas:terminal-trigger", handler);
    return () => window.removeEventListener("atlas:terminal-trigger", handler);
  }, [panel.id]);

  return (
    <div className="h-full w-full bg-[#0a0a0a]">
      <TerminalPane ref={paneRef} leafId={leafId} visible={true} focused={false} initialCwd={cwd} />
    </div>
  );
}

function CanvasEditor({ panel }: { panel: CanvasPanelNode }) {
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const setOutputData = useCanvasStore((s) => s.setOutputData);
  const path = panel.meta?.path as string | undefined;
  const [input, setInput] = useState("");

  // Write file content to wire when path changes (initial load).
  useEffect(() => {
    if (!path) return;
    invoke<string>("fs_read_file", { path })
      .then((content) => {
        setOutputData(panel.id, { kind: "text", value: content.slice(0, 4000) });
      })
      .catch(() => undefined);
  }, [path, panel.id, setOutputData]);

  // Memoised debounced re-read so the ref stays stable across renders.
  const debouncedReread = useMemo(
    () =>
      debounce(() => {
        if (!path) return;
        invoke<string>("fs_read_file", { path })
          .then((content) => {
            setOutputData(panel.id, { kind: "text", value: content.slice(0, 4000) });
          })
          .catch(() => undefined);
      }, 500),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, panel.id],
  );

  if (!path) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <span className="text-[11px] text-[#555]">No file selected</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) {
              updatePanel(panel.id, { meta: { ...panel.meta, path: input.trim() } });
            }
          }}
          placeholder="Absolute path to file..."
          className="h-6 w-full max-w-xs rounded bg-[#1a1a1a] px-2 text-[10px] text-[#f5f5f5] outline-none focus:bg-[#222]"
        />
      </div>
    );
  }
  return <EditorPane path={path} onSaved={debouncedReread} />;
}

function CanvasPreview({ panel }: { panel: CanvasPanelNode }) {
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const path = panel.meta?.path as string | undefined;
  const [input, setInput] = useState("");
  if (!path) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <span className="text-[11px] text-[#555]">No file to preview</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) {
              updatePanel(panel.id, { meta: { ...panel.meta, path: input.trim() } });
            }
          }}
          placeholder="Absolute path to .html file..."
          className="h-6 w-full max-w-xs rounded bg-[#1a1a1a] px-2 text-[10px] text-[#f5f5f5] outline-none focus:bg-[#222]"
        />
      </div>
    );
  }
  return (
    <iframe
      src={localToAsset(path)}
      className="h-full w-full border-0 bg-white"
      sandbox="allow-scripts allow-same-origin"
      title="Preview"
    />
  );
}

function CanvasVaultHome({ panel }: { panel: CanvasPanelNode }) {
  const root = usePreferencesStore((s) => s.workspaceRoot);
  const addPanel = useCanvasStore((s) => s.addPanel);
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const setOutputData = useCanvasStore((s) => s.setOutputData);

  const handleOpen = (url: string) => {
    // 1. Spawn a web panel for the user.
    const id = addPanel("web");
    const cur = useCanvasStore.getState().panels.find((p) => p.id === id);
    updatePanel(id, { meta: { ...(cur?.meta ?? {}), url } });
    // 2. Mirror the just-opened page onto the vault-home panel's wire so
    //    chat nodes downstream see "user is currently reading vault://…".
    //    Full content extraction requires an iframe postMessage bridge in
    //    each vault page; until that ships, the URL alone is enough signal.
    setOutputData(panel.id, {
      kind: "text",
      value: `Currently reading vault page: ${url}`,
    });
  };

  return <VaultHomePane workspaceRoot={root} onOpenBrowserTab={handleOpen} />;
}

/**
 * CanvasInstance — dedicated panel for a packaged Atlas OS build.
 *
 * Config state  (meta.vaultRoot not set):
 *   Name + vault-root folder picker → "Bağlan" writes meta.vaultRoot.
 *
 * Connected state (meta.vaultRoot is set):
 *   Loads the vault's ui/index.html via asset:// in a sandboxed iframe.
 *   The iframe pulls .index/pages.js from relative paths, so it always
 *   renders the OTHER vault's content, fully independent of the Studio.
 *
 * No terminals, no separate OS windows, no z-index fights.
 */
function CanvasInstance({ panel }: { panel: CanvasPanelNode }) {
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const vaultRoot = ((panel.meta?.vaultRoot as string) || "").trim();
  const [inputRoot, setInputRoot] = useState(vaultRoot);
  const [inputName, setInputName] = useState("");

  const pickFolder = async () => {
    const picked = await invoke<string | null>("pick_folder");
    if (picked) setInputRoot(picked.replace(/\//g, "\\"));
  };

  const connect = () => {
    const root = inputRoot.trim();
    if (!root) return;
    const name = inputName.trim() || root.split("\\").pop() || "Atlas";
    updatePanel(panel.id, {
      title: name,
      meta: { ...panel.meta, vaultRoot: root },
    });
  };

  // ── Config UI ────────────────────────────────────────────────────────────
  if (!vaultRoot) {
    return (
      <div className="flex h-full flex-col gap-4 overflow-auto p-5">
        <div className="flex flex-col gap-0.5">
          <div className="text-[12px] font-medium text-[#f0f0f0]">Atlas Vault Bağlantısı</div>
          <div className="text-[10px] text-[#555]">
            Bir Atlas kurulumunun kök klasörünü seç — vault, .index ve ui klasörlerini içermeli.
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-[#555]">Panel adı</label>
          <input
            value={inputName}
            onChange={(e) => setInputName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") connect(); }}
            placeholder="ör. İş Vaultum"
            className="h-6 rounded bg-[#1a1a1a] px-2 text-[10px] text-[#f5f5f5] outline-none focus:bg-[#222]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-[#555]">Vault kök klasörü</label>
          <div className="flex gap-1">
            <input
              value={inputRoot}
              onChange={(e) => setInputRoot(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") connect(); }}
              placeholder="C:\Atlas OS"
              className="h-6 min-w-0 flex-1 rounded bg-[#1a1a1a] px-2 text-[10px] text-[#f5f5f5] outline-none focus:bg-[#222]"
            />
            <button
              type="button"
              onClick={() => void pickFolder()}
              title="Klasör seç"
              className="h-6 shrink-0 rounded bg-[#1a1a1a] px-2 text-[10px] text-[#666] transition-colors hover:bg-[#222] hover:text-[#f5f5f5]"
            >
              ⊕
            </button>
          </div>
        </div>

        <button
          type="button"
          disabled={!inputRoot.trim()}
          onClick={connect}
          className="mt-auto rounded bg-[#5b8def]/20 px-3 py-1.5 text-[11px] text-[#5b8def]
            transition-colors hover:bg-[#5b8def]/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Bağlan
        </button>
      </div>
    );
  }

  // ── Connected — vault web UI in iframe ───────────────────────────────────
  // Normalize to forward-slash so localToAsset gets a clean path.
  const uiPath = vaultRoot.replace(/\\/g, "/") + "/ui/index.html";
  const uiUrl = localToAsset(uiPath);

  return (
    <div className="flex h-full flex-col">
      {/* Thin info bar */}
      <div className="flex h-6 shrink-0 items-center gap-2 border-b border-[#1a1a1a] bg-[#0d0d0d] px-2">
        <span className="font-mono text-[9px] text-[#444]">◈</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[9px] text-[#555]" title={vaultRoot}>
          {vaultRoot}
        </span>
        <button
          type="button"
          title="Bağlantıyı kes"
          onClick={() => updatePanel(panel.id, { meta: { ...panel.meta, vaultRoot: "" } })}
          className="shrink-0 text-[10px] text-[#383838] transition-colors hover:text-[#888]"
        >
          ×
        </button>
      </div>

      {/* Vault UI — sandboxed iframe loads OTHER vault's pages.js via relative paths */}
      <iframe
        key={uiUrl}
        src={uiUrl}
        title={panel.title}
        className="min-h-0 flex-1 border-0"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}

function CanvasWeb({ panel }: { panel: CanvasPanelNode }) {
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const setOutputData = useCanvasStore((s) => s.setOutputData);
  // Read viewport so the measure-effect re-runs on pan/zoom (DOM is the truth,
  // but React doesn't otherwise know the placeholder rect changed).
  const viewport = useCanvasStore((s) => s.viewport);
  const url = (panel.meta?.url as string | undefined) || "";
  const [input, setInput] = useState(url);

  // Mirror the live URL out as a text wire so chat nodes downstream can see
  // "user is currently looking at https://…". The native WebView's
  // on_navigation handler emits `web://nav-changed` with {label, url}; we
  // filter on label === panel.id to ignore other web panels.
  useEffect(() => {
    const unlisten = listen<{ label: string; url: string }>(
      "web://nav-changed",
      (ev) => {
        if (ev.payload?.label !== panel.id) return;
        const liveUrl = ev.payload.url || "";
        if (!liveUrl || liveUrl === "about:blank") {
          setOutputData(panel.id, null);
          return;
        }
        updatePanel(panel.id, { meta: { ...panel.meta, url: liveUrl } });
        setOutputData(panel.id, {
          kind: "text",
          value: `Current URL: ${liveUrl}`,
        });
      },
    );
    return () => {
      void unlisten.then((fn) => fn());
    };
    // panel.meta is intentionally NOT a dep — we only want to (re)subscribe
    // when the panel itself swaps identity, not on every meta tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.id]);

  const placeholderRef = useRef<HTMLDivElement>(null);
  // Track whether we've called web_open yet — first measurement triggers create.
  const createdRef = useRef(false);

  const measure = () => {
    const el = placeholderRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };

  // Open / close the native webview tied to the panel lifecycle.
  useEffect(() => {
    const initial = measure();
    if (!initial) return;
    createdRef.current = true;
    void webLayerManager.create(panel.id, url, initial);
    return () => {
      createdRef.current = false;
      // WebLayerManager.destroy awaits any in-flight open internally.
      void webLayerManager.destroy(panel.id);
    };
    // Only on panel.id — create() is idempotent if called twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.id]);

  // DOM-measurement sync: re-measure on any change that could move the
  // placeholder — main viewport pan/zoom, panel drag/resize, sub-canvas
  // pan/zoom, window resize. We subscribe to the whole canvas store so
  // edits at any depth (including nested children[]) trigger a re-measure.
  //
  // Defer the measure through requestAnimationFrame so the DOM has committed
  // the layout React produced from the same store change — otherwise we read
  // a stale rect and push the webview to the previous frame's position.
  useEffect(() => {
    const el = placeholderRef.current;
    if (!el) return;

    let rafId: number | null = null;
    const pushSync = () => {
      if (rafId !== null) return; // coalesce bursts of store updates
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!createdRef.current) return;
        const rect = measure();
        if (!rect) return;
        void webLayerManager.sync(panel.id, rect);
      });
    };

    // Always wire observers — even during zoom freeze, the panel can be
    // dragged or resized and must still resync once the freeze lifts.
    const ro = new ResizeObserver(pushSync);
    ro.observe(el);
    const unsub = useCanvasStore.subscribe(pushSync);
    const onResize = () => pushSync();
    window.addEventListener("resize", onResize);

    // Schedule a settle-sync after the zoom-freeze window expires so the
    // final, post-zoom rect lands even if no further store changes occur.
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    if (webLayerManager.isFrozen) {
      settleTimer = setTimeout(() => {
        settleTimer = null;
        webLayerManager.thawAfterZoom();
        pushSync();
      }, 220);
    } else {
      pushSync();
    }

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (settleTimer) clearTimeout(settleTimer);
      ro.disconnect();
      unsub();
      window.removeEventListener("resize", onResize);
    };
  }, [panel.id, viewport]);

  // Push navigation when the meta URL changes externally (Vault Home click, etc).
  useEffect(() => {
    if (!url) return;
    void webLayerManager.navigate(panel.id, url);
  }, [panel.id, url]);

  const submit = () => {
    const v = input.trim();
    if (!v) return;
    const u = /^(https?:|asset:)/i.test(v) ? v : `https://${v}`;
    updatePanel(panel.id, { meta: { ...panel.meta, url: u } });
    setInput(u);
  };

  return (
    <div className="flex h-full flex-col bg-[#0a0a0a]">
      <div className="flex h-7 shrink-0 items-center gap-1 border-b border-[#2a2a2a] px-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="https://..."
          className="h-5 flex-1 rounded bg-[#1a1a1a] px-1.5 text-[10px] text-[#f5f5f5] outline-none focus:bg-[#222]"
        />
        <button
          type="button"
          onClick={submit}
          className="h-5 rounded bg-[#1a1a1a] px-2 text-[10px] text-[#888] hover:bg-[#222] hover:text-[#f5f5f5]"
        >
          Go
        </button>
      </div>
      {/* Placeholder body — its bounding rect IS the target rect for the
          native child webview, regardless of how deeply nested it is in
          canvas / sub-canvas / micro-canvas transforms. */}
      <div ref={placeholderRef} className="flex flex-1 items-center justify-center text-[9px] text-[#333]">
        {url ? "native webview" : "Enter a URL above"}
      </div>
    </div>
  );
}
