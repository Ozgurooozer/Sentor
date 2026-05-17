# Atlas OS

A local-first second brain — personal knowledge base, AI IDE, and web browser in one desktop app.

## What it is

Atlas OS stores everything you know as HTML pages in `vault/`. An AI agent writes and retrieves them. You can search, browse, and chat — all offline, no cloud.

```
vault/{category}/{slug}/index.html   ← your knowledge, as HTML pages
```

Three jobs:

1. **Answer questions** using local AI (LM Studio + Ollama) — no API keys, no cloud
2. **Remember everything** as vault HTML pages — written by agents, searchable instantly
3. **Browse the web** with a real native browser built into the IDE

## Stack

| Layer | Tech |
|---|---|
| Desktop app | Tauri v2 (Rust backend, WebView2/WKWebView) |
| Frontend | React + Vite + Tailwind CSS v4 |
| Editor | CodeMirror 6 |
| Terminal | xterm.js + portable-pty |
| AI | Vercel AI SDK (`@ai-sdk/openai-compatible`) |
| Local providers | LM Studio `localhost:1234` · Ollama `localhost:11434` |
| Vault search | Keyword (TF-IDF) + semantic (384-dim embeddings via Ollama) |
| Web search | SearXNG JSON API (self-hosted or public instance) |
| Indexer | Python stdlib — zero dependencies |

## Quick Start

**Prerequisites:** Node.js, Rust toolchain, Python 3, a running LM Studio or Ollama instance.

```bash
# 1 — Clone
git clone https://github.com/YOUR_USERNAME/atlas-os
cd atlas-os

# 2 — Install IDE dependencies
cd ide && npm install && cd ..

# 3 — Index your vault (creates .index/)
python tools/indexer.py

# 4 — Launch (Windows)
atlas-ide.bat
```

Or run the IDE directly:

```bash
cd ide && npm run tauri dev
```

## IDE Features

| Feature | Description |
|---|---|
| **AI Chat** | Three agents: Vault (research), Atlas-Maker (writes vault pages), Coder (edits source files) |
| **Web tab** | Real browser using native WebView — no iframe X-Frame-Options limits |
| **Vault tab** | Local `asset://` vault pages in iframe — fast, same-origin |
| **Vault Home** | Startup search UI over your own knowledge base |
| **Editor** | CodeMirror 6 with syntax highlighting, vim mode, inline AI autocomplete |
| **Terminal** | PTY-backed xterm.js, multi-pane |
| **Explorer** | File tree with context menu, file icons |
| **Voice input** | Whisper-powered speech-to-text in chat |

## Vault

Vault pages are plain HTML files at `vault/{category}/{slug}/index.html`. The indexer reads them and writes `.index/pages.json` (for search) and `.index/embeddings.json` (for semantic search).

```bash
# Re-index after writing pages
python tools/indexer.py

# Generate semantic embeddings (requires Ollama with all-minilm)
ollama pull all-minilm
python tools/embedder.py
```

## CLI

```bash
python cli/atlas.py search "query"
python cli/atlas.py list [category]
python cli/atlas.py open category/slug
python cli/atlas.py serve [port]          # REST API on port 4242
python cli/atlas.py chat                  # terminal agent loop
```

## REST API

```
GET /api/search?q=&limit=&category=
GET /api/semantic?q=&limit=
GET /api/page/{category}/{slug}
GET /api/categories
GET /api/pages
```

Start: `python api/server.py` (default port 4242)

## Browser Search UI

Open `ui/index.html` directly — no server needed. Loads `window.ATLAS_INDEX` from `.index/pages.js`.

## Settings

Settings → Models: configure chat model ID and SearXNG URL.  
Settings → Preferences: workspace root, theme, keybindings.

AI providers must have CORS enabled (or run in dev mode where Vite proxies requests).

## Architecture

```
vault/{category}/{slug}/index.html   ← source of truth
         │
tools/indexer.py                     ← HTML parser → .index/
tools/embedder.py                    ← 384-dim vectors
         │
.index/pages.json                    ← keyword search
.index/embeddings.json               ← semantic search
         │
api/server.py                        ← REST API (stdlib, port 4242)
cli/atlas.py                         ← terminal CLI
ui/index.html                        ← browser search (Fuse.js, standalone)
ide/                                 ← Tauri v2 desktop app
  src-tauri/src/modules/
    fs/           ← file ops
    pty/          ← terminal emulator
    shell/        ← shell commands
    web.rs        ← web_search + web_fetch (SearXNG + reqwest)
    webview.rs    ← native child WebView commands (web_open/navigate/close)
    secrets.rs    ← OS keyring
  src/modules/
    ai/           ← agents, tools, chat store, transport
    browser/      ← Vault + Web browser panes, address bar, bookmarks
    editor/       ← CodeMirror pane
    explorer/     ← file tree
    terminal/     ← xterm.js pane
    vault-home/   ← Vault Home search tab
    tabs/         ← tab management
```

## Philosophy

- Local first — no cloud, no telemetry
- Zero Python dependencies — stdlib only for indexer, CLI, API
- Vault pages are plain HTML — readable by any browser, not locked in
- Fewer lines > more lines

## License

MIT
