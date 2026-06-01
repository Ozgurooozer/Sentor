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
                <DropdownMenuContent
                  align="end"
                  className="max-h-64 overflow-y-auto"
                  style={{ minWidth: 260 }}
                >
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

const AUTOCOMPLETE_LABELS: Record<AutocompleteProviderId, string> = {
  lmstudio: "LM Studio",
  ollama: "Ollama",
};

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
                  <span>{AUTOCOMPLETE_LABELS[id]}</span>
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
    const path = workspaceRoot.replace(/[\\/]$/, "") + "/.sentor-embed.json";
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
          <code className="font-mono">.sentor-embed.json</code> to the workspace root.
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
          <code className="font-mono">.sentor-embed.json</code>.
        </p>
      )}
      {writeStatus === "ok" && (
        <p className="text-[10.5px] text-emerald-500">Config saved to .sentor-embed.json</p>
      )}
      {writeStatus === "fail" && (
        <p className="text-[10.5px] text-destructive">Could not write .sentor-embed.json</p>
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
