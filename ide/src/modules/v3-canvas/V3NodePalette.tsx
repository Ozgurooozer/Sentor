import { useEffect, useRef, useState } from "react";
import type { PanelType } from "@/modules/canvas/types";
import { useCanvasStore } from "@/modules/canvas/canvasStore";

type NodeDef = { type: PanelType; label: string; desc: string; accent: string; icon: React.ReactNode };

const IC = (path: string) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d={path}/>
  </svg>
);

const NODES_2D: NodeDef[] = [
  { type: "chat",        label: "Chat",        desc: "LLM chat",              accent: "#5b8def", icon: IC("M13 2H3a1 1 0 00-1 1v7a1 1 0 001 1h1v3l4-3h5a1 1 0 001-1V3a1 1 0 00-1-1z") },
  { type: "agent",       label: "Agent",       desc: "Autonomous AI",         accent: "#5b8def", icon: IC("M8 5a3 3 0 100 6 3 3 0 000-6zM8 2a6 6 0 100 12A6 6 0 008 2z") },
  { type: "pipe",        label: "Auto-Pipe",   desc: "AI transform",          accent: "#5b8def", icon: IC("M2 8h4m4 0h4M10 5l3 3-3 3") },
  { type: "terminal",    label: "Terminal",    desc: "PTY shell · JS eval · JSON",  accent: "#4db89a", icon: IC("M3 4h10v8H3zM5 7l2 2-2 2M9 11h2") },
  { type: "editor",      label: "Editor",      desc: "Code editor",           accent: "#9b72ef", icon: IC("M4 6h8M4 9h5M4 12h3") },
  { type: "web",         label: "Web",         desc: "Native WebView",        accent: "#e07b54", icon: IC("M8 2a6 6 0 100 12A6 6 0 008 2zM2 8h12") },
  { type: "filebrowser", label: "Files",       desc: "File browser",          accent: "#d4a843", icon: IC("M3 4a1 1 0 011-1h3l2 2h4a1 1 0 011 1v7a1 1 0 01-1 1H4a1 1 0 01-1-1V4z") },
  { type: "input",       label: "Input",       desc: "Text / file input",     accent: "#d4a843", icon: IC("M8 3v10M3 8h10") },
  { type: "sketch",      label: "Sketch",      desc: "Freehand drawing",      accent: "#e07b54", icon: IC("M12 3l1 1-8 8H4v-1l8-8z") },
  { type: "note",        label: "Note",        desc: "Sticky note",           accent: "#e8c574", icon: IC("M3 3h10v10H9l-6-6V3zM9 13V9h4") },
  { type: "checklist",   label: "Checklist",   desc: "Task list",             accent: "#7e8a98", icon: IC("M4 6l2 2 4-4M4 10l2 2 4-4") },
  { type: "gallery",     label: "Gallery",     desc: "Image grid",            accent: "#c79ad6", icon: IC("M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z") },
  { type: "canvas",      label: "Sub Canvas",  desc: "Nested 2D canvas",      accent: "#444444", icon: IC("M2 2h12v12H2zM5 5h6v6H5z") },
  { type: "pipeline",    label: "Pipeline",    desc: "Transform chain",       accent: "#e07b54", icon: IC("M2 8h3l2-3 2 6 2-3h3") },
  { type: "codegraph",   label: "Code Graph",  desc: "Dependency graph",      accent: "#9b72ef", icon: IC("M8 2l4 4-4 4-4-4 4-4z") },
  { type: "logs",        label: "Logs",        desc: "Canlı log akışı — tüm console output / hata izleme", accent: "#4db89a", icon: IC("M3 4h10M3 7h8M3 10h6M3 13h4") },
  { type: "variable",            label: "Variable",          desc: "Named variable — store & share values across canvas", accent: "#d4a843", icon: IC("M4 4h3l1 4-1 4H4M12 4h-3l-1 4 1 4h3") },
  { type: "variable-inspector", label: "Var Inspector",     desc: "Browse, inspect and delete all canvas variables",     accent: "#d4a843", icon: IC("M3 4h10M3 7h8M3 10h5M3 13h3M13 10l2 2-2 2") },
  { type: "voice-variable",     label: "Voice Variable",   desc: "Record speech → store as variable + wire output",     accent: "#ef4444", icon: IC("M8 2a3 3 0 013 3v4a3 3 0 01-6 0V5a3 3 0 013-3zM3 9a5 5 0 0010 0M8 14v2") },
  { type: "if-else",    label: "If / Else",   desc: "Conditional routing — outputs true or false branch",  accent: "#d4a843", icon: IC("M8 2v5M5 7H3l-1 4 1 4h2M11 7h2l1 4-1 4h-2M8 11v3") },
  { type: "for-each",   label: "For Each",    desc: "Iterate over a list of items",                        accent: "#9b72ef", icon: IC("M3 8h10M10 5l3 3-3 3M6 3v10") },
  { type: "gate",       label: "Gate",        desc: "Circuit gate — block or pass signal based on condition", accent: "#e07b54", icon: IC("M2 8h3M11 8h3M5 5h6v6H5zM8 5v6") },
];

