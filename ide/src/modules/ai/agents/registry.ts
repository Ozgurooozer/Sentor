export type SubagentType = "explore" | "general" | "code";

export type SubagentDef = {
  id: SubagentType;
  label: string;
  description: string;
  /**
   * Whitelist of tools the subagent may call. Excludes mutating tools and
   * `run_subagent` itself to prevent recursion. The runner filters down the
   * main toolset to this list before constructing the inner Agent.
   */
  tools: string[];
  systemPrompt: string;
};

const FS_TOOLS = ["read_file", "list_directory", "grep", "glob"];
const CODEGRAPH_TOOLS = ["code_status", "code_search", "code_explore", "code_callers", "code_callees", "code_impact"];
const VAULT_TOOLS = ["vault_search", "vault_read"];

export const SUBAGENTS: Record<SubagentType, SubagentDef> = {
  explore: {
    id: "explore",
    label: "Explore",
    description:
      "Read-only codebase explorer. Uses CodeGraph index for fast symbol lookup, falls back to grep/read_file.",
    tools: [...FS_TOOLS, ...CODEGRAPH_TOOLS, ...VAULT_TOOLS],
    systemPrompt: `Explorer. Locate files, trace references, and summarize architecture.

Prefer CodeGraph tools (code_status → code_search → code_explore/code_callers) over grep for speed.
Fall back to grep/read_file only when the bridge is not running.
No edits. Return a concise summary with file paths, key findings, and line numbers. Stop as soon as you can answer.`,
  },
  general: {
    id: "general",
    label: "General research",
    description:
      "Multi-step research across files and vault. Uses CodeGraph when available.",
    tools: [...FS_TOOLS, ...CODEGRAPH_TOOLS, ...VAULT_TOOLS, "web_search", "web_fetch"],
    systemPrompt: `Research agent. Answer the question by reading the codebase and vault.

Check code_status first. If the CodeGraph bridge is ready, use code_search/code_explore before reading files.
Verify, don't speculate. Return a tight summary with evidence (paths, line numbers).`,
  },
  code: {
    id: "code",
    label: "Code analysis",
    description:
      "Deep code intelligence: symbol lookup, call graph traversal, impact analysis. Requires CodeGraph bridge.",
    tools: [...FS_TOOLS, ...CODEGRAPH_TOOLS],
    systemPrompt: `Code analysis agent. Use CodeGraph tools to answer structural questions about the codebase.

Protocol:
1. Call code_status — if not ready, fall back to grep/read_file and note the limitation.
2. Use code_search to find symbols by name.
3. Use code_explore for deep context on a topic.
4. Use code_callers/code_callees for dependency tracing.
5. Use code_impact before any refactor to show blast radius.
6. Read source files only when you need exact code snippets.

Return findings with symbol names, file paths, and line numbers.`,
  },
};
