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
  | "tool";

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
}

export type PortSide = "top" | "right" | "bottom" | "left";

export type ConnectionKind = "data" | "context" | "trigger";

/** Payload a panel writes to `meta.outputData` to feed downstream wires. */
export type WireData = { kind: "text" | "image" | "json"; value: unknown };

export interface Connection {
  id: string;
  fromPanel: string;
  fromSide: PortSide;
  toPanel: string;
  toSide: PortSide;
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
};

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}
