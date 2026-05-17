# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

**Re-index the vault** (run after adding/editing pages):
```bash
python tools/indexer.py
```

**Generate semantic embeddings** (run after indexing, requires `all-MiniLM-L6-v2` model installed):
```bash
python tools/embedder.py
```

**Start API server** (default port 4242):
```bash
python api/server.py [port]
```

**Run CLI:**
```bash
python cli/atlas.py <cmd>   # index | search "query" | list [category] | open cat/slug | serve [port] | chat
```

**Run API test suite** (custom runner, starts server on port 4299, NOT pytest):
```bash
python tools/test_api.py
```

**Start IDE** (API server optional — IDE works offline for keyword search):
```bash
# Windows launcher — starts API then IDE
atlas-ide.bat

# Or manually from ide/ directory
npm run tauri dev
```

**Offline semantic search in IDE** — pull the embedding model for Ollama:
```bash
ollama pull all-minilm
```

**Build IDE (release):**
```bash
cd ide && npm run tauri build
```

**Verify Rust compiles (zero warnings expected):**
```bash
cd ide/src-tauri && cargo build
```

**Verify TypeScript (zero errors expected):**
```bash
cd ide && npx tsc --noEmit
```

**Open browser search UI** — open `ui/index.html` directly. No server needed; `pages.js` loads as `window.ATLAS_INDEX` via `<script src>`, bypassing CORS.

**Install global design system** (once per machine):
```bash
cd interface-setup && bash install.sh
```

**Windows all-in-one launcher:** `atlas.bat` — interactive menu for serve / IDE / index / chat.

No build step, no `npm install`, no virtual environment for the Python side.

---

## Architecture

Atlas OS is a zero-dependency personal knowledge base + AI IDE:

```
vault/{category}/{slug}/index.html   ← source of truth; category = folder name
    │
tools/indexer.py                     ← HTML parser, two-pass: extract → resolve backlinks
tools/embedder.py                    ← generates .index/embeddings.json (384-dim vectors)
    │
.index/pages.json                    ← machine-readable (CLI, API)
.index/pages.js                      ← browser-loadable (window.ATLAS_INDEX)
.index/embeddings.json               ← semantic vectors for cosine similarity search
    │
ui/index.html + app.js + style.css   ← client-side fuzzy search (Fuse.js CDN)
cli/atlas.py                         ← CLI (term-frequency scoring, chat loop)
api/server.py                        ← REST API (stdlib http.server, port 4242)
ide/                                 ← Tauri v2 + React AI IDE
```

**indexer.py** — two-pass: first extracts title, description, h1–h3, body text (capped 3000 chars), local links; second resolves backlinks. Writes both `pages.json` and `pages.js`.

**app.js** — 3-state view machine: `empty` → `no-results` → `results`. Category nav built once at boot. Fuse.js weights: title(3) > headings/desc(2) > body(1), threshold 0.35, `ignoreLocation: true`. All user content via `textContent`; only category badge uses `innerHTML` after `escapeHtml()`.

**Scoring (CLI + API):** title(3) > headings/desc(2) > body(1). This function is **intentionally duplicated** in `cli/atlas.py` and `api/server.py` so each file is independently runnable. Keep them in sync manually.

**API endpoints** (port 4242):
- `GET /api/search?q=&limit=&category=` — keyword search (TF-IDF-style)
- `GET /api/semantic?q=&limit=` — semantic search (cosine similarity on embeddings)
- `GET /api/page/{category}/{slug}` — full page text
- `GET /api/categories` — category list
- `GET /api/pages` — full index

---

## IDE Architecture (`ide/`)

Tauri v2 backend (Rust) + React frontend. The Rust backend exposes Tauri commands grouped by module:

```
ide/src-tauri/src/
  lib.rs              ← command registry (invoke_handler)
  modules/
    fs/               ← file ops: file.rs, tree.rs, mutate.rs, search.rs, grep.rs
    net.rs            ← http_ping (5s timeout GET, returns status code)
    pty/              ← portable-pty terminal emulator
    shell/            ← shell_run_command, session management, bg process management
    secrets.rs        ← OS keyring (keyring crate, platform-native)
    web.rs            ← web_search (SearXNG JSON API) + web_fetch (reqwest + scraper)
    webview.rs        ← native child WebView: web_open/navigate/set_bounds/set_visible/close/go
```

