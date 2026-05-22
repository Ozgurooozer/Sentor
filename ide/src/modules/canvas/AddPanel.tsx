import { useEffect, useRef, useState } from "react";
import type { PanelType } from "./types";
import { useCanvasStore } from "./canvasStore";

type NodeDef = {
  type: PanelType;
  label: string;
  desc: string;
  category: string;
  accent: string;
  icon: React.ReactNode;
};

const IC = (path: string) => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d={path}/>
  </svg>
);

const NODES: NodeDef[] = [
  { type: "chat",       label: "Atlas Chat",   desc: "LLM chat — aggregates wired context",        category: "AI",      accent: "#5b8def", icon: IC("M13 2H3a1 1 0 00-1 1v7a1 1 0 001 1h1v3l4-3h5a1 1 0 001-1V3a1 1 0 00-1-1z") },
  { type: "agent",      label: "Agent",        desc: "Autonomous AI with tools, runs in background", category: "AI",     accent: "#5b8def", icon: IC("M8 5a3 3 0 100 6 3 3 0 000-6zM8 2a6 6 0 100 12A6 6 0 008 2z") },
  { type: "terminal",   label: "Terminal",     desc: "PTY terminal — pipes last 80 lines downstream", category: "Tools", accent: "#4db89a", icon: IC("M3 4h10v8H3zM5 7l2 2-2 2M9 11h2") },
  { type: "editor",     label: "Editor",       desc: "CodeMirror — streams file content downstream", category: "Tools",  accent: "#9b72ef", icon: IC("M4 6h8M4 9h5M4 12h3") },
  { type: "web",        label: "Web",          desc: "Native WebView — URL + title flow downstream", category: "Tools",  accent: "#e07b54", icon: IC("M8 2a6 6 0 100 12A6 6 0 008 2zM2 8h12M8 2c-1.5 2-2 4-2 6s.5 4 2 6M8 2c1.5 2 2 4 2 6s-.5 4-2 6") },
  { type: "filebrowser",label: "Files",        desc: "Project & vault browser, drag files to canvas", category: "Tools", accent: "#d4a843", icon: IC("M3 4a1 1 0 011-1h3l2 2h4a1 1 0 011 1v7a1 1 0 01-1 1H4a1 1 0 01-1-1V4z") },
  { type: "input",      label: "Input",        desc: "Text, image or file — drop any content",       category: "Inputs", accent: "#d4a843", icon: IC("M8 3v10M3 8h10") },
  { type: "sketch",     label: "Sketch",       desc: "Freehand draw — annotate, shapes, arrows",     category: "Inputs", accent: "#e07b54", icon: IC("M12 3l1 1-8 8H4v-1l8-8zM11 4l1 1") },
  { type: "note",       label: "Sticky Note",  desc: "Paper-style note — quick capture",              category: "Inputs", accent: "#e8c574", icon: IC("M3 3h10v10H9l-6-6V3zM9 13V9h4") },
  { type: "checklist",  label: "Checklist",    desc: "Task list — unchecked items flow downstream",  category: "Display", accent: "#7e8a98", icon: IC("M4 6l2 2 4-4M4 10l2 2 4-4") },
  { type: "gallery",    label: "Gallery",      desc: "Image grid — moodboard, reference",            category: "Display", accent: "#c79ad6", icon: IC("M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z") },
  { type: "header",     label: "Header",       desc: "Big label — group nodes visually",             category: "Display", accent: "#d4a843", icon: IC("M3 5h10M3 8h7M3 11h4") },
  { type: "canvas",     label: "Sub Canvas",   desc: "Nested workflow — enter to edit, wire to use", category: "Canvas",  accent: "#5b8def", icon: IC("M2 2h12v12H2zM5 5h6v6H5z") },
  { type: "pipeline",   label: "Pipeline",     desc: "Multi-step transform chain",                   category: "Canvas",  accent: "#e07b54", icon: IC("M2 8h3l2-3 2 6 2-3h3") },
  { type: "codegraph",  label: "Code Graph",   desc: "Symbol-level dependency graph",                category: "Canvas",  accent: "#9b72ef", icon: IC("M8 2l4 4-4 4-4-4 4-4zM2 12l2-2M12 12l2 2M8 10v4") },
];

const CATS = ["AI", "Tools", "Inputs", "Display", "Canvas"];

type Props = { onClose: () => void; onImportBlueprint?: () => void };

