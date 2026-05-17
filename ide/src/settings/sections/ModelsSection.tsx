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
  MODELS,
  PROVIDERS,
  getModel,
  getProvider,
  type AutocompleteProviderId,
  type ModelId,
} from "@/modules/ai/config";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setAutocompleteEnabled,
  setAutocompleteModelId,
  setAutocompleteProvider,
  setDefaultModel,
  setLmstudioBaseURL,
  setLmstudioChatModelId,
  setOllamaBaseURL,
  setOllamaChatModelId,
  setSearxngUrl,
} from "@/modules/settings/store";
import { invoke } from "@tauri-apps/api/core";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { ProviderIcon } from "../components/ProviderIcon";
import { SectionHeader } from "../components/SectionHeader";

export function ModelsSection() {
  const defaultModel = usePreferencesStore((s) => s.defaultModelId);
  const defaultModelInfo = getModel(defaultModel);

  return (
    <div className="flex flex-col gap-7">
      <SectionHeader
        title="Models"
        description="Local models only — no API keys required. Configure LM Studio or Ollama below."
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
      <AutocompleteBlock />
      <SearxngBlock />
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

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
      {children}
    </span>
  );
}
