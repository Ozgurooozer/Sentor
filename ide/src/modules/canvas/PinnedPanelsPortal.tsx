import { createPortal } from "react-dom";
import { useCanvasStore } from "./canvasStore";
import { CanvasPanel } from "./CanvasPanel";
import type { Viewport } from "./types";

// Pinned panels drag/resize in screen-space — no canvas transform needed
const PORTAL_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 };
const noop = () => {};

/**
 * Renders all pinned canvas panels via a React portal at document.body.
 * This keeps pinned panels visible regardless of which layout mode is active
 * and ensures no parent overflow / transform can clip them.
 */
export function PinnedPanelsPortal() {
  const panels = useCanvasStore((s) => s.panels);
  const pinned = panels.filter((p) => p.pinned);

  if (pinned.length === 0) return null;

  return createPortal(
    <>
      {pinned.map((panel) => (
        <CanvasPanel
          key={panel.id}
          panel={panel}
          viewport={PORTAL_VIEWPORT}
          onDragStart={noop}
          onDragEnd={noop}
        />
      ))}
    </>,
    document.body,
  );
}
