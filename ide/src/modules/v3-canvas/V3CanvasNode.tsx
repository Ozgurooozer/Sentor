import { memo, useRef, useCallback, useState } from "react";
import { CANVAS_PANEL_MIN_H, CANVAS_PANEL_MIN_W } from "@/lib/constants";
import { useCanvasStore } from "@/modules/canvas/canvasStore";
import { accentFor } from "@/modules/canvas/nodeAccent";
import { CanvasPanelContent } from "@/modules/canvas/CanvasPanelContent";
import type { CanvasPanelNode } from "@/modules/canvas/types";

// ── Icon / label maps ────────────────────────────────────────────────────────
const ICONS: Record<string, string> = {
  terminal: ">_", editor: "{}", preview: "◻", "vault-home": "⌂",
  web: "⊕", chat: "□", canvas: "⊞", agent: "◎", instance: "◈",
  header: "◆", checklist: "✓", gallery: "⊞", input: "□",
  pipeline: "↯", codegraph: "⌬", sketch: "✏", note: "◧",
  tool: "⚡", filebrowser: "◫", pipe: "⇢", stickman: "☺",
  "canvas-3d": "⬡",
  logs: "▤",
};

const LABELS: Record<string, string> = {
  terminal: "terminal", editor: "editor", preview: "preview",
  "vault-home": "vault", web: "web", chat: "chat", canvas: "canvas",
  agent: "agent", instance: "instance", header: "header",
  checklist: "checklist", gallery: "gallery", input: "input",
  pipeline: "pipeline", codegraph: "codegraph", sketch: "sketch",
  note: "note", tool: "tool", filebrowser: "files", pipe: "pipe",
  stickman: "sentorbot",
  "canvas-3d": "3d canvas",
  logs: "logs",
};

const STATUS_COLOR: Record<string, string> = {
  running: "#4caf7d", error: "#ef5b5b", done: "#5b8def",
};

interface StoreOverrides {
  updatePanel?: (id: string, patch: Partial<CanvasPanelNode>) => void;
  removePanel?: (id: string) => void;
  bringToFront?: (id: string) => void;
  selectPanel?: (id: string, add?: boolean) => void;
  isSelected?: boolean;
}

interface Props {
  panel: CanvasPanelNode;
  viewportScale: number;
  onDragStart(): void;
  onDragEnd(): void;
  onHover?(): void;
  onHoverEnd?(): void;
  onStartConnect?(): void;
  onPanelContextMenu?(sx: number, sy: number): void;
  storeOverrides?: StoreOverrides;
}

