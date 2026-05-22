# Vault Mimarisi — Spec

Toplantı kararları (`VAULT_MEETING.md`) sonrası somut yapı.
Bu dosya **ne yapılacağı**nı söyler, **nasıl yapılacağı** için kod örnekleri ve dosya formatları verir.

---

## 1. Dizin Şeması

```
vault/
├─ home/                       # bilgi sayfaları (mevcut)
├─ projects/                   # proje belgeleri (mevcut)
├─ html/                       # teknik referans (mevcut)
├─ prototypes/                 # konsolide, bkz Roadmap Faz 0
├─ archive/                    # salt-okunur, indexer skip
│
├─ agents/                     # YENİ — agent ofisleri
│  ├─ vault/
│  │  ├─ index.html            # ofis kartı (search'te görünür)
│  │  ├─ profile.md            # persona, lib/agents.ts ile sync
│  │  ├─ state.md              # snapshot — şu anki durum
│  │  ├─ log.md                # append-only event log
│  │  ├─ projects/
│  │  │  └─ {project-slug}/
│  │  │     ├─ index.html      # agent gözünden proje özeti
│  │  │     ├─ log.md          # bu projeye özel log
│  │  │     └─ decisions.md    # kararlar + gerekçeler
│  │  └─ meetings/
│  │     └─ {YYYY-MM-DD}-{slug}/
│  │        └─ index.html
│  ├─ coder/
│  ├─ atlas-maker/
│  └─ sentor/
│
├─ meetings/                   # YENİ — global toplantılar (agent ofisi dışı)
│  └─ {YYYY-MM-DD}-{slug}/
│     └─ index.html
│
└─ templates/                  # YENİ — search'ten hariç tutulur
   ├─ decision-record/index.html
   ├─ meeting-notes/index.html
   ├─ project-kickoff/index.html
   └─ agent-state/state.md     # state.md taslağı (kopyalanır)
```

### Silinecek

- `vault/Interaction Log/` — boş, kullanılmıyor.

### Salt okunur (write-guard)

- `vault/archive/**` — agent yazımına kapalı.

---

## 2. Sayfa Tipleri (`type`) ve Scope'lar

Indexer her sayfaya path prefix'inden tip türetir:

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

**Search API kuralı:**
- `?scope=` verilmezse → `type ∈ {template, agent-log}` ve `scope = meta` hariç tutulur.
- `?scope=agent:vault` verilirse → sadece o scope.
- `?include=archive` → `scope=vault` + arşiv dahil.

---

## 3. Dosya Formatları

### 3.1 `agents/{agent}/state.md`

```markdown
---
agent: vault
updated: 2026-05-19T14:00:00
active_project: canvas-rewrite
phase: design                  # ideation | design | build | review | done | blocked
next_action: "User'a chunking onayı için sor"
blockers: []
open_projects:
  - canvas-rewrite
  - embedder-incremental
---

<!-- agent:start -->
## Şu anki bağlam

Canvas yeniden yazımı tasarım fazında. Üç açık karar:
1. Chunking stratejisi (section-level vs sliding window)
2. Embedding namespace migration takvimi
3. UI: ofis kartı tek tıkla mı, sidebar mı

Bekleniyor: kullanıcı geri bildirimi (K3).
<!-- agent:end -->

<!-- Buradan aşağısı kullanıcıya ait, agent okumaz ama silmez. -->
```

### 3.2 `agents/{agent}/log.md` (append-only)

```markdown
# vault — event log

2026-05-19T13:42 [start] canvas-rewrite tasarım fazı açıldı.
2026-05-19T13:55 [decision] chunking section-level seçildi. Sebep: toplantı notlarında karar kaybını engeller.
2026-05-19T14:00 [block]   user onayı bekleniyor: K3 namespace migration.
2026-05-19T14:12 [meeting] vault/meetings/2026-05-19-vault-plan açıldı.
```

**Format:** `ISO8601 [event-type] mesaj` — tek satır, append-only, üstüne yazılmaz.

`event-type` enum: `start | progress | decision | block | unblock | meeting | handoff | done | note`.

### 3.3 `agents/{agent}/projects/{slug}/decisions.md`

