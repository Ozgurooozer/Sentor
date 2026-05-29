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
import { type ComponentType, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ChatPanel } from "@/modules/ai/components/ChatPanel";
import { AgentEditorPanel } from "./AgentEditorPanel";
import { localToAsset } from "@/modules/browser/assetUrl";
import { EditorPane } from "@/modules/editor/EditorPane";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { TerminalPane, type TerminalPaneHandle, disposeSession } from "@/modules/terminal";
import { VaultHomePane } from "@/modules/vault-home/VaultHomePane";
import { useCanvasStore } from "./canvasStore";
import { useAllIncomingWireData, PANEL_ICONS } from "./useWireData";
import { ChecklistPanel } from "./ChecklistPanel";
import { CodeGraphPanel } from "./CodeGraphPanel";
import { FileBrowserPanel } from "./FileBrowserPanel";
import { GalleryPanel } from "./GalleryPanel";
import { HeaderPanel } from "./HeaderPanel";
import { InputPanel } from "./InputPanel";
import { PipelinePanel } from "./PipelinePanel";
import { SubCanvasContent } from "./SubCanvasContent";
import { SketchPanel } from "./SketchPanel";
import { NotePanel } from "./NotePanel";
import { ToolPanel } from "./ToolPanel";
import { PipePanel } from "./PipePanel";
import { StickManPanel } from "./StickManPanel";
import { LogsPanel } from "./LogsPanel";
import { AudioPanel } from "./AudioPanel";
import { VariablePanel } from "./VariablePanel";
import { VariableInspectorPanel } from "./VariableInspectorPanel";
import { VoiceVariablePanel } from "./VoiceVariablePanel";
import { IfElsePanel } from "./IfElsePanel";
import { ForEachPanel } from "./ForEachPanel";
import { GatePanel } from "./GatePanel";
import { webLayerManager } from "./webLayer/WebLayerManager";
import { useAgentsStore } from "@/modules/ai/store/agentsStore";
import type { Agent } from "@/modules/ai/lib/agents";
import type { CanvasPanelNode, PanelType } from "./types";

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

// ── Per-type wrappers for panels with non-standard prop shapes ───────────────

function ChatPanelWrapper({ panel }: { panel: CanvasPanelNode }) {
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  return (
    <ChatPanel
      panelId={panel.id}
      savedSessionId={panel.meta?.sessionId as string | undefined}
      onSessionCreated={(sid) =>
        updatePanel(panel.id, { meta: { ...panel.meta, sessionId: sid } })
      }
    />
  );
}

function AgentPanelWrapper({ panel }: { panel: CanvasPanelNode }) {
  const removePanel = useCanvasStore((s) => s.removePanel);
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const addPanel    = useCanvasStore((s) => s.addPanel);
  const handleSave  = (agent: Agent) => {
    useAgentsStore.getState().setActiveId(agent.id);
    const chatId = addPanel("chat", { x: panel.x + panel.width + 20, y: panel.y });
    updatePanel(chatId, { title: agent.name });
    removePanel(panel.id);
  };
  return (
    <AgentEditorPanel
      panelId={panel.id}
      onSave={handleSave}
      onCancel={() => removePanel(panel.id)}
    />
  );
}

function NotePanelWrapper({ panel }: { panel: CanvasPanelNode }) {
  return (
    <NotePanel
      panelId={panel.id}
      initialText={(panel.meta?.text as string | undefined) ?? ""}
    />
  );
}

function ToolPanelWrapper({ panel }: { panel: CanvasPanelNode }) {
  return (
    <ToolPanel
      toolName={(panel.meta?.toolName as string | undefined) ?? panel.title}
      toolIcon={(panel.meta?.toolIcon as string | undefined) ?? "⚙"}
      canvasId={panel.meta?.canvasId as string | undefined}
    />
  );
}

// Trivial wrappers for components that don't accept a panel prop
function SketchPanelWrapper(_: { panel: CanvasPanelNode })  { return <SketchPanel />; }
function LogsPanelWrapper(_: { panel: CanvasPanelNode })    { return <LogsPanel />; }
function Canvas3dWrapper(_: { panel: CanvasPanelNode })     { return <Canvas3dContent />; }

