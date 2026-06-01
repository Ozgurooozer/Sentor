# Sentor — Second-Brain IDE + Local Browser Plan (v2)

This document is the complete build plan for the next phase of Sentor.
It is written for Claude Code to execute step by step.

**Changes from v1:** All 11 identified problems are fixed — DuckDuckGo scraping replaced,
`file://` iframe approach corrected, Python path made reliable, vault_write approval
redesigned, Mermaid bundled locally, custom `vault:` scheme removed, searchVault
extraction fixed, phase ordering corrected, tab persistence and bookmarks specified,
and Fast Refresh breakage fixed first.

---

## 1. Vision

Sentor is a **local-first second brain** for one user. It has three jobs:

1. **Answer questions** using local AI (LM Studio + Ollama) — no cloud.
2. **Remember everything** as HTML pages inside `vault/` — pages are written by an agent,
   indexed for keyword + semantic search, and re-used in future conversations.
3. **Browse the web** like a normal browser, so the user can read pages directly and so
   AI agents can fetch and learn from them.

The product is a single Tauri desktop app:

- **AI chat** with three agents: **Vault** (default, research + memory), **Sentor-Maker**
  (writes HTML vault pages), **Coder** (edits source files).
- **File explorer + editor** (already working).
- **Browser tab** — address bar that handles real URLs, vault pages, and text searches.
- **Vault Home tab** — front door: a search UI over the user's own knowledge base.
- **Terminal**, **shortcuts**, **settings** (already exist, not touched).

Constraints:
- **Local providers only** — LM Studio (`localhost:1234`) and Ollama (`localhost:11434`).
  No API keys, no cloud calls except outbound HTTP for `web_search` / `web_fetch`.
- **Minimal agents** — exactly Vault, Sentor-Maker, Coder. No more.
- **Vault stores raw HTML** in `vault/{category}/{slug}/index.html`.
  Python indexer (`tools/indexer.py`) is the source of truth for `.index/`.

---

## 2. Current State (verified)

### Works
| Area | File |
|---|---|
| Vault hybrid search (keyword + semantic, offline embedding fallback) | [ide/src/modules/ai/tools/vault.ts](ide/src/modules/ai/tools/vault.ts) |
| `vault_read` / `vault_write` | same |
| Folder picker + persisted `workspaceRoot` | [ide/src/modules/settings/store.ts](ide/src/modules/settings/store.ts) |
| File explorer | [ide/src/modules/explorer/FileExplorer.tsx](ide/src/modules/explorer/FileExplorer.tsx) |
| Preview pane (iframe, any URL) | [ide/src/modules/preview/PreviewPane.tsx](ide/src/modules/preview/PreviewPane.tsx) |
| Python indexer + embedder | [tools/indexer.py](tools/indexer.py), [tools/embedder.py](tools/embedder.py) |
| REST API on port 4242 | [api/server.py](api/server.py) |
| Browser vault search UI (file://) | [ui/index.html](ui/index.html) |
| CLI with vault memory loop | [cli/main.py](cli/main.py) |

### Missing / broken
1. No `web_search` or `web_fetch` tool — agents cannot reach the open web.
2. No auto re-index after `vault_write`.
3. Preview not connected to vault — no asset:// handling, no context-menu wiring.
4. No Browser tab or Vault Home tab.
5. Only 2 generic agents (Planner + Builder) instead of the 3 needed.
6. Two Fast Refresh violations in dev mode causing constant full-page reloads.

---

## 3. Target Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Sentor (Tauri Window)                                         │
├──────────────┬───────────────────────────────────────────────────┤
│  Sidebar     │  Tab strip — kinds:                               │
│  - Explorer  │   • terminal   (xterm + PTY) — already works      │
│  - AI Chat   │   • editor     (CodeMirror)  — already works      │
│              │   • preview    (dev server iframe) — already works │
│              │   • browser    (NEW — full browser tab)            │
│              │   • vault-home (NEW — search front door)           │
├──────────────┴───────────────────────────────────────────────────┤
│  Status bar  │  AI controls · agent picker · ports · path         │
└──────────────────────────────────────────────────────────────────┘

AI Layer:
  Agents: Vault (default) · Sentor-Maker · Coder
  Subagents: explore · general
  Providers: LM Studio + Ollama only
  Tools: fs, edit, search, shell, terminal, todo,
         vault_search, vault_read, vault_write,
         web_search (NEW), web_fetch (NEW)

Knowledge Layer:
  vault/{cat}/{slug}/index.html  ← source of truth
  tools/indexer.py + embedder.py ← build .index/
  .index/pages.json + embeddings.json
  api/server.py (port 4242)      ← optional REST
```

---

## 4. Build Phases

Do phases strictly in order. After each phase: `cargo build` (zero warnings) +
`npx tsc --noEmit` (zero errors) + test acceptance criterion.

---

### PHASE 0 — Fix Fast Refresh violations (dev quality, 30 min)

Two files mix component exports with non-component hook exports in the same module,
which breaks Vite Fast Refresh. Every save causes a full-page reload instead of a
hot patch — this makes all subsequent dev work painful.

**0A. Fix `composer.tsx`**
- **File:** [ide/src/modules/ai/lib/composer.tsx](ide/src/modules/ai/lib/composer.tsx)
- **Problem:** exports both a React context/provider component AND a `useComposer` hook
  from the same file. Vite sees a non-component named export and invalidates Fast Refresh.
- **Fix:** Move `useComposer` (and any other hook exports) into a new sibling file
  `ide/src/modules/ai/lib/useComposer.ts`. The provider component stays in `composer.tsx`.
  Update all import sites.

**0B. Fix `ThemeProvider.tsx`**
- **File:** [ide/src/modules/theme/ThemeProvider.tsx](ide/src/modules/theme/ThemeProvider.tsx)
- **Problem:** Same pattern — `useTheme` hook exported alongside the provider component.
- **Fix:** Move `useTheme` into `ide/src/modules/theme/useTheme.ts`. Update all imports.

**Acceptance:** Start `npm run tauri dev`. Edit any file. The HMR log shows `hmr update`
(not `hmr invalidate`) for these modules. No more repeated full-page reloads every 5 s.

---

### PHASE A — Web tools (Rust + TypeScript)

**Goal:** Agents can search the open web and read page content.

#### A1. Add Rust dependencies

**File:** [ide/src-tauri/Cargo.toml](ide/src-tauri/Cargo.toml)

Add under `[dependencies]`:
```toml
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "json"] }
scraper = "0.20"
```

`rustls-tls` avoids the OpenSSL build dependency on Windows.
`default-features = false` strips the native-tls feature that causes Windows link errors.

#### A2. Create `modules/web.rs`

**File:** new `ide/src-tauri/src/modules/web.rs`

```rust
use reqwest::Client;
use scraper::{Html, Selector};
use serde::Serialize;
use std::time::Duration;

