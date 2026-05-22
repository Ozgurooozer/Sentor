/**
 * Single source of truth for canvas ↔ window-local coordinate math.
 * Used by WebLayerManager (native webview placement) and could be reused by
 * any other surface that needs to follow a canvas panel.
 */
import type { Viewport } from "../types";
import type { Rect } from "./types";

/**
 * Translate a canvas-space rectangle to window-local CSS pixels.
 *
 * `origin` is the canvas container's offset from the window's top-left.
 * In focused mode the canvas fills (0, 0) → (innerWidth, innerHeight-barH),
 * so origin defaults to {0, 0}. The caller passes a non-zero origin only
 * when the canvas is embedded elsewhere (classic mode, sub-canvas, etc.).
 */
export function canvasToScreen(
  pos: { x: number; y: number },
  size: { w: number; h: number },
  viewport: Viewport,
  origin: { x: number; y: number } = { x: 0, y: 0 },
): Rect {
  return {
    x: Math.round(origin.x + viewport.x + pos.x * viewport.scale),
    y: Math.round(origin.y + viewport.y + pos.y * viewport.scale),
    w: Math.round(Math.max(1, size.w * viewport.scale)),
    h: Math.round(Math.max(1, size.h * viewport.scale)),
  };
}

/** Inverse — screen-coord click → canvas-space coord. */
export function screenToCanvas(
  point: { x: number; y: number },
  viewport: Viewport,
  origin: { x: number; y: number } = { x: 0, y: 0 },
): { x: number; y: number } {
  return {
    x: (point.x - origin.x - viewport.x) / viewport.scale,
    y: (point.y - origin.y - viewport.y) / viewport.scale,
  };
}

/** True when the rect is completely outside the (0,0)-(viewW,viewH) viewport. */
export function isOffscreen(rect: Rect, viewW: number, viewH: number): boolean {
  return rect.x + rect.w <= 0 || rect.y + rect.h <= 0 || rect.x >= viewW || rect.y >= viewH;
}
