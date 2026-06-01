# Sentor

**A personal second brain with a built-in AI IDE.** Knowledge base + AI chat + web browser — works with any AI provider: local (LM Studio, Ollama) or cloud (OpenCode, any OpenAI-compatible API).

> **Platform:** Windows 10/11 64-bit · **Requirements:** 8 GB RAM · Python 3.10+ · Node.js 20+ · Rust toolchain · *(Optional)* Ollama for semantic search

## What it is

Sentor stores everything you know as HTML pages in `vault/`. AI agents write and retrieve them. You can search, browse, and chat — using whichever AI backend you prefer.

```
vault/{category}/{slug}/index.html   ← your knowledge, as HTML pages
```

Three jobs:

1. **Answer questions** using any AI — local (LM Studio, Ollama) or cloud (OpenCode, any OpenAI-compatible endpoint)
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
| AI providers | LM Studio · Ollama · OpenCode · any OpenAI-compatible endpoint |
| Vault search | Keyword (TF-IDF) + semantic (384-dim embeddings via Ollama) |
| Web search | SearXNG JSON API (self-hosted or public instance) |
| Indexer | Python stdlib — zero dependencies |

## Installation (Windows)

**Recommended:** Download the latest installer from [Releases](../../releases/latest), run it, done. The first-run wizard walks you through four short steps: pick a vault folder, configure your AI provider, build the vault index, and optionally start SearXNG for web search.

**From source:**

```bash
# 1 — Clone
git clone https://github.com/Ozgurooozer/Sentor
cd Sentor

# 2 — Install IDE dependencies (requires pnpm)
cd ide && pnpm install && cd ..

# 3 — Index your vault (creates .index/)
python tools/indexer.py

# 4 — Launch (Windows)
sentor.bat
```

Or run the IDE directly in dev mode:

```bash
cd ide && npm run tauri dev
```

### Optional: Semantic search (Ollama)

```bash
# Install Ollama from https://ollama.com/download/windows then:
ollama pull all-minilm
python tools/embedder.py
```

### Optional: Web search (SearXNG via Docker)

```bash
docker run -d -p 8888:8080 --name searxng searxng/searxng
```

## IDE Features

| Feature | Description |
|---|---|
| **AI Chat** | Five agents: Vault (research), Sentor-Maker (writes vault pages), Coder (edits source files), Orkestra (coordinator), Vault-Exporter |
| **Web tab** | Real browser using native WebView — no iframe X-Frame-Options limits |
| **Vault tab** | Local `asset://` vault pages in iframe — fast, same-origin |
| **Vault Home** | Startup search UI over your own knowledge base |
| **Editor** | CodeMirror 6 with syntax highlighting, vim mode, inline AI autocomplete |
| **Terminal** | PTY-backed xterm.js, multi-pane |
| **Explorer** | File tree with context menu, file icons |
| **Voice input** | Browser-native speech-to-text in chat (uses your OS / Chromium speech recognition; no audio leaves your machine on Windows) |

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
python cli/main.py search "query"
python cli/main.py list [category]
python cli/main.py open category/slug
python cli/main.py serve [port]          # REST API on port 4242
python cli/main.py chat                  # terminal agent loop
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

## MCP server (Claude Code, Cursor, Continue, …)

`tools/mcp_server.py` speaks the Model Context Protocol on stdio so any MCP
client can read your vault without opening the IDE.

Tools exposed: `vault_search`, `vault_read`, `vault_categories`, `vault_pages`.

Register in your client's MCP config (e.g. `.mcp.json` for Claude Code):

```json
{
  "mcpServers": {
    "sentor": {
      "command": "python",
      "args": ["C:/Sentor/tools/mcp_server.py"],
      "env": { "SENTOR_VAULT_ROOT": "C:/Sentor" }
    }
  }
}
```

Code-graph tools (`code_search`, `code_callers`, …) are still IDE-bound — the
graph index lives in the Tauri process. Use the in-IDE chat for those.

## Browser Search UI

Open `ui/index.html` directly — no server needed. Loads `window.SENTOR_INDEX` from `.index/pages.js`.

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
cli/main.py                         ← terminal CLI
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

- Your choice of AI — local or cloud, swap without rewriting prompts
- Zero Python dependencies — stdlib only for indexer, CLI, API
- Vault pages are plain HTML — readable by any browser, not locked in
- Fewer lines > more lines

## Troubleshooting

| Problem | Solution |
|---|---|
| "Ollama not found" | Install from [ollama.com/download/windows](https://ollama.com/download/windows), then `ollama pull all-minilm` |
| API server won't start | Check port 4242 isn't already used: `netstat -an \| findstr 4242` |
| Blank screen on launch | Check `~/.sentor/logs/` for errors; try Settings → Reset Window |
| Search returns no results | Run `python tools/indexer.py` to re-index the vault |
| Semantic search empty | Run `python tools/embedder.py` (requires Ollama) |
| SmartScreen warning on install | Click "More info" → "Run anyway" (installer is unsigned in early releases) |
| Accidentally overwrote a vault page via AI | The previous version is in `.vault-trash/{category}/{slug}-{timestamp}.html`. Backups older than 7 days are removed on next IDE launch. |
| Build fails on `ort-sys` with a "TLS feature must be configured" error | Make sure `Cargo.toml` has `ort = { version = "2.0.0-rc.9", features = ["tls-rustls"] }`. The `tls-rustls` feature is required from `ort-sys ≥ rc.10`. |

## Security

- The REST API (`localhost:4242`) and MCP server (`localhost:4244`) are **loopback-only** and require a Bearer token.
- The token is generated on first launch and stored at `~/.sentor/api-token` (permissions: 600).
- See [docs/security.md](docs/security.md) for the full threat model.

## License

MIT — see [LICENSE](LICENSE)

Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
