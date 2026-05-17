import { tool } from "ai";
import { z } from "zod";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { native } from "@/modules/ai/lib/native";
import { LMSTUDIO_DEFAULT_BASE_URL, OLLAMA_DEFAULT_BASE_URL } from "@/modules/ai/config";
import type { ToolContext } from "./context";

const ATLAS_API = "http://127.0.0.1:4242";

export async function findPython(workspaceRoot: string): Promise<string | null> {
  for (const candidate of ["py", "python3", "python"]) {
    try {
      const result = await invoke<{ stdout: string; exit_code: number }>(
        "shell_run_command",
        { command: `${candidate} --version`, cwd: workspaceRoot },
      );
      if (result.exit_code === 0) return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

// --- Types ---

export type IndexPage = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  path: string;
  url: string;
  text: string;
  headings: string[];
  links: string[];
  backlinks: string[];
  modified: string;
};

type IndexFile = {
  generated: string;
  count: number;
  pages: IndexPage[];
};

type SemanticResult = {
  id: string;
  title: string;
  category: string;
  description: string;
  url: string;
  score: number;
};

export type SearchResult = {
  id: string;
  title: string;
  category: string;
  slug: string;
  description: string;
  snippet: string | null;
  score: number;
  source: "keyword" | "semantic" | "hybrid";
};

// --- Helpers ---

export async function readIndex(workspaceRoot: string): Promise<IndexPage[]> {
  const sep = workspaceRoot.includes("\\") ? "\\" : "/";
  const path = `${workspaceRoot}${sep}.index${sep}pages.json`;
  const result = await native.readFile(path);
  if (result.kind !== "text") throw new Error("pages.json unreadable");
  return (JSON.parse(result.content) as IndexFile).pages;
}

function scoreMatch(page: IndexPage, terms: string[]): number {
  let score = 0;
  const title = page.title.toLowerCase();
  const desc = page.description.toLowerCase();
  const headings = page.headings.join(" ").toLowerCase();
  const text = page.text.toLowerCase();
  for (const term of terms) {
    if (title.includes(term)) score += 3;
    if (desc.includes(term)) score += 2;
    if (headings.includes(term)) score += 2;
    if (text.includes(term)) score += 1;
  }
  return score;
}

function extractSnippet(text: string, terms: string[], maxLen = 200): string {
  const lower = text.toLowerCase();
  for (const term of terms) {
    const i = lower.indexOf(term);
    if (i !== -1) {
      const start = Math.max(0, i - 60);
      const end = Math.min(text.length, start + maxLen);
      return (
        (start > 0 ? "…" : "") +
        text.slice(start, end).trim() +
        (end < text.length ? "…" : "")
      );
    }
  }
  return text.slice(0, maxLen).trim() + (text.length > maxLen ? "…" : "");
}

type EmbeddingRecord = { id: string; embedding: number[] };

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

async function embedQuery(
  query: string,
  ollamaBase: string,
  lmstudioBase: string,
): Promise<number[] | null> {
  // Try Ollama first (POST /api/embeddings), then LM Studio (/v1/embeddings)
  const attempts: Array<{ url: string; body: unknown }> = [
    {
      url: ollamaBase.replace(/\/v1$/, "") + "/api/embeddings",
      body: { model: "all-minilm", prompt: query },
    },
    {
      url: lmstudioBase.replace(/\/v1$/, "") + "/v1/embeddings",
      body: { input: query, model: "text-embedding-nomic-embed-text-v1.5" },
    },
  ];
  for (const { url, body } of attempts) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json() as { embedding?: number[]; data?: { embedding: number[] }[] };
      const vec = data.embedding ?? data.data?.[0]?.embedding;
      if (Array.isArray(vec) && vec.length > 0) return vec;
    } catch {
      // try next
    }
  }
  return null;
}

