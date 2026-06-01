# AGENTS.md — Sentor

## Commands

```bash
# Vault index (run after adding/editing pages)
python tools/indexer.py

# Semantic embeddings (requires Ollama + all-minilm)
python tools/embedder.py          # incremental; --force to rebuild

# CLI
python cli/main.py <cmd>   # index | search "q" | list [cat] | open cat/slug | serve [port] | chat

# REST API (default 4242)
python api/server.py [port]

# API test suite (custom runner, port 4299, NOT pytest/unittest)
python tests/test_api.py

# MCP server (stdio JSON-RPC — Claude Code, Cursor, Continue, etc.)
python tools/mcp_server.py        # vault + canvas tools; register in .mcp.json

# Browser UI — open ui/index.html directly (no server, no CORS)

# IDE (Tauri v2 desktop app)
sentor.bat                     # production launcher (Windows)
cd ide && npm run tauri dev       # dev mode
cd ide && npm run tauri build     # release build

# Verify
cd ide/src-tauri && cargo build   # Rust (zero warnings expected)
cd ide && npx tsc --noEmit        # TypeScript (zero errors expected)

# Design system install (one-time per machine)
cd interface-setup && bash install.sh
```

## Architecture

```
vault/{category}/{slug}/index.html   ← source of truth
    │
tools/indexer.py                     ← HTML parser, two-pass (extract → backlinks)
tools/embedder.py                    ← 384-dim vectors via Ollama all-minilm
    │
.index/pages.json                    ← keyword search (CLI, API)
.index/pages.js                      ← browser-loadable (window.SENTOR_INDEX)
.index/embeddings.json               ← semantic search (cosine similarity)
    │
api/server.py                        ← REST API (stdlib http.server, Bearer auth)
cli/main.py                         ← terminal CLI + chat loop
ui/index.html + app.js + style.css   ← Fuse.js fuzzy search (CDN, standalone)
tools/mcp_server.py                  ← MCP stdio server (vault + canvas + screenshot)
ide/                                 ← Tauri v2 + React desktop app
```

## Key facts

- **Zero deps (Python):** stdlib only for indexer, CLI, API, MCP. No npm/pip/venv.
- **Zero deps (browser):** Tailwind + Fuse.js via CDN in `ui/index.html`. Open directly with `file://`.
- **Scoring:** Shared in `tools/scoring.py`. Imported by `cli/main.py`, `api/server.py`, `tools/mcp_server.py` via `sys.path.insert(0, "tools/")`. Edit that one file.
- **API auth:** Bearer token at `~/.sentor/api-token` (generated on first launch). Endpoints: `/api/search`, `/api/semantic`, `/api/page/{cat}/{slug}`, `/api/categories`, `/api/pages`, `/api/agent/{slug}`.
- **MCP server:** `tools/mcp_server.py` — canonical stdio MCP server (vault + canvas + screenshot). Zero Python deps.
- **IDE:** Tauri v2, React + Vite + Tailwind CSS v4, CodeMirror 6, xterm.js. Three AI agents: Vault (research), Sentor-Maker (writes vault pages), Coder (edits source files). Local AI via LM Studio + Ollama (`@ai-sdk/openai-compatible`).
- **Design system:** Read `interface-setup/.interface-design/system.md` before UI changes. Dark theme (#0a0a0a→#111111→#1a1a1a→#222222), border-only depth (no box-shadow except `ring-2 ring-accent/40`), `system-ui` font, 150ms ease-out transitions.
- **CLAUDE.md** contains a detailed architecture reference (377 lines). This file is the concise OpenCode companion.

## Testing quirks

- `tests/test_api.py` uses a custom runner (`test()` → global `_passed`/`_failed`), not pytest/unittest. Starts server in background thread on port 4299.
- `tests/test_ollama.py` and `tests/test_multiturn.py` require a running Ollama — not CI-safe.
- CI (`.github/workflows/ci.yml`): Rust + clippy + fmt + `cargo test` on Windows; TypeScript + `tsc --noEmit` on Ubuntu; Python API test suite on Ubuntu.

## Known issues

- **Sub-canvas drill-in** — double-click on `canvas`-type panel should enter it; not wired yet.
- **Sub-canvas drill-in** — double-click on `canvas`-type panel should enter it; not wired yet.

*(Fixed in v0.11: MCP consolidated to `tools/mcp_server.py`; queue uses atomic write; event names standardised.)*
*(Fixed in v0.7.1: `sentor`/`pipeline` `sys.exit(1)` → exception; `serve_daemon` cron race guard; `sentor chat` 120s timeout; `embedder` double `_page_text()` call.)*
