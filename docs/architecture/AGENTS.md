# Agents Reference (AGENTS.md)

## Built-in Agents

| Agent | Role | Tools | Memory |
|---|---|---|---|
| **Vault** | Research + knowledge retrieval | vault_search, vault_read, vault_semantic | session |
| **Coder** | Source code editing + debugging | fs_*, edit_*, grep_* | session |
| **Sentor-Maker** | Vault HTML page writer | vault_write, vault_read | session |
| **Sentor** | Agent builder (canvas → agent def) | agent_spawn, blueprint_*, canvas_* | session |
| **Orkestra** | Agent orchestrator + router | agent_invoke, agent_list, sentor_trigger | ephemeral |

---

## Agent Lifecycle

```
agentsStore.agents[]
  ├─ builtIn: true/false
  ├─ memory: "session" | "ephemeral"
  ├─ toolset: string[] (tool whitelist)
  ├─ parentCanvasId: null (global) | string (canvas-scoped)
  └─ createdBy: "user" | "sentor" | "orkestra"
```

**Session memory:** Vault preserves conversations in `vault/agents/{slug}/sessions/{ts}.json`.  
**Ephemeral:** No history preserved.

---

## Tool Categories

### Vault Tools (search + read)
- `vault_search(query, limit, scope?, include?)`
- `vault_read(id)` — full page text
- `vault_semantic(query, limit, scope?)`
- `vault_categories()`, `vault_pages()`

### Canvas Tools (blueprint + execution)
- `canvas_read_state()` — current nodes, edges, agents
- `canvas_add_node(type, title, x, y, meta?)` — spawn new panel
- `canvas_remove_node(id)` — remove by ID
- `canvas_connect(fromId, toId, fromPort, toPort, kind)` — wire
- `canvas_screenshot()` — PNG of primary display
- `canvas_clear()` — remove all unpinned panels

### Agent Tools (lifecycle + discovery)
- `agent_list()` — all agents with capabilities
- `agent_invoke(id, prompt, context?)` — run child agent
- `agent_spawn(name, role, prompt, tools, memory?, baseAgentId?)` — create new

### Blueprint Tools (save + import)
- `blueprint_save(slug, name, description, selection?)` — persist canvas selection
- `blueprint_load(slug)` — instantiate in current canvas

### IDE Tools (read only)
- `ide_get_logs(level?, search?)` — IDE console logs
- `fs_list_dir(path)`, `fs_read_file(path)` — filesystem access
- `grep(pattern, path, regex?)` — pattern search

---

## System Prompts (Summary)

### Vault Agent
```
You are Vault, Sentor's research agent. Use vault_search for quick keyword hits,
vault_semantic for concept-based lookup. Always cite page IDs. When writing
decisions or meeting notes, call vault_write to persist.
```

### Coder Agent
```
You are Coder, Sentor's development agent. Use fs_* and edit_* tools to modify
source code. Always read before editing. Refactor incrementally, test after each
change. Use grep_* to navigate large codebases.
```

### Sentor-Maker Agent
```
You are Sentor-Maker, responsible for writing vault HTML pages. Follow the design
system in interface-setup/.interface-design/system.md. Inline all styles, no CDN
except Tailwind (CDN OK). Use vault_read to check templates. Call vault_write
only after user confirmation.
```

### Sentor Agent (Agent Builder)
```
You are Sentor, Sentor's Agent Builder. Read canvas state via canvas_read_state.
Propose a new agent in YAML format (name, role, tools, system prompt).
Ask for confirmation before agent_spawn. If user wires nodes in your sub-canvas,
save as blueprint_save when "Save Blueprint" is clicked.
```

### Orkestra Agent (Orchestrator)
```
You are Orkestra, Sentor's orchestrator. Classify user requests and route to
appropriate agent via agent_invoke. If no agent matches, offer to create one
via sentor_trigger. Support parallel agent execution + result aggregation.
```

---

## Key Facts

- **Zero deps (Python):** stdlib only for indexer, CLI, API, MCP. No npm/pip/venv.
- **Zero deps (browser):** Tailwind + Fuse.js via CDN in `ui/index.html`. Open directly with `file://`.
- **Scoring:** Shared in `tools/scoring.py`. Imported by `cli/main.py`, `api/server.py`, `tools/mcp_server.py` via `sys.path.insert(0, "tools/")`. Edit that one file.
- **API auth:** Bearer token at `~/.sentor/api-token` (generated on first launch).
- **MCP server:** `tools/mcp_server.py` — canonical stdio MCP server (vault + canvas + screenshot). Zero deps.
- **IDE:** Tauri v2, React + Vite + Tailwind CSS v4, CodeMirror 6, xterm.js. Three AI agents: Vault (research), Sentor-Maker (writes vault pages), Coder (edits source files). Local AI via LM Studio + Ollama (`@ai-sdk/openai-compatible`).
- **Design system:** Read `interface-setup/.interface-design/system.md` before UI changes. Dark theme (#0a0a0a→#111111→#1a1a1a→#222222), border-only depth (no box-shadow except `ring-2 ring-accent/40`), `system-ui` font, 150ms ease-out transitions.
- **CLAUDE.md** contains a detailed architecture reference. This file is the concise reference for agent setup and capabilities.

---

## Testing Quirks

- `tests/test_api.py` uses a **custom runner** (`test()` → global `_passed`/`_failed`), not pytest/unittest. Starts server in background thread on port 4299.
- `tools/test_ollama.py` and `tools/test_multiturn.py` require a running Ollama — not CI-safe.
