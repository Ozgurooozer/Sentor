import { useRef, useCallback, useEffect, useState } from "react";
import { CANVAS_MAX_SCALE, CANVAS_MIN_SCALE, CANVAS_ZOOM_STEP } from "@/lib/constants";
import { useCanvasStore } from "./canvasStore";
import { CanvasPanel } from "./CanvasPanel";
import { CanvasContextMenu, type ContextMenuPos, type NodeMenuItem } from "./CanvasContextMenu";
import { ConnectionLayer, type PendingConn } from "./ConnectionLayer";
import { CanvasDock } from "./CanvasDock";
import { Orkestra } from "./Orkestra";
import { BlueprintImportModal } from "./BlueprintImportModal";
import { SentorRunModal } from "./SentorRunModal";
import { AddPanel } from "./AddPanel";
import { MiniMap } from "./MiniMap";
import { ZoomBar } from "./ZoomBar";
import { CanvasFab } from "./CanvasFab";
import { TweaksPanel } from "./TweaksPanel";
import { useTweaksStore } from "./canvasTweaksStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { BgStyle } from "./canvasTweaksStore";

function getBgStyle(style: BgStyle): React.CSSProperties {
  switch (style) {
    case "dot":
      return {
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      };
    case "grid":
      return {
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      };
    case "radial":
      return {
        background: "radial-gradient(ellipse at center, #111111 0%, #0a0a0a 70%)",
      };
    case "noise":
      return {
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeBlend in='SourceGraphic' result='blend'/%3E%3CfeComposite in='blend' in2='SourceGraphic' operator='in'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")",
      };
    default: // solid
      return { background: "#0a0a0a" };
  }
}