#[derive(Serialize)]
pub struct SearchHit {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

#[derive(Serialize)]
pub struct FetchResult {
    pub url: String,
    pub title: Option<String>,
    pub text: String,
    pub html_len: usize,
}

fn make_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(8))
        .user_agent("Mozilla/5.0 (compatible; SentorOS/1.0)")
        .build()
        .map_err(|e| e.to_string())
}

/// Search via SearXNG. `base_url` is the SearXNG instance root
/// (e.g. "https://searx.be" or "http://localhost:8080").
#[tauri::command]
pub async fn web_search(
    query: String,
    limit: Option<usize>,
    searxng_url: Option<String>,
) -> Result<Vec<SearchHit>, String> {
    let cap = limit.unwrap_or(8).min(20);
    let base = searxng_url
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "https://searx.be".to_string());
    let url = format!(
        "{}/search?q={}&format=json&categories=general",
        base.trim_end_matches('/'),
        urlencoding::encode(&query)
    );
    let client = make_client()?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("web_search request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("SearXNG returned HTTP {}", resp.status()));
    }
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("web_search parse error: {e}"))?;
    let results = body["results"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .take(cap)
                .map(|r| SearchHit {
                    title: r["title"].as_str().unwrap_or("").to_string(),
                    url: r["url"].as_str().unwrap_or("").to_string(),
                    snippet: r["content"].as_str().unwrap_or("").to_string(),
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(results)
}

/// Fetch a URL and return stripped readable text (max 50 KB).
#[tauri::command]
pub async fn web_fetch(url: String) -> Result<FetchResult, String> {
    // Block unsafe schemes
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Only http:// and https:// URLs are allowed".to_string());
    }
    let client = make_client()?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("web_fetch request failed: {e}"))?;
    let final_url = resp.url().to_string();
    let html_bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("web_fetch read error: {e}"))?;
    let html_len = html_bytes.len();
    let raw = String::from_utf8_lossy(&html_bytes);
    let document = Html::parse_document(&raw);

    // Extract title
    let title_sel = Selector::parse("title").unwrap();
    let title = document
        .select(&title_sel)
        .next()
        .map(|e| e.text().collect::<String>().trim().to_string());

    // Remove noisy elements
    let strip_sel = Selector::parse("script,style,nav,footer,header,aside,noscript").unwrap();
    // Collect text from remaining nodes
    let body_sel = Selector::parse("body").unwrap();
    let mut text = String::new();
    if let Some(body) = document.select(&body_sel).next() {
        for node in body.descendants() {
            // Skip stripped elements
            if let Some(el) = scraper::ElementRef::wrap(node) {
                if strip_sel.matches(&el) {
                    continue;
                }
            }
            if let Some(t) = node.value().as_text() {
                let s = t.trim();
                if !s.is_empty() {
                    text.push_str(s);
                    text.push(' ');
                }
            }
        }
    }
    // Collapse whitespace and cap
    let text: String = text
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    const MAX: usize = 50_000;
    let text = if text.len() > MAX {
        format!("{}…", &text[..MAX])
    } else {
        text
    };
    Ok(FetchResult { url: final_url, title, text, html_len })
}
```

**Note:** Add `urlencoding = "2"` to Cargo.toml dependencies (tiny crate for percent-encoding).

#### A3. Add `pub mod web;` to modules

**File:** [ide/src-tauri/src/modules/mod.rs](ide/src-tauri/src/modules/mod.rs)

Add `pub mod web;` alongside the existing module declarations.

#### A4. Register commands in lib.rs

**File:** [ide/src-tauri/src/lib.rs](ide/src-tauri/src/lib.rs)

In the `use` block at the top:
```rust
use modules::{fs, net, pty, secrets, shell, web};
```

In `invoke_handler!`, add:
```rust
web::web_search,
web::web_fetch,
```

#### A5. SearXNG URL in settings

**Why:** The user needs to configure which SearXNG instance to use. A public default is
provided but it may be slow or rate-limited. Self-hosted (`http://localhost:8080`) is
the best long-term option.

