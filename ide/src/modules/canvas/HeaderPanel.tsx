import { useCallback, useRef, useState } from "react";
import { useCanvasStore } from "./canvasStore";
import type { CanvasPanelNode } from "./types";

const PRESETS: { hex: string; label: string }[] = [
  { hex: "#d4a843", label: "Yellow"  },
  { hex: "#9b72ef", label: "Purple"  },
  { hex: "#5b8def", label: "Blue"    },
  { hex: "#4db89a", label: "Green"   },
  { hex: "#e07b54", label: "Orange"  },
  { hex: "#888888", label: "Neutral" },
];

const DEFAULT_COLOR = "#d4a843";

export function HeaderPanel({ panel }: { panel: CanvasPanelNode }) {
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const color =
    typeof panel.meta?.headerColor === "string" && panel.meta.headerColor
      ? (panel.meta.headerColor as string)
      : DEFAULT_COLOR;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(panel.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickColor = useCallback(
    (hex: string) => updatePanel(panel.id, { meta: { ...panel.meta, headerColor: hex } }),
    [panel.id, panel.meta, updatePanel],
  );

  const commit = useCallback(() => {
    const next = draft.trim();
    if (next && next !== panel.title) updatePanel(panel.id, { title: next });
    setEditing(false);
  }, [draft, panel.id, panel.title, updatePanel]);

  return (
    <div className="flex h-full w-full items-center justify-between gap-3 px-4">
      {editing ? (
        <input
          ref={inputRef}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") { setDraft(panel.title); setEditing(false); }
          }}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold tracking-tight outline-none"
          style={{ color, caretColor: color }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight"
          style={{ color, textShadow: `0 0 20px ${color}40` }}
          onDoubleClick={(e) => { e.stopPropagation(); setDraft(panel.title); setEditing(true); }}
          title="Double-click to rename"
        >
          {panel.title}
        </span>
      )}

      <div
        className="flex shrink-0 items-center gap-1.5"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {PRESETS.map((p) => (
          <button
            key={p.hex}
            type="button"
            onClick={() => pickColor(p.hex)}
            title={p.label}
            className="transition-all duration-150"
            style={{
              width: 10, height: 10,
              borderRadius: "50%",
              background: p.hex,
              opacity: p.hex === color ? 1 : 0.4,
              outline: p.hex === color ? `2px solid ${p.hex}55` : "none",
              outlineOffset: 2,
            }}
          />
        ))}
      </div>
    </div>
  );
}
