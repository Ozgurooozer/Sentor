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
Auto-started by `atlas-v3.bat`. Runs CPU/int8 by default. Restart if it crashes after a CUDA init attempt.

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

**Scoring (CLI + API):** title(3) > headings/desc(2) > body(1). Shared module at `tools/scoring.py` — both `cli/atlas.py` and `api/server.py` `sys.path.insert("tools/")` then `from scoring import score as _score, passes_default_filter as _passes_default_filter, DEFAULT_EXCLUDE_TYPES`. Edit the shared module, not the call sites.

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
```

**`lib.rs` vault stubs:** `vault_get_note_titles`, `vault_get_backlinks`, `vault_get_similar_notes` are currently stub implementations; real vault intelligence lives in the frontend AI tools.

**fs path normalization:** `modules/fs/to_canon()` always returns forward-slash paths to the frontend, on all platforms.

**MCP bridge (`modules/mcp.rs`):** `mcp_dequeue` reads + atomically clears `ROOT/.mcp-queue.json`. `mcp_export_state` writes the live canvas snapshot to `ROOT/.ide-state.json`. `mcp_watch_start` starts a `notify` filesystem watcher on the queue file and emits `atlas:mcp-cmd` on each write — the frontend drains the queue on every event, with a 30s polling timer as a defensive fallback. The watcher is singleton (idempotent), kept in a `static Mutex<Option<RecommendedWatcher>>`.

This bridge handles **external→IDE commands** (queue file pushed by the REST API). The complementary direction — **external assistants reading the vault** — is served by the stand-alone `tools/mcp_server.py` (stdio JSON-RPC), which runs independently of the IDE and reuses `tools/scoring.py` so its results match the CLI/API. Two surfaces, one mental model: queue file for state mutations, MCP stdio server for read access.

**Cross-platform guards:** `set_click_through` is `#[cfg(target_os = "windows")]`-gated (Win32 `SetWindowRgn`); the non-Windows branch is a no-op `Ok(())`. UI surfaces a "Windows-only" hint in Settings → General. Linux support is a future task — `notify` already produces cross-platform watcher events.

### Frontend module structure

```
ide/src/modules/
  ai/
    config.ts           ← 2 local providers (LM Studio, Ollama), 2 models; compact SYSTEM_PROMPT (~120 tokens)
    lib/
      agent.ts          ← agent runner loop; `ProviderConfig`/`ProviderConfigs` types,
                          `buildLanguageModel(provider, keys, modelId, { providers })`,
                          `createAtlasAgent`, `toDevProxyURL` (dev CORS proxy)
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
      fs.ts, edit.ts, search.ts, shell.ts, terminal.ts, todo.ts, subagent.ts, vault.ts, web.ts, sentor.ts, context.ts
    hooks/
      useSpeechRecognition.ts ← voice input; uses MediaRecorder → POST to local
                                faster-whisper server at localhost:3001 for Turkish
                                quality (not Web Speech API — original name
                                `useWhisperRecording` was accurate, then misleadingly
                                renamed; the Whisper server at `transcribe/` is real)
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
  v2/                   ← experimental v2 UI surfaces (currently: SidebarChatTab.tsx)
  v3/                   ← V3 floating shells: V3InputShell, V3OutputShell, V3LauncherShell
  v3-canvas/            ← V3 canvas UI: V3InfiniteCanvas, V3CanvasNode, V3WireLayer, V3NodePalette, V3CanvasTopBar, V3CanvasBg, V3SecondaryCanvas
  archive/v2/           ← archived V2 components (AiMiniWindow, HitBitmapSync, LauncherScreen)
```

