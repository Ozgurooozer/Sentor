import { useRef, useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CANVAS_PANEL_MIN_H, CANVAS_PANEL_MIN_W } from "@/lib/constants";
import { Cancel01Icon, Maximize01Icon, Minimize01Icon, Pin02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useZoneRegistration, ZoneType } from "@/modules/input";
import { CanvasPanelContent } from "./CanvasPanelContent";
import { useCanvasStore } from "./canvasStore";
import { accentFor, GLOW_ALPHA } from "./nodeAccent";
import type { CanvasPanelNode, Viewport } from "./types";

const PANEL_ICONS: Record<string, string> = {
  terminal: ">_",
  editor: "{}",
  preview: "◻",
  "vault-home": "⌂",
  web: "⊕",
  chat: "□",
  canvas: "⊞",
  agent: "◎",
  instance: "◈",
  header: "◆",
  checklist: "✓",
  gallery: "⊞",
  input: "□",
  pipeline: "↯",
  codegraph: "⌬",
  sketch: "✏",
  note: "◧",
  tool: "⚡",
  filebrowser: "◫",
  pipe: "⇢",
};

const PANEL_LABELS: Record<string, string> = {
  terminal: "terminal",
  editor: "editor",
  preview: "preview",
  "vault-home": "vault",
  web: "web",
  chat: "sentor chat",
  canvas: "canvas",
  agent: "agent",
  instance: "instance",
  header: "header",
  checklist: "checklist",
  gallery: "gallery",
  input: "input",
  pipeline: "pipeline",
  codegraph: "codegraph",
  sketch: "sketch",
  note: "note",
  tool: "tool",
  filebrowser: "files",
  pipe: "pipe",
};


interface Props {
  panel: CanvasPanelNode;
  viewport: Viewport;
  /** Callback from InfiniteCanvas so it can suppress canvas-pan when dragging a panel */
  onDragStart(): void;
  onDragEnd(): void;
  onHover?(): void;
  onHoverEnd?(): void;
  /** Called when the user clicks the ⊕ connect button in the header. */
  onStartConnect?(): void;
  onPanelContextMenu?(screenX: number, screenY: number): void;
  children?: React.ReactNode;
}

