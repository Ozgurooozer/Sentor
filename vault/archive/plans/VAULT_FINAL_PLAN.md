# Vault — Final Revize Plan

**Statü:** Toplantı kapandı. Tur 4 revizyonları entegre edildi.
**Önceki dosyalar:** `VAULT_MEETING.md` (toplantı kayıt), `VAULT_ARCHITECTURE.md` (ilk spec), `VAULT_ROADMAP.md` (ilk plan).
**Bu dosya:** Çelişkileri çözer, gap'leri kapatır, uygulanacak nihai sıra ve spec.

---

## Tur 4 Sonrası Karar Konsolidasyonu

### Revize edilen kararlar

**K11 (revize) — Ofis kartı: hibrit HTML, generated blok**

```
<!-- generated:start -->
... indexer tarafından her re-index'te üretilir ...
<!-- generated:end -->

... bu satırlar kullanıcıya ait, indexer dokunmaz ...
```

Sebep: Toplantıda "düz statik HTML" kararıyla "watcher → re-index → iframe reload" akışı çelişiyordu. Çözüm: generated bloğu sınırla, dışındaki kullanıcı içeriğini koru. `state.md` ve `agent:start/end` ile aynı prensip — tutarlılık.

### Yeni kararlar

**K16 — `vault_agent_log` event=`decision` ise `decisions.md`'ye otomatik yapılandırılmış append yapar.**

```
vault_agent_log("vault", "decision", "section-level chunking seçildi. Sebep: ...")
  ↓
  log.md   → "2026-05-19T13:55 [decision] section-level chunking seçildi. Sebep: ..."
  decisions.md → ## D7 — section-level chunking ... + tarih + sebep
```

Sebep: Log embed edilmiyor, semantic search log'u göremez. Decisions.md embed ediliyor ama agent oraya elle yazmazsa boş kalır. Bu otomasyon "geçen hafta ne karar verdik" sorusunun cevaplanabilirliğini garanti eder. Tek çağrı, iki hedef — agent ayrı düşünmek zorunda değil.

**K17 — `vault_self_context(depth)` üç seviye, varsayılan `normal`, 300 token hedef.**

| Depth | İçerik | Token (yaklaşık) |
|---|---|---|
| `min` | state.md frontmatter | ~100 |
| `normal` (default) | frontmatter + log son 5 satır | ~300 |
| `full` | frontmatter + log son 10 + aktif proje decisions.md özeti | ~800 |

Sebep: Sıkıştırma olmadan agent loop başlangıcı sistem prompt'un yarısını yiyebilir. Üç katman agent'a esneklik bırakır, varsayılan güvenli.

**K18 — Embedder backend Ollama-only (`all-minilm`). Ollama yoksa keyword-only degraded mode.**

Sebep: Sentence-transformers ~2 GB indir + 5 dk setup; Atlas "sıfır bağımlılık" hedefiyle çelişir. Ollama tek komut (`ollama pull all-minilm`). Ollama kurulu değilse keyword search (TF-IDF) hâlâ çalışır, kullanıcıya tek satır uyarı: "Semantic search için: ollama pull all-minilm".

### Toplantı sonrası tespit edilen gap'ler (çözümleri)

**G1 — Artımlı indexer eksikti.** Artımlı embedder var ama indexer her çağrıda tüm vault'u tarıyor. 200 sayfa şu an hızlı, 2000'de yavaşlar. Çözüm: Watcher `--changed-files file1,file2,...` flag'i ile sadece değişenleri yeniden parse eder, mevcut `pages.json`'da o ID'leri günceller.

**G2 — `profile.md` sync trigger'ı belirsizdi.** "Build-time" denmişti ama hangi build? Çözüm: `tools/sync_profiles.py` ayrı script. Trigger: (a) `npm run tauri dev` öncesi pre-script, (b) elle `python tools/sync_profiles.py`. Watcher BU dosyayı izlemez (profile.md yerine kod kaynağı `lib/agents.ts` tek doğru kaynak).

**G3 — Watcher tüm `**/*.html` ve `**/*.md` izliyordu, çok geniş.** Çözüm: notify event'i dosya path'i ile geliyor — debounce buffer'ında biriktirilen değişen dosya listesi indexer'a `--changed-files` ile geçirilir. Faz 1'de artımlı indexer hazırlanıyorsa Faz 4 watcher buna doğrudan bağlanır.