// ── Registry ────────────────────────────────────────────────────────────────

type PanelRenderer = ComponentType<{ panel: CanvasPanelNode }>;

const PANEL_REGISTRY: Partial<Record<PanelType, PanelRenderer>> = {
  canvas:        SubCanvasContent,
  input:         InputPanel,
  chat:          ChatPanelWrapper,
  terminal:      V3TerminalPanel,
  editor:        CanvasEditor,
  preview:       CanvasPreview,
  "vault-home":  CanvasVaultHome,
  web:           CanvasWeb,
  agent:         AgentPanelWrapper,
  instance:      CanvasInstance,
  codegraph:     CodeGraphPanel,
  pipeline:      PipelinePanel,
  header:        HeaderPanel,
  checklist:     ChecklistPanel,
  gallery:       GalleryPanel,
  filebrowser:   FileBrowserPanel,
  sketch:        SketchPanelWrapper,
  note:          NotePanelWrapper,
  tool:          ToolPanelWrapper,
  pipe:          PipePanel,
  stickman:      StickManPanel,
  logs:          LogsPanelWrapper,
  audio:         AudioPanel,
  "canvas-3d":   Canvas3dWrapper,
  "variable":            ({ panel }) => <VariablePanel panelId={panel.id} />,
  "variable-inspector":  () => <VariableInspectorPanel />,
  "voice-variable":      ({ panel }) => <VoiceVariablePanel panel={panel} />,
  "if-else":     ({ panel }) => <IfElsePanel panelId={panel.id} />,
  "for-each":    ({ panel }) => <ForEachPanel panelId={panel.id} />,
  "gate":        ({ panel }) => <GatePanel panelId={panel.id} />,
};

// ── Entry point ──────────────────────────────────────────────────────────────

export function CanvasPanelContent({ panel }: { panel: CanvasPanelNode }) {
  const Renderer = PANEL_REGISTRY[panel.type];
  if (!Renderer) {
    console.error(`[CANVAS:PANEL] Unknown panel type: "${panel.type}" (id=${panel.id})`);
    return null;
  }
  return <Renderer panel={panel} />;
}

