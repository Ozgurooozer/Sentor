# OpenCode Zen — Tek Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tüm AI provider'larını (LM Studio, Ollama, OpenAI, Anthropic, Groq, OpenRouter, Custom) kaldır; sadece OpenCode Zen API'sini bırak — key zaten OS keyring'inde kayıtlı.

**Architecture:** `ProviderId` tipi tek elemana indirgenir (`"opencode"`); `agent.ts`'deki switch tek case'e düşer; `keyring.ts` sadece opencode key'ini yönetir; `store.ts` / `preferences.ts` artık olmayan provider'lara ait preference alanlarını siler; `ModelsSection.tsx` basitleştirilmiş tek-provider UI'ya döner. Autocomplete (LM Studio / Ollama) ayrı `AutocompleteProviderId` tipiyle yaşamaya devam eder — dokunulmaz.

**Tech Stack:** TypeScript, React, Zustand, Tauri v2, `@ai-sdk/openai-compatible`

---

## Dosya Haritası

| Dosya | Değişim |
|---|---|
| `ide/src/modules/ai/config.ts` | ProviderId → "opencode" only; PROVIDERS/MODELS/KEYLESS kısaltılır |
| `ide/src/modules/ai/lib/agent.ts` | buildLanguageModel → tek opencode case; toDevProxyURL kaldırılır |
| `ide/src/modules/ai/lib/keyring.ts` | ProviderKeys → { opencode: string \| null } |
| `ide/src/modules/settings/store.ts` | Removed prefs + setters; DEFAULT_PREFERENCES güncellenir |
| `ide/src/settings/sections/ModelsSection.tsx` | Simplified UI: OpenCodeBlock + autocomplete/searxng/embedding blokları |

---

### Task 1: `config.ts` — ProviderId'yi opencode'a indir

**Files:**
- Modify: `ide/src/modules/ai/config.ts`

- [ ] **Step 1: Dosyayı güncelle**

Tüm dosyayı aşağıdaki içerikle değiştir:

```typescript
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
```

- [ ] **Step 2: TypeScript doğrula**

```bash
cd ide && npx tsc --noEmit 2>&1 | head -40
```

Bu adımdan sonra muhtemelen `agent.ts` ve `keyring.ts` hataları çıkacak — normaldir, sonraki task'larda düzelecek.

---

### Task 2: `keyring.ts` — ProviderKeys'i sadeleştir

**Files:**
- Modify: `ide/src/modules/ai/lib/keyring.ts`

- [ ] **Step 1: Dosyayı güncelle**

```typescript
import { invoke } from "@tauri-apps/api/core";
import {
  getProvider,
  KEYRING_SERVICE,
  type ProviderId,
} from "../config";

export type ProviderKeys = { opencode: string | null };

export const EMPTY_PROVIDER_KEYS: ProviderKeys = { opencode: null };

export async function getKey(provider: ProviderId): Promise<string | null> {
  try {
    const v = await invoke<string | null>("secrets_get", {
      service: KEYRING_SERVICE,
      account: getProvider(provider).keyringAccount,
    });
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export async function setKey(provider: ProviderId, key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) throw new Error("API key is empty");
  await invoke("secrets_set", {
    service: KEYRING_SERVICE,
    account: getProvider(provider).keyringAccount,
    password: trimmed,
  });
}

export async function clearKey(provider: ProviderId): Promise<void> {
  try {
    await invoke("secrets_delete", {
      service: KEYRING_SERVICE,
      account: getProvider(provider).keyringAccount,
    });
  } catch {
    // already absent — fine
  }
}

export async function getAllKeys(): Promise<ProviderKeys> {
  const key = await getKey("opencode");
  return { opencode: key };
}

export function hasAnyKey(keys: ProviderKeys): boolean {
  return keys.opencode !== null && keys.opencode.length > 0;
}
```

- [ ] **Step 2: TypeScript doğrula**

```bash
cd ide && npx tsc --noEmit 2>&1 | head -40
```

---

### Task 3: `agent.ts` — buildLanguageModel'i sadeleştir

**Files:**
- Modify: `ide/src/modules/ai/lib/agent.ts`

- [ ] **Step 1: Dosyayı güncelle**

