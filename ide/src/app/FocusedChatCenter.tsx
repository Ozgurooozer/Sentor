import { useRef } from "react";
import { AiInputBar, AiInputBarConnect } from "@/modules/ai/components/AiInputBar";
import { useChatStore } from "@/modules/ai/store/chatStore";
import { cn } from "@/lib/utils";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cursor01Icon,
  LayoutLeftIcon,
  LayoutTopIcon,
  MessageMultiple01Icon,
  Minimize01Icon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useZoneRegistration, ZoneType } from "@/modules/input";
import { BAR_HEIGHT, BAR_HEIGHT_COLLAPSED } from "@/lib/constants";
import { LogPane } from "@/modules/logs/LogPane";

type Props = {
  keysLoaded: boolean;
  hasComposer: boolean;
  onOpenSettings: () => void;
  onOpenChat: () => void;
  clickThrough: boolean;
  onToggleClickThrough: () => void;
  onExitFocusedMode: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Collapsible top header (tab bar) */
  topOpen: boolean;
  onToggleTop: () => void;
  /** Collapsible left panel (file explorer) */
  leftOpen: boolean;
  onToggleLeft: () => void;
};

export function FocusedBar({
  keysLoaded,
  hasComposer,
  onOpenSettings,
  onOpenChat,
  clickThrough,
  onToggleClickThrough,
  onExitFocusedMode,
  collapsed,
  onToggleCollapsed,
  topOpen,
  onToggleTop,
  leftOpen,
  onToggleLeft,
}: Props) {
  const isBusy = useChatStore(
    (s) => s.agentMeta.status === "thinking" || s.agentMeta.status === "streaming",
  );

  const barRef = useRef<HTMLDivElement>(null);
  useZoneRegistration(barRef, ZoneType.Bar, { zIndex: 100 });

  return (
    <div
      ref={barRef}
      style={{ height: collapsed ? BAR_HEIGHT_COLLAPSED : BAR_HEIGHT }}
      className={cn(
        "flex shrink-0 border-t border-border/50",
        "bg-[#111111]/95 backdrop-blur-xl",
      )}
    >
      {/* Left: log pane — hidden when collapsed */}
      {!collapsed && (
        <div className="relative w-[240px] shrink-0 overflow-hidden border-r border-border/40">
          <LogPane />
        </div>
      )}

      {/* Right: Atlas logo + input bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header row — drag region */}
        <div
          data-tauri-drag-region
          className="flex h-9 shrink-0 items-center gap-1 border-b border-border/40 px-3"
        >
          {/* Atlas logo */}
          <span className="flex size-[18px] items-center justify-center rounded-md bg-[#5b8def]/20">
            <span
              className={cn(
                "size-2 rounded-full bg-[#5b8def] transition-all duration-300",
                isBusy && "animate-pulse",
              )}
            />
          </span>
          <span className="text-[11px] font-semibold tracking-tight text-[#f5f5f5]">
            Atlas
          </span>

          <span className="flex-1" />

          {/* Top header toggle */}
          <button
            type="button"
            onClick={onToggleTop}
            title={topOpen ? "Hide tab bar" : "Show tab bar"}
            className={cn(
              "flex size-6 items-center justify-center rounded transition-colors",
              topOpen
                ? "bg-[#5b8def]/20 text-[#5b8def]"
                : "text-[#888888] hover:bg-[#1a1a1a] hover:text-[#f5f5f5]",
            )}
          >
            <HugeiconsIcon icon={LayoutTopIcon} size={13} strokeWidth={1.75} />
          </button>

          {/* Left panel toggle */}
          <button
            type="button"
            onClick={onToggleLeft}
            title={leftOpen ? "Hide file panel" : "Show file panel"}
            className={cn(
              "flex size-6 items-center justify-center rounded transition-colors",
              leftOpen
                ? "bg-[#5b8def]/20 text-[#5b8def]"
                : "text-[#888888] hover:bg-[#1a1a1a] hover:text-[#f5f5f5]",
            )}
          >
            <HugeiconsIcon icon={LayoutLeftIcon} size={13} strokeWidth={1.75} />
          </button>

          {/* Collapse / expand bar */}
          <button
            type="button"
            onClick={onToggleCollapsed}
            title={collapsed ? "Expand bar" : "Collapse bar (canvas only)"}
            className="flex size-6 items-center justify-center rounded text-[#888888] transition-colors hover:bg-[#1a1a1a] hover:text-[#f5f5f5]"
          >
            <HugeiconsIcon
              icon={collapsed ? ArrowUp01Icon : ArrowDown01Icon}
              size={13}
              strokeWidth={1.75}
            />
          </button>

          {/* Desktop click-through toggle */}
          <button
            type="button"
            onClick={onToggleClickThrough}
            title={
              clickThrough
                ? "Click-through ON — click to disable"
                : "Enable desktop click-through (Ctrl+Alt+P)"
            }
            className={cn(
              "flex size-6 items-center justify-center rounded transition-colors",
              clickThrough
                ? "bg-[#5b8def]/20 text-[#5b8def]"
                : "text-[#888888] hover:bg-[#1a1a1a] hover:text-[#f5f5f5]",
            )}
          >
            <HugeiconsIcon icon={Cursor01Icon} size={13} strokeWidth={1.75} />
          </button>

          {/* Chat balloon toggle */}
          <button
            type="button"
            onClick={onOpenChat}
            title="Open chat"
            className="flex size-6 items-center justify-center rounded text-[#888888] transition-colors hover:bg-[#1a1a1a] hover:text-[#f5f5f5]"
          >
            <HugeiconsIcon icon={MessageMultiple01Icon} size={13} strokeWidth={1.75} />
          </button>

          {/* Exit focused mode */}
          <button
            type="button"
            onClick={onExitFocusedMode}
            title="Exit focused mode (switch to classic)"
            className="flex size-6 items-center justify-center rounded text-[#888888] transition-colors hover:bg-[#1a1a1a] hover:text-[#f5f5f5]"
          >
            <HugeiconsIcon icon={Minimize01Icon} size={13} strokeWidth={1.75} />
          </button>

          {/* Settings */}
          <button
            type="button"
            onClick={onOpenSettings}
            title="Settings"
            className="flex size-6 items-center justify-center rounded text-[#888888] transition-colors hover:bg-[#1a1a1a] hover:text-[#f5f5f5]"
          >
            <HugeiconsIcon icon={Settings01Icon} size={13} strokeWidth={1.75} />
          </button>
        </div>

        {/* Input area — hidden when collapsed */}
        {!collapsed && (
          <div className="min-h-0 flex-1 overflow-hidden" data-ai-input-bar>
            {keysLoaded ? (
              hasComposer ? (
                <AiInputBar />
              ) : (
                <AiInputBarConnect onAdd={onOpenSettings} />
              )
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