**G4 — Ofis HTML render trigger'ı tanımsızdı.** Çözüm: `tools/render_office.py` ayrı script, `tools/indexer.py` sonunda çağrılır. Her agent için: `state.md` + `log.md` son N + açık projeler → template doldur → `<!-- generated -->` bloğunu güncelle. 30 satır Python.

---

## Final Spec — Net ve Uygulanabilir

### Dizin yapısı (final)

**Karar (kullanıcı):** Sentor agent built-in'lerden kaldırıldı. `prototypes/` artık vault dışı — kök dizinde ayrı sistem, 6 varyant alt klasör.

```
prototypes/                    # YENİ — vault dışı, ayrı sistem
├─ htlas/
├─ otlas/
├─ qtlas/
├─ taslak/
├─ tlas/
└─ atlas-root/

vault/
├─ home/                       # bilgi sayfaları
├─ projects/                   # proje belgeleri
├─ html/                       # teknik referans
├─ archive/                    # salt-okunur
│
├─ agents/                     # AGENT OFİSLERİ (Sentor YOK)
│  └─ {slug}/                  # vault, coder, atlas-maker
│     ├─ index.html            # hibrit HTML, generated blok + user blok
│     ├─ profile.md            # auto-sync, read-only (lib/agents.ts → buraya)
│     ├─ state.md              # snapshot, agent:start/end blok + user blok
│     ├─ log.md                # append-only chronological event log
│     ├─ decisions.md          # otomatik (K16) + manuel ekleme
│     └─ projects/
│        └─ {project}/
│           ├─ index.html      # proje agent gözünden özet
│           ├─ log.md
│           └─ decisions.md
│
├─ meetings/                   # global toplantılar
│  └─ {YYYY-MM-DD}-{slug}/
│
└─ templates/                  # search dışı (type: template, scope: meta)
   ├─ agent-state/state.md
   ├─ agent-office/index.html  # ofis kartı template'i (render_office.py kullanır)
   ├─ meeting-notes/index.html
   ├─ decision-record/         # K16 için kanonik decisions.md formatı
   └─ project-kickoff/
```