Tüm dosyayı aşağıdaki içerikle değiştir:

```typescript
import {
  Experimental_Agent as Agent,
  DirectChatTransport,
  stepCountIs,
  type LanguageModel,
} from "ai";
import {
  DEFAULT_MODEL_ID,
  getModel,
  OPENCODE_DEFAULT_BASE_URL,
  MAX_AGENT_STEPS,
  SYSTEM_PROMPT,
  type ModelId,
  type ProviderId,
} from "../config";
import type { ProviderKeys } from "./keyring";
import { buildTools, type ToolContext } from "../tools/tools";

/** Per-provider configuration: base URL and model identifier overrides. */
export type ProviderConfig = {
  baseURL?: string;
  modelId?: string;
};

/** Map of provider id → its config. Missing entries fall back to defaults. */
export type ProviderConfigs = Partial<Record<ProviderId, ProviderConfig>>;

export type AgentDeps = {
  keys: ProviderKeys;
  modelId?: ModelId;
  customInstructions?: string;
  agentPersona?: { name: string; instructions: string } | null;
  toolContext: ToolContext;
  onStep?: (step: string | null) => void;
  providers?: ProviderConfigs;
  planMode?: boolean;
  projectMemory?: string | null;
  agentSelfContext?: string | null;
  toolset?: string[];
};

const TOOL_LABELS: Record<string, (input: Record<string, unknown>) => string> = {
  read_file: (i) => `Reading ${shortPath(i.path)}`,
  list_directory: (i) => `Listing ${shortPath(i.path)}`,
  grep: (i) => `Grepping ${ellipsize(String(i.pattern ?? ""), 40)}`,
  glob: (i) => `Globbing ${ellipsize(String(i.pattern ?? ""), 40)}`,
  edit: (i) => `Editing ${shortPath(i.path)}`,
  multi_edit: (i) => `Editing ${shortPath(i.path)}`,
  write_file: (i) => `Writing ${shortPath(i.path)}`,
  create_directory: (i) => `Creating ${shortPath(i.path)}`,
  bash_run: (i) => `Running ${ellipsize(String(i.command ?? ""), 60)}`,
  bash_background: (i) => `Spawning ${ellipsize(String(i.command ?? ""), 60)}`,
  bash_logs: () => `Reading logs`,
  bash_list: () => `Listing background processes`,
  bash_kill: () => `Stopping background process`,
  suggest_command: (i) => `Suggesting ${ellipsize(String(i.command ?? ""), 60)}`,
  todo_write: (i) =>
    `Updating plan (${Array.isArray(i.todos) ? i.todos.length : 0} items)`,
  run_subagent: (i) => `Spawning ${String(i.type ?? "subagent")} subagent`,
  vault_search: (i) => `Searching vault: ${ellipsize(String(i.query ?? ""), 40)}`,
  vault_read: (i) => `Reading vault/${String(i.category ?? "")}/${String(i.slug ?? "")}`,
  vault_write: (i) => `Writing vault/${String(i.category ?? "")}/${String(i.slug ?? "")}`,
};

function shortPath(p: unknown): string {
  if (typeof p !== "string") return "";
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

function ellipsize(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export type BuildModelOptions = {
  providers?: ProviderConfigs;
};

// Memoize built models — provider clients are not free to construct.
const modelCache = new Map<string, LanguageModel>();

export async function buildLanguageModel(
  provider: ProviderId,
  keys: ProviderKeys,
  resolvedModelId: string,
  options: BuildModelOptions = {},
): Promise<LanguageModel> {
  if (!keys.opencode) {
    throw new Error(
      "No API key configured for OpenCode Zen. Open Settings → AI to add one.",
    );
  }
  const effectiveModelId =
    options.providers?.[provider]?.modelId || resolvedModelId;
  const baseURL =
    options.providers?.[provider]?.baseURL ?? OPENCODE_DEFAULT_BASE_URL;
  const cacheKey = `${provider} ${effectiveModelId} ${baseURL}`;
  const hit = modelCache.get(cacheKey);
  if (hit) return hit;

  const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
  const built = createOpenAICompatible({
    name: "opencode",
    baseURL,
    headers: {
      Authorization: `Bearer ${keys.opencode}`,
    },
  })(effectiveModelId);

  modelCache.set(cacheKey, built);
  return built;
}

function buildModel(
  modelId: ModelId,
  keys: ProviderKeys,
  providers: ProviderConfigs,
): Promise<LanguageModel> {
  const m = getModel(modelId);
  return buildLanguageModel(m.provider, keys, m.id, { providers });
}

export async function createAtlasAgent({
  keys,
  modelId = DEFAULT_MODEL_ID,
  customInstructions,
  agentPersona,
  toolContext,
  onStep,
  providers = {},
  planMode,
  projectMemory,
  agentSelfContext,
  toolset,
}: AgentDeps) {
  const trimmedCustom = customInstructions?.trim();
  const personaBlock = agentPersona?.instructions.trim()
    ? `\n\n## ACTIVE AGENT — ${agentPersona.name}\n${agentPersona.instructions.trim()}`
    : "";
  const customBlock = trimmedCustom
    ? `\n\n## USER CUSTOM INSTRUCTIONS — follow unless they conflict with safety rules above\n${trimmedCustom}`
    : "";
  const memoryBlock =
    projectMemory && projectMemory.trim().length > 0
      ? `\n\n## PROJECT — ATLAS.md\n${projectMemory.trim()}`
      : "";
  const selfContextBlock =
    agentSelfContext && agentSelfContext.trim().length > 0
      ? `\n\n${agentSelfContext.trim()}`
      : "";
  const planBlock = planMode
    ? `\n\n## PLAN MODE — ACTIVE\nMutating tools (write_file, edit, multi_edit, create_directory) will queue their changes for the user to review as a single diff. Do NOT execute bash_run or bash_background while plan mode is active — restrict yourself to reads (read_file, grep, glob, list_directory) and the queued mutations. After queueing the full set of edits, stop and return a brief summary; do not continue acting until the user has accepted/rejected.`
    : "";
  const instructions = `${SYSTEM_PROMPT}${memoryBlock}${selfContextBlock}${personaBlock}${customBlock}${planBlock}`;
  const model = await buildModel(modelId, keys, providers);
  const allTools = buildTools(toolContext);
  const tools =
    toolset && toolset.length > 0
      ? (Object.fromEntries(
          Object.entries(allTools).filter(([name]) => toolset.includes(name)),
        ) as typeof allTools)
      : allTools;
  return new Agent({
    model,
    instructions,
    tools,
    stopWhen: stepCountIs(MAX_AGENT_STEPS),
    onStepFinish: (step) => {
      if (!onStep) return;
      const last = step.toolCalls?.[step.toolCalls.length - 1];
      if (last) {
        const label = TOOL_LABELS[last.toolName];
        onStep(
          label
            ? label((last.input ?? {}) as Record<string, unknown>)
            : `Calling ${last.toolName}`,
        );
      } else if (step.text) {
        onStep("Writing");
      }
    },
    onFinish: () => {
      onStep?.(null);
    },
  });
}

