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
  ANTHROPIC_DEFAULT_CHAT_MODEL,
  AUTOCOMPLETE_PROVIDERS,
  CUSTOM_DEFAULT_BASE_URL,
  DEFAULT_AUTOCOMPLETE_MODEL,
  GROQ_DEFAULT_CHAT_MODEL,
  MODELS,
  OPENAI_DEFAULT_CHAT_MODEL,
  PROVIDERS,
  getModel,
  getProvider,
  type AutocompleteProviderId,
  type ModelId,
} from "@/modules/ai/config";
import { clearKey, getKey, setKey } from "@/modules/ai/lib/keyring";
import { emitKeysChanged } from "@/modules/settings/store";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setAnthropicChatModelId,
  setAutocompleteEnabled,
  setAutocompleteModelId,
  setAutocompleteProvider,
  setCustomProviderBaseURL,
  setCustomProviderModelId,
  setDefaultModel,
  setEmbeddingBackend,
  setEmbeddingOllamaModel,
  setGroqChatModelId,
  setLmstudioBaseURL,
  setLmstudioChatModelId,
  setOllamaBaseURL,
  setOllamaChatModelId,
  setOpenaiChatModelId,
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

export function ModelsSection() {
  const defaultModel = usePreferencesStore((s) => s.defaultModelId);
  const defaultModelInfo = getModel(defaultModel);

  return (
    <div className="flex flex-col gap-7">
      <SectionHeader
        title="Models"
        description="Configure local and cloud AI providers. Local providers need no API keys."
      />

      <div className="flex flex-col gap-2">
        <Label>Default model</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-9 justify-between gap-2 px-2.5 text-[12px]"
            >
              <span className="flex items-center gap-2">
                <ProviderIcon provider={defaultModelInfo.provider} size={14} />
                <span>{defaultModelInfo.label}</span>
                <span className="text-muted-foreground">
                  · {defaultModelInfo.hint}
                </span>
              </span>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={12}
                strokeWidth={2}
                className="opacity-70"
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[220px]">
            {PROVIDERS.map((p) => {
              const models = MODELS.filter((m) => m.provider === p.id);
              return (
                <div key={p.id} className="px-1 pt-1.5">
                  <div className="mb-1 flex items-center gap-1.5 px-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    <ProviderIcon provider={p.id} size={11} />
                    <span>{p.label}</span>
                  </div>
                  {models.map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      onSelect={() => void setDefaultModel(m.id as ModelId)}
                      className={cn(
                        "flex items-center justify-between gap-2 text-[12px]",
                        m.id === defaultModel && "bg-accent/50",
                      )}
                    >
                      <span className="flex flex-col">
                        <span>{m.label}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {m.hint}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </div>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ChatModelBlock />
      <CloudProvidersBlock />
      <CustomProviderBlock />
      <AutocompleteBlock />
      <SearxngBlock />
      <EmbeddingBlock />
    </div>
  );
}

const CLOUD_PROVIDERS = [
  { id: "openai" as const, defaultModel: OPENAI_DEFAULT_CHAT_MODEL, setModel: setOpenaiChatModelId, getPref: (s: { openaiChatModelId: string }) => s.openaiChatModelId },
  { id: "anthropic" as const, defaultModel: ANTHROPIC_DEFAULT_CHAT_MODEL, setModel: setAnthropicChatModelId, getPref: (s: { anthropicChatModelId: string }) => s.anthropicChatModelId },
  { id: "groq" as const, defaultModel: GROQ_DEFAULT_CHAT_MODEL, setModel: setGroqChatModelId, getPref: (s: { groqChatModelId: string }) => s.groqChatModelId },
] as const;

function CloudProvidersBlock() {
  const openaiModel = usePreferencesStore((s) => s.openaiChatModelId);
  const anthropicModel = usePreferencesStore((s) => s.anthropicChatModelId);
  const groqModel = usePreferencesStore((s) => s.groqChatModelId);

  const modelByProvider = { openai: openaiModel, anthropic: anthropicModel, groq: groqModel };
  const [drafts, setDrafts] = useState(modelByProvider);
  const [keys, setKeys] = useState<Record<"openai" | "anthropic" | "groq", string | null>>({
    openai: null, anthropic: null, groq: null,
  });

  useEffect(() => {
    setDrafts({ openai: openaiModel, anthropic: anthropicModel, groq: groqModel });
  }, [openaiModel, anthropicModel, groqModel]);

  useEffect(() => {
    void Promise.all(
      (["openai", "anthropic", "groq"] as const).map(async (id) => {
        const k = await getKey(id);
        return [id, k] as const;
      }),
    ).then((pairs) => {
      const next = { openai: null, anthropic: null, groq: null } as typeof keys;
      pairs.forEach(([id, k]) => { next[id] = k; });
      setKeys(next);
    });
  }, []);

  const handleSave = async (id: "openai" | "anthropic" | "groq", k: string) => {
    await setKey(id, k);
    setKeys((prev) => ({ ...prev, [id]: k }));
    await emitKeysChanged();
  };

  const handleClear = async (id: "openai" | "anthropic" | "groq") => {
    await clearKey(id);
    setKeys((prev) => ({ ...prev, [id]: null }));
    await emitKeysChanged();
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label>Cloud providers</Label>
        <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">
          API keys are stored in the OS keychain. Model ID is optional — leave blank to use the provider default.
        </p>
      </div>
      {CLOUD_PROVIDERS.map(({ id, defaultModel, setModel }) => {
        const info = getProvider(id);
        return (
          <div key={id} className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
            <ProviderKeyCard
              provider={info}
              currentKey={keys[id]}
              onSave={(k) => handleSave(id, k)}
              onClear={() => handleClear(id)}
            />
            <div className="flex flex-col gap-1.5">
              <Label>Model identifier</Label>
              <Input
                value={drafts[id]}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [id]: e.target.value }))}
                onBlur={() => { const v = drafts[id].trim(); void setModel(v); }}
                placeholder={defaultModel}
                spellCheck={false}
                className="h-8 font-mono text-[11.5px]"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CustomProviderBlock() {
  const baseURL = usePreferencesStore((s) => s.customProviderBaseURL);
  const modelId = usePreferencesStore((s) => s.customProviderModelId);
  const [urlDraft, setUrlDraft] = useState(baseURL);
  const [modelDraft, setModelDraft] = useState(modelId);
  const [apiKey, setApiKey] = useState<string | null>(null);

  useEffect(() => { setUrlDraft(baseURL); }, [baseURL]);
  useEffect(() => { setModelDraft(modelId); }, [modelId]);

  useEffect(() => {
    void getKey("custom").then(setApiKey);
  }, []);

  const handleSaveKey = async (k: string) => {
    await setKey("custom", k);
    setApiKey(k);
    await emitKeysChanged();
  };

  const handleClearKey = async () => {
    await clearKey("custom");
    setApiKey(null);
    await emitKeysChanged();
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label>Custom provider</Label>
        <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">
          Any OpenAI-compatible endpoint (LiteLLM, vLLM, local proxies, etc.).
        </p>
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
        <ProviderKeyCard
          provider={getProvider("custom")}
          currentKey={apiKey}
          onSave={handleSaveKey}
          onClear={handleClearKey}
        />
        <div className="flex flex-col gap-1.5">
          <Label>Base URL</Label>
          <Input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onBlur={() => { const v = urlDraft.trim(); if (v !== baseURL) void setCustomProviderBaseURL(v); }}
            placeholder={CUSTOM_DEFAULT_BASE_URL}
            spellCheck={false}
            className="h-8 font-mono text-[11.5px]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Model identifier</Label>
          <Input
            value={modelDraft}
            onChange={(e) => setModelDraft(e.target.value)}
            onBlur={() => { const v = modelDraft.trim(); if (v !== modelId) void setCustomProviderModelId(v); }}
            placeholder="my-model-id"
            spellCheck={false}
            className="h-8 font-mono text-[11.5px]"
          />
        </div>
      </div>
    </div>
  );
}

function ChatModelBlock() {
  const lmstudioChatModelId = usePreferencesStore((s) => s.lmstudioChatModelId);
  const ollamaChatModelId = usePreferencesStore((s) => s.ollamaChatModelId);
  const defaultModel = usePreferencesStore((s) => s.defaultModelId);
  const isOllama = getModel(defaultModel).provider === "ollama";

  const [draft, setDraft] = useState(isOllama ? ollamaChatModelId : lmstudioChatModelId);

  useEffect(() => {
    setDraft(isOllama ? ollamaChatModelId : lmstudioChatModelId);
  }, [isOllama, lmstudioChatModelId, ollamaChatModelId]);

  const save = () => {
    const v = draft.trim();
    if (isOllama) {
      if (v !== ollamaChatModelId) void setOllamaChatModelId(v);
    } else {
      if (v !== lmstudioChatModelId) void setLmstudioChatModelId(v);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>Chat model identifier</Label>
      <span className="text-[10.5px] leading-relaxed text-muted-foreground">
        Exact model ID sent to {isOllama ? "Ollama" : "LM Studio"} (e.g.{" "}
        {isOllama ? "qwen2.5-coder:7b" : "google/gemma-4-e4b"}). Leave blank to use the provider default.
      </span>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        placeholder={isOllama ? "ollama-local" : "lmstudio-local"}
        spellCheck={false}
        className="h-8 font-mono text-[11.5px]"
      />
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
  const [testStatus, setTestStatus] = useState<
    "idle" | "testing" | "ok" | "fail"
  >("idle");

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
      const urlToTest = provider === "lmstudio"
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
              const info = getProvider(id);
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
            <span className="text-[10.5px] text-emerald-500">
              Connected — server responded.
            </span>
          ) : testStatus === "fail" ? (
            <span className="text-[10.5px] text-destructive">
              Could not reach the server. Is {provider === "lmstudio" ? "LM Studio" : "Ollama"} running?
            </span>
          ) : testStatus === "testing" ? (
            <span className="text-[10.5px] text-muted-foreground">
              Testing…
            </span>
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
        Self-hosted SearXNG instance used by agents for web search. Must return JSON (enable <code className="font-mono">json</code> output format in SearXNG settings).
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
    const cfg = JSON.stringify({ backend: b, ollamaUrl: "http://localhost:11434", ollamaModel: model }, null, 2);
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
          Used by <code className="font-mono">tools/embedder.py</code> and <code className="font-mono">api/server.py</code> for semantic vault search.
          Writes <code className="font-mono">.atlas-embed.json</code> to the workspace root.
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
          Set a workspace root in Preferences to auto-write <code className="font-mono">.atlas-embed.json</code>.
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
