# MCP Server Guide

Atlas OS exposes an MCP (Model Context Protocol) server for external AI tools (Claude Code, Cursor, Cline, Continue, etc.) to interact with the vault and canvas.

---

## Architecture: How It Works

```
AI Client (Claude Code, Cursor, Cline...)
        │
        │  stdio JSON-RPC
        ▼
tools/mcp_server.py          ← Python MCP server (zero deps)
        │
        ├── Vault read        → .index/pages.json  (live)
        ├── Log read          → vault/logs/{date}.json  (live)
        ├── Canvas read       → .ide-state.json  (live)
        └── Canvas write      → .mcp-queue.json  (queue)
                                      │
                                      │  Rust file watcher (notify crate)
                                      ▼
                              Atlas IDE (Tauri + React)
                              useMcpBridge hook → canvasStore
```

**Two directions:**

- **Read (instant):** MCP server reads disk files directly, IDE not required.
- **Write (queued):** Commands written to `.mcp-queue.json`. IDE watcher detects ~50ms, pushes to React store, canvas updates. IDE closed = commands queue up; IDE opened = all catch up.

---

## Tools

### Vault (IDE not required)

| Tool | What it does |
|---|---|
| `vault_search` | Keyword search in vault. Always call first before deep dives. |
| `vault_read` | Full content of one page (category/slug format). |
| `vault_categories` | List all category folders in vault. |
| `vault_pages` | Flat list of all pages (id, title, category). |

### IDE Logs (IDE must be open and running ≥ 3s)

| Tool | What it does |
|---|---|
| `ide_get_logs` | Read console logs: `console.error`, `console.warn`, uncaught errors, promise rejections, agent events. Supports `level` and `search` filters. |

### Canvas Read

| Tool | What it does |
|---|---|
| `canvas_get_state` | Current JSON snapshot of all nodes and wires. Call before mutations to learn IDs. |
| `canvas_screenshot` | PNG of primary display. Visually verify canvas state. |

### Canvas Write (IDE must be open)

| Tool | Parameters | What it does |
|---|---|---|
| `canvas_add_node` | `type`, `title`, `x`, `y`, `meta` | Add new panel. |
| `canvas_remove_node` | `id` | Remove panel by ID. |
| `canvas_connect` | `from_id`, `to_id`, `from_port`, `to_port`, `kind` | Draw wire between two panels. |
| `canvas_update_node` | `id`, `title`, `x`, `y`, `meta` | Update panel properties. |
| `canvas_clear` | — | Remove all unpinned panels. |

**`type` options:** `chat` · `agent` · `terminal` · `editor` · `web` · `filebrowser` · `input` · `sketch` · `note` · `checklist` · `gallery` · `header` · `canvas` · `pipeline` · `codegraph`

**`kind` options:** `data` (value transfer) · `context` (silent context) · `trigger` (execution signal)

---

## Canvas Wire System

Each panel type has named ports (Unreal Engine Blueprint style):

| Panel | Inputs | Outputs |
|---|---|---|
| `chat` | `context` (text), `data` (any), `trigger` | `response` (text) |
| `terminal` | `run` (trigger) | `output` (text) |
| `note` | — | `text` (text) |
| `editor` | — | `content` (text) |
| `agent` | `task` (text), `context` (text) | `result` (text) |

Port types: `text` · `image` · `json` · `trigger` · `any`  
Compatibility: `any` connects to all, others must match type.

---

## Typical Workflow

```
1. canvas_get_state          → Learn current node IDs
2. canvas_screenshot         → See visual state
3. canvas_add_node           → Add new panel
4. canvas_get_state          → Wait ~200ms, fetch new node's ID
5. canvas_connect            → Draw wire
6. canvas_screenshot         → Verify result
```

---

## Registration

Register in an MCP client config (e.g. `.mcp.json` for Claude Code):

```json
{
  "mcpServers": {
    "atlas-vault": {
      "command": "python",
      "args": ["/path/to/Atlas OS/tools/mcp_server.py"]
    }
  }
}
```

Restart IDE/editor. MCP client now has `vault_search`, `canvas_*`, etc. available.

---

## Limitations

- **Canvas write:** Requires IDE to be running. Commands queue if IDE closed.
- **IDE logs:** Requires IDE running ≥3s (initial boot takes time).
- **File access:** MCP server does not expose `fs_read_file` or `fs_write_file` — only vault read + canvas. For file edits, use the IDE's agent tools or manual editing.
