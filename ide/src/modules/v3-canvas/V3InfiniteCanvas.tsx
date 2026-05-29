import { useRef, useCallback, useEffect, useState, useMemo } from "react";
import { CANVAS_MAX_SCALE, CANVAS_MIN_SCALE, CANVAS_ZOOM_STEP } from "@/lib/constants";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import { useCanvasStore } from "@/modules/canvas/canvasStore";
import { PORT_DEFS, namedPortPoint } from "@/modules/canvas/portDefs";
import type { PortDataType } from "@/modules/canvas/portDefs";
import type { CanvasPanelNode } from "@/modules/canvas/types";
import { V3CanvasBgPanel } from "./V3CanvasBgPanel";
import { V3CanvasNode } from "./V3CanvasNode";
import { V3WireLayer, type PendingConn } from "./V3WireLayer";
import { V3NodePalette } from "./V3NodePalette";
import { V3MiniMap } from "./V3MiniMap";

// Module-level clipboard — tab-isolated, no persistence needed
let _clipboard: CanvasPanelNode[] = [];

/** Inward-facing semicircle port handle on the canvas edge. */
function CanvasPort({ side, label, color }: { side: "left" | "right"; label: string; color: string }) {
  const [hovered, setHovered] = useState(false);
  const isLeft = side === "left";
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "absolute",
        [side]: 0,
        top: "50%",
        transform: "translateY(-50%)",
        width: hovered ? 22 : 14,
        height: 44,
        background: hovered ? `${color}22` : `${color}0f`,
        border: `1px solid ${hovered ? color + "55" : color + "28"}`,
        [isLeft ? "borderLeft" : "borderRight"]: "none",
        borderRadius: isLeft ? "0 50% 50% 0" : "50% 0 0 50%",
        cursor: "pointer",
        transition: "width 150ms ease-out, background 150ms ease-out, border-color 150ms ease-out",
        display: "flex",
        flexDirection: "column",
        alignItems: isLeft ? "flex-end" : "flex-start",
        justifyContent: "center",
        [isLeft ? "paddingRight" : "paddingLeft"]: 3,
        gap: 3,
        zIndex: 30,
      }}
      title={isLeft ? "Canvas output — data leaves this canvas" : "Canvas input — data enters this canvas"}
    >
      <div style={{ width: 5, height: 5, borderRadius: "50%", background: hovered ? color : `${color}88`, flexShrink: 0 }} />
      {hovered && (
        <span style={{ fontFamily: "monospace", fontSize: 7, color, letterSpacing: "0.05em", writingMode: "vertical-rl", textOrientation: "mixed", transform: isLeft ? "rotate(180deg)" : "none", lineHeight: 1 }}>
          {label}
        </span>
      )}
    </div>
  );
}

function isEditingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
}

