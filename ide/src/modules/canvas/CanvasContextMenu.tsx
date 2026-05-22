import { useEffect, useRef } from "react";
import type { PanelType } from "./types";

export type ContextMenuPos = { x: number; y: number; canvasX: number; canvasY: number };

export type NodeMenuItem = {
  id: string;
  name: string;
  kind: "pipeline" | "task";
  color: string;
  icon: string;
};

type Props = {
  pos: ContextMenuPos;
  onClose: () => void;
  onAddPanel: (type: PanelType, at: { x: number; y: number }) => void;
  onImportBlueprint: () => void;
  onRunSentorTask: () => void;
  nodes?: NodeMenuItem[];
  onSpawnNode?: (nodeId: string, at: { x: number; y: number }) => void;
};

export function CanvasContextMenu({ pos, onClose, onAddPanel, onImportBlueprint, onRunSentorTask, nodes = [], onSpawnNode }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const escHandler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [onClose]);

  const at = { x: pos.canvasX, y: pos.canvasY };

  const item = (label: string, onClick: () => void, highlight = false, disabled = false) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => { if (!disabled) { onClick(); onClose(); } }}
      className={[
        "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[12px] transition-colors",
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
        highlight
          ? "text-[#c8f560] hover:bg-[#1a1a1a]"
          : "text-[#888] hover:bg-[#1a1a1a] hover:text-[#f5f5f5]",
      ].join(" ")}
    >
      {label}
    </button>
  );

  const sep = () => <div className="my-1 h-px bg-[#252525]" />;
  const sectionLabel = (text: string) => (
    <div className="px-2.5 pb-0.5 pt-1.5 font-mono text-[9px] uppercase tracking-widest text-[#555]">
      {text}
    </div>
  );

  return (
    <div
      ref={ref}
      style={{ left: pos.x, top: pos.y }}
      className="absolute z-50 min-w-[200px] rounded-md border border-[#333] bg-[#1e1e1e] p-1.5"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {sectionLabel("Canvas")}
      {item("⊕  Add Agent", () => onAddPanel("agent", at), true)}
      {sep()}
      {sectionLabel("Add Panel")}
      {item("⌂  Vault Home", () => onAddPanel("vault-home", at))}
      {item("$  New terminal here", () => onAddPanel("terminal", at))}
      {item("{}  Editor", () => onAddPanel("editor", at))}
      {item("⊕  Web", () => onAddPanel("web", at))}
      {item("💬  Chat", () => onAddPanel("chat", at))}
      {item("⊞  Sub Canvas", () => onAddPanel("canvas", at))}
      {item("◈  Atlas Instance", () => onAddPanel("instance", at))}
      {item("◈  Code Graph", () => onAddPanel("codegraph", at))}
      {sep()}
      {sectionLabel("Data")}
      {item("→  Input node", () => onAddPanel("input", at))}
      {sep()}
      {sectionLabel("Nodes")}
      {nodes.length === 0
        ? item("atlas node new <id> ile ekle", () => {}, false, true)
        : nodes.map((n) =>
            item(
              `${n.icon}  ${n.name}`,
              () => onSpawnNode?.(n.id, at),
              n.kind === "pipeline",
            ),
          )}
      {sep()}
      {sectionLabel("Sentor")}
      {item("▶  Run task / pipeline…", onRunSentorTask, true)}
      {sep()}
      {sectionLabel("Blueprint")}
      {item("◈  Import Blueprint", onImportBlueprint)}
    </div>
  );
}
