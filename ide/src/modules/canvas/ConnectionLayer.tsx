/**
 * ConnectionLayer — SVG overlay rendered inside the canvas transform div.
 * Draws Bezier edges between panel ports, handles drag-to-connect, and
 * allows deleting connections by clicking the midpoint × button.
 *
 * All coordinates are in canvas space (same coord system as CanvasPanelNode).
 */
import { useCallback, useEffect, useState } from "react";
import type {
  CanvasPanelNode,
  Connection,
  ConnectionKind,
  PortSide,
  Viewport,
} from "./types";
import { useCanvasStore } from "./canvasStore";

const WIRE_COLOR: Record<ConnectionKind, string> = {
  data:    "#5b8def", // blue — explicit value wire
  context: "#9b72ef", // purple — silent auto-context
  trigger: "#4db89a", // green — execution signal
};

function wireColor(kind: Connection["kind"]): string {
  return WIRE_COLOR[kind ?? "data"];
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

function portPoint(panel: CanvasPanelNode, side: PortSide): { x: number; y: number } {
  const cx = panel.x + panel.width / 2;
  const cy = panel.y + panel.height / 2;
  switch (side) {
    case "top":    return { x: cx, y: panel.y };
    case "bottom": return { x: cx, y: panel.y + panel.height };
    case "left":   return { x: panel.x, y: cy };
    case "right":  return { x: panel.x + panel.width, y: cy };
  }
}

/** Cubic Bezier control-point offset — scales with distance for smooth arcs. */
function cpOffset(from: { x: number; y: number }, to: { x: number; y: number }, side: PortSide): { dx: number; dy: number } {
  const dist = Math.max(60, Math.hypot(to.x - from.x, to.y - from.y) * 0.45);
  switch (side) {
    case "right":  return { dx: dist, dy: 0 };
    case "left":   return { dx: -dist, dy: 0 };
    case "bottom": return { dx: 0, dy: dist };
    case "top":    return { dx: 0, dy: -dist };
  }
}

function bezierPath(
  from: { x: number; y: number },
  fromSide: PortSide,
  to: { x: number; y: number },
  toSide: PortSide,
): string {
  const { dx: fdx, dy: fdy } = cpOffset(from, to, fromSide);
  const { dx: tdx, dy: tdy } = cpOffset(to, from, toSide);
  return `M ${from.x} ${from.y} C ${from.x + fdx} ${from.y + fdy}, ${to.x + tdx} ${to.y + tdy}, ${to.x} ${to.y}`;
}

/** Midpoint of the cubic Bezier at t=0.5 (de Casteljau). */
function midpoint(
  from: { x: number; y: number },
  fromSide: PortSide,
  to: { x: number; y: number },
  toSide: PortSide,
): { x: number; y: number } {
  const { dx: fdx, dy: fdy } = cpOffset(from, to, fromSide);
  const { dx: tdx, dy: tdy } = cpOffset(to, from, toSide);
  const cp1x = from.x + fdx; const cp1y = from.y + fdy;
  const cp2x = to.x + tdx;   const cp2y = to.y + tdy;
  const t = 0.5;
  const mt = 1 - t;
  return {
    x: mt*mt*mt*from.x + 3*mt*mt*t*cp1x + 3*mt*t*t*cp2x + t*t*t*to.x,
    y: mt*mt*mt*from.y + 3*mt*mt*t*cp1y + 3*mt*t*t*cp2y + t*t*t*to.y,
  };
}

/** Opposite side — used to auto-pick the target port when dragging. */
function oppositeSide(side: PortSide): PortSide {
  switch (side) {
    case "top":    return "bottom";
    case "bottom": return "top";
    case "left":   return "right";
    case "right":  return "left";
  }
}


// ── Pending connection state ─────────────────────────────────────────────────

export interface PendingConn {
  fromPanel: string;
  fromSide: PortSide;
  cursorX: number;
  cursorY: number;
}

// ── Port dot ─────────────────────────────────────────────────────────────────

const PORT_SIDES: PortSide[] = ["top", "right", "bottom", "left"];

function PortDots({
  panel,
  pending,
  onStartDrag,
  onDrop,
}: {
  panel: CanvasPanelNode;
  pending: PendingConn | null;
  onStartDrag: (panelId: string, side: PortSide, e: React.PointerEvent) => void;
  onDrop: (panelId: string, side: PortSide) => void;
}) {
  const isTarget = pending && pending.fromPanel !== panel.id;
  return (
    <>
      {PORT_SIDES.map((side) => {
        const pt = portPoint(panel, side);
        return (
          <circle
            key={side}
            cx={pt.x}
            cy={pt.y}
            r={5}
            className={
              isTarget
                ? "fill-[#5b8def] stroke-[#5b8def]/40 stroke-2 cursor-crosshair"
                : "fill-[#2a2a2a] stroke-[#5b8def] stroke-[1.5] cursor-crosshair hover:fill-[#5b8def]"
            }
            style={{ transition: "fill 100ms" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onStartDrag(panel.id, side, e);
            }}
            onPointerUp={(e) => {
              if (isTarget) {
                e.stopPropagation();
                onDrop(panel.id, side);
              }
            }}
          />
        );
      })}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  panels: CanvasPanelNode[];
  connections: Connection[];
  viewport: Viewport;
  /** Bounding rect of the canvas container, used to convert clientXY → canvas space. */
  canvasRect: DOMRect | null;
  pending: PendingConn | null;
  onPendingChange: (p: PendingConn | null) => void;
}

export function ConnectionLayer({ panels, connections, viewport, canvasRect, pending, onPendingChange }: Props) {
  const addConnection = useCanvasStore((s) => s.addConnection);
  const removeConnection = useCanvasStore((s) => s.removeConnection);
  const updateConnectionKind = useCanvasStore((s) => s.updateConnectionKind);
  const updateConnectionCharLimit = useCanvasStore(
    (s) => s.updateConnectionCharLimit,
  );

  /** When a new wire is dropped, surface a kind picker at its midpoint
   * (data / context / trigger). Auto-dismisses on outside click or Esc. */
  const [kindPicker, setKindPicker] = useState<{
    connId: string;
    x: number;
    y: number;
  } | null>(null);

  /** Char-limit popover for a single connection. Opened via the gear button
   * next to a wire's midpoint; closes on Esc or background click. */
  const [limitEditor, setLimitEditor] = useState<{
    connId: string;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!kindPicker && !limitEditor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setKindPicker(null);
        setLimitEditor(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kindPicker, limitEditor]);

  const activeLimitConn = limitEditor
    ? connections.find((c) => c.id === limitEditor.connId)
    : null;

  const panelMap = new Map(panels.map((p) => [p.id, p]));

  const toCanvas = useCallback(
    (clientX: number, clientY: number) => {
      if (!canvasRect) return { x: 0, y: 0 };
      return {
        x: (clientX - canvasRect.left - viewport.x) / viewport.scale,
        y: (clientY - canvasRect.top - viewport.y) / viewport.scale,
      };
    },
    [canvasRect, viewport],
  );

  const handleStartDrag = useCallback(
    (panelId: string, side: PortSide, e: React.PointerEvent) => {
      const pos = toCanvas(e.clientX, e.clientY);
      onPendingChange({ fromPanel: panelId, fromSide: side, cursorX: pos.x, cursorY: pos.y });
    },
    [toCanvas, onPendingChange],
  );

  const handleDrop = useCallback(
    (toPanelId: string, toSide: PortSide) => {
      if (!pending || pending.fromPanel === toPanelId) {
        onPendingChange(null);
        return;
      }
      const fp = panelMap.get(pending.fromPanel);
      const tp = panelMap.get(toPanelId);
      const connId = addConnection(
        pending.fromPanel,
        pending.fromSide,
        toPanelId,
        toSide,
      );
      // Position the kind picker at the new wire's midpoint so the user can
      // refine the just-created link without hunting for it.
      if (fp && tp) {
        const from = portPoint(fp, pending.fromSide);
        const to = portPoint(tp, toSide);
        const mid = midpoint(from, pending.fromSide, to, toSide);
        setKindPicker({ connId, x: mid.x, y: mid.y });
      }
      onPendingChange(null);
    },
    [pending, addConnection, onPendingChange, panelMap],
  );

  const handleSvgPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!pending) return;
      const pos = toCanvas(e.clientX, e.clientY);
      onPendingChange({ ...pending, cursorX: pos.x, cursorY: pos.y });
    },
    [pending, toCanvas, onPendingChange],
  );

  const handleSvgPointerUp = useCallback(() => {
    if (pending) onPendingChange(null);
  }, [pending, onPendingChange]);

  // Pending rubber-band line
  const pendingPath = (() => {
    if (!pending) return null;
    const fp = panelMap.get(pending.fromPanel);
    if (!fp) return null;
    const from = portPoint(fp, pending.fromSide);
    const to = { x: pending.cursorX, y: pending.cursorY };
    // Use opposite side as incoming direction for the rubber-band curve
    const toSide = oppositeSide(pending.fromSide);
    return bezierPath(from, pending.fromSide, to, toSide);
  })();

  return (
    <svg
      className="pointer-events-none absolute inset-0 overflow-visible"
      style={{ width: 0, height: 0 }}
      onPointerMove={pending ? handleSvgPointerMove : undefined}
      onPointerUp={pending ? handleSvgPointerUp : undefined}
    >
      <g style={{ pointerEvents: pending ? "all" : "none" }}>
        {/* Committed connections */}
        {connections.map((conn) => {
          const fp = panelMap.get(conn.fromPanel);
          const tp = panelMap.get(conn.toPanel);
          if (!fp || !tp || fp.pinned || tp.pinned) return null;
          const from = portPoint(fp, conn.fromSide);
          const to = portPoint(tp, conn.toSide);
          const d = bezierPath(from, conn.fromSide, to, conn.toSide);
          const mid = midpoint(from, conn.fromSide, to, conn.toSide);
          return (
            <g key={conn.id} style={{ pointerEvents: "all" }}>
              {/* Wider invisible hit target */}
              <path d={d} fill="none" stroke="transparent" strokeWidth={12} />
              {/* Visible stroke — blue=data, purple=context, green=trigger */}
              <path
                d={d}
                fill="none"
                stroke={wireColor(conn.kind)}
                strokeWidth={1.5}
                strokeOpacity={0.6}
                strokeDasharray="4 3"
              />
              {/* Delete button at midpoint */}
              <g
                transform={`translate(${mid.x},${mid.y})`}
                className="cursor-pointer"
                onClick={() => removeConnection(conn.id)}
              >
                <circle r={7} fill="#1a1a1a" stroke="#404040" strokeWidth={1} />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={9}
                  fill="#888888"
                  style={{ userSelect: "none" }}
                >
                  ×
                </text>
              </g>
              {/* Char-limit popover trigger — sits 16px to the right of the
                  delete cap so both controls fit on every wire. */}
              <g
                transform={`translate(${mid.x + 16},${mid.y})`}
                className="cursor-pointer"
                onClick={() => setLimitEditor({ connId: conn.id, x: mid.x, y: mid.y })}
              >
                <circle r={6} fill="#1a1a1a" stroke="#2a2a2a" strokeWidth={1} />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={8}
                  fill="#666"
                  style={{ userSelect: "none" }}
                >
                  ⚙
                </text>
              </g>
            </g>
          );
        })}

        {/* Rubber-band pending connection */}
        {pendingPath && (
          <path
            d={pendingPath}
            fill="none"
            stroke="#5b8def"
            strokeWidth={1.5}
            strokeOpacity={0.8}
            strokeDasharray="4 3"
          />
        )}

        {/* Port dots on all non-pinned panels */}
        {panels
          .filter((p) => !p.pinned)
          .map((p) => (
            <PortDots
              key={p.id}
              panel={p}
              pending={pending}
              onStartDrag={handleStartDrag}
              onDrop={handleDrop}
            />
          ))}

        {/* Kind picker — shown after a wire is dropped, lets the user pick
            data / context / trigger. SVG foreignObject is used so we can
            render real HTML buttons inside the canvas-space transform. */}
        {kindPicker && (
          <foreignObject
            x={kindPicker.x - 90}
            y={kindPicker.y - 16}
            width={180}
            height={32}
            style={{ pointerEvents: "all", overflow: "visible" }}
          >
            <div
              className="flex items-center gap-0.5 rounded-md border border-[#2a2a2a] bg-[#111] p-1"
              style={{ width: "fit-content", margin: "0 auto" }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {(["data", "context", "trigger"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => {
                    updateConnectionKind(kindPicker.connId, kind);
                    setKindPicker(null);
                  }}
                  className="rounded px-2 py-0.5 text-[10px] capitalize transition-colors duration-150 hover:bg-[#1a1a1a]"
                  style={{ color: WIRE_COLOR[kind] }}
                  title={
                    kind === "data"
                      ? "Explicit value wire — shown in the chat badge row"
                      : kind === "context"
                        ? "Silent auto-context — always prepended, no badge"
                        : "Execution signal — chat→terminal command pulse"
                  }
                >
                  {kind}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setKindPicker(null)}
                className="ml-0.5 rounded px-1.5 py-0.5 text-[10px] text-[#555] transition-colors duration-150 hover:text-[#888]"
                title="Keep as data (default)"
              >
                ✕
              </button>
            </div>
          </foreignObject>
        )}

        {/* Char-limit popover — slider in [500, 16000], 500-step. Clamping
            is also enforced by the store action (100..32000). */}
        {limitEditor && activeLimitConn && (
          <foreignObject
            x={limitEditor.x - 110}
            y={limitEditor.y + 14}
            width={220}
            height={56}
            style={{ pointerEvents: "all", overflow: "visible" }}
          >
            <div
              className="flex flex-col gap-1 rounded-md border border-[#2a2a2a] bg-[#111] p-2"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between text-[10px] text-[#888]">
                <span>Char limit</span>
                <span className="text-[#5b8def]">
                  {(activeLimitConn.charLimit ?? 4000).toLocaleString()}
                </span>
              </div>
              <input
                type="range"
                min={500}
                max={16000}
                step={500}
                value={activeLimitConn.charLimit ?? 4000}
                onChange={(e) =>
                  updateConnectionCharLimit(
                    activeLimitConn.id,
                    Number(e.target.value),
                  )
                }
                className="h-1 w-full cursor-pointer accent-[#5b8def]"
              />
              <button
                type="button"
                onClick={() => setLimitEditor(null)}
                className="self-end text-[9px] text-[#555] transition-colors duration-150 hover:text-[#888]"
              >
                done
              </button>
            </div>
          </foreignObject>
        )}
      </g>
    </svg>
  );
}