**App-level components** (`ide/src/app/`):
- `App.tsx` — root entry; routes `#v3-*` hashes to V3 shells, otherwise `CanvasAppShell`
- `hooks/useApiKeys.ts` — load provider keys + listen for `atlas:keys-changed`
- `hooks/useDiffReloadTrigger.ts` — reload editor tabs when an AI diff is approved
- `hooks/useLeafLifecycle.ts` — dispose terminal sessions when their pane-tree leaves disappear; prune per-leaf ref maps
- `hooks/useMcpBridge.ts` — export canvas state + drain `.mcp-queue.json` on `atlas:mcp-cmd` events (and 30s fallback)
- `hooks/useVaultTrashCleanup.ts` — sweep `.vault-trash/` of >7-day-old backups on startup

**Shared lib** (`ide/src/lib/`):
- `safeInvoke.ts` — fire-and-forget Tauri `invoke` wrapper that logs rejections through `console.error` (and the log store) instead of swallowing them silently. Use this for cleanup handlers, periodic background sync, and any `void invoke(...)` site. For user-initiated actions where the error should surface to the UI, use `invoke(...).then(...).catch(...)` directly.

**Agents (current):** Three built-in agents — **Vault** (default, research + memory), **Atlas-Maker** (writes vault HTML pages), **Coder** (edits source files). Subagent types: `explore` + `general` only. Adding a fourth agent means broader scope creep — keep the set to three unless there's a concrete user-facing reason.

**Fast Refresh:** Fixed — `useComposer` lives in `useComposer.ts`, `useTheme` lives in `useTheme.ts`. Do not re-merge hooks back into component files.

**Local file iframes use `asset://` not `file://`:** Tauri's WebView blocks `file://` in iframes. Use `convertFileSrc()` from `@tauri-apps/api/core` to get `asset://localhost/...` URLs. Helper: `ide/src/modules/browser/assetUrl.ts` (created in Phase D). There is no custom `vault:` URL scheme — use `vaultPageAssetUrl(root, cat, slug)` from that helper instead.

**Local-only providers:** LM Studio (`http://localhost:1234/v1`) and Ollama (`http://localhost:11434/v1`). Both use `@ai-sdk/openai-compatible`. Base URLs and **chat model ID** (e.g. `google/gemma-4-e4b`) are configurable in Settings → Models. No API keys required.

**CORS in dev mode:** `vite.config.ts` proxies `/lmstudio-proxy` → `:1234` and `/ollama-proxy` → `:11434` at the Node level, bypassing browser CORS. `agent.ts:toDevProxyURL()` rewrites localhost provider URLs to these proxy paths when `import.meta.env.DEV` is true. In production Tauri builds, providers must have CORS enabled in their own settings.

**Provider config shape:** `ProviderConfig = { baseURL?: string; modelId?: string }` and `ProviderConfigs = Partial<Record<ProviderId, ProviderConfig>>` live in `agent.ts`. `chatStore.getProviders()` assembles the map from preferences (`lmstudioBaseURL`, `lmstudioChatModelId`, …) and threads it through `transport` → `createAtlasAgent` → `buildLanguageModel(provider, keys, modelId, { providers })`. Adding a new provider is one entry in this map, not two extra `AgentDeps` fields. Empty string / missing entry = provider default. Set via Settings → Models → "Chat model identifier".

**Tool approval policy:** Read-only tools (read_file, list_directory, grep, glob) auto-execute after security check. Mutating tools (write_file, edit, multi_edit, create_directory, bash_*) require user approval. `edit`/`multi_edit` additionally enforce read-before-edit via `readCache`.

**Vault write backup:** `vault_write` (in `tools/vault.ts`) reads any existing `index.html` at the target path before overwriting and copies it to `.vault-trash/{category}/{slug}-{iso-timestamp}.html`. The trash path comes back in the tool result as `previousVersion` so the user can restore by hand. `useVaultTrashCleanup` sweeps the directory on IDE startup and deletes any file with `mtime` older than 7 days.

