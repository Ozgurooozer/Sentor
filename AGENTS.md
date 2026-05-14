# AGENTS.md — Atlas OS

## Commands

```bash
# Re-index vault after adding/editing pages
python tools/indexer.py

# CLI (works if atlas.py on PATH, else: python cli/atlas.py <cmd>)
atlas index                        # same as tools/indexer.py
atlas search "query"               # term-frequency scoring
atlas list [category]              # list pages
atlas open category/slug           # open in browser
atlas serve [port]                 # REST API (default 4242)
atlas chat [--model MODEL]         # Ollama agent loop

# API test suite (custom runner, NOT pytest/unittest)
python tools/test_api.py           # starts server on port 4299, runs 13 tests

# UI — no server needed, open directly:
#   ui/index.html
```

## Architecture

```
vault/{category}/{slug}/index.html   ← source of truth
    │
tools/indexer.py                     ← HTML parser + two-pass indexer
    │                                 (extract → resolve backlinks)
.index/pages.json                    ← machine-readable (CLI, API)
.index/pages.js                      ← browser-loadable (window.ATLAS_INDEX)
    │
ui/index.html + app.js + style.css   ← Fuse.js fuzzy search (CDN)
cli/atlas.py                         ← CLI (term-frequency scoring)
api/server.py                        ← REST API (stdlib http.server)
```

## Key facts

- **Zero deps:** Python stdlib for backend (indexer, CLI, API). Tailwind + Fuse.js loaded via CDN. No npm, pip, or virtualenv.
- **file:// works:** Browser loads `.index/pages.js` via `<script src>` → `window.ATLAS_INDEX`, bypassing CORS. No server needed.
- **Vault page format:** `vault/{category}/{slug}/index.html`. Category = folder name. Slug = page folder name (kebab-case). Indexer reads `<title>`, `<meta name="description">`, `<h1>`–`<h3>`, body text (capped 3000 chars).
- **Scoring (CLI + API):** title(3) > headings/desc(2) > body(1). **Scoring code is duplicated** between `cli/atlas.py` and `api/server.py` (intentional — both remain independently runnable). Keep in sync.
- **Fuse.js (browser):** weights title(3) > headings/desc(2) > body(1), threshold 0.35, `ignoreLocation: true`.
- **API:** Default port 4242. Test suite uses port 4299. Endpoints: `/api/search`, `/api/page/{cat}/{slug}`, `/api/categories`, `/api/pages`.
- **Ollama integration:** `tools/ollama-tools.json` defines `search_knowledge` + `get_page` tools. Requires `atlas serve` running. Falls back to auto-detect `qwen2.5-coder`.
- **Design system:** Read `interface-setup/.interface-design/system.md` before UI changes. Dark theme (#0a0a0a base → #111111 → #1a1a1a → #222222), border-only depth (no box-shadow except focus ring), system-ui font, 150ms ease-out transitions.

## Load order (ui/index.html)

`style.css → Tailwind CDN → tailwind.config → Fuse.js → .index/pages.js → app.js`

## Testing quirks

- `tools/test_api.py` uses a **custom test runner** (`test()` → global `_passed`/`_failed`), not pytest or unittest. Starts server in background thread on port 4299.
- `tools/test_ollama.py` and `tools/test_multiturn.py` require a running Ollama instance and/or Atlas API — not part of CI.
- No test runner config, no CI workflow.

## Phase roadmap

- **Phase 1** (done): Browser UI + indexer
- **Phase 2** (done): CLI + API
- **Phase 3** (active): Ollama tool-calling
- **Phase 4** (planned): `atlas new`, backlinks watcher, category landing pages, prev/next nav
