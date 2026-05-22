# Vault Roadmap — MVP'den Hedefe

Sıra önemli. Her faz bir öncekinin üstüne kurulur; faz çıktı kriterleri karşılanmadan sonraki faza geçilmez.

**Hedef tanımı (kuzey yıldızı):**

> Her agent açıldığında ilk işi kendi ofisini okumaktır. Kullanıcı "Coder ne yapıyor?" deyince ofis kartı tek tıkla açılır. Toplantı sonrası şablon doldurulup vault'a yazılır, otomatik indekslenir ve aranabilir. Her agent kendi RAG'ini diğer agent'ların verisinden izole sorgulayabilir. Hiçbir karar tarih kaybı olmadan saklanır.

---

## Faz 0 — Temizlik (1 gün)

Bu yapılmadan hiçbir kod değişikliği başlamaz. Vault'taki gürültü search kalitesini düşürür ve MVP testlerini bulanıklaştırır.

### Aksiyonlar

- `vault/Interaction Log/` sil.
- `vault/prototypes/` altındaki 6 dizini (`htlas`, `otlas`, `qtlas`, `taslak`, `tlas`, `atlas-root`) tek karar tur'unda incele:
  - **Korunacaklar** → `vault/prototypes/` altında kalır.
  - **Tarihi değeri olanlar** → `vault/archive/prototypes-2026q1/` altına taşınır.
  - **Çöp** → silinir (git history zaten korur).
- `vault/archive/old-home` aynen kalır, `archive/` salt-okunur olarak işaretlenir.
- `.index/Flowise-flowise-3.1.2/` dizini ne yapıyor orada? Vault index'i değilse `.index/` dışına taşı veya sil.

### Çıkış kriteri

- Indexer çalıştığında **sadece kasıtlı** sayfalar listede.
- Search "atlas" sorgusu için ilk 5 sonuçta hiçbir prototip varyantı yok (veya hepsi varsa kullanıcı bilinçli karar verdi).

### Açık soru (kullanıcıya)

`prototypes/` dizinindeki 6 varyanttan hangileri kalsın? Listeyi kullanıcı verene kadar bu faz tamamlanmaz.

---

## Faz 1 — Indexer & Embedder Altyapı (2–3 gün)

Agent ofisi konsepti, indexer derinlik desteği + scope filtresi olmadan çalışmaz. Önce bu.

### Sıra

1. **`tools/indexer.py`** esnek derinlik:
   - `len(parts) != 3` koşulu kaldırılır.
   - `TYPE_RULES` tablosu eklenir (bkz. `VAULT_ARCHITECTURE.md` §4.2).
   - `type`, `scope`, `depth`, `frontmatter` alanları her record'a yazılır.
   - Markdown desteği (stdlib + 30 satır regex; YAML frontmatter, headings, body).
2. **`tools/embedder.py`** artımlı:
   - SHA1 hash karşılaştırması.
   - `scope` ve `type` alanları embedding record'una yazılır.
   - `search(query, scope=, exclude_types=)` parametreleri.
3. **`api/server.py`** scope parametresi:
   - `/api/search?scope=&include=`
   - `/api/semantic?scope=`
4. **Test:** Mevcut `tools/test_api.py` genişletilir — yeni alanlar + scope filtresi.

### Çıkış kriteri

- `python tools/indexer.py` → tüm mevcut sayfaları + (manuel oluşturulmuş bir test agent ofisini) doğru `type`/`scope` ile indeksler.
- `python tools/embedder.py` ikinci çağrıda **0 sayfa** yeniden embed eder (artımlı çalıştığının kanıtı).
- API çağrısı: `GET /api/semantic?q=canvas&scope=agent:vault` sadece agent ofisinden döner.

---

## Faz 2 — Agent Ofis Iskeleti (2 gün)

Dört agent için ofis dizinleri oluşturulur. Henüz Tauri komutları yok — sadece statik içerik.

### Sıra

1. `vault/templates/` oluştur:
   - `agent-state/state.md` — frontmatter + bloklu içerik şablonu
   - `meeting-notes/index.html`
   - `decision-record/index.html`
   - `project-kickoff/index.html`
