import { useState } from "react";
import { useCanvasStore, type CanvasKind } from "./canvasStore";

const KIND_COLORS: Record<CanvasKind, string> = {
  workspace: "#5b8def",
  image:     "#c79ad6",
  audio:     "#4db89a",
  data:      "#88a0c8",
};

// Tiny node-dot preview rendered inside each thumbnail
function ThumbPreview({ nodeCount, color }: { nodeCount: number; color: string }) {
  // Deterministic pseudo-random positions from count seed
  const dots = Array.from({ length: Math.min(nodeCount, 8) }, (_, i) => {
    const seed = (i * 137 + 17) % 100;
    return { x: 8 + (seed % 80), y: 8 + Math.floor(seed / 10) * 9 };
  });
  return (
    <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
      {dots.map((d, i) => (
        <rect
          key={i}
          x={d.x} y={d.y}
          width={14 + (i % 3) * 8}
          height={8}
          rx={2}
          fill={`${color}22`}
          stroke={`${color}55`}
          strokeWidth={0.5}
        />
      ))}
    </svg>
  );
}

export function CanvasDock() {
  const canvases = useCanvasStore((s) => s.canvases);
  const activeCanvasId = useCanvasStore((s) => s.activeCanvasId);
  const panels = useCanvasStore((s) => s.panels);
  const addCanvas = useCanvasStore((s) => s.addCanvas);
  const switchCanvas = useCanvasStore((s) => s.switchCanvas);

  const [collapsed, setCollapsed] = useState(false);

  const visible = canvases.filter((c) => !c.hidden);
  const hidden  = canvases.filter((c) => c.hidden);

  return (
    <div
      className="canvas-chrome pointer-events-auto absolute inset-x-3.5 z-[60] rounded-[14px] border border-[#2e2e2e]"
      style={{
        bottom: "104px",
        background: "color-mix(in oklab, #111111 88%, transparent)",
        boxShadow: "0 20px 60px rgba(0,0,0,.45)",
        transition: "padding 180ms ease",
        padding: collapsed ? "4px 10px" : "6px 10px 10px",
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header row */}
      <div className="flex items-center justify-between py-0.5">
        <button
          type="button"
          className="flex items-center gap-2 bg-transparent border-none text-[#888888] hover:text-[#f5f5f5] transition-colors duration-150"
          onClick={() => setCollapsed((v) => !v)}
        >
          <svg
            width="10" height="10" viewBox="0 0 10 10" fill="none"
            style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 150ms" }}
          >
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ font: "500 11px/1 'Geist Variable', sans-serif", letterSpacing: ".01em" }}>
            Canvases
          </span>
        </button>

        <div className="flex items-center gap-1">
          <span className="font-mono text-[9.5px] uppercase tracking-widest text-[#4a4845]">
            {visible.length} · {hidden.length > 0 ? `${hidden.length} hidden` : ""}
          </span>
          <button
            type="button"
            className="flex items-center gap-1.5 ml-1 rounded-[7px] px-2.5 py-1 text-[11px] font-medium text-[#5b8def] border transition-colors duration-150 hover:bg-[#5b8def]/10"
            style={{
              background: "color-mix(in oklab, #5b8def 14%, transparent)",
              borderColor: "color-mix(in oklab, #5b8def 30%, transparent)",
            }}
            onClick={() => addCanvas()}
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4.5 1v7M1 4.5h7"/>
            </svg>
            New canvas
          </button>
        </div>
      </div>

      {/* Thumbnail row */}
      {!collapsed && (
        <div className="flex gap-2 overflow-x-auto pt-2 pb-0.5 no-scrollbar" style={{ alignItems: "stretch" }}>
          {visible.map((c) => {
            const color = KIND_COLORS[c.kind] ?? "#5b8def";
            const nodeCount = panels.filter((p) => !p.minimized).length;
            const isActive = c.id === activeCanvasId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => switchCanvas(c.id)}
                className="shrink-0 flex flex-col overflow-hidden rounded-[8px] border transition-all duration-150"
                style={{
                  width: 148,
                  height: 110,
                  background: "var(--cv-card-3, #0d0d0d)",
                  borderColor: isActive
                    ? color
                    : "color-mix(in oklab, #232323 100%, transparent)",
                  boxShadow: isActive
                    ? `0 0 0 1px ${color} inset, 0 0 20px color-mix(in oklab, ${color} 22%, transparent)`
                    : "none",
                  transform: !isActive ? undefined : "none",
                }}
              >
                {/* Preview area */}
                <div
                  className="relative flex-1 overflow-hidden"
                  style={{
                    background: `radial-gradient(circle at 30% 20%, color-mix(in oklab, ${color} 10%, #0d0d0d) 0%, #0d0d0d 70%), radial-gradient(circle, rgba(255,255,255,.05) 1px, transparent 1px) 0 0 / 8px 8px`,
                  }}
                >
                  <ThumbPreview nodeCount={nodeCount} color={color} />
                </div>
                {/* Label strip */}
                <div
                  className="flex items-center gap-1.5 px-2 py-1.5 border-t shrink-0"
                  style={{ borderColor: "#232323", background: "#161616" }}
                >
                  <div className="shrink-0 rounded-full" style={{ width: 6, height: 6, background: color }} />
                  <span
                    className="flex-1 truncate text-left text-[#f5f5f5] overflow-hidden text-ellipsis whitespace-nowrap"
                    style={{ font: "500 11px/1 'Geist Variable', sans-serif" }}
                  >
                    {c.title}
                  </span>
                  <span className="font-mono text-[9.5px] text-[#4a4845] shrink-0">
                    {c.id === activeCanvasId ? panels.filter(p=>!p.minimized).length : 0}n
                  </span>
                </div>
              </button>
            );
          })}

          {/* Hidden canvases separator */}
          {hidden.length > 0 && (
            <div className="flex items-center border-l border-dashed border-[#2e2e2e] pl-3 ml-1">
              <span
                className="font-mono text-[9.5px] uppercase tracking-widest text-[#4a4845]"
                style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
              >
                Hidden
              </span>
              <div className="flex flex-col gap-2 ml-2">
                {hidden.map((c) => {
                  const color = KIND_COLORS[c.kind] ?? "#5b8def";
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => switchCanvas(c.id)}
                      className="flex items-center gap-1.5 rounded-[6px] border px-2 py-1 text-[10.5px] text-[#7a7873] hover:text-[#f5f5f5] transition-colors duration-150"
                      style={{ borderColor: "#232323", background: "#0d0d0d" }}
                    >
                      <div className="rounded-full" style={{ width: 5, height: 5, background: color, flexShrink: 0 }} />
                      <span className="truncate max-w-[80px]">{c.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
