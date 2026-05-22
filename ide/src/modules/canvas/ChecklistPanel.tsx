import { useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "./canvasStore";
import type { CanvasPanelNode } from "./types";

/**
 * Checklist node — small task list. Pending items flow out of the panel's
 * output pin as a text wire, so the AI chat (or any data consumer) can see
 * "what still needs doing" via the wire-context system.
 *
 * Storage:
 *   panel.meta.items: ChecklistItem[]
 *   panel.meta.outputData: { kind: "text", value: pendingMarkdownList }
 */

export type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

function newId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `cl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Props {
  panel: CanvasPanelNode;
}

export function ChecklistPanel({ panel }: Props) {
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const setOutputData = useCanvasStore((s) => s.setOutputData);

  const items = useMemo(
    () => (Array.isArray(panel.meta?.items) ? (panel.meta.items as ChecklistItem[]) : []),
    [panel.meta?.items],
  );

  const persist = useCallback(
    (next: ChecklistItem[]) => {
      updatePanel(panel.id, { meta: { ...panel.meta, items: next } });
      const pending = next
        .filter((i) => !i.done)
        .map((i) => `- ${i.text}`)
        .join("\n");
      // Only emit when there's something pending; an empty checklist has no
      // signal to send downstream.
      setOutputData(
        panel.id,
        pending ? { kind: "text", value: pending } : null,
      );
    },
    [panel.id, panel.meta, setOutputData, updatePanel],
  );

  const toggle = (id: string) =>
    persist(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));

  const rename = (id: string, text: string) =>
    persist(items.map((i) => (i.id === id ? { ...i, text } : i)));

  const remove = (id: string) =>
    persist(items.filter((i) => i.id !== id));

  const add = () =>
    persist([...items, { id: newId(), text: "New task", done: false }]);

  return (
    <div
      className="flex h-full flex-col gap-1 overflow-y-auto p-2"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {items.length === 0 ? (
        <div className="px-1 py-2 text-[11px] text-[#555]">
          No tasks yet. Click below to add one.
        </div>
      ) : (
        items.map((item) => (
          <div
            key={item.id}
            className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-[#1a1a1a]/60"
          >
            <input
              type="checkbox"
              checked={item.done}
              onChange={() => toggle(item.id)}
              className="size-3.5 shrink-0 accent-[#5b8def]"
            />
            <span
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              onBlur={(e) => {
                const next = e.currentTarget.textContent?.trim() ?? "";
                if (next && next !== item.text) rename(item.id, next);
                else if (!next) remove(item.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).blur();
                }
              }}
              className={cn(
                "min-w-0 flex-1 cursor-text text-[12px] outline-none",
                item.done
                  ? "text-[#888] line-through opacity-50"
                  : "text-[#f5f5f5]",
              )}
            >
              {item.text}
            </span>
            <button
              type="button"
              onClick={() => remove(item.id)}
              className="shrink-0 text-[10px] text-[#555] opacity-0 transition-opacity duration-150 hover:text-red-400 group-hover:opacity-100"
              title="Remove"
            >
              ×
            </button>
          </div>
        ))
      )}

      <button
        type="button"
        onClick={add}
        className="mt-1 self-start text-[11px] text-[#555] transition-colors duration-150 hover:text-[#888]"
      >
        + Add item
      </button>
    </div>
  );
}
