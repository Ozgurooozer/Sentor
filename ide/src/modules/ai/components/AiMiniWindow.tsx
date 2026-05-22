import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextTrigger,
} from "@/components/ai-elements/context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useChat, type UIMessage } from "@ai-sdk/react";
import {
  Add01Icon,
  AlertCircleIcon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  Delete02Icon,
  FilterIcon,
  TerminalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BAR_HEIGHT } from "@/lib/constants";
import { getModel, getModelContextLimit } from "../config";
import type { SessionMeta } from "../lib/sessions";
import { useAgentsStore } from "../store/agentsStore";
import { getOrCreateChat, useChatStore } from "../store/chatStore";
import { usePlanStore } from "../store/planStore";
import { AgentSwitcher } from "./AgentSwitcher";
import { AiChatView } from "./AiChat";
import { PlanDiffReview } from "./PlanDiffReview";
import { TodoStrip } from "./TodoStrip";
import { useZoneRegistration, ZoneType } from "@/modules/input";

const SUGGESTIONS = [
  {
    label: "Explain the last error",
    hint: "Read the terminal buffer",
    icon: AlertCircleIcon,
    text: "Explain the last error in the terminal.",
  },
  {
    label: "Generate a command",
    hint: "Tell me what you want to do",
    icon: TerminalIcon,
    text: "Give me a command to ",
  },
  {
    label: "Summarize buffer",
    hint: "Recap recent activity",
    icon: FilterIcon,
    text: "Summarize what just happened in the terminal.",
  },
];

type DragOrigin = { mx: number; my: number; px: number; py: number };

const DEFAULT_W = 544;
const DEFAULT_H = 672;
const MIN_W = 320;
const MIN_H = 280;
const GAP_BOTTOM = 12;
const GAP_TOP = 16;

