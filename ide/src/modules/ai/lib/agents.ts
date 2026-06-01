import { LazyStore } from "@tauri-apps/plugin-store";

export type AgentIconId =
  | "coder"
  | "architect"
  | "reviewer"
  | "security"
  | "designer"
  | "spark"
  | "orkestra";

export type AgentConfig = {
  /** Override the global model for this agent (e.g. "claude-sonnet-4-6"). */
  model?: string;
  /** Enable extended thinking / reasoning mode for this agent. */
  thinking?: boolean;
};

export type Agent = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  icon: AgentIconId;
  builtIn: boolean;
  /** Tool names this agent is allowed to call. Undefined = all tools. */
  toolset?: string[];
  /** session = remembers chat history; ephemeral = fresh context each turn. */
  memory?: "session" | "ephemeral";
};

export const BUILTIN_AGENTS: readonly Agent[] = [
  {
    id: "builtin:vault",
    name: "Vault",
    description: "Searches your knowledge base first, then the web. Your default agent.",
    icon: "spark",
    builtIn: true,
    toolset: [
      "vault_search", "vault_read", "vault_self_context", "vault_agent_log",
      "web_search", "web_fetch",
      "forum_search", "forum_read", "forum_new_thread", "forum_reply",
      "code_search", "code_explore", "code_callers", "code_callees", "code_status",
      "read_file", "grep", "glob", "list_directory",
      "todo_write", "suggest_command",
    ],
    instructions: `VAULT AGENT
1. Call vault_search(query, scope?) first.
2. If the best result has score ≥ 6, call vault_read on it and use that content.
3. If the vault has no good match, call web_search (max 3 results) and web_fetch the top URL.
4. Answer concisely and cite the source ID.
5. Do not call vault_write.
6. For complex tasks, call vault_self_context first and log key decisions with vault_agent_log.

FORUM: Use forum_search before making a new thread. Use forum_reply/forum_new_thread only when the user explicitly asks.

CODE QUESTIONS: Use code_status first. If the CodeGraph bridge is ready, prefer code_search/code_explore over vault_search.`,
  },
  {
    id: "builtin:sentor-maker",
    name: "Sentor-Maker",
    description: "Every answer becomes a vault HTML page with diagrams. Builds your second brain.",
    icon: "designer",
    builtIn: true,
    toolset: [
      "vault_search", "vault_read", "vault_write", "vault_self_context",
      "web_search", "web_fetch",
      "forum_search", "forum_read", "forum_new_thread", "forum_reply",
      "read_file", "todo_write",
    ],
    instructions: `SENTOR-MAKER
1. Start with vault_search. If a strong page exists, summarize it and ask whether to update it or write a new one.
2. Use web_search/web_fetch only when needed.
3. When writing, produce a standalone HTML page with inline <style> only, dark theme vars, system-ui, border-only layout, and no external CSS.
4. Use /vendor/mermaid.min.js for diagrams if needed.
5. Call vault_write with category, slug, and content. Then reply with the saved path and a short summary.
6. Do not write pages unless the user explicitly asked to create or update a vault page.`,
  },
  {
    id: "builtin:coder",
    name: "Coder",
    description: "Edits code in the open workspace. Does not write vault pages.",
    icon: "coder",
    builtIn: true,
    toolset: [
      "read_file", "write_file", "edit_file", "multi_edit",
      "list_directory", "grep", "glob", "search_files",
      "run_command", "bash_run",
      "create_file", "create_directory", "rename", "delete",
      "code_search", "code_explore", "code_callers", "code_callees", "code_impact", "code_status",
    ],
    instructions: `CODER
1. Call code_status first.
2. Use code_search/code_explore before reading files.
3. Use code_callers/code_callees/code_impact to inspect dependencies.
4. Read only the files needed.
5. Make the smallest safe edit, using edit_file or multi_edit.
6. After changes, verify with the appropriate typecheck command.
7. Do not call vault_write. For research tasks, switch the user to Vault.

Use CodeGraph tools first when available; only fall back to grep/read_file when the bridge is not running.`,
  },
  {
    id: "builtin:orkestra",
    name: "Orkestra",
    description: "Coordinator agent. Routes tasks to the right agent, triggers Sentor for new agents, supports Supervisor/Worker patterns.",
    icon: "orkestra",
    builtIn: true,
    instructions: `ORKESTRA — COORDINATOR
1. Route tasks to the right agent: Vault for research, Sentor-Maker for pages, Coder for code.
2. Use agent_invoke for read-only work and return a summary.
3. For code intelligence, call code_status first and use code_search/code_explore/code_callers/code_callees/code_impact if ready.
4. Do not do deep research or code edits yourself.
5. Never call vault_write or write_file.`,
  },
  {
    id: "builtin:vault-exporter",
    name: "Vault-Exporter",
    description: "Validates sub-canvas panels and converts them into structured vault HTML pages.",
    icon: "designer",
    builtIn: true,
    instructions: `VAULT-EXPORTER
1. Call canvas_read_state and inspect the current panels.
2. Convert the canvas into a standalone HTML page using Sentor-Maker HTML rules.
3. Call vault_write with category="projects" and a slug based on the canvas title.
4. Reply with: "Exported to vault/projects/<slug> — open it in the Vault browser to review."

If the canvas has no useful content, say: "Canvas appears empty. Add content first."`,
  },
] as const;

const STORE_PATH = "sentor-ai-agents.json";
const KEY_CUSTOM = "customAgents";
const KEY_ACTIVE = "activeAgentId";
const KEY_CONFIGS = "agentConfigs";

const store = new LazyStore(STORE_PATH, { defaults: {}, autoSave: 200 });

export type LoadedAgents = {
  custom: Agent[];
  activeId: string;
  agentConfigs: Record<string, AgentConfig>;
};

export async function loadAgents(): Promise<LoadedAgents> {
  // One IPC roundtrip via entries() instead of two sequential get()s.
  const entries = await store.entries();
  let custom: Agent[] | undefined;
  let activeId: string | undefined;
  let agentConfigs: Record<string, AgentConfig> | undefined;
  for (const [k, v] of entries) {
    if (k === KEY_CUSTOM) custom = v as Agent[];
    else if (k === KEY_ACTIVE) activeId = v as string;
    else if (k === KEY_CONFIGS) agentConfigs = v as Record<string, AgentConfig>;
  }
  return { custom: custom ?? [], activeId: activeId ?? BUILTIN_AGENTS[0].id, agentConfigs: agentConfigs ?? {} };
}

export async function saveCustomAgents(custom: Agent[]): Promise<void> {
  await store.set(KEY_CUSTOM, custom);
  await store.save();
}

export async function saveAgentConfigs(configs: Record<string, AgentConfig>): Promise<void> {
  await store.set(KEY_CONFIGS, configs);
  await store.save();
}

export async function saveActiveAgentId(id: string): Promise<void> {
  await store.set(KEY_ACTIVE, id);
  await store.save();
}

export function newAgentId(): string {
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function findAgent(
  agents: readonly Agent[],
  id: string | null | undefined,
): Agent {
  if (!id) return BUILTIN_AGENTS[0];
  return agents.find((a) => a.id === id) ?? BUILTIN_AGENTS[0];
}
