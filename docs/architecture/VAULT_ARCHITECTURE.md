# Vault Architecture — Complete Specification

---

## 1. Directory Schema

```
vault/
├─ home/                       # information pages (current)
├─ projects/                   # project documentation (current)
├─ html/                       # technical reference (current)
├─ prototypes/                 # consolidated, see Roadmap Phase 0
├─ archive/                    # read-only, indexer skip
│
├─ agents/                     # NEW — agent offices
│  ├─ vault/
│  │  ├─ index.html            # office card (visible in search)
│  │  ├─ profile.md            # persona, sync with lib/agents.ts
│  │  ├─ state.md              # snapshot — current status
│  │  ├─ log.md                # append-only event log
│  │  ├─ projects/
│  │  │  └─ {project-slug}/
│  │  │     ├─ index.html      # project summary from agent's POV
│  │  │     ├─ log.md          # project-specific log
│  │  │     └─ decisions.md    # decisions + rationale
│  │  └─ meetings/
│  │     └─ {YYYY-MM-DD}-{slug}/
│  │        └─ index.html
│  ├─ coder/
│  ├─ atlas-maker/
│  └─ sentor/
│
├─ meetings/                   # NEW — global meetings (outside agent office)
│  └─ {YYYY-MM-DD}-{slug}/
│     └─ index.html
│
└─ templates/                  # NEW — excluded from search
   ├─ decision-record/index.html
   ├─ meeting-notes/index.html
   ├─ project-kickoff/index.html
   └─ agent-state/state.md     # state.md template (copied)
```

---

## 2. Page Types (`type`) and Scopes

Indexer derives type from path prefix:

| Path prefix | `type` | `scope` | Search default |
|---|---|---|---|
| `home/*` | `note` | `vault` | ✅ |
| `projects/*` | `project` | `vault` | ✅ |
| `html/*` | `reference` | `vault` | ✅ |
| `prototypes/*` | `prototype` | `vault` | ✅ |
| `archive/*` | `archive` | `vault` | ❌ (opt-in) |
| `agents/{a}/index.html` | `agent-profile` | `agent:{a}` | ✅ |
| `agents/{a}/state.md` | `agent-state` | `agent:{a}` | ✅ |
| `agents/{a}/log.md` | `agent-log` | `agent:{a}` | ❌ (FT only) |
| `agents/{a}/projects/*` | `agent-project` | `agent:{a}` | ✅ |
| `agents/{a}/meetings/*` | `agent-meeting` | `agent:{a}` | ✅ |
| `meetings/*` | `meeting` | `vault` | ✅ |
| `templates/*` | `template` | `meta` | ❌ |

**Search API rules:**
- If no `?scope=` → excludes `type ∈ {template, agent-log}` and `scope = meta`
- If `?scope=agent:vault` → only that scope
- If `?include=archive` → `scope=vault` + archives included

---

## 3. File Formats

### 3.1 `agents/{agent}/state.md`

```markdown
---
agent: vault
updated: 2026-05-19T14:00:00
active_project: canvas-rewrite
phase: design                  # ideation | design | build | review | done | blocked
next_action: "Ask user for chunking approval"
blockers: []
open_projects:
  - canvas-rewrite
  - embedder-incremental
---

<!-- agent:start -->
## Current Context

Canvas rewrite in design phase. Three open decisions:
1. Chunking strategy (section-level vs sliding window)
2. Embedding namespace migration timeline
3. UI: office card single-click or sidebar

Waiting: user feedback (K3).
<!-- agent:end -->

<!-- Below this is user-owned, agent reads but does not delete. -->
```

### 3.2 `agents/{agent}/log.md` (append-only)

```markdown
# vault — event log

2026-05-19T13:42 [start] canvas-rewrite design phase opened.
2026-05-19T13:55 [decision] section-level chunking selected. Reason: prevents decision loss in topicization.
2026-05-19T14:00 [block]   waiting for user approval: K3 namespace migration.
2026-05-19T14:12 [meeting] vault/meetings/2026-05-19-vault-plan created.
```

**Format:** `ISO8601 [event-type] message` — one line, append-only, no overwrites.

`event-type` enum: `start | progress | decision | block | unblock | meeting | handoff | done | note`.

---

## 4. Indexer Changes (`tools/indexer.py`)

### 4.1 Flexible Depth

**Old rule:** `len(parts) != 3` → skip.  
**New rule:** At least 2 parts, path ending with `index.html`. ID = path segments joined with `/` (minus extension).

```python
def _parse_path(html_file: Path) -> dict | None:
    parts = html_file.relative_to(VAULT_DIR).parts
    if len(parts) < 2 or parts[-1] != "index.html":
        return None
    segments = list(parts[:-1])
    return {
        "id":       "/".join(segments),
        "category": segments[0],
        "depth":    len(segments),
        "segments": segments,
    }
```

### 4.2 `type` and `scope` Derivation

Implemented via glob patterns and lambda functions.

---

## 5. Embedder Changes (`tools/embedder.py`)

### 5.1 Incremental Re-embed

Only changed pages re-embedded (SHA1 comparison). Saves computation on large vaults.

### 5.2 Search Scope Filter

```python
def search(query, limit=5, scope=None, exclude_types=None, cli_backend=None):
    exclude_types = exclude_types or {"template", "agent-log"}
    records = _load()
    filtered = [
        r for r in records
        if r.get("type") not in exclude_types
        and (scope is None or r.get("scope") == scope)
    ]
    # ... return top matches
```

---

## 6. API Updates

`/api/search?scope=&include=` parameters for filtering by scope and including archived content.