export function AiMiniWindow({
  className,
  isFocused,
  onBoundsChange,
}: {
  className?: string;
  isFocused?: boolean;
  /** Called after drag/resize so the caller can re-sync the OS hit region. */
  onBoundsChange?: () => void;
} = {}) {
  const closeMini = useChatStore((s) => s.closeMini);
  const sessionId = useChatStore((s) => s.activeSessionId);
  const openPanel = useChatStore((s) => s.openPanel);
  const expandToPanel = () => {
    closeMini();
    openPanel();
  };

  const containerRef = useRef<HTMLDivElement>(null);

  useZoneRegistration(containerRef, ZoneType.Panel, { zIndex: 200, enabled: !!isFocused });

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  // User-controlled size in focused mode; null = CSS defaults
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // Live size ref for drag/resize clamping — always reflects actual displayed size
  const sizeRef = useRef({ w: DEFAULT_W, h: DEFAULT_H });

  const dragOrigin = useRef<DragOrigin | null>(null);

  // Layout function — called on mount (when isFocused=true) and on resize
  const doLayout = useCallback(() => {
    const available = window.innerHeight - BAR_HEIGHT - GAP_BOTTOM - GAP_TOP;
    const h = Math.max(MIN_H, Math.min(DEFAULT_H, available));
    const w = Math.min(DEFAULT_W, Math.max(MIN_W, window.innerWidth - 32));
    sizeRef.current = { w, h };
    setSize({ w, h });
    const y = Math.max(GAP_TOP, window.innerHeight - BAR_HEIGHT - GAP_BOTTOM - h);
    const x = Math.max(16, window.innerWidth - w - 16);
    setPos({ x, y });
  }, []);

  useEffect(() => {
    if (!isFocused) {
      setPos(null);
      setSize(null);
      sizeRef.current = { w: DEFAULT_W, h: DEFAULT_H };
      return;
    }
    doLayout();
    window.addEventListener("resize", doLayout);
    return () => window.removeEventListener("resize", doLayout);
  }, [isFocused, doLayout]);

  useEffect(() => {
    if (!onBoundsChange || pos === null) return;
    onBoundsChange();
  }, [pos, size, onBoundsChange]);

  // ── Drag ────────────────────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button,[role="button"],input,textarea,select,[data-resize-handle]')) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    dragOrigin.current = { mx: e.clientX, my: e.clientY, px: rect.left, py: rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragOrigin.current) return;
    const dx = e.clientX - dragOrigin.current.mx;
    const dy = e.clientY - dragOrigin.current.my;
    const { w, h } = sizeRef.current;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - w, dragOrigin.current.px + dx)),
      y: Math.max(0, Math.min(window.innerHeight - h, dragOrigin.current.py + dy)),
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!dragOrigin.current) return;
    dragOrigin.current = null;
    onBoundsChange?.();
  }, [onBoundsChange]);

  // ── Resize (bottom-right corner + right edge + bottom edge) ─────────────────
  const resizeOrigin = useRef<{
    mx: number; my: number;
    origW: number; origH: number;
    origX: number; origY: number;
    edge: string;
  } | null>(null);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, edge: string) => {
      e.stopPropagation();
      if (!containerRef.current || !pos) return;
      resizeOrigin.current = {
        mx: e.clientX, my: e.clientY,
        origW: sizeRef.current.w, origH: sizeRef.current.h,
        origX: pos.x, origY: pos.y,
        edge,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pos],
  );

  const onResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const r = resizeOrigin.current;
      if (!r) return;
      const dx = e.clientX - r.mx;
      const dy = e.clientY - r.my;
      let { origW: w, origH: h, origX: x, origY: y } = r;

      if (r.edge.includes("e")) w = Math.max(MIN_W, r.origW + dx);
      if (r.edge.includes("s")) h = Math.max(MIN_H, r.origH + dy);
      if (r.edge.includes("w")) {
        const nw = Math.max(MIN_W, r.origW - dx);
        x = r.origX + (r.origW - nw);
        w = nw;
      }
      if (r.edge.includes("n")) {
        const nh = Math.max(MIN_H, r.origH - dy);
        y = r.origY + (r.origH - nh);
        h = nh;
      }

      sizeRef.current = { w, h };
      setSize({ w, h });
      setPos({ x, y });
    },
    [],
  );

  const onResizePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      resizeOrigin.current = null;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      onBoundsChange?.();
    },
    [onBoundsChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        closeMini();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeMini]);

  const posStyle: React.CSSProperties | undefined = pos
    ? {
        left: pos.x,
        top: pos.y,
        right: "auto",
        bottom: "auto",
        width: size?.w,
        height: size?.h,
      }
    : undefined;

  const dragHandlers = isFocused
    ? {
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        style: { touchAction: "none" as const, userSelect: "none" as const },
      }
    : undefined;

  const resizeHandle = (edge: string, cls: string) =>
    isFocused ? (
      <div
        key={edge}
        data-resize-handle
        className={cn("absolute z-20", cls)}
        onPointerDown={(e) => onResizePointerDown(e, edge)}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
      />
    ) : null;

  // Render via portal so no parent overflow:hidden / CSS transform can clip us.
  // Mount uses a simple Tailwind enter animation (no exit anim — component unmounts).
  return createPortal(
    <div
      ref={containerRef}
      data-ai-mini-window
      className={cn(
        "duration-200 ease-out animate-in fade-in slide-in-from-bottom-2",
        "no-scrollbar-deep fixed right-4 bottom-[96px] z-[9000] flex h-[42rem] w-[34rem] flex-col overflow-hidden",
        // Prevent the window from overflowing in small windows / after mode-switch
        "max-h-[calc(100vh-9rem)]",
        // Canvas-panel theme: single border, no shadow, light backdrop blur only.
        "rounded-lg border border-[#2a2a2a] bg-[#0a0a0a]/97 backdrop-blur-sm",
        "text-[12px]",
        pos && "right-auto bottom-auto",
        className,
      )}
      style={posStyle}
    >
      {sessionId ? (
        <Body
          sessionId={sessionId}
          onClose={closeMini}
          onExpand={expandToPanel}
          dragHandlers={dragHandlers}
        />
      ) : (
        <EmptyShell onClose={closeMini} onExpand={expandToPanel} dragHandlers={dragHandlers} />
      )}
      <PlanDiffReview />
      {/* Resize handles — only active in focused mode */}
      {resizeHandle("n", "inset-x-2 top-0 h-1.5 cursor-n-resize")}
      {resizeHandle("s", "inset-x-2 bottom-0 h-1.5 cursor-s-resize")}
      {resizeHandle("w", "inset-y-2 left-0 w-1.5 cursor-w-resize")}
      {resizeHandle("e", "inset-y-2 right-0 w-1.5 cursor-e-resize")}
      {resizeHandle("nw", "left-0 top-0 h-3 w-3 cursor-nw-resize")}
      {resizeHandle("ne", "right-0 top-0 h-3 w-3 cursor-ne-resize")}
      {resizeHandle("sw", "left-0 bottom-0 h-3 w-3 cursor-sw-resize")}
      {resizeHandle("se", "right-0 bottom-0 h-3 w-3 cursor-se-resize")}
    </div>,
    document.body,
  );
}