export const V3CanvasNode = memo(function V3CanvasNode({
  panel, viewportScale, onDragStart, onDragEnd,
  onHover, onHoverEnd, onStartConnect, onPanelContextMenu,
  storeOverrides,
}: Props) {
  const _updatePanel    = useCanvasStore((s) => s.updatePanel);
  const _removePanel    = useCanvasStore((s) => s.removePanel);
  const _bringToFront   = useCanvasStore((s) => s.bringToFront);
  const togglePin       = useCanvasStore((s) => s.togglePin);
  const toggleMinimized = useCanvasStore((s) => s.toggleMinimized);
  // Stable per-panel selectors — only re-render when THIS panel's data changes
  const _isSelected  = useCanvasStore(useCallback((s) => s.selectedPanelIds.includes(panel.id), [panel.id]));
  const inWires      = useCanvasStore(useCallback((s) => s.connections.filter((c) => c.toPanel   === panel.id).length, [panel.id]));
  const outWires     = useCanvasStore(useCallback((s) => s.connections.filter((c) => c.fromPanel === panel.id).length, [panel.id]));
  const _selectPanel = useCanvasStore((s) => s.selectPanel);
  const moveSelectedExcept = useCanvasStore((s) => s.moveSelectedExcept);

  const updatePanel  = storeOverrides?.updatePanel  ?? _updatePanel;
  const removePanel  = storeOverrides?.removePanel  ?? _removePanel;
  const bringToFront = storeOverrides?.bringToFront ?? _bringToFront;
  const selectPanel  = storeOverrides?.selectPanel  ?? _selectPanel;
  const isSelected   = storeOverrides?.isSelected   ?? _isSelected;

  const accent = accentFor(panel);
  const statusColor = panel.status && panel.status !== "idle"
    ? STATUS_COLOR[panel.status] ?? null : null;

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft]     = useState(panel.title);
  const [hovered, setHovered]           = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // ── Drag ─────────────────────────────────────────────────────────────────
  const dragState = useRef<{
    startX: number; startY: number;
    origX: number;  origY: number;
    prevDxCanvas: number; prevDyCanvas: number;
  } | null>(null);

  const onTitlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || editingTitle) return;
    e.stopPropagation();
    bringToFront(panel.id);
    selectPanel(panel.id, e.shiftKey);
    onDragStart();
    dragState.current = {
      startX: e.clientX, startY: e.clientY,
      origX: panel.pinned ? (panel.screenX ?? 0) : panel.x,
      origY: panel.pinned ? (panel.screenY ?? 0) : panel.y,
      prevDxCanvas: 0,
      prevDyCanvas: 0,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [panel, bringToFront, selectPanel, onDragStart, editingTitle]);

  const onTitlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    if (panel.pinned) {
      updatePanel(panel.id, { screenX: dragState.current.origX + dx, screenY: dragState.current.origY + dy });
    } else {
      updatePanel(panel.id, {
        x: dragState.current.origX + dx / viewportScale,
        y: dragState.current.origY + dy / viewportScale,
      });
      // Move all other selected panels by the same delta increment
      const dxCanvas = dx / viewportScale;
      const dyCanvas = dy / viewportScale;
      const ddx = dxCanvas - dragState.current.prevDxCanvas;
      const ddy = dyCanvas - dragState.current.prevDyCanvas;
      if (ddx !== 0 || ddy !== 0) {
        moveSelectedExcept(panel.id, ddx, ddy);
      }
      dragState.current.prevDxCanvas = dxCanvas;
      dragState.current.prevDyCanvas = dyCanvas;
    }
  }, [panel.id, panel.pinned, viewportScale, updatePanel, moveSelectedExcept]);

  const onTitlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragState.current = null;
    onDragEnd();
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }, [onDragEnd]);

  // ── Resize ───────────────────────────────────────────────────────────────
  const resizeState = useRef<{
    edge: string; startX: number; startY: number;
    origX: number; origY: number; origW: number; origH: number;
  } | null>(null);

  const onResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, edge: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    bringToFront(panel.id);
    onDragStart();
    resizeState.current = {
      edge, startX: e.clientX, startY: e.clientY,
      origX: panel.pinned ? (panel.screenX ?? 0) : panel.x,
      origY: panel.pinned ? (panel.screenY ?? 0) : panel.y,
      origW: panel.width, origH: panel.height,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [panel, bringToFront, onDragStart]);

  const onResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const s = resizeState.current;
    if (!s) return;
    const sf = panel.pinned ? 1 : viewportScale;
    const dx = (e.clientX - s.startX) / sf;
    const dy = (e.clientY - s.startY) / sf;
    let { x, y, w, h } = { x: s.origX, y: s.origY, w: s.origW, h: s.origH };
    if (s.edge.includes("e")) w = Math.max(CANVAS_PANEL_MIN_W, s.origW + dx);
    if (s.edge.includes("s")) h = Math.max(CANVAS_PANEL_MIN_H, s.origH + dy);
    if (s.edge.includes("w")) { const nw = Math.max(CANVAS_PANEL_MIN_W, s.origW - dx); x = s.origX + (s.origW - nw); w = nw; }
    if (s.edge.includes("n")) { const nh = Math.max(CANVAS_PANEL_MIN_H, s.origH - dy); y = s.origY + (s.origH - nh); h = nh; }
    const patch = panel.pinned ? { screenX: x, screenY: y, width: w, height: h } : { x, y, width: w, height: h };
    updatePanel(panel.id, patch);
  }, [panel.id, panel.pinned, viewportScale, updatePanel]);

  const onResizePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    resizeState.current = null;
    onDragEnd();
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }, [onDragEnd]);

  if (panel.minimized) return null;

  // ── Styles ────────────────────────────────────────────────────────────────
  const panelStyle: React.CSSProperties = panel.pinned
    ? { position: "fixed", left: panel.screenX ?? 0, top: panel.screenY ?? 0, width: panel.width, height: panel.height, zIndex: 1000 + panel.zIndex }
    : { position: "absolute", left: panel.x, top: panel.y, width: panel.width, height: panel.height, zIndex: panel.zIndex };

  const glassStyle: React.CSSProperties = {
    background: "rgba(8, 8, 14, 0.72)",
    backdropFilter: "blur(24px) saturate(160%)",
    WebkitBackdropFilter: "blur(24px) saturate(160%)",
    border: isSelected
      ? `1px solid ${accent}88`
      : hovered
        ? "1px solid rgba(255,255,255,0.10)"
        : "1px solid rgba(255,255,255,0.05)",
    borderTop: isSelected
      ? `1.5px solid ${accent}cc`
      : hovered
        ? `1.5px solid ${accent}99`
        : `1.5px solid ${accent}55`,
    borderRadius: 12,
    transform: hovered && !dragState.current ? "translateY(-1.5px)" : undefined,
    transition: "transform 150ms ease-out, border-color 150ms ease-out, border-top-color 150ms ease-out",
    ["--cv-accent" as string]: accent,
  };

  const rh = (edge: string, cls: string) => (
    <div
      className={`absolute z-10 ${cls}`}
      onPointerDown={(e) => onResizePointerDown(e, edge)}
      onPointerMove={onResizePointerMove}
      onPointerUp={onResizePointerUp}
    />
  );

  return (
    <div
      ref={ref}
      data-canvas-panel
      style={{ ...panelStyle, ...glassStyle }}
      className="v3-canvas-node group flex flex-col overflow-hidden"
      onPointerDownCapture={(e) => { bringToFront(panel.id); selectPanel(panel.id, e.shiftKey); }}
      onMouseEnter={() => { setHovered(true); onHover?.(); }}
      onMouseLeave={() => { setHovered(false); onHoverEnd?.(); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onPanelContextMenu?.(e.clientX, e.clientY); }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="relative z-20 flex h-[34px] shrink-0 cursor-move select-none items-center gap-2 px-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(255,255,255,0.02)" }}
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={onTitlePointerUp}
      >
        {/* Type icon */}
        <span className="shrink-0 text-[10px]" style={{ color: accent, fontVariantNumeric: "tabular-nums" }}>
          {ICONS[panel.type] ?? "□"}
        </span>

        {/* Status dot */}
        {statusColor && (
          <span className="h-[5px] w-[5px] shrink-0 rounded-full"
            style={{ background: statusColor, boxShadow: panel.status === "running" ? `0 0 5px ${statusColor}` : undefined }} />
        )}

        {/* Title */}
        {editingTitle ? (
          <input autoFocus value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { if (titleDraft.trim()) updatePanel(panel.id, { title: titleDraft.trim() }); setEditingTitle(false); }
              else if (e.key === "Escape") setEditingTitle(false);
            }}
            onBlur={() => { if (titleDraft.trim()) updatePanel(panel.id, { title: titleDraft.trim() }); setEditingTitle(false); }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 bg-transparent text-[11px] font-medium outline-none"
            style={{ color: "#e8e8ec", fontFamily: '"Segoe UI Variable","Segoe UI",system-ui,sans-serif', caretColor: accent }}
          />
        ) : (
          <span
            className="min-w-0 flex-1 truncate text-[11px] font-medium"
            style={{ color: "#c8c8d0", fontFamily: '"Segoe UI Variable","Segoe UI",system-ui,sans-serif' }}
            onDoubleClick={(e) => { e.stopPropagation(); setTitleDraft(panel.title); setEditingTitle(true); }}
          >
            {panel.title}
          </span>
        )}

        {/* Wire count */}
        {(inWires > 0 || outWires > 0) && (
          <span className="shrink-0 font-mono text-[9px]" style={{ color: "rgba(255,255,255,0.2)" }}>
            {inWires > 0 && `${inWires}↓`}{inWires > 0 && outWires > 0 && "·"}{outWires > 0 && `${outWires}↑`}
          </span>
        )}

        {/* Connect (hover-only) */}
        {onStartConnect && (
          <button type="button" title="Connect" onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onStartConnect(); }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            style={{ color: accent }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6 2v8M2 6h8"/></svg>
          </button>
        )}

        {/* Pin */}
        <button type="button" title={panel.pinned ? "Unpin" : "Pin"} onPointerDown={(e) => e.stopPropagation()}
          onClick={() => togglePin(panel.id)}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors duration-150"
          style={{ color: panel.pinned ? accent : "rgba(255,255,255,0.2)" }}>
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M9 1L11 3 6 8 4 11 1 8 4 6Z"/><path d="M8 4L4 8"/></svg>
        </button>

        {/* Minimize */}
        <button type="button" title="Minimize" onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); toggleMinimized(panel.id); }}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors duration-150 hover:bg-white/5"
          style={{ color: "rgba(255,255,255,0.2)" }}>
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 6h8"/></svg>
        </button>

        {/* Close */}
        <button type="button" title="Close" onPointerDown={(e) => e.stopPropagation()}
          onClick={() => removePanel(panel.id)}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors duration-150 hover:bg-red-500/10"
          style={{ color: "rgba(255,255,255,0.2)" }}>
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M1 1l8 8M9 1L1 9"/></svg>
        </button>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="relative min-h-0 flex-1 overflow-hidden" onPointerDown={(e) => e.stopPropagation()}>
        <CanvasPanelContent panel={panel} />
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div
        className="v3-canvas-node-footer flex h-[18px] shrink-0 items-center gap-1.5 px-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.03)", background: "rgba(0,0,0,0.12)" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: accent }} />
        <span className="text-[9px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.18)", fontFamily: "system-ui" }}>
          {LABELS[panel.type] ?? panel.type}
        </span>
        <span className="ml-auto font-mono text-[8px]" style={{ color: "rgba(255,255,255,0.10)" }}>
          {panel.id.slice(-4).toUpperCase()}
        </span>
      </div>

      {/* ── Resize handles ─────────────────────────────────────────────────── */}
      {rh("n",  "inset-x-2 top-0 h-1 cursor-n-resize")}
      {rh("s",  "inset-x-2 bottom-0 h-1 cursor-s-resize")}
      {rh("w",  "inset-y-2 left-0 w-1 cursor-w-resize")}
      {rh("e",  "inset-y-2 right-0 w-1 cursor-e-resize")}
      {rh("nw", "left-0 top-0 h-3 w-3 cursor-nw-resize")}
      {rh("ne", "right-0 top-0 h-3 w-3 cursor-ne-resize")}
      {rh("sw", "left-0 bottom-0 h-3 w-3 cursor-sw-resize")}
      {rh("se", "right-0 bottom-0 h-3 w-3 cursor-se-resize")}
    </div>
  );
});