**`lib.rs` vault stubs:** `vault_get_note_titles`, `vault_get_backlinks`, `vault_get_similar_notes` are currently stub implementations; real vault intelligence lives in the frontend AI tools.

**fs path normalization:** `modules/fs/to_canon()` always returns forward-slash paths to the frontend, on all platforms.

### Frontend module structure

```
ide/src/modules/
  ai/
    config.ts           ← 2 local providers (LM Studio, Ollama), 2 models; compact SYSTEM_PROMPT (~120 tokens)
    lib/
      agent.ts          ← agent runner loop; buildLanguageModel (+ toDevProxyURL CORS fix) + createAtlasAgent
      agents.ts         ← 3 built-in agents: Vault (default), Atlas-Maker, Coder
      transport.ts      ← AI HTTP transport (DirectChatTransport + live context injection)
      composer.tsx      ← React context for shared input state (text, files, voice, snippets)
      useComposer.ts    ← useComposer hook (split out for Fast Refresh compliance)
      native.ts         ← low-level file I/O wrappers
      security.ts       ← prompt/output sanitization, sensitive-path deny-list
      sessions.ts       ← conversation session management
      slashCommands.ts  ← /command parsing
      snippets.ts       ← reusable prompt snippets
      todos.ts          ← AI-driven todo extraction
      placeholders.ts   ← placeholder text generation
      keyring.ts        ← OS keychain access via Tauri
    agents/
      registry.ts       ← subagent types: explore, general (only two)
      runSubagent.ts    ← sub-agent invocation; pool includes fs + search + todo + vault + web tools
    store/
      chatStore.ts      ← conversation state (Zustand)
      agentsStore.ts    ← agent list & selection
      planStore.ts      ← structured plan state
      snippetsStore.ts  ← snippet CRUD
      todoStore.ts      ← todo list state
    tools/
      tools.ts          ← buildTools (aggregates all tool modules)
      fs.ts, edit.ts, search.ts, shell.ts, terminal.ts, todo.ts, subagent.ts, vault.ts, web.ts, context.ts
    hooks/
      useWhisperRecording.ts  ← voice input via Whisper
  browser/              ← Vault + Web browser panes, AddressBar, BrowserStack, bookmarks, assetUrl
  vault-home/           ← VaultHomePane — startup search tab over vault pages
  editor/               ← CodeMirror 6 editor with syntax highlighting, vim mode, inline AI autocomplete, wiki-link autocomplete
  explorer/             ← file tree with context menu, file/folder icons
  terminal/             ← xterm.js + PTY bridge, OSC handler support, multi-pane
  tabs/                 ← tab management (TerminalTab, EditorTab, PreviewTab, VaultTab, WebTab, VaultHomeTab, AiDiffTab)
  settings/             ← settings window bridge, preferences store, keyring access
  shortcuts/            ← global keybinding registry
  header/               ← top bar
  preview/              ← file preview panel
  statusbar/            ← status bar with path utils
  theme/                ← theme tokens and switching
  updater/              ← Tauri updater integration
  backlinks/            ← backlink/graph navigation
  graph/                ← graph visualization
```

**Agents (current):** Three built-in agents — **Vault** (default, research + memory), **Atlas-Maker** (writes vault HTML pages), **Coder** (edits source files). Subagent types: `explore` + `general` only. Do not add new agents without checking `ATLAS_PLAN.md`.

**Fast Refresh:** Fixed — `useComposer` lives in `useComposer.ts`, `useTheme` lives in `useTheme.ts`. Do not re-merge hooks back into component files.

**Local file iframes use `asset://` not `file://`:** Tauri's WebView blocks `file://` in iframes. Use `convertFileSrc()` from `@tauri-apps/api/core` to get `asset://localhost/...` URLs. Helper: `ide/src/modules/browser/assetUrl.ts` (created in Phase D). There is no custom `vault:` URL scheme — use `vaultPageAssetUrl(root, cat, slug)` from that helper instead.

**Local-only providers:** LM Studio (`http://localhost:1234/v1`) and Ollama (`http://localhost:11434/v1`). Both use `@ai-sdk/openai-compatible`. Base URLs and **chat model ID** (e.g. `google/gemma-4-e4b`) are configurable in Settings → Models. No API keys required.

**CORS in dev mode:** `vite.config.ts` proxies `/lmstudio-proxy` → `:1234` and `/ollama-proxy` → `:11434` at the Node level, bypassing browser CORS. `agent.ts:toDevProxyURL()` rewrites localhost provider URLs to these proxy paths when `import.meta.env.DEV` is true. In production Tauri builds, providers must have CORS enabled in their own settings.

