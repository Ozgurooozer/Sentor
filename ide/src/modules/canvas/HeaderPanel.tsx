import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "./canvasStore";
import type { CanvasPanelNode } from "./types";

/**
 * Organisational "header" node — pure label. Carries no input or output
 * pins; its only job is to group nodes visually on the canvas (see the
 * yellow/purple section titles in the Blueprint mockup).
 *
 * Storage:
 *   panel.title              — display text (renamed via parent title bar)
 *   panel.meta.headerColor   — accent hex; consumed by accentFor() so the
 *                              CanvasPanel border + glow match
 */

const PRESETS: { hex: string; label: string }[] = [
  { hex: "#d4a843", label: "Yellow" },
  { hex: "#9b72ef", label: "Purple" },
  { hex: "#5b8def", label: "Blue" },
  { hex: "#4db89a", label: "Green" },
  { hex: "#e07b54", label: "Red" },
  { hex: "#888888", label: "Neutral" },
];

const DEFAULT_COLOR = "#d4a843";

interface Props {
  panel: CanvasPanelNode;
}

export function HeaderPanel({ panel }: Props) {
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const color =
    typeof panel.meta?.headerColor === "string" && panel.meta.headerColor
      ? (panel.meta.headerColor as string)
      : DEFAULT_COLOR;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(panel.title);
  const editRef = useRef<HTMLInputElement>(null);

  const pickColor = useCallback(
    (hex: string) => {
      updatePanel(panel.id, {
        meta: { ...panel.meta, headerColor: hex },
      });
    },
    [panel.id, panel.meta, updatePanel],
  );

  const commit = useCallback(() => {
    const next = draft.trim();
    if (next && next !== panel.title) {
      updatePanel(panel.id, { title: next });
    }
    setEditing(false);
  }, [draft, panel.id, panel.title, updatePanel]);

  return (
    <div className="flex h-full w-full items-center justify-between gap-3 px-4">
      {editing ? (
        <input
          ref={editRef}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") {
              setDraft(panel.title);
              setEditing(false);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold tracking-tight outline-none"
          style={{ color }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight"
          style={{ color }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setDraft(panel.title);
            setEditing(true);
          }}
          title="Double-click to rename"
        >
          {panel.title}
        </span>
      )}

      <div
        className="flex shrink-0 items-center gap-1"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {PRESETS.map((p) => (
          <button
            key={p.hex}
            type="button"
            onClick={() => pickColor(p.hex)}
            title={p.label}
            style={{ background: p.hex }}
            className={cn(
              "size-3 rounded-full transition-all duration-150",
              p.hex === color
                ? "opacity-100 ring-2 ring-white/30 ring-offset-2 ring-offset-[#0a0a0a]"
                : "opacity-60 hover:opacity-100",
            )}
          />
        ))}
      </div>
    </div>
  );
}
