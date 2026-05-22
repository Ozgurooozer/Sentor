import { useCallback } from "react";
import { useCanvasStore } from "./canvasStore";
import { accentFor } from "./nodeAccent";

const MAP_W = 200;
const MAP_H = 108; // body area
const PADDING = 20;

export function MiniMap() {
  const allPanels = useCanvasStore((s) => s.panels);
  const panels = allPanels.filter((p) => !p.pinned && !p.minimized);
  const viewport = useCanvasStore((s) => s.viewport);
  const setViewport = useCanvasStore((s) => s.setViewport);

  const bounds = (() => {
    if (panels.length === 0) return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of panels) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + p.width);
      maxY = Math.max(maxY, p.y + p.height);
    }
    return { minX: minX - PADDING, minY: minY - PADDING, maxX: maxX + PADDING, maxY: maxY + PADDING };
  })();

  const rangeW = bounds.maxX - bounds.minX || 800;
  const rangeH = bounds.maxY - bounds.minY || 600;
  const mapScale = Math.min(MAP_W / rangeW, MAP_H / rangeH);

  const toMap = (cx: number, cy: number) => ({
    x: (cx - bounds.minX) * mapScale,
    y: (cy - bounds.minY) * mapScale,
  });

  const vpW = window.innerWidth / viewport.scale;
  const vpH = window.innerHeight / viewport.scale;
  const vpX = -viewport.x / viewport.scale;
  const vpY = -viewport.y / viewport.scale;
  const vpRect = toMap(vpX, vpY);

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const canvasCX = (e.clientX - rect.left) / mapScale + bounds.minX;
      const canvasCY = (e.clientY - rect.top)  / mapScale + bounds.minY;
      setViewport({
        x: window.innerWidth  / 2 - canvasCX * viewport.scale,
        y: window.innerHeight / 2 - canvasCY * viewport.scale,
      });
    },
    [mapScale, bounds, viewport.scale, setViewport],
  );

  return (
    <div
      className="canvas-chrome pointer-events-auto absolute z-[49] overflow-hidden rounded-[10px] border"
      style={{
        right: 14,
        bottom: 272,
        width: MAP_W,
        background: "color-mix(in oklab, #111111 85%, transparent)",
        borderColor: "#232323",
        boxShadow: "0 10px 32px rgba(0,0,0,.4)",
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-2 py-1.5 border-b"
        style={{ borderColor: "#232323" }}
      >
        <span className="font-mono text-[9.5px] font-medium uppercase tracking-widest text-[#4a4845]">
          MAP
        </span>
        <span className="font-mono text-[9.5px] text-[#3a3a3a]">{panels.length} nodes</span>
      </div>

      {/* SVG body */}
      <svg
        width={MAP_W}
        height={MAP_H}
        onClick={handleClick}
        className="block cursor-crosshair"
      >
        {panels.map((p) => {
          const mp = toMap(p.x, p.y);
          const accent = accentFor(p);
          return (
            <rect
              key={p.id}
              x={mp.x} y={mp.y}
              width={Math.max(3, p.width * mapScale)}
              height={Math.max(2, p.height * mapScale)}
              rx={1.5}
              fill={`${accent}28`}
              stroke={`${accent}70`}
              strokeWidth={0.6}
            />
          );
        })}
        {/* Viewport rect */}
        <rect
          x={vpRect.x} y={vpRect.y}
          width={Math.max(4, vpW * mapScale)}
          height={Math.max(4, vpH * mapScale)}
          rx={1}
          fill="rgba(91,141,239,.06)"
          stroke="#5b8def"
          strokeWidth={0.8}
        />
      </svg>
    </div>
  );
}