export function V3InfiniteCanvas() {
  const panels      = useCanvasStore((s) => s.panels);
  const connections = useCanvasStore((s) => s.connections);
  const viewport    = useCanvasStore((s) => s.viewport);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const deselectAll = useCanvasStore((s) => s.deselectAll);
  const deleteSelected = useCanvasStore((s) => s.deleteSelected);
  const selectAll  = useCanvasStore((s) => s.selectAll);
  const selectMany = useCanvasStore((s) => s.selectMany);

  const [panelDragging, setPanelDragging] = useState(false);
  const [pendingConn, setPendingConn]     = useState<PendingConn | null>(null);
  const [hoveredPanelId, setHoveredPanelId] = useState<string | null>(null);
  const [showAddPanel, setShowAddPanel]   = useState(false);

  // Ctrl+K / canvas:open-add-panel → palette; Delete/Backspace → delete selected
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        selectAll();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        const { selectedPanelIds, panels } = useCanvasStore.getState();
        _clipboard = panels.filter((p) => selectedPanelIds.includes(p.id));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        if (_clipboard.length > 0) {
          useCanvasStore.getState().pasteFromClipboard(_clipboard);
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        const { panels } = useCanvasStore.getState();
        const visible = panels.filter((p) => !p.pinned && !p.minimized);
        if (visible.length === 0) {
          useCanvasStore.getState().setViewport({ x: 0, y: 0, scale: 1 });
          return;
        }
        const minX = Math.min(...visible.map((p) => p.x));
        const minY = Math.min(...visible.map((p) => p.y));
        const maxX = Math.max(...visible.map((p) => p.x + p.width));
        const maxY = Math.max(...visible.map((p) => p.y + p.height));
        const pw = window.innerWidth;
        const ph = window.innerHeight;
        const bw = maxX - minX + 120;
        const bh = maxY - minY + 120;
        const scale = Math.min(1.0, Math.min(pw / bw, ph / bh));
        const x = pw / 2 - (minX + bw / 2 - 60) * scale;
        const y = ph / 2 - (minY + bh / 2 - 60) * scale;
        useCanvasStore.getState().setViewport({ x, y, scale });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setShowAddPanel(true);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !isEditingTarget(e)) {
        const { selectedPanelIds } = useCanvasStore.getState();
        if (selectedPanelIds.length > 0) {
          e.preventDefault();
          deleteSelected();
        }
      }
    };
    const onOpen = () => setShowAddPanel(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("canvas:open-add-panel", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("canvas:open-add-panel", onOpen);
    };
  }, [deleteSelected, selectAll]);

  const containerRef = useRef<HTMLDivElement>(null);

  const panState = useRef<{ active: boolean; startX: number; startY: number; origVX: number; origVY: number }>({
    active: false, startX: 0, startY: 0, origVX: 0, origVY: 0,
  });

  // Marquee (rubber-band) selection
  const marqueeActiveRef     = useRef(false);
  const marqueeStartScreen   = useRef({ x: 0, y: 0 });
  const marqueeCurrentRef    = useRef({ x1: 0, y1: 0, x2: 0, y2: 0 });
  const [marqueeScreen, setMarqueeScreen] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || panelDragging) return;
      if ((e.target as HTMLElement).closest("[data-canvas-panel]")) return;
      deselectAll();
      if (e.shiftKey) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x1 = e.clientX - rect.left;
        const y1 = e.clientY - rect.top;
        marqueeActiveRef.current = true;
        marqueeStartScreen.current = { x: x1, y: y1 };
        marqueeCurrentRef.current = { x1, y1, x2: x1, y2: y1 };
        setMarqueeScreen({ x1, y1, x2: x1, y2: y1 });
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else {
        panState.current = { active: true, startX: e.clientX, startY: e.clientY, origVX: viewport.x, origVY: viewport.y };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
    },
    [viewport.x, viewport.y, panelDragging, deselectAll],
  );

  const onCanvasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (marqueeActiveRef.current) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x2 = e.clientX - rect.left;
        const y2 = e.clientY - rect.top;
        const next = { x1: marqueeStartScreen.current.x, y1: marqueeStartScreen.current.y, x2, y2 };
        marqueeCurrentRef.current = next;
        setMarqueeScreen(next);
        return;
      }
      if (!panState.current.active) return;
      setViewport({
        x: panState.current.origVX + (e.clientX - panState.current.startX),
        y: panState.current.origVY + (e.clientY - panState.current.startY),
      });
    },
    [setViewport],
  );

  const onCanvasPointerCancel = useCallback(() => {
    panState.current.active = false;
    marqueeActiveRef.current = false;
    setMarqueeScreen(null);
  }, []);

  const onCanvasPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (marqueeActiveRef.current) {
        marqueeActiveRef.current = false;
        const r = marqueeCurrentRef.current;
        const vp = useCanvasStore.getState().viewport;
        const minCX = (Math.min(r.x1, r.x2) - vp.x) / vp.scale;
        const maxCX = (Math.max(r.x1, r.x2) - vp.x) / vp.scale;
        const minCY = (Math.min(r.y1, r.y2) - vp.y) / vp.scale;
        const maxCY = (Math.max(r.y1, r.y2) - vp.y) / vp.scale;
        const ids = useCanvasStore.getState().panels
          .filter((p) => !p.pinned && !p.minimized)
          .filter((p) => p.x < maxCX && p.x + p.width > minCX && p.y < maxCY && p.y + p.height > minCY)
          .map((p) => p.id);
        if (ids.length > 0) selectMany(ids);
        setMarqueeScreen(null);
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        return;
      }
      panState.current.active = false;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    },
    [selectMany],
  );

  // Pinch/wheel zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? CANVAS_ZOOM_STEP : 1 / CANVAS_ZOOM_STEP;
      const { scale, x, y } = useCanvasStore.getState().viewport;
      const next = Math.min(CANVAS_MAX_SCALE, Math.max(CANVAS_MIN_SCALE, scale * factor));
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      useCanvasStore.getState().setViewport({ scale: next, x: cx - (cx - x) * (next / scale), y: cy - (cy - y) * (next / scale) });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const canvasPanels = useMemo(() => panels.filter((p) => !p.pinned && !p.minimized), [panels]);

  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCanvasRect(el.getBoundingClientRect()));
    ro.observe(el);
    setCanvasRect(el.getBoundingClientRect());
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full select-none overflow-hidden"
      style={{ background: "#050507" }}
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onCanvasPointerMove}
      onPointerUp={onCanvasPointerUp}
      onPointerCancel={onCanvasPointerCancel}
    >
      <V3CanvasBgPanel />

      {/* Canvas-space transform layer */}
      <div
        className="absolute inset-0"
        style={{ transform: `translate(${viewport.x}px,${viewport.y}px) scale(${viewport.scale})`, transformOrigin: "0 0" }}
      >
        {canvasPanels.map((panel) => (
          <ErrorBoundary key={panel.id} name={`node:${panel.type}:${panel.id.slice(0, 6)}`}>
            <V3CanvasNode
              panel={panel}
              viewportScale={viewport.scale}
              onDragStart={() => setPanelDragging(true)}
              onDragEnd={() => setPanelDragging(false)}
              onHover={() => setHoveredPanelId(panel.id)}
              onHoverEnd={() => setHoveredPanelId((cur) => (cur === panel.id ? null : cur))}
              onStartConnect={() => {
                const defs = PORT_DEFS[panel.type];
                const firstOut = defs?.outputs[0];
                const pt = firstOut
                  ? namedPortPoint(panel, "right", 0, defs!.outputs.length)
                  : { x: panel.x + panel.width, y: panel.y + panel.height / 2 };
                setPendingConn({ fromPanel: panel.id, fromSide: "right", fromPort: firstOut?.id, fromDataType: firstOut?.dataType as PortDataType | undefined, cursorX: pt.x, cursorY: pt.y });
              }}
            />
          </ErrorBoundary>
        ))}

        <V3WireLayer
          panels={panels}
          connections={connections}
          viewport={viewport}
          canvasRect={canvasRect}
          pending={pendingConn}
          onPendingChange={setPendingConn}
          hoveredPanelId={hoveredPanelId}
        />
      </div>

      {/* Empty state */}
      {panels.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[12px] tracking-wide" style={{ color: "rgba(255,255,255,0.22)" }}>
            Ctrl+K — add node  ·  Ctrl+0 — fit all
          </span>
        </div>
      )}

      {/* OUTPUT port — left edge, inward-facing semicircle */}
      <CanvasPort side="left" label="OUT" color="#4db89a" />
      {/* INPUT port — right edge, inward-facing semicircle */}
      <CanvasPort side="right" label="IN" color="#5b8def" />

      {/* Rubber-band marquee selection overlay */}
      {marqueeScreen && (
        <div
          className="pointer-events-none absolute"
          style={{
            left:   Math.min(marqueeScreen.x1, marqueeScreen.x2),
            top:    Math.min(marqueeScreen.y1, marqueeScreen.y2),
            width:  Math.abs(marqueeScreen.x2 - marqueeScreen.x1),
            height: Math.abs(marqueeScreen.y2 - marqueeScreen.y1),
            border: "1px solid rgba(91,141,239,0.55)",
            background: "rgba(91,141,239,0.06)",
            zIndex: 55,
          }}
        />
      )}

      <V3MiniMap />

      {showAddPanel && <V3NodePalette onClose={() => setShowAddPanel(false)} />}
    </div>
  );
}