**File:** [ide/src/modules/settings/store.ts](ide/src/modules/settings/store.ts)

Add `searxngUrl: string` to the `Preferences` type and `DEFAULT_PREFERENCES`
(default: `"https://searx.be"`). Add `KEY_SEARXNG_URL = "searxngUrl"`, a getter in
`loadPreferences`, a setter `setSearchUrl`, and include it in `onPreferencesChange`.

**File:** `ide/src/settings/sections/` — add a small "Web Search" row in the Models
section (or a new General section): a text input labelled "SearXNG instance URL".

#### A6. TypeScript tool wrappers

**File:** new `ide/src/modules/ai/tools/web.ts`

```ts
import { tool } from "ai";
import { z } from "zod";
import { invoke } from "@tauri-apps/api/core";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { ToolContext } from "./context";

export function buildWebTools(_ctx: ToolContext) {
  return {
    web_search: tool({
      description: `Search the open web via SearXNG. Use this when vault_search returns no good results (score < 6) or the question requires current/external information. Returns titles, URLs, and snippets.`,
      inputSchema: z.object({
        query: z.string().describe("Search query"),
        limit: z.number().int().min(1).max(10).optional().describe("Max results (default 8)"),
      }),
      execute: async ({ query, limit }) => {
        const prefs = usePreferencesStore.getState();
        const searxngUrl = (prefs as any).searxngUrl as string | undefined;
        try {
          const results = await invoke<Array<{ title: string; url: string; snippet: string }>>(
            "web_search", { query, limit, searxngUrl }
          );
          return { query, results };
        } catch (e) {
          return { error: String(e), results: [] };
        }
      },
    }),

    web_fetch: tool({
      description: `Fetch a URL and return its text content (scripts, nav, footer stripped; capped at 50 KB). Use after web_search to read the full content of a promising result.`,
      inputSchema: z.object({
        url: z.string().url().describe("https:// URL to fetch"),
      }),
      execute: async ({ url }) => {
        try {
          return await invoke("web_fetch", { url });
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),
  } as const;
}
```

Both tools are **read-only** — they auto-execute without user approval. Add
`...buildWebTools(ctx)` in `buildTools()` in [tools.ts](ide/src/modules/ai/tools/tools.ts).

#### A7. Bundle mermaid.min.js as a static asset

**Problem:** Sentor-Maker will generate HTML pages that include Mermaid diagrams.
The CDN link fails when offline.

**Fix:** Download `mermaid.min.js` from jsDelivr (it is MIT-licensed) and place it at
`ide/public/vendor/mermaid.min.js`. Tauri serves `public/` as static assets automatically
in both dev (via Vite) and production builds.

In Sentor-Maker's generated HTML pages, the agent must use:
```html
<script src="/vendor/mermaid.min.js"></script>
```
*not* the CDN URL.

Update Sentor-Maker's system prompt (Phase B) to enforce this path.

**Acceptance (Phase A):**
Start the IDE in dev mode. Open AI chat. Switch to Vault agent temporarily.
Type: "search the web for mermaid diagram types". Observe: the model calls `web_search`,
the tool card shows 5+ results with URLs. Type: "fetch the first URL". Observe: `web_fetch`
runs, the tool card shows stripped text content.

---

### PHASE B — Collapse to 3 agents

Do this phase at the same time as A6 (the tools must exist before the agent prompts reference them).

#### B1. Rewrite BUILTIN_AGENTS

**File:** [ide/src/modules/ai/lib/agents.ts](ide/src/modules/ai/lib/agents.ts)

Replace the existing `BUILTIN_AGENTS` array with exactly these three entries:

