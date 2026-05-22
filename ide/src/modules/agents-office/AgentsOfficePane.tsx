import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { useAgentsStore } from "@/modules/ai/store/agentsStore";
import { AGENT_ICONS } from "@/modules/ai/components/AgentSwitcher";
import { SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Agent } from "@/modules/ai/lib/agents";

interface Snapshot {
  agent: string;
  state: Record<string, unknown>;
  recent_log: string[];
  open_projects: string[];
}

interface AgentsOfficePaneProps {
  agentSlug: string;
}

export function AgentsOfficePane({ agentSlug }: AgentsOfficePaneProps) {
  const agents = useAgentsStore((s) => s.all());
  const activeId = useAgentsStore((s) => s.activeId);
  const slug = agentSlug || deriveSlug(agents.find((a) => a.id === activeId));

  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logInput, setLogInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = () => {
    if (!slug) return;
    invoke<Snapshot>("vault_agent_snapshot", { slug })
      .then(setSnap)
      .catch((e) => setError(String(e)));
  };

  useEffect(() => {
    setSnap(null);
    setError(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    const unlisten = listen("vault:reindexed", () => load());
    return () => { void unlisten.then((fn) => fn()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [snap?.recent_log.length]);

  const submitLog = async () => {
    if (!logInput.trim() || !slug) return;
    setSubmitting(true);
    try {
      await invoke("vault_agent_log", { slug, event: "note", msg: logInput.trim() });
      setLogInput("");
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (!slug) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-[#555]">
        No agent selected
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <span className="text-[11px] text-[#888]">Agent office not found</span>
        <span className="text-[10px] text-[#555]">{error}</span>
        <span className="text-[10px] text-[#444]">vault/agents/{slug}/ must exist</span>
      </div>
    );
  }

  if (!snap) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-[#555]">
        Loading…
      </div>
    );
  }

  const agent = agents.find((a) => deriveSlug(a) === slug);
  const IconComp = agent ? (AGENT_ICONS[agent.icon] ?? SparklesIcon) : SparklesIcon;
  const fmEntries = Object.entries(snap.state).filter(([k]) => k !== "updated");
  const updatedAt = snap.state.updated as string | undefined;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#0a0a0a] text-[#f5f5f5]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[#2a2a2a] px-4 py-2">
        <HugeiconsIcon icon={IconComp} size={16} strokeWidth={1.75} className="text-[#5b8def]" />
        <div className="flex-1">
          <div className="text-[12px] font-medium">{agent?.name ?? slug}</div>
          {updatedAt && (
            <div className="text-[10px] text-[#555]">updated {updatedAt}</div>
          )}
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded bg-[#1a1a1a] px-2 py-0.5 text-[10px] text-[#888] hover:bg-[#222] hover:text-[#f5f5f5]"
        >
          Refresh
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto">
        {/* State */}
        {fmEntries.length > 0 && (
          <section className="shrink-0 border-b border-[#1a1a1a] px-4 py-3">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-[#555]">
              State
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              {fmEntries.map(([k, v]) => (
                <div key={k} className="contents text-[11px]">
                  <span className="text-[#888]">{k}</span>
                  <span className="truncate text-[#f5f5f5]">
                    {Array.isArray(v) ? v.join(", ") : String(v ?? "")}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Open projects */}
        {snap.open_projects.length > 0 && (
          <section className="shrink-0 border-b border-[#1a1a1a] px-4 py-3">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-[#555]">
              Projects
            </div>
            <div className="flex flex-wrap gap-1.5">
              {snap.open_projects.map((p) => (
                <span
                  key={p}
                  className="rounded border border-[#2a2a2a] bg-[#111] px-2 py-0.5 text-[10px] text-[#888]"
                >
                  {p}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Log */}
        <section className="flex min-h-0 flex-1 flex-col px-4 py-3">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-[#555]">
            Recent log
          </div>
          {snap.recent_log.length === 0 ? (
            <span className="text-[10px] text-[#444]">No entries yet</span>
          ) : (
            <div className="flex flex-col gap-0.5">
              {snap.recent_log.map((line, i) => (
                <LogLine key={i} line={line} />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </section>
      </div>

      {/* Quick log input */}
      <div className="flex shrink-0 items-center gap-1.5 border-t border-[#2a2a2a] px-3 py-2">
        <input
          value={logInput}
          onChange={(e) => setLogInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) void submitLog(); }}
          placeholder="Log a note…"
          className="h-6 flex-1 rounded bg-[#1a1a1a] px-2 text-[11px] text-[#f5f5f5] placeholder-[#444] outline-none focus:bg-[#222]"
        />
        <button
          type="button"
          onClick={() => void submitLog()}
          disabled={submitting || !logInput.trim()}
          className="h-6 rounded bg-[#1a1a1a] px-2 text-[10px] text-[#888] hover:bg-[#222] hover:text-[#f5f5f5] disabled:opacity-40"
        >
          Log
        </button>
      </div>
    </div>
  );
}

function LogLine({ line }: { line: string }) {
  const eventMatch = line.match(/\[([^\]]+)\]/);
  const eventType = eventMatch?.[1] ?? "";
  const color =
    eventType === "decision" ? "text-[#5b8def]"
    : eventType === "error" ? "text-[#e06c75]"
    : eventType === "progress" ? "text-[#98c379]"
    : "text-[#888]";

  return (
    <div className="font-mono text-[10px] leading-5">
      <span className={`mr-1.5 ${color}`}>{eventMatch ? `[${eventType}]` : ""}</span>
      <span className="text-[#666]">{line.replace(/^\S+\s+\[[^\]]+\]\s*/, "")}</span>
    </div>
  );
}

function deriveSlug(agent: Agent | undefined): string {
  if (!agent) return "";
  if (agent.id.startsWith("builtin:")) return agent.id.slice("builtin:".length);
  return agent.id;
}
