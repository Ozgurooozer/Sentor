import { useCallback, useMemo } from "react";
import { useCanvasStore } from "./canvasStore";
import type { CanvasPanelNode } from "./types";

export type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

function newId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `cl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChecklistPanel({ panel }: { panel: CanvasPanelNode }) {
  const updatePanel   = useCanvasStore((s) => s.updatePanel);
  const setOutputData = useCanvasStore((s) => s.setOutputData);

  const items = useMemo(
    () => (Array.isArray(panel.meta?.items) ? (panel.meta.items as ChecklistItem[]) : []),
    [panel.meta?.items],
  );

  const persist = useCallback(
    (next: ChecklistItem[]) => {
      updatePanel(panel.id, { meta: { ...panel.meta, items: next } });
      const pending = next.filter((i) => !i.done).map((i) => `- ${i.text}`).join("\n");
      setOutputData(panel.id, pending ? { kind: "text", value: pending } : null);
    },
    [panel.id, panel.meta, setOutputData, updatePanel],
  );

  const toggle = (id: string) => persist(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  const rename = (id: string, text: string) => persist(items.map((i) => (i.id === id ? { ...i, text } : i)));
  const remove = (id: string) => persist(items.filter((i) => i.id !== id));
  const add    = () => persist([...items, { id: newId(), text: "New task", done: false }]);

  const done  = items.filter((i) => i.done).length;
  const total = items.length;

  return (
    <div className="flex h-full flex-col" onPointerDown={(e) => e.stopPropagation()}>
      {/* Progress bar */}
      {total > 0 && (
        <div
          className="shrink-0 px-3 py-2"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.25)" }}>
              progress
            </span>
            <span className="font-mono text-[9px]" style={{ color: done === total ? "#4db89a" : "rgba(255,255,255,0.30)" }}>
              {done}/{total}
            </span>
          </div>
          <div
            className="h-[2px] w-full rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${total ? (done / total) * 100 : 0}%`,
                background: done === total ? "#4db89a" : "#5b8def",
              }}
            />
          </div>
        </div>
      )}

      {/* Items */}
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2 no-scrollbar">
        {items.length === 0 ? (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-1 py-6 text-center"
            style={{ color: "rgba(255,255,255,0.18)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
            </svg>
            <span className="text-[10px] uppercase tracking-widest">No tasks yet</span>
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="group flex items-center gap-2 rounded-[7px] px-2 py-1.5 transition-colors duration-150"
              style={{ background: "transparent" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "transparent")}
            >
              {/* Custom checkbox */}
              <button
                type="button"
                onClick={() => toggle(item.id)}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] transition-all duration-150"
                style={item.done
                  ? { background: "#4db89a22", border: "1px solid #4db89a88" }
                  : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.15)" }
                }
              >
                {item.done && (
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="#4db89a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1.5 5.5l2.5 2.5 4.5-5"/>
                  </svg>
                )}
              </button>

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
                  if (e.key === "Enter") { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); }
                }}
                className="min-w-0 flex-1 cursor-text text-[12px] outline-none transition-opacity duration-150"
                style={{
                  color: item.done ? "rgba(255,255,255,0.28)" : "#c8c8d0",
                  textDecoration: item.done ? "line-through" : "none",
                  fontFamily: "system-ui",
                }}
              >
                {item.text}
              </span>

              <button
                type="button"
                onClick={() => remove(item.id)}
                className="h-4 w-4 shrink-0 items-center justify-center rounded text-[11px] opacity-0 transition-all duration-150 group-hover:opacity-100 flex"
                style={{ color: "rgba(255,100,100,0.6)" }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add button */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <button
          type="button"
          onClick={add}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] transition-colors duration-150"
          style={{ color: "rgba(255,255,255,0.25)" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#5b8def")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.25)")}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M6 2v8M2 6h8"/>
          </svg>
          Add task
        </button>
      </div>
    </div>
  );
}