```ts
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
3. Answer concisely. If the answer took significant research (not a simple fact), say: "Worth saving — ask Sentor-Maker to write a vault page."
4. Never call vault_write yourself. That is Sentor-Maker's job.`,
  },
  {
    id: "builtin:sentor-maker",
    name: "Sentor-Maker",
    description: "Every answer becomes a vault HTML page with diagrams. Builds your second brain.",
    icon: "designer",
    builtIn: true,
    instructions: `SENTOR-MAKER
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
- Tables: border-collapse, subtle bottom borders on rows, no box-shadow.
- Read vault/projects/sentor-mimari/index.html once as a template reference.`,
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
```

The default is `BUILTIN_AGENTS[0]` (Vault). `findAgent` already falls back to index 0,
so no change needed there.

#### B2. Trim subagents

**File:** [ide/src/modules/ai/agents/registry.ts](ide/src/modules/ai/agents/registry.ts)

Change `SubagentType` to: `"explore" | "general"` (remove `"planner"`, `"code-review"`, `"security"`).

Remove the deleted entries from `SUBAGENTS`. Keep `explore` and `general` unchanged.

**File:** [ide/src/modules/ai/agents/runSubagent.ts](ide/src/modules/ai/agents/runSubagent.ts)

Remove any `switch`/`if` branches that reference `"planner"`, `"code-review"`, `"security"`.
TypeScript will flag the dead code.

**Acceptance (Phase B):**
Open agent picker → exactly 3 agents: Vault, Sentor-Maker, Coder. Vault is selected by default.

---

### PHASE C — Auto re-index after vault_write

**Goal:** A page written by Sentor-Maker is searchable on the next turn without manual intervention.

#### C1. Detect Python executable reliably

Create a helper in `ide/src/modules/ai/tools/vault.ts` (top of file, near other helpers):

```ts
async function findPython(workspaceRoot: string): Promise<string | null> {
  // Try candidates in order; use shell_run_command with a quick version check.
  for (const candidate of ["py", "python3", "python"]) {
    try {
      const result = await invoke<{ stdout: string; exit_code: number }>(
        "shell_run_command",
        { command: `${candidate} --version`, cwd: workspaceRoot }
      );
      if (result.exit_code === 0) return candidate;
    } catch { /* try next */ }
  }
  return null;
}
```

#### C2. Trigger re-index in vault_write

**File:** [ide/src/modules/ai/tools/vault.ts](ide/src/modules/ai/tools/vault.ts)
In the `vault_write` execute function, after the file is successfully written:

```ts
// Fire-and-forget re-index. Don't await — user shouldn't wait for this.
(async () => {
  const py = await findPython(root);
  if (!py) return;
  const sep = root.includes("\\") ? "\\" : "/";
  await invoke("shell_bg_spawn", {
    command: `${py} tools${sep}indexer.py`,
    cwd: root,
  }).catch(() => {});
  // Only re-embed if embeddings.json already exists (model may not be installed)
  const embPath = `${root}${sep}.index${sep}embeddings.json`;
  try {
    await native.readFile(embPath); // throws if missing
    await invoke("shell_bg_spawn", {
      command: `${py} tools${sep}embedder.py`,
      cwd: root,
    }).catch(() => {});
  } catch { /* embeddings not set up — skip silently */ }
})();

return { id: `${category}/${slug}`, path: filePath, written: true, reindex: "scheduled" };
```

#### C3. Optional: Re-index button in status bar

**File:** add a small icon button in [ide/src/modules/statusbar/](ide/src/modules/statusbar/).
On click, runs `findPython` + `shell_run_command` for `indexer.py`, shows a spinner while running.
This is optional but useful for manual refresh.

**Acceptance (Phase C):**
Ask Sentor-Maker to write a page on "photosynthesis". Wait 5 seconds. Switch to Vault agent,
ask "what do you know about photosynthesis". `vault_search` returns the new page.

---

### PHASE D — Browser tab (the real browser)

**Goal:** A tab kind that behaves like a minimal browser — address bar accepts URLs,
vault page paths, and text queries; back/forward history; bookmarks; graceful fallback
for blocked sites.

#### D1. Tauri asset protocol setup

**Why:** Tauri's WebView2 (Windows) and WebKit (macOS) block `file://` URIs in iframes
for security reasons. The correct approach is Tauri's built-in `asset:` protocol, which
serves local files through a controlled origin. Use `convertFileSrc` from `@tauri-apps/api/core`
to convert an absolute local path to an `asset://localhost/...` URL that the iframe accepts.

**File:** [ide/src-tauri/tauri.conf.json](ide/src-tauri/tauri.conf.json)

Add inside `"app"`:
```json
"security": {
  "csp": null,
  "assetProtocol": {
    "enable": true,
    "scope": ["**"]
  }
}
```

**Note on vault HTML relative links:** Vault pages reference each other with relative paths
like `../other-slug/index.html`. These still resolve correctly when loaded via
`asset://localhost/path/to/vault/cat/slug/index.html` because the iframe treats
`asset://localhost` as the base origin and relative paths resolve from the file's location.
Test this explicitly with a vault page that contains backlinks.

#### D2. New tab type

**File:** [ide/src/modules/tabs/lib/useTabs.ts](ide/src/modules/tabs/lib/useTabs.ts)

Add two new types to the union:

```ts
export type BrowserTab = {
  id: number;
  kind: "browser";
  title: string;
  url: string;        // current loaded URL (asset://, https://, or "search:query")
  history: string[];  // list of visited URLs
  historyIdx: number; // current position in history
};

export type VaultHomeTab = {
  id: number;
  kind: "vault-home";
  title: string;
};

export type Tab = TerminalTab | EditorTab | PreviewTab | AiDiffTab | BrowserTab | VaultHomeTab;
```

Add `openBrowserTab(url: string)` and `openVaultHomeTab()` methods to `useTabs`, following the
pattern of `openPreviewTab`. Both push to `tabs` state and `setActiveId`.

Add `updateBrowserUrl(tabId: number, url: string, pushHistory: boolean)` and
`navigateBrowserHistory(tabId: number, delta: -1 | 1)` helpers.

#### D3. Asset URL helper

**File:** new `ide/src/modules/browser/assetUrl.ts`

```ts
import { convertFileSrc } from "@tauri-apps/api/core";

/** Convert a local absolute path to a Tauri asset:// URL safe for iframes. */
export function localToAsset(path: string): string {
  return convertFileSrc(path);
}

/** Convert a vault cat/slug pair to an asset:// URL given the workspace root. */
export function vaultPageAssetUrl(root: string, category: string, slug: string): string {
  const sep = root.includes("\\") ? "\\" : "/";
  const path = `${root}${sep}vault${sep}${category}${sep}${slug}${sep}index.html`;
  return localToAsset(path);
}
```

Drop the `vault:cat/slug` custom scheme from the plan — it would require OS-level
protocol handler registration. Use `vaultPageAssetUrl()` directly instead.

#### D4. Bookmarks store

**File:** new `ide/src/modules/browser/bookmarks.ts`

```ts
import { appDataDir } from "@tauri-apps/api/path";
import { native } from "@/modules/ai/lib/native";

export type Bookmark = { url: string; title: string; added: string };

async function bookmarksPath(): Promise<string> {
  const dir = await appDataDir();
  return `${dir}bookmarks.json`;
}

export async function loadBookmarks(): Promise<Bookmark[]> {
  try {
    const path = await bookmarksPath();
    const r = await native.readFile(path);
    if (r.kind === "text") return JSON.parse(r.content) as Bookmark[];
  } catch { /* none yet */ }
  return [];
}

export async function saveBookmarks(bm: Bookmark[]): Promise<void> {
  const path = await bookmarksPath();
  await native.writeFile(path, JSON.stringify(bm, null, 2));
}

export async function toggleBookmark(url: string, title: string): Promise<boolean> {
  const bm = await loadBookmarks();
  const idx = bm.findIndex((b) => b.url === url);
  if (idx >= 0) {
    bm.splice(idx, 1);
    await saveBookmarks(bm);
    return false; // removed
  }
  bm.unshift({ url, title, added: new Date().toISOString() });
  await saveBookmarks(bm);
  return true; // added
}
```

#### D5. Build `BrowserPane.tsx`

**File:** new `ide/src/modules/browser/BrowserPane.tsx`

Structure (not full code — implement each part):

**Address bar (`AddressBar.tsx` in same folder):**
- Back button (`ArrowLeft01Icon`) — disabled when `historyIdx === 0`
- Forward button (`ArrowRight01Icon`) — disabled at end of history
- Reload button (`Refresh01Icon`)
- Input (`flex-1`, `text-xs`, on Enter calls `onNavigate`)
- Bookmark icon (`BookmarkAdd01Icon` / `BookmarkCheck01Icon`) — filled when bookmarked
- "Open externally" icon (`ExternalLinkIcon`) — calls `invoke("plugin:opener|open_url", { url })`

**Navigation logic (`onNavigate(input: string)`):**
```ts
function resolveInput(input: string): { kind: "url" | "search"; value: string } {
  const s = input.trim();
  if (/^https?:\/\//i.test(s)) return { kind: "url", value: s };
  if (/^asset:\/\//i.test(s)) return { kind: "url", value: s };
  if (/^[a-zA-Z]:\\/.test(s) || s.startsWith("/"))
    return { kind: "url", value: localToAsset(s) };
  // Bare domain heuristic: contains a dot and no spaces
  if (/^[a-z0-9-]+\.[a-z]{2,}(\/.*)?$/i.test(s))
    return { kind: "url", value: `https://${s}` };
  return { kind: "search", value: s };
}
```

- `kind: "url"` → set iframe `src`, push to history.
- `kind: "search"` → call `web_search` (via `invoke("web_search", {...})`),
  show results as cards in the body (no iframe). Clicking a card navigates to its URL.

**Iframe body:**
- `<iframe src={resolvedUrl} ... onLoad={handleLoad} />`
- On `onLoad`, update the tab title from `document.title` if accessible (same-origin only).
- X-Frame-Options blocker detection: set a timeout on load. If load takes > 4 s for a
  non-local URL, show an overlay: "This site refuses to embed. [Open in system browser]".
  Use `tauri-plugin-opener` to open externally.

**Search results fallback view:**
When the last action was a text search (not a URL load), render results as cards:
```
┌─────────────────────────────────────────────┐
│ [Title]                           [url dim]  │
│  snippet text ...                            │
└─────────────────────────────────────────────┘
```
Click → navigate to the URL (triggers iframe load).

#### D6. Wire vault_write → auto-open in Browser

**File:** [ide/src/modules/ai/tools/vault.ts](ide/src/modules/ai/tools/vault.ts)

After writing the file, emit a Tauri event:
```ts
import { emit } from "@tauri-apps/api/event";
// ...
await emit("sentor://vault-page-written", { path: filePath, category, slug });
```

**File:** [ide/src/app/App.tsx](ide/src/app/App.tsx)

Subscribe to the event on mount:
```ts
import { listen } from "@tauri-apps/api/event";
// In useEffect on mount:
const unlisten = await listen<{ path: string; category: string; slug: string }>(
  "sentor://vault-page-written",
  (e) => {
    const assetUrl = localToAsset(e.payload.path);
    openBrowserTab(assetUrl); // from useTabs
  }
);
return unlisten;
```

#### D7. Context menu "Open in Browser" on .html files

**File:** [ide/src/modules/explorer/FileTreeNode.tsx](ide/src/modules/explorer/FileTreeNode.tsx)

In the context menu, when `entry.name.endsWith(".html")`, add a menu item:
```
Open in Browser
```
On click: `onOpenBrowserTab?.(localToAsset(fullPath))`.

Thread `onOpenBrowserTab` prop down from `FileExplorer` → `FileTreeNode`.
`FileExplorer` receives it from `App.tsx` (same pattern as `onRevealInTerminal`).

#### D8. Wire BrowserPane in App.tsx

**File:** [ide/src/app/App.tsx](ide/src/app/App.tsx)

In the tab rendering switch (wherever `PreviewTab` is rendered):
```ts
case "browser":
  return <BrowserPane key={tab.id} tab={tab} onNavigate={...} onHistoryNav={...} />;