async function localSemanticSearch(
  query: string,
  pages: IndexPage[],
  limit: number,
  category: string | undefined,
  workspaceRoot: string,
  ollamaBase: string,
  lmstudioBase: string,
): Promise<SemanticResult[]> {
  const sep = workspaceRoot.includes("\\") ? "\\" : "/";
  const embPath = `${workspaceRoot}${sep}.index${sep}embeddings.json`;
  const [embResult, queryVec] = await Promise.all([
    native.readFile(embPath).catch(() => null),
    embedQuery(query, ollamaBase, lmstudioBase),
  ]);
  if (!embResult || embResult.kind !== "text" || !queryVec) return [];

  let records: EmbeddingRecord[];
  try {
    records = JSON.parse(embResult.content) as EmbeddingRecord[];
  } catch {
    return [];
  }

  const pageMap = new Map(pages.map((p) => [p.id, p]));
  const scored = records
    .filter((r) => !category || pageMap.get(r.id)?.category === category)
    .map((r) => ({ id: r.id, score: cosine(queryVec, r.embedding) }))
    .filter((r) => r.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ id, score }) => {
    const p = pageMap.get(id);
    return {
      id,
      title: p?.title ?? id,
      category: p?.category ?? id.split("/")[0],
      description: p?.description ?? "",
      url: p?.url ?? "",
      score: Math.round(score * 10000) / 10000,
    };
  });
}

async function semanticSearch(
  query: string,
  limit: number,
  category: string | undefined,
  timeoutMs = 1500,
): Promise<SemanticResult[]> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (category) params.set("category", category);
    const res = await fetch(`${ATLAS_API}/api/semantic?${params}`, {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    return (await res.json()) as SemanticResult[];
  } catch {
    return [];
  }
}

function mergeResults(
  keyword: Array<{ page: IndexPage; score: number }>,
  semantic: SemanticResult[],
  pages: IndexPage[],
  limit: number,
  terms: string[],
): SearchResult[] {
  const maxKw = keyword[0]?.score ?? 1;
  const kwMap = new Map(keyword.map(({ page, score }) => [page.id, score]));
  const semMap = new Map(semantic.map((r) => [r.id, r.score]));
  const pageMap = new Map(pages.map((p) => [p.id, p]));

  const allIds = new Set([...kwMap.keys(), ...semMap.keys()]);
  const entries: Array<{
    id: string;
    blended: number;
    kwScore: number;
    semScore: number;
  }> = [];

  for (const id of allIds) {
    const kwRaw = kwMap.get(id) ?? 0;
    const sem = semMap.get(id) ?? 0;
    const kwNorm = kwRaw / maxKw;
    const bonus = kwRaw > 0 && sem > 0 ? 0.1 : 0;
    entries.push({
      id,
      blended: 0.6 * kwNorm + 0.4 * sem + bonus,
      kwScore: kwRaw,
      semScore: sem,
    });
  }

  entries.sort((a, b) => b.blended - a.blended);

  return entries.slice(0, limit).map(({ id, kwScore, semScore }) => {
    const page = pageMap.get(id);
    const semEntry = semantic.find((r) => r.id === id);
    const source: SearchResult["source"] =
      kwScore > 0 && semScore > 0
        ? "hybrid"
        : semScore > 0
          ? "semantic"
          : "keyword";
    return {
      id,
      title: page?.title ?? semEntry?.title ?? id,
      category: page?.category ?? semEntry?.category ?? id.split("/")[0],
      slug: page?.slug ?? id.split("/")[1] ?? id,
      description: page?.description ?? semEntry?.description ?? "",
      snippet: page ? extractSnippet(page.text, terms) : null,
      score: kwScore > 0 ? kwScore : Math.round(semScore * 100) / 100,
      source,
    };
  });
}

// --- Standalone search for VaultHomePane ---

