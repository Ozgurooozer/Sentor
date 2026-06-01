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

**Start transcription server** (Turkish voice input; requires faster-whisper):
```bash
# Windows — starts the server at localhost:3001
transcribe\start.bat
```
Runs CPU/int8 by default. Restart if it crashes after a CUDA init attempt.

**Start IDE** (API server optional — IDE works offline for keyword search):
```bash
# Windows launcher — starts API then IDE
sentor.bat

# Or manually from ide/ directory
npm run tauri dev
```

**Start CodeGraph bridge** (symbol index for AI code tools; port 4245):
```bash
node tools/codegraph_bridge.js "<workspace-path>"
```
Required for `code_search` / `code_explore` / `code_callers` / `code_callees` / `code_impact` tools in the IDE AI agents. Without it, those tools return a "not_running" error. Index stored in `ide/.codegraph/codegraph.db`.

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

**Lint (zero errors expected, 8 known warnings OK):**
```bash
cd ide && npm run lint
```

**Open browser search UI** — open `ui/index.html` directly. No server needed; `pages.js` loads as `window.SENTOR_INDEX` via `<script src>`, bypassing CORS.

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

**app.js** — 3-state view machine: `empty` → `no-results` → `results`. Fuse.js weights: title(3) > headings/desc(2) > body(1), threshold 0.35, `ignoreLocation: true`. All user content via `textContent`; only category badge uses `innerHTML` after `escapeHtml()`.

**Scoring (CLI + API):** Shared module at `tools/scoring.py` — both `cli/main.py` and `api/server.py` `sys.path.insert("tools/")` then `from scoring import score as _score`. Edit the shared module, not the call sites.

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
    sentor.rs         ← `sentor_api` Tauri command; proxies GET/POST to local Flowise at port 3000
    web.rs            ← web_search (SearXNG JSON API) + web_fetch (reqwest + scraper)
    webview.rs        ← native child WebView: web_open/navigate/set_bounds/set_visible/close/go
    mcp.rs            ← mcp_dequeue (reads+clears .mcp-queue.json), mcp_export_state, mcp_watch_start
```

**`lib.rs` vault stubs:** `vault_get_note_titles`, `vault_get_backlinks`, `vault_get_similar_notes` are stub implementations; real vault intelligence lives in the frontend AI tools.

**fs path normalization:** `modules/fs/to_canon()` always returns forward-slash paths to the frontend, on all platforms.

**MCP bridge:** Two surfaces, one mental model — queue file for state mutations, MCP stdio server for read access:
- **External → IDE commands:** `.mcp-queue.json` (pushed by REST API); `mcp_watch_start` emits `sentor:mcp-cmd` on write; frontend drains on each event + 30s defensive timer.
- **External read access:** `tools/mcp_server.py` (stdio, zero-dep) — exposes `vault_search` / `vault_read` / `vault_categories` / `vault_pages`.

**Cross-platform:** `set_click_through` is `#[cfg(target_os = "windows")]`-gated. Linux/macOS click-through is not implemented.

### Frontend module structure

```
ide/src/modules/
  ai/
    config.ts           ← 2 local providers (LM Studio, Ollama), 2 models; compact SYSTEM_PROMPT (~120 tokens)
    lib/
      agent.ts          ← agent runner loop; ProviderConfig/ProviderConfigs types,
                          buildLanguageModel, createSentorAgent, toDevProxyURL (dev CORS proxy)
      agents.ts         ← 5 built-in agents: Vault (default), Sentor-Maker, Coder, Orkestra (coordinator), Vault-Exporter
      transport.ts      ← AI HTTP transport (DirectChatTransport + live context injection)
      composer.tsx      ← React context for shared input state (text, files, voice, snippets)
      useComposer.ts    ← useComposer hook (separate file — Fast Refresh compliance)
      security.ts       ← prompt/output sanitization, sensitive-path deny-list
      sessions.ts       ← conversation session management
    agents/
      registry.ts       ← subagent types: explore, general (only two)
      runSubagent.ts    ← sub-agent invocation
    store/
      chatStore.ts      ← conversation state (Zustand)
      agentsStore.ts    ← agent list & selection
    tools/
      tools.ts          ← buildTools (aggregates all tool modules)
      fs.ts, edit.ts, search.ts, shell.ts, terminal.ts, todo.ts, subagent.ts, vault.ts, web.ts, sentor.ts, context.ts
      forum.ts          ← forum_search/read/new_thread/forum_reply — writes forum HTML pages into the vault
      orchestration.ts  ← agent_invoke — lets Orkestra delegate read-only tasks to other agents
      codegraph.ts      ← code_search/explore/callers/callees/impact/status — CodeGraph bridge at :4245
      canvas.ts         ← canvas_read_state + buildCanvasTools (structured tools for full AI agents)
    hooks/
      useSpeechRecognition.ts ← voice: MediaRecorder → POST to faster-whisper server at localhost:3001
  browser/              ← Vault + Web browser panes, AddressBar, bookmarks, assetUrl
  vault-home/           ← VaultHomePane — startup search tab
  editor/               ← CodeMirror 6 + vim mode + inline AI autocomplete + wiki-link autocomplete
  explorer/             ← file tree with context menu
  terminal/             ← xterm.js + PTY bridge, OSC handler support
  tabs/                 ← tab management (TerminalTab, EditorTab, PreviewTab, VaultTab, WebTab, VaultHomeTab, AiDiffTab)
  settings/             ← settings window bridge, preferences store, keyring access
  shortcuts/            ← global keybinding registry
  v2/                   ← SidebarChatTab.tsx (experimental)
  v3/                   ← V3 floating shells: V3InputShell, V3OutputShell, V3LauncherShell
  v3-canvas/            ← V3 canvas UI: V3InfiniteCanvas, V3CanvasNode, V3WireLayer, V3NodePalette,
                          V3CanvasTopBar, V3CanvasBgPanel (Three.js grid+bloom — used for both main bg and canvas-3d panels),
                          V3MiniMap (always visible; crosshair when empty, panel rects when panels exist),
                          V3SecondaryCanvas, V3OrkPanel (Orkestra chat panel embedded in the canvas)
  canvas/               ← canvas panel content components (one file per PanelType)
```