```markdown
# Kararlar — canvas-rewrite

## D1 — Section-level chunking
**Tarih:** 2026-05-19
**Karar:** H2 başlıkları chunk sınırı.
**Sebep:** Sayfa-bazlı tek embedding uzun toplantı notlarında "geçen hafta ne dedik" sorgusunu kaçırıyor.
**Alternatifler:** Sliding window (reddedildi — chunk sınırı belirsiz, debug zor).
**Etki:** `embedder.py` chunk_strategy parametresi alacak.
```

### 3.4 `agents/{agent}/index.html` (ofis kartı)

Tek HTML, inline `<style>`, sistem tasarım token'ları. Dinamik veri yok — `state.md` + `log.md`'den **build-time** render edilir (indexer'a sonradan ekleme).

İskelet (MVP):
```html
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Vault Agent — Ofis</title>
  <style>
    :root { --bg:#0a0a0a; --surface:#111; --border:#2a2a2a; --text:#f5f5f5; --dim:#888; --accent:#5b8def; }
    body { background:var(--bg); color:var(--text); font-family:system-ui; padding:2rem; max-width:760px; margin:auto; }
    header { display:flex; gap:1rem; align-items:center; border-bottom:1px solid var(--border); padding-bottom:1rem; }
    .phase { color:var(--accent); font-size:0.85rem; }
    .row { border-bottom:1px solid var(--border); padding:0.6rem 0; }
    .dim { color:var(--dim); font-size:0.85rem; }
  </style>
</head>
<body>
  <header>
    <h1>Vault</h1>
    <span class="phase">design · canvas-rewrite</span>
  </header>

  <section>
    <h2>Sıradaki Aksiyon</h2>
    <p>User'a chunking onayı için sor</p>
  </section>

  <section>
    <h2>Son Olaylar</h2>
    <div class="row">14:12 · <a href="../../meetings/2026-05-19-vault-plan/">vault planı toplantısı</a></div>
    <div class="row">14:00 · <span class="dim">block</span> user onayı bekleniyor</div>
    <div class="row">13:55 · <span class="dim">decision</span> section-level chunking</div>
  </section>

  <section>
    <h2>Açık Projeler</h2>
    <div class="row"><a href="./projects/canvas-rewrite/">canvas-rewrite</a></div>
    <div class="row"><a href="./projects/embedder-incremental/">embedder-incremental</a></div>
  </section>
</body>
</html>
```

---

## 4. Indexer Değişiklikleri (`tools/indexer.py`)

### 4.1 Esnek derinlik

**Eski kural:** `len(parts) != 3` ise skip.
**Yeni kural:** En az 2 parça, `index.html` ile biten path. ID = `/`'la birleşmiş path (uzantı hariç).

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

### 4.2 `type` ve `scope` türetimi

```python
TYPE_RULES = [
    ("agents/*/index.html",            "agent-profile",  lambda s: f"agent:{s[1]}"),
    ("agents/*/state.md",              "agent-state",    lambda s: f"agent:{s[1]}"),
    ("agents/*/log.md",                "agent-log",      lambda s: f"agent:{s[1]}"),
    ("agents/*/projects/*/index.html", "agent-project",  lambda s: f"agent:{s[1]}"),
    ("agents/*/meetings/*/index.html", "agent-meeting", lambda s: f"agent:{s[1]}"),
    ("meetings/*/index.html",          "meeting",        lambda s: "vault"),
    ("templates/*/index.html",         "template",       lambda s: "meta"),
    ("archive/**",                     "archive",        lambda s: "vault"),
    ("home/**",                        "note",           lambda s: "vault"),
    ("projects/**",                    "project",        lambda s: "vault"),
    ("html/**",                        "reference",      lambda s: "vault"),
    ("prototypes/**",                  "prototype",      lambda s: "vault"),
]
```

### 4.3 Markdown desteği

`state.md`, `log.md`, `decisions.md` için minimal MD parser:
- YAML frontmatter çıkar
- `# heading` → headings listesi
- Geri kalan düz text (3000 char cap)

Bağımlılık eklemeden: stdlib + 30 satır regex yeterli. `pip install` yok.

### 4.4 Çıktı — `pages.json` her record:

```json
{
  "id": "agents/vault/projects/canvas-rewrite",
  "title": "Canvas Rewrite",
  "type": "agent-project",
  "scope": "agent:vault",
  "depth": 4,
  "frontmatter": { "phase": "design", "blockers": [] },
  "text": "...",
  "headings": [...],
  "links": [...],
  "backlinks": [...],
  "modified": "2026-05-19T14:00:00",
  "path": "vault/agents/vault/projects/canvas-rewrite/index.html"
}
```

---

## 5. Embedder Değişiklikleri (`tools/embedder.py`)

### 5.1 Artımlı re-embed

```python
def build_incremental(cli_backend=None):
    existing = _load_existing()              # {id: {hash, embedding}}
    pages = _load_pages()
    changed, kept = [], []
    for p in pages:
        h = hashlib.sha1(_page_text(p).encode()).hexdigest()
        prev = existing.get(p["id"])
        if prev and prev["hash"] == h:
            kept.append({"id": p["id"], "hash": h, "scope": p["scope"],
                         "type": p["type"], "embedding": prev["embedding"]})
        else:
            changed.append((p, h))
    new_vecs = _embed_all([_page_text(p) for p, _ in changed], cli_backend)
    for (p, h), vec in zip(changed, new_vecs):
        kept.append({"id": p["id"], "hash": h, "scope": p["scope"],
                     "type": p["type"], "embedding": vec})
    _save(kept)
```

### 5.2 Search scope filtresi

```python
def search(query, limit=5, scope=None, exclude_types=None, cli_backend=None):
    exclude_types = exclude_types or {"template", "agent-log"}
    records = _load()
    filtered = [
        r for r in records
        if r.get("type") not in exclude_types
        and (scope is None or r.get("scope") == scope)
    ]
    q_vec = _embed_query(query, cli_backend)
    scored = [(r["id"], cosine(q_vec, r["embedding"])) for r in filtered]
    scored.sort(key=lambda x: x[1], reverse=True)
    return [{"id": pid, "score": round(s, 4)} for pid, s in scored[:limit] if s > 0]
```

### 5.3 Chunking — Faz 2

MVP'de **sayfa-bazlı tek embedding** kalıyor.
Faz 2'de section-level: H2 sınırlarında böl, her chunk ayrı record (`id = "page#chunk-2"`). Sadece `type ∈ {meeting, agent-meeting, agent-project}` için aktif.

---

## 6. API Değişiklikleri (`api/server.py`)

Yeni/güncel endpoint'ler:

```
GET /api/search?q=&limit=&category=&scope=&include=
GET /api/semantic?q=&limit=&scope=
GET /api/agent/{slug}                       # ofis snapshot (state.md + son N log)
GET /api/agent/{slug}/log?since=&limit=
POST /api/agent/{slug}/log                  # atomik append (Tauri command'a paralel)
GET /api/page/{*path}                       # esnek derinlik
```

`/api/agent/{slug}` response:
```json
{
  "agent": "vault",
  "state": { "phase": "design", "active_project": "canvas-rewrite", ... },
  "recent_log": [ {"ts": "...", "type": "decision", "msg": "..."} ],
  "open_projects": ["canvas-rewrite", "embedder-incremental"],
  "recent_meetings": ["agents/vault/meetings/2026-05-19-vault-plan"]
}
```

---

## 7. Tauri Backend (`ide/src-tauri/`)

### 7.1 Yeni komutlar

```rust
// modules/vault/agent.rs
#[tauri::command]
async fn vault_agent_log(agent: String, event: String, msg: String) -> Result<(), String>;

#[tauri::command]
async fn vault_agent_state_read(agent: String) -> Result<AgentState, String>;

#[tauri::command]
async fn vault_agent_state_update(agent: String, patch: serde_json::Value) -> Result<(), String>;
```

**Atomicity:** `log.md`'ye append `OpenOptions::append(true)` + dosya kilidi (fs2 crate veya temp+rename).

**State update bloklu:** `<!-- agent:start -->` ile `<!-- agent:end -->` arası içeriği patch'le; dışındaki kullanıcı içeriği korunur.

### 7.2 Watcher

`modules/vault/watcher.rs` — `notify` crate.
- `vault/**/*.html`, `**/*.md` izlenir
- 5 sn debounce
- Debounce dolunca: `python tools/indexer.py` + `python tools/embedder.py` arka planda
- Bitince `vault:reindexed` event emit

### 7.3 Write-guard

```rust
const SECRET_PATTERNS: &[&str] = &[
    r"sk-[A-Za-z0-9]{20,}",
    r"ghp_[A-Za-z0-9]{36}",
    r"xox[abp]-[A-Za-z0-9-]+",
    r"-----BEGIN [A-Z ]+PRIVATE KEY-----",
];

fn check_no_secrets(content: &str) -> Result<(), String> {
    for pat in SECRET_PATTERNS {
        if Regex::new(pat).unwrap().is_match(content) {
            return Err(format!("blocked: pattern {} matched", pat));
        }
    }
    Ok(())
}
```

`vault_write` ve `vault_agent_log`'da çağrılır. Blok hâlinde error döner; UI'da kullanıcıya bildirilir.

### 7.4 Stub'ların gerçekleştirilmesi

Şu an `lib.rs`'te stub olan:
- `vault_get_note_titles` → indexer çıktısından title listesi döner
- `vault_get_backlinks` → `pages.json` backlinks alanı
- `vault_get_similar_notes` → embedder search wrapper (`scope` opsiyonel)

Frontend'in `ide/src/modules/ai/tools/vault.ts` tarafındaki dublike implementasyonlar silinecek; tek kaynak Rust olur.

---

## 8. Frontend (`ide/src/modules/`)

### 8.1 Yeni modül: `agents-office/`

```
modules/agents-office/
  AgentOfficeTab.tsx          # tab kind: "agent-office"
  AgentOfficePane.tsx         # iframe asset:// ofis kartına
  AgentSwitcher.tsx           # hızlı agent geçişi (Ctrl+Shift+A)
```

Tab'ın içeriği = `vault/agents/{slug}/index.html` asset:// iframe. Custom React render YOK (toplantı kararı K11).

### 8.2 AI tools (`ai/tools/vault.ts`)

Yeni tool'lar:
- `vault_search(query, {scope, limit, include_archive})` — scope parametresi
- `vault_agent_state_read(agent)` — kendi state'i
- `vault_agent_state_update(agent, patch)` — bloklu güncelleme
- `vault_agent_log(agent, event, msg)` — append
- `vault_self_context()` — kısayol: aktif agent için state + son 10 log + aktif proje özeti tek çağrıda

`vault_self_context()` agent loop başlangıcında otomatik çağrılır (system message'a inject). Agent her açılışta kendi ofisini "hatırlar".

### 8.3 Agent profile sync

`lib/agents.ts` içindeki `instructions` alanı tek doğru kaynak; build sırasında `vault/agents/{slug}/profile.md`'ye yazılır (read-only sync). Manuel düzenleme yapılmaz.

---

## 9. Hassas Path Listesi (write-guard)

Aşağıdaki path'lere `vault_write` veya `vault_agent_*` yazımı yasak:
- `vault/archive/**`
- `vault/templates/**` (sadece kullanıcı eli ile)
- `vault/agents/*/profile.md` (build-time sync)
- `vault/Interaction Log/**` (silinecek)

---

## 10. Performans Bütçeleri

| İşlem | Bütçe | Doğrulama |
|---|---|---|
| Ofis kartı render | <150 ms | Tauri devtools timeline |
| `vault_self_context()` | <300 ms | Console timing |
| `vault_search` scope'lu (200 record) | <80 ms | Server timing header |
| Artımlı re-embed (1 değişen sayfa) | <2 s | Indexer log |
| Watcher → UI cache invalidate | <6 s | E2E (5 sn debounce + 1 sn re-index) |

Aşan herhangi bir metrik **özellik durdurma** sebebi — geri dönülür, mimari sorgulanır.

---

## 11. Migration Notları

Mevcut `pages.json` formatı yeni alanlar eklenince **geri uyumlu**: eski alanlar (`id`, `title`, `text`, vs.) korunur; yeni alanlar (`type`, `scope`, `frontmatter`) optional. Eski API çağrıları çalışmaya devam eder.

Mevcut `embeddings.json` ise format değiştiriyor (`hash` alanı eklenir). İlk artımlı çalıştırma tüm sayfaları yeniden embed eder, sonrası artımlı. Tek-seferlik maliyet.
