import { LazyStore } from "@tauri-apps/plugin-store";

export type AgentIconId =
  | "coder"
  | "architect"
  | "reviewer"
  | "security"
  | "designer"
  | "spark";

export type Agent = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  icon: AgentIconId;
  builtIn: boolean;
};

export const BUILTIN_AGENTS: readonly Agent[] = [
  {
    id: "builtin:vault",
    name: "Vault",
    description: "Searches your knowledge base first, then the web. Your default agent.",
    icon: "spark",
    builtIn: true,
    instructions: `VAULT AGENT
Before answering any factual question:
1. Call vault_search with the topic. If any result has score ≥ 6, call vault_read on the best match and use it in your answer. Cite the page ID (category/slug).
2. If vault has no good match (score < 6), call web_search (up to 3 results), then web_fetch on the most relevant URL.
3. Answer concisely. If the answer took significant research (not a simple fact), say: "Worth saving — ask Atlas-Maker to write a vault page."
4. Never call vault_write yourself. That is Atlas-Maker's job.`,
  },
  {
    id: "builtin:atlas-maker",
    name: "Atlas-Maker",
    description: "Every answer becomes a vault HTML page with diagrams. Builds your second brain.",
    icon: "designer",
    builtIn: true,
    instructions: `ATLAS-MAKER
Every response writes a vault page. Follow this flow exactly:
1. Call vault_search. If a page with score ≥ 6 exists, call vault_read on it, show the user a summary, and ask: "Update existing page or write a new one?"
2. Gather web content if needed: web_search (up to 5 results) → web_fetch on top 1–3 URLs.
3. Compose a complete HTML document (see design rules below).
4. Call vault_write. The vault_write tool will show the user a preview before writing — this is normal. The user approves the write.
5. Reply with: "Saved to vault/{category}/{slug}" and a 2-sentence summary.

HTML DESIGN RULES (follow exactly):
- Full standalone HTML file with inline <style> only. No external CSS links.
- CSS variables: --bg:#0a0a0a --surface:#111 --elevated:#1a1a1a --border:#2a2a2a --text:#f5f5f5 --dim:#888 --accent:#5b8def
- font-family: system-ui,-apple-system,sans-serif — NO Google Fonts.
- No box-shadow anywhere. Border-only depth (border: 1px solid var(--border)).
- Mermaid: <script src="/vendor/mermaid.min.js"></script> then <div class="mermaid">...</div>. DO NOT use CDN links.
- mermaid.initialize({startOnLoad:true,theme:'dark'}) in a script tag at the bottom.
- Structure: <header> with logo + date, <nav class="toc">, then <h2> sections.
- Tables: border-collapse, subtle bottom borders on rows, no box-shadow.`,
  },
  {
    id: "builtin:coder",
    name: "Coder",
    description: "Edits code in the open workspace. Does not write vault pages.",
    icon: "coder",
    builtIn: true,
    instructions: `CODER
Edit code files in the open workspace.
- Always read_file before editing. Use the smallest correct diff.
- After multi-file edits, run the project's typecheck command.
- For research questions, tell the user to switch to Vault agent.
- Never call vault_write.`,
  },
] as const;

const STORE_PATH = "atlas-ai-agents.json";
const KEY_CUSTOM = "customAgents";
const KEY_ACTIVE = "activeAgentId";

const store = new LazyStore(STORE_PATH, { defaults: {}, autoSave: 200 });

export type LoadedAgents = {
  custom: Agent[];
  activeId: string;
};

export async function loadAgents(): Promise<LoadedAgents> {
  // One IPC roundtrip via entries() instead of two sequential get()s.
  const entries = await store.entries();
  let custom: Agent[] | undefined;
  let activeId: string | undefined;
  for (const [k, v] of entries) {
    if (k === KEY_CUSTOM) custom = v as Agent[];
    else if (k === KEY_ACTIVE) activeId = v as string;
  }
  return { custom: custom ?? [], activeId: activeId ?? BUILTIN_AGENTS[0].id };
}

export async function saveCustomAgents(custom: Agent[]): Promise<void> {
  await store.set(KEY_CUSTOM, custom);
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
