/**
 * V3WireLayer — SVG overlay for V3 canvas wires.
 * Same bezier math as ConnectionLayer, updated visual language:
 *   data    = blue  1.5px dashed, opacity 0.35
 *   context = purple 1.5px dashed, opacity 0.35
 *   trigger = green  2px solid,   opacity 0.50 + glow filter
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CanvasPanelNode, Connection, ConnectionKind, PortSide, Viewport,
} from "@/modules/canvas/types";
import { useCanvasStore } from "@/modules/canvas/canvasStore";
import { PORT_DEFS, namedPortPoint, portIndex, portKind, type PortDataType } from "@/modules/canvas/portDefs";

// ── Wire visuals ────────────────────────────────────────────────────────────
const WIRE_COLOR: Record<ConnectionKind, string> = {
  data:    "#5b8def",
  context: "#9b72ef",
  trigger: "#4db89a",
};
function wireColor(kind: Connection["kind"]): string { return WIRE_COLOR[kind ?? "data"]; }

// ── Geometry helpers (identical to ConnectionLayer) ──────────────────────────
function portPoint(panel: CanvasPanelNode, side: PortSide) {
  const cx = panel.x + panel.width / 2, cy = panel.y + panel.height / 2;
  switch (side) {
    case "top":    return { x: cx, y: panel.y };
    case "bottom": return { x: cx, y: panel.y + panel.height };
    case "left":   return { x: panel.x, y: cy };
    case "right":  return { x: panel.x + panel.width, y: cy };
  }
}

function resolveEndpoint(panel: CanvasPanelNode, side: PortSide, portId: string | undefined, side2: "inputs" | "outputs") {
  if (portId) {
    const info = portIndex(panel.type, side2, portId);
    if (info) return namedPortPoint(panel, side2 === "outputs" ? "right" : "left", info.index, info.total);
  }
  return portPoint(panel, side);
}

function cpOffset(from: { x: number; y: number }, to: { x: number; y: number }, side: PortSide) {
  const dist = Math.max(60, Math.hypot(to.x - from.x, to.y - from.y) * 0.45);
  switch (side) {
    case "right":  return { dx: dist, dy: 0 };
    case "left":   return { dx: -dist, dy: 0 };
    case "bottom": return { dx: 0, dy: dist };
    case "top":    return { dx: 0, dy: -dist };
  }
}

function bezierPath(from: { x: number; y: number }, fromSide: PortSide, to: { x: number; y: number }, toSide: PortSide) {
  const { dx: fdx, dy: fdy } = cpOffset(from, to, fromSide);
  const { dx: tdx, dy: tdy } = cpOffset(to, from, toSide);
  return `M ${from.x} ${from.y} C ${from.x+fdx} ${from.y+fdy}, ${to.x+tdx} ${to.y+tdy}, ${to.x} ${to.y}`;
}

function midpoint(from: { x: number; y: number }, fromSide: PortSide, to: { x: number; y: number }, toSide: PortSide) {
  const { dx: fdx, dy: fdy } = cpOffset(from, to, fromSide);
  const { dx: tdx, dy: tdy } = cpOffset(to, from, toSide);
  const cp1x = from.x+fdx, cp1y = from.y+fdy, cp2x = to.x+tdx, cp2y = to.y+tdy;
  const t = 0.5, mt = 0.5;
  return {
    x: mt*mt*mt*from.x + 3*mt*mt*t*cp1x + 3*mt*t*t*cp2x + t*t*t*to.x,
    y: mt*mt*mt*from.y + 3*mt*mt*t*cp1y + 3*mt*t*t*cp2y + t*t*t*to.y,
  };
}

function oppositeSide(side: PortSide): PortSide {
  switch (side) { case "top": return "bottom"; case "bottom": return "top"; case "left": return "right"; case "right": return "left"; }
}

// ── Pending connection ───────────────────────────────────────────────────────
export interface PendingConn {
  fromPanel: string; fromSide: PortSide; fromPort?: string;
  fromDataType?: PortDataType; cursorX: number; cursorY: number;
}

export const TYPE_COLOR: Record<PortDataType, string> = {
  text: "#888", image: "#e07b54", json: "#d4a843", trigger: "#4db89a", any: "#555",
};

function typesCompatible(from?: PortDataType, to?: PortDataType) {
  if (!from || !to) return true;
  if (from === "any" || to === "any") return true;
  return from === to;
}

// ── Port dots ────────────────────────────────────────────────────────────────
function PortDots({ panel, pending, connections, isHovered, onStartDrag, onDrop }: {
  panel: CanvasPanelNode; pending: PendingConn | null; connections: Connection[];
  isHovered: boolean;
  onStartDrag(panelId: string, side: PortSide, portId: string, e: React.PointerEvent): void;
  onDrop(panelId: string, side: PortSide, portId: string): void;
}) {
  const defs = PORT_DEFS[panel.type];
  const isTarget = pending && pending.fromPanel !== panel.id;
  const PIN_R = isHovered ? 9 : 6;
  const PIN_I = isHovered ? 4 : 3;

  const isConnected = (portId: string, side2: "inputs" | "outputs") =>
    side2 === "outputs"
      ? connections.some((c) => c.fromPanel === panel.id && (c.fromPort === portId || (!c.fromPort && portId === "")))
      : connections.some((c) => c.toPanel   === panel.id && (c.toPort   === portId || (!c.toPort   && portId === "")));

  const pin = (pt: { x: number; y: number }, color: string, connected: boolean, compatible: boolean | null,
    label: string, anchor: "start" | "end", portId: string, side: PortSide, isInput: boolean) => {
    const dimmed = compatible === false;
    const glowing = compatible === true;
    const c = dimmed ? "#2a2a2a" : color;
    const lx = anchor === "start" ? pt.x + PIN_R + 5 : pt.x - PIN_R - 5;
    return (
      <g key={`${side}-${portId}`}>
        <circle cx={pt.x} cy={pt.y} r={14} fill="transparent" style={{ cursor: "crosshair" }}
          onPointerDown={(e) => { e.stopPropagation(); onStartDrag(panel.id, side, portId, e); }}
          onPointerUp={(e) => { if (isTarget && isInput) { e.stopPropagation(); onDrop(panel.id, side, portId); } }}
        />
        {glowing && <circle cx={pt.x} cy={pt.y} r={PIN_R+3} fill="none" stroke={c} strokeWidth={1} strokeOpacity={0.4} style={{ pointerEvents: "none" }} />}
        <circle cx={pt.x} cy={pt.y} r={PIN_R} fill={connected || glowing ? c : "#0a0a0e"} stroke={c} strokeWidth={connected ? 0 : 1.5} style={{ pointerEvents: "none", transition: "fill 120ms" }} />
        {!connected && !glowing && <circle cx={pt.x} cy={pt.y} r={PIN_I} fill={dimmed ? "#181818" : "#0a0a0e"} style={{ pointerEvents: "none" }} />}
        <text x={lx} y={pt.y} textAnchor={anchor} dominantBaseline="central" fontSize={9}
          fill={dimmed ? "#2a2a2a" : isHovered ? "#888" : "#444"}
          style={{ pointerEvents: "none", userSelect: "none", fontFamily: "system-ui" }}>
          {label}
        </text>
      </g>
    );
  };

  if (!defs) {
    return (
      <>
        {(["left", "right"] as const).map((side) =>
          pin(portPoint(panel, side), "#5b8def", isConnected("", side === "left" ? "inputs" : "outputs"),
            isTarget ? true : null, "", side === "left" ? "start" : "end", "", side, side === "left"),
        )}
      </>
    );
  }
  return (
    <>
      {defs.inputs.map((port, i) => {
        const pt = namedPortPoint(panel, "left", i, defs.inputs.length);
        return pin(pt, TYPE_COLOR[port.dataType], isConnected(port.id, "inputs"),
          isTarget ? typesCompatible(pending?.fromDataType, port.dataType) : null,
          port.label, "start", port.id, "left", true);
      })}
      {defs.outputs.map((port, i) => {
        const pt = namedPortPoint(panel, "right", i, defs.outputs.length);
        return pin(pt, TYPE_COLOR[port.dataType], isConnected(port.id, "outputs"), null, port.label, "end", port.id, "right", false);
      })}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
import type { WireAnim } from "@/modules/canvas/canvasTweaksStore";

interface Props {
  panels: CanvasPanelNode[]; connections: Connection[]; viewport: Viewport;
  canvasRect: DOMRect | null; pending: PendingConn | null;
  wireAnim?: WireAnim; hoveredPanelId?: string | null;
  onPendingChange(p: PendingConn | null): void;
  addConnectionOverride?: (fromPanel: string, fromSide: PortSide, toPanel: string, toSide: PortSide, fromPort?: string, toPort?: string, kind?: "data" | "context" | "trigger") => string;
  removeConnectionOverride?: (id: string) => void;
}

export function V3WireLayer({ panels, connections, viewport, canvasRect, pending, onPendingChange, wireAnim = "off", hoveredPanelId, addConnectionOverride, removeConnectionOverride }: Props) {
  const _addConnection = useCanvasStore((s) => s.addConnection);
  const _removeConnection = useCanvasStore((s) => s.removeConnection);
  const updateConnectionKind = useCanvasStore((s) => s.updateConnectionKind);
  const addConnection = addConnectionOverride ?? _addConnection;
  const removeConnection = removeConnectionOverride ?? _removeConnection;

  const [kindPicker, setKindPicker] = useState<{ connId: string; x: number; y: number } | null>(null);
  const [hoveredWireId, setHoveredWireId] = useState<string | null>(null);

  const panelMap = useMemo(() => new Map(panels.map((p) => [p.id, p])), [panels]);

  const toCanvas = useCallback((cx: number, cy: number) => {
    if (!canvasRect) return { x: 0, y: 0 };
    return { x: (cx - canvasRect.left - viewport.x) / viewport.scale, y: (cy - canvasRect.top - viewport.y) / viewport.scale };
  }, [canvasRect, viewport]);

  const handleStartDrag = useCallback((panelId: string, side: PortSide, portId: string, e: React.PointerEvent) => {
    const pos = toCanvas(e.clientX, e.clientY);
    const panel = panelMap.get(panelId);
    const fromDataType = panel && portId ? PORT_DEFS[panel.type]?.outputs.find((p) => p.id === portId)?.dataType : undefined;
    onPendingChange({ fromPanel: panelId, fromSide: side, fromPort: portId || undefined, fromDataType, cursorX: pos.x, cursorY: pos.y });
  }, [toCanvas, onPendingChange, panelMap]);

  const handleDrop = useCallback((toPanelId: string, toSide: PortSide, toPortId: string) => {
    if (!pending || pending.fromPanel === toPanelId) { onPendingChange(null); return; }
    const fp = panelMap.get(pending.fromPanel);
    const tp = panelMap.get(toPanelId);
    const autoKind = tp && toPortId ? portKind(tp.type, "inputs", toPortId) ?? undefined : undefined;
    const connId = addConnection(pending.fromPanel, pending.fromSide, toPanelId, toSide, pending.fromPort, toPortId || undefined, autoKind);
    if (!autoKind && fp && tp) {
      const from = resolveEndpoint(fp, pending.fromSide, pending.fromPort, "outputs");
      const to   = resolveEndpoint(tp, toSide, toPortId || undefined, "inputs");
      const mid  = midpoint(from, pending.fromSide, to, toSide);
      setKindPicker({ connId, x: mid.x, y: mid.y });
    }
    onPendingChange(null);
  }, [pending, addConnection, onPendingChange, panelMap]);

  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => {
    if (!pending) return;
    const onMove = (e: PointerEvent) => {
      if (!pendingRef.current) return;
      const pos = toCanvas(e.clientX, e.clientY);
      onPendingChange({ ...pendingRef.current, cursorX: pos.x, cursorY: pos.y });
    };
    const onUp = () => onPendingChange(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [!!pending, toCanvas, onPendingChange]);

  useEffect(() => {
    if (!kindPicker) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setKindPicker(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [kindPicker]);

  const pendingPath = (() => {
    if (!pending) return null;
    const fp = panelMap.get(pending.fromPanel);
    if (!fp) return null;
    const from = resolveEndpoint(fp, pending.fromSide, pending.fromPort, "outputs");
    return bezierPath(from, pending.fromSide, { x: pending.cursorX, y: pending.cursorY }, oppositeSide(pending.fromSide));
  })();

  return (
    <svg className="pointer-events-none absolute inset-0" style={{ width: "100%", height: "100%", zIndex: 10000, overflow: "visible" }}>
      {/* Trigger glow filter */}
      <defs>
        <filter id="v3-trigger-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Committed wires */}
      {connections.map((conn) => {
        const fp = panelMap.get(conn.fromPanel);
        const tp = panelMap.get(conn.toPanel);
        if (!fp || !tp || fp.pinned || tp.pinned) return null;
        const from = resolveEndpoint(fp, conn.fromSide, conn.fromPort, "outputs");
        const to   = resolveEndpoint(tp, conn.toSide, conn.toPort, "inputs");
        const d    = bezierPath(from, conn.fromSide, to, conn.toSide);
        const mid  = midpoint(from, conn.fromSide, to, conn.toSide);
        const kind = conn.kind ?? "data";
        const color = wireColor(conn.kind);
        const isHov = hoveredWireId === conn.id;
        const isTrigger = kind === "trigger";

        return (
          <g key={conn.id} style={{ pointerEvents: "all" }}
            onMouseEnter={() => setHoveredWireId(conn.id)}
            onMouseLeave={() => setHoveredWireId(null)}>
            {/* Hit target */}
            <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
            {/* Glow for trigger */}
            {isTrigger && (
              <path d={d} fill="none" stroke={color} strokeWidth={4}
                strokeOpacity={0.12} filter="url(#v3-trigger-glow)" style={{ pointerEvents: "none" }} />
            )}
            {/* Visible wire */}
            <path d={d} fill="none" stroke={color}
              strokeWidth={isTrigger ? 2 : 1.5}
              strokeOpacity={isHov ? 0.75 : 0.35}
              strokeDasharray={isTrigger ? undefined : "5 4"}
              className={wireAnim === "flow" ? "sentor-wire-flow" : wireAnim === "pulse" ? "sentor-wire-pulse" : undefined}
              style={{ transition: "stroke-opacity 150ms ease-out" }}
            />
            {/* Midpoint controls — only on hover */}
            {isHov && (
              <>
                <g transform={`translate(${mid.x},${mid.y})`} className="cursor-pointer" onClick={() => removeConnection(conn.id)}>
                  <circle r={7} fill="rgba(8,8,14,0.90)" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
                  <text textAnchor="middle" dominantBaseline="central" fontSize={9} fill="#888" style={{ userSelect: "none" }}>×</text>
                </g>
                <g transform={`translate(${mid.x+16},${mid.y})`} className="cursor-pointer"
                  onClick={() => setKindPicker({ connId: conn.id, x: mid.x, y: mid.y })}>
                  <circle r={6} fill="rgba(8,8,14,0.90)" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                  <text textAnchor="middle" dominantBaseline="central" fontSize={8} fill="#555" style={{ userSelect: "none" }}>⚙</text>
                </g>
              </>
            )}
          </g>
        );
      })}

      {/* Rubber-band pending wire */}
      {pendingPath && (
        <path d={pendingPath} fill="none" stroke="#5b8def" strokeWidth={1.5}
          strokeOpacity={0.8} strokeDasharray="5 4" style={{ pointerEvents: "none" }} />
      )}

      {/* Port dots */}
      <g style={{ pointerEvents: "all" }}>
        {panels.filter((p) => !p.pinned).map((p) => (
          <PortDots key={p.id} panel={p} pending={pending} connections={connections}
            isHovered={hoveredPanelId === p.id}
            onStartDrag={handleStartDrag} onDrop={handleDrop} />
        ))}
      </g>

      {/* Kind picker */}
      {kindPicker && (
        <foreignObject x={kindPicker.x - 90} y={kindPicker.y - 16} width={180} height={32} style={{ pointerEvents: "all", overflow: "visible" }}>
          <div className="flex items-center gap-0.5 rounded-[8px] border border-white/5 bg-[rgba(8,8,14,0.92)] p-1 backdrop-blur-sm"
            style={{ width: "fit-content", margin: "0 auto" }} onPointerDown={(e) => e.stopPropagation()}>
            {(["data", "context", "trigger"] as const).map((kind) => (
              <button key={kind} type="button" onClick={() => { updateConnectionKind(kindPicker.connId, kind); setKindPicker(null); }}
                className="rounded px-2 py-0.5 text-[10px] capitalize transition-colors duration-150 hover:bg-white/5"
                style={{ color: WIRE_COLOR[kind] }}>
                {kind}
              </button>
            ))}
            <button type="button" onClick={() => setKindPicker(null)}
              className="ml-0.5 rounded px-1.5 py-0.5 text-[10px] text-[#444] transition-colors duration-150 hover:text-[#888]">✕</button>
          </div>
        </foreignObject>
      )}
    </svg>
  );
}
