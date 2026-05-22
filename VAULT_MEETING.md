# Vault Tasarım Toplantısı — 10 Uzman

**Tarih:** 2026-05-19
**Süre:** 3 tur
**Hedef:** Atlas OS vault'unu, agent ofis sistemini, RAG akışını ve MVP→hedef yolunu netleştirmek.
**Çıktı:** Bu MD (kararlar + sebepleri), `VAULT_ARCHITECTURE.md` (spec), `VAULT_ROADMAP.md` (faz planı).

---

## Katılımcılar

| # | Rol | Odak |
|---|---|---|
| 1 | **Kaan** — Bilgi mimarı (PKM) | Taksonomi, sayfa şeması, isimlendirme |
| 2 | **Mira** — Information retrieval mühendisi | Indexer, scoring, namespace'ler |
| 3 | **Theo** — ML/embeddings mühendisi | Chunking, vektör boyutu, scope filtresi |
| 4 | **Lior** — Agent sistemleri tasarımcısı | Agent ofis kontratı, yaşam döngüsü |
| 5 | **Ren** — UX/Frontend | Browser arayüzü, ofis görünümleri |
| 6 | **Sev** — Backend / Tauri/Rust | Dosya I/O, watcher, performans |
| 7 | **Devi** — Ürün yöneticisi | Kapsam disiplini, MVP çizgisi |
| 8 | **Olu** — DevOps / data | Re-index akışı, dosya değişiklik tetiklemesi |
| 9 | **Nia** — Güvenlik / mahremiyet | Local-only garanti, hassas içerik sınırı |
| 10 | **Joon** — Kullanıcı/PKM araştırmacısı | Gerçek kullanım, sürtünme noktaları |

---

## Açılış — Devi (PM)

> "Bir özellik turnası yapmayacağız. Şu üç soruya somut cevap istiyorum:
> **(a)** Vault Atlas OS'in tam olarak nesidir — IDE'nin yan klasörü mü, beyni mi? **(b)** Agent ofisi *gerçekten* hangi sorunu çözüyor, yoksa süslü dosya yapısı mı? **(c)** Bugün hangi MVP çizgisi çekilirse, 2 hafta içinde 'açılır ve işe yarar' diyebiliriz?
> Cevap veremediğimiz şeyi planlamayacağız."

---

## Tur 1 — Vault'un projedeki rolü

**Kaan:** Vault şu an üç farklı şeyin karışımı:
- Statik bilgi sayfaları (`home/atlas-os`, `html/html-quality`)
- Prototip oyun alanı (`prototypes/htlas`, `qtlas`, `tlas`…)
- Arşiv (`archive/old-home`)
Üçüncü bir rol ekliyoruz: **agent çalışma alanı**. Bu üç rolü tek dizinde tutabiliriz ama **birinci sınıf ayrım** lazım — yoksa search sonuçlarında prototip artıkları gerçek bilgiyi gömer.

**Joon:** Joker soru — kullanıcı hangi anda vault'a bakar?
1. "Daha önce X hakkında ne yazmıştım?" → search
2. "Bu agent şu an ne yapıyor?" → ofis durumu
3. "Geçen hafta canvas toplantısında ne karar vermiştik?" → toplantı arşivi
Bu üç soruyu **3 saniyenin altında** cevaplayamıyorsak yapı yanlış.

**Mira:** Şu anki indexer rigid: `category/slug/index.html` (tam 3 parça). Bu agent ofisinin alt-alt klasörlerini boğacak. Ya derinlik desteği eklenecek ya da agent içeriği ayrı bir index'e gidecek. **Tercih: tek index, çok derinlik, `type` alanı.**

**Lior:** Agent ofisi *sembol* değil, *kontrat* olmalı. Her agent'ın okuyup yazdığı **sabit dosya seti** lazım. Aksi hâlde her agent kendi konvansiyonunu uydurur ve search bunu öğrenemez.