const NODES_3D: NodeDef[] = [
  {
    type: "canvas-3d",
    label: "3D Canvas",
    desc: "Three.js sub-canvas — perspektif grid, parçacıklar, 3D nesneler",
    accent: "#5b8def",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2l5 3v6l-5 3-5-3V5l5-3z"/>
        <path d="M8 2v12M3 5l5 3 5-3" strokeOpacity="0.5"/>
      </svg>
    ),
  },
];

interface Props {
  onClose: () => void;
  /** Override the default addPanel action (e.g. for secondary canvas). */
  onAddPanel?: (type: PanelType) => void;
}

export function V3NodePalette({ onClose, onAddPanel }: Props) {
  const [tab, setTab] = useState<"2d" | "3d">("2d");
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const addPanel = useCanvasStore((s) => s.addPanel);

  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const list = tab === "2d" ? NODES_2D : NODES_3D;
  const q = query.trim().toLowerCase();
  const filtered = q ? list.filter((n) => n.label.toLowerCase().includes(q) || n.desc.toLowerCase().includes(q)) : list;

  const add = (type: PanelType) => { (onAddPanel ?? addPanel)(type); onClose(); };

  const glass: React.CSSProperties = {
    background: "rgba(8, 8, 14, 0.90)",
    backdropFilter: "blur(28px) saturate(160%)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 14,
  };

  return (
    <div className="fixed inset-0 z-[65]" onPointerDown={onClose}>
      <div
        className="absolute flex flex-col overflow-hidden"
        style={{ right: 12, top: 48, width: 300, maxHeight: "76vh", ...glass }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header: search + 2D/3D pill + esc */}
        <div
          className="flex items-center gap-2 px-2.5 py-2 shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
        >
          {/* Search */}
          <div className="relative flex-1">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2"
              width="11" height="11" viewBox="0 0 16 16" fill="none"
              stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round"
            >
              <circle cx="7" cy="7" r="4"/><path d="M10.5 10.5l3 3"/>
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search nodes…"
              className="w-full rounded-[7px] border pl-7 pr-3 py-1.5 text-[11.5px] outline-none"
              style={{
                background: "rgba(255,255,255,0.04)",
                borderColor: query ? "rgba(91,141,239,0.3)" : "rgba(255,255,255,0.06)",
                color: "#f5f5f5",
                fontFamily: "system-ui",
              }}
            />
          </div>

          {/* 2D / 3D pill */}
          <div
            className="flex items-center rounded-[7px] p-0.5 shrink-0"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            {(["2d", "3d"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); setQuery(""); }}
                className="rounded-[5px] px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-widest transition-all duration-150 ease-out"
                style={{
                  background: tab === t ? "rgba(91,141,239,0.20)" : "transparent",
                  color: tab === t ? "#5b8def" : "rgba(255,255,255,0.22)",
                  border: tab === t ? "1px solid rgba(91,141,239,0.28)" : "1px solid transparent",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <kbd
            className="rounded border px-1.5 py-0.5 font-mono text-[9px] shrink-0"
            style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.3)", color: "rgba(255,255,255,0.18)" }}
          >
            esc
          </kbd>
        </div>

        {/* Node list — single column, compact rows */}
        <div className="flex-1 overflow-y-auto px-2 py-2 no-scrollbar">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <span className="font-mono text-[10.5px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.15)" }}>
                No nodes found
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {filtered.map((n) => (
                <button
                  key={n.type}
                  type="button"
                  onClick={() => add(n.type)}
                  className="flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition-all duration-150 ease-out"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid transparent" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = `${n.accent}28`;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.02)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "transparent";
                  }}
                >
                  <div
                    className="flex shrink-0 items-center justify-center rounded-[6px]"
                    style={{ width: 26, height: 26, background: `${n.accent}14`, color: n.accent, border: `1px solid ${n.accent}22` }}
                  >
                    {n.icon}
                  </div>
                  <div className="flex min-w-0 flex-col gap-0">
                    <span style={{ font: "500 12px/1.3 system-ui", color: "#e0e0e8" }}>{n.label}</span>
                    <span className="truncate text-[10px]" style={{ color: "rgba(255,255,255,0.25)", fontFamily: "system-ui" }}>
                      {n.desc}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
