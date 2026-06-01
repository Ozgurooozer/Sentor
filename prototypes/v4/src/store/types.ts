export type PanelType = "terminal" | "input" | "output";

export type PortSide = "top" | "right" | "bottom" | "left";
export type ConnectionKind = "data" | "context" | "trigger";
export type WireData = { kind: "text" | "image" | "json"; value: unknown };

export interface WireBlock {
  connectionId: string;
  fromPanelId: string;
  fromPortId: string | undefined;
  kind: ConnectionKind;
  data: WireData | null;
  charLimit: number;
}

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface CanvasPanelNode {
  id: string;
  type: PanelType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  title: string;
  meta: Record<string, unknown>;
  status?: "idle" | "running" | "error" | "done";
  pinned?: boolean;
  minimized?: boolean;
  screenX?: number;
  screenY?: number;
}

export interface Connection {
  id: string;
  fromPanel: string;
  fromSide: PortSide;
  fromPort?: string;
  toPanel: string;
  toSide: PortSide;
  toPort?: string;
  kind: ConnectionKind;
  charLimit?: number;
}
