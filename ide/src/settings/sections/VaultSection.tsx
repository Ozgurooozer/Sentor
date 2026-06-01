import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setEmbeddingBackend,
  setEmbeddingOllamaModel,
  setSearxngUrl,
  setWorkspaceRoot,
  type EmbeddingBackend,
} from "@/modules/settings/store";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";

const EMBEDDING_BACKENDS: { id: EmbeddingBackend; label: string; hint: string }[] = [
  {
    id: "sentence-transformers",
    label: "sentence-transformers",
    hint: "pip install sentence-transformers · ~22 MB · fully offline",
  },
  {
    id: "ollama",
    label: "Ollama",
    hint: "ollama pull all-minilm · requires Ollama running",
  },
];

export function VaultSection() {
  const workspaceRoot = usePreferencesStore((s) => s.workspaceRoot);
  const searxngUrl = usePreferencesStore((s) => s.searxngUrl);
  const embeddingBackend = usePreferencesStore((s) => s.embeddingBackend);
  const ollamaModel = usePreferencesStore((s) => s.embeddingOllamaModel);

  const [searxDraft, setSearxDraft] = useState(searxngUrl);
  const [modelDraft, setModelDraft] = useState(ollamaModel);
  const [writeStatus, setWriteStatus] = useState<"idle" | "ok" | "fail">("idle");

  useEffect(() => setSearxDraft(searxngUrl), [searxngUrl]);
  useEffect(() => setModelDraft(ollamaModel), [ollamaModel]);

  const writeEmbedConfig = async (b: EmbeddingBackend, model: string) => {
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
    await writeEmbedConfig(b, modelDraft);
  };

  const onModelSave = async () => {
    const v = modelDraft.trim() || "all-minilm";
    if (v !== ollamaModel) await setEmbeddingOllamaModel(v);
    await writeEmbedConfig(embeddingBackend, v);
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Vault"
        description="Knowledge base settings — search, embeddings, and workspace root."
      />

      <div className="flex flex-col gap-2">
        <Label>Workspace root</Label>
        <div
          title={workspaceRoot ?? "Not set"}
          className="truncate rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground"
        >
          {workspaceRoot ?? <span className="italic">Not set</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-fit px-2.5 text-[11px]"
            onClick={async () => {
              const picked = await invoke<string | null>("pick_folder");
              if (picked) await setWorkspaceRoot(picked);
            }}
          >
            ⊞ Klasör Seç
          </Button>
          <span className="text-[10px] text-muted-foreground">Vault kök dizinini değiştir</span>
        </div>
        <p className="text-[10.5px] text-muted-foreground leading-relaxed">
          Vault pages live at <code className="font-mono">{"<root>"}/vault/</code>.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Sentor API</Label>
        <p className="text-[10.5px] leading-relaxed text-muted-foreground">
          REST API for search, pages, and semantic lookup. Start with{" "}
          <code className="font-mono">python api/server.py</code> (default port 4242).
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-fit px-2.5 text-[11px]"
          onClick={() => void invoke<number>("http_ping", { url: "http://localhost:4242/api/categories" })
            .then((s) => alert(s >= 200 && s < 400 ? "Sentor API is running ✓" : `Got status ${s}`))
            .catch(() => alert("Sentor API is not running on port 4242."))}
        >
          Test connection
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <Label>SearXNG URL</Label>
        <p className="text-[10.5px] leading-relaxed text-muted-foreground">
          Self-hosted{" "}
          <button
            type="button"
            onClick={() => void openUrl("https://searxng.org")}
            className="underline underline-offset-2 hover:text-foreground"
          >
            SearXNG
          </button>{" "}
          instance for agent web search. Must have JSON output format enabled.
        </p>
        <Input
          value={searxDraft}
          onChange={(e) => setSearxDraft(e.target.value)}
          onBlur={() => { const v = searxDraft.trim(); if (v && v !== searxngUrl) void setSearxngUrl(v); }}
          placeholder="https://searx.be"
          spellCheck={false}
          className="h-8 font-mono text-[11.5px]"
        />
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <Label>Embedding backend</Label>
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">
            Used by <code className="font-mono">tools/embedder.py</code> for semantic vault search.
            Writes <code className="font-mono">.sentor-embed.json</code>.
          </p>
        </div>

        <div className="flex flex-col gap-0.5 rounded-lg border border-border/60 bg-card/60 p-0.5">
          {EMBEDDING_BACKENDS.map(({ id, label, hint }) => {
            const active = id === embeddingBackend;
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

        {embeddingBackend === "ollama" && (
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
            Set a workspace root to auto-write <code className="font-mono">.sentor-embed.json</code>.
          </p>
        )}
        {writeStatus === "ok" && (
          <p className="text-[10.5px] text-emerald-500">Config saved to .sentor-embed.json</p>
        )}
        {writeStatus === "fail" && (
          <p className="text-[10.5px] text-destructive">Could not write .sentor-embed.json</p>
        )}
      </div>
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
