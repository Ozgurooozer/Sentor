import type { CanvasPanelNode, PanelType } from "./types";

/**
 * Per-PanelType accent color used for node borders + faint glow on the
 * infinite canvas. Matches the Blueprint-style visual language described in
 * See docs/planning/CANVAS_NODES.md §1.5.1.
 *
 * Header nodes pick their own colour and store it in `panel.meta.headerColor`
 * (see HeaderPanel.tsx). `accentFor()` honours that override.
 */
export const NODE_ACCENT: Partial<Record<PanelType, string>> = {
  terminal:     "#4db89a", // green — execution
  editor:       "#9b72ef", // purple — code
  chat:         "#5b8def", // blue — AI
  agent:        "#5b8def",
  input:        "#d4a843", // gold — user data
  checklist:    "#888888", // neutral — tasks
  web:          "#666666",
  "vault-home": "#666666",
  pipeline:     "#e07b54", // orange — flow
  gallery:      "#888888",
  codegraph:    "#5b8def",
  preview:      "#666666",
  canvas:       "#444444",
  instance:     "#444444",
  "canvas-3d":  "#5b8def",
  logs:         "#4db89a",
  // Phase L — logic & variable nodes
  "variable":   "#d4a843", // gold — stores data
  "if-else":    "#4db89a", // green — control flow
  "for-each":   "#9b72ef", // purple — iteration
  // Previously missing
  note:         "#d4a843", // amber — content
  sketch:       "#888888",
  pipe:         "#e07b54", // orange — transform
  audio:        "#4db89a", // green — media
  filebrowser:  "#666666",
  tool:         "#5b8def",
};

export const DEFAULT_ACCENT = "#2a2a2a";

/** Resolve the border colour for a panel — honours per-header overrides. */
export function accentFor(panel: CanvasPanelNode): string {
  if (panel.type === "header") {
    const custom = panel.meta?.headerColor;
    if (typeof custom === "string" && custom) return custom;
    return "#d4a843"; // yellow default for header
  }
  return NODE_ACCENT[panel.type] ?? DEFAULT_ACCENT;
}

/** Hex8 alpha suffix for a faint glow — used as `${accent}${GLOW_ALPHA}`. */
export const GLOW_ALPHA = "20"; // ~12% alpha — barely-there