case "vault-home":
  return <VaultHomePane key={tab.id} onOpenBrowser={openBrowserTab} />;
```

Add a "New Browser Tab" button in the tab strip (a globe icon). Add to `Header` or
tab-strip controls.

**Acceptance (Phase D):**
1. Click "New Browser Tab" → BrowserPane opens.
2. Type `github.com` → loads GitHub (or shows the block overlay + "Open externally" button).
3. Type `tauri iframe` → shows web_search result cards.
4. Click a card → iframe loads the URL.
5. Type the absolute path of `vault/html/html-quality/index.html` → loads via asset://.
6. Ask Sentor-Maker anything → vault_write fires → a new browser tab opens with the vault page.
7. Click ☆ on the address bar → bookmark is saved. Open bookmarks dropdown → it appears.

---

### PHASE E — Vault Home (search front door)

**Goal:** The first thing the user sees when opening the app is their own knowledge base.

#### E1. Extract `searchVault()` for direct use

**File:** [ide/src/modules/ai/tools/vault.ts](ide/src/modules/ai/tools/vault.ts)

Extract the search logic out of the `execute` callback into a standalone exported function:

```ts
export async function searchVault(opts: {
  query: string;
  workspaceRoot: string;
  category?: string;
  limit?: number;
  mode?: "auto" | "keyword" | "semantic";
}): Promise<{ results: SearchResult[]; source: string; total_found: number }> {
  // ... (move the body of vault_search.execute here, replace ctx.getWorkspaceRoot() with opts.workspaceRoot)
}
```

The `vault_search` tool's `execute` callback becomes a thin wrapper:
```ts
execute: async ({ query, category, limit, mode }) => {
  const root = ctx.getWorkspaceRoot();
  if (!root) return { error: "No workspace root" };
  return searchVault({ query, workspaceRoot: root, category, limit, mode });
}
```

This lets `VaultHomePane` call `searchVault` directly with the workspace root from
`usePreferencesStore(s => s.workspaceRoot)`, without going through an AI agent loop.

#### E2. Build VaultHomePane.tsx

**File:** new `ide/src/modules/vault-home/VaultHomePane.tsx`

Layout (from top to bottom):
```
┌───────────────────────────────────────────────────────┐
│                                                       │
│           sentor os    (accent color, logo)            │
│                                                       │
│   ┌─────────────────────────────────────────────┐    │
│   │  Search your knowledge...                   │    │
│   └─────────────────────────────────────────────┘    │
│                                                       │
│   Categories (chips): [home] [html] [projects] ...    │
│                                                       │
│   ── Recent pages ──────────────────────────────     │
│   [card] [card] [card] [card] [card] [card]          │
│                                                       │
│   ── Results ───────────────────────────────────     │
│   [result card] ...                                   │
└───────────────────────────────────────────────────────┘
```

**Search behavior:**
- `useEffect` on query change (debounced 150 ms): call `searchVault({ query, workspaceRoot })`.
- Empty query: show Recent pages (sorted by `modified` desc, top 6).
- Category chip click: filters results to that category.
- Click result card → `onOpenBrowser(vaultPageAssetUrl(root, cat, slug))`.

**Empty state (no `.index/pages.json`):**
```
Your vault is empty.
[Run indexer]  ← button that calls shell_run_command("py tools/indexer.py", root)
```
Show a spinner on the button while running.

**Result card:**
```
┌──────────────────────────────────────────────────┐
│ [category badge]  Title                          │
│ snippet excerpt...                               │
│ modified date                         dim        │
└──────────────────────────────────────────────────┘
```

#### E3. Open Vault Home on startup

**File:** [ide/src/modules/tabs/lib/useTabs.ts](ide/src/modules/tabs/lib/useTabs.ts)

Change the initial tab from terminal to vault-home:
```ts
const [tabs, setTabs] = useState<Tab[]>(() => [
  { id: 1, kind: "vault-home", title: "Vault" },
]);
const [activeId, setActiveId] = useState(1);
const nextIdRef = useRef(2);
```

A terminal tab opens when the user clicks "New Terminal" in the tab strip (already wired).
This way the user sees their knowledge base on launch, not an empty shell.

#### E4. Global shortcut to focus Vault Home

**File:** [ide/src/modules/shortcuts/shortcuts.ts](ide/src/modules/shortcuts/shortcuts.ts)

Add a `"vaultHome.open"` shortcut (default: Ctrl+Shift+H).

In `App.tsx`, register the shortcut to either activate the existing vault-home tab or open a new one.

**Acceptance (Phase E):**
1. Launch app → Vault Home tab is active, search input is focused.
2. Type `html` → result card for `html/html-quality` appears within 200 ms.
3. Click the card → new browser tab opens with the HTML page rendered.
4. Press Ctrl+Shift+H from any tab → vault-home tab is focused.
5. When no `.index/pages.json` exists → empty state shows with "Run indexer" button.

---

### PHASE F — Polish backlog

Not required for the main loop. Implement any subset at the user's request.

| Item | File | Effort |
|---|---|---|
| Backlinks panel reads real `.index/pages.json` | [ide/src/modules/backlinks/](ide/src/modules/backlinks/) | M |
| Mermaid preview in editor for `.html` files | [ide/src/modules/editor/EditorPane.tsx](ide/src/modules/editor/EditorPane.tsx) | M |
| Graph view of vault backlinks | [ide/src/modules/graph/](ide/src/modules/graph/) | L |
| Browser tab: persist bookmarks panel | `browser/BookmarksPanel.tsx` | S |
| Browser tab: history across restarts (LazyStore) | `browser/historyStore.ts` | S |
| Address bar autocomplete (bookmarks + vault titles) | `BrowserPane.tsx` | M |
| Voice → Sentor-Maker (Whisper hook → vault write) | [useWhisperRecording.ts](ide/src/modules/ai/hooks/useWhisperRecording.ts) | S |

---

## 5. Execution order

```
Phase 0  →  Phase A + B (same time)  →  Phase C  →  Phase D  →  Phase E  →  Phase F (optional)
```

Phase A and B are done in parallel because:
- A6 (TypeScript tool wrappers) and B1 (agent definitions) are both frontend-only and don't block each other.
- The agents reference `web_search`/`web_fetch` tool names, which must exist before the agent prompts are testable.

---

## 6. Code conventions (non-negotiable)

- **Design tokens only.** No hex values outside the token set. Tokens: `bg-base #0a0a0a`, `bg-surface #111`, `bg-elevated #1a1a1a`, `border-subtle #2a2a2a`, `border-active #404040`, `text-primary #f5f5f5`, `text-secondary #888`, `accent #5b8def`.
- **No box-shadow.** Border-only depth everywhere.
- **150 ms ease-out** transitions only. No animation libraries.
- **No Google Fonts.** `system-ui` only.
- **No comments on obvious code.** Only when WHY is non-obvious.
- **Read before edit** invariant stays in `edit`/`multi_edit` tools.
- **Approval policy:** `web_search`, `web_fetch` — auto-execute (read-only). `vault_write` — requires user approval (it writes a file). The approval card shows the HTML preview before confirming.