**Sev:** Tauri tarafında vault zaten `asset://` üzerinden geliyor, yeni protokol gerekmez. Tek eklenecek: ofis dizinlerine **debounced file watcher** — agent kendi state.md'sini değiştirdiğinde otomatik re-embed.

**Theo:** 384-boyutlu MiniLM yeterli, model değişimi gerekmez. Ama **chunking** eksik — şu an sayfa başı tek embedding (title+desc+1000 char text). Ofis state'i için bu yeterli. Uzun toplantı notları için **section-level chunk** (h2 bazlı) lazım, yoksa "geçen toplantıda ne karar verdik" sorusu kaybolur.

**Nia:** Agent ofisi düz dosya = local-only garantili. Bir şart: ofis klasörlerinde **secrets/key bulunmamalı**. Agent kendi state'ini yazarken secret yazmasın diye **write-guard** (regex deny list) gerekli.

**Ren:** Browser'da üç görünüm gerek: **(1)** klasik vault sayfa görünümü (zaten var), **(2)** ofis dashboard'u (agent için son N olay, açık proje, son toplantı), **(3)** toplantı görünümü (yapılandırılmış template render'ı). Hiçbiri yeni framework getirmesin — düz HTML + minimum JS.

**Olu:** Re-index akışı şu an manuel + Phase C'de `vault_write` sonrası tetikleniyor. Agent ofisi sık değişeceği için **batch re-embed** (5 sn debounce) gerek, yoksa her küçük state güncellemesinde tüm embedding tablosu yeniden yazılır.

**Devi:** Toparlıyorum — şu kararları çıkarttık:
- ✅ Vault = bilgi + ofis + arşiv. Üç rol, **tek dizin, ayrık namespace**.
- ✅ Indexer derinliği esnek olacak, sayfa `type` alanı kazanacak.
- ✅ Agent ofis kontratı sabit dosya seti olacak.
- ✅ Chunking sadece toplantı/uzun notlarda devreye girecek.
- ✅ Write-guard secrets engelleyecek.

---

## Tur 2 — Agent Ofisi Spec

**Lior:** Ofis kontratı önerim:

```
vault/agents/{agent-slug}/
  index.html              ← ofis kartı (vault search'te görünür)
  profile.md              ← persona + instructions (lib/agents.ts ile sync)
  state.md                ← şu an açık proje + faz + bekleyen aksiyon
  projects/
    {project-slug}/
      index.html          ← projenin agent gözünden özeti
      log.md              ← chronological event log (append-only)
      decisions.md        ← kararlar (neden + ne zaman)
  meetings/
    {YYYY-MM-DD}-{slug}/
      index.html
  templates/
    project-kickoff.md
    decision-record.md
    meeting-notes.md
```

**`state.md` zorunlu alanlar:**
```yaml
---
agent: vault
updated: 2026-05-19T14:00
active_project: canvas-rewrite
phase: design
next_action: "User'a chunking stratejisi onayı için sor"
blockers: []
---
```

**Mira:** Bu yapı index'e iki şey katacak:
- Yeni `type`: `agent-profile`, `agent-state`, `agent-project`, `meeting`
- Yeni `scope` alanı: `agent:vault`, `agent:coder` vb.
Bu sayede agent kendi RAG'ini şöyle çağırır: `vault_search("canvas chunking", scope="agent:vault")`. Diğer agent'ların ofisini kirlenmeden tutar.

**Theo:** Embedding tarafında her record artık şunları taşıyacak:
```json
{ "id": "agents/vault/projects/canvas-rewrite", "scope": "agent:vault", "type": "agent-project", "embedding": [...] }
```
Search API `?scope=` parametresi alacak, default yok = tüm vault.

**Joon:** Bir uyarı — **append-only `log.md`** anahtar. Agent state'ini *üzerine yazarsa* tarih kaybolur. Bu olursa "geçen hafta hangi karar?" sorusunu cevaplayamayız. Log dosyası tarih damgalı satırlardan oluşmalı; state.md sadece "şimdiki durum" snapshot'u.

**Ren:** Browser tarafı — ofis kartı (`vault/agents/vault/index.html`) şunları göstermeli:
1. Üst: agent adı + ikon + son güncelleme
2. Aktif proje şeridi (state.md'den)
3. Son 5 log girdisi
4. Açık proje listesi (klikle proje sayfasına)
5. Son 3 toplantı
Tek HTML, inline style, mevcut design token'lar. Yeni bileşen yok.

**Sev:** Backend — yeni Tauri komutu gerekmez. Mevcut `fs` modülü yeterli. Tek eklenmesi gereken: **agent ofisine yazımı korumalı kanal** — `vault_agent_log(agent, line)` gibi atomik append. Aksi hâlde concurrent yazımlarda log bozulur.

**Olu:** Watcher kararı:
- `vault/agents/**/state.md` → değişirse o agent'ın scope'undaki embedding'leri 5 sn debounce ile re-embed
- `vault/agents/**/log.md` → re-index'e gerek yok (full-text aranır ama embed edilmez, çünkü append-only)
- `vault/agents/**/meetings/*/index.html` → normal re-index akışı

**Nia:** Write-guard deny list (minimum):
```
sk-[A-Za-z0-9]{20,}      # OpenAI-style
ghp_[A-Za-z0-9]{36}      # GitHub PAT
xox[abp]-[A-Za-z0-9-]+   # Slack
-----BEGIN .* PRIVATE KEY-----
```
Match olursa `vault_write` hata döner, log'a "[blocked]" yazılır.

**Kaan:** Bir mimari karar — `vault/agents/` mı, yoksa kök-seviye `vault/_agents/`? Underscore prefix vault sayfa listelerinden gizlemeyi kolaylaştırır. **Önerim: `vault/agents/` (underscore yok)** — çünkü kullanıcı ofisleri *görmeli*, gizlenmiş bir altyapı değil. Browser'da kategori dropdown'ında "Agents" net görünsün.

**Devi:** Bir itirazım var — *meeting template'leri* nereye? İki seçenek:
- (A) Her agent ofisinde kendi `templates/`
- (B) Ortak `vault/templates/`

**Lior:** Cevap hibrit: **ortak `vault/templates/`** (genel template'ler) + her agent isterse kendi `templates/`'ında override. Coder'ın "code review template'i" Atlas-Maker'a uymaz; ama "decision record" herkese uyar.

**Kabul:** Ortak şablonlar `vault/templates/{name}/index.html` (ve eşleşen `.md` taslak). Agent override'ları nadir, kullanılırsa local.

**Mira:** Template'ler index'e girmesin — `type: template` kazanır, default search'ten **hariç tutulur**. Yoksa "kararlar" araması template başlığını döner.

---

## Tur 3 — MVP çizgisi, hedef ve sıra

**Devi:** Şu üç soruyu cevaplamadan plana geçmiyoruz:

**S1: MVP'de ne yok?**
- ❌ Toplantı GUI (sayfa olarak yeter, ayrı editör yok)
- ❌ Agent-arası mesajlaşma (ofiste log var, ihtiyaç çıkınca eklenir)
- ❌ Graph view ofis bağlantıları için (faz 2)
- ❌ Çoklu kullanıcı / sync (proje local-only)

**S2: MVP'de ne *kesin* var?**
- ✅ İndexer derinlik desteği + `type`/`scope` alanları
- ✅ Embedding'te `scope` filtresi + search API parametresi
- ✅ Agent ofis dizin iskeleti (4 built-in agent için seed)
- ✅ Append-only `vault_agent_log` Tauri komutu
- ✅ Write-guard (secrets deny list)
- ✅ Ofis kartı HTML şablonu

**S3: Hedef hâli neye benziyor?**
- Her agent açıldığında ilk işi: kendi `state.md` + son 5 log girdisi + aktif proje sayfasını okumak (otomatik RAG warm-up).
- Kullanıcı "Coder şu an ne yapıyor?" deyince → ofis kartı tek tıkla.
- Toplantı sonrası `meeting-notes` template'i doldurulup `vault/agents/{agent}/meetings/` veya `vault/meetings/`'e yazılıyor; otomatik index + embed.
- `vault_search("X", scope="agent:vault")` Vault agent'ın geçmiş kararlarını döner — agent kendi RAG'ini sorgulayabilir.

**Olu:** Tetik akışı (final):
1. Kullanıcı/agent dosya yazar → Tauri `fs` veya `vault_write`/`vault_agent_log`
2. Watcher 5 sn debounce
3. Indexer artımlı çalışır (sadece değişen dosyalar)
4. Embedder sadece eklenen/değişen ID'leri re-embed eder
5. UI `vault:reindexed` event'i ile cache invalidate

**Theo:** Artımlı embed kritik — şu an `build()` her şeyi sıfırdan yapıyor. **MVP'de:** mevcut `embeddings.json`'u oku, yeni/değişen ID'leri tespit et, sadece onları embed et, mtime karşılaştırması ile. Bu olmazsa 200 sayfada her save 30 sn askıda kalır.

**Sev:** Performans bütçesi — ofis kartı açılışı **<150 ms**, agent self-RAG sorgusu **<300 ms** (lokal cosine 200 vektörde). Bu rakamları geçersek tasarım yanlış demektir, geri döneriz.

**Ren:** UX tarafı tek kural — ofis kartı **özel render bileşeni değil, sade HTML**. Custom React component'i yapmıyoruz. Browser tab'i `asset://` ile açıyor. Yatırımı azaltıp ofislerin kullanıcı tarafından elle düzenlenebilir kalmasını sağlıyoruz.

**Nia:** Son ekleme — kullanıcının `vault/agents/` altında **kendi notu** alma hakkı olsun. Agent yazımı `<!-- agent:start -->` … `<!-- agent:end -->` blokları içinde kalsın; agent o blokları günceller, dışındakine dokunmaz. Bu yoksa kullanıcı agent state'ine yorum ekleyemez, dosya silinmek zorunda kalır.

**Joon:** Onaylıyorum. **Append-only log + bloklu state** kombinasyonu, insan-agent ortak yazımının tek temiz formülü.

**Kaan:** Son taksonomi karar:

```
vault/
  home/               ← bilgi (mevcut)
  projects/           ← proje sayfaları (mevcut)
  html/               ← teknik ref (mevcut)
  prototypes/         ← konsolide edilecek, bkz roadmap
  archive/            ← sadece okunur
  agents/             ← YENİ — agent ofisleri
    vault/, coder/, atlas-maker/, sentor/
  meetings/           ← YENİ — global toplantılar
  templates/          ← YENİ — şablonlar (search dışı)
  Interaction Log/    → silinecek (boş)
```

**Devi:** **Onaylandı.** `VAULT_ARCHITECTURE.md` somut spec'i, `VAULT_ROADMAP.md` MVP→hedef sırasını taşıyor.

---

## Karar Özeti (gerekçeli)

| # | Karar | Sebep |
|---|---|---|
| K1 | Indexer derinliği esnek + her sayfa `type` ve `scope` alanı | Agent ofisi, toplantı, template gibi farklı içerik türlerinin search'te ayrışması için tek temiz yol |
| K2 | Agent ofisi `vault/agents/{slug}/` altında sabit dosya kontratı | "Her agent kendi konvansiyonu" kaosunu engeller; search ve UI tek şemaya güvenir |
| K3 | `state.md` snapshot + `log.md` append-only | Anlık durum hızlı sorgulansın, tarih kaybedilmesin — ikisini birleştirmek hep bilgi kaybeder |
| K4 | Embedding'te `scope` etiketi + search API parametresi | Agent kendi RAG'ini diğer agent'ların verisi kirletmeden sorgulayabilsin |
| K5 | Artımlı re-embed (mtime karşılaştırması) | Full rebuild her save 30+ sn → kullanılamaz; artımlı olmadan ofis konsepti çalışmaz |
| K6 | Watcher debounce 5 sn | UI thread'i sallamaz, ardışık yazımlarda 1 kez index'ler |
| K7 | Ortak `vault/templates/` + nadir agent override | Tek şablon yeri prensibi; her agent kendi template'ini kopyalamasın |
| K8 | Template'ler default search'ten hariç (`type: template`) | "Karar" araması template başlığını döndermesin |
| K9 | Write-guard regex deny list (secrets) | Agent self-yazımı sırasında token sızıntısı tek somut güvenlik riski |
| K10 | `<!-- agent:start --> ... <!-- agent:end -->` blok protokolü | İnsan ve agent aynı dosyada yaşayabilsin, kullanıcı agent state'ine yorum/ek bilgi yazabilsin |
| K11 | Ofis kartı düz HTML, custom React yok | UI yatırımını minimize eder; ofis dosyası user-editable kalır |
| K12 | Atomik `vault_agent_log` Tauri komutu | Concurrent log yazımında satır karışmasın; düz `fs.write` yetmez |
| K13 | `prototypes/` konsolide, `Interaction Log/` silinir, `archive/` salt-okunur | Vault'un üç gerçek rolünü (bilgi/ofis/arşiv) bulanıklaştıran dizinler temizlenir |
| K14 | MVP'de toplantı GUI, agent-arası mesajlaşma, graph view yok | Çekirdek çalışmadan UI yatırımı; ihtiyaç doğunca eklenir |
| K15 | Performans bütçeleri sabit: ofis kartı <150 ms, self-RAG <300 ms | Aşılırsa tasarım hatalıdır, geri dönülür — özellik eklemeden önce ölçülür |

---

## Reddedilen Öneriler (ve neden)

- **Agent ofisleri SQLite'te tutalım** — Reddedildi. Vault'un "düz dosya" prensibini bozar; user-editable olmaz; backup/diff için git yerine DB shadow gerekir. Düz markdown + HTML hâlâ en güçlü çözüm.
- **Her agent kendi vector store'una sahip olsun** — Reddedildi. Tek `embeddings.json` + `scope` filtresi aynı işlevi çözer; çoklu dosya senkron sorununu yaratır.
- **Toplantılar için zengin editör (TipTap vb.)** — Reddedildi. Markdown template + HTML render zaten yeterli; bağımlılık zinciri başlatmaya değmez.
- **Gerçek-zamanlı agent telemetrisi (websocket)** — Reddedildi. Watcher → re-index → UI cache invalidate akışı yeterli; <5 sn gecikme bu use-case için problem değil.
- **Agent ofisleri için ayrı `agents/` kök dizini (vault dışında)** — Reddedildi. Vault'un kendi search/embedding altyapısını kaybedersek ofis konseptinin yarısı çöker; vault içinde tutmak doğru kademe.

---

## Açık Sorular (kullanıcıya)

1. **Sentor agent'ı tutuyor muyuz?** Built-in ama UI bağı zayıf — ofis seed'lerken dahil edilsin mi yoksa custom'a mı düşürelim?
2. **`prototypes/` altındaki 6 varyantı (htlas, otlas, qtlas, taslak, tlas, atlas-root)** archive'a mı taşıyalım, yoksa biri canlı mı? (Cevap planı etkiler — `VAULT_ROADMAP.md` Faz 0'da.)
3. **Embedder backend** — sentence-transformers default mu kalsın yoksa MVP Ollama-only mi olsun? (`ollama pull all-minilm` kullanıcı setup'ı tek satır.)