export function InfiniteCanvas() {
  const panels = useCanvasStore((s) => s.panels);
  const connections = useCanvasStore((s) => s.connections);
  const viewport = useCanvasStore((s) => s.viewport);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const addPanel = useCanvasStore((s) => s.addPanel);

  const bgStyle = useTweaksStore((s) => s.bgStyle);
  const showMinimap = useTweaksStore((s) => s.showMinimap);
  const showGuides = useTweaksStore((s) => s.showGuides);
  const wireAnim = useTweaksStore((s) => s.wireAnim);

  const workspaceRoot = usePreferencesStore((s) => s.workspaceRoot);
  const [panelDragging, setPanelDragging] = useState(false);
  const [pendingConn, setPendingConn] = useState<PendingConn | null>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuPos | null>(null);
  const [showBlueprintImport, setShowBlueprintImport] = useState(false);
  const [showSentorRun, setShowSentorRun] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [showTweaks, setShowTweaks] = useState(false);
  const [nodes, setNodes] = useState<NodeMenuItem[]>([]);
  // Alignment guides: { axis: "v"|"h", pos: number }[] in canvas space
  const [guides, setGuides] = useState<{ axis: "v" | "h"; pos: number }[]>([]);

  // Fetch available nodes from API for the context menu
  useEffect(() => {
    fetch("http://127.0.0.1:4242/api/nodes")
      .then((r) => r.json())
      .then((d) => setNodes(d.nodes ?? []))
      .catch(() => undefined);
  }, []);

  // Ctrl+K → open AddPanel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setShowAddPanel(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
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
      if ((e.target as HTMLElement).closest("[data-canvas-panel]")) return;
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const canvasX = (screenX - viewport.x) / viewport.scale;
      const canvasY = (screenY - viewport.y) / viewport.scale;
      setCtxMenu({ x: screenX, y: screenY, canvasX, canvasY });
    },
    [viewport],
  );

  // Alignment guides: only computed while actively dragging a panel.
  // Deps exclude `panels` intentionally — we read the store directly so a new
  // array reference from `useCanvasStore(s => s.panels)` never re-triggers this.
  useEffect(() => {
    if (!showGuides || !panelDragging) {
      // Use functional form so we only schedule a re-render when the guides
      // array is non-empty — avoids the infinite-loop that [] !== [] would cause.
      setGuides((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const allPanels = useCanvasStore.getState().panels.filter((p) => !p.pinned);
    const newGuides: { axis: "v" | "h"; pos: number }[] = [];
    const tol = 6 / viewport.scale;
    for (let i = 0; i < allPanels.length; i++) {
      for (let j = i + 1; j < allPanels.length; j++) {
        const a = allPanels[i];
        const b = allPanels[j];
        if (Math.abs(a.x - b.x) < tol) newGuides.push({ axis: "v", pos: (a.x + b.x) / 2 });
        if (Math.abs(a.x + a.width - (b.x + b.width)) < tol) newGuides.push({ axis: "v", pos: (a.x + a.width + b.x + b.width) / 2 });
        if (Math.abs(a.x + a.width / 2 - (b.x + b.width / 2)) < tol) newGuides.push({ axis: "v", pos: (a.x + a.width / 2 + b.x + b.width / 2) / 2 });
        if (Math.abs(a.y - b.y) < tol) newGuides.push({ axis: "h", pos: (a.y + b.y) / 2 });
        if (Math.abs(a.y + a.height - (b.y + b.height)) < tol) newGuides.push({ axis: "h", pos: (a.y + a.height + b.y + b.height) / 2 });
        if (Math.abs(a.y + a.height / 2 - (b.y + b.height / 2)) < tol) newGuides.push({ axis: "h", pos: (a.y + a.height / 2 + b.y + b.height / 2) / 2 });
      }
    }
    setGuides(newGuides.slice(0, 8));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelDragging, showGuides, viewport.scale]);

  const canvasPanels = panels.filter((p) => !p.pinned);
  const hasNoPanels = panels.length === 0;
  const canvasRect = containerRef.current?.getBoundingClientRect() ?? null;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full select-none"
      style={getBgStyle(bgStyle)}
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onCanvasPointerMove}
      onPointerUp={onCanvasPointerUp}
      onContextMenu={onContextMenu}
    >
      {/* Film grain + vignette — quality atmosphere */}
      <div className="canvas-grain" />
      <div className="canvas-vignette" />
      {/* Canvas-space layer */}
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
          wireAnim={wireAnim}
        />
      </div>

      {hasNoPanels && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-[12px] text-[#333333]">Ctrl+K to add a node, or right-click</span>
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

      {showAddPanel && (
        <AddPanel
          onClose={() => setShowAddPanel(false)}
          onImportBlueprint={() => { setShowAddPanel(false); setShowBlueprintImport(true); }}
        />
      )}

      {/* Alignment guides — rendered in canvas space */}
      {guides.length > 0 && (
        <div
          className="pointer-events-none absolute inset-0 overflow-visible"
          style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`, transformOrigin: "0 0", position: "absolute" }}
        >
          {guides.map((g, i) =>
            g.axis === "v" ? (
              <div
                key={i}
                className="absolute bg-red-500/60"
                style={{ left: g.pos, top: -9999, width: 1, height: 99999 }}
              />
            ) : (
              <div
                key={i}
                className="absolute bg-red-500/60"
                style={{ top: g.pos, left: -9999, height: 1, width: 99999 }}
              />
            ),
          )}
        </div>
      )}

      {/* Overlays */}
      {showMinimap && <MiniMap />}
      <ZoomBar />

      {/* Tweaks button — below topbar, above FAB */}
      <button
        type="button"
        onClick={() => setShowTweaks((v) => !v)}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute right-3 top-16 z-30 flex h-6 w-6 items-center justify-center rounded border border-[#2a2a2a] bg-[#111111]/90 text-[11px] text-[#555555] transition-colors duration-150 ease-out hover:border-[#404040] hover:text-[#888888]"
        title="Canvas tweaks"
      >
        ⚙
      </button>

      {/* Tweaks panel */}
      {showTweaks && <TweaksPanel onClose={() => setShowTweaks(false)} />}

      {/* Canvas dock — sits above Orkestra */}
      <CanvasDock />

      {/* Orkestra — bottom command bar */}
      <div onPointerDown={(e) => e.stopPropagation()}>
        <Orkestra onAdd={(type) => addPanel(type)} />
      </div>

      {/* Right-side FAB */}
      <div onPointerDown={(e) => e.stopPropagation()}>
        <CanvasFab onOpenAddPanel={() => setShowAddPanel(true)} />
      </div>
    </div>
  );
}
