# P_README — Experimental Layer Reference

> **Purpose — why this repository exists**  
> This project was built as a **job application prototype **.  
> The vault (HTML pages, indexer, embeddings, forum, MCP read path) is the **core deliverable**. Everything documented in *this file* — the IDE, canvas, agents, CodeGraph, V3/Glass UI — is **experimental scaffolding** added only to test and demo the vault. It may change or be removed without affecting the vault files themselves.

**Companion to [README.md](README.md)** · [github.com/Ozgurooozer/Sentor](https://github.com/Ozgurooozer/Sentor)

This document describes everything in Sentor that is **experimental** — built to **test, demo, and stress the vault**, not shipped as a finished product. For the core deliverable (vault, forum, indexer, embeddings, hybrid search), read the main README first.

---

## Why this layer exists

The vault pipeline (HTML → indexer → embeddings → search → MCP read) is intentionally **small and stable**. The desktop IDE and everything around it is a **prototype harness** with these jobs:

1. Let humans click through vault pages and forum threads inside an app
2. Let AI agents call `vault_search`, `vault_write`, and forum tools from chat
3. Exercise MCP canvas control and CodeGraph without rewriting the vault core
4. Explore UI ideas (infinite canvas, glass tray, floating V3 windows) that may never ship

**Rule of thumb:** if it requires Tauri, React, or a running Node bridge, treat it as prototype code.

---

## Scope map

| Component | Status | Vault relationship |
|-----------|--------|-------------------|
| CLI, API, `ui/index.html`, MCP vault tools | Supporting (stable) | Direct vault access |
| Desktop IDE (`ide/`) | Experimental | Hosts agents that read/write vault |
| Infinite canvas + wire graph | Experimental | Panels display vault; run engine passes data between nodes |
| Five built-in AI agents | Experimental | Primary vault/forum/code consumers |
| MCP canvas + screenshot tools | Experimental | Remote control of canvas UI |
| CodeGraph bridge (`:4245`) | Experimental add-on | Code navigation alongside vault RAG |
| V3 floating shells (`#v3-*`) | Experimental | Separate Tauri windows for input/output/launcher |
| Glass shell (`GlassAppShell`) | Experimental / WIP | Alternate tray-based UI; not default entry point |
| Web tab (native WebView) | Experimental | SearXNG fetch; unrelated to vault storage |
| Voice / transcription | Experimental | Local faster-whisper server; optional chat input |
| Sentor / Flowise hooks | Experimental | External flow runner at `localhost:3000` |

---

## 1. Desktop IDE (Tauri v2 + React)

**Location:** `ide/`  
**Entry:** `ide/src/app/App.tsx` → `CanvasAppShell` (default)

A Windows desktop shell that wraps the vault in a visual workspace. Stack:

| Layer | Tech |
|-------|------|
| Backend | Rust (Tauri v2): file I/O, PTY terminal, HTTP ping, WebView child windows, keyring, MCP queue |
| Frontend | React 19, Vite, Tailwind CSS v4 |
| Editor | CodeMirror 6 (+ vim mode, inline autocomplete) |
| Terminal | xterm.js + portable-pty |
| AI transport | Vercel AI SDK via `@ai-sdk/openai-compatible` |

**Local AI providers (no cloud required):**

- LM Studio — `http://localhost:1234/v1`
- Ollama — `http://localhost:11434/v1`

Dev mode proxies these through Vite (`/lmstudio-proxy`, `/ollama-proxy`) to avoid CORS.

**Launch:**

```bash
cd ide && pnpm install && npm run tauri dev
# or from repo root (Windows):
sentor.bat
```

**What it proves for the vault:** agents can search, read, and write vault pages interactively; `vault_write` triggers re-index; undo snackbar surfaces `.vault-trash/` backups.

**What it is not:** a production IDE, a Notion clone, or a supported cross-platform release. Linux/macOS paths exist in Rust but Windows is the tested target.

---

## 2. Infinite canvas

**Location:** `ide/src/modules/v3-canvas/`, `ide/src/modules/canvas/`

The default UI is an **infinite pan/zoom canvas** where every feature is a **panel node**. Panels can be wired together; data flows along edges.

### Panel types (30+)

Examples: `terminal`, `editor`, `chat`, `vault-home`, `web`, `agent`, `codegraph`, `checklist`, `gallery`, `sketch`, `note`, `pipeline`, `if-else`, `for-each`, `gate`, `canvas-3d`, `variable`, …

Full list: `ide/src/modules/canvas/types.ts` · renderers: `CanvasPanelContent.tsx`

### Wires (`Connection.kind`)

| Kind | Color | Behavior |
|------|-------|----------|
| `data` | Blue | Explicit value wire; shown in chat badge row |
| `context` | Purple | Silent auto-context prepended to prompts |
| `trigger` | Green | Execution signal only; no payload |

Port definitions per panel type: `ide/src/modules/canvas/portDefs.ts`.  
Character cap per wire: `connection.charLimit` (default 4000).

### Multi-canvas & split view

- Multiple canvases persisted as `sentor-canvas-multi-{id}.json`
- Split mode: primary + secondary canvas side-by-side
- Sub-canvas drill-in: double-click a `canvas` panel title to enter; Esc to exit

### Canvas run engine

**Location:** `ide/src/modules/canvas/canvasEngine.ts`

Executes the node graph:

1. Kahn's BFS topo-sort on `data`/`context` wires (triggers ignored for ordering)
2. Sequential panel execution in dependency order
3. `gate` panels can block downstream subgraphs
4. `for-each` panels iterate upstream arrays
5. Results written to `canvasStore.setOutputData` so wires and UI update live

**Purpose in vault testing:** chain a vault search panel → chat panel → terminal panel to validate end-to-end retrieval and agent context injection.

---

## 3. AI agents (experimental)

**Location:** `ide/src/modules/ai/`  
**Built-in agents:** `ide/src/modules/ai/lib/agents.ts`

| Agent | Role | Vault tools |
|-------|------|-------------|
| **Vault** | Research default | `vault_search`, `vault_read`, forum tools, CodeGraph read |
| **Sentor-Maker** | Writes HTML vault pages | `vault_write`, forum CRUD |
| **Coder** | Edits workspace source files | No `vault_write`; CodeGraph-first |
| **Orkestra** | Coordinator | Delegates via `agent_invoke`; never writes files |
| **Vault-Exporter** | Canvas → vault page | `canvas_read_state` + `vault_write` |

**Hybrid vault search (IDE only):** `vault_search` in `ide/src/modules/ai/tools/vault.ts` runs keyword search first, then semantic/hybrid fallback via API or local embeddings + Ollama/LM Studio query embedding.

**Tool approval:** read-only tools auto-run; mutating tools (`vault_write`, `edit_file`, `forum_new_thread`, …) require user approval.

**Agent offices (vault-side, used by agents):** `vault/agents/{agent}/` holds `state.md`, `log.md`, `profile.md`, `decisions.md` — Self-RAG context the Vault agent reads on startup.

---

## 4. Orkestra (coordinator prototype)

**Location:** `ide/src/modules/canvas/orkestraStore.ts`

A **separate streaming path** from the main AI SDK chat:

- Raw fetch to Ollama/LM Studio (no Vercel AI SDK)
- Parses embedded JSON tool calls in the stream (`{"tool":"add_node",...}`)
- Can mutate the canvas (add nodes, connect wires) from natural language
- Embedded as `V3OrkPanel` on the canvas

**Status:** experimental coordinator UI; routing logic duplicates some agent responsibilities. Useful for demoing “AI builds a canvas workflow” but not architecturally final.

---

## 5. V3 floating shells

**Location:** `ide/src/modules/v3/`  
**Routing:** URL hash in separate Tauri windows

| Hash | Window | Purpose |
|------|--------|---------|
| `#v3-launcher` | `V3LauncherShell` | Project picker; scaffolds `vault/` + `.sentor/config.json` |
| `#v3-input` | `V3InputShell` | Compact input surface |
| `#v3-output` | `V3OutputShell` | Compact output surface |

These are **detached windows** for experiments in multi-window UX. Default app still loads `CanvasAppShell`.

---

## 6. Glass shell (WIP alternate UI)

**Location:** `ide/src/modules/glass-shell/`, `ide/src/app/GlassAppShell.tsx`, `ide/src/styles/glass.css`

An alternate **tray-based glass UI**:

- Magnetic pill buttons on a grid (`glass-geometry.ts`, `tray-grid.ts`)
- Theme swatches, shape presets, i18n (TR/EN)
- `GlassPanelHost` opens canvas panel types from tray buttons
- `TerminalDock`, sound feedback (`lib/audio/sound.ts`)
- Opencode config sync helper

**Not wired as default** in `App.tsx` — exists as a parallel UI experiment. Expect incomplete flows and design tokens that differ from `interface-setup/.interface-design/system.md`.

---

## 7. Browser surfaces

### Vault tab

**Location:** `ide/src/modules/browser/VaultBrowserPane.tsx`

Renders vault HTML via Tauri `asset://` URLs (`convertFileSrc`). Required because `file://` is blocked in iframes.

### Web tab

**Location:** `ide/src/modules/browser/WebBrowserPane.tsx`, `ide/src-tauri/src/modules/webview.rs`

Native **child WebView** above the DOM compositor — not an iframe. Inactive tabs call `web_set_visible(false)`.

**Web search tools:** `web_search` / `web_fetch` via SearXNG + reqwest (`web.rs`). Optional Docker SearXNG instance; unrelated to vault indexing.

---

## 8. Terminal, editor, voice

| Feature | Location | Notes |
|---------|----------|-------|
| Terminal | `ide/src/modules/terminal/` | PTY-backed xterm.js; `bash_run` / `run_command` agent tools |
| Editor | `ide/src/modules/editor/` | CodeMirror 6; AI diff tabs on approve |
| Voice | `ide/src/modules/ai/hooks/useSpeechRecognition.ts` | MediaRecorder → faster-whisper at `localhost:3001` (`transcribe/`) |
| Explorer | `ide/src/modules/explorer/` | File tree with context menu |

All exist to give agents and humans a full workspace while vault content is being tested — not as standalone product features.

---

## 9. MCP — experimental parts

Vault MCP tools are documented in the main README. **Experimental MCP surfaces:**

### Canvas queue bridge

```
MCP client → mcp_server.py → .mcp-queue.json → IDE mcp_dequeue → canvasStore
IDE canvas change → .ide-state.json → MCP canvas_get_state
```

Implemented in:

- `tools/mcp_server.py` — enqueue + read state
- `ide/src/app/hooks/useMcpBridge.ts` — export state + drain queue
- `ide/src-tauri/src/modules/mcp.rs` — atomic queue read/clear

### Canvas MCP tools

`canvas_get_state`, `canvas_add_node`, `canvas_remove_node`, `canvas_connect`, `canvas_update_node`, `canvas_clear`, `canvas_screenshot` (Windows PowerShell capture)

### IDE logs

`ide_get_logs` — reads captured console/agent log stream from disk for debugging vault agent runs.

**Limitation:** CodeGraph tools are **not** exposed via stdio MCP; they require the IDE + Node bridge.

---

## 10. CodeGraph (experimental add-on)

**Bridge:** `tools/codegraph_bridge.js` (HTTP `localhost:4245`)  
**Index:** `ide/.codegraph/codegraph.db` (SQLite)  
**Library:** `modules/codegraph-0.7.10/` (bundled separately)

```bash
node tools/codegraph_bridge.js "C:/Atlas OS"
```

| Tool | Question it answers |
|------|---------------------|
| `code_search` | Where is symbol X defined? |
| `code_explore` | Full context for a set of symbols/files in one call |
| `code_callers` | Who calls this function? |
| `code_callees` | What does this function call? |
| `code_impact` | Transitive blast radius before a refactor |
| `code_status` | Is the index ready? File/symbol counts |

**Relationship to vault:**

- Vault = **what we decided / documented** (notes, forum, agent logs)
- CodeGraph = **where it lives in source** (symbols, call graph)

The Coder agent is instructed to call `code_status` first and prefer CodeGraph over grep. The Vault agent may use CodeGraph for “where is this implemented?” questions but must still cite vault pages for product knowledge.

**Failure mode:** if the bridge is not running, tools return a one-line start command — keyword vault search still works.

---

## 11. Canvas AI tools (structured)

**Location:** `ide/src/modules/ai/tools/canvas.ts`

Six mutating tools for full agents: `canvas_add_node`, `canvas_remove_node`, `canvas_update_node`, `canvas_connect`, `canvas_clear`, `canvas_send_to_terminal`.  
Read-only: `canvas_read_state`.

Used by Vault-Exporter and external MCP clients to validate that vault-derived workflows can be composed visually.

---

## 12. Variable store (canvas prototype)

**Location:** `ide/src/modules/canvas/variableStore.ts`

Global Zustand + LazyStore persist (`sentor-variables.json`). Panels and Orkestra inject variable lists into prompts. Experimental state shared across canvas runs — not part of vault storage.

---

## 13. Sentor / Flowise integration (optional)

**Location:** `ide/src-tauri/src/modules/sentor.rs`, `ide/src/modules/ai/tools/sentor.ts`

Proxies to a local Flowise instance at `http://127.0.0.1:3000`. Tools: `sentor_list_flows`, `sentor_run_flow`. No-op if path unset. Legacy hook for external flow automation — not required for vault testing.

---

## 14. Global variable & event bus

Cross-window communication uses Tauri events with `sentor:` prefix:

| Event | Purpose |
|-------|---------|
| `sentor:mcp-cmd` | Queue file changed — drain MCP commands |
| `sentor:keys-changed` | Provider keys updated |
| `sentor:canvas-prompt` | Inject prompt into canvas chat |
| `sentor:wire-data` | Wire value updates |

Same-window state uses Zustand stores directly (no CustomEvent).

---

## How to test vault through the prototype layer

Minimal path for reviewers who want to see vault + forum in the app:

```bash
python tools/indexer.py
ollama pull all-minilm && python tools/embedder.py   # optional semantic

cd ide && npm run tauri dev
```

Inside the IDE:

1. Open **Vault Home** panel → search forum threads
2. Switch agent to **Vault** → ask a question that requires `vault_search`
3. Switch to **Sentor-Maker** → ask it to create a forum thread under `vault/forum/`
4. Re-run `python tools/indexer.py` → confirm thread appears in `vault/forum/index.html`

Optional MCP test (Cursor / Claude Code):

```bash
python tools/mcp_server.py
# vault_search "embedding" from MCP client
```

Optional CodeGraph test:

```bash
node tools/codegraph_bridge.js "C:/Atlas OS"
# In IDE Coder agent: "code_status then code_search vault_search"
```

---

## Known limitations (prototype honesty)

- **Windows-first** — WebView2, MCP screenshot, some path assumptions
- **No mobile / web deployment** of the IDE
- **Glass shell** incomplete and not default
- **Orkestra** uses a parallel AI stack (raw streaming + JSON tool parse)
- **Canvas run engine** covers common panels but not every panel type executes meaningfully
- **CodeGraph** requires manual bridge start; index can drift until `sync`
- **Semantic search** requires Ollama; without it, keyword-only mode applies everywhere except live query embedding in IDE
- **Experimental code may break** between commits — vault HTML files remain the durable artifact

---

## File index (quick navigation)

```
ide/src/app/CanvasAppShell.tsx       ← default UI shell
ide/src/app/GlassAppShell.tsx        ← alternate glass UI (WIP)
ide/src/modules/canvas/              ← store, engine, panels, wires
ide/src/modules/v3-canvas/           ← infinite canvas rendering
ide/src/modules/ai/tools/vault.ts    ← hybrid vault_search
ide/src/modules/ai/tools/forum.ts    ← forum CRUD tools
ide/src/modules/ai/tools/codegraph.ts← CodeGraph agent tools
ide/src/app/hooks/useMcpBridge.ts    ← MCP canvas bridge
tools/mcp_server.py                  ← stdio MCP server
tools/codegraph_bridge.js            ← CodeGraph HTTP bridge
vault/forum/                         ← forum threads (vault pages)
vault/agents/                        ← agent offices (Self-RAG)
```

---

## See also

- [README.md](README.md) — vault core, forum model, MCP vault tools, quick start
- [AGENTS.md](AGENTS.md) — developer commands and architecture summary
- [CLAUDE.md](CLAUDE.md) — full IDE architecture reference
- `vault/forum/sentor-vault/index.html` — vault pipeline documentation inside the vault itself

---

*This is prototype documentation. The vault HTML files and `.index/` pipeline are the durable deliverable; everything in `ide/` is subject to change or removal.*
