import type { PanelType, ConnectionKind } from "./types";

/** What data actually flows through a wire. Used for visual type-matching. */
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

// shortcuts
const text   = (id: string, label: string, kind: ConnectionKind = "context") => p(id, label, kind, "text");
const img    = (id: string, label: string) => p(id, label, "data", "image");
const json   = (id: string, label: string, kind: ConnectionKind = "data") => p(id, label, kind, "json");
const trig   = (id: string, label: string) => p(id, label, "trigger", "trigger");
const any    = (id: string, label: string, kind: ConnectionKind = "data") => p(id, label, kind, "any");

export const PORT_DEFS: Partial<Record<PanelType, PanelPorts>> = {
  note:        { inputs: [],                                           outputs: [text("text",     "text")]     },
  input:       { inputs: [],                                           outputs: [any("value",     "value")]    },
  sketch:      { inputs: [],                                           outputs: [img("image",     "image")]    },
  checklist:   { inputs: [],                                           outputs: [text("tasks",    "tasks")]    },
  terminal:    { inputs: [text("cmd", "cmd", "data"), trig("trigger", "run")], outputs: [text("stdout", "stdout", "data")] },
  editor:      { inputs: [],                                           outputs: [text("content",  "content")]  },
  web:         { inputs: [],                                           outputs: [text("url", "url", "data"), text("content", "content")] },
  filebrowser: { inputs: [],                                           outputs: [text("path",     "path", "data")] },
  gallery:     { inputs: [img("image",   "image")],                   outputs: []                          },
  chat:        { inputs: [text("context", "context"), any("data", "data", "data"), trig("trigger", "trigger")], outputs: [text("response", "response", "data")] },
  agent:       { inputs: [text("context", "context"), trig("trigger", "trigger")], outputs: [text("response", "response", "data")] },
  pipeline:    { inputs: [any("input",   "input")],                   outputs: [any("output",   "output")]   },
  canvas:      { inputs: [any("input",   "input")],                   outputs: [any("output",   "output")]   },
  "canvas-3d": { inputs: [any("input",   "input")],                   outputs: [any("output",   "output")]   },
  logs:        { inputs: [],                                           outputs: [text("output",  "output")]   },
  codegraph:   { inputs: [text("context", "context")],                outputs: [json("graph",    "graph")]    },
  tool:        { inputs: [any("input",   "input")],                   outputs: [any("output",   "output")]   },
  pipe:        { inputs: [text("in",     "in", "data")],              outputs: [text("out",     "out", "data")] },
  audio:       { inputs: [trig("trigger", "start")],                  outputs: [text("transcript", "transcript", "data")] },
  variable:    { inputs: [any("set", "Set")],                          outputs: [any("value", "Value")]                     },
  "if-else":   { inputs: [text("condition", "Condition", "data"), any("true_val", "True"), any("false_val", "False")], outputs: [any("result", "Result")] },
  "for-each":  { inputs: [any("items", "Items")],                      outputs: [json("items_json", "Items JSON"), text("item_count", "Count", "data")] },
};

const HEADER_H = 32;

/** Canvas-space position of a named port dot on the panel edge. */
export function namedPortPoint(
  panel: { x: number; y: number; width: number; height: number },
  side: "left" | "right",
  index: number,
  total: number,
): { x: number; y: number } {
  const usableH = Math.max(panel.height - HEADER_H, 24);
  const y = panel.y + HEADER_H + usableH * (index + 1) / (total + 1);
  return { x: side === "left" ? panel.x : panel.x + panel.width, y };
}

/** Look up a port in the defs and return its index + total count. */
export function portIndex(
  type: PanelType,
  side: "inputs" | "outputs",
  portId: string,
): { index: number; total: number } | null {
  const defs = PORT_DEFS[type];
  if (!defs) return null;
  const list = defs[side];
  const index = list.findIndex((p) => p.id === portId);
  if (index === -1) return null;
  return { index, total: list.length };
}

export function portKind(type: PanelType, side: "inputs" | "outputs", portId: string): ConnectionKind | null {
  const defs = PORT_DEFS[type];
  if (!defs) return null;
  return defs[side].find((p) => p.id === portId)?.kind ?? null;
}