export function AddPanel({ onClose, onImportBlueprint }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const addPanel = useCanvasStore((s) => s.addPanel);

  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const filtered = query.trim()
    ? NODES.filter((n) =>
        n.label.toLowerCase().includes(query.toLowerCase()) ||
        n.category.toLowerCase().includes(query.toLowerCase()) ||
        n.desc.toLowerCase().includes(query.toLowerCase()),
      )
    : NODES;

  const byCategory: Record<string, NodeDef[]> = {};
  for (const n of filtered) (byCategory[n.category] ??= []).push(n);
  const cats = CATS.filter((c) => byCategory[c]?.length);

  const add = (type: PanelType) => { addPanel(type); onClose(); };

  return (
    <div
      className="fixed inset-0 z-[65]"
      onPointerDown={onClose}
    >
      <div
        className="canvas-chrome absolute flex flex-col overflow-hidden rounded-[12px] border"
        style={{
          right: 68, top: "50%", transform: "translateY(-50%)",
          width: 320, maxHeight: "80vh",
          background: "color-mix(in oklab, #111111 92%, transparent)",
          borderColor: "#2e2e2e",
          boxShadow: "0 24px 60px rgba(0,0,0,.5)",
          animation: "panel-in 200ms cubic-bezier(.2,.7,.2,1)",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-3 pt-2.5 pb-2 border-b" style={{ borderColor: "#232323" }}>
          <div className="flex items-center justify-between mb-2">
            <span style={{ font: "600 12px/1 'Geist Variable', sans-serif", color: "#f5f5f5" }}>
              Add node
            </span>
            <kbd className="rounded border border-[#232323] bg-[#0d0d0d] px-1.5 py-0.5 font-mono text-[9.5px] text-[#4a4845]">
              Ctrl+K
            </kbd>
          </div>
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 text-[#4a4845]" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="7" cy="7" r="4"/><path d="M10.5 10.5l3 3"/>
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search nodes…"
              className="w-full rounded-[6px] border pl-7 pr-2 py-1.5 outline-none text-[12px]"
              style={{
                background: "#0d0d0d",
                borderColor: query ? "#5b8def" : "#232323",
                color: "#f5f5f5",
                fontFamily: "'Geist Variable', sans-serif",
              }}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-1.5 no-scrollbar">
          {cats.length === 0 ? (
            <p className="py-6 text-center font-mono text-[11px] text-[#4a4845]">No nodes found</p>
          ) : (
            <>
            {cats.map((cat) => (
              <div key={cat}>
                <div className="px-2 pt-2 pb-1 font-mono text-[9.5px] uppercase tracking-widest text-[#4a4845]">
                  {cat}
                </div>
                {byCategory[cat].map((n) => (
                  <button
                    key={n.type}
                    type="button"
                    onClick={() => add(n.type)}
                    className="grid w-full items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-left transition-colors duration-150 ease-out hover:bg-[#1a1a1a]"
                    style={{ gridTemplateColumns: "28px 1fr" }}
                  >
                    <div
                      className="flex items-center justify-center rounded-[6px]"
                      style={{
                        width: 24, height: 24,
                        background: `color-mix(in oklab, ${n.accent} 14%, transparent)`,
                        color: n.accent,
                        border: `1px solid color-mix(in oklab, ${n.accent} 30%, transparent)`,
                      }}
                    >
                      {n.icon}
                    </div>
                    <div>
                      <div style={{ font: "500 12.5px/1 'Geist Variable', sans-serif", color: "#f5f5f5" }}>
                        {n.label}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-[1.4]" style={{ color: "#7a7873" }}>
                        {n.desc}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ))}
            {onImportBlueprint && (
              <div>
                <div className="px-2 pt-2 pb-1 font-mono text-[9.5px] uppercase tracking-widest text-[#4a4845]">
                  Blueprint
                </div>
                <button
                  type="button"
                  onClick={() => { onImportBlueprint(); onClose(); }}
                  className="grid w-full items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-left transition-colors duration-150 ease-out hover:bg-[#1a1a1a]"
                  style={{ gridTemplateColumns: "28px 1fr" }}
                >
                  <div
                    className="flex items-center justify-center rounded-[6px]"
                    style={{ width: 24, height: 24, background: "color-mix(in oklab, #9b72ef 14%, transparent)", color: "#9b72ef", border: "1px solid color-mix(in oklab, #9b72ef 30%, transparent)" }}
                  >
                    {IC("M8 2l2 4h4l-3.3 2.4 1.3 4L8 10l-3.9 2.4 1.3-4L2 6h4z")}
                  </div>
                  <div>
                    <div style={{ font: "500 12.5px/1 'Geist Variable', sans-serif", color: "#f5f5f5" }}>Import Blueprint</div>
                    <div className="mt-0.5 text-[11px] leading-[1.4]" style={{ color: "#7a7873" }}>Load a saved node layout from JSON</div>
                  </div>
                </button>
              </div>
            )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
