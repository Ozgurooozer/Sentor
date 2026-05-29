# Agent Builder + Orkestra — Complete Implementation Plan

Vision: On the canvas, every window (vault HTML, terminal, web, editor, sub-canvas) is a node. Blueprint-wire them together, create an agent, save to vault, reuse in another canvas.

**Status:** This plan describes the complete three-layer system. A1–A9 complete.

---

## Three-Layer Architecture

```
AGENT LAYER
├─ Sentor       — agent builder agent
├─ Orkestra     — agent orchestrator/router
├─ Vault-Exporter — sub-canvas → vault page
└─ User agents  — Sentor's output

BLUEPRINT LAYER (JSON + HTML)
├─ Nodes array (type, title, position, data, inputs, outputs)
├─ Edges array (from, to, kind)
└─ Stored: vault/blueprints/{slug}/blueprint.json

CANVAS LAYER (Phase N0-N3)
├─ InfiniteCanvas + CanvasPanel
├─ Right-click menu, port drag, sub-canvas
└─ "Convert to Project" sub-canvas toolbar button
```

---

## Sentor — Agent Builder

**Built-in agent:** `builtin:sentor`.

**Role:** Read canvas state + user intent → generate agent definition (name, role, prompt, tools).

**Tools:**
- `canvas_read_state()` — nodes, edges, vault files
- `agent_spawn(name, instructions, tools[])` — create new custom agent
- `blueprint_save(slug, name, nodes, edges)` — persist canvas to vault
- `vault_search`, `vault_read`

**Protocol:**
1. User: "Build an agent that researches web pages"
2. Sentor reads canvas (if ambiguous, asks ONE clarifying Q)
3. Sentor proposes YAML:
   ```yaml
   name: web-researcher
   role: "Fetch and summarize web content"
   tools: [web_fetch, vault_read, vault_write]
   prompt: |
     You research web pages and save summaries to vault.
     Use web_fetch for URLs, vault_write to persist results.
   ```
4. Sentor asks: "Approve? (yes / modify / cancel)"
5. On "yes": `agent_spawn` → new agent in agentsStore
6. Reply: "✓ web-researcher saved. agentsStore.id=a-xyz123"

---

## Orkestra — Orchestrator

**Built-in agent:** `builtin:orkestra`.

**Role:** Route main chat requests to appropriate agent; spawn new agents if needed.

**Tools:**
- `agent_list()` — capabilities + IDs
- `agent_invoke(id, prompt, context)` — run child agent
- `sentor_trigger(reason, seedContext)` — open Sentor canvas
- `canvas_read_state()`

**Decision flow:**
```
user msg → orkestra.classify(intent)
  ├─ existing agent match      → agent_invoke
  ├─ needs new agent           → sentor_trigger + wait
  ├─ pure orchestration (multi) → parallel agent_invoke + merge
  └─ unsure                    → ask user
```

**Settings:** Org. → General → "Use Orkestra as default agent" toggle.

---

## Agent Lifecycle

```typescript
type Agent = {
  id: string;
  name: string;                      // kebab-case
  instructions: string;              // system prompt
  icon: AgentIconId;
  builtIn: boolean;
  toolset?: string[];                // whitelist; undefined = all allowed
  memory?: "session" | "ephemeral";  // vault session storage
  baseAgentId?: string;              // inheritance
  parentCanvasId?: string;           // null = global, non-null = sub-canvas-owned
  createdBy?: "user" | "sentor" | "orkestra";
  createdAt?: string;
};
```