export function CanvasPanel({ panel, viewport, onDragStart, onDragEnd, onHover, onHoverEnd, onStartConnect, onPanelContextMenu, children }: Props) {
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const removePanel = useCanvasStore((s) => s.removePanel);
  const bringToFront = useCanvasStore((s) => s.bringToFront);
  const togglePin = useCanvasStore((s) => s.togglePin);
  const toggleMinimized = useCanvasStore((s) => s.toggleMinimized);
  const connections = useCanvasStore((s) => s.connections);
  const selectedPanelIds = useCanvasStore((s) => s.selectedPanelIds);
  const selectPanel = useCanvasStore((s) => s.selectPanel);
  const isSelected = selectedPanelIds.includes(panel.id);

  const inWires  = connections.filter((c) => c.toPanel   === panel.id).length;
  const outWires = connections.filter((c) => c.fromPanel === panel.id).length;

  const ref = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(panel.title);

  useZoneRegistration(
    ref,
    panel.pinned ? ZoneType.PinnedPanel : ZoneType.Panel,
    { zIndex: panel.zIndex + 10 },
  );

  // ── Drag ────────────────────────────────────────────────────────────────────
  // Pinned panels drag in screen-space; canvas panels drag in canvas-space.
  const dragState = useRef<{
    startX: number; startY: number;
    origX: number; origY: number;
  } | null>(null);

  const onTitlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      bringToFront(panel.id);
      onDragStart();
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: panel.pinned ? (panel.screenX ?? 0) : panel.x,
        origY: panel.pinned ? (panel.screenY ?? 0) : panel.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [panel, bringToFront, onDragStart],
  );

  const onTitlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragState.current) return;
      const dx = e.clientX - dragState.current.startX;
      const dy = e.clientY - dragState.current.startY;
      if (panel.pinned) {
        // Screen-space: no scale factor
        updatePanel(panel.id, {
          screenX: dragState.current.origX + dx,
          screenY: dragState.current.origY + dy,
        });
      } else {
        // Canvas-space: divide by scale
        updatePanel(panel.id, {
          x: dragState.current.origX + dx / viewport.scale,
          y: dragState.current.origY + dy / viewport.scale,
        });
      }
    },
    [panel.id, panel.pinned, viewport.scale, updatePanel],
  );

  const onTitlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      dragState.current = null;
      onDragEnd();
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    },
    [onDragEnd],
  );

  // ── Resize ───────────────────────────────────────────────────────────────────
  const resizeState = useRef<{
    edge: string;
    startX: number; startY: number;
    origX: number; origY: number;
    origW: number; origH: number;
  } | null>(null);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, edge: string) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      bringToFront(panel.id);
      onDragStart();
      resizeState.current = {
        edge,
        startX: e.clientX, startY: e.clientY,
        origX: panel.pinned ? (panel.screenX ?? 0) : panel.x,
        origY: panel.pinned ? (panel.screenY ?? 0) : panel.y,
        origW: panel.width, origH: panel.height,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [panel, bringToFront, onDragStart],
  );

  const onResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = resizeState.current;
      if (!s) return;
      // Pinned panels resize in screen-space (scale = 1); canvas panels use viewport scale
      const scaleFactor = panel.pinned ? 1 : viewport.scale;
      const dx = (e.clientX - s.startX) / scaleFactor;
      const dy = (e.clientY - s.startY) / scaleFactor;
      let { x, y, w, h } = { x: s.origX, y: s.origY, w: s.origW, h: s.origH };

      if (s.edge.includes("e")) w = Math.max(CANVAS_PANEL_MIN_W, s.origW + dx);
      if (s.edge.includes("s")) h = Math.max(CANVAS_PANEL_MIN_H, s.origH + dy);
      if (s.edge.includes("w")) {
        const nw = Math.max(CANVAS_PANEL_MIN_W, s.origW - dx);
        x = s.origX + (s.origW - nw);
        w = nw;
      }
      if (s.edge.includes("n")) {
        const nh = Math.max(CANVAS_PANEL_MIN_H, s.origH - dy);
        y = s.origY + (s.origH - nh);
        h = nh;
      }

      const patch = panel.pinned
        ? { screenX: x, screenY: y, width: w, height: h }
        : { x, y, width: w, height: h };
      updatePanel(panel.id, patch);
    },
    [panel.id, panel.pinned, viewport.scale, updatePanel],
  );

  const onResizePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      resizeState.current = null;
      onDragEnd();
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    },
    [onDragEnd],
  );

  // Esc exits fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fullscreen]);

  const resizeHandle = (edge: string, cls: string) => (
    <div
      className={cn("absolute z-10", cls)}
      onPointerDown={(e) => onResizePointerDown(e, edge)}
      onPointerMove={onResizePointerMove}
      onPointerUp={onResizePointerUp}
    />
  );

  // Pinned panels render with position:fixed in screen-space (handled by InfiniteCanvas
  // which wraps them in a fixed overlay). Canvas panels use absolute position inside
  // the transform layer. The style here handles ONLY the panel's own geometry.
  // Minimized panels are hidden from canvas — shown in CanvasDock instead.
  if (panel.minimized) return null;

  // Blueprint-style accent: each panel type carries a distinct border colour
  // plus a barely-there glow so the canvas reads as a graph of typed nodes.
  // The header panel chooses its own colour via panel.meta.headerColor.
  const accent = accentFor(panel);

  const STATUS_DOT: Record<NonNullable<CanvasPanelNode["status"]>, string> = {
    idle: "#3a3a3a",
    running: "#4caf7d",
    error: "#ef5b5b",
    done: "#5b8def",
  };
  const statusColor = panel.status && panel.status !== "idle" ? STATUS_DOT[panel.status] : null;

  const baseStyle: React.CSSProperties = {
    borderColor: isSelected ? "#5b8def" : accent,
    boxShadow: `0 10px 32px -8px rgba(0,0,0,.55), 0 2px 8px rgba(0,0,0,.35), 0 0 14px ${isSelected ? "#5b8def" : accent}${GLOW_ALPHA}`,
    ["--cv-accent" as string]: accent,
  };

  const panelStyle: React.CSSProperties = fullscreen
    ? { position: "fixed", inset: 0, zIndex: 9999, ...baseStyle }
    : panel.pinned
      ? {
          position: "fixed",
          left: panel.screenX ?? 0,
          top: panel.screenY ?? 0,
          width: panel.width,
          height: panel.height,
          zIndex: 1000 + panel.zIndex,
          ...baseStyle,
        }
      : {
          position: "absolute",
          left: panel.x,
          top: panel.y,
          width: panel.width,
          height: panel.height,
          zIndex: panel.zIndex,
          ...baseStyle,
        };

  return (
    <div
      ref={ref}
      data-canvas-panel
      style={panelStyle}
      className={cn(
        "group canvas-node-card flex flex-col overflow-hidden rounded-[10px]",
        "border bg-[#111111] backdrop-blur-sm",
        "transition-[border-color,box-shadow,transform] duration-150",
        panel.pinned && "ring-1 ring-[#5b8def]/30",
      )}
      onPointerDownCapture={(e) => {
        bringToFront(panel.id);
        selectPanel(panel.id, e.shiftKey);
      }}
      onMouseEnter={onHover}
      onMouseLeave={onHoverEnd}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onPanelContextMenu?.(e.clientX, e.clientY); }}
    >
      {/* Title bar — drag handle; z-20 ensures it stays above content layers */}
      <div
        className="relative z-20 flex h-8 shrink-0 cursor-move select-none items-center gap-2 border-b border-[#2a2a2a] bg-[#111111] pl-4 pr-2"
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={onTitlePointerUp}
        onDoubleClick={() => setFullscreen((v) => !v)}
      >
        {/* Left accent stripe */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px] rounded-tl-lg"
          style={{ background: accent }}
        />
        <span className="text-[10px]" style={{ color: accent }}>{PANEL_ICONS[panel.type] ?? "□"}</span>
        {statusColor && (
          <span
            className="shrink-0 rounded-full"
            style={{
              width: 6, height: 6,
              background: statusColor,
              boxShadow: panel.status === "running" ? `0 0 6px ${statusColor}` : undefined,
            }}
            title={panel.status}
          />
        )}
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (titleDraft.trim()) updatePanel(panel.id, { title: titleDraft.trim() });
                setEditingTitle(false);
              } else if (e.key === "Escape") {
                setEditingTitle(false);
              }
            }}
            onBlur={() => {
              if (titleDraft.trim()) updatePanel(panel.id, { title: titleDraft.trim() });
              setEditingTitle(false);
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 bg-transparent text-[11px] font-medium text-[#f5f5f5] outline-none"
          />
        ) : (
          <span
            className="min-w-0 flex-1 truncate text-[11px] font-medium text-[#f5f5f5]"
            onDoubleClick={(e) => { e.stopPropagation(); setTitleDraft(panel.title); setEditingTitle(true); }}
          >
            {panel.title}
          </span>
        )}
        {/* Sub-label: shell, model, or other meta */}
        {(panel.meta?.shell != null || panel.meta?.model != null) && (
          <span className="shrink-0 font-mono text-[10px] text-[#555555]">
            {String(panel.meta.shell ?? panel.meta.model ?? "")}
          </span>
        )}
        {/* Wire count badge — only shown when at least one wire exists */}
        {(inWires > 0 || outWires > 0) && (
          <span className="shrink-0 font-mono text-[9.5px] text-[#4a4845] tabular-nums">
            {inWires > 0 && <span title={`${inWires} input wire${inWires > 1 ? "s" : ""}`}>{inWires}↓</span>}
            {inWires > 0 && outWires > 0 && <span className="mx-0.5 opacity-40">·</span>}
            {outWires > 0 && <span title={`${outWires} output wire${outWires > 1 ? "s" : ""}`}>{outWires}↑</span>}
          </span>
        )}
        {/* Snapshot toggle — freezes the panel's current outputData so
            downstream wires keep reading the same value while the producer
            continues to churn. Only meaningful when the panel actually
            produces wire data. */}
        {(panel.meta?.outputData != null || panel.meta?.snapshotData != null) && (
          <button
            type="button"
            title={
              panel.meta?.snapshotData != null
                ? "Snapshot ON — downstream wires read the frozen value. Click to thaw."
                : "Snapshot OFF — wires follow live outputData. Click to freeze the current value."
            }
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              const live = panel.meta?.outputData;
              const snap = panel.meta?.snapshotData;
              const next = { ...panel.meta } as Record<string, unknown>;
              if (snap != null) {
                delete next.snapshotData;
              } else if (live != null) {
                next.snapshotData = live;
              }
              updatePanel(panel.id, { meta: next });
            }}
            className={cn(
              "flex size-5 items-center justify-center rounded text-[11px] leading-none transition-colors",
              panel.meta?.snapshotData != null
                ? "bg-[#5b8def]/20 text-[#5b8def]"
                : "text-[#555555] hover:bg-[#2a2a2a] hover:text-[#888888]",
            )}
          >
            ❄
          </button>
        )}
        {/* Enter sub-canvas button — only for canvas-type panels */}
        {panel.type === "canvas" && (
          <button
            type="button"
            title="Enter sub-canvas (double-click to enter, Esc to exit)"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setFullscreen(true); }}
            className={cn(
              "flex size-5 items-center justify-center rounded transition-colors",
              fullscreen
                ? "bg-[#5b8def]/20 text-[#5b8def]"
                : "text-[#555555] hover:bg-[#2a2a2a] hover:text-[#5b8def]",
            )}
          >
            <span className="text-[10px] leading-none">⤵</span>
          </button>
        )}
        {/* Connect button — hover-only; starts a wire from this node's output */}
        {onStartConnect && (
          <button
            type="button"
            title="Connect — draw a wire from this node's output"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onStartConnect(); }}
            className="flex size-5 items-center justify-center rounded text-[#5b8def] opacity-0 transition-[opacity,color] duration-150 ease-out group-hover:opacity-100 hover:bg-[#1a2a3a]"
          >
            <span className="text-[11px] leading-none">⊕</span>
          </button>
        )}
        {/* Controls */}
        <button
          type="button"
          title={panel.pinned ? "Unpin — return to canvas" : "Pin — keep visible above canvas"}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={() => togglePin(panel.id)}
          className={cn(
            "flex size-5 items-center justify-center rounded transition-colors",
            panel.pinned
              ? "bg-[#5b8def]/20 text-[#5b8def]"
              : "text-[#555555] hover:bg-[#2a2a2a] hover:text-[#888888]",
          )}
        >
          <HugeiconsIcon icon={Pin02Icon} size={11} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          title="Minimize to dock"
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); toggleMinimized(panel.id); }}
          className="flex size-5 items-center justify-center rounded text-[#555555] transition-colors hover:bg-[#2a2a2a] hover:text-[#888888]"
        >
          <HugeiconsIcon icon={Minimize01Icon} size={11} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setFullscreen((v) => !v); }}
          onDoubleClick={(e) => e.stopPropagation()}
          className="flex size-5 items-center justify-center rounded text-[#555555] transition-colors hover:bg-[#2a2a2a] hover:text-[#888888]"
        >
          <HugeiconsIcon icon={Maximize01Icon} size={11} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          title="Close"
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={() => removePanel(panel.id)}
          className="flex size-5 items-center justify-center rounded text-[#555555] transition-colors hover:bg-[#2a2a2a] hover:text-red-400"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={1.75} />
        </button>
      </div>

      {/* Content — stop propagation so drawing/typing doesn't pan the canvas */}
      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {children ?? <CanvasPanelContent panel={panel} />}
      </div>

      {/* Footer — type dot + label + short ID */}
      <div className="canvas-node-foot shrink-0" onPointerDown={(e) => e.stopPropagation()}>
        <div className="cv-dot" style={{ ["--cv-accent" as string]: accent }} />
        <span>{PANEL_LABELS[panel.type] ?? panel.type}</span>
        <span className="ml-auto font-mono text-[9px]" style={{ color: "#3a3a3a" }}>
          {panel.id.slice(-4).toUpperCase()}
        </span>
      </div>

      {/* Resize handles */}
      {!fullscreen && (
        <>
          {resizeHandle("n", "inset-x-2 top-0 h-1 cursor-n-resize")}
          {resizeHandle("s", "inset-x-2 bottom-0 h-1 cursor-s-resize")}
          {resizeHandle("w", "inset-y-2 left-0 w-1 cursor-w-resize")}
          {resizeHandle("e", "inset-y-2 right-0 w-1 cursor-e-resize")}
          {resizeHandle("nw", "left-0 top-0 h-3 w-3 cursor-nw-resize")}
          {resizeHandle("ne", "right-0 top-0 h-3 w-3 cursor-ne-resize")}
          {resizeHandle("sw", "left-0 bottom-0 h-3 w-3 cursor-sw-resize")}
          {resizeHandle("se", "right-0 bottom-0 h-3 w-3 cursor-se-resize")}
        </>
      )}
    </div>
  );
}
