# Sentor — Vault Prototype

> **Purpose — why this repository exists**  
> This project was built as a **job application prototype for Tremium Software**.  
> It is not a commercial product or a general-purpose IDE release. It exists to show that a **local-first knowledge vault** — with **semantic embeddings**, a **forum made of plain HTML pages**, and **MCP access for external AI tools** — can be implemented with minimal dependencies, flat files, and a clear separation between durable storage (the vault) and disposable UI experiments (the IDE).

**Repository:** [github.com/Ozgurooozer/Sentor](https://github.com/Ozgurooozer/Sentor)

The goal of this repository is to demonstrate a **local-first knowledge vault** with hybrid retrieval (keyword + semantic embeddings), a **forum implemented as plain HTML pages**, and **external AI access via MCP**. Everything outside the vault layer exists primarily as an **experimental test harness** — not as a finished product.

> **Platform:** Windows 10/11 · **Python 3.10+** · **Node.js 20+** · **Rust (Tauri v2, optional)**  
> **Optional:** [Ollama](https://ollama.com) with `all-minilm` for semantic search

---

## Scope: what is real vs. experimental

| Layer | Status | Purpose |
|-------|--------|---------|
| **Vault** (HTML pages, indexer, embeddings, search, forum) | **Core deliverable** | The system this prototype is meant to prove |
| **CLI, REST API, browser search UI, MCP vault tools** | **Stable supporting layer** | Exercise the vault without opening the IDE |
| **Desktop IDE** (Tauri + React) | **Experimental** | Manual testing, agent demos, vault read/write from chat |
| **Canvas, agents, terminal, web tabs, voice** | **Experimental** | Sandbox to stress-test vault retrieval and MCP integration |
| **CodeGraph** | **Experimental add-on** | Symbol index for the Coder agent when editing source code |

If you are reviewing this project: **start with the vault pipeline** (`tools/indexer.py`, `tools/embedder.py`, `tools/scoring.py`, `vault/forum/`). The IDE is a convenient shell around it, not the main claim.

For full documentation of the **experimental layer** (IDE, canvas, agents, CodeGraph, MCP canvas bridge, V3/Glass UI), see **[P_README.md](P_README.md)**.

---

## The Vault

### Source of truth

Every note is a plain file under `vault/`:

```
vault/{category}/{slug}/index.html
```

There is no database, no ORM, no migration layer. Pages open in any browser, diff cleanly in Git, and survive even if every other part of the project is removed.

```
vault/
  forum/          ← discussion threads (also vault pages)
  agents/         ← AI agent “offices” (state, logs, decisions)
  home/           ← project docs
  projects/       ← architecture notes
  ...
```

### Two-pass indexing

`tools/indexer.py` (Python stdlib only) scans `vault/` and writes:

| Output | Consumer |
|--------|----------|
| `.index/pages.json` | CLI, REST API, MCP server |
| `.index/pages.js` | Browser UI (`window.SENTOR_INDEX`, works over `file://`) |

**Pass 1** — parse each page: title, description, headings (h1–h3), body text (capped at 3000 chars), category, slug, local links. Markdown files under `vault/` (e.g. agent `state.md`) are indexed too.

**Pass 2** — resolve backlinks: which pages link to which.

Each record carries **type** and **scope** metadata (e.g. `vault`, `agent:vault`, `agent:coder`) so search can be filtered — agents can query their own office without seeing other agents’ data.

```bash
python tools/indexer.py
```

### Semantic embeddings (flagship feature)

`tools/embedder.py` converts each page into a **384-dimensional vector** using Ollama’s `all-minilm` model.

| Property | Detail |
|----------|--------|
| Storage | `.index/embeddings.json` |
| Incremental | SHA1 content hash — unchanged pages are skipped |
| Scope-aware | Each embedding inherits the page’s `scope` for filtered RAG |
| Degraded mode | If Ollama is unavailable, keyword search still works |

```bash
ollama pull all-minilm
python tools/embedder.py          # build / incremental update
python tools/embedder.py --force  # full rebuild
```

**Design choice:** Python stays zero-dependency (stdlib only). Embedding inference is delegated to Ollama instead of pulling a ~2 GB `sentence-transformers` stack via pip. See `vault/forum/ollama-embedding-lockin/` for the trade-off discussion.

### Hybrid search

Search logic lives in one shared module: `tools/scoring.py`. CLI, API, MCP, and IDE agents all use it.

**Keyword scoring:**

| Field | Weight |
|-------|--------|
| Title | 3× |
| Headings + description | 2× |
| Body | 1× |

**Semantic search:** cosine similarity between the query vector and stored page vectors (`GET /api/semantic` or local `.index/embeddings.json`).

**Hybrid mode (IDE `vault_search` tool):**

1. Run keyword search first (fast, offline).
2. If results are weak (< 3 hits or top score < 6), augment with semantic search.
3. Fallback chain: REST API → local embeddings file + live Ollama/LM Studio query embedding.
4. Merged results are tagged `keyword`, `semantic`, or `hybrid`.

Agents are expected to call `vault_search` before answering from memory, then `vault_read` for full page text. Writes go through `vault_write` with automatic backup to `.vault-trash/` before overwrite.

### The Forum

The forum is **not a separate application**. It is a vault category: `vault/forum/`.

1. Each thread is `vault/forum/{slug}/index.html`.
2. Category is encoded in meta: `<meta name="description" content="[arch] One-line summary">`.
3. Replies are static HTML blocks (`.reply` divs) in the same file.
4. `vault/forum/index.html` reads `.index/pages.js` and lists all forum pages.
5. After any write: `python tools/indexer.py` → the thread appears in the forum index.

**No database. No localStorage. No server-side forum logic.**

| Tag | Purpose |
|-----|---------|
| `arch` | Architecture decisions |
| `codeq` | Code quality, security, tech debt |
| `feature` | Feature requests and roadmap |
| `dev` | Stack, performance, implementation |
| `sohbet` | General discussion |

Because threads are vault pages, forum content is searchable with the **same hybrid pipeline** as everything else.

**Good starting points in the vault:**

- `vault/forum/sentor-vault/index.html` — vault & search deep dive
- `vault/forum/sentor-giris/index.html` — project overview
- `vault/forum/rehber/index.html` — forum how-to
- `vault/home/sentor-amaci/index.html` — product rationale

---

## MCP — how external AI connects to Sentor

`tools/mcp_server.py` is a **stdio Model Context Protocol server** (Python stdlib, zero dependencies). Any MCP client — Cursor, Claude Code, Continue, Cline — can connect without opening the IDE.

### Vault tools (IDE-independent)

These read directly from disk and work even when the desktop app is closed:

| Tool | What it does |
|------|----------------|
| `vault_search` | Keyword search over `.index/pages.json` |
| `vault_read` | Full plain text of one page by id (`category/slug`) |
| `vault_categories` | List category folders |
| `vault_pages` | Flat listing of all indexed pages |

Register in your MCP config:

```json
{
  "mcpServers": {
    "sentor": {
      "command": "python",
      "args": ["C:/Atlas OS/tools/mcp_server.py"],
      "env": { "SENTOR_VAULT_ROOT": "C:/Atlas OS" }
    }
  }
}
```

Start manually:

```bash
python tools/mcp_server.py
```

### Canvas tools (requires IDE running — experimental)

Canvas control uses a **file bridge**, not direct WebSocket coupling:

```
External MCP client
       │
       ▼
tools/mcp_server.py  ──writes──▶  .mcp-queue.json
                                       │
                                       ▼
                              IDE (Rust mcp_dequeue)
                              drains queue on file change
                                       │
                                       ▼
                              canvasStore (add/remove/connect panels)
```

- **Read path:** the IDE exports live canvas state to `.ide-state.json` on every change. MCP `canvas_get_state` reads this file.
- **Write path:** MCP appends commands to `.mcp-queue.json` (atomic write). The IDE’s `useMcpBridge` hook drains the queue and applies mutations.

Canvas MCP tools: `canvas_get_state`, `canvas_add_node`, `canvas_remove_node`, `canvas_connect`, `canvas_update_node`, `canvas_clear`, `canvas_screenshot`.

This split keeps vault access **IDE-independent** while still allowing external agents to drive the experimental canvas UI when the app is open.

### IDE logs (experimental)

`ide_get_logs` reads the IDE’s captured console stream from disk — useful when debugging agent behavior during vault tests.

---

## CodeGraph — symbol intelligence for the Coder agent

CodeGraph is an **experimental add-on** for navigating source code. It does **not** replace the vault; it complements it when the Coder agent needs to edit files in `ide/` or elsewhere in the workspace.

### How it works

```
node tools/codegraph_bridge.js "<workspace-path>"
         │
         ▼
HTTP server on localhost:4245
         │
         ▼
CodeGraph library → SQLite index at ide/.codegraph/codegraph.db
```

The bridge wraps the CodeGraph library (`modules/codegraph-0.7.10/`). On first run it indexes the workspace; later runs sync incrementally.

### Tools exposed to the Coder agent (IDE only)

| Tool | What it brings |
|------|----------------|
| `code_search` | Find symbols (functions, classes, methods, routes) by name — faster than grep |
| `code_explore` | Deep context for a topic: related symbols + source snippets in one call |
| `code_callers` | “Who calls this?” — direct callers without reading files |
| `code_callees` | “What does this call?” — outgoing dependencies |
| `code_impact` | Transitive blast radius before a refactor (callers of callers, depth 1–4) |
| `code_status` | Index health: file count, symbol count, sync state |

CodeGraph tools are **not** in the stdio MCP server — the index lives in the Node bridge process. Start the bridge before using them:

```bash
node tools/codegraph_bridge.js "C:/Atlas OS"
```

**What CodeGraph adds to the prototype:** vault answers “what do we know?” (notes, decisions, forum threads). CodeGraph answers “where is this implemented?” (symbols, call graph, impact). Together they let an agent research from the knowledge base and then navigate code safely — but CodeGraph remains experimental scaffolding for developer workflows, not part of the vault core.

---

## Architecture

```
vault/{category}/{slug}/index.html     ← source of truth
         │
tools/indexer.py                       ← parse, backlinks, type/scope
tools/embedder.py                      ← 384-dim vectors (Ollama all-minilm)
tools/scoring.py                       ← shared keyword scoring
         │
.index/pages.json                      ← keyword search
.index/embeddings.json                 ← semantic search
         │
├── cli/main.py                        ← terminal search & chat
├── api/server.py                      ← REST (port 4242, Bearer auth)
├── tools/mcp_server.py                ← MCP stdio (vault + canvas queue)
├── ui/index.html                      ← standalone Fuse.js search (no server)
│
└── ide/  (experimental test harness)
      ├── agents + vault/forum tools   ← hybrid search, write, forum CRUD
      ├── useMcpBridge                 ← .ide-state.json export + queue drain
      └── codegraph tools → :4245      ← symbol index (Coder agent)
```

---

## Quick start (for reviewers)

```bash
git clone https://github.com/Ozgurooozer/Sentor
cd Sentor

# 1 — Index the vault (required)
python tools/indexer.py

# 2 — Semantic search (recommended)
ollama pull all-minilm
python tools/embedder.py

# 3 — Try search from terminal
python cli/main.py search "vault embedding"

# 4 — REST API
python api/server.py
# GET http://localhost:4242/api/search?q=forum
# GET http://localhost:4242/api/semantic?q=embedding

# 5 — Browser search (no server)
# Open ui/index.html in a browser

# 6 — MCP (external AI client)
python tools/mcp_server.py

# 7 — IDE + CodeGraph (optional, experimental)
cd ide && pnpm install && npm run tauri dev
node tools/codegraph_bridge.js "C:/Atlas OS"
```

---

## CLI reference

```bash
python cli/main.py search "query"
python cli/main.py list [category]
python cli/main.py open category/slug
python cli/main.py serve [port]          # REST API on port 4242
python cli/main.py chat                  # terminal agent loop
```

---

## REST API

```
GET /api/search?q=&limit=&category=&scope=
GET /api/semantic?q=&limit=&scope=
GET /api/page/{category}/{slug}
GET /api/categories
GET /api/pages
```

Start: `python api/server.py` (default port 4242)

---

## What this prototype demonstrates

- **Flat-file knowledge base** — HTML as the database; Git-friendly, zero lock-in
- **Hybrid retrieval** — keyword first, semantic embeddings when needed; incremental embed pipeline with scope isolation
- **Forum without a backend** — threads are vault pages; one indexer, one search pipeline
- **MCP integration** — external AI clients read the vault over stdio; canvas mutations via a queue file bridge
- **CodeGraph (experimental)** — symbol search and call-graph tools for safe code navigation alongside vault RAG

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Search returns no results | Run `python tools/indexer.py` |
| Semantic search empty | Run `python tools/embedder.py` (requires Ollama + `all-minilm`) |
| MCP vault tools fail | Set `SENTOR_VAULT_ROOT` to the repo root; ensure `.index/pages.json` exists |
| Canvas MCP commands ignored | IDE must be running; check `.mcp-queue.json` is being drained |
| CodeGraph tools return `not_running` | Start `node tools/codegraph_bridge.js "<workspace>"` |
| Overwrote a vault page via AI | Previous version is in `.vault-trash/{category}/{slug}-{timestamp}.html` |

---

## Security

- The REST API (`localhost:4242`) is loopback-only and requires a Bearer token.
- The token is generated on first launch and stored at `~/.sentor/api-token`.
- See [docs/security.md](docs/security.md) for the full threat model.

---

## License

MIT — see [LICENSE](LICENSE)

Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
