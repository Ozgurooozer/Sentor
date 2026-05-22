import type { CanvasPanelNode, PanelType } from "./types";

/**
 * Per-PanelType accent color used for node borders + faint glow on the
 * infinite canvas. Matches the Blueprint-style visual language described in
 * NODE_SYSTEM_PLAN.md §1.5.1.
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
