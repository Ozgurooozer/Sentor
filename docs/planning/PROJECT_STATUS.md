# Project Status Report

**Date:** May 26, 2026
**Branch:** atlas-ide-v2
**Status:** Stable — Phase G (Canvas UI) complete. Tech debt addressed.

---

## Executive Summary

Atlas OS is a **zero-dependency offline AI IDE + personal knowledge base + canvas workflow engine**:

- **Vault:** HTML pages indexed locally, searchable by keyword + semantic embedding (Ollama all-minilm)
- **CLI/API:** Python stdlib only, REST API on port 4242, MCP server for external tools
- **IDE:** Tauri v2 (Rust backend + React frontend), Canvas infinite workspace, 3 built-in agents
- **Canvas:** Infinite pan/zoom node editor — 20 panel types, typed wire system, Orkestra AI orchestrator
- **Agents:** Vault (research), Coder (edit), Atlas-Maker (write HTML)

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│  AGENT LAYER (Vault + Coder + Atlas-Maker)              │
├─────────────────────────────────────────────────────────┤
│  CANVAS LAYER (20 panel types, typed wires, Orkestra)   │
├─────────────────────────────────────────────────────────┤
│  VAULT INDEX (.index/pages.json + embeddings.json)      │
├─────────────────────────────────────────────────────────┤
│  API + CLI + MCP (stdlib Python, REST HTTP, stdio RPC)  │
├─────────────────────────────────────────────────────────┤
│  STORAGE (vault/*.html, .index/, .ide-state.json)       │
└─────────────────────────────────────────────────────────┘
```

---

## Phase History

| Phase | Description | Status |
|---|---|---|
| 0 | Fast Refresh fixes (`useComposer.ts`, `useTheme.ts` split) | ✅ |
| A | `web_search` + `web_fetch` via SearXNG + reqwest | ✅ |
| B | Agent consolidation (Vault/Coder/Atlas-Maker); Mermaid offline | ✅ |
| C | Auto re-index after `vault_write` via `findPython()` | ✅ |
| D | Browser tabs — Vault (asset://) + Web (native WebView) | ✅ |
| E | Vault Home tab — startup search front door | ✅ |
| F | Release-quality cleanup (v0.6) | ✅ |
| G | Canvas UI full transition — default `layoutMode = "canvas"` | ✅ |

### Phase G — Canvas UI (v0.7)

Default layout mode is now `"canvas"`. Classic and focused modes remain available via `preferences.ts`.

**New canvas panels (20 total):**
terminal · editor · chat · agent · canvas · pipeline · codegraph · input · note · sketch · tool · pipe · checklist · header · gallery · filebrowser · web · vault-home · preview · instance

**Wire system:**
- `"data"` (blue) — explicit value, shown in badge row
- `"context"` (purple) — silent, auto-prepended to every prompt
- `"trigger"` (green) — execution pulse (no value)
- Per-wire `charLimit` (default 4 000 chars) — prevents token budget overflow
- `meta.outputData` = live value; `meta.snapshotData` = frozen snapshot

**New canvas infrastructure:**
- `portDefs.ts` — typed named ports per panel type
- `orkestraStore.ts` — Orkestra AI; direct streaming fetch to Ollama/LM Studio; parses embedded JSON tool calls from LLM response to manipulate canvas
- `terminalLink.ts` — chat session ↔ terminal panel PTY linking
- `nodeAccent.ts` — per-type border/glow colors
- `useWireData.ts` — `useAllIncomingWireData(panelId)` hook
- `CanvasDock.tsx` — bottom strip for minimized panels
- `PinnedPanelsPortal.tsx` — fixed-viewport panels rendered outside canvas z-stack
- `SubCanvasContent.tsx` — nested canvas panels

### Phase F — Cleanup (v0.6)

- API path traversal fix (`Path.is_relative_to()`)
- `AgentDeps` → `providers: ProviderConfigs` (one map, not seven fields)
- MCP polling → `notify` file watcher events (30s fallback)
- `vault_write` backup to `.vault-trash/` with 7-day auto-cleanup
- `safeInvoke.ts` for fire-and-forget Tauri calls
- `motion/react` removed; replaced with Tailwind + `tw-animate-css`

---

## Completed Features

### Canvas (Phase G + N1-N3)
- [x] 20 panel types with typed named ports
- [x] Wire system: data/context/trigger with per-wire char limit
- [x] Orkestra AI orchestrator (streaming, JSON tool call parsing)
- [x] Multi-canvas navigation (`canvasHistory`, `CanvasBreadcrumb`)
- [x] Blueprint import/export (`vault/blueprints/`)
- [x] Sub-canvas nesting (`canvas` panels with `viewport` + `children`)
- [x] Pinned panels (fixed viewport, `PinnedPanelsPortal`)
- [x] Minimized panels → dock strip (`CanvasDock`)
- [x] Per-type accent colors + faint glow (`nodeAccent.ts`)
- [x] Background styles (dot/grid/solid/radial/noise)
- [x] Alignment guides on drag
- [x] Tweaks panel (bg, wire anim, guides, density, radius)
- [x] Minimap (160×100px SVG, click-to-navigate)
- [x] Zoom bar with fit-all
- [x] Node palette (`AddPanel`, Cmd+K, fuzzy search)

### Vault (Faz 0–7)
- [x] Flexible depth indexing (agents/state.md, meetings/date/index.html, etc.)
- [x] Type + scope derivation
- [x] Agent office skeleton (3 agents seeded)
- [x] Tauri write-guard (`vault_agent_log`, `vault_agent_state_update`)
- [x] File watcher + auto-reindex (debounce 5s)
- [x] Self-RAG (`vault_self_context` auto-prepended)
- [x] Meeting flow (`/meeting` slash cmd, auto-link)
- [x] Vault undo backup (`.vault-trash/`, 7-day TTL)

### IDE Core
- [x] Tauri v2 desktop app (Windows 10/11)
- [x] React + Vite + Tailwind CSS v4
- [x] CodeMirror 6 editor + syntax highlighting + Vim mode
- [x] xterm.js PTY terminal (multi-pane)
- [x] Native WebView for web browsing (Tauri `unstable`)
- [x] Vault rendering via asset:// iframe
- [x] Settings panel + provider configuration
- [x] OS keychain secrets (keyring crate)
- [x] Sentor (Flowise) integration

### Search & Indexing
- [x] Python stdlib indexer (zero deps)
- [x] HTML + Markdown parser, two-pass (extract → backlinks)
- [x] Incremental embedder with SHA1 cache (no double-call since v0.7.1)
- [x] Semantic search via Ollama all-minilm (384-dim cosine similarity)
- [x] Keyword search (TF-IDF scoring via `tools/scoring.py`)

### CLI & API
- [x] `atlas.py` chat loop — now uses `ollama.Client(timeout=120)` (no more hangs)
- [x] `pipeline.py` — shell/task/notify steps with on_error policy
- [x] `serve_daemon.py` — cron + file-watcher triggers; concurrent run guard added
- [x] REST API port 4242 — search, semantic, pages, categories, IDE control endpoints

---

## Known Issues (Open)

### 🟡 Medium Priority

1. **Sub-canvas drill-in** — double-clicking a `canvas`-type panel should enter it (ToolPanel stub is in place, but navigation not wired).

### 🟢 Low Priority (Polish)

4. **Vault undo snackbar** — backend backup is done (`.vault-trash/`), no in-app "Undo (5s)" notification yet.
5. **Linux / macOS click-through** — `set_click_through` is Windows-only (`SetWindowRgn`).
6. **Canvas bezier FPS** — ~45-50 FPS on heavy graphs; bezier re-calc on every edge change.

---

## Recently Fixed (v0.7.1 — May 26, 2026)

| # | Fix | File |
|---|-----|------|
| 🔴 | `sentor._load_task` + `pipeline._load_pipeline` raise `FileNotFoundError` instead of `sys.exit(1)` — pipeline `on_error` policy now works | `cli/sentor.py`, `cli/pipeline.py` |
| 🟡 | `serve_daemon._fire()` skips if pipeline already running (`_running` set + lock) | `cli/serve_daemon.py` |
| 🟡 | `atlas chat` uses `ollama.Client(timeout=120)` — no more frozen sessions | `cli/atlas.py` |
| 🟢 | `embedder.py` caches `_page_text()` per page — no double call | `tools/embedder.py` |
| 🟢 | `pipeline.py` deduplicates `sys.path.insert` at module level | `cli/pipeline.py` |

---

## Security Notes

- ✅ API auth: Bearer token at `~/.atlas/api-token`
- ✅ Path traversal: `Path.is_relative_to()` blocks `..` escapes
- ✅ Write-guard: secret pattern deny-list in `vault_write`
- ✅ Blueprint validation: JSON schema + tool whitelist on import
- ✅ Sensitive-path deny-list in `security.ts`

---

## Performance Baseline

| Operation | Target | Status |
|---|---|---|
| Indexer (100 pages) | < 2s | ✅ ~1.5s |
| Embedder incremental | < 5s | ✅ ~3s (SHA1 cache) |
| Keyword search | < 100ms | ✅ ~40ms |
| Semantic search (10 results) | < 500ms | ⚠️ ~700ms (Ollama round-trip) |
| Canvas pan/zoom | 60 FPS | ⚠️ ~45-50 FPS (bezier heavy) |

---

## Repository Structure

```
c:\Atlas OS\
├── vault/                ← User knowledge base (HTML pages)
├── tools/                ← Python indexer, embedder, scoring, MCP server
├── cli/                  ← Python CLI (atlas.py, pipeline.py, sentor.py, serve_daemon.py)
├── api/                  ← REST API server (port 4242)
├── ide/                  ← Tauri v2 IDE (React + Vite + Rust backend)
│   └── src/modules/canvas/  ← Canvas node system (20 panel types, wire system)
├── mcp/                  ← MCP server with HTTP transport (see Known Issues #1)
├── ui/                   ← Browser-based vault search (standalone HTML, no server)
├── interface-setup/      ← Design system installer
├── docs/
│   ├── architecture/     ← VAULT_ARCHITECTURE.md, AGENTS.md, CLAUDE.md
│   ├── guides/           ← MCP_GUIDE.md, keyboard-shortcuts.md, security.md
│   └── planning/         ← PROJECT_STATUS.md (this file), VAULT_ROADMAP.md, CANVAS_NODES.md
└── .gitignore            ← /modules/ (Flowise/codegraph vendor), /threadmind/, /prototypes/
```

---

## Next Steps

1. **Sub-canvas drill-in** — wire double-click navigation for `canvas`-type panels
3. **Vault undo snackbar** — surface `previousVersion` from `vault_write` tool result
4. **Orkestra full routing** — parallel agent invocation + result merge
5. **Linux / macOS parity** — click-through, native file dialogs
