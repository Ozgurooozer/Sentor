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
      useSpeechRecognition.ts ← voice input via `window.SpeechRecognition`
                                (browser-native; the file used to be called
                                `useWhisperRecording` — that name was misleading
                                since no Whisper model is involved)
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

**App-level components** (`ide/src/app/`):
- `App.tsx` — root layout, tab orchestration, settings/mini-window wiring, `layoutMode` switching
- `FocusedChatCenter.tsx` — `FocusedBar` component rendered in focused overlay mode (bottom bar only)
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

### Phase F notes (v0.6 cleanup)

What changed from the rough v0.5 codebase:

- **Security / correctness:** `api/server.py` `_static` switched from `startswith()` to `Path.is_relative_to()` (closes the `C:\Atlas OS-evil` traversal); `HTTPServer.allow_reuse_address = True` (no more 60s TIME_WAIT after Ctrl+C); all background `_cli_run` / `_cli_pipeline_run` / `_node_run` threads now wrap their work in `try/except` and print errors instead of swallowing them silently.
- **AI internals:** `AgentDeps` flat per-provider fields collapsed into `providers: ProviderConfigs`. Adding a provider no longer touches 7 files. `chatStore.getProviders()` is the single source of truth.
- **Silent failures:** new `lib/safeInvoke.ts` for fire-and-forget Tauri calls. `WebBrowserPane` and `App.tsx` MCP bridge use it; `AgentStatusPill` + `AiChat.tsx` error banner surface `agentMeta.error` so a crashed agent no longer hangs on "Thinking…".
- **MCP polling → events:** Rust `mcp_watch_start` (`notify` crate) emits `atlas:mcp-cmd` on queue file change; frontend drains on each event and keeps a 30s defensive timer.
- **MCP read surface:** `tools/mcp_server.py` (stdio, zero-dep) exposes `vault_search` / `vault_read` / `vault_categories` / `vault_pages` so external MCP clients (Claude Code, Cursor, Continue, Cline) can browse the vault without opening the IDE. Code graph tools stay IDE-bound for now — graph index lives in the Tauri process.
- **Vault undo:** `vault_write` backs up the prior `index.html` to `.vault-trash/{cat}/{slug}-{ts}.html` before overwriting. `useVaultTrashCleanup` deletes >7-day-old backups on IDE startup.
- **Onboarding:** new `StepIndex` (probe `.index/pages.json`, "Build now" → `python tools/indexer.py`). `StepProvider` gained an `all-minilm` model check + "Pull now" button (calls `ollama pull all-minilm` via `shell_run_command`).
- **App.tsx:** five custom hooks extracted to `app/hooks/` (see "App-level components" above). 1610 → 1517 lines. Layout JSX split into `WorkspaceLayout` / `FocusedLayout` is still open — left for the next pass.
- **Bundle hygiene:** `motion/react` removed (10 call sites → Tailwind + `tw-animate-css`). D3 default-import replaced with named imports so Rollup tree-shakes the unused force/zoom modules. Scoring duplication between `cli/atlas.py` and `api/server.py` consolidated into `tools/scoring.py`. `ort` ships with the `tls-rustls` feature so `ort-sys ≥ rc.10` builds (its `download-binaries` build script needs an explicit `ureq3` TLS provider).
- **Misc renames:** `useWhisperRecording` → `useSpeechRecognition` (the hook was always using `window.SpeechRecognition`, never Whisper). The `c:\\Atlas OS` hardcoded workspace fallback in `App.tsx` was replaced with a memoised `home`-derived path.

What is explicitly deferred:

- **Layout JSX split** — `<WorkspaceLayout>` / `<FocusedLayout>` extraction from App.tsx's 1300-line JSX trunk. Needs manual UI testing across both modes; do it as its own PR.
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

### Focused Overlay Mode (v0.2)

`layoutMode: "classic" | "focused"` preference (Settings → General). In focused mode the window is transparent and always-on-top; only a 148px bottom bar (`FocusedBar`) is opaque. The desktop is visible through the rest.

Key implementation details:
- `transparent: true` set in `tauri.conf.json`; entering focused mode also auto-resizes the window to full-width × 180px at the bottom of the screen (`setSize`/`setPosition` via Tauri `currentMonitor`).
- `FocusedBar` (`ide/src/app/FocusedChatCenter.tsx`) — left: mini terminal strip, right: logo row (`data-tauri-drag-region`) + gear/chat icon buttons + `AiInputBar`.
- `AiMiniWindow` gains `isFocused` (enables in-window pointer-drag) and `onBoundsChange` (reports its `DOMRect` for click-through region updates) props.
- **Click-through** (`Ctrl+Alt+P`, `"layout.toggleClickThrough"`): calls `set_click_through` Tauri command (Windows-only, `lib.rs:set_click_through`) which uses `SetWindowRgn` Win32 API to make the transparent area pass mouse events to the desktop. The hit region is always bar ∪ chat balloon (when open); all coordinates in physical pixels (`logical × devicePixelRatio`).
- Shortcuts: `Ctrl+Alt+F` (`"layout.toggleFocused"`), `Ctrl+Alt+P` (`"layout.toggleClickThrough"`). (`Ctrl+Shift+F` is taken by `explorer.search` on Windows.)
- Chat balloon auto-opens when `agentMeta.status === "thinking"` in focused mode (G6 in `OVERLAY_PLAN.md`).

### Next (Phase G — feature polish)

Now that the v0.6 cleanup is in: backlinks panel UX, mermaid editor preview, richer graph view interactions, voice-to-vault flow, plus the three deferred items listed above (layout JSX split, vault undo snackbar, cross-platform click-through).