---

## 7. Complete file list

### New files
- `ide/src-tauri/src/modules/web.rs`
- `ide/src/modules/ai/lib/useComposer.ts` (split from composer.tsx — Phase 0)
- `ide/src/modules/theme/useTheme.ts` (split from ThemeProvider.tsx — Phase 0)
- `ide/src/modules/ai/tools/web.ts`
- `ide/src/modules/browser/BrowserPane.tsx`
- `ide/src/modules/browser/AddressBar.tsx`
- `ide/src/modules/browser/assetUrl.ts`
- `ide/src/modules/browser/bookmarks.ts`
- `ide/src/modules/vault-home/VaultHomePane.tsx`
- `ide/public/vendor/mermaid.min.js` (downloaded, not generated)

### Modified files
- `ide/src-tauri/Cargo.toml` — add `reqwest`, `scraper`, `urlencoding`
- `ide/src-tauri/src/lib.rs` — register `web_search`, `web_fetch`
- `ide/src-tauri/src/modules/mod.rs` — add `pub mod web;`
- `ide/src-tauri/tauri.conf.json` — enable `assetProtocol`
- `ide/src/modules/ai/lib/composer.tsx` — remove `useComposer` export (Phase 0)
- `ide/src/modules/theme/ThemeProvider.tsx` — remove `useTheme` export (Phase 0)
- `ide/src/modules/settings/store.ts` — add `searxngUrl` preference
- `ide/src/modules/ai/lib/agents.ts` — replace BUILTIN_AGENTS with Vault, Sentor-Maker, Coder
- `ide/src/modules/ai/agents/registry.ts` — trim to `explore` + `general`
- `ide/src/modules/ai/agents/runSubagent.ts` — remove dead branches
- `ide/src/modules/ai/tools/tools.ts` — wire `buildWebTools`
- `ide/src/modules/ai/tools/vault.ts` — extract `searchVault`, trigger re-index, emit vault-page-written event
- `ide/src/modules/tabs/lib/useTabs.ts` — add BrowserTab, VaultHomeTab types + helpers, change initial tab
- `ide/src/modules/explorer/FileExplorer.tsx` — add `onOpenBrowserTab` prop
- `ide/src/modules/explorer/FileTreeNode.tsx` — add "Open in Browser" context menu item
- `ide/src/app/App.tsx` — route BrowserPane + VaultHomePane, listen for vault-page-written event

