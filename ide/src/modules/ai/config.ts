export const KEYRING_SERVICE = "atlas-ai";

export type ProviderId = "lmstudio" | "ollama";

export type ProviderInfo = {
  id: ProviderId;
  label: string;
  keyringAccount: string;
  keyPrefix: string | null;
  consoleUrl: string;
};

export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: "lmstudio",
    label: "LM Studio",
    keyringAccount: "",
    keyPrefix: null,
    consoleUrl: "https://lmstudio.ai/docs/basics/server",
  },
  {
    id: "ollama",
    label: "Ollama",
    keyringAccount: "",
    keyPrefix: null,
    consoleUrl: "https://ollama.com",
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
    id: "lmstudio-local",
    provider: "lmstudio",
    label: "LM Studio",
    hint: "Local model",
  },
  {
    id: "ollama-local",
    provider: "ollama",
    label: "Ollama",
    hint: "Local model",
  },
] as const satisfies readonly ModelInfo[];

export type ModelId = (typeof MODELS)[number]["id"];

export function getModel(id: ModelId): ModelInfo {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown model: ${id}`);
  return m;
}

export const DEFAULT_MODEL_ID: ModelId = "lmstudio-local";

export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "lmstudio-local": 32_000,
  "ollama-local": 32_000,
};

export function getModelContextLimit(modelId: string | undefined): number {
  if (!modelId) return 32_000;
  return MODEL_CONTEXT_LIMITS[modelId] ?? 32_000;
}

/** All local providers are keyless. */
export const KEYLESS_PROVIDERS: readonly ProviderId[] = [
  "lmstudio",
  "ollama",
] as const;

export function providerNeedsKey(id: ProviderId): boolean {
  return !KEYLESS_PROVIDERS.includes(id);
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
