import { useEffect, useRef, useState } from "react";
import { useLogStore, type LogEntry, type LogLevel } from "@/modules/logs/logStore";

const LEVEL_COLOR: Record<LogLevel, string> = {
  log:    "rgba(255,255,255,0.55)",
  info:   "#5b8def",
  warn:   "#d4a843",
  error:  "#ef5b5b",
  debug:  "rgba(255,255,255,0.25)",
  agent:  "#9b72ef",
  system: "#4db89a",
};

const LEVEL_BG: Record<LogLevel, string> = {
  log:    "transparent",
  info:   "transparent",
  warn:   "rgba(212,168,67,0.06)",
  error:  "rgba(239,91,91,0.08)",
  debug:  "transparent",
  agent:  "rgba(155,114,239,0.06)",
  system: "rgba(77,184,154,0.06)",
};


export function LogsPanel() {
  const entries = useLogStore((s) => s.entries);
  const clear = useLogStore((s) => s.clear);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<LogLevel | "all">("all");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);

  const filtered = entries.filter((e) => {
    if (filter !== "all" && e.level !== filter) return false;
    if (search && !e.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [filtered.length, autoScroll]);

  return (
    <div className="flex h-full flex-col" style={{ background: "#05060a", fontFamily: "'JetBrains Mono', monospace" }}>
      {/* Toolbar */}
      <div
        className="flex shrink-0 items-center gap-1.5 px-2 py-1.5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.3)" }}
      >
        {/* Level filter buttons */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-colors duration-150 ease-out"
            style={{ background: filter === "all" ? "rgba(255,255,255,0.10)" : "transparent", color: filter === "all" ? "#f5f5f5" : "rgba(255,255,255,0.25)" }}
          >
            all
          </button>
          {(["error", "warn", "info", "log", "debug"] as LogLevel[]).map((lvl) => {
            const count = entries.filter((e) => e.level === lvl).length;
            return (
              <button
                key={lvl}
                type="button"
                onClick={() => setFilter(lvl === filter ? "all" : lvl)}
                className="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-colors duration-150 ease-out"
                style={{
                  background: filter === lvl ? `${LEVEL_COLOR[lvl]}22` : "transparent",
                  color: filter === lvl ? LEVEL_COLOR[lvl] : "rgba(255,255,255,0.20)",
                }}
              >
                {lvl}{count > 0 && ` ${count}`}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        {/* Search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="filter…"
          className="rounded px-2 py-0.5 text-[10px] outline-none"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", color: "#f5f5f5", width: 100, fontFamily: "inherit" }}
        />

        {/* Auto-scroll toggle */}
        <button
          type="button"
          title="Auto-scroll"
          onClick={() => setAutoScroll((v) => !v)}
          className="rounded px-1.5 py-0.5 font-mono text-[9px] transition-colors duration-150 ease-out"
          style={{ color: autoScroll ? "#4db89a" : "rgba(255,255,255,0.2)", background: autoScroll ? "rgba(77,184,154,0.10)" : "transparent" }}
        >
          ↓
        </button>

        {/* Clear */}
        <button
          type="button"
          onClick={clear}
          className="rounded px-1.5 py-0.5 font-mono text-[9px] transition-colors duration-150 ease-out"
          style={{ color: "rgba(255,255,255,0.20)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#ef5b5b"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.20)"; }}
        >
          clear
        </button>
      </div>

      {/* Log entries */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
          setAutoScroll(atBottom);
        }}
      >
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.12)" }}>no entries</span>
          </div>
        ) : (
          filtered.map((entry) => <LogRow key={entry.id} entry={entry} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer */}
      <div
        className="shrink-0 flex items-center justify-between px-2 py-1"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.2)" }}
      >
        <span className="font-mono text-[9px]" style={{ color: "rgba(255,255,255,0.18)" }}>
          {filtered.length} / {entries.length} entries
        </span>
        <span className="font-mono text-[9px]" style={{ color: "rgba(255,255,255,0.12)" }}>
          sentor logs
        </span>
      </div>
    </div>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const time = new Date(entry.ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const isLong = entry.message.length > 120;
  const display = !expanded && isLong ? entry.message.slice(0, 120) + "…" : entry.message;

  return (
    <div
      className="group flex gap-2 px-2 py-0.5 hover:brightness-125"
      style={{ background: LEVEL_BG[entry.level], borderLeft: `2px solid ${entry.level === "error" || entry.level === "warn" ? LEVEL_COLOR[entry.level] : "transparent"}` }}
    >
      <span className="shrink-0 font-mono text-[9px] pt-[2px]" style={{ color: "rgba(255,255,255,0.18)", minWidth: 56 }}>{time}</span>
      <span className="shrink-0 font-mono text-[9px] uppercase pt-[2px]" style={{ color: LEVEL_COLOR[entry.level], minWidth: 38 }}>{entry.level}</span>
      <span
        className="flex-1 font-mono text-[10px] leading-[1.6] break-all cursor-pointer"
        style={{ color: LEVEL_COLOR[entry.level] === "rgba(255,255,255,0.55)" ? "rgba(255,255,255,0.55)" : LEVEL_COLOR[entry.level] }}
        onClick={() => isLong && setExpanded((v) => !v)}
      >
        {display}
      </span>
    </div>
  );
}