**Sentor integration:** Sentor is a local [Flowise](https://flowiseai.com) visual-agent-flow runner at `http://127.0.0.1:3000`. `sentor.rs` exposes a `sentor_api` Tauri command that proxies raw GET/POST calls to its REST API. `tools/sentor.ts` wraps this into two agent tools (`sentor_list_flows`, `sentor_run_flow`) plus lifecycle helpers (`startSentorIfNeeded`, `waitForSentor`, `stopSentor`) that launch `start-sentor.bat` in the configured Sentor path before first use. Sentor path is stored in settings; if unset, Sentor tools are a no-op.

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

**Transitions:** 150ms ease-out only. Tailwind `transition-{property} duration-150 ease-out`, optionally with `tw-animate-css` utilities (`animate-in fade-in slide-in-from-*`) for mount enter animations. Continuous loops use plain CSS `@keyframes` in `styles/globals.css` (see `atlas-shimmer`).

**Forbidden:** gradient backgrounds, box-shadows, colorful large blocks, rounded corners beyond `rounded-lg`, external animation runtimes (`motion/react`, `framer-motion`, etc. — they were removed in the v0.6 cleanup; use the patterns above instead).

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

### Completed phases

| Phase | Description |
|---|---|
| 0 | Fast Refresh fixes — `useComposer.ts`, `useTheme.ts` split |
| A | `web_search` + `web_fetch` via SearXNG + reqwest (`modules/web.rs`, `tools/web.ts`) |
| B | Agent consolidation — Vault / Atlas-Maker / Coder; subagents trimmed to `explore` + `general`; Mermaid bundled offline |
| C | Auto re-index after `vault_write` via `findPython()` helper |
| D | **Browser tabs** — Vault tab (asset:// iframe) + Web tab (native child WebView using Tauri `unstable` feature); address bar, back/forward, bookmarks, SearXNG search |
| E | Vault Home tab — startup search front door over the user's own knowledge base |
| F | **Release-quality cleanup** — see "Phase F notes" below |
| G | **Canvas UI full transition** — see "Phase G notes" below |
| H | **Canvas V3 + Modular Wiring** — see "Phase H notes" below |
| I | **V3-only mode + housekeeping** — V2 archived, npm pruned, window positioning fixed, transcription server fixed |
| J | **Glass panel interiors** — 8 canvas panel content components redesigned to V3 glass aesthetic; `shadcn/tailwind.css` import removed |

### Phase F notes (v0.6 cleanup)

What changed from the rough v0.5 codebase:

- **Security / correctness:** `api/server.py` `_static` switched from `startswith()` to `Path.is_relative_to()` (closes the `C:\Atlas OS-evil` traversal); `HTTPServer.allow_reuse_address = True` (no more 60s TIME_WAIT after Ctrl+C); all background `_cli_run` / `_cli_pipeline_run` / `_node_run` threads now wrap their work in `try/except` and print errors instead of swallowing them silently.
- **AI internals:** `AgentDeps` flat per-provider fields collapsed into `providers: ProviderConfigs`. Adding a provider no longer touches 7 files. `chatStore.getProviders()` is the single source of truth.
- **Silent failures:** new `lib/safeInvoke.ts` for fire-and-forget Tauri calls. `WebBrowserPane` and `App.tsx` MCP bridge use it; `AgentStatusPill` + `AiChat.tsx` error banner surface `agentMeta.error` so a crashed agent no longer hangs on "Thinking…".
- **MCP polling → events:** Rust `mcp_watch_start` (`notify` crate) emits `atlas:mcp-cmd` on queue file change; frontend drains on each event and keeps a 30s defensive timer.
- **MCP read surface:** `tools/mcp_server.py` (stdio, zero-dep) exposes `vault_search` / `vault_read` / `vault_categories` / `vault_pages` so external MCP clients (Claude Code, Cursor, Continue, Cline) can browse the vault without opening the IDE. Code graph tools stay IDE-bound for now — graph index lives in the Tauri process.
- **Vault undo:** `vault_write` backs up the prior `index.html` to `.vault-trash/{cat}/{slug}-{ts}.html` before overwriting. `useVaultTrashCleanup` deletes >7-day-old backups on IDE startup.
- **Onboarding:** new `StepIndex` (probe `.index/pages.json`, "Build now" → `python tools/indexer.py`). `StepProvider` gained an `all-minilm` model check + "Pull now" button (calls `ollama pull all-minilm` via `shell_run_command`).
- **App.tsx:** five custom hooks extracted to `app/hooks/` (see "App-level components" above). 1610 → 1517 lines (further reduced in Phase I — V2 branches removed, now routes only `#v3-*` hashes + `CanvasAppShell`).
- **Bundle hygiene:** `motion/react` removed (10 call sites → Tailwind + `tw-animate-css`). D3 default-import replaced with named imports so Rollup tree-shakes the unused force/zoom modules. Scoring duplication between `cli/atlas.py` and `api/server.py` consolidated into `tools/scoring.py`. `ort` ships with the `tls-rustls` feature so `ort-sys ≥ rc.10` builds (its `download-binaries` build script needs an explicit `ureq3` TLS provider).
- **Misc renames:** `useWhisperRecording` → `useSpeechRecognition` (name was temporarily misleading; Phase I clarified the hook uses MediaRecorder → local Whisper server, not Web Speech API). The `c:\\Atlas OS` hardcoded workspace fallback in `App.tsx` was replaced with a memoised `home`-derived path.

What is explicitly deferred:

- **Vault undo snackbar** — the backend backup is done, but there's no in-app "Undo (5s)" surface yet. The tool result already returns `previousVersion` if a UI needs to wire it up.
- **Linux / macOS click-through** — `set_click_through` is `#[cfg(target_os = "windows")]`. Adding X11 shape regions / macOS NSView event passthrough is its own piece of work.

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

### Phase G notes (v0.7 — Canvas UI transition)

**Canvas is the only active UI.** Classic and focused layout modes are archived in `ide/src/archive/v2/`. `App.tsx` routes `#v3-*` hashes to V3 floating shells and everything else to `CanvasAppShell`.

New files and what they do:

- **`app/CanvasAppShell.tsx`** — Canvas mode root layout (replaces `App.tsx` shell when `layoutMode === "canvas"`). Has its own ThemeProvider + AiComposerProvider so it's independent.
- **`modules/canvas/CanvasTopBar.tsx`** — Top bar: Atlas logo, `CanvasBreadcrumb`, provider pill, settings button.
- **`modules/canvas/CanvasBreadcrumb.tsx`** — Multi-canvas navigation breadcrumb from `canvasHistory`.
- **`modules/canvas/AddPanel.tsx`** — Cmd+K node palette. Categories: AI / Tools / Inputs / Display / Canvas. Fuzzy search.
- **`modules/canvas/MiniMap.tsx`** — 160×100px SVG minimap (bottom-left). Click to navigate.
- **`modules/canvas/ZoomBar.tsx`** — `[−] [%] [+] [⊞]` zoom control (bottom-right). Fit-all button.
- **`modules/canvas/Orkestra.tsx`** — Node/wire counter + quick-add bar (above dock).
- **`modules/canvas/TweaksPanel.tsx`** — Slide-in panel (⚙ button, top-right): bg style, wire anim, guides, density, quality, node radius/header.
- **`modules/canvas/canvasTweaksStore.ts`** — Zustand store for tweak settings (`BgStyle`, `WireAnim`, `WireStyle`, etc.).
- **`modules/canvas/SketchPanel.tsx`** — HTML5 Canvas 2D drawing panel (pen/eraser/select/clear).
- **`modules/canvas/NotePanel.tsx`** — Sticky-note panel; amber-glass tint, warm text, wire output.
- **`modules/canvas/ToolPanel.tsx`** — Tool wrapper node; glass icon bubble, label, hidden-canvas badge.
- **`modules/canvas/InputPanel.tsx`** — User input panel (text/image/file); fully glass form; outputs to `value` port.
- **`modules/canvas/ChecklistPanel.tsx`** — Checklist panel; glass rows, custom SVG checkbox, progress bar; outputs pending tasks as text.
- **`modules/canvas/HeaderPanel.tsx`** — Label/section header node; `meta.headerColor` overrides accent + text glow.
- **`modules/canvas/GalleryPanel.tsx`** — Image gallery; glass toolbar + grid cells; outputs selected image as `image` wire.
- **`modules/canvas/FileBrowserPanel.tsx`** — File browser; glass sidebar (pinned + vault cats) + file list; outputs selected file content.
- **`modules/canvas/PipePanel.tsx`** — Auto-transform node; glass prompt editor, status dot glow, glass output area; uses local model (Ollama/LM Studio).
- **`modules/canvas/AgentEditorPanel.tsx`** — Full AI agent panel (agent type, separate from chat panel).
- **`modules/canvas/PipelinePanel.tsx`** — Wraps a CLI pipeline node on the canvas.
- **`modules/canvas/CodeGraphPanel.tsx`** — Code graph visualization; outputs graph JSON.
- **`modules/canvas/SubCanvasContent.tsx`** — Renders the interior canvas of a `canvas`-type panel.
- **`modules/canvas/CanvasDock.tsx`** — Bottom dock strip; renders panels with `minimized: true`.
- **`modules/canvas/PinnedPanelsPortal.tsx`** — React portal that renders `pinned: true` panels at fixed viewport coords, above the canvas z-stack.
- **`modules/canvas/orkestraStore.ts`** — Zustand store for the **Orkestra AI** chat: raw streaming fetch to Ollama (`/api/chat`) or LM Studio (`/v1/chat/completions`). Parses embedded JSON tool calls (`{"tool":"add_node",...}`) in the assistant response and executes them against `canvasStore`. Does **not** use the AI SDK — it's a direct fetch loop so it works with small local models. Terminal triggers go through `useCanvasStore.triggerTerminal()` (not CustomEvent). Alias map rebuilt once at message start via `buildSystem()`, then incrementally on each `add` call.
- **`modules/canvas/terminalLink.ts`** — Module-level `Map` that tracks which canvas terminal panel a chat session is linked to. When a link is active, `bash_run` commands mirror output to that panel's PTY. `setLinkedTerminal(sessionId, panelId|null)` / `getLinkedTerminal(sessionId)`.
- **`modules/canvas/portDefs.ts`** — Named port definitions for every `PanelType` (`PORT_DEFS`). Each port has `id`, `label`, `kind` (`ConnectionKind`), and `dataType` (`"text"|"image"|"json"|"trigger"|"any"`). `namedPortPoint()` computes canvas-space coordinates; `portIndex()` / `portKind()` look up port metadata.
- **`modules/canvas/nodeAccent.ts`** — Per-type accent colors used for panel borders and faint glows. `accentFor(panel)` — honours `meta.headerColor` override for header nodes.
- **`modules/canvas/useWireData.ts`** — `useAllIncomingWireData(panelId)` collects upstream wire values (excluding trigger wires). Respects `meta.snapshotData` (frozen snapshot) over live `meta.outputData` and clips each wire to `connection.charLimit ?? 4000` chars.

**`canvasStore.ts` multi-canvas additions:**
- `CanvasRecord` type: `{ id, title, kind, hidden?, parentCanvasId? }`
- `canvases: CanvasRecord[]`, `activeCanvasId: string`, `canvasHistory: string[]`
- Actions: `addCanvas()`, `removeCanvas()`, `switchCanvas(id)`, `enterCanvas(id)`, `exitCanvas()`
- Canvas switching persists to per-canvas `atlas-canvas-multi-{id}.json` files.

**`types.ts` — full `PanelType` union:**
`terminal | editor | preview | vault-home | web | chat | canvas | agent | instance | codegraph | input | pipeline | header | checklist | gallery | filebrowser | sketch | note | tool | pipe`

**`CanvasPanelNode` extended fields:**
- `pinned?: boolean` + `screenX/Y` — panel rendered at fixed viewport coords via `PinnedPanelsPortal`.
- `minimized?: boolean` — panel collapsed into the `CanvasDock` strip at the bottom.
- `viewport?: Viewport` + `children?: CanvasPanelNode[]` — sub-canvas nesting (used by `canvas`-type panels, rendered by `SubCanvasContent`).

**Wire system — `Connection.kind` semantics:**
- `"data"` (blue) — explicit value wire; value shown in the chat badge row.
- `"context"` (purple) — silent auto-context; prepended to every prompt without a badge.
- `"trigger"` (green) — execution signal; does **not** carry data, only a pulse.
- `connection.charLimit` (default 4000) — per-wire cap on characters forwarded downstream; prevents a noisy terminal from blowing the token budget.
- Upstream data lives in `meta.outputData: WireData`; `meta.snapshotData` freezes a stable snapshot so downstream chats see consistent values even while the producer keeps updating.

**Wire animations:** `atlas-wire-flow` / `atlas-wire-pulse` keyframes in `globals.css`. Controlled by `canvasTweaksStore.wireAnim` → `ConnectionLayer.wireAnim` prop.

**Background styles:** `InfiniteCanvas.getBgStyle(bgStyle)` — dot / grid / solid / radial / noise.

**Alignment guides:** computed during panel drag when `canvasTweaksStore.showGuides` is true — red lines at x/y/center alignment positions.

What is deferred:
- `CanvasPanel` drill-in for canvas nodes (double-click → `switchCanvas`) — ToolPanel stub is in place.
- Vault undo snackbar (backend is already there).

### Phase H notes (v0.8 — Canvas V3 + Modular Wiring)

**Canvas V3 UI (`ide/src/modules/v3-canvas/`):**
- `V3InfiniteCanvas.tsx` — Three.js bg, glass nodes, named port dots, canvas INPUT/OUTPUT semicircle ports on left/right edges
- `V3CanvasNode.tsx` — glass card; `storeOverrides?` prop lets secondary canvas redirect store mutations
- `V3WireLayer.tsx` — bezier wires; `addConnectionOverride?` / `removeConnectionOverride?` for secondary canvas
- `V3NodePalette.tsx` — 2D/3D tab palette; `onAddPanel?` override for secondary canvas
- `V3CanvasTopBar.tsx` — editable title (double-click), `▶ Run` button (active when connections > 0), split-view toggle, `secondary` prop
- `V3SecondaryCanvas.tsx` — second independent canvas with its own store slice; split via `isSplit` flag in canvasStore
- `V3CanvasBg.tsx` / `V3CanvasBgPanel.tsx` — Three.js perspective grid + sparse particles

**canvasStore additions (Phase H):**
- `isSplit`, `secondaryTitle`, `secondaryPanels`, `secondaryConnections`, `secondaryViewport`, `secondarySelectedIds` — full secondary canvas state
- `openSplit()` / `closeSplit()` — toggle split view, resets secondary state
- `renameCanvas(id, title)` — update canvas title in the `canvases[]` array

**Terminal panel (`CanvasPanelContent.tsx` → `V3TerminalPanel`):**
- Mode toggle: `>_` (PTY shell) and `JS` (JS eval REPL with `JSON.stringify` pretty-printing)
- `▶ Run` button in toolbar — green when wire data available, dispatches on `canvas:run` event
- Bottom `$` command bar — sends to PTY without clicking into xterm; Escape→clear+refocus; ↑/↓ history
- **Wired inputs panel** below command bar — shows each connected node with port badge (`cmd` in green, others purple), source title, content preview
- Three.js overlay **removed** from terminal — it was intercepting xterm pointer events

**Modular port system:**
- `WireBlock.toPort?: string` — added so per-port wire filtering works
- `terminal` ports: `cmd` (text data input) + `trigger` (run) → `stdout` (text output)
- Terminal `▶ Run` uses `cmd` port wire; manual `$` bar overrides the wire

**V3 Input → Canvas bridge:**
- `V3InputShell` has a `⊞` canvas-link toggle button (persisted to `localStorage`)
- When linked: window border turns green; placeholder changes; send routes to `emit("atlas:canvas-prompt", {text})`
- `CanvasAppShell` listens for `atlas:canvas-prompt` → routes to `useOrkestraStore.send()` with current model preferences
- `atlas:canvas-unlink` event clears `v3InputActive` flag
- `OrkestraOutput` shows `● V3 bağlı` badge and auto-expands when linked messages arrive
- `orkestraStore.v3InputActive: boolean` / `setV3InputActive(v)` tracks link state

**Canvas Run button:**
- `V3CanvasTopBar` `▶ Run` button — reads `connections`/`secondaryConnections`; active when `connections.length > 0`; dispatches `canvas:run` custom event

### Phase I notes (v0.9 — V3-only mode + housekeeping)

**V2 archived:** `AiMiniWindow.tsx`, `HitBitmapSync.tsx`, `LauncherScreen.tsx` moved to `ide/src/archive/v2/`. `tsconfig.json` excludes `src/archive` to prevent TS errors from broken relative imports. `App.tsx` simplified — no `USE_V3` flag, no `layoutMode` switch; canvas is the unconditional default.

**Settings cleanup:** Layout section removed from Settings → General (only one mode exists). `setLayoutMode` / `LayoutMode` imports removed from `GeneralSection.tsx`.

**npm pruned:** `@ai-sdk/cerebras`, `@ai-sdk/google`, `@ai-sdk/xai`, `shadcn` removed (~75 packages now). `@ai-sdk/anthropic` and `@ai-sdk/groq` kept — used via dynamic `await import(...)` in `agent.ts` lines 154–161.

**Window positioning (`lib.rs`):** All V3 floating windows (`v3-input`, `v3-output`, `v3-launcher`) now use `monitor.work_area()` instead of hardcoded `taskbar_h = 48`. Input bar width = `clamp(40% of work area, 480–620 px)`. Window-state plugin excludes V3 windows via `skip_initial_state(label)` — they always open at computed positions, never at stale saved positions.

**V3InputShell sizing:** `BAR_W` is now dynamic (`Math.round(window.outerWidth) || 600`) instead of hardcoded `680`. Panel height reduced from 300 → 260px. `resizeWindow` clamps y so the expanded panel cannot overflow above the work area top.

**Transcription server (`transcribe/server.py`):** Fixed `UnboundLocalError: cannot access local variable 'model'` — root cause was Python's function-scoped `del model` in the except branch, which caused the interpreter to treat `model` as local throughout the entire function. Fix: `global model` declaration added inside the `with _model_lock:` block. Language locked to `tr` (Turkish) via `fd.append("language", "tr")` in `V3InputShell.transcribeBlob()`. Server now runs CPU/int8 by default (`start.bat`: `WHISPER_DEVICE=cpu`, `WHISPER_COMPUTE=int8`).

**V3OutputShell TTS:** Each assistant message has a small speak button below it. Uses `speechSynthesis` Web API (`lang=tr-TR`, `rate=1.05`). Clicking the button for an already-speaking message cancels speech. `extractText(parts)` helper strips non-text parts from `UIMessage["parts"]`.

### Phase J notes (v0.10 — Glass panel interiors)

**`shadcn/tailwind.css` import removed** (`ide/src/styles/globals.css` line 3) — `shadcn` was removed from `package.json` in Phase I but the CSS import was left behind, causing a Vite 500 error on startup. All CSS variables are defined inline in `globals.css` via `@theme inline`; the import was redundant.

**8 canvas panel content components redesigned** to match the V3 glass aesthetic. All panels now have transparent backgrounds (the `V3CanvasNode` glass card provides the backdrop); inner interactive elements use `rgba(255,255,255,0.05)` bg / `rgba(255,255,255,0.07)` border / `#c8c8d0` text. Specific changes per panel:

- **NotePanel** — amber-glass tint (`radial-gradient` overlay) replaces yellow solid gradient; text `#e8dfc0`, caret `#d4a843`, folded corner glass-style.
- **ToolPanel** — glass icon bubble (`rgba(91,141,239,0.10)` + `border rgba(91,141,239,0.22)`); label and hidden-canvas badge match V3 tokens.
- **HeaderPanel** — transparent bg; title text glow (`textShadow ${color}40`); color picker dots use outline ring instead of Tailwind `ring-offset-[#0a0a0a]`.
- **InputPanel** — kind tabs redesigned as glass pills; textarea/input use shared `G.input` token object; image drop zone glass hover effect; all backgrounds transparent.
- **ChecklistPanel** — custom SVG checkbox (`#4db89a` stroke when done); glass hover rows; progress bar (blue → green at 100%); empty-state SVG icon; add-button hover turns accent blue.
- **PipePanel** — glass prompt textarea; status dot with `boxShadow` glow; run button glass pill; output text `#a8c4e8` (blue-tinted for readability); all section dividers `rgba(255,255,255,0.05)`.
- **GalleryPanel** — glass toolbar with truncated path; image cells `border rgba(255,255,255,0.06)` → `rgba(155,114,239,0.80)` when selected; empty-state SVG grid icon; count bar glass.
- **FileBrowserPanel** — breadcrumb bar glass; sidebar hover states glass; file list rows glass hover; all solid `bg-[#0a0a0a]`/`bg-[#0d0d0d]` backgrounds removed; file size and separator text match V3 muted tokens.

### Phase K notes (v0.11 — Mimari temizlik)

**MCP konsolidasyonu:** `mcp/server.py` (HTTP transport variant) silindi. Tek MCP server: `tools/mcp_server.py` (stdio, zero-dep). `_enqueue()` atomic write'a geçirildi (`tempfile` → `os.replace`).

**Event standardizasyonu:** Tüm cross-window iletişim `atlas:` prefix ile tek namespace'de:
- `atlas:terminal-trigger` (CustomEvent) → `useCanvasStore.triggerTerminal(panelId, cmd)` (Zustand action, `meta._termTrigger`)
- `v3:user-message` → `atlas:v3-message`
- `v3:vault-message` → `atlas:v3-vault-message`
- `v3:wire-data` → `atlas:wire-data`
- Kural: cross-window → Tauri `emitTo/listen`; same-window → Zustand store.

**AI transport genişlemesi:** `createContextAwareTransport` `Deps`'e `getCanvasSnapshot?()` eklendi — canvas state her agent session'ında system context'e inject edilebilir. `buildCanvasTools()` 6 yeni structured tool kazandı: `canvas_add_node`, `canvas_remove_node`, `canvas_update_node`, `canvas_connect`, `canvas_clear`, `canvas_send_to_terminal`. Artık tam ajanlar (Claude/GPT) canvas'ı doğrudan AI SDK tool'larıyla yönetebilir.

**OrkestraStore optimizasyonu:** Alias map artık her `execTool()` çağrısında değil, sadece mesaj başında `buildSystem()` ile rebuild edilir. `add` tool call'u yeni node'u alias map'e incremental ekler.

**Dead code:** `ide/src/archive/v2/` (AiMiniWindow, HitBitmapSync, LauncherScreen) silindi. `tsconfig.json`'dan `"exclude": ["src/archive"]` kaldırıldı.

### Next (Phase L)

Backlinks panel UX, mermaid editor preview, richer graph view interactions, voice-to-vault flow, remaining canvas panel glass rewrites (SketchPanel, PipelinePanel, AgentEditorPanel), drill-in canvas node, vault undo snackbar, blueprint/variable node sistemi (Phase K spec'ten).