function Canvas3dContent() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    let rafId = 0;
    let cleanup: (() => void) | null = null;

    // Lazy-load Three.js to avoid touching the import graph at module init time.
    Promise.all([
      import("three"),
      import("three/examples/jsm/postprocessing/EffectComposer.js"),
      import("three/examples/jsm/postprocessing/RenderPass.js"),
      import("three/examples/jsm/postprocessing/UnrealBloomPass.js"),
    ]).then(([THREE, { EffectComposer }, { RenderPass }, { UnrealBloomPass }]) => {
      if (!mountRef.current) return;

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: false, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(el.clientWidth || 400, el.clientHeight || 300);
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.style.pointerEvents = "none";
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(55, (el.clientWidth || 400) / (el.clientHeight || 300), 0.1, 300);
      camera.position.set(0, 12, 55);
      camera.lookAt(0, -4, 0);

      // Grid
      const gridGeo = new THREE.WireframeGeometry(new THREE.PlaneGeometry(600, 600, 30, 30));
      const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0x5b8def, opacity: 0.038, transparent: true, depthWrite: false }));
      grid.rotation.x = -Math.PI * 0.52;
      grid.position.set(0, -8, -5);
      scene.add(grid);

      // Grid dots
      const dv = new Float32Array(31 * 31 * 3);
      let di = 0;
      for (let ix = 0; ix <= 30; ix++) for (let iz = 0; iz <= 30; iz++) { dv[di++] = (ix - 15) * 20; dv[di++] = 0; dv[di++] = (iz - 15) * 20; }
      const dotGeo = new THREE.BufferGeometry();
      dotGeo.setAttribute("position", new THREE.BufferAttribute(dv, 3));
      const gridDots = new THREE.Points(dotGeo, new THREE.PointsMaterial({ color: 0x5b8def, size: 0.7, opacity: 0.07, transparent: true, depthWrite: false }));
      gridDots.rotation.x = -Math.PI * 0.52;
      gridDots.position.set(0, -8, -5);
      scene.add(gridDots);

      // Particles
      const COUNT = 40;
      const pos = new Float32Array(COUNT * 3), vel = new Float32Array(COUNT * 3), col = new Float32Array(COUNT * 3);
      for (let i = 0; i < COUNT; i++) {
        const i3 = i * 3;
        pos[i3] = (Math.random() - 0.5) * 120; pos[i3+1] = (Math.random() - 0.5) * 90; pos[i3+2] = (Math.random() - 0.5) * 60;
        vel[i3] = (Math.random() - 0.5) * 0.0044; vel[i3+1] = (Math.random() - 0.5) * 0.0044; vel[i3+2] = (Math.random() - 0.5) * 0.002;
        const t = Math.random(); col[i3] = 0.13 + t * 0.18; col[i3+1] = 0.20 + t * 0.26; col[i3+2] = 0.56 + t * 0.34;
      }
      const partGeo = new THREE.BufferGeometry();
      partGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      partGeo.setAttribute("color",    new THREE.BufferAttribute(col, 3));
      scene.add(new THREE.Points(partGeo, new THREE.PointsMaterial({ size: 0.55, vertexColors: true, opacity: 0.22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));

      // Bloom
      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(el.clientWidth || 400, el.clientHeight || 300), 0.20, 0.3, 0.85));

      const ro = new ResizeObserver(() => {
        const w = el.clientWidth || 1, h = el.clientHeight || 1;
        camera.aspect = w / h; camera.updateProjectionMatrix();
        renderer.setSize(w, h); composer.setSize(w, h);
      });
      ro.observe(el);

      const animate = () => {
        rafId = requestAnimationFrame(animate);
        grid.rotation.y += 0.00015; gridDots.rotation.y += 0.00015;
        const pa = partGeo.attributes.position.array as Float32Array;
        for (let i = 0; i < COUNT; i++) {
          const i3 = i * 3;
          pa[i3] += vel[i3]; pa[i3+1] += vel[i3+1]; pa[i3+2] += vel[i3+2];
          if (Math.abs(pa[i3]) > 60) vel[i3] *= -1;
          if (Math.abs(pa[i3+1]) > 45) vel[i3+1] *= -1;
          if (Math.abs(pa[i3+2]) > 30) vel[i3+2] *= -1;
        }
        partGeo.attributes.position.needsUpdate = true;
        composer.render();
      };
      animate();

      cleanup = () => {
        cancelAnimationFrame(rafId); ro.disconnect();
        renderer.dispose(); partGeo.dispose(); gridGeo.dispose(); dotGeo.dispose();
        if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
      };
    }).catch(() => undefined);

    return () => { cleanup?.(); };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: "#050507", borderRadius: "0 0 12px 12px" }}>
      <div ref={mountRef} className="absolute inset-0" />
    </div>
  );
}

// ── V3 Terminal ───────────────────────────────────────────────────────────────
// Glass toolbar + JS REPL mode + subtle Three.js particle overlay.

type JsEntry = { kind: "input" | "result" | "error"; text: string };

function fmtResult(val: unknown): string {
  if (val === undefined) return "undefined";
  if (val === null) return "null";
  if (typeof val === "string") {
    try { return JSON.stringify(JSON.parse(val), null, 2); } catch { return val; }
  }
  if (typeof val === "object") {
    try { return JSON.stringify(val, null, 2); } catch { return String(val); }
  }
  return String(val);
}