**Model ID override:** `lmstudioChatModelId` / `ollamaChatModelId` preferences hold the exact model string sent to the provider (e.g. `google/gemma-4-e4b`). Empty = provider default. Set via Settings → Models → "Chat model identifier". Threaded through: `chatStore` → `transport` → `createAtlasAgent` → `buildLanguageModel(modelIdOverride)`.

**Tool approval policy:** Read-only tools (read_file, list_directory, grep, glob) auto-execute after security check. Mutating tools (write_file, edit, multi_edit, create_directory, bash_*) require user approval. `edit`/`multi_edit` additionally enforce read-before-edit via `readCache`.

---

## Design System

Read `interface-setup/.interface-design/system.md` before touching any UI. Key rules:

**Color tokens** (dark OS theme):
- `bg-base` #0a0a0a → `bg-surface` #111111 → `bg-elevated` #1a1a1a → `bg-overlay` #222222
- `border-subtle` #2a2a2a, `border-active` #404040
- `text-primary` #f5f5f5, `text-secondary` #888888, `text-tertiary` #555555
- `accent` #5b8def, `accent-hover` #4a7de0

**Depth:** Border-only — no `box-shadow` anywhere. Single exception: focus ring (`ring-2 ring-accent/40`).

**Typography:** `system-ui` font stack only. No Google Fonts.

**Transitions:** 150ms ease-out only.

**Forbidden:** gradient backgrounds, box-shadows, colorful large blocks, rounded corners beyond `rounded-lg`, external animation libraries.

---

## Testing

- `tools/test_api.py` uses a **custom runner** (`test()` → global `_passed`/`_failed`), not pytest/unittest. Starts server in a background thread on port 4299.
- `tools/test_ollama.py` and `tools/test_multiturn.py` require a running Ollama instance and Atlas API — not CI-safe.
- No CI workflow exists.

---

## Philosophy

- Fewer lines > more lines; readable > clever; working > perfect
- Zero dependencies: Python stdlib for indexing/CLI/API; CDN for Tailwind and Fuse.js; no npm, no pip on the Python side
- Before creating any new UI component, state the spacing/color/depth decisions and get approval
- Warn on design inconsistencies against `system.md`
- Never suggest unnecessary dependencies

---

## Roadmap

The full build plan is in **`ATLAS_PLAN.md`**.

### Completed phases

| Phase | Description |
|---|---|
| 0 | Fast Refresh fixes — `useComposer.ts`, `useTheme.ts` split |
| A | `web_search` + `web_fetch` via SearXNG + reqwest (`modules/web.rs`, `tools/web.ts`) |
| B | Agent consolidation — Vault / Atlas-Maker / Coder; subagents trimmed to `explore` + `general`; Mermaid bundled offline |
| C | Auto re-index after `vault_write` via `findPython()` helper |
| D | **Browser tabs** — Vault tab (asset:// iframe) + Web tab (native child WebView using Tauri `unstable` feature); address bar, back/forward, bookmarks, SearXNG search |
| E | Vault Home tab — startup search front door over the user's own knowledge base |

### Browser tab architecture (Phase D)

Two discriminated tab kinds replace the old single `browser` tab:

- **`vault` tab** — renders `asset://` vault pages in an `<iframe>`. Same-origin, fast. `VaultBrowserPane.tsx`.
- **`web` tab** — creates a native Tauri child WebView (`webview.rs: web_open`) positioned over the pane rect. Handles any `https://` URL without X-Frame-Options limits. `WebBrowserPane.tsx`.

Cross-scheme routing: typing `https://` in a Vault tab address bar opens a Web tab (and vice versa). `pickTabKindForUrl()` in `modules/tabs/index.ts`.

Native WebView notes:
- Requires `features = ["unstable"]` in `ide/src-tauri/Cargo.toml` (Tauri 2 multi-webview API).
- Sits above the DOM compositor — CSS `visibility` alone cannot hide it. Call `web_set_visible(false)` when the tab is inactive.
- Bounds pushed via `ResizeObserver` + `requestAnimationFrame` debounce → `web_set_bounds`.
- `web://nav-changed` event emitted by Rust when page navigates itself (link clicks, redirects) — syncs address bar.

### Next (Phase F)

Polish — backlinks panel, mermaid editor preview, graph view, voice-to-vault.