### Not touched
- `PreviewPane.tsx` (keep for dev-server preview flow — different use case)
- `cli/main.py` (already has vault memory loop — Phase 0–E don't affect it)
- `api/server.py`, `tools/indexer.py`, `tools/embedder.py` (Python side unchanged)
- `ui/index.html`, `ui/app.js` (browser UI still works standalone)

---

## 8. Risk register

| Risk | Probability | Mitigation |
|---|---|---|
| SearXNG public instance (`searx.be`) is slow or down | Medium | Setting in UI to switch instance. Encourage self-hosting (`docker run searxng/searxng`). |
| WebView2 `asset://` iframe relative-link resolution breaks vault pages | Medium | Test explicitly with a vault page that has `../` backlinks in Phase D. If broken, serve vault via a local HTTP server on a random port instead. |
| `reqwest` + `rustls-tls` compile time adds 60+ seconds on first build | High | Expected. Warn the user. Subsequent incremental builds are fast. |
| Model ignores "vault_search first" rule | Medium | Rule is in the first line of the system prompt. Acceptable failure mode: model answers from model knowledge, then user can ask Sentor-Maker to save it. |
| Sentor-Maker generates HTML with CDN mermaid link instead of `/vendor/mermaid.min.js` | Medium | Make the rule bold in the system prompt. Add a post-write validator that checks the written HTML and warns if a CDN mermaid link is found. |
| `app_data_dir()` returns different paths on each platform | Low | `@tauri-apps/api/path` is platform-aware. Works on all platforms Tauri supports. |

---

## 9. Done definition

The build is complete when all six are true:

1. Launch app → **Vault Home** tab opens with a centered search input and "Vault" in the tab strip.
2. Agent picker shows exactly **Vault, Sentor-Maker, Coder** with Vault as default.
3. With Sentor-Maker selected, asking "explain how DNS resolution works" triggers: `vault_search` → `web_search` → `web_fetch` → user approval card (HTML preview) → `vault_write` → a new browser tab auto-opens with the rendered page.
4. Immediately ask Vault agent about DNS → `vault_search` returns the new page (re-index ran automatically).
5. Open a **Browser tab**, type `github.com` → GitHub loads or the block overlay appears with "Open in system browser". Type `mermaid diagrams` → search results appear as cards.
6. `cargo build` and `npx tsc --noEmit` both finish with zero warnings/errors.

---

End of plan. Execute phases in order. Verify each acceptance criterion before moving to the next.
