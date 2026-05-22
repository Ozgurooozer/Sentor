import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCanvasStore } from "./canvasStore";

const PANEL_ICONS: Record<string, string> = {
  terminal: ">_",
  editor: "{}",
  preview: "◻",
  "vault-home": "⌂",
  web: "⊕",
  chat: "💬",
  canvas: "⊞",
  agent: "A",
};

export function CanvasDock() {
  const panels = useCanvasStore((s) => s.panels);
  const toggleMinimized = useCanvasStore((s) => s.toggleMinimized);
  const removePanel = useCanvasStore((s) => s.removePanel);

  const minimized = panels.filter((p) => p.minimized);
  if (minimized.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center pb-2">
      <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#111111]/90 px-2 py-1 backdrop-blur-md">
        {minimized.map((panel) => (
          <div
            key={panel.id}
            className="group flex h-6 cursor-pointer items-center gap-1.5 rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 text-[#888888] transition-colors hover:border-[#404040] hover:bg-[#222222] hover:text-[#f5f5f5]"
            onClick={() => toggleMinimized(panel.id)}
            title={`Restore "${panel.title}"`}
          >
            <span className="text-[9px] text-[#555555]">{PANEL_ICONS[panel.type] ?? "□"}</span>
            <span className="max-w-[120px] truncate text-[10px]">{panel.title}</span>
            <button
              type="button"
              className="ml-0.5 flex size-3.5 items-center justify-center rounded text-[#555555] opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
              onClick={(e) => { e.stopPropagation(); removePanel(panel.id); }}
              title="Close"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={9} strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
