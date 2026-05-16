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

**Start IDE** (requires API server running on 4242):
```bash
# Windows launcher — starts API then IDE
atlas-ide.bat

# Or manually from ide/ directory
npm run tauri dev
```

**Build IDE (release):**
```bash
cd ide && npm run tauri build
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
    net.rs            ← http_ping, http_fetch (streaming proxy via Tauri event channel)
    pty/              ← portable-pty terminal emulator
    shell/            ← shell_run_command, session management, bg process management
    secrets.rs        ← OS keyring (keyring crate, platform-native)
```

**`net.rs` streaming:** `http_fetch` proxies HTTP through Rust to avoid WebView CORS restrictions. It returns headers/status immediately and streams the body back as `{data, done, error}` events on a caller-supplied Tauri event channel — required for LLM streaming responses.

**`lib.rs` vault stubs:** `vault_get_note_titles`, `vault_get_backlinks`, `vault_get_similar_notes` are currently stub implementations; real vault intelligence lives in the frontend AI tools.

**fs path normalization:** `modules/fs/to_canon()` always returns forward-slash paths to the frontend, on all platforms.

### Frontend module structure

```
ide/src/modules/
  ai/
    config.ts           ← 9 providers, 18 models (OpenAI, Anthropic, Google, xAI, Cerebras, Groq, DeepSeek, LM Studio, Ollama)
    lib/
      agent.ts          ← agent runner loop (full & lite mode)
      agents.ts         ← 10 built-in agents
      transport.ts      ← AI HTTP transport (uses http_fetch command for streaming)
      localFetch.ts     ← direct fetch for local models
      security.ts       ← prompt/output sanitization
      sessions.ts       ← conversation session management
      slashCommands.ts  ← /command parsing
      snippets.ts       ← reusable prompt snippets
      todos.ts          ← AI-driven todo extraction
    agents/
      registry.ts       ← agent registration & lookup
      runSubagent.ts    ← sub-agent invocation (agents calling agents)
    store/
      chatStore.ts      ← conversation state (Zustand)
      agentsStore.ts    ← agent list & selection
      planStore.ts      ← structured plan state
      snippetsStore.ts  ← snippet CRUD
      todoStore.ts      ← todo list state
    tools/
      vault.ts          ← vault_search (hybrid: keyword + /api/semantic fallback) / vault_read / vault_write
      tools.ts          ← buildTools (17 tools, full) / buildLiteTools (8 tools, local models)
      fs.ts, edit.ts, search.ts, shell.ts, terminal.ts, todo.ts, subagent.ts, context.ts
    hooks/
      useWhisperRecording.ts  ← voice input via Whisper
  editor/               ← CodeMirror 6 editor with syntax highlighting, vim mode, inline AI autocomplete, wiki-link autocomplete
  explorer/             ← file tree with context menu, file/folder icons
  terminal/             ← xterm.js + PTY bridge, OSC handler support, multi-pane
  tabs/                 ← tab management, workspace CWD tracking
  settings/             ← settings window bridge, preferences store, keyring access
  shortcuts/            ← global keybinding registry
  header/               ← top bar
  preview/              ← file preview panel
  statusbar/            ← status bar with path utils
  theme/                ← theme tokens and switching
  updater/              ← Tauri updater integration
```

**Local model optimization:** LM Studio/Ollama auto-detected → lite mode: system prompt 800→120 tokens, tools 17→8, max steps 24→8.

**Vault memory loop** (builtin:vault agent): vault_search → agent answers → vault_write (saves as HTML) → tools/indexer.py → next query searches history. Solves context window limits for local models.

**Hybrid vault_search:** First runs keyword search locally against the index; if no strong results, falls back to `GET /api/semantic` for cosine similarity. Accepts a `mode` param to force either path.

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

- **Phase 1** (done): Browser UI + indexer
- **Phase 2** (done): CLI + REST API + semantic embeddings
- **Phase 2.5** (active): Tauri AI IDE — agent system, vault tools, terminal emulator
- **Phase 3** (done): Ollama tool-calling — `cli/atlas.py` agentic chat loop, `tools/ollama-tools.json` defines `search_knowledge` + `get_page` tools, requires `atlas serve` running
- **Phase 4** (planned): `atlas new`, backlinks watcher, category landing pages, prev/next nav; auto-embed on index; IDE AtlasPanel + graph view

The `.last/` directory contains old UI examples to be migrated to `vault/` in Phase 4.
