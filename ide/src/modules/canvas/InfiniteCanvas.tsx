import { useRef, useCallback, useEffect, useState } from "react";
import { CANVAS_MAX_SCALE, CANVAS_MIN_SCALE, CANVAS_ZOOM_STEP } from "@/lib/constants";
import { useCanvasStore } from "./canvasStore";
import { CanvasPanel } from "./CanvasPanel";
import { CanvasContextMenu, type ContextMenuPos, type NodeMenuItem } from "./CanvasContextMenu";
import { ConnectionLayer, type PendingConn } from "./ConnectionLayer";
import { PanelMenu } from "./PanelMenu";
import { CanvasDock } from "./CanvasDock";
import { BlueprintImportModal } from "./BlueprintImportModal";
import { SentorRunModal } from "./SentorRunModal";
import { usePreferencesStore } from "@/modules/settings/preferences";

const DOT_GRID_STYLE: React.CSSProperties = {
  backgroundImage:
    "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
};

export function InfiniteCanvas() {
  const panels = useCanvasStore((s) => s.panels);
  const connections = useCanvasStore((s) => s.connections);
  const viewport = useCanvasStore((s) => s.viewport);
  const setViewport = useCanvasStore((s) => s.setViewport);

  const addPanel = useCanvasStore((s) => s.addPanel);

  const workspaceRoot = usePreferencesStore((s) => s.workspaceRoot);
  const [panelDragging, setPanelDragging] = useState(false);
  const [pendingConn, setPendingConn] = useState<PendingConn | null>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuPos | null>(null);
  const [showBlueprintImport, setShowBlueprintImport] = useState(false);
  const [showSentorRun, setShowSentorRun] = useState(false);
  const [nodes, setNodes] = useState<NodeMenuItem[]>([]);

  // Fetch available nodes from API for the context menu
  useEffect(() => {
    fetch("http://127.0.0.1:4242/api/nodes")
      .then((r) => r.json())
      .then((d) => setNodes(d.nodes ?? []))
      .catch(() => undefined);
  }, []);
  const containerRef = useRef<HTMLDivElement>(null);

  const panState = useRef<{
    active: boolean;
    startX: number; startY: number;
    origVX: number; origVY: number;
  }>({ active: false, startX: 0, startY: 0, origVX: 0, origVY: 0 });

  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || panelDragging) return;
      panState.current = {
        active: true,
        startX: e.clientX, startY: e.clientY,
        origVX: viewport.x, origVY: viewport.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [viewport.x, viewport.y, panelDragging],
  );

  const onCanvasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!panState.current.active) return;
      const dx = e.clientX - panState.current.startX;
      const dy = e.clientY - panState.current.startY;
      setViewport({ x: panState.current.origVX + dx, y: panState.current.origVY + dy });
    },
    [setViewport],
  );

  const onCanvasPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      panState.current.active = false;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    },
    [],
  );

  // Modern Chrome/Edge mark wheel listeners as passive by default; React's
  // onWheel prop inherits this and silently ignores preventDefault. Attaching
  // a native listener with passive: false is the only way to suppress page
  // scroll while we zoom the canvas.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? CANVAS_ZOOM_STEP : 1 / CANVAS_ZOOM_STEP;
      const { scale, x, y } = useCanvasStore.getState().viewport;
      const nextScale = Math.min(CANVAS_MAX_SCALE, Math.max(CANVAS_MIN_SCALE, scale * factor));
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const nextX = cx - (cx - x) * (nextScale / scale);
      const nextY = cy - (cy - y) * (nextScale / scale);
      useCanvasStore.getState().setViewport({ scale: nextScale, x: nextX, y: nextY });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const onContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only trigger on the canvas background, not on panels.
      if ((e.target as HTMLElement).closest("[data-canvas-panel]")) return;
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      // Convert screen coords → canvas coords (undo pan+zoom).
      const canvasX = (screenX - viewport.x) / viewport.scale;
      const canvasY = (screenY - viewport.y) / viewport.scale;
      setCtxMenu({ x: screenX, y: screenY, canvasX, canvasY });
    },
    [viewport],
  );

  // Pinned panels are managed by PinnedPanelsPortal (App.tsx) — always visible, both modes
  const canvasPanels = panels.filter((p) => !p.pinned);
  const hasNoPanels = panels.length === 0;

  const canvasRect = containerRef.current?.getBoundingClientRect() ?? null;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full select-none"
      style={DOT_GRID_STYLE}
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onCanvasPointerMove}
      onPointerUp={onCanvasPointerUp}
      onContextMenu={onContextMenu}
    >
      {/* Canvas-space layer — pan/zoom applied here */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          transformOrigin: "0 0",
        }}
      >
        {canvasPanels.map((panel) => (
          <CanvasPanel
            key={panel.id}
            panel={panel}
            viewport={viewport}
            onDragStart={() => setPanelDragging(true)}
            onDragEnd={() => setPanelDragging(false)}
          />
        ))}

        <ConnectionLayer
          panels={panels}
          connections={connections}
          viewport={viewport}
          canvasRect={canvasRect}
          pending={pendingConn}
          onPendingChange={setPendingConn}
        />
      </div>

      {hasNoPanels && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-[12px] text-[#333333]">Press [+] or right-click to add</span>
        </div>
      )}

      {ctxMenu && (
        <CanvasContextMenu
          pos={ctxMenu}
          onClose={() => setCtxMenu(null)}
          onAddPanel={(type, at) => {
            addPanel(type, at);
            setCtxMenu(null);
          }}
          onImportBlueprint={() => {
            setCtxMenu(null);
            setShowBlueprintImport(true);
          }}
          onRunSentorTask={() => {
            setCtxMenu(null);
            setShowSentorRun(true);
          }}
          nodes={nodes}
          onSpawnNode={(nodeId, at) => {
            const id = addPanel("pipeline", at);
            useCanvasStore.getState().updatePanel(id, { meta: { nodeId } });
            setCtxMenu(null);
          }}
        />
      )}

      {showBlueprintImport && (
        <BlueprintImportModal
          workspaceRoot={workspaceRoot ?? null}
          onClose={() => setShowBlueprintImport(false)}
        />
      )}

      {showSentorRun && (
        <SentorRunModal onClose={() => setShowSentorRun(false)} />
      )}

      {/* Minimized panels dock — sits above the AI bar */}
      <CanvasDock />

      {/* Floating + button — canvas bottom-left, visible in both layout modes.
          stopPropagation on the wrapper prevents the canvas pan handler from
          claiming pointerdown via setPointerCapture, which would otherwise
          steal subsequent events from the Radix dropdown portal. */}
      <div className="pointer-events-none absolute inset-0 z-20">
        <div
          className="pointer-events-auto absolute bottom-4 left-4"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <PanelMenu />
        </div>
      </div>
    </div>
  );
}
