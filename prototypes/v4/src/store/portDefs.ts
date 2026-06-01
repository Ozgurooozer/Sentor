import type { PanelType, ConnectionKind, PortSide } from "./types";

export type PortDataType = "text" | "image" | "json" | "trigger" | "any";

export interface NamedPort {
  id: string;
  label: string;
  kind: ConnectionKind;
  dataType: PortDataType;
}

export interface PanelPorts {
  inputs: NamedPort[];
  outputs: NamedPort[];
}

const p = (id: string, label: string, kind: ConnectionKind, dataType: PortDataType): NamedPort =>
  ({ id, label, kind, dataType });

const text = (id: string, label: string, kind: ConnectionKind = "context") => p(id, label, kind, "text");
const trig = (id: string, label: string) => p(id, label, "trigger", "trigger");
const any  = (id: string, label: string, kind: ConnectionKind = "data") => p(id, label, kind, "any");

export const PORT_DEFS: Partial<Record<PanelType, PanelPorts>> = {
  terminal: { inputs: [text("cmd", "cmd", "data"), trig("trigger", "run")], outputs: [text("stdout", "stdout", "data")] },
  input:    { inputs: [],                                                    outputs: [any("value", "value", "data")] },
  output:   { inputs: [any("value", "value", "data")],                      outputs: [] },
};

/** namedPortPoint overload: (node, side, idx, total) — used by V3InfiniteCanvas / V3WireLayer */
export function namedPortPoint(
  node: { x: number; y: number; width: number; height: number },
  side: PortSide,
  idxOrPortId: number | string | undefined,
  totalOrPorts: number | NamedPort[],
): { x: number; y: number } {
  let idx: number;
  let count: number;
  if (typeof totalOrPorts === "number") {
    idx   = typeof idxOrPortId === "number" ? idxOrPortId : 0;
    count = totalOrPorts;
  } else {
    const ports = totalOrPorts;
    count = ports.length;
    idx   = typeof idxOrPortId === "string" && idxOrPortId
      ? Math.max(0, ports.findIndex((pp) => pp.id === idxOrPortId))
      : 0;
  }
  const safeIdx = Math.max(0, idx);
  const frac = count <= 1 ? 0.5 : (safeIdx + 1) / (count + 1);

  if (side === "left")   return { x: node.x,              y: node.y + node.height * frac };
  if (side === "right")  return { x: node.x + node.width, y: node.y + node.height * frac };
  if (side === "top")    return { x: node.x + node.width * frac, y: node.y };
  return                        { x: node.x + node.width * frac, y: node.y + node.height };
}

/** Returns { index, total } for a named port, or null if not found. */
export function portIndex(
  type: PanelType,
  side: "inputs" | "outputs",
  portId: string,
): { index: number; total: number } | null {
  const defs = PORT_DEFS[type];
  if (!defs) return null;
  const ports = defs[side];
  const index = ports.findIndex((p) => p.id === portId);
  if (index < 0) return null;
  return { index, total: ports.length };
}

/** Returns the ConnectionKind of a named port, or null. */
export function portKind(
  type: PanelType,
  side: "inputs" | "outputs",
  portId: string,
): ConnectionKind | null {
  const defs = PORT_DEFS[type];
  if (!defs) return null;
  return defs[side].find((p) => p.id === portId)?.kind ?? null;
}