type HeaderDragHandlers = {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  style?: React.CSSProperties;
} | undefined;

function Body({
  sessionId,
  onClose,
  onExpand,
  dragHandlers,
}: {
  sessionId: string;
  onClose: () => void;
  onExpand: () => void;
  dragHandlers: HeaderDragHandlers;
}) {
  const focusInput = useChatStore((s) => s.focusInput);
  const step = useChatStore((s) => s.agentMeta.step);

  const chat = useMemo(() => getOrCreateChat(sessionId), [sessionId]);
  const helpers = useChat<UIMessage>({ chat });
  const isBusy =
    helpers.status === "submitted" || helpers.status === "streaming";

  return (
    <>
      <Header
        step={step}
        isBusy={isBusy}
        onClose={onClose}
        onExpand={onExpand}
        messages={helpers.messages}
        dragHandlers={dragHandlers}
      />

      <PlanModeStrip />

      <div className="flex min-h-0 flex-1 flex-col">
        {helpers.messages.length === 0 ? (
          <EmptyState onPick={focusInput} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col [&_.text-sm]:text-[12px] [&_p]:leading-relaxed">
            <AiChatView
              messages={helpers.messages}
              status={helpers.status}
              error={helpers.error}
              clearError={helpers.clearError}
              addToolApprovalResponse={helpers.addToolApprovalResponse}
              stop={helpers.stop}
            />
          </div>
        )}
      </div>

      <TodoStrip sessionId={sessionId} />
    </>
  );
}

function PlanModeStrip() {
  const active = usePlanStore((s) => s.active);
  const queueLen = usePlanStore((s) => s.queue.length);
  const disable = usePlanStore((s) => s.disable);
  if (!active) return null;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border/40 bg-muted/40 px-3 py-1.5">
      <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />
      <span className="text-[11px] font-medium text-foreground">Plan mode</span>
      <span className="text-[11px] text-muted-foreground">
        {queueLen > 0 ? `· ${queueLen} queued` : "· no edits queued"}
      </span>
      <span className="flex-1" />
      <button
        type="button"
        onClick={() => disable()}
        className="rounded px-1.5 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        Exit
      </button>
    </div>
  );
}

function EmptyShell({
  onClose,
  onExpand,
  dragHandlers,
}: {
  onClose: () => void;
  onExpand: () => void;
  dragHandlers: HeaderDragHandlers;
}) {
  return (
    <>
      <Header
        step={null}
        isBusy={false}
        onClose={onClose}
        onExpand={onExpand}
        dragHandlers={dragHandlers}
      />
      <div className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground">
        Loading sessions…
      </div>
    </>
  );
}

