import { useCallback } from "react";
import { useCanvasStore } from "./canvasStore";
import { CANVAS_MAX_SCALE, CANVAS_MIN_SCALE, CANVAS_ZOOM_STEP } from "@/lib/constants";

export function ZoomBar() {
  const viewport  = useCanvasStore((s) => s.viewport);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const allPanels = useCanvasStore((s) => s.panels);
  const panels    = allPanels.filter((p) => !p.pinned && !p.minimized);

  const zoomBy = useCallback(
    (factor: number) => {
      const { scale, x, y } = viewport;
      const next = Math.min(CANVAS_MAX_SCALE, Math.max(CANVAS_MIN_SCALE, scale * factor));
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      setViewport({ scale: next, x: cx - (cx - x) * (next / scale), y: cy - (cy - y) * (next / scale) });
    },
    [viewport, setViewport],
  );

  const fitAll = useCallback(() => {
    if (panels.length === 0) { setViewport({ x: 0, y: 0, scale: 1 }); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of panels) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + p.width); maxY = Math.max(maxY, p.y + p.height);
    }
    const pad = 60;
    const cw = window.innerWidth, ch = window.innerHeight;
    const fit = Math.min(CANVAS_MAX_SCALE, Math.max(CANVAS_MIN_SCALE,
      Math.min((cw - pad * 2) / (maxX - minX), (ch - pad * 2) / (maxY - minY))));
    setViewport({ scale: fit, x: cw / 2 - ((minX + maxX) / 2) * fit, y: ch / 2 - ((minY + maxY) / 2) * fit });
  }, [panels, setViewport]);

  const pct = Math.round(viewport.scale * 100);

  const btn = (label: string, onClick: () => void, title?: string) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex items-center justify-center rounded-full transition-colors duration-150 ease-out text-[#4a4845] hover:bg-[#1a1a1a] hover:text-[#888888]"
      style={{ width: 26, height: 26, fontSize: 11 }}
    >
      {label}
    </button>
  );

  return (
    <div
      className="canvas-chrome pointer-events-auto absolute z-[50] flex items-center gap-0.5 rounded-full border p-1"
      style={{
        bottom: 272,
        left: "50%",
        transform: "translateX(-50%)",
        background: "color-mix(in oklab, #111111 85%, transparent)",
        borderColor: "#232323",
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {btn("−", () => zoomBy(1 / CANVAS_ZOOM_STEP), "Zoom out")}
      <button
        type="button"
        onClick={() => setViewport({ scale: 1, x: 0, y: 0 })}
        title="Reset zoom"
        className="flex items-center justify-center rounded-full px-2 transition-colors duration-150 ease-out hover:bg-[#1a1a1a]"
        style={{ minWidth: 44, height: 26, fontFamily: "'Geist Variable', monospace", fontSize: 10.5, color: "#888888" }}
      >
        {pct}%
      </button>
      {btn("+", () => zoomBy(CANVAS_ZOOM_STEP), "Zoom in")}
      <div className="mx-0.5 h-3.5 w-px bg-[#232323]" />
      {btn("⊞", fitAll, "Fit all")}
    </div>
  );
}
