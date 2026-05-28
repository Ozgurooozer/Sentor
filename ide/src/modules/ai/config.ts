export const KEYRING_SERVICE = "atlas-ai";

export type ProviderId = "opencode";

export type ProviderInfo = {
  id: ProviderId;
  label: string;
  keyringAccount: string;
  keyPrefix: string | null;
  consoleUrl: string;
};

export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: "opencode",
    label: "OpenCode Zen",
    keyringAccount: "opencode",
    keyPrefix: null,
    consoleUrl: "https://opencode.ai/auth",
  },
] as const;

export function getProvider(id: ProviderId): ProviderInfo {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

export type ModelInfo = {
  id: string;
  provider: ProviderId;
  label: string;
  hint: string;
};

export const MODELS = [
  {
    id: "opencode-chat",
    provider: "opencode",
    label: "OpenCode Zen",
    hint: "Zen API",
  },
] as const satisfies readonly ModelInfo[];

export type ModelId = (typeof MODELS)[number]["id"];

export function getModel(id: ModelId): ModelInfo {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown model: ${id}`);
  return m;
}

export const DEFAULT_MODEL_ID: ModelId = "opencode-chat";

export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "opencode-chat": 200_000,
};

export function getModelContextLimit(modelId: string | undefined): number {
  if (!modelId) return 32_000;
  return MODEL_CONTEXT_LIMITS[modelId] ?? 32_000;
}

/** opencode always requires an API key. */
export const KEYLESS_PROVIDERS: readonly ProviderId[] = [] as const;

export function providerNeedsKey(_id: ProviderId): boolean {
  return true;
}

export type AutocompleteProviderId = "lmstudio" | "ollama";

export const AUTOCOMPLETE_PROVIDERS: readonly AutocompleteProviderId[] = [
  "lmstudio",
  "ollama",
] as const;

export const DEFAULT_AUTOCOMPLETE_MODEL: Record<AutocompleteProviderId, string> = {
  lmstudio: "qwen2.5-coder-7b-instruct",
  ollama: "qwen2.5-coder:7b",
};

export const LMSTUDIO_DEFAULT_BASE_URL = "http://localhost:1234/v1";
export const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434/v1";
export const OPENCODE_DEFAULT_BASE_URL = "https://opencode.ai/zen/v1";
export const MAX_AGENT_STEPS = 24;
export const TERMINAL_BUFFER_LINES = 300;

export const SYSTEM_PROMPT = `You are Atlas, an AI coding assistant in a developer IDE with access to a local knowledge vault (offline HTML notes the user has saved).

Each turn has a <terminal-context> block: workspace_root, active_terminal_cwd, active_file, terminal output. Use it as ground truth.

- read_file before editing. grep/glob to locate code — not mass reads.
- Bare paths resolve from active_terminal_cwd. active_file = target for "edit this".
- Mutating tools (edit, write_file, bash_run, etc.) need approval — one sentence why first.
- suggest_command for commands the user runs; bash_run for commands you execute.
- bash_background for servers/watchers. Never interactive tools (vim, top, watch).
- todo_write for any task with ≥3 steps — full list every call, one in_progress at a time.
- vault_search before answering any question about the user's notes or saved knowledge.`;
