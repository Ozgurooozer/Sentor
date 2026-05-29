/**
 * SubCanvasContent — renders a canvas-type panel's interior. Has its own
 * pan/zoom viewport and a list of child panels stored in the parent's
 * `children[]`. Wheel/pan events are stopped from bubbling so the outer
 * InfiniteCanvas isn't moved at the same time.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CANVAS_MAX_SCALE, CANVAS_MIN_SCALE, CANVAS_ZOOM_STEP } from "@/lib/constants";
import { CanvasPanelContent } from "./CanvasPanelContent";
import { useCanvasStore } from "./canvasStore";
import { PanelMenu } from "./PanelMenu";
import type { CanvasPanelNode } from "./types";
import { useAgentsStore } from "@/modules/ai/store/agentsStore";
import { useChatStore } from "@/modules/ai/store/chatStore";

const DOT_GRID_STYLE: React.CSSProperties = {
  backgroundImage:
    "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
  backgroundSize: "16px 16px",
};

interface Props {
  panel: CanvasPanelNode;
}

function useExportToVault(panel: CanvasPanelNode) {
  const [exporting, setExporting] = useState(false);

  const trigger = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const vaultExporter = useAgentsStore.getState().all().find((a) => a.id === "builtin:vault-exporter");
      if (!vaultExporter) return;

      // Switch active agent to vault-exporter and pre-fill the chat with the canvas context.
      useAgentsStore.getState().setActiveId("builtin:vault-exporter");
      const panelSummary = (panel.children ?? [])
        .map((c) => `- ${c.type}: ${c.title}`)
        .join("\n");
      const prompt = `Export to Vault — export this sub-canvas to a vault page.\n\nCanvas title: ${panel.title}\nPanels:\n${panelSummary || "(empty canvas)"}`;
      useChatStore.getState().focusInput(prompt);
    } finally {
      setExporting(false);
    }
  }, [exporting, panel]);

  return { trigger, exporting };
}

export function SubCanvasContent({ panel }: Props) {
  const vp = panel.viewport ?? { x: 0, y: 0, scale: 1 };
  const children = panel.children ?? [];
  const setSubViewport = useCanvasStore((s) => s.setSubViewport);
  const updateChildPanel = useCanvasStore((s) => s.updateChildPanel);
  const bringChildToFront = useCanvasStore((s) => s.bringChildToFront);
  const removeChildPanel = useCanvasStore((s) => s.removeChildPanel);

  const [panelDragging, setPanelDragging] = useState(false);
  const { trigger: exportToVault, exporting } = useExportToVault(panel);

  const panState = useRef<{
    active: boolean;
    startX: number; startY: number;
    origVX: number; origVY: number;
  }>({ active: false, startX: 0, startY: 0, origVX: 0, origVY: 0 });

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || panelDragging) return;
      e.stopPropagation();
      panState.current = {
        active: true,
        startX: e.clientX, startY: e.clientY,
        origVX: vp.x, origVY: vp.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [vp.x, vp.y, panelDragging],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!panState.current.active) return;
      e.stopPropagation();
      const dx = e.clientX - panState.current.startX;
      const dy = e.clientY - panState.current.startY;
      setSubViewport(panel.id, { x: panState.current.origVX + dx, y: panState.current.origVY + dy });
    },
    [panel.id, setSubViewport],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      panState.current.active = false;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    },
    [],
  );

  // Native wheel listener — React's onWheel is passive and can't preventDefault.
  const subRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = subRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const factor = e.deltaY < 0 ? CANVAS_ZOOM_STEP : 1 / CANVAS_ZOOM_STEP;
      // Read the latest viewport directly from the store so the listener doesn't
      // need to be re-bound whenever vp changes.
      const cur = useCanvasStore.getState().panels.find((p) => p.id === panel.id)?.viewport
        ?? { x: 0, y: 0, scale: 1 };
      const nextScale = Math.min(CANVAS_MAX_SCALE, Math.max(CANVAS_MIN_SCALE, cur.scale * factor));
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const nextX = cx - (cx - cur.x) * (nextScale / cur.scale);
      const nextY = cy - (cy - cur.y) * (nextScale / cur.scale);
      useCanvasStore.getState().setSubViewport(panel.id, { scale: nextScale, x: nextX, y: nextY });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [panel.id]);

  // Adapter — child panels use the regular CanvasPanel component but the
  // store mutations have to be scoped to this sub-canvas's children[] array.
  // We achieve this by patching the global store actions via a wrapper:
  // CanvasPanel reads/writes through useCanvasStore directly, so for child
  // panels we instead create a thin shim by passing custom callbacks.
  // For now we render CanvasPanel and override its updates after the fact
  // by intercepting through React: the cleanest path is a small wrapper.
  return (
    <div
      ref={subRef}
      className="relative h-full w-full overflow-hidden"
      style={DOT_GRID_STYLE}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.scale})`,
          transformOrigin: "0 0",
        }}
      >
        {children.map((child) => (
          <SubChildPanel
            key={child.id}
            parentId={panel.id}
            child={child}
            viewport={vp}
            onDragStart={() => setPanelDragging(true)}
            onDragEnd={() => setPanelDragging(false)}
            updateChild={updateChildPanel}
            bringChildToFront={bringChildToFront}
            removeChild={removeChildPanel}
          />
        ))}
      </div>

      {children.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.12)" }}>press + to add nodes</span>
        </div>
      )}

      {/* Bottom toolbar */}
      <div className="pointer-events-none absolute inset-0 z-20">
        <div
          className="pointer-events-auto absolute bottom-3 left-3 flex items-center gap-1.5"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Glass Add button */}
          <PanelMenu parentId={panel.id} variant="compact" />
        </div>
        <div
          className="pointer-events-auto absolute bottom-3 right-3"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            title="Export this sub-canvas to a vault HTML page via Vault-Exporter"
            onClick={() => void exportToVault()}
            disabled={exporting}
            className="flex h-6 items-center gap-1.5 rounded border border-[#2a2a2a] bg-[#0a0a0a]/90 px-2 font-mono text-[9px] text-[#888] transition-colors hover:border-[#c8f560]/50 hover:text-[#c8f560] disabled:opacity-40"
          >
            <span>{exporting ? "…" : "◈"}</span>
            Export to Vault
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Wrapper around CanvasPanel that re-routes the global store mutations
 * (updatePanel / bringToFront / removePanel) to the child-scoped equivalents.
 * Implementation note: CanvasPanel pulls actions from the store directly, so
 * the simplest correct approach is to mirror its visual contract here with
 * a child-aware copy. To avoid duplication we use a lightweight inline panel
 * dedicated to sub-canvas children.
 */
