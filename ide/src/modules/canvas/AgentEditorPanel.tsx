import { useEffect, useState } from "react";
import { BUILTIN_AGENTS, type Agent } from "@/modules/ai/lib/agents";
import { useAgentsStore, newAgentId } from "@/modules/ai/store/agentsStore";
import { useCanvasStore } from "./canvasStore";

const AVAILABLE_TOOLS = [
  "vault_search",
  "vault_read",
  "vault_write",
  "web_search",
  "web_fetch",
  "read_file",
  "write_file",
  "list_directory",
  "bash_run",
  "canvas_read_state",
  "agent_spawn",
  "blueprint_save",
  "agent_invoke",
] as const;

type Memory = "session" | "ephemeral";

type Props = {
  panelId: string;
  onSave: (agent: Agent) => void;
  onCancel: () => void;
};

export function AgentEditorPanel({ panelId, onSave, onCancel }: Props) {
  const upsert = useAgentsStore((s) => s.upsert);
  const updatePanel = useCanvasStore((s) => s.updatePanel);

  const [name, setName] = useState("");

  // Mirror the agent name into the panel title as the user types.
  useEffect(() => {
    const trimmed = name.trim();
    updatePanel(panelId, { title: trimmed || "New Agent" });
  }, [name, panelId, updatePanel]);
  const [role, setRole] = useState("");
  const [baseId, setBaseId] = useState<string>("none");
  const [tools, setTools] = useState<string[]>(["vault_search", "vault_read"]);
  const [memory, setMemory] = useState<Memory>("session");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const toggleTool = (t: string) =>
    setTools((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) { setError("Agent name is required."); return; }
    if (tools.length === 0) { setError("Select at least 1 tool."); return; }

    const allAgents = useAgentsStore.getState().all();
    const nameTaken = allAgents.some((a) => a.name.toLowerCase() === trimmedName.toLowerCase());
    if (nameTaken) { setError(`"${trimmedName}" is already taken.`); return; }

    const base = BUILTIN_AGENTS.find((a) => a.id === baseId);
    const combinedPrompt = base
      ? `${base.instructions}\n\n---\n\n${prompt.trim()}`
      : prompt.trim();

    const agent: Agent = {
      id: newAgentId(),
      name: trimmedName,
      description: role.trim() || trimmedName,
      instructions: combinedPrompt || role.trim() || trimmedName,
      icon: "spark",
      builtIn: false,
      toolset: tools,
      memory,
    };

    upsert(agent);
    onSave(agent);
  };

  const bases = [
    { id: "none", label: "Sıfırdan" },
    ...BUILTIN_AGENTS.map((a) => ({ id: a.id, label: a.name })),
  ];

  return (
    <div className="flex h-full flex-col bg-[#0f0f0f] text-[#f5f5f5]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2.5">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-[rgba(167,139,250,0.2)] font-mono text-[11px] text-[#a78bfa]">
          A
        </span>
        <span className="flex-1 font-mono text-[11px] tracking-wide text-[#f5f5f5]">
          Define Agent
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">

        <Field label="AGENT NAME">
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null); }}
            placeholder="e.g. research-agent"
            className="w-full rounded border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-1.5 font-mono text-[11px] text-[#f5f5f5] outline-none focus:border-[#5b8def] focus:bg-[#111]"
          />
        </Field>

        <Field label="ROLE">
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="What does this agent do? (1 sentence)"
            className="w-full rounded border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-1.5 font-mono text-[11px] text-[#f5f5f5] outline-none focus:border-[#5b8def] focus:bg-[#111]"
          />
        </Field>

        <Field label="BASE AGENT">
          <div className="flex flex-wrap gap-1.5">
            {bases.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBaseId(b.id)}
                className={[
                  "rounded border px-2 py-1 font-mono text-[10px] transition-colors",
                  baseId === b.id
                    ? "border-[#5b8def] bg-[rgba(91,141,239,0.15)] text-[#5b8def]"
                    : "border-[#2a2a2a] bg-transparent text-[#888] hover:border-[#404040] hover:text-[#f5f5f5]",
                ].join(" ")}
              >
                {b.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="TOOLS">
          <div className="flex flex-wrap gap-1.5">
            {AVAILABLE_TOOLS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTool(t)}
                className={[
                  "rounded border px-2 py-1 font-mono text-[10px] transition-colors",
                  tools.includes(t)
                    ? "border-[#5b8def] bg-[rgba(91,141,239,0.12)] text-[#5b8def]"
                    : "border-[#2a2a2a] bg-transparent text-[#888] hover:border-[#404040] hover:text-[#f5f5f5]",
                ].join(" ")}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>

        <Field label="MEMORY">
          <div className="flex gap-2">
            {(["session", "ephemeral"] as Memory[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMemory(m)}
                className={[
                  "rounded border px-3 py-1 font-mono text-[10px] transition-colors",
                  memory === m
                    ? "border-[#5b8def] bg-[rgba(91,141,239,0.15)] text-[#5b8def]"
                    : "border-[#2a2a2a] bg-transparent text-[#888] hover:border-[#404040]",
                ].join(" ")}
              >
                {m === "session" ? "session — remembers history" : "ephemeral — fresh each time"}
              </button>
            ))}
          </div>
        </Field>

        <Field label="SYSTEM PROMPT">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              baseId !== "none"
                ? "Appended to the base agent prompt..."
                : "Write the system prompt here..."
            }
            rows={5}
            className="w-full resize-none rounded border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-1.5 font-mono text-[11px] text-[#f5f5f5] outline-none focus:border-[#5b8def] focus:bg-[#111]"
          />
        </Field>

        {error && (
          <div className="rounded border border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.08)] px-2 py-1.5 font-mono text-[10px] text-[#ef4444]">
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex gap-2 border-t border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded border border-[#2a2a2a] bg-transparent px-3 py-1.5 font-mono text-[10px] text-[#888] transition-colors hover:border-[#404040] hover:text-[#f5f5f5]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 rounded bg-[#c8f560] px-3 py-1.5 font-mono text-[10px] font-semibold text-[#0a0a0a] transition-colors hover:bg-[#d4ff6e]"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-mono text-[9px] uppercase tracking-widest text-[#555]">{label}</div>
      {children}
    </div>
  );
}
