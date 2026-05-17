import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { vaultPageAssetUrl } from "@/modules/browser/assetUrl";
import {
  findPython,
  readIndex,
  searchVaultDirect,
  type IndexPage,
  type SearchResult,
} from "@/modules/ai/tools/vault";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";

type Props = {
  workspaceRoot: string | null;
  onOpenBrowserTab: (url: string) => void;
};

type IndexState = "loading" | "empty" | "ready";

export function VaultHomePane({ workspaceRoot, onOpenBrowserTab }: Props) {
  const [query, setQuery] = useState("");
  const [allPages, setAllPages] = useState<IndexPage[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [indexState, setIndexState] = useState<IndexState>("loading");
  const [runningIndexer, setRunningIndexer] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!workspaceRoot) {
      setIndexState("empty");
      setAllPages([]);
      setCategories([]);
      return;
    }
    setIndexState("loading");
    readIndex(workspaceRoot)
      .then((pages) => {
        setAllPages(pages);
        setCategories([...new Set(pages.map((p) => p.category))].sort());
        setIndexState(pages.length === 0 ? "empty" : "ready");
      })
      .catch(() => {
        setAllPages([]);
        setIndexState("empty");
      });
  }, [workspaceRoot]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setResults(searchVaultDirect(query, allPages, { category: activeCategory }));
    }, 150);
    return () => clearTimeout(debounceRef.current);
  }, [query, allPages, activeCategory]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleRunIndexer = async () => {
    if (!workspaceRoot) return;
    setRunningIndexer(true);
    try {
      const py = await findPython(workspaceRoot);
      if (!py) return;
      const sep = workspaceRoot.includes("\\") ? "\\" : "/";
      await invoke("shell_bg_spawn", {
        command: `${py} tools${sep}indexer.py`,
        cwd: workspaceRoot,
      });
      setTimeout(() => {
        readIndex(workspaceRoot)
          .then((pages) => {
            setAllPages(pages);
            setCategories([...new Set(pages.map((p) => p.category))].sort());
            setIndexState(pages.length === 0 ? "empty" : "ready");
          })
          .finally(() => setRunningIndexer(false));
      }, 2500);
    } catch {
      setRunningIndexer(false);
    }
  };

  const openPage = (result: SearchResult) => {
    if (!workspaceRoot) return;
    onOpenBrowserTab(vaultPageAssetUrl(workspaceRoot, result.category, result.slug));
  };

  const isSearching = query.trim().length > 0;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Search bar */}
      <div className="shrink-0 border-b border-border/60 px-4 py-3">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search vault…"
          className={cn(
            "w-full rounded-md border border-border/60 bg-card px-3 py-1.5 text-sm text-foreground",
            "placeholder:text-muted-foreground/60",
            "focus:border-border focus:outline-none focus:ring-1 focus:ring-accent/40",
            "transition-colors duration-150",
          )}
        />
      </div>

      {/* Category chips */}
      {indexState === "ready" && categories.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-border/60 px-4 py-2">
          <button
            onClick={() => setActiveCategory(null)}
            className={cn(
              "rounded px-2 py-0.5 text-[11px] font-medium transition-colors duration-150",
              activeCategory === null
                ? "bg-accent text-white"
                : "border border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
              className={cn(
                "rounded px-2 py-0.5 text-[11px] font-medium transition-colors duration-150",
                activeCategory === cat
                  ? "bg-accent text-white"
                  : "border border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Results / Empty state */}
      {indexState === "loading" && (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
      )}

      {indexState === "empty" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">
            {workspaceRoot ? "No pages found in vault." : "Open a folder to view the vault."}
          </p>
          {workspaceRoot && (
            <button
              onClick={() => void handleRunIndexer()}
              disabled={runningIndexer}
              className={cn(
                "rounded border border-border/60 px-3 py-1.5 text-xs text-muted-foreground",
                "hover:border-border hover:text-foreground transition-colors duration-150",
                "disabled:opacity-50",
              )}
            >
              {runningIndexer ? "Indexing…" : "Run Indexer"}
            </button>
          )}
        </div>
      )}

      {indexState === "ready" && (
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-4 py-3">
            {/* Section header */}
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
              {isSearching
                ? `Results (${results.length})`
                : activeCategory
                  ? `Recent · ${activeCategory}`
                  : "Recent"}
            </p>

            {results.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">No results</p>
            )}

            <div className="flex flex-col gap-1.5">
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => openPage(r)}
                  className={cn(
                    "group w-full rounded-md border border-border/60 bg-card px-3 py-2.5 text-left",
                    "hover:border-border hover:bg-card/80 transition-colors duration-150",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground group-hover:text-foreground">
                      {r.title}
                    </span>
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground border border-border/60">
                      {r.category}
                    </span>
                  </div>
                  {r.description && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.description}</p>
                  )}
                  {r.snippet && (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/70 italic">
                      {r.snippet}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