### Page metadata (her record)

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
  "content_hash": "sha1...",
  "path": "vault/agents/vault/projects/canvas-rewrite/index.html"
}
```

### Type / scope kuralları (final)

| Path | type | scope | Default search | Embed edilir |
|---|---|---|---|---|
| `home/**` | note | vault | ✅ | ✅ |
| `projects/**` | project | vault | ✅ | ✅ |
| `html/**` | reference | vault | ✅ | ✅ |
| `archive/**` | archive | vault | ❌ opt-in | ✅ |
| `agents/{a}/index.html` | agent-profile | agent:{a} | ✅ | ✅ |
| `agents/{a}/state.md` | agent-state | agent:{a} | ✅ | ✅ |
| `agents/{a}/log.md` | agent-log | agent:{a} | ❌ FT-only | ❌ |
| `agents/{a}/decisions.md` | agent-decisions | agent:{a} | ✅ | ✅ |
| `agents/{a}/projects/**` | agent-project | agent:{a} | ✅ | ✅ |
| `agents/{a}/meetings/**` | agent-meeting | agent:{a} | ✅ | ✅ |
| `meetings/**` | meeting | vault | ✅ | ✅ |
| `templates/**` | template | meta | ❌ | ❌ |

### Yazım koruması (write-guard)

**Secrets deny list:** OpenAI/GitHub/Slack patterns, PEM blokları.
**Path deny list:**
- `archive/**` — agent yazımı kapalı
- `templates/**` — sadece kullanıcı eli
- `agents/*/profile.md` — sadece `sync_profiles.py`
- `agents/*/log.md` — sadece `vault_agent_log` (atomik append)

**Blok protokolleri:**
- `<!-- agent:start --> ... <!-- agent:end -->` → state.md, ofis kartı user-managed alanlar
- `<!-- generated:start --> ... <!-- generated:end -->` → ofis kartı render_office.py tarafından üretilen alan

---

## Fazlandırılmış Plan (Final)

### Faz 0 — Temizlik (yürütülüyor)

**Kullanıcı kararları (alındı):**

1. **Sentor agent** → SİLİNDİ. Built-in liste 4 → 3 (Vault, Coder, Atlas-Maker).
2. **`prototypes/`** → vault dışına çıktı. Kök seviye `prototypes/` ayrı sistem, 6 varyant (htlas, otlas, qtlas, taslak, tlas, atlas-root) alt klasör olarak korunur.

**Aksiyonlar:**
- `vault/Interaction Log/` sil.
- `vault/prototypes/` → kök `prototypes/` taşı.
- `.index/Flowise-flowise-3.1.2/` — zaten yok (önceden temizlenmiş).
- Sentor `BUILTIN_AGENTS`'tan kaldır (`ide/src/modules/ai/lib/agents.ts`).
- `archive/` salt-okunur işareti Faz 3'te Rust guard.rs'e taşınır.

**Çıkış kriteri:** Indexer çalıştığında sadece kasıtlı vault sayfaları listede; prototypes ve Interaction Log artık index'te yok. Sentor agent UI listesinde yok.

---

### Faz 1 — Indexer & Embedder Altyapı (3 gün)

**Sıra:**

1. **`tools/indexer.py`** esnek derinlik + tip türetimi
   - `len(parts) != 3` koşulu kalkar
   - `TYPE_RULES` tablosu (yukarıdaki tabloya birebir)
   - `frontmatter`, `content_hash` alanları
   - Markdown parser (stdlib + ~30 satır regex)
   - **Yeni: `--changed-files f1,f2,...` flag'i (G1)** — verilen dosyaları parse eder, mevcut `pages.json`'daki ID'leri günceller, dokunulmayanlara dokunmaz

2. **`tools/embedder.py`** artımlı + Ollama-only
   - SHA1 hash karşılaştırması (`content_hash` field)
   - `scope`, `type` her record'da
   - `search(query, scope=, exclude_types=)`
   - **K18:** Ollama yoksa `search()` empty döner + stderr uyarı. CLI mode'da "ollama pull all-minilm" mesajı.

3. **`api/server.py`** scope parametresi
   - `/api/search?q=&scope=&include=`
   - `/api/semantic?q=&scope=`
   - `/api/page/{*path}` esnek derinlik
   - **Yeni: `/api/agent/{slug}`** snapshot endpoint (state + son N log + açık projeler)

4. **Test:** `tools/test_api.py` genişletilir — type/scope filtreleri, artımlı indexer, agent snapshot.

**Çıkış kriteri:**
- `python tools/indexer.py` 0'dan tüm vault'u indeksler, tipleri doğru.
- `python tools/indexer.py --changed-files vault/home/atlas-os/index.html` sadece o dosyayı yeniden parse eder, diğerlerine dokunmaz (mtime kanıt).
- `python tools/embedder.py` ikinci çağrıda 0 sayfa re-embed.
- `GET /api/semantic?q=canvas&scope=agent:vault` sadece o scope'tan döner.

---

### Faz 2 — Templates + Agent Ofis Seed (2 gün)

**Sıra:**

1. `vault/templates/` oluştur:
   - `agent-state/state.md` (frontmatter + agent:start/end bloklu iskelet)
   - `agent-office/index.html` (generated bloklu ofis kartı template'i — render_office.py kullanır)
   - `meeting-notes/index.html`
   - `decision-record/index.html` (K16 için kanonik format)
   - `project-kickoff/index.html`

2. **`tools/sync_profiles.py`** yaz (G2):
   - `ide/src/modules/ai/lib/agents.ts` parse et (regex veya basit AST)
   - Her built-in agent için `vault/agents/{slug}/profile.md` üret (üstte "auto-generated" yorumu)

3. **`tools/render_office.py`** yaz (G4):
   - Her agent için state.md + log.md son 5 + açık projeler oku
   - `templates/agent-office/index.html` template'i doldur
   - `vault/agents/{slug}/index.html`'in `<!-- generated -->` bloğunu güncelle
   - Bloğun dışındaki kullanıcı içeriği dokunulmaz

4. Built-in agentler için seed ofis (script ile):
   - `vault/agents/vault/`, `coder/`, `atlas-maker/` (3 agent, Sentor silindi)
   - state.md (boş template, phase: ideation)
   - log.md (`{ISO} [start] ofis oluşturuldu`)
   - decisions.md (boş + K16 format başlığı)
   - profile.md (`sync_profiles.py` üretir)
   - index.html (`render_office.py` üretir)

5. Re-index + ofis kartlarının doğru render olduğunu doğrula.

**Çıkış kriteri:**
- IDE Vault Browser'da `vault/agents/vault/` açılır, ofis kartı render olur.
- `GET /api/agent/vault` 200 döner.
- Search "vault agent" → ofis kartı ilk 3'te.
- `python tools/sync_profiles.py` ikinci çağrıda dosyaları değiştirmez (idempotent).

---

### Faz 3 — Tauri Komutları + Write-Guard (3 gün)

**Sıra:**

1. `ide/src-tauri/src/modules/vault/` yeni modül:
   - `agent.rs`, `guard.rs`, `mod.rs`

2. `guard.rs`:
   - Secrets regex listesi (OpenAI/GitHub/Slack/PEM)
   - Path deny list fonksiyonu
   - `check_no_secrets(content) -> Result`

3. `agent.rs` komutları:
   - `vault_agent_log(agent, event, msg)`:
     - Atomik append (`OpenOptions::append(true)` + `fs2` lock veya temp+rename)
     - Format: `{ISO8601} [{event}] {msg}\n`
     - `check_no_secrets`
     - **K16:** event == "decision" ise paralel olarak `decisions.md`'ye yapılandırılmış blok append (sıradaki D-numarası + tarih + mesaj + boş "sebep/alternatifler/etki" template alanları)
   - `vault_agent_state_read(agent)`
   - `vault_agent_state_update(agent, patch)`:
     - YAML frontmatter merge
     - `<!-- agent:start --> ... <!-- agent:end -->` arası içerik patch
     - Dışındakine dokunma
     - `check_no_secrets`

4. Mevcut `vault_write`'a `check_no_secrets` ve path deny list ekle.

5. `lib.rs` stub gerçekleştirme:
   - `vault_get_note_titles`, `vault_get_backlinks`, `vault_get_similar_notes`
   - `.index/pages.json` + `.index/embeddings.json` üzerinden çalışır
   - Frontend dublike implementasyonları silinir

**Çıkış kriteri:**
- `invoke("vault_agent_log", {agent:"vault", event:"decision", msg:"test karar"})` hem `log.md`'ye satır hem `decisions.md`'ye D-numaralı blok ekler.
- Aynı çağrı `sk-` ile başlayan token içeren mesaj için error döner, log'da `[blocked]` satırı.
- `vault_agent_state_update` user blok içeriğini silmez.
- `archive/` altına `vault_write` çağrısı reddedilir.

---

### Faz 4 — Watcher + Otomatik Re-index (2 gün)

**Sıra:**

1. `ide/src-tauri/src/modules/vault/watcher.rs`:
   - `notify` crate (Cargo.toml)
   - İzleme: `vault/**/*.{html,md}` ama `agents/*/profile.md` HARİÇ
   - 5 sn debounce buffer'ı: değişen dosyaların **listesi** tutulur
   - Debounce dolunca:
     - `python tools/indexer.py --changed-files {liste}` (G3 — artımlı)
     - `python tools/embedder.py` (artımlı, mtime+hash)
     - `python tools/render_office.py {etkilenen_agent_slug}`

2. Tauri event: `vault:reindexed { changed: [id...] }`

3. Frontend:
   - `ai/tools/vault.ts` cache invalidate
   - `agents-office/AgentOfficePane.tsx` iframe reload (etkilenen agent ise)

**Çıkış kriteri:**
- Kullanıcı `vault/home/atlas-os/index.html` elle düzenler → 6 sn'de search'te yansır.
- 100 ardışık yazım → 1 re-index (debounce).
- Watcher idle CPU < %1, aktif < %5.

---

### Faz 5 — Frontend: Ofis Sekmesi + Switcher (3 gün)

**Sıra:**

1. Yeni tab kind: `agent-office`
   - `modules/agents-office/AgentOfficeTab.tsx`
   - `AgentOfficePane.tsx` — asset:// iframe `vault/agents/{slug}/index.html`
   - **Custom React render YOK** — ofis kartı render_office.py tarafından üretildi, sadece iframe

2. `Ctrl+Shift+A` → `AgentSwitcher` modal:
   - Agent listesi (built-in + custom)
   - "Open Office" aksiyonu → yeni `agent-office` tab açar

3. Header: aktif agent için "Office" butonu

4. Status bar: aktif agent + faz mini göstergesi (state.md frontmatter'dan)
   - **Opsiyonel (Faz 6'ya bağlı):** token kullanım göstergesi

5. `vault:reindexed` event → iframe reload (changed listesinde aktif agent slug varsa)

**Çıkış kriteri:**
- `Ctrl+Shift+A` → agent seç → ofis sekmesi açılır.
- Ofis kartı < 150 ms render (Tauri devtools).
- Log'a satır eklendiğinde 6 sn içinde tab güncellenir.

---

### Faz 6 — Agent Self-RAG (2 gün)

**Sıra:**

1. `ai/tools/vault.ts` yeni tool: `vault_self_context(depth)`
   - depth ∈ {`min`, `normal`, `full`} — K17
   - Aktif agent slug otomatik (active agent context'ten)
   - Min: state frontmatter
   - Normal: + log son 5 satır
   - Full: + log son 10 + aktif proje decisions.md özeti (decisions.md'den ilk H2 + tek satır özet)

2. `ai/lib/agent.ts` loop başlangıcında otomatik `vault_self_context("normal")` çağrılır, system message'a inject edilir (kullanıcı turu başlamadan, sessiz).

3. `vault_search` ve `vault_semantic` tool'larına `scope` parametresi.

4. Built-in agent instructions güncellenir:
   - Vault, Coder, Atlas-Maker: "Otomatik bağlam yüklendi. Detay için `vault_self_context(depth='full')`."

5. **Token bütçesi telemetrisi (opsiyonel):** `vault_self_context` döndüğü içeriğin yaklaşık token sayısını da döner. UI status bar bunu gösterir.

**Çıkış kriteri:**
- Vault agent'a "Ne üzerinde çalışıyorduk?" → state.md'den doğru cevap, sistem prompt'una elle yazılmadan.
- Coder'a "Geçen sefer hangi dosya?" → log'dan doğru dosya adı.
- `vault_search("canvas", scope="agent:vault")` sadece o scope.
- Normal depth ortalama < 350 token (10 örnek üzerinde).

---

### Faz 7 — Toplantı Akışı (2 gün)

**Sıra:**

1. Slash komut `/meeting {topic}`:
   - `templates/meeting-notes/index.html` kopyala
   - `vault/meetings/{YYYY-MM-DD}-{slug}/index.html` yaz
   - Editor'da aç

2. Save sonrası:
   - `vault_write` (write-guard'lı)
   - Aktif agent için `vault_agent_log(agent, "meeting", "vault/meetings/...")` (her katılan agent için)

3. Watcher otomatik tetiklenir.

4. (Bonus) `/decision {msg}` slash komut → aktif agent için `vault_agent_log(agent, "decision", msg)` — K16 sayesinde decisions.md'ye yapılandırılmış blok düşer.

**Çıkış kriteri:**
- `/meeting vault-plan` → editor template ile açılır.
- Save → 6 sn'de search'te bulunur.
- İlgili agent ofislerinde log + (decisions varsa) decisions.md güncellenir.

---

### Final Çıkış Kriteri (Faz 0–7 sonrası)

5 senaryo eksiksiz çalışacak:

1. **"Coder ne yapıyor?"** → Ctrl+Shift+A → Coder → Office. < 150 ms.
2. **"Geçen hafta canvas için ne karar verdik?"** → Vault agent → `vault_search` scope `agent:vault` → decisions.md'den D-numarası + tarih.
3. **Toplantı:** `/meeting canvas-review` → template → save → 6 sn'de tüm ilgili ofislerde log + search.
4. **Self-RAG:** "Kaldığımız yerden devam" → `vault_self_context("normal")` → doğru projeye doğru yerden devam.
5. **Güvenlik:** API key içeren log denemesi → write-guard reddeder, `[blocked]` log girdisi, dosyada secret yok.

---

### Opsiyonel Fazlar (MVP sonrası, tetikleyiciye bağlı)

**Faz 8 — Section-level chunking:** Embedder search recall < %70 (10 sorgu testi) → devreye girer. Hedef tipler: meeting, agent-meeting, agent-project.

**Faz 9 — Graph & backlink renkler:** Vault > 100 sayfa olunca ofisler/projeler arası ilişkiler navigasyon problemine dönüşürse.

**Faz 10 — Kullanım datası + otomatik temizlik:** En az erişilen sayfa raporu, önerilen archive'lar. 3 ay aktif kullanım sonrası.

---

## Tahmini Süre

| Faz | Süre | Kümülatif |
|---|---|---|
| 0 (user gate) | 1 gün | 1 |
| 1 | 3 gün | 4 |
| 2 | 2 gün | 6 |
| 3 | 3 gün | 9 |
| 4 | 2 gün | 11 |
| 5 | 3 gün | 14 |
| 6 | 2 gün | 16 |
| 7 | 2 gün | 18 |

**MVP:** ~18 gün tek geliştirici (paralellik mümkün — Faz 1 ile 2 kısmen örtüşebilir).

---

## Yürütme Statüsü

| Faz | Statü | Notlar |
|---|---|---|
| 0 | ✅ Tamam | Sentor silindi, prototypes vault dışına çıktı, Interaction Log silindi |
| 1 | ✅ Tamam | `tools/indexer.py` v2 (esnek derinlik, segment-aware kurallar, MD, `--changed-files`) · `tools/embedder.py` Ollama-only + degraded mode · `api/server.py` scope params + `/api/agent/{slug}` + esnek `/api/page/{*path}` |
| 2 | ✅ Tamam | 5 template, `tools/sync_profiles.py` (idempotent), `tools/render_office.py` (generated blok korumalı), 3 agent ofisi seed (vault/coder/atlas-maker) + `vault-rewrite` proje sayfası |
| 3 (backend) | ✅ Tamam | `modules/vault/{mod, guard, agent, index_lookup}` · 7 yeni Tauri komutu · K16 otomatik decisions append · write-guard (secrets + path) · stub'lar gerçekleştirildi · cargo build temiz (0 uyarı) |
| 3 (frontend) | ⏳ Sıradaki | `ai/tools/vault.ts` yeni komutlara sarmalama, dublike implementasyonların silinmesi |
| 4 | ⏳ Bekliyor | Rust watcher (`notify` crate) + 5 sn debounce + `--changed-files` spawn + `vault:reindexed` event |
| 5 | ⏳ Bekliyor | `agents-office/` modülü · `AgentSwitcher` modal (Ctrl+Shift+A) · status bar mini göstergesi |
| 6 | ⏳ Bekliyor | `vault_self_context(depth)` 3 seviye · agent loop'a auto-inject |
| 7 | ⏳ Bekliyor | `/meeting` ve `/decision` slash komutları |

---

## Risk Tablosu (final)

| Risk | Erken sinyal | Geri dönüş |
|---|---|---|
| Indexer derinlik değişikliği eski sayfaları bozar | Faz 1 sonu pages.json eski sayfa eksik | Schema migration script yaz, eski format read-fallback |
| Artımlı hash collision | Aynı sayfa farklı hash | SHA1 → SHA256 |
| Watcher CPU yer | Idle %5+ | Polling fallback, 30 sn timer |
| Ofis kart render yavaş | Faz 5 > 300 ms | Inline kritik CSS, asset:// → data: URI dene |
| Self-RAG token şişer | Faz 6 ortalama > 500 token | Default depth `min`, log son 5 → son 3 |
| `render_office.py` user content'ini siler | Faz 2 testlerde silme | Blok marker eksikse bütün dosyayı atla, hata logla |
| `vault_agent_log` K16 ile decisions.md bozulur | Faz 3 concurrent test | Mutex lock decisions.md write'a |
| Ollama yokken UX kötü | Faz 1 kullanıcı geri bildirim | Settings'te "embed durumu" göstergesi + tek tık uyarı |
| Profile.md sync trigger kaçar | profile.md eski instructions ile | `tauri dev` pre-script + CI check |
