export type PanelType =
  | "terminal"
  | "editor"
  | "preview"
  | "vault-home"
  | "web"
  | "chat"
  | "canvas"
  | "agent"
  | "instance"
  | "codegraph"
  | "input"
  | "pipeline"
  | "header"
  | "checklist"
  | "gallery"
  | "filebrowser"
  | "sketch"
  | "note"
  | "tool"
  | "pipe"
  | "stickman"
  | "canvas-3d"
  | "logs"
  | "audio"
  | "variable"
  | "if-else"
  | "for-each";

export interface CanvasPanelNode {
  id: string;
  type: PanelType;
  /** Canvas-space position in logical pixels (when not pinned) */
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  title: string;
  /** Type-specific extra data (file path, URL, etc.) */
  meta: Record<string, unknown>;
  /**
   * When true the panel renders with position:fixed at (screenX, screenY)
   * independent of canvas pan/zoom. Stays visible even when canvas is hidden.
   */
  pinned?: boolean;
  /** Screen-space position used when pinned (logical pixels from viewport top-left) */
  screenX?: number;
  screenY?: number;
  /** When true the panel is collapsed to the dock strip instead of shown on canvas. */
  minimized?: boolean;
  /** Sub-canvas only — local pan/zoom for the panel's interior canvas. */
  viewport?: Viewport;
  /** Sub-canvas only — children panels living in this panel's local coord system. */
  children?: CanvasPanelNode[];
  /**
   * When set, output data from this panel is forwarded to the named V3 floating
   * window via Tauri emitTo(windowLabel, "atlas:wire-data", { panelId, data }).
   * Example: "v3-output" links this panel as a context source for the V3 chat.
   */
  windowLabel?: string;
  /** Runtime execution state — shown as a colored indicator dot in the header. */
  status?: "idle" | "running" | "error" | "done";
}

export type PortSide = "top" | "right" | "bottom" | "left";

export type ConnectionKind = "data" | "context" | "trigger";

/** Payload a panel writes to `meta.outputData` to feed downstream wires. */
export type WireData = { kind: "text" | "image" | "json"; value: unknown };

export interface Connection {
  id: string;
  fromPanel: string;
  fromSide: PortSide;
  /** Named output port id on the source panel (optional — legacy wires omit this). */
  fromPort?: string;
  toPanel: string;
  toSide: PortSide;
  /** Named input port id on the destination panel (optional — legacy wires omit this). */
  toPort?: string;
  /**
   * "data"    = explicit value wire (blue) — shown in the chat badge row
   * "context" = silent auto-context (purple) — prepended to every prompt, no badge
   * "trigger" = execution signal (green) — chat→terminal command pulse
   * Default: "data".
   */
  kind?: ConnectionKind;
  /**
   * Max characters of this wire's value forwarded to the destination. Default 4000.
   * Per-wire limit overrides the global limit so a noisy terminal can be clamped
   * without affecting other wires.
   */
  charLimit?: number;
}

/**
 * One panel's contribution to a chat node's aggregated upstream context.
 * Produced by `useAllIncomingWireData` and consumed by `buildContextPrefix`.
 */
export type WireBlock = {
  panelId: string;
  panelTitle: string;
  panelType: PanelType;
  connectionKind: ConnectionKind;
  charLimit: number;
  data: WireData | null;
  /** Destination port id on the receiving panel (undefined for legacy unported wires). */
  toPort?: string;
};

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}
