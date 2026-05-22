import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useLogStore, type LogLevel } from "./logStore";

const LEVEL_COLOR: Record<LogLevel, string> = {
  log: "#888888",
  info: "#5b8def",
  warn: "#f5a623",
  error: "#f87171",
  debug: "#444444",
  agent: "#4ade80",
  system: "#666666",
};

const LEVEL_LABEL: Record<LogLevel, string> = {
  log: "LOG",
  info: "INF",
  warn: "WRN",
  error: "ERR",
  debug: "DBG",
  agent: "AGT",
  system: "SYS",
};

export function LogPane() {
  const entries = useLogStore((s) => s.entries);
  const clear = useLogStore((s) => s.clear);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll only when already at the bottom
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [entries]);

  return (
    <div className="flex h-full flex-col overflow-hidden font-mono">
      {/* Header */}
      <div className="flex h-5 shrink-0 items-center gap-1.5 border-b border-[#1a1a1a] bg-[#0a0a0a]/90 px-2">
        <span className="size-1.5 rounded-full bg-[#4ade80]" />
        <span className="text-[9px] font-medium tracking-wide text-[#555]">LOGS</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={clear}
          className="text-[9px] text-[#444] transition-colors hover:text-[#888]"
        >
          clear
        </button>
      </div>

      {/* Entries */}
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#2a2a2a transparent" }}
      >
        {entries.length === 0 && (
          <div className="px-2 pt-2 text-[9px] text-[#333]">No logs yet.</div>
        )}
        {entries.map((e) => (
          <div
            key={e.id}
            className="flex min-w-0 gap-1.5 px-2 py-px leading-[15px]"
          >
            <span className="shrink-0 text-[9px] text-[#333]">
              {new Date(e.ts).toISOString().slice(11, 23)}
            </span>
            <span
              className="w-6 shrink-0 text-right text-[9px] font-bold"
              style={{ color: LEVEL_COLOR[e.level] }}
            >
              {LEVEL_LABEL[e.level]}
            </span>
            <span
              className={cn(
                "min-w-0 break-all text-[10px]",
                e.level === "error"
                  ? "text-[#f87171]"
                  : e.level === "warn"
                    ? "text-[#f5a623]"
                    : e.level === "agent"
                      ? "text-[#4ade80]"
                      : e.level === "system"
                        ? "text-[#666]"
                        : "text-[#888]",
              )}
            >
              {e.message}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
