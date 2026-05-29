import { useCallback, useMemo, useRef } from "react";
import { useCanvasStore } from "@/modules/canvas/canvasStore";

const MAP_W = 160;
const MAP_H = 96;
const PAD   = 120;

export function V3MiniMap() {
  // Select the stable array reference, then filter with useMemo.
  // Selecting with inline .filter() creates a new array on every Zustand
  // subscription check, causing an infinite re-render loop.
  const allPanels  = useCanvasStore((s) => s.panels);
  const viewport   = useCanvasStore((s) => s.viewport);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const dragRef    = useRef(false);

  const panels = useMemo(
    () => allPanels.filter((p) => !p.pinned && !p.minimized),
    [allPanels],
  );

  if (panels.length === 0) return null;

  // Bounding box of all panels (canvas space), padded
  const minX = Math.min(...panels.map((p) => p.x)) - PAD;
  const minY = Math.min(...panels.map((p) => p.y)) - PAD;
  const maxX = Math.max(...panels.map((p) => p.x + p.width))  + PAD;
  const maxY = Math.max(...panels.map((p) => p.y + p.height)) + PAD;
  const bw   = maxX - minX;
  const bh   = maxY - minY;

  // Scale to fit MAP_W x MAP_H
  const s = Math.min(MAP_W / bw, MAP_H / bh);
  const mapW = bw * s;
  const mapH = bh * s;
  const offX = (MAP_W - mapW) / 2;
  const offY = (MAP_H - mapH) / 2;

  const toMap = (cx: number, cy: number) => ({
    x: (cx - minX) * s + offX,
    y: (cy - minY) * s + offY,
  });

  // Viewport visible area in canvas space
  const vpCX = -viewport.x / viewport.scale;
  const vpCY = -viewport.y / viewport.scale;
  const vpCW = window.innerWidth  / viewport.scale;
  const vpCH = window.innerHeight / viewport.scale;

  const vpMap  = toMap(vpCX, vpCY);
  const vpMapW = vpCW * s;
  const vpMapH = vpCH * s;

  const moveToMapPoint = useCallback((mx: number, my: number) => {
    const canvasX = (mx - offX) / s + minX;
    const canvasY = (my - offY) / s + minY;
    setViewport({
      x: window.innerWidth  / 2 - canvasX * viewport.scale,
      y: window.innerHeight / 2 - canvasY * viewport.scale,
    });
  // deps: offX, offY, s, minX, minY are computed values (not reactive state); viewport.scale IS reactive
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.scale, setViewport]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    moveToMapPoint(e.clientX - rect.left, e.clientY - rect.top);
  }, [moveToMapPoint]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    moveToMapPoint(e.clientX - rect.left, e.clientY - rect.top);
  }, [moveToMapPoint]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div
      className="absolute bottom-3 right-3 z-50 select-none overflow-hidden"
      style={{
        width: MAP_W, height: MAP_H,
        background: "rgba(8,8,14,0.82)",
        backdropFilter: "blur(14px) saturate(140%)",
        WebkitBackdropFilter: "blur(14px) saturate(140%)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 8,
        cursor: "crosshair",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Panel rectangles */}
      {panels.map((p) => {
        const m = toMap(p.x, p.y);
        return (
          <div
            key={p.id}
            className="pointer-events-none absolute rounded-[1px]"
            style={{
              left:   m.x,
              top:    m.y,
              width:  Math.max(3, p.width  * s),
              height: Math.max(2, p.height * s),
              background: "rgba(91,141,239,0.45)",
            }}
          />
        );
      })}

      {/* Viewport indicator */}
      <div
        className="pointer-events-none absolute"
        style={{
          left:   vpMap.x,
          top:    vpMap.y,
          width:  Math.max(8, vpMapW),
          height: Math.max(6, vpMapH),
          border: "1px solid rgba(91,141,239,0.70)",
          background: "rgba(91,141,239,0.08)",
        }}
      />

      {/* "map" label */}
      <div
        className="pointer-events-none absolute bottom-1 left-1.5 font-mono text-[8px] uppercase tracking-widest"
        style={{ color: "rgba(255,255,255,0.16)" }}
      >
        map
      </div>
    </div>
  );
}
