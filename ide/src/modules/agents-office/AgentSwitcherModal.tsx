import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AGENT_ICONS } from "@/modules/ai/components/AgentSwitcher";
import { useAgentsStore } from "@/modules/ai/store/agentsStore";
import { SparklesIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import type { Agent } from "@/modules/ai/lib/agents";

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenOffice?: (agentSlug: string) => void;
}

function deriveSlug(agent: Agent): string {
  if (agent.id.startsWith("builtin:")) return agent.id.slice("builtin:".length);
  return agent.id;
}

export function AgentSwitcherModal({ open, onClose, onOpenOffice }: Props) {
  const customAgents = useAgentsStore((s) => s.customAgents);
  const activeId = useAgentsStore((s) => s.activeId);
  const setActiveId = useAgentsStore((s) => s.setActiveId);
  void customAgents;

  const all = useAgentsStore.getState().all();
  const [focusIdx, setFocusIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const idx = all.findIndex((a) => a.id === activeId);
    setFocusIdx(Math.max(0, idx));
  }, [open, activeId, all.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(all.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        const a = all[focusIdx];
        if (a) { setActiveId(a.id); onClose(); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, focusIdx, all, setActiveId, onClose]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md border-[#2a2a2a] bg-[#111] p-0 text-[#f5f5f5]">
        <DialogHeader className="border-b border-[#2a2a2a] px-4 py-3">
          <DialogTitle className="text-[13px] font-medium text-[#f5f5f5]">
            Switch Agent
          </DialogTitle>
        </DialogHeader>

        <div ref={listRef} className="flex flex-col py-1">
          {all.map((agent, idx) => {
            const Icon = AGENT_ICONS[agent.icon] ?? SparklesIcon;
            const isActive = agent.id === activeId;
            const isFocused = idx === focusIdx;
            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => { setActiveId(agent.id); onClose(); }}
                onMouseEnter={() => setFocusIdx(idx)}
                className={cn(
                  "flex items-start gap-3 px-4 py-2.5 text-left transition-colors",
                  isFocused ? "bg-[#1a1a1a]" : "hover:bg-[#181818]",
                )}
              >
                <HugeiconsIcon
                  icon={Icon}
                  size={15}
                  strokeWidth={1.75}
                  className={cn(
                    "mt-0.5 shrink-0",
                    isActive ? "text-[#5b8def]" : "text-[#555]",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-medium">{agent.name}</span>
                    {!agent.builtIn && (
                      <span className="rounded border border-[#2a2a2a] px-1 text-[9px] text-[#555]">
                        custom
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[#888]">
                    {agent.description}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {isActive && (
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      size={13}
                      strokeWidth={2}
                      className="text-[#5b8def]"
                    />
                  )}
                  {onOpenOffice && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenOffice(deriveSlug(agent));
                        onClose();
                      }}
                      className="rounded px-1.5 py-0.5 text-[9px] text-[#555] hover:bg-[#222] hover:text-[#888]"
                    >
                      Office →
                    </button>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="border-t border-[#1a1a1a] px-4 py-2">
          <span className="text-[10px] text-[#444]">
            ↑↓ navigate · Enter select · Esc close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