2. Her built-in agent için seed ofis:
   - `vault/agents/vault/`
   - `vault/agents/coder/`
   - `vault/agents/atlas-maker/`
   - `vault/agents/sentor/` (Sentor tutuluyor mu? açık soru → kullanıcıya)
3. Her ofiste:
   - `index.html` (kart şablonu, **manuel hazırlanır** — auto-render Faz 5'te)
   - `profile.md` (lib/agents.ts'ten kopya, üst yorumla "auto-synced, do not edit")
   - `state.md` (boş template; `phase: ideation`, `next_action: ""`)
   - `log.md` (tek satır: `2026-XX-XX [start] ofis oluşturuldu`)
4. `tools/indexer.py` ile re-index. `pages.json` içinde 4 yeni `agent-profile`, 4 `agent-state` record'u görünmeli.

### Çıkış kriteri

- IDE Vault Browser'da `vault/agents/vault/` açılır, ofis kartı render olur (asset://).
- `GET /api/agent/vault` 200 döner, state + boş log gösterir.
- Search "vault agent" → ofis kartı ilk 3 içinde.

---

## Faz 3 — Tauri Komutları + Write-Guard (3 gün)

Agent kendi ofisini yazabilmeli; yazımı güvenli olmalı.

### Sıra

1. `ide/src-tauri/src/modules/vault/` yeni modül:
   - `agent.rs` — `vault_agent_log`, `vault_agent_state_read`, `vault_agent_state_update`
   - `guard.rs` — `check_no_secrets`, hassas path listesi
   - `mod.rs` registry'e ekle
2. `vault_agent_log`:
   - `OpenOptions::append(true)` + dosya kilidi (`fs2` veya temp+rename pattern)
   - Format: `{ISO8601} [{event}] {msg}\n`
   - `check_no_secrets(msg)` kontrol
3. `vault_agent_state_update`:
   - Mevcut `state.md` oku
   - `<!-- agent:start -->` ile `<!-- agent:end -->` arası blok bul
   - Patch'i merge et (YAML frontmatter + bloklu içerik)
   - Dışındaki kullanıcı içeriği aynen yaz
   - `check_no_secrets` kontrol
4. Mevcut `vault_write` Tauri komutuna da `check_no_secrets` ekle.
5. `lib.rs`'teki stub'lar gerçekleştirilir:
   - `vault_get_note_titles`, `vault_get_backlinks`, `vault_get_similar_notes`
   - `.index/pages.json` ve `.index/embeddings.json` okur

### Çıkış kriteri

- Frontend'den `invoke("vault_agent_log", {agent:"vault", event:"note", msg:"test"})` log'a satır ekler.
- Aynı çağrı `sk-1234567890abcdef1234567890` içeren mesaj için error döner.
- `vault_agent_state_update` kullanıcının state.md'sine yazdığı yorumu silmez.

---

## Faz 4 — Watcher + Otomatik Re-index (2 gün)

Manuel `python tools/indexer.py` çağrıları biter. Agent her yazım sonrası fresh index'e güvenir.

### Sıra

1. `ide/src-tauri/src/modules/vault/watcher.rs`:
   - `notify` crate (`Cargo.toml`'a eklenir)
   - `vault/**/*.{html,md}` izlenir
   - 5 sn debounce
   - Debounce dolunca: `Command::new("python")` ile `tools/indexer.py` + `tools/embedder.py` arka planda
2. Bitince Tauri event: `vault:reindexed { changed: [id...] }`
3. Frontend tarafı:
   - `ai/tools/vault.ts` cache invalidate
   - `agents-office/AgentOfficePane.tsx` iframe reload
4. Embedder artımlı çağrı `--changed-only` flag'i ile çalışır (Faz 1 artımlı modunu kullanır).

### Çıkış kriteri

- Kullanıcı `vault/home/atlas-os/index.html` dosyasını elle düzenler → 6 sn içinde search sonuçlarında yansır.
- 100 ardışık yazım → tek re-index (debounce kanıtı).
- Watcher CPU < %1 idle, < %5 aktif yazım.

---

## Faz 5 — Frontend: Ofis Sekmesi + Agent Switcher (3 gün)

Şimdiye kadar her şey backend. Şimdi kullanıcı görebilsin.

### Sıra

1. Yeni tab kind: `agent-office`
   - `ide/src/modules/agents-office/AgentOfficeTab.tsx`
   - `AgentOfficePane.tsx` — asset:// iframe `vault/agents/{slug}/index.html`
2. Kısayol: `Ctrl+Shift+A` → `AgentSwitcher` modal (mevcut agent listesi + "Open Office" aksiyonu)
3. Status bar'a aktif agent + faz mini göstergesi (state.md frontmatter'dan)
4. Header'a "Office" butonu — aktif agent'ın ofisini açar.
5. Ofis kart HTML'ini **statik tutar** — dinamik render YOK. Yenileme: `vault:reindexed` eventinde iframe reload.

### Çıkış kriteri

- Kullanıcı Ctrl+Shift+A → Vault'a tıkla → ofis sekmesi açılır.
- Ofis kartı 150 ms altında render olur (Tauri devtools).
- Agent log'a yeni satır eklendiğinde sekme 6 sn içinde güncellenir.

---

## Faz 6 — Agent Self-RAG (2 gün)

Her agent açıldığında kendi ofisini "hatırlamalı".

### Sıra

1. `ai/tools/vault.ts` içinde yeni tool: `vault_self_context()`
   - Aktif agent slug'ını al
   - `vault_agent_state_read(slug)` + `log.md`'den son 10 satır + aktif proje özeti
   - Tek JSON döner, sistem mesajına inject olur
2. `ai/lib/agent.ts` içinde agent loop başlangıcında otomatik `vault_self_context` çağrılır (kullanıcı turu başlamadan önce, sessiz).
3. `vault_search` ve `vault_semantic` tool'larına `scope` parametresi eklenir.
4. Built-in agent instructions güncellenir:
   - **Vault:** "Önce `vault_self_context()` çağır. Sonra normal araştırma."
   - **Coder:** "Önce `vault_self_context()` çağır. Şu anki açık projeyi öğren."
   - **Atlas-Maker:** Aynı.
5. `lib/agents.ts` `instructions` build sırasında `vault/agents/{slug}/profile.md`'ye sync edilir (read-only file generation).

### Çıkış kriteri

- Vault agent'a "Şu an ne üzerinde çalışıyorduk?" sorulunca, sistem prompt'una bakmadan state.md'den doğru cevap döner.
- Coder'a "Geçen sefer hangi dosyaya dokunduk?" sorulunca log'dan doğru dosya adını söyler.
- `vault_search("canvas", scope="agent:vault")` sadece o agent'ın ofis içeriğinden döner; başka agent'ın projesi gözükmez.

---

## Faz 7 — Toplantı Akışı (1–2 gün)

Toplantı sonrası şablon doldurma süreci çalışır hâle gelir.

### Sıra

1. Slash komut: `/meeting {topic}` (mevcut `slashCommands.ts`)
2. Bu komut:
   - `vault/templates/meeting-notes/index.html` kopyala
   - `vault/meetings/{YYYY-MM-DD}-{slug}/index.html` olarak yaz
   - Editor'da aç
3. Toplantı bitince kullanıcı "save" deyince:
   - `vault_write` (write-guard'lı)
   - İlgili agent'ların ofisinde `log.md`'ye `[meeting] vault/meetings/...` satırı eklenir
4. Indexer/embedder watcher tarafından otomatik tetiklenir.

### Çıkış kriteri

- `/meeting vault-plan` → editor template ile açılır.
- Save sonrası 6 sn'de search'te bulunur.
- İlgili agent ofislerinde log girdileri görünür.

---

## Faz 8 — Section-level Chunking (Opsiyonel, 2 gün)

Yalnızca uzun toplantı notlarında "geçen hafta ne dedik" kalitesi düşükse devreye girer. MVP'de **yok**.

### Tetikleyici

Embedder search recall < %70 (manuel 10 sorgu üstünde test) → bu faz açılır.

### Sıra

1. `tools/embedder.py` — `chunk_strategy` parametresi:
   - `"page"` (default) — mevcut davranış
   - `"section"` — H2 sınırlarında böl, her chunk ayrı record
2. Sadece `type ∈ {meeting, agent-meeting, agent-project, agent-log}` için section-level.
3. Record ID: `agents/vault/meetings/2026-05-19-plan#chunk-3`
4. Search sonuç UI'sinde chunk varsa "Section: ..." göstergesi.

---

## Faz 9 — Graph & Görselleştirme (Opsiyonel, 3 gün)

Backlink panel + graph view zaten frontend modüllerinde mevcut. Bunlara ofis bağlantılarını ekle.

### Sıra

1. `modules/graph/` — node renkleri `type`'a göre:
   - `note`: gri
   - `agent-profile`: agent ikonu rengi
   - `agent-project`: turuncu
   - `meeting`: mavi
2. `modules/backlinks/` — paneli "by type" gruplayabilsin.
3. Ofis kartında küçük backlink göstergesi.

---

## Faz 10 — Kullanım Verisi & Otomatik Temizlik (Sonraki çeyrek)

Vault büyüdükçe gerçek kullanım datası birikecek. Bu fazda:
- En az erişilen sayfalar raporu (`pages.json` + access log)
- Önerilen archive'lar
- Boş `state.md` olan agent ofisleri uyarısı

Şu an erken. Veri olmadan tasarım kör olur.

---

## Bütünsel Çıkış Kriterleri (hedef hâli)

Aşağıdaki 5 senaryo eksiksiz çalışınca proje "tamam" sayılır:

1. **"Coder şu an ne yapıyor?"** → Ctrl+Shift+A → Coder → Office butonu. Ofis kartı 150 ms'de açılır, aktif proje + son aksiyon görünür.
2. **"Geçen hafta canvas hakkında ne karar verdik?"** → Vault agent'a sorulur → `vault_search` scope `agent:vault` → `decisions.md`'den ilgili D-numarası döner, link verilir.
3. **Toplantı sonrası:** `/meeting canvas-review` → editor açılır, template dolu → save → 6 sn'de tüm ilgili ofislerde log girdisi + search'te erişilebilir.
4. **Agent kendi belleğini hatırlar:** Vault agent'a "kaldığımız yerden devam" denir → `vault_self_context` ile state okunur, doğru projeye doğru yerden devam edilir.
5. **Güvenlik:** Agent yanlışlıkla API key içeren bir log yazmaya çalıştığında — write-guard error döner, blokken log'da `[blocked]` görünür, dosyada secret olmaz.

Bu beş senaryo geçmeden Faz 8/9/10'a geçilmez.

---

## Tahmini Toplam Süre

| Faz | Süre | Toplam |
|---|---|---|
| 0 | 1 gün | 1 |
| 1 | 3 gün | 4 |
| 2 | 2 gün | 6 |
| 3 | 3 gün | 9 |
| 4 | 2 gün | 11 |
| 5 | 3 gün | 14 |
| 6 | 2 gün | 16 |
| 7 | 2 gün | 18 |

**MVP (Faz 0–7):** ~18 gün tek geliştirici, paralelleştirilebilir kısımlar varsa daha kısa.
**Opsiyonel fazlar (8–10):** İhtiyaca göre, MVP sonrası ölçüm bazlı tetiklenir.

---

## Risk & Geri Dönüş Noktaları

| Risk | Erken sinyal | Geri dönüş |
|---|---|---|
| Indexer derinlik değişikliği eski sayfaları bozar | Faz 1 sonu pages.json eski sayfa eksik | Faz 1'i revert et, schema migration yaz |
| Artımlı embedder hash collision | Faz 1 sonu aynı sayfa farklı hash | SHA1 → SHA256 yükselt |
| Watcher CPU yer | Faz 4 idle %5+ | Polling fallback, notify yerine 30 sn timer |
| Asset:// iframe ofis kartı render yavaş | Faz 5 >300 ms | Inline HTML, asset:// yerine `data:` URI dene |
| Self-RAG context çok büyür, agent token bütçesini şişirir | Faz 6 ilk turda 2000+ token | Log son 10 yerine son 5, state özetleme |
| Section-level chunking false positive artırır | Faz 8 precision düşer | Page-level'a geri dön, scope filtresini güçlendir |
| Agent ofisi düz dosya çoklu agent yazımında bozulur | Faz 3 concurrency testleri | SQLite shadow tut, dosya soft-mirror olsun (son çare) |