export type AtlasAgent = Awaited<ReturnType<typeof createAtlasAgent>>;

export function createAtlasTransport(agent: AtlasAgent) {
  return new DirectChatTransport({ agent });
}
```

- [ ] **Step 2: TypeScript doğrula**

```bash
cd ide && npx tsc --noEmit 2>&1 | head -40
```

---

### Task 4: `store.ts` — Gereksiz preference alanlarını kaldır

**Files:**
- Modify: `ide/src/modules/settings/store.ts`

- [ ] **Step 1: `Preferences` tipinden kaldırılacak alanlar**

`store.ts` içinde `Preferences` tipinden şu alanları sil:
- `lmstudioChatModelId`
- `ollamaChatModelId`
- `openaiChatModelId`
- `anthropicChatModelId`
- `groqChatModelId`
- `openrouterChatModelId`
- `customProviderBaseURL`
- `customProviderModelId`

`lmstudioBaseURL`, `ollamaBaseURL`, `autocompleteEnabled`, `autocompleteProvider`, `autocompleteModelId` **kalır** — autocomplete için gerekli.

- [ ] **Step 2: Silinecek KEY sabitleri**

Şu satırları sil:
```typescript
const KEY_LMSTUDIO_CHAT_MODEL = "lmstudioChatModelId";
const KEY_OLLAMA_CHAT_MODEL = "ollamaChatModelId";
const KEY_OPENAI_CHAT_MODEL = "openaiChatModelId";
const KEY_ANTHROPIC_CHAT_MODEL = "anthropicChatModelId";
const KEY_GROQ_CHAT_MODEL = "groqChatModelId";
const KEY_OPENROUTER_CHAT_MODEL = "openrouterChatModelId";
const KEY_CUSTOM_PROVIDER_BASE_URL = "customProviderBaseURL";
const KEY_CUSTOM_PROVIDER_MODEL = "customProviderModelId";
```

- [ ] **Step 3: `DEFAULT_PREFERENCES`'tan kaldır**

```typescript
// SİL:
lmstudioChatModelId: "deepseek/deepseek-r1-0528-qwen3-8b",
ollamaChatModelId: "",
openaiChatModelId: "",
anthropicChatModelId: "",
groqChatModelId: "",
openrouterChatModelId: "",
customProviderBaseURL: "",
customProviderModelId: "",
```

- [ ] **Step 4: `loadPreferences`'tan kaldır**

`loadPreferences()` fonksiyonundan şu satırları sil:
```typescript
lmstudioChatModelId: get<string>(KEY_LMSTUDIO_CHAT_MODEL) || DEFAULT_PREFERENCES.lmstudioChatModelId,
ollamaChatModelId: get<string>(KEY_OLLAMA_CHAT_MODEL) ?? DEFAULT_PREFERENCES.ollamaChatModelId,
openaiChatModelId: get<string>(KEY_OPENAI_CHAT_MODEL) ?? DEFAULT_PREFERENCES.openaiChatModelId,
anthropicChatModelId: get<string>(KEY_ANTHROPIC_CHAT_MODEL) ?? DEFAULT_PREFERENCES.anthropicChatModelId,
groqChatModelId: get<string>(KEY_GROQ_CHAT_MODEL) ?? DEFAULT_PREFERENCES.groqChatModelId,
openrouterChatModelId: get<string>(KEY_OPENROUTER_CHAT_MODEL) ?? DEFAULT_PREFERENCES.openrouterChatModelId,
customProviderBaseURL: get<string>(KEY_CUSTOM_PROVIDER_BASE_URL) ?? DEFAULT_PREFERENCES.customProviderBaseURL,
customProviderModelId: get<string>(KEY_CUSTOM_PROVIDER_MODEL) ?? DEFAULT_PREFERENCES.customProviderModelId,
```

- [ ] **Step 5: Setter fonksiyonlarını sil**

Şu export fonksiyonları sil:
```typescript
export async function setLmstudioChatModelId(value: string): Promise<void> { ... }
export async function setOllamaChatModelId(value: string): Promise<void> { ... }
export async function setOpenaiChatModelId(value: string): Promise<void> { ... }
export async function setAnthropicChatModelId(value: string): Promise<void> { ... }
export async function setGroqChatModelId(value: string): Promise<void> { ... }
export async function setOpenrouterChatModelId(value: string): Promise<void> { ... }
export async function setCustomProviderBaseURL(value: string): Promise<void> { ... }
export async function setCustomProviderModelId(value: string): Promise<void> { ... }
```

- [ ] **Step 6: `onPreferencesChange` map'inden kaldır**

`onPreferencesChange` içindeki `map` objesinden şu satırları sil:
```typescript
[KEY_LMSTUDIO_CHAT_MODEL]: "lmstudioChatModelId",
[KEY_OLLAMA_CHAT_MODEL]: "ollamaChatModelId",
[KEY_OPENAI_CHAT_MODEL]: "openaiChatModelId",
[KEY_ANTHROPIC_CHAT_MODEL]: "anthropicChatModelId",
[KEY_GROQ_CHAT_MODEL]: "groqChatModelId",
[KEY_OPENROUTER_CHAT_MODEL]: "openrouterChatModelId",
[KEY_CUSTOM_PROVIDER_BASE_URL]: "customProviderBaseURL",
[KEY_CUSTOM_PROVIDER_MODEL]: "customProviderModelId",
```

- [ ] **Step 7: TypeScript doğrula**

```bash
cd ide && npx tsc --noEmit 2>&1 | head -60
```

---

### Task 5: `ModelsSection.tsx` — UI'yi sadeleştir

**Files:**
- Modify: `ide/src/settings/sections/ModelsSection.tsx`

- [ ] **Step 1: Dosyayı tamamen yeni içerikle değiştir**

```typescript
import { Input } from "@/components/ui/input";
import {
  MODELS_ENDPOINT sabitini kaldır — aşağıda inline tanımlanacak
} from "@/modules/ai/config";
```

Tüm dosyayı aşağıdaki içerikle değiştir:

```typescript
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  AUTOCOMPLETE_PROVIDERS,
  DEFAULT_AUTOCOMPLETE_MODEL,
  getProvider,
  OPENCODE_DEFAULT_BASE_URL,
  type AutocompleteProviderId,
} from "@/modules/ai/config";
import { clearKey, getKey, setKey } from "@/modules/ai/lib/keyring";
import { emitKeysChanged } from "@/modules/settings/store";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setAutocompleteEnabled,
  setAutocompleteModelId,
  setAutocompleteProvider,
  setEmbeddingBackend,
  setEmbeddingOllamaModel,
  setLmstudioBaseURL,
  setOllamaBaseURL,
  setOpencodeChatModelId,
  setSearxngUrl,
  type EmbeddingBackend,
} from "@/modules/settings/store";
import { invoke } from "@tauri-apps/api/core";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { ProviderIcon } from "../components/ProviderIcon";
import { ProviderKeyCard } from "../components/ProviderKeyCard";
import { SectionHeader } from "../components/SectionHeader";

