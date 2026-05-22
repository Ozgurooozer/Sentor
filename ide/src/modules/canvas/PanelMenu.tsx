import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCanvasStore } from "./canvasStore";
import type { PanelType } from "./types";

type Item =
  | { type: PanelType; label: string; icon: string }
  | { separator: true };

const ITEMS: Item[] = [
  { type: "agent", label: "Agent", icon: "A" },
  { separator: true },
  { type: "terminal", label: "Terminal", icon: ">_" },
  { type: "editor", label: "Editor", icon: "{}" },
  { type: "preview", label: "Preview", icon: "◻" },
  { type: "vault-home", label: "Vault Home", icon: "⌂" },
  { type: "web", label: "Web", icon: "⊕" },
  { separator: true },
  { type: "chat", label: "Chat", icon: "💬" },
  { type: "canvas", label: "Sub Canvas", icon: "⊞" },
  { separator: true },
  { type: "header", label: "Header", icon: "◆" },
  { type: "checklist", label: "Checklist", icon: "✓" },
  { type: "gallery", label: "Gallery", icon: "⊞" },
];

interface Props {
  /** When set, the menu spawns panels as children of this parent canvas panel. */
  parentId?: string;
  /** Override trigger appearance — defaults to floating round 36px button. */
  variant?: "floating" | "compact";
}

export function PanelMenu({ parentId, variant = "floating" }: Props) {
  const addPanel = useCanvasStore((s) => s.addPanel);
  const addChildPanel = useCanvasStore((s) => s.addChildPanel);

  const spawn = (type: PanelType) => {
    if (parentId) addChildPanel(parentId, type);
    else addPanel(type);
  };

  const triggerCls =
    variant === "floating"
      ? "flex size-9 items-center justify-center rounded-full border border-[#2a2a2a] bg-[#0a0a0a]/90 text-[#888888] backdrop-blur-md transition-colors hover:border-[#404040] hover:bg-[#111111] hover:text-[#f5f5f5]"
      : "flex size-6 items-center justify-center rounded text-[#888888] transition-colors hover:bg-[#1a1a1a] hover:text-[#f5f5f5]";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Spawn a canvas panel"
          className={triggerCls}
        >
          <HugeiconsIcon icon={Add01Icon} size={variant === "floating" ? 16 : 13} strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        className="min-w-[160px] border-[#2a2a2a] bg-[#111111] p-1"
      >
        {ITEMS.map((item, idx) =>
          "separator" in item ? (
            <div key={`sep-${idx}`} className="my-1 h-px bg-[#2a2a2a]" />
          ) : (
            <DropdownMenuItem
              key={item.type}
              onClick={() => spawn(item.type)}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[11px] text-[#888888] hover:bg-[#1a1a1a] hover:text-[#f5f5f5] focus:bg-[#1a1a1a] focus:text-[#f5f5f5]"
            >
              <span className="w-4 text-center text-[10px]">{item.icon}</span>
              {item.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