export function searchVaultDirect(
  query: string,
  pages: IndexPage[],
  opts: { category?: string | null; limit?: number } = {},
): SearchResult[] {
  const { category, limit = 15 } = opts;
  const pool = category ? pages.filter((p) => p.category === category) : pages;

  if (!query.trim()) {
    return [...pool]
      .sort((a, b) => b.modified.localeCompare(a.modified))
      .slice(0, limit)
      .map((p) => ({
        id: p.id,
        title: p.title,
        category: p.category,
        slug: p.slug,
        description: p.description,
        snippet: null,
        score: 0,
        source: "keyword" as const,
      }));
  }

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return pool
    .map((p) => ({ page: p, score: scoreMatch(p, terms) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ page, score }) => ({
      id: page.id,
      title: page.title,
      category: page.category,
      slug: page.slug,
      description: page.description,
      snippet: extractSnippet(page.text, terms),
      score,
      source: "keyword" as const,
    }));
}

// --- Tool builder ---

export function buildVaultTools(ctx: ToolContext) {
  return {
    vault_search: tool({
      description: `Search the Atlas OS knowledge vault (your persistent memory). Hybrid search: fast local keyword index first, augmented with semantic (embedding) search when keyword results are weak and the local API is reachable. ALWAYS call this before answering any question about the user's notes or knowledge base.

Returns: title, category, slug, description, snippet, score, source ("keyword" | "semantic" | "hybrid"). Use vault_read for full content. Pass mode="semantic" to force embedding search for fuzzy / conceptual queries.`,
      inputSchema: z.object({
        query: z.string().describe("Search query"),
        category: z
          .string()
          .optional()
          .describe("Limit results to a specific category"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe("Max results (default 8)"),
        mode: z
          .enum(["auto", "keyword", "semantic"])
          .optional()
          .describe(
            "auto: hybrid when keyword results are weak; keyword: local only; semantic: force embedding API",
          ),
      }),
      execute: async ({ query, category, limit, mode }) => {
        const cap = limit ?? 8;
        const searchMode = mode ?? "auto";
        const root = ctx.getWorkspaceRoot();
        if (!root) return { error: "No workspace root — open a folder first" };

        let pages: IndexPage[] = [];
        try {
          pages = await readIndex(root);
        } catch (e) {
          return { error: `Cannot read .index/pages.json: ${String(e)}` };
        }

        const terms = query
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean);

        const keywordHits = pages
          .filter((p) => !category || p.category === category)
          .map((p) => ({ page: p, score: scoreMatch(p, terms) }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score);

        const topKw = keywordHits[0]?.score ?? 0;
        const needSemantic =
          searchMode === "semantic" ||
          (searchMode !== "keyword" &&
            (keywordHits.length < 3 || topKw < 6));

        let semantic: SemanticResult[] = [];
        if (needSemantic) {
          // Try Atlas API first; if offline, fall back to local embeddings + Ollama/LM Studio
          semantic = await semanticSearch(query, cap * 2, category);
          if (semantic.length === 0) {
            const prefs = (await import("@/modules/settings/preferences"))
              .usePreferencesStore.getState();
            semantic = await localSemanticSearch(
              query, pages, cap * 2, category, root,
              prefs.ollamaBaseURL || OLLAMA_DEFAULT_BASE_URL,
              prefs.lmstudioBaseURL || LMSTUDIO_DEFAULT_BASE_URL,
            );
          }
        }

        if (semantic.length === 0) {
          const results = keywordHits.slice(0, cap).map(({ page, score }) => ({
            id: page.id,
            title: page.title,
            category: page.category,
            slug: page.slug,
            description: page.description,
            snippet: extractSnippet(page.text, terms),
            score,
            source: "keyword" as const,
          }));
          return { query, total_found: results.length, source: "keyword", results };
        }

        const merged = mergeResults(keywordHits, semantic, pages, cap, terms);
        const allKw = merged.every((r) => r.source === "keyword");
        const allSem = merged.every((r) => r.source === "semantic");
        return {
          query,
          total_found: merged.length,
          source: allKw ? "keyword" : allSem ? "semantic" : "hybrid",
          results: merged,
        };
      },
    }),

    vault_read: tool({
      description:
        "Read the full content of a vault page by category and slug. Use after vault_search to get complete page text.",
      inputSchema: z.object({
        category: z.string().describe("Page category"),
        slug: z.string().describe("Page slug"),
      }),
      execute: async ({ category, slug }) => {
        // Try API first — returns full text without the 3000-char index cap
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 1500);
          const res = await fetch(
            `${ATLAS_API}/api/page/${encodeURIComponent(category)}/${encodeURIComponent(slug)}`,
            { signal: ctrl.signal },
          );
          clearTimeout(timer);
          if (res.ok) {
            const data = (await res.json()) as IndexPage & { text: string };
            return {
              id: data.id,
              title: data.title,
              category: data.category,
              slug: data.slug,
              description: data.description,
              text: data.text,
              headings: data.headings,
              backlinks: data.backlinks,
              modified: data.modified,
              source: "api",
            };
          }
        } catch {
          // fall through to local fallbacks
        }

        const root = ctx.getWorkspaceRoot();
        if (!root) return { error: "No workspace root" };

        // Fallback: read the raw HTML from vault/
        const sep = root.includes("\\") ? "\\" : "/";
        const htmlPath = `${root}${sep}vault${sep}${category}${sep}${slug}${sep}index.html`;
        try {
          const result = await native.readFile(htmlPath);
          if (result.kind === "text") {
            return {
              id: `${category}/${slug}`,
              category,
              slug,
              text: result.content,
              source: "local_html",
            };
          }
        } catch {
          // ignore
        }

        // Last resort: index excerpt (3000-char cap)
        try {
          const pages = await readIndex(root);
          const page = pages.find((p) => p.id === `${category}/${slug}`);
          if (page) {
            return {
              ...page,
              source: "index_excerpt",
              note: "Text capped at 3000 chars — API offline",
            };
          }
        } catch {
          // ignore
        }

        return { error: `Page not found: ${category}/${slug}` };
      },
    }),

    vault_write: tool({
      description:
        "Write or update a vault page. Creates vault/{category}/{slug}/index.html. After writing, remind the user to run `python tools/indexer.py` to update the search index.",
      inputSchema: z.object({
        category: z.string().describe("Category (folder name under vault/)"),
        slug: z.string().describe("Slug (subfolder name)"),
        content: z
          .string()
          .describe("Full HTML content for index.html"),
      }),
      execute: async ({ category, slug, content }) => {
        const root = ctx.getWorkspaceRoot();
        if (!root) return { error: "No workspace root" };
        const sep = root.includes("\\") ? "\\" : "/";
        const dir = `${root}${sep}vault${sep}${category}${sep}${slug}`;
        const filePath = `${dir}${sep}index.html`;
        try {
          await native.createDir(dir);
        } catch {
          // directory likely already exists
        }
        await native.writeFile(filePath, content);

        // Fire-and-forget re-index so the new page is searchable on the next turn.
        void (async () => {
          const py = await findPython(root);
          if (!py) return;
          const sep2 = root.includes("\\") ? "\\" : "/";
          await invoke("shell_bg_spawn", {
            command: `${py} tools${sep2}indexer.py`,
            cwd: root,
          }).catch(() => {});
          // Only re-embed if embeddings.json already exists (model may not be installed).
          const embPath = `${root}${sep2}.index${sep2}embeddings.json`;
          try {
            await native.readFile(embPath);
            await invoke("shell_bg_spawn", {
              command: `${py} tools${sep2}embedder.py`,
              cwd: root,
            }).catch(() => {});
          } catch {
            // embeddings not set up — skip
          }
        })();

        await emit("atlas://vault-page-written", { path: filePath, category, slug });

        return {
          id: `${category}/${slug}`,
          path: filePath,
          written: true,
          reindex: "scheduled",
        };
      },
    }),
  } as const;
}