function SubChildPanel({
  parentId,
  child,
  viewport,
  onDragStart,
  onDragEnd,
  updateChild,
  bringChildToFront,
  removeChild,
}: {
  parentId: string;
  child: CanvasPanelNode;
  viewport: { x: number; y: number; scale: number };
  onDragStart(): void;
  onDragEnd(): void;
  updateChild: (parentId: string, childId: string, patch: Partial<CanvasPanelNode>) => void;
  bringChildToFront: (parentId: string, childId: string) => void;
  removeChild: (parentId: string, childId: string) => void;
}) {
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const onTitlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    bringChildToFront(parentId, child.id);
    onDragStart();
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: child.x, origY: child.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onTitlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    e.stopPropagation();
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    updateChild(parentId, child.id, {
      x: dragState.current.origX + dx / viewport.scale,
      y: dragState.current.origY + dy / viewport.scale,
    });
  };

  const onTitlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragState.current = null;
    onDragEnd();
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      style={{
        position: "absolute",
        left: child.x,
        top: child.y,
        width: child.width,
        height: child.height,
        zIndex: child.zIndex,
      }}
      className="flex flex-col overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#0a0a0a]/90 backdrop-blur-md"
      onPointerDown={() => bringChildToFront(parentId, child.id)}
    >
      <div
        className="flex h-6 shrink-0 cursor-move select-none items-center gap-2 border-b border-[#2a2a2a] bg-[#222222] px-2"
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={onTitlePointerUp}
      >
        <span className="min-w-0 flex-1 truncate text-[10px] text-[#888888]">{child.title}</span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => removeChild(parentId, child.id)}
          className="flex size-4 items-center justify-center rounded text-[#555555] hover:bg-[#2a2a2a] hover:text-red-400"
        >
          <span className="text-[9px]">×</span>
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <CanvasPanelContent panel={child} />
      </div>
    </div>
  );
}
