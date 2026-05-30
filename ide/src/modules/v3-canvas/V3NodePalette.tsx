import { useEffect, useRef, useState } from "react";
import type { PanelType } from "@/modules/canvas/types";
import { useCanvasStore } from "@/modules/canvas/canvasStore";

type NodeDef = { type: PanelType; label: string; desc: string; accent: string; icon: React.ReactNode; customAction?: () => void };

const IC = (path: string) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d={path}/>
  </svg>
);

const NODES_ACTIVE: NodeDef[] = [
  { type: "terminal", label: "Terminal", desc: "PTY shell · JS eval · JSON", accent: "#4db89a", icon: IC("M3 4h10v8H3zM5 7l2 2-2 2M9 11h2") },
  { type: "chat",     label: "Chat",     desc: "LLM chat",                   accent: "#5b8def", icon: IC("M13 2H3a1 1 0 00-1 1v7a1 1 0 001 1h1v3l4-3h5a1 1 0 001-1V3a1 1 0 00-1-1z") },
  { type: "input",    label: "Input",    desc: "Text / file input",          accent: "#d4a843", icon: IC("M8 3v10M3 8h10") },
];


interface Props {
  onClose: () => void;
  /** Override the default addPanel action (e.g. for secondary canvas). */
  onAddPanel?: (type: PanelType) => void;
}

export function V3NodePalette({ onClose, onAddPanel }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const addPanel = useCanvasStore((s) => s.addPanel);

  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const filtered = q ? NODES_ACTIVE.filter((n) => n.label.toLowerCase().includes(q) || n.desc.toLowerCase().includes(q)) : NODES_ACTIVE;

  const add = (n: NodeDef) => {
    if (n.customAction) { n.customAction(); }
    else { (onAddPanel ?? addPanel)(n.type); }
    onClose();
  };

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
        style={{ right: 12, top: 48, width: 300, maxHeight: "calc(100vh - 60px)", ...glass }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header: search */}
        <div
          className="flex items-center gap-2 px-2.5 py-2 shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
        >
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
              id="node-palette-search"
              name="node-palette-search"
              autoComplete="off"
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
          <kbd
            className="rounded border px-1.5 py-0.5 font-mono text-[9px] shrink-0"
            style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.3)", color: "rgba(255,255,255,0.18)" }}
          >
            esc
          </kbd>
        </div>

        {/* Node list — single column, compact rows */}
        <div className="flex-1 overflow-y-auto px-2 py-2" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
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
                  key={n.type + n.label}
                  type="button"
                  onClick={() => add(n)}
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