function V3TerminalPanel({ panel }: { panel: CanvasPanelNode }) {
  const leafId = getLeafId(panel.id);

  // Clean up PTY session and leafId mapping when panel is removed
  useEffect(() => {
    return () => {
      disposeSession(leafId);
      leafIdMap.delete(panel.id);
    };
  }, [leafId, panel.id]);

  const initCmd = (panel.meta?.initCmd as string | undefined) || undefined;
  const paneRef = useRef<TerminalPaneHandle>(null);
  const setOutputData = useCanvasStore((s) => s.setOutputData);
  const workspaceRoot = usePreferencesStore((s) => s.workspaceRoot) ?? "C:\\Atlas OS";

  const [mode, setMode]         = useState<"sh" | "js">("sh");
  const [jsInput, setJsInput]   = useState("");
  const [jsLog, setJsLog]       = useState<JsEntry[]>([]);
  const [cmdHist, setCmdHist]   = useState<string[]>([]);
  const [histIdx, setHistIdx]   = useState(-1);
  const [cwd, setCwd]           = useState("");
  const [shCmd, setShCmd]       = useState("");
  const [shHist, setShHist]     = useState<string[]>([]);
  const [shHistIdx, setShHistIdx] = useState(-1);
  const [copied, setCopied]     = useState(false);
  const jsEndRef   = useRef<HTMLDivElement>(null);
  const shInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll JS log
  useEffect(() => { jsEndRef.current?.scrollIntoView({ behavior: "instant" }); }, [jsLog.length]);

  // Restore terminal focus when switching back to shell mode
  useEffect(() => {
    if (mode === "sh") requestAnimationFrame(() => paneRef.current?.focus());
  }, [mode]);

  // initCmd
  useEffect(() => {
    if (!initCmd) return;
    const t = setTimeout(() => { paneRef.current?.write(initCmd + "\r"); }, 1800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wire push
  useEffect(() => {
    const timer = setInterval(() => {
      const buf = paneRef.current?.getBuffer(80) ?? "";
      if (buf.trim()) setOutputData(panel.id, { kind: "text", value: buf.slice(0, 4000) });
    }, 3000);
    return () => clearInterval(timer);
  }, [panel.id, setOutputData]);

  // Trigger wire — subscribe to store-based signal (no CustomEvent)
  const termTrigger = useCanvasStore(
    (s) => s.panels.find((p) => p.id === panel.id)?.meta?._termTrigger as
      | { cmd: string; ts: number }
      | undefined,
  );
  useEffect(() => {
    if (!termTrigger) return;
    const cmd = (termTrigger.cmd ?? "").trim();
    if (!cmd) return;
    if (!paneRef.current) {
      console.error(`[TERMINAL:PTY] panel ${panel.id} — trigger received but paneRef is null`);
      return;
    }
    paneRef.current.write(cmd + "\r");
  }, [termTrigger, panel.id]);

  // ── Wire inputs (modular: cmd port only drives the run) ─────────────────────
  const wireBlocks = useAllIncomingWireData(panel.id);
  // "cmd" port wire → the text that Run will execute
  const cmdBlocks  = wireBlocks.filter((b) => b.toPort === "cmd" || (!b.toPort && b.data?.kind === "text"));
  const wiredText  = cmdBlocks.map((b) => String(b.data!.value)).join("\n");
  const hasWireInput = wiredText.trim().length > 0;

  const runWired = () => {
    const cmd = (shCmd.trim() || wiredText.trim());
    if (!cmd) return;
    paneRef.current?.write(cmd + "\r");
    if (shCmd.trim()) {
      setShHist((h) => [shCmd.trim(), ...h.slice(0, 49)]);
      setShHistIdx(-1);
      setShCmd("");
    }
    requestAnimationFrame(() => paneRef.current?.focus());
  };

  useEffect(() => {
    const handler = () => { if (mode === "sh" && (hasWireInput || shCmd.trim())) runWired(); };
    window.addEventListener("canvas:run", handler);
    return () => window.removeEventListener("canvas:run", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, hasWireInput, wiredText, shCmd]);

  const sendShCmd = () => {
    const cmd = shCmd.trim();
    if (!cmd) return;
    paneRef.current?.write(cmd + "\r");
    setShHist((h) => [cmd, ...h.slice(0, 49)]);
    setShHistIdx(-1);
    setShCmd("");
    // Hand focus back to xterm after sending
    requestAnimationFrame(() => paneRef.current?.focus());
  };

  const onShKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { sendShCmd(); return; }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const ni = Math.min(shHistIdx + 1, shHist.length - 1);
      setShHistIdx(ni); if (shHist[ni]) setShCmd(shHist[ni]);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const ni = Math.max(shHistIdx - 1, -1);
      setShHistIdx(ni); setShCmd(ni === -1 ? "" : shHist[ni] ?? "");
    }
    // Escape → clear and focus xterm
    if (e.key === "Escape") { setShCmd(""); requestAnimationFrame(() => paneRef.current?.focus()); }
  };

  const copyOutput = () => {
    const buf = paneRef.current?.getBuffer(200) ?? "";
    if (!buf.trim()) return;
    navigator.clipboard.writeText(buf).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }).catch(() => undefined);
  };

  const runJs = () => {
    const src = jsInput.trim();
    if (!src) return;
    setJsLog((p) => [...p.slice(-99), { kind: "input", text: src }]);
    setCmdHist((h) => [src, ...h.slice(0, 49)]);
    setHistIdx(-1);
    try {
       
      const val = (0, eval)(src);
      setJsLog((p) => [...p, { kind: "result", text: fmtResult(val) }]);
    } catch (err) {
      setJsLog((p) => [...p, { kind: "error", text: String(err) }]);
    }
    setJsInput("");
  };

  const onJsKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { runJs(); return; }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const ni = Math.min(histIdx + 1, cmdHist.length - 1);
      setHistIdx(ni); if (cmdHist[ni]) setJsInput(cmdHist[ni]);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const ni = Math.max(histIdx - 1, -1);
      setHistIdx(ni); setJsInput(ni === -1 ? "" : cmdHist[ni] ?? "");
    }
  };

  const shortCwd = cwd ? cwd.replace(/\\/g, "/").split("/").slice(-2).join("/") : "";

  const TB: React.CSSProperties = {
    background: "rgba(5,5,7,0.85)",
    backdropFilter: "blur(12px)",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden" style={{ background: "#06070a" }}>

      {/* ── Toolbar ── */}
      <div className="flex shrink-0 items-center gap-1.5 px-2 py-1" style={TB}>
        {/* Mode toggle */}
        <div className="flex items-center gap-0.5 rounded-[6px] p-0.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
          {(["sh", "js"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className="rounded-[4px] px-2 py-[3px] font-mono text-[10px] font-medium uppercase tracking-widest transition-all duration-150"
              style={{
                background: mode === m ? "rgba(91,141,239,0.18)" : "transparent",
                color: mode === m ? "#5b8def" : "rgba(255,255,255,0.25)",
                border: mode === m ? "1px solid rgba(91,141,239,0.28)" : "1px solid transparent",
              }}
            >
              {m === "sh" ? ">_" : "JS"}
            </button>
          ))}
        </div>

        {/* Run button — green when wired, dim otherwise */}
        <button
          type="button"
          onClick={runWired}
          title={hasWireInput ? "Run wired input (canvas:run)" : mode === "sh" ? "No wire input — type a command below" : "Run (JS mode)"}
          className="flex items-center gap-1 rounded-[5px] px-2 py-[3px] font-mono text-[10px] font-medium transition-all duration-150"
          style={{
            color:      hasWireInput ? "#4db89a" : "rgba(255,255,255,0.18)",
            background: hasWireInput ? "rgba(77,184,154,0.10)" : "transparent",
            border:     `1px solid ${hasWireInput ? "rgba(77,184,154,0.32)" : "rgba(255,255,255,0.06)"}`,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = hasWireInput ? "rgba(77,184,154,0.18)" : "rgba(255,255,255,0.05)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = hasWireInput ? "rgba(77,184,154,0.10)" : "transparent"; }}
        >
          ▶
        </button>

        {/* CWD */}
        {shortCwd && (
          <span className="font-mono text-[9px] truncate max-w-[120px]" style={{ color: "rgba(255,255,255,0.2)" }}>
            {shortCwd}
          </span>
        )}

        <div className="flex-1" />

        {/* SH mode: copy output */}
        {mode === "sh" && (
          <button
            type="button"
            onClick={copyOutput}
            title="Copy terminal output"
            className="font-mono text-[9px] px-1.5 py-0.5 rounded transition-colors duration-150"
            style={{ color: copied ? "#4db89a" : "rgba(255,255,255,0.22)" }}
            onMouseEnter={(e) => { if (!copied) (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.55)"; }}
            onMouseLeave={(e) => { if (!copied) (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.22)"; }}
          >
            {copied ? "✓" : "⎘"}
          </button>
        )}

        {/* Clear */}
        <button
          type="button"
          onClick={() => mode === "js" ? setJsLog([]) : paneRef.current?.write("\x0c")}
          title={mode === "js" ? "Clear JS log" : "Clear terminal (Ctrl+L)"}
          className="font-mono text-[9px] px-1.5 py-0.5 rounded transition-colors duration-150"
          style={{ color: "rgba(255,255,255,0.22)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#ef5b5b"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.22)"; }}
        >
          ✕
        </button>
      </div>

      {/* ── Main area ── */}
      <div className="relative flex-1 min-h-0">

        {/* SH mode — xterm + command bar */}
        <div className="absolute inset-0 flex flex-col" style={{ display: mode === "sh" ? "flex" : "none" }}>
          <div className="flex-1 min-h-0">
            <TerminalPane
              ref={paneRef}
              leafId={leafId}
              visible={true}
              focused={mode === "sh"}
              initialCwd={(panel.meta?.cwd as string | undefined) || workspaceRoot}
              onCwd={(_, c) => setCwd(c)}
            />
          </div>
          {/* Command input bar */}
          <div
            className="shrink-0 flex items-center gap-2 px-2 py-1.5"
            style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(5,5,7,0.75)" }}
          >
            <span className="shrink-0 font-mono text-[11px]" style={{ color: hasWireInput ? "rgba(77,184,154,0.7)" : "rgba(91,141,239,0.7)" }}>$</span>
            <input
              ref={shInputRef}
              value={shCmd}
              onChange={(e) => setShCmd(e.target.value)}
              onKeyDown={onShKeyDown}
              placeholder={hasWireInput ? "override wired input…" : "command…"}
              className="flex-1 bg-transparent font-mono text-[11px] outline-none"
              style={{ color: "#f5f5f5", caretColor: hasWireInput ? "#4db89a" : "#5b8def" }}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={hasWireInput ? runWired : sendShCmd}
              className="shrink-0 font-mono text-[10px] transition-opacity duration-150"
              style={{ color: hasWireInput ? "#4db89a" : "#5b8def", opacity: (hasWireInput || shCmd.trim()) ? 0.7 : 0.25 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = (hasWireInput || shCmd.trim()) ? "0.7" : "0.25"; }}
            >
              ⏎
            </button>
          </div>

          {/* Wired inputs list — only when connections exist */}
          {wireBlocks.length > 0 && (
            <div className="shrink-0" style={{ borderTop: "1px solid rgba(77,184,154,0.12)", background: "rgba(4,8,6,0.85)" }}>
              <div className="px-2 pt-1 pb-1.5 flex flex-col gap-[3px]">
                {wireBlocks.map((b) => {
                  const icon    = PANEL_ICONS[b.panelType] ?? "○";
                  const isCmd   = b.toPort === "cmd" || (!b.toPort && b.data?.kind === "text");
                  const portTag = b.toPort ?? (isCmd ? "cmd" : "—");
                  const preview = typeof b.data?.value === "string"
                    ? b.data.value.replace(/\s+/g, " ").trim().slice(0, 52)
                    : JSON.stringify(b.data?.value ?? "").slice(0, 52);
                  return (
                    <div key={b.panelId} className="flex items-center gap-1.5 min-w-0">
                      {/* port badge */}
                      <span
                        className="shrink-0 font-mono text-[8px] rounded px-1 py-[1px]"
                        style={{
                          color:      isCmd ? "#4db89a" : "rgba(155,114,239,0.8)",
                          background: isCmd ? "rgba(77,184,154,0.10)" : "rgba(155,114,239,0.08)",
                          border:     `1px solid ${isCmd ? "rgba(77,184,154,0.25)" : "rgba(155,114,239,0.18)"}`,
                        }}
                      >
                        {portTag}
                      </span>
                      <span className="shrink-0 font-mono text-[9px]" style={{ color: "rgba(255,255,255,0.22)" }}>{icon}</span>
                      <span className="shrink-0 font-mono text-[9px]" style={{ color: "rgba(255,255,255,0.40)" }}>{b.panelTitle}</span>
                      <span className="font-mono text-[9px] truncate" style={{ color: "rgba(255,255,255,0.18)" }}>{preview}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* JS mode — REPL log */}
        {mode === "js" && (
          <div className="absolute inset-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto px-2 py-1.5" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.07) transparent" }}>
              {jsLog.length === 0 && (
                <div className="flex h-full items-center justify-center">
                  <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.12)" }}>
                    JS · JSON · eval
                  </span>
                </div>
              )}
              {jsLog.map((entry, i) => (
                <div key={i} className="mb-0.5 flex gap-1.5 items-start">
                  <span className="shrink-0 font-mono text-[10px] pt-[1px]" style={{
                    color: entry.kind === "input" ? "#9b72ef" : entry.kind === "error" ? "#ef5b5b" : "#4db89a",
                  }}>
                    {entry.kind === "input" ? "▶" : entry.kind === "error" ? "✕" : "←"}
                  </span>
                  <pre className="flex-1 font-mono text-[10px] leading-[1.55] break-all whitespace-pre-wrap" style={{
                    color: entry.kind === "input" ? "rgba(255,255,255,0.7)" : entry.kind === "error" ? "#ef5b5b" : "rgba(255,255,255,0.55)",
                  }}>
                    {entry.text}
                  </pre>
                </div>
              ))}
              <div ref={jsEndRef} />
            </div>

            {/* JS input bar */}
            <div className="shrink-0 flex items-center gap-2 px-2 py-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(5,5,7,0.6)" }}>
              <span className="font-mono text-[11px]" style={{ color: "#9b72ef" }}>▶</span>
              <input
                value={jsInput}
                onChange={(e) => setJsInput(e.target.value)}
                onKeyDown={onJsKeyDown}
                placeholder="expression…"
                className="flex-1 bg-transparent font-mono text-[11px] outline-none"
                style={{ color: "#f5f5f5", caretColor: "#9b72ef" }}
                spellCheck={false}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={runJs}
                className="font-mono text-[10px] opacity-30 hover:opacity-70 transition-opacity duration-150"
                style={{ color: "#9b72ef" }}
              >
                ⏎
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CanvasEditor({ panel }: { panel: CanvasPanelNode }) {
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const setOutputData = useCanvasStore((s) => s.setOutputData);
  const path = panel.meta?.path as string | undefined;
  const [input, setInput] = useState("");

  type ReadResult = { kind: string; content?: string; size: number };
  const readToWire = (p: string) =>
    invoke<ReadResult>("fs_read_file", { path: p })
      .then((r) => {
        if (r.kind === "text" && r.content) {
          setOutputData(panel.id, { kind: "text", value: r.content.slice(0, 4000) });
        }
      })
      .catch(() => undefined);

  // Write file content to wire when path changes (initial load).
  useEffect(() => {
    if (!path) return;
    void readToWire(path);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, panel.id, setOutputData]);

  // Memoised debounced re-read so the ref stays stable across renders.
  const debouncedReread = useMemo(
    () => debounce(() => { if (path) void readToWire(path); }, 500),
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

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "avif"]);

function isImagePath(p: string): boolean {
  return IMAGE_EXTS.has(p.split(".").pop()?.toLowerCase() ?? "");
}

function CanvasPreview({ panel }: { panel: CanvasPanelNode }) {
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const setOutputData = useCanvasStore((s) => s.setOutputData);
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
          placeholder="Absolute path to file (html, png, jpg…)"
          className="h-6 w-full max-w-xs rounded bg-[#1a1a1a] px-2 text-[10px] text-[#f5f5f5] outline-none focus:bg-[#222]"
        />
      </div>
    );
  }
  // Image preview
  if (isImagePath(path)) {
    return (
      <div
        className="flex h-full w-full items-center justify-center overflow-hidden"
        style={{ background: "#080808" }}
      >
        <img
          src={localToAsset(path.replace(/\\/g, "/"))}
          alt={path.split(/[\\/]/).pop() ?? "image"}
          draggable={false}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
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
      onLoad={(e) => {
        try {
          const text = e.currentTarget.contentDocument?.body?.innerText?.slice(0, 8000) ?? "";
          if (text.trim()) setOutputData(panel.id, { kind: "text", value: text.trim() });
        } catch { /* cross-origin */ }
      }}
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
  const setOutputData = useCanvasStore((s) => s.setOutputData);
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
        onLoad={(e) => {
          try {
            const text = e.currentTarget.contentDocument?.body?.innerText?.slice(0, 8000) ?? "";
            if (text.trim()) setOutputData(panel.id, { kind: "text", value: text.trim() });
          } catch { /* cross-origin */ }
        }}
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