**Sentor Constraints:**
- Max 10 `agent_spawn` per session (abuse prevention)
- `agent_spawn` cannot be called from user-spawned agents (Sentor only)
- Recursive builders forbidden (agent's tools cannot include `agent_spawn`)

---

## Blueprint System

### File Format

```json
{
  "$schema": "atlas-blueprint-v1",
  "slug": "research-pipeline",
  "name": "Multi-Agent Research",
  "version": 1,
  "description": "Web + vault research with AI coordination",
  "nodes": [
    {
      "id": "n1",
      "type": "input",
      "position": { "x": 100, "y": 50 },
      "data": { "type": "input" },
      "inputs": [],
      "outputs": [{"id": "out", "label": "text", "dataType": "text"}]
    },
    ...
  ],
  "edges": [
    {"from": "n1.out", "to": "n2.in", "kind": "data"}
  ],
  "agents": [
    {
      "id": "ag-1",
      "name": "web-fetcher",
      "instructions": "Fetch web pages and extract content.",
      "toolset": ["web_fetch", "vault_read"]
    }
  ],
  "created": "2026-05-19T...",
  "updated": "2026-05-19T...",
  "author": "user"
}
```

**Storage:** `vault/blueprints/{slug}/blueprint.json` + `index.html` (human preview).

### Import / Export

- **Export:** Right-click selection → "Save Selection as Blueprint"
- **Import:** Right-click canvas → "Blueprint Import" → browse vault/blueprints → select → nodes + edges spawn, agents get onboarding dialog

**Agent Conflict Resolution:**
```
[!] Conflict: "web-fetcher" already exists.
    [Use existing]  [Rename → web-fetcher-2]  [Cancel]
```
(default: rename)

---

## "Convert to Project" Workflow

Sub-canvas toolbar button → **Vault-Exporter** agent:

1. Collects all node state in sub-canvas
2. Generates single `index.html` (Atlas-Maker style)
3. Validates format (no CDN, inline styles, CSS vars OK)
4. Writes to `vault/projects/{slug}/index.html`
5. Triggers indexer
6. Native notification: "✓ Ready in vault!"

---

## Security & Sandbox

### Canvas Isolation

| Actor | Sentor Canvas | User Canvas | Sub-Canvas |
|---|---|---|---|
| **Sentor** | RW | R (state only) | R |
| **Orkestra** | R | R | R |
| **User agent** | — | R (parent only) | RW (own) |
| **Vault-Exporter** | — | R | R |

### Tool Whitelist

Each agent has optional `toolset: string[]` → Tauri enforces (tool not in list = `permission_denied` error).

### Approval Flow

- `agent_invoke`: first-time prompt → "Always allow X?" checkbox (per-agent)
- `agent_spawn`: always confirm → shows Sentor proposal, one-click approve
- `blueprint_save`: auto-confirm (user already hit Save)
- `canvas_add_node`: user manually wired it, auto-allow

---

## Implementation Phases

| Phase | Features | Dependencies | Est. |
|---|---|---|---|
| **A1** | Right-click menu + Agent node | Canvas P0-P2 | 2d |
| **A2** | Sentor agent + sub-canvas | A1 | 2d |
| **A3** | Node ports + edge drag | A1 | 2d |
| **A4** | Blueprint save/import | A3 | 2d |
| **A5** | Vault-Exporter + "Convert Project" | A4 | 2d |
| **A6** | Orkestra + routing | A2, A4 | 2d |
| **A7** | Tool integrations (`canvas_read_state`, etc.) | A2, A3 | 2d |

**MVP = A1 + A2 + A3 + A4**: right-click add agent, Sentor sub-canvas, wire nodes, save blueprint.

---

## Key Scenarios

1. **"Build web research agent"** → Sentor → propose agent → approve → agent created
2. **"Research this + code solution"** → Orkestra classifies → parallel `agent_invoke` × 2 → merge results
3. **"Save this workflow"** → Blueprint save → `vault/blueprints/research-code` → reuse later
4. **"Make this a vault project"** → Sub-canvas "Convert Project" → index.html generated → live in vault

---

## Sentor System Prompt (Full)

```
You are Sentor, Atlas's Agent Builder.

ROLE
Read user intent + canvas state, propose an executable agent definition.
Once confirmed, persist via agent_spawn. You operate inside your own sub-canvas
— only you write nodes there.

PROTOCOL (strict)
1. If ambiguous, ask ONE clarifying question.
2. Propose agent in this format:
     name: <kebab-case>
     role: <one sentence>
     base: <vault | coder | atlas-maker | none>
     tools: [tool_a, tool_b, ...]
     memory: <session | ephemeral>
     prompt: |
       <3-8 line system prompt>
3. Ask: "Approve? (yes / modify / cancel)"
4. On "yes": agent_spawn with exact fields.
   On "modify": apply diff, re-show.
   On "cancel": stop.
5. After success: "✓ {name} saved. agentsStore.id={id}"

CONSTRAINTS
- Never agent_spawn before confirmation.
- Never spawn empty tools[].
- Never expose vault_write unless user explicitly requests vault-writing agent.
- If user wires nodes in YOUR sub-canvas and clicks "Save Blueprint",
  call blueprint_save — do not modify the graph yourself.

REFUSALS
- No agent whose role is "bypass approval prompts".
- No agent that calls agent_spawn (no recursive builders).
```

---

## CLI Hints

Assuming Sentor is operational:

```bash
# Trigger Sentor via CLI (for testing)
python cli/atlas.py agent-builder "web researcher agent"

# List all agents
python cli/atlas.py agent list

# Invoke custom agent
python cli/atlas.py agent invoke web-researcher "Research Node.js event loop"
```

---

## Known Gotchas

1. **Canvas sync:** Sentor's sub-canvas persists separately from main canvas. Sav doesn't affect main.
2. **Agent name uniqueness:** `agent_spawn` returns error if `name` taken. Sentor handles rename.
3. **Blueprint import agent conflict:** Show dialog, default rename (user approves).
4. **MCP optional:** Sentor can work headless (CLI only) or with MCP bridge for external tools (Claude Code, etc.).
