# Vault Meeting Decisions & Architecture

*Summary of key decisions from vault planning sessions.*

---

## Decision: Agent Office Structure

**Decided:** Each agent gets `vault/agents/{slug}/` with office card, state log, project tracking.

**Rationale:** Agents need persistent memory (state.md), event history (log.md), and project context visible to users and each other. HTML office card is readable + searchable without IDE.

---

## Decision: Hierarchical Indexing

**Decided:** Flexible depth paths, type + scope derivation from prefix, not strict 3-level structure.

**Rationale:** MVP started with vault/category/slug/(index.html). But agent offices are vault/agents/vault/state.md, meetings are vault/meetings/{date}/index.html. Rigid 3-level breaks. Flexible depth + type rules handle all.

---

## Decision: Embedded Model (Ollama all-minilm)

**Decided:** Semantic search via local Ollama all-minilm (384-dim vectors), not cloud API.

**Rationale:** Offline-first requirement. No API cost. Setup is one-liner: `ollama pull all-minilm`. Vector similarity scales to 50k pages on 8GB RAM.

---

## Decision: Zero Python Dependencies

**Decided:** Indexer, CLI, API, MCP all use Python stdlib only. No pip, no venv.

**Rationale:** Simplicity + portability. Single-file script installers. Users don't need to manage Python environments. Performance is adequate for current scale (hundreds of pages).

---

## Decision: MCP for External Tools

**Decided:** `tools/mcp_server.py` (stdio) lets Claude Code, Cursor, Continue, Cline browse vault + manipulate canvas.

**Rationale:** Atlas IDE can't be everywhere. MCP is the bridge. External assistants read-only access vault, queue canvas commands, wait for IDE to process.

---

## Decision: Canvas Blueprint Persistence

**Decided:** Canvas node layout → `vault/blueprints/{slug}/blueprint.json` + index.html.

**Rationale:** Reproducibility + sharing. Users save "recipes" (agent pipelines). Blueprint = portable workflow definition. Re-import anytime.

---

## Decision: Sentor as Agent Builder

**Decided:** Built-in Sentor agent reads canvas state, proposes agent definitions, gets user confirmation, calls `agent_spawn`.

**Rationale:** Can't hard-code every tool combo. User says "build research agent" → Sentor reads what's wired → suggests agent → user approves → agent created. Flexible + safe (confirmation gate).

---

## Decision: Canvas Wires Over File Links

**Decided:** Canvas data flow (Terminal → Chat wire) is separate from vault backlinks. Both exist; different purposes.

**Rationale:** Vault is knowledge graph (pages link pages). Canvas is execution graph (data flows through nodes). Two orthogonal systems working together.

---

## Known Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Two MCP servers conflict | Confusion, bugs | Consolidate (Faz N+2) |
| Ollama timeout hangs chat | UX blocking | Add 30s timeout + retry |
| Canvas bezier perf ↓ | Lag on many edges | Cache bezier geometry (Canvas Phase P4) |
| Sub-canvas nesting depth | Complexity | Limit to 3 levels |
| Agent tool spam | Token overflow | Tool whitelist + approval per-agent |

---

## Meeting Log

| Date | Topic | Outcome |
|---|---|---|
| 2026-05-19 | Vault office concept | Approve flexible indexing, agent state.md + log.md format |
| 2026-05-19 | Blueprint export | Approve vault/blueprints as source of truth |
| 2026-05-20 | Sentor agent-builder | Approve built-in Sentor + agent_spawn tool |
| 2026-05-21 | Canvas + Agent integration | Approve canvas_read_state tool family + Orkestra router |
| 2026-05-22 | Tech debt review | Consolidate MCP servers, fix timeouts, split layout JSX (Faz N+3) |
