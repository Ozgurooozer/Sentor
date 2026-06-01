# Architecture Reference (CLAUDE.md)

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
python cli/main.py <cmd>   # index | search "query" | list [category] | open cat/slug | serve [port] | chat
```

**Run API test suite** (custom runner, starts server on port 4299, NOT pytest):
```bash
python tools/test_api.py
```

**Run the MCP server** (stdio JSON-RPC; for Claude Code / Cursor / Continue):
```bash
python tools/mcp_server.py        # speaks MCP on stdin/stdout
```
Register in an MCP client (e.g. `.mcp.json`) so external assistants can query
the vault without opening the IDE.

**Start IDE** (API server optional — IDE works offline for keyword search):
```bash
# Windows launcher — starts API then IDE
sentor.bat

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

**Open browser search UI** — open `ui/index.html` directly. No server needed; `pages.js` loads as `window.SENTOR_INDEX` via `<script src>`, bypassing CORS.

**Install global design system** (once per machine):
```bash
cd interface-setup && bash install.sh
```

**Windows all-in-one launcher:** `sentor.bat` — interactive menu for serve / IDE / index / chat.

No build step, no `npm install`, no virtual environment for the Python side.

---

## Architecture

Sentor is a zero-dependency personal knowledge base + AI IDE:

```
vault/{category}/{slug}/index.html   ← source of truth; category = folder name
    │
tools/indexer.py                     ← HTML parser, two-pass: extract → resolve backlinks
tools/embedder.py                    ← generates .index/embeddings.json (384-dim vectors)
    │
.index/pages.json                    ← machine-readable (CLI, API)
.index/pages.js                      ← browser-loadable (window.SENTOR_INDEX)
.index/embeddings.json               ← semantic vectors for cosine similarity search
    │
ui/index.html + app.js + style.css   ← client-side fuzzy search (Fuse.js CDN)
cli/main.py                         ← CLI (term-frequency scoring, chat loop)
api/server.py                        ← REST API (stdlib http.server, port 4242)
ide/                                 ← Tauri v2 + React AI IDE
```

**indexer.py** — two-pass: first extracts title, description, h1–h3, body text (capped 3000 chars), local links; second resolves backlinks. Writes both `pages.json` and `pages.js`.

**app.js** — 3-state view machine: `empty` → `no-results` → `results`. Category nav built once at boot. Fuse.js weights: title(3) > headings/desc(2) > body(1), threshold 0.35, `ignoreLocation: true`. All user content via `textContent`; only category badge uses `innerHTML` after `escapeHtml()`.

**Scoring (CLI + API):** title(3) > headings/desc(2) > body(1). Shared module at `tools/scoring.py` — both `cli/main.py` and `api/server.py` `sys.path.insert("tools/")` then `from scoring import score as _score, passes_default_filter as _passes_default_filter, DEFAULT_EXCLUDE_TYPES`. Edit the shared module, not the call sites.

**API endpoints** (port 4242):
- `GET /api/search?q=&limit=&category=` — keyword search (TF-IDF-style)
- `GET /api/semantic?q=&limit=` — semantic search (cosine similarity on embeddings)
- `GET /api/page/{category}/{slug}` — full page text
- `GET /api/categories` — category list
- `GET /api/pages` — full index

---

## IDE Architecture (`ide/`)

Tauri v2 backend (Rust) + React frontend. The Rust backend exposes Tauri commands grouped by module.

See [docs/architecture/IDE_STRUCTURE.md](IDE_STRUCTURE.md) for complete module breakdown.

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

**Forbidden:** gradient backgrounds, box-shadows, colorful large blocks, rounded corners beyond `rounded-lg`, external animation runtimes.

---

## Testing

- `tools/test_api.py` uses a **custom runner** (`test()` → global `_passed`/`_failed`), not pytest/unittest. Starts server in a background thread on port 4299.
- `tools/test_ollama.py` and `tools/test_multiturn.py` require a running Ollama instance and Sentor API — not CI-safe.
- CI (`.github/workflows/ci.yml`): Rust + clippy + fmt + `cargo test` on Windows; TypeScript + `tsc --noEmit` on Ubuntu; Python API test suite on Ubuntu.

---

## Known Issues

See [docs/planning/PROJECT_STATUS.md](../planning/PROJECT_STATUS.md#known-issues) for current blockers and tech debt.

---

## Philosophy

- Fewer lines > more lines; readable > clever; working > perfect
- Zero dependencies: Python stdlib for indexing/CLI/API; CDN for Tailwind and Fuse.js; no npm, no pip on the Python side
- Before creating any new UI component, state the spacing/color/depth decisions and get approval
- Warn on design inconsistencies against `system.md`
- Never suggest unnecessary dependencies
