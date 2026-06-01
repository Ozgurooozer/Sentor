# Vault Roadmap — MVP to Goal

Order matters. Each phase builds on prior; phase exit criteria must pass before advancing.

**Goal:**

> Every agent reads their own office first. User "What is Coder doing?" → office card opens. After meetings, template completion + vault auto-index + searchable. Each agent's RAG isolated from others. No decision date loss.

---

## Phase 0 — Cleanup (1 day)

Remove vault noise; index quality depends on it.

- Delete `vault/Interaction Log/`
- Decide: 6 prototype dirs → keep/archive/delete. User call required.
- Mark `vault/archive/` read-only (indexer skip)
- Move `.index/Flowise` out of vault index or delete

**Exit:** Indexer runs, only intentional pages listed. Search "sentor" → no prototype variants (or all by user choice).

---

## Phase 1 — Indexer & Embedder Infra (3 days)

Agent office concept needs flexible indexer + scope filter.

- `tools/indexer.py` flexible depth: `len(parts) != 3` removed
- `TYPE_RULES` table + `scope` derivation (agent:vault, etc.)
- `tools/embedder.py` incremental SHA1 comparison
- API `?scope=&include=` parameters
- Tests extended (new fields + scope filter)

**Exit:** Pages indexed with type/scope. Embedder 2nd run skips unchanged. `GET /api/semantic?scope=agent:vault` returns only agent-scoped content.

---

## Phase 2 — Agent Office Skeleton (2 days)

Seed vault with office structure; no Tauri yet.

- `vault/templates/` with agent-state, meeting-notes, decision-record templates
- `vault/agents/{vault,coder,sentor-maker,sentor}/` with seed index.html, profile.md, state.md, log.md
- Re-index; `pages.json` shows 4 agent-profile + 4 agent-state records

**Exit:** IDE Vault Browser opens `vault/agents/vault/`, office card renders. `GET /api/agent/vault` returns state + empty log.

---

## Phase 3 — Tauri Agent Commands (3 days)

Agents write their own offices safely.

- `vault_agent_log(agent, event, msg)` — append-only, format controlled, secret check
- `vault_agent_state_update(agent, patch)` — YAML frontmatter + user block merge
- `vault_get_note_titles`, `vault_get_backlinks`, `vault_get_similar_notes` (stub → real)
- Write-guard: `check_no_secrets(msg)` denies API keys, passwords

**Exit:** Frontend invokes → log appends. State file untouched user section. Secret blocks error.

---

## Phase 4 — Watcher + Auto-Reindex (2 days)

Manual `python tools/indexer.py` calls end.

- `notify` crate file watcher on `vault/**`
- 5s debounce → `Command::new("python")` indexer.py + embedder.py
- Tauri event: `vault:reindexed { changed: [...] }`
- Frontend AI cache invalidate, iframe reload

**Exit:** Edit vault file → 6s later, search reflects. 100 writes → single re-index (debounce proof).

---

## Phase 5 — Frontend: Office Tab + Switcher (3 days)

User-facing now.

- New tab kind: `agent-office`
- `Ctrl+Shift+A` → modal switcher → Open Office
- Status bar: active agent + phase mini
- Header "Office" button → current agent's office

**Exit:** Ctrl+Shift+A → pick Vault → office card opens <150ms. New log entry → 6s refresh.

---

## Phase 6 — Agent Self-RAG (2 days)

Agents remember their office.

- `vault_self_context()` tool — reads state.md + recent log + active project
- Agent loop: auto-call before user turn (silent)
- Vault agent "What are we working on?" → state.md answer, no system prompt peek
- Tool scope: `vault_search(..., scope="agent:vault")`

**Exit:** Vault agent knows current project. Coder knows last file. `vault_search` filters per-scope.

---

## Phase 7 — Meeting Flow (2 days)

Meetings structured, auto-linked, findable.

- Slash cmd: `/meeting {topic}`
- Copies template → `vault/meetings/{YYYY-MM-DD}-{slug}/index.html`
- Editor opens
- Save → `vault_write` + agent logs updated
- Auto-index

**Exit:** `/meeting vault-plan` → editor. Save → search finds it. Agent offices log entry added.

---

## Phase 8 — Section-level Chunking (2 days, Opsiyonel)

Only if MVP search recall < 70% on long meetings.

- `tools/embedder.py` `chunk_strategy: "page" | "section"`
- H2 boundaries for meetings/agent-logs
- Record ID: `agents/vault/meetings/...#chunk-3`

---

## Phase 9 — Graph + Visualization (3 days, Opsiyonel)

Backlink panel grouping, graph colors by type, office backlinks.

---

## Phase 10 — Usage Data (Sonraki çeyrek)

Vault grows; report on least-used, recommend archives.

---

## Exit Criteria — MVP Complete

Five scenarios pass:

1. **"Coder status?"** → Ctrl+Shift+A → Coder → 150ms card open, project visible
2. **"Canvas decision?"** → Vault agent → scope search agent:vault → decisions.md found
3. **Post-meeting:** `/meeting canvas-review` → save → 6s search hit, logs updated
4. **Self-memory:** Vault: "pick up where we left off" → state.md answer + context
5. **Safety:** Agent writes key-containing log → write-guard error, file clean

**Tahmini toplam:** 18 gün MVP (single dev), parallelizable.