**App-level components** (`ide/src/app/`):
- `App.tsx` — root entry; routes `#v3-*` hashes to V3 shells, otherwise `CanvasAppShell`
- `hooks/useApiKeys.ts` — load provider keys + listen for `sentor:keys-changed`
- `hooks/useDiffReloadTrigger.ts` — reload editor tabs when AI diff is approved
- `hooks/useLeafLifecycle.ts` — dispose terminal sessions when pane-tree leaves disappear
- `hooks/useMcpBridge.ts` — export canvas state + drain `.mcp-queue.json` on `sentor:mcp-cmd` events
- `hooks/useVaultTrashCleanup.ts` — sweep `.vault-trash/` of >7-day-old backups on startup

**Shared lib** (`ide/src/lib/`):
- `safeInvoke.ts` — fire-and-forget Tauri `invoke` wrapper; logs rejections instead of swallowing them. Use for cleanup handlers, periodic background sync, and any `void invoke(...)` site. For user-initiated actions where the error should surface to the UI, use `invoke(...).catch(...)` directly.

### Canvas architecture

**Canvas is the only active UI.** `App.tsx` → `CanvasAppShell` unconditionally. V3 floating shells (`#v3-input`, `#v3-output`, `#v3-launcher`) are separate Tauri windows.

**`PanelType` union** (current):
`terminal | editor | preview | vault-home | web | chat | canvas | agent | instance | codegraph | input | pipeline | header | checklist | gallery | filebrowser | sketch | note | tool | pipe | variable | if-else | for-each | gate`

**`canvasStore.ts`** — primary Zustand store. Key state:
- `panels`, `connections`, `viewport`, `selectedIds` — active canvas
- `canvases: CanvasRecord[]`, `activeCanvasId`, `canvasHistory` — multi-canvas navigation
- `isSplit`, `secondaryPanels`, `secondaryConnections`, `secondaryViewport` — split view state
- Canvas switching persists to `sentor-canvas-multi-{id}.json`.

**Variable store (`variableStore.ts`):** Global Zustand + LazyStore persist (`sentor-variables.json`). `setVariable(name, value)` / `getVariable(name)` / `listVariables()` / `hydrate()`. `CanvasAppShell` calls `hydrate()` on mount. `scheduleFlush()` reads fresh state inside the timeout — race-condition safe.

**Wire system — `Connection.kind` semantics:**
- `"data"` (blue) — explicit value wire; value shown in the chat badge row
- `"context"` (purple) — silent auto-context; prepended to every prompt without a badge
- `"trigger"` (green) — execution signal only; carries no data
- `connection.charLimit` (default 4000) — per-wire character cap; `useWireData.ts` applies this to non-string values via `JSON.stringify` before slicing
- Upstream data in `meta.outputData: WireData`; `meta.snapshotData` freezes a stable snapshot for downstream consumers

**Port definitions:** `modules/canvas/portDefs.ts` — `PORT_DEFS` for every PanelType. Each port: `id`, `label`, `kind`, `dataType`.

**Orkestra (`orkestraStore.ts`):** Raw streaming fetch to Ollama/LM Studio — does **not** use the AI SDK. Parses embedded JSON tool calls (`{"tool":"add_node",...}`) in the response stream. Alias map rebuilt once per message via `buildSystem()`, then incrementally on each `add` call. Variable list injected into system prompt.

**Canvas AI tools (`buildCanvasTools()`):** 6 structured tools for full agents (Claude/GPT): `canvas_add_node`, `canvas_remove_node`, `canvas_update_node`, `canvas_connect`, `canvas_clear`, `canvas_send_to_terminal`. `canvas_read_state` is a separate read-only tool always available to all agents.