const OPENCODE_MODELS_URL = "https://opencode.ai/zen/v1/models";

type ModelEntry = { id: string; label?: string };

async function fetchOpenCodeModels(apiKey: string | null): Promise<ModelEntry[]> {
  const raw = await invoke<string>("http_get_json", {
    url: OPENCODE_MODELS_URL,
    bearer: apiKey ?? undefined,
  });
  const json = JSON.parse(raw) as unknown;
  const data = (json as Record<string, unknown>).data ?? json;
  if (!Array.isArray(data)) return [];
  return (data as { id?: string; name?: string }[])
    .filter((m) => typeof m.id === "string")
    .map((m) => ({ id: m.id as string, label: m.name as string | undefined }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function ModelsSection() {
  return (
    <div className="flex flex-col gap-7">
      <SectionHeader
        title="Models"
        description="OpenCode Zen API üzerinden tüm modellere erişin. API key OS keychain'inde saklanır."
      />
      <OpenCodeBlock />
      <AutocompleteBlock />
      <SearxngBlock />
      <EmbeddingBlock />
    </div>
  );
}

function OpenCodeBlock() {
  const modelId = usePreferencesStore((s) => s.opencodeChatModelId);
  const [draft, setDraft] = useState(modelId);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [modelList, setModelList] = useState<ModelEntry[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | undefined>();

  useEffect(() => { setDraft(modelId); }, [modelId]);
  useEffect(() => { void getKey("opencode").then(setApiKey); }, []);

  const handleSaveKey = async (k: string) => {
    await setKey("opencode", k);
    setApiKey(k);
    await emitKeysChanged();
  };

  const handleClearKey = async () => {
    await clearKey("opencode");
    setApiKey(null);
    await emitKeysChanged();
  };

  const handleFetchModels = async () => {
    setFetching(true);
    setFetchError(undefined);
    try {
      const list = await fetchOpenCodeModels(apiKey);
      setModelList(list);
    } catch (e) {
      setFetchError(String(e));
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label>OpenCode Zen</Label>
        <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">
          Base URL: <code className="font-mono">{OPENCODE_DEFAULT_BASE_URL}</code>
        </p>
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
        <ProviderKeyCard
          provider={getProvider("opencode")}
          currentKey={apiKey}
          onSave={handleSaveKey}
          onClear={handleClearKey}
        />
        <div className="flex flex-col gap-1.5">
          <Label>Model identifier</Label>
          <div className="flex gap-1.5">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => { const v = draft.trim(); void setOpencodeChatModelId(v); }}
              placeholder="deepseek/deepseek-v4-flash-free"
              spellCheck={false}
              className="h-8 flex-1 font-mono text-[11.5px]"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { if (modelList.length === 0) void handleFetchModels(); }}
                  className="h-8 gap-1 px-2.5 text-[11px]"
                  title="Fetch model list"
                >
                  {fetching ? "…" : "Models"}
                  <HugeiconsIcon icon={ArrowDown01Icon} size={10} strokeWidth={2} />
                </Button>
              </DropdownMenuTrigger>
              {modelList.length > 0 && (
                <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto" style={{ minWidth: 260 }}>
                  {modelList.map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      onSelect={() => {
                        setDraft(m.id);
                        void setOpencodeChatModelId(m.id);
                      }}
                      className={cn(
                        "flex flex-col items-start gap-0 text-[11.5px]",
                        draft === m.id && "bg-accent/50",
                      )}
                    >
                      <span className="font-mono">{m.id}</span>
                      {m.label && (
                        <span className="text-[10px] text-muted-foreground">{m.label}</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              )}
            </DropdownMenu>
          </div>
          {fetchError && (
            <p className="text-[10.5px] text-destructive">{fetchError}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function AutocompleteBlock() {
  const enabled = usePreferencesStore((s) => s.autocompleteEnabled);
  const provider = usePreferencesStore((s) => s.autocompleteProvider);
  const modelId = usePreferencesStore((s) => s.autocompleteModelId);
  const lmstudioBaseURL = usePreferencesStore((s) => s.lmstudioBaseURL);
  const ollamaBaseURL = usePreferencesStore((s) => s.ollamaBaseURL);

  const [modelDraft, setModelDraft] = useState(modelId);
  const [lmUrlDraft, setLmUrlDraft] = useState(lmstudioBaseURL);
  const [ollamaUrlDraft, setOllamaUrlDraft] = useState(ollamaBaseURL);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");

  useEffect(() => setModelDraft(modelId), [modelId]);
  useEffect(() => setLmUrlDraft(lmstudioBaseURL), [lmstudioBaseURL]);
  useEffect(() => setOllamaUrlDraft(ollamaBaseURL), [ollamaBaseURL]);

  const onProviderChange = (next: AutocompleteProviderId) => {
    void setAutocompleteProvider(next);
    const knownDefaults = Object.values(DEFAULT_AUTOCOMPLETE_MODEL);
    if (knownDefaults.includes(modelId)) {
      void setAutocompleteModelId(DEFAULT_AUTOCOMPLETE_MODEL[next]);
    }
  };

  const activeURL = provider === "lmstudio" ? lmUrlDraft : ollamaUrlDraft;

  const testConnection = async () => {
    setTestStatus("testing");
    try {
      const url = activeURL.replace(/\/$/, "").replace(/\/v1$/, "") + "/api/tags";
      const urlToTest =
        provider === "lmstudio"
          ? activeURL.replace(/\/$/, "") + "/models"
          : url;
      const status = await invoke<number>("http_ping", { url: urlToTest });
      setTestStatus(status >= 200 && status < 400 ? "ok" : "fail");
    } catch {
      setTestStatus("fail");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <Label>Editor autocomplete</Label>
          <span className="text-[10.5px] leading-relaxed text-muted-foreground">
            Inline ghost-text suggestions powered by a local LM Studio or Ollama server.
          </span>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => void setAutocompleteEnabled(v)}
        />
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
        <div className="flex flex-col gap-1.5">
          <Label>Provider</Label>
          <div className="flex gap-1">
            {AUTOCOMPLETE_PROVIDERS.map((id) => {
              const info = getProvider(id as "lmstudio" | "ollama");
              const active = id === provider;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => { onProviderChange(id); setTestStatus("idle"); }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] transition-colors",
                    active
                      ? "border-foreground/40 bg-accent/60"
                      : "border-border/60 bg-transparent hover:bg-accent/30",
                  )}
                >
                  <ProviderIcon provider={id} size={12} />
                  <span>{info.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Model</Label>
          <Input
            value={modelDraft}
            onChange={(e) => setModelDraft(e.target.value)}
            onBlur={() => {
              const v = modelDraft.trim();
              if (v && v !== modelId) void setAutocompleteModelId(v);
            }}
            placeholder={DEFAULT_AUTOCOMPLETE_MODEL[provider]}
            spellCheck={false}
            className="h-8 font-mono text-[11.5px]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>{provider === "lmstudio" ? "LM Studio" : "Ollama"} base URL</Label>
          <div className="flex gap-1.5">
            <Input
              value={provider === "lmstudio" ? lmUrlDraft : ollamaUrlDraft}
              onChange={(e) =>
                provider === "lmstudio"
                  ? setLmUrlDraft(e.target.value)
                  : setOllamaUrlDraft(e.target.value)
              }
              onBlur={() => {
                if (provider === "lmstudio") {
                  const v = lmUrlDraft.trim();
                  if (v && v !== lmstudioBaseURL) void setLmstudioBaseURL(v);
                } else {
                  const v = ollamaUrlDraft.trim();
                  if (v && v !== ollamaBaseURL) void setOllamaBaseURL(v);
                }
              }}
              placeholder={
                provider === "lmstudio"
                  ? "http://localhost:1234/v1"
                  : "http://localhost:11434/v1"
              }
              spellCheck={false}
              className="h-8 flex-1 font-mono text-[11.5px]"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => void testConnection()}
              className="h-8 px-2.5 text-[11px]"
            >
              Test
            </Button>
          </div>
          {testStatus === "ok" ? (
            <span className="text-[10.5px] text-emerald-500">Connected — server responded.</span>
          ) : testStatus === "fail" ? (
            <span className="text-[10.5px] text-destructive">
              Could not reach the server. Is {provider === "lmstudio" ? "LM Studio" : "Ollama"} running?
            </span>
          ) : testStatus === "testing" ? (
            <span className="text-[10.5px] text-muted-foreground">Testing…</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SearxngBlock() {
  const searxngUrl = usePreferencesStore((s) => s.searxngUrl);
  const [draft, setDraft] = useState(searxngUrl);

  useEffect(() => setDraft(searxngUrl), [searxngUrl]);

  const save = () => {
    const v = draft.trim();
    if (v && v !== searxngUrl) void setSearxngUrl(v);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>SearXNG URL</Label>
      <span className="text-[10.5px] leading-relaxed text-muted-foreground">
        Self-hosted SearXNG instance used by agents for web search. Must return JSON (enable{" "}
        <code className="font-mono">json</code> output format in SearXNG settings).
      </span>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        placeholder="https://searx.be"
        spellCheck={false}
        className="h-8 font-mono text-[11.5px]"
      />
    </div>
  );
}

const EMBEDDING_BACKENDS: { id: EmbeddingBackend; label: string; hint: string }[] = [
  {
    id: "sentence-transformers",
    label: "sentence-transformers",
    hint: "pip install sentence-transformers · downloads ~22 MB once · fully offline",
  },
  {
    id: "ollama",
    label: "Ollama",
    hint: "requires Ollama running · ollama pull all-minilm",
  },
];

function EmbeddingBlock() {
  const backend = usePreferencesStore((s) => s.embeddingBackend);
  const ollamaModel = usePreferencesStore((s) => s.embeddingOllamaModel);
  const workspaceRoot = usePreferencesStore((s) => s.workspaceRoot);
  const [modelDraft, setModelDraft] = useState(ollamaModel);
  const [writeStatus, setWriteStatus] = useState<"idle" | "ok" | "fail">("idle");

  useEffect(() => setModelDraft(ollamaModel), [ollamaModel]);

  const writeConfig = async (b: EmbeddingBackend, model: string) => {
    if (!workspaceRoot) return;
    const cfg = JSON.stringify(
      { backend: b, ollamaUrl: "http://localhost:11434", ollamaModel: model },
      null,
      2,
    );
    const path = workspaceRoot.replace(/[\\/]$/, "") + "/.atlas-embed.json";
    try {
      await invoke("fs_write_file", { path, content: cfg });
      setWriteStatus("ok");
      setTimeout(() => setWriteStatus("idle"), 2000);
    } catch {
      setWriteStatus("fail");
    }
  };

  const onBackendChange = async (b: EmbeddingBackend) => {
    await setEmbeddingBackend(b);
    await writeConfig(b, modelDraft);
  };

  const onModelSave = async () => {
    const v = modelDraft.trim() || "all-minilm";
    if (v !== ollamaModel) await setEmbeddingOllamaModel(v);
    await writeConfig(backend, v);
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label>Embedding backend</Label>
        <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">
          Used by <code className="font-mono">tools/embedder.py</code> and{" "}
          <code className="font-mono">api/server.py</code> for semantic vault search. Writes{" "}
          <code className="font-mono">.atlas-embed.json</code> to the workspace root.
        </p>
      </div>

      <div className="flex flex-col gap-0.5 rounded-lg border border-border/60 bg-card/60 p-0.5">
        {EMBEDDING_BACKENDS.map(({ id, label, hint }) => {
          const active = id === backend;
          return (
            <button
              key={id}
              type="button"
              onClick={() => void onBackendChange(id)}
              className={cn(
                "flex flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors",
                active ? "bg-accent/60" : "hover:bg-accent/20",
              )}
            >
              <span className="text-[12px] font-medium">{label}</span>
              <span className="text-[10.5px] text-muted-foreground">{hint}</span>
            </button>
          );
        })}
      </div>

      {backend === "ollama" && (
        <div className="flex flex-col gap-1.5">
          <Label>Ollama model</Label>
          <Input
            value={modelDraft}
            onChange={(e) => setModelDraft(e.target.value)}
            onBlur={() => void onModelSave()}
            placeholder="all-minilm"
            spellCheck={false}
            className="h-8 font-mono text-[11.5px]"
          />
        </div>
      )}

      {!workspaceRoot && (
        <p className="text-[10.5px] text-amber-500">
          Set a workspace root in Preferences to auto-write{" "}
          <code className="font-mono">.atlas-embed.json</code>.
        </p>
      )}
      {writeStatus === "ok" && (
        <p className="text-[10.5px] text-emerald-500">Config saved to .atlas-embed.json</p>
      )}
      {writeStatus === "fail" && (
        <p className="text-[10.5px] text-destructive">Could not write .atlas-embed.json</p>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
      {children}
    </span>
  );
}
```

- [ ] **Step 2: `getProvider` çağrısını kontrol et**

`AutocompleteBlock` içinde `getProvider(id)` çağrısı var — `id` artık `AutocompleteProviderId` tipi (`"lmstudio" | "ollama"`), ama `getProvider` sadece `ProviderId` (`"opencode"`) kabul ediyor. Bu tip uyuşmazlığını çözmek için `AutocompleteBlock` içindeki `getProvider` çağrısını kaldır ve label/icon'u doğrudan inline yaz:

```typescript
// getProvider(id as "lmstudio" | "ollama") satırını bul ve şöyle değiştir:
const info = { label: id === "lmstudio" ? "LM Studio" : "Ollama" };
```

Ve `<ProviderIcon provider={id} size={12} />` satırını sil (veya `ProviderIcon`'un lmstudio/ollama'yı hâlâ destekleyip desteklemediğine bak).

- [ ] **Step 3: TypeScript doğrula**

```bash
cd ide && npx tsc --noEmit 2>&1 | head -60
```

Hata varsa tek tek düzelt. Sık karşılaşılan: import edilen ama silinmiş setter referansları.

---

### Task 6: Son doğrulama ve commit

- [ ] **Step 1: Tam TypeScript kontrolü**

```bash
cd ide && npx tsc --noEmit 2>&1
```

Sıfır hata bekleniyor.

- [ ] **Step 2: Cargo build kontrolü**

```bash
cd ide/src-tauri && cargo build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add ide/src/modules/ai/config.ts \
        ide/src/modules/ai/lib/agent.ts \
        ide/src/modules/ai/lib/keyring.ts \
        ide/src/modules/settings/store.ts \
        ide/src/settings/sections/ModelsSection.tsx
git commit -m "feat(ai): remove all providers except OpenCode Zen

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
