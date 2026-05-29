import { useRef, useCallback, useEffect, useState, useMemo } from "react";
import { CANVAS_MAX_SCALE, CANVAS_MIN_SCALE, CANVAS_ZOOM_STEP } from "@/lib/constants";
import { useCanvasStore } from "@/modules/canvas/canvasStore";
import { PORT_DEFS, namedPortPoint } from "@/modules/canvas/portDefs";
import type { PortDataType } from "@/modules/canvas/portDefs";
import { V3CanvasBgAmbient } from "./V3CanvasBgAmbient";
import { V3CanvasNode } from "./V3CanvasNode";
import { V3WireLayer, type PendingConn } from "./V3WireLayer";
import { V3NodePalette } from "./V3NodePalette";

function isEditingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
}

/** Inward-facing semicircle port handle for secondary canvas. */
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

export function V3SecondaryCanvas() {
  const panels      = useCanvasStore((s) => s.secondaryPanels);
  const connections = useCanvasStore((s) => s.secondaryConnections);
  const viewport    = useCanvasStore((s) => s.secondaryViewport);
  const setViewport = useCanvasStore((s) => s.setSecondaryViewport);
  const deselectAll = useCanvasStore((s) => s.deselectAllSecondary);
  const deleteSelected = useCanvasStore((s) => s.deleteSecondarySelected);
  const updatePanel = useCanvasStore((s) => s.updateSecondaryPanel);
  const bringToFront = useCanvasStore((s) => s.bringSecondaryToFront);
  const removePanel = useCanvasStore((s) => s.removeSecondaryPanel);
  const selectPanel = useCanvasStore((s) => s.selectSecondaryPanel);
  const selectedPanelIds = useCanvasStore((s) => s.secondarySelectedIds);
  const addConnection = useCanvasStore((s) => s.addSecondaryConnection);
  const removeConnection = useCanvasStore((s) => s.removeSecondaryConnection);

  const [panelDragging, setPanelDragging] = useState(false);
  const [pendingConn, setPendingConn]     = useState<PendingConn | null>(null);
  const [hoveredPanelId, setHoveredPanelId] = useState<string | null>(null);
  const [showAddPanel, setShowAddPanel]   = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && !isEditingTarget(e)) {
        if (selectedPanelIds.length > 0) { e.preventDefault(); deleteSelected(); }
      }
    };
    const onOpen = () => setShowAddPanel(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("canvas:open-secondary-add-panel", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("canvas:open-secondary-add-panel", onOpen);
    };
  }, [deleteSelected, selectedPanelIds.length]);

  const containerRef = useRef<HTMLDivElement>(null);
  const panState = useRef<{ active: boolean; startX: number; startY: number; origVX: number; origVY: number }>({
    active: false, startX: 0, startY: 0, origVX: 0, origVY: 0,
  });

  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || panelDragging) return;
      if (!(e.target as HTMLElement).closest("[data-canvas-panel]")) deselectAll();
      panState.current = { active: true, startX: e.clientX, startY: e.clientY, origVX: viewport.x, origVY: viewport.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [viewport.x, viewport.y, panelDragging, deselectAll],
  );

  const onCanvasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!panState.current.active) return;
      setViewport({ x: panState.current.origVX + (e.clientX - panState.current.startX), y: panState.current.origVY + (e.clientY - panState.current.startY) });
    },
    [setViewport],
  );

  const onCanvasPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    panState.current.active = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? CANVAS_ZOOM_STEP : 1 / CANVAS_ZOOM_STEP;
      const { secondaryViewport: { scale, x, y } } = useCanvasStore.getState();
      const next = Math.min(CANVAS_MAX_SCALE, Math.max(CANVAS_MIN_SCALE, scale * factor));
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      useCanvasStore.getState().setSecondaryViewport({ scale: next, x: cx - (cx - x) * (next / scale), y: cy - (cy - y) * (next / scale) });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCanvasRect(el.getBoundingClientRect()));
    ro.observe(el);
    setCanvasRect(el.getBoundingClientRect());
    return () => ro.disconnect();
  }, []);

  const canvasPanels = useMemo(() => panels.filter((p) => !p.pinned && !p.minimized), [panels]);

  const storeOverrides = {
    updatePanel,
    removePanel,
    bringToFront,
    selectPanel,
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full select-none overflow-hidden"
      style={{ background: "#050507" }}
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onCanvasPointerMove}
      onPointerUp={onCanvasPointerUp}
    >
      <V3CanvasBgAmbient />

      <div
        className="absolute inset-0"
        style={{ transform: `translate(${viewport.x}px,${viewport.y}px) scale(${viewport.scale})`, transformOrigin: "0 0" }}
      >
        {canvasPanels.map((panel) => (
          <V3CanvasNode
            key={panel.id}
            panel={panel}
            viewportScale={viewport.scale}
            storeOverrides={{ ...storeOverrides, isSelected: selectedPanelIds.includes(panel.id) }}
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
        ))}

        <V3WireLayer
          panels={panels}
          connections={connections}
          viewport={viewport}
          canvasRect={canvasRect}
          pending={pendingConn}
          onPendingChange={setPendingConn}
          hoveredPanelId={hoveredPanelId}
          addConnectionOverride={addConnection}
          removeConnectionOverride={removeConnection}
        />
      </div>

      {panels.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[12px] tracking-wide" style={{ color: "rgba(255,255,255,0.10)" }}>
            Click + Add to start
          </span>
        </div>
      )}

      <CanvasPort side="left" label="OUT" color="#4db89a" />
      <CanvasPort side="right" label="IN" color="#5b8def" />

      {showAddPanel && (
        <V3NodePalette
          onClose={() => setShowAddPanel(false)}
          onAddPanel={(type) => useCanvasStore.getState().addSecondaryPanel(type)}
        />
      )}
    </div>
  );
}