**Canvas run engine (`canvasEngine.ts`):** `runCanvas(options, onEvent)` executes the full node graph — Kahn's BFS topo-sort on data/context wires (triggers ignored for ordering). Gate panels can block their downstream subgraph. Results written back to `canvasStore` via `setOutputData` so wires and panels see live output. ForEach panels iterate their upstream array and run downstream for each item.

**Event communication rule:**
- Cross-window: Tauri `emitTo` / `listen` with `sentor:` prefix
- Same-window: Zustand store actions directly (no CustomEvent)
- All `sentor:` events: `sentor:mcp-cmd`, `sentor:keys-changed`, `sentor:canvas-prompt`, `sentor:v3-message`, `sentor:v3-vault-message`, `sentor:wire-data`, `sentor:canvas-unlink`

**Browser tabs:** Two kinds — `vault` tab (asset:// iframe, `VaultBrowserPane.tsx`) and `web` tab (native Tauri child WebView, `WebBrowserPane.tsx`). Native WebView sits above the DOM compositor — use `web_set_visible(false)` when inactive, not CSS. Requires `features = ["unstable"]` in `Cargo.toml`.

**Local file iframes use `asset://` not `file://`:** Tauri blocks `file://` in iframes. Use `convertFileSrc()` from `@tauri-apps/api/core`. Helper: `ide/src/modules/browser/assetUrl.ts` → `vaultPageAssetUrl(root, cat, slug)`.

**Agents (current):** Five built-in — **Vault** (default, knowledge lookup), **Sentor-Maker** (writes vault HTML pages), **Coder** (edits source files), **Orkestra** (coordinator — delegates via `agent_invoke`, never edits files directly), **Vault-Exporter** (converts canvas panels to vault pages). Subagent types: `explore` + `general` only. Each agent supports a per-agent `model` override and a `thinking` boolean toggle (stored in `AgentConfig`, persisted in `agentsStore`).

**Fast Refresh:** `useComposer` lives in `useComposer.ts`, `useTheme` in `useTheme.ts`. Do not re-merge hooks back into component files.

**Local-only providers:** LM Studio (`http://localhost:1234/v1`) and Ollama (`http://localhost:11434/v1`). Both use `@ai-sdk/openai-compatible`. Configurable in Settings → Models. No API keys required.

**CORS in dev mode:** `vite.config.ts` proxies `/lmstudio-proxy` → `:1234`, `/ollama-proxy` → `:11434`, and `/opencode-proxy` → `https://opencode.ai`. `agent.ts:toDevProxyURL()` rewrites LM Studio / Ollama URLs; `orkestraStore.ts:devProxy()` additionally handles `opencode.ai`. In production Tauri builds, providers need CORS enabled in their own settings.

**Provider config shape:** `ProviderConfig = { baseURL?: string; modelId?: string }`. `chatStore.getProviders()` assembles the map from preferences and threads it through `transport` → `createSentorAgent` → `buildLanguageModel`. Adding a provider is one entry in this map.

**Tool approval policy:** Read-only tools auto-execute after security check. Mutating tools require user approval. `edit`/`multi_edit` enforce read-before-edit via `readCache`.

**Vault write backup:** `vault_write` copies existing `index.html` to `.vault-trash/{category}/{slug}-{ts}.html` before overwriting. Tool result returns `previousVersion`. `useVaultTrashCleanup` deletes >7-day-old backups on startup.

**Sentor integration:** Local Flowise at `http://127.0.0.1:3000`. `tools/sentor.ts` wraps it into `sentor_list_flows` + `sentor_run_flow` agent tools with `startSentorIfNeeded` lifecycle. Sentor path stored in settings; if unset, tools are a no-op.

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

**Transitions:** 150ms ease-out only. Use `tw-animate-css` utilities (`animate-in fade-in slide-in-from-*`) for mount enter animations. Continuous loops use plain CSS `@keyframes` in `styles/globals.css`.

**Glass panels:** Transparent backgrounds — `V3CanvasNode` glass card provides the backdrop. Inner elements: `rgba(255,255,255,0.05)` bg / `rgba(255,255,255,0.07)` border / `#c8c8d0` text.

**Forbidden:** gradient backgrounds, box-shadows, colorful large blocks, rounded corners beyond `rounded-lg`, `motion/react`, `framer-motion`.

---

## Testing

- `tools/test_api.py` uses a **custom runner** (`test()` → global `_passed`/`_failed`), not pytest/unittest. Starts server in a background thread on port 4299.
- `tools/test_ollama.py` and `tools/test_multiturn.py` require a running Ollama instance and Sentor API — not CI-safe.
- No CI workflow exists.

---

## Philosophy

- Fewer lines > more lines; readable > clever; working > perfect
- Zero dependencies: Python stdlib for indexing/CLI/API; CDN for Tailwind and Fuse.js; no npm, no pip on the Python side
- Before creating any new UI component, state the spacing/color/depth decisions and get approval
- Warn on design inconsistencies against `system.md`
- Never suggest unnecessary dependencies