function Header({
  step,
  isBusy,
  onClose,
  messages,
  dragHandlers,
}: {
  step: string | null;
  isBusy: boolean;
  onClose: () => void;
  onExpand: () => void;
  messages?: UIMessage[];
  dragHandlers: HeaderDragHandlers;
}) {
  const customAgents = useAgentsStore((s) => s.customAgents);
  void customAgents;

  const scrollToTop = useCallback(() => {
    window.dispatchEvent(new Event("atlas:scroll-chat-top"));
  }, []);

  return (
    <div
      {...dragHandlers}
      className={cn(
        "relative flex h-9 shrink-0 items-center justify-between gap-2 border-b border-[#2a2a2a] bg-[#111111] px-2",
        dragHandlers && "cursor-grab active:cursor-grabbing",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <AgentSwitcher isMiniWindow />
        {messages !== undefined ? (
          <ContextIndicator messages={messages} />
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {isBusy ? (
          <span className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
            <Spinner className="size-2.5" />
            <span className="max-w-32 truncate">{step ?? "Thinking…"}</span>
          </span>
        ) : null}
        <SessionPicker />
        {/* Scroll to top of conversation */}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={scrollToTop}
          className="size-5"
          aria-label="Scroll to top"
          title="Scroll to top"
        >
          <HugeiconsIcon icon={ArrowUp01Icon} size={11} strokeWidth={1.75} />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onClose}
          className="size-5"
          aria-label="Close"
          title="Close (Esc)"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={1.75} />
        </Button>
      </div>
    </div>
  );
}

function estimateTokens(messages: UIMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.type === "text") {
        chars += (p as { text?: string }).text?.length ?? 0;
      } else if (p.type === "reasoning") {
        chars += (p as { text?: string }).text?.length ?? 0;
      } else if (typeof p.type === "string" && p.type.startsWith("tool-")) {
        const tp = p as unknown as { input?: unknown; output?: unknown };
        if (tp.input) chars += JSON.stringify(tp.input).length;
        if (tp.output) chars += JSON.stringify(tp.output).length;
      }
    }
  }
  return Math.ceil(chars / 4);
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function ContextIndicator({ messages }: { messages: UIMessage[] }) {
  const modelId = useChatStore((s) => s.selectedModelId);
  const used = useMemo(() => estimateTokens(messages), [messages]);
  const max = getModelContextLimit(modelId);
  const modelLabel = useMemo(() => {
    try {
      return getModel(modelId).label;
    } catch {
      return modelId;
    }
  }, [modelId]);

  return (
    <Context usedTokens={used} maxTokens={max} modelId={modelId}>
      <ContextTrigger className="h-6 gap-1 px-0 text-[10.5px]" />
      <ContextContent className="w-64 text-[11px]">
        <ContextContentHeader />
        <ContextContentBody>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Model</span>
            <span className="font-mono text-foreground">{modelLabel}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-muted-foreground">
            <span>Estimated used</span>
            <span className="font-mono text-foreground">
              {formatTokens(used)}
            </span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Window</span>
            <span className="font-mono text-foreground">
              {formatTokens(max)}
            </span>
          </div>
        </ContextContentBody>
        <ContextContentFooter>
          <span className="text-[10px] italic text-muted-foreground">
            Token count is approximate (chars / 4).
          </span>
        </ContextContentFooter>
      </ContextContent>
    </Context>
  );
}

function SessionPicker() {
  const sessions = useChatStore((s) => s.sessions);
  const activeId = useChatStore((s) => s.activeSessionId);
  const switchSession = useChatStore((s) => s.switchSession);
  const newSession = useChatStore((s) => s.newSession);
  const deleteSession = useChatStore((s) => s.deleteSession);

  const active = sessions.find((s) => s.id === activeId) ?? null;
  if (!active) return null;

  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex min-w-0 max-w-48 items-center gap-1 rounded-md px-1.5 py-1",
            "text-[11px] text-muted-foreground transition-colors",
            "hover:bg-accent hover:text-foreground",
          )}
          title="Switch session"
        >
          <span className="truncate">{active.title || "New chat"}</span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={10}
            strokeWidth={2}
            className="opacity-70"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuItem
          onSelect={() => newSession()}
          className="gap-2 text-xs"
        >
          <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={1.75} />
          New session
        </DropdownMenuItem>
        {sorted.length > 0 ? <DropdownMenuSeparator /> : null}
        {sorted.map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            active={s.id === activeId}
            onSelect={() => switchSession(s.id)}
            onDelete={() => deleteSession(s.id)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SessionRow({
  session,
  active,
  onSelect,
  onDelete,
}: {
  session: SessionMeta;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenuItem
      onSelect={(e) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest("[data-session-delete]")) {
          e.preventDefault();
          return;
        }
        onSelect();
      }}
      className={cn(
        "group flex items-center justify-between gap-2 text-xs",
        active && "bg-accent/40",
      )}
    >
      <span className="min-w-0 flex-1 truncate">
        {session.title || "New chat"}
      </span>
      <button
        type="button"
        data-session-delete
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete session"
        className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
      >
        <HugeiconsIcon icon={Delete02Icon} size={11} strokeWidth={1.75} />
      </button>
    </DropdownMenuItem>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-10 text-center">
      <img src="/logo.png" alt="Atlas" className="size-14 opacity-90" />
      <div className="space-y-1.5">
        <p className="text-[14px] font-semibold tracking-tight">
          Ask Atlas anything
        </p>
        <p className="max-w-[18rem] text-[11.5px] leading-relaxed text-muted-foreground">
          Atlas sees the active terminal — cwd, recent commands, and output.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onPick(s.text)}
            className={cn(
              "group flex items-center gap-2.5 bg-card/70 rounded-lg px-2.5 py-2 border border-border text-left",
              "transition-colors hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground transition-colors group-hover:bg-foreground/5 group-hover:text-foreground">
              <HugeiconsIcon icon={s.icon} size={13} strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-medium text-foreground">
                {s.label}
              </div>
              <div className="text-[10.5px] text-muted-foreground">
                {s.hint}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
