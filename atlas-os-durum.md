# Atlas OS — Proje Durum Raporu

*22 Mayıs 2026 — Güncel (Vault Roadmap Faz 0–7 + BacklinkPanel + Mermaid Preview + Browser History + Sesli Not + Graf Görünümü + Canvas UX + Atlas OS Studio + Build Sistemi + Launcher Ekranı + Atlas Instance Panel + Per-Vault Canvas + FileBrowser Panel)*

---

## Genel Bakış

Atlas OS; vault (kişisel offline web), CLI, API ve tam donanımlı bir AI IDE'den oluşan
sıfır-bağımlılıklı kişisel işletim sistemi / bilgi tabanıdır.

**Plan durumu:**
- ATLAS_PLAN.md: **Phase 0, A, B, C, D, E tamamlandı.**
- AGENT_BUILDER_PLAN.md: **A1–A9 tamamlandı.**
- VAULT_ROADMAP.md: **Faz 0–7 tamamlandı** (Faz 8/9/10 opsiyonel, veri bekliyor).

---

## Mimari Şeması

```
vault/{category}/{slug}/index.html   ← kaynak gerçek; HTML sayfalar
         │
tools/indexer.py                     ← esnek derinlik, type/scope, MD parse
tools/embedder.py                    ← 384-dim vektörler, incremental (Ollama)
         │
.index/pages.json                    ← makine-okunabilir (API + CLI + VaultHome)
.index/pages.js                      ← tarayıcı-yüklenebilir (window.ATLAS_INDEX)
.index/embeddings.json               ← semantik vektörler (scope-aware)
         │
         ├── ui/index.html           ← istemci-taraflı fuzzy arama (Fuse.js) — standalone
         ├── api/server.py           ← REST API (port 4242, scope param, /api/agent/{slug})
         ├── cli/atlas.py            ← terminal CLI
         └── ide/                    ← Tauri v2 + React AI IDE (AKTİF)
               ├── Browser tab       ← Vault (asset://) + Web (native WebView)  ✅
               │     └── BacklinkPanel  ← backlinks + similar notes (yeni!)     ✅
               ├── Vault Home        ← vault arama başlangıç ekranı             ✅
               ├── Agent Offices     ← vault/agents/{slug}/ + AgentsOfficePane  ✅
               ├── AI Agents         ← Vault, Atlas-Maker, Coder, Sentor, Orkestra ✅
               ├── Canvas            ← infinite pan/zoom, sub-canvas, blueprint  ✅
               ├── Agent Builder     ← canvas üzerinde agent oluşturma paneli    ✅
               └── web_search/fetch  ← SearXNG üzerinden web araması            ✅
```

---

## Phase Durumları

### Phase 0 — Fast Refresh Düzeltmeleri ✅
`useComposer.ts` ve `useTheme.ts` ayrı dosyalara taşındı.

### Phase A — Web Araçları ✅
`web_search` + `web_fetch` via SearXNG + reqwest. Mermaid offline bundle.

### Phase B — Agent Sistemi ✅
3 + 2 agent: Vault, Atlas-Maker, Coder, Sentor, Orkestra. Subagent: `explore` + `general`.

### Phase C — Otomatik Re-index ✅
`vault_write` sonrası `indexer.py` + `embedder.py` arka planda. Watcher da tetikler.

### Phase D — Browser Tabs ✅
Vault tab (asset://) + Web tab (native child WebView). AddressBar, bookmarks.

### Phase E — Vault Home ✅
`VaultHomePane.tsx` — vault arama, kategori filtreleri, `vault:reindexed` ile otomatik refresh.

---

### Vault Agent Ofisi — VAULT_ROADMAP.md ✅ TAMAMLANDI

| Faz | İçerik | Durum |
|-----|--------|-------|
| 0 | Temizlik (Interaction Log silindi) | ✅ |
| 1 | Indexer v2 (esnek derinlik, type/scope, MD) + Embedder incremental + API scope | ✅ |
| 2 | Agent ofis iskeleti: vault, coder, atlas-maker, **sentor** + templates | ✅ |
| 3 | Rust vault modülü: agent.rs, guard.rs, index_lookup.rs, write-guard | ✅ |
| 4 | Watcher (notify, 5s debounce, `vault:reindexed` event) | ✅ |
| 5 | Frontend: AgentsOfficePane, AgentSwitcherModal, `agents-office` tab, Ctrl+Shift+A | ✅ |
| 6 | Agent Self-RAG: `vault_self_context`, transport injection, agent instructions | ✅ |
| 7 | `/meeting` slash command | ✅ |
| 8 | Section-level chunking | ⏳ opsiyonel — recall < %70 ise açılır |
| 9 | Graph view ofis bağlantıları | ⏳ opsiyonel |
| 10 | Kullanım verisi & otomatik temizlik | ⏳ sonraki çeyrek |

**Yeni eklentiler (bu oturum):**
- `vault_search` scope + `include_archive` parametreleri (agent RAG izolasyonu)
- StatusBar'da aktif agent `name · phase` göstergesi + Office butonu
- Sentor agent ofisi seed edildi (4. built-in ofis tamamlandı)

---

### Agent Builder — A1–A9 ✅ TAMAMLANDI

| Faz | İçerik | Durum |
|-----|--------|-------|
| A1 | Sağ tık menüsü + Agent node | ✅ |
| A2 | Sentor agent + agent store | ✅ |
| A3 | Node port'ları + edge sürükleme | ✅ |
| A4 | Blueprint kayıt + import modal | ✅ |
| A5 | Sub-canvas "Export to Vault" | ✅ |
| A6 | Agent toolset filtreleme | ✅ |
| A7 | `canvas_read_state`, `agent_spawn`, `blueprint_save` | ✅ |
| A8 | MCP Analizi | ❌ opsiyonel |
| A9 | Per-agent Memory Toggle (ephemeral) | ✅ |

Orkestra + `agent_invoke` tool ✅ tamamlandı.

---

### BacklinkPanel ✅ YENİ — bu oturum

Vault browser tab'ında **backlinks + similar notes** kenar paneli:
- Adres çubuğunda `⟳` (Link) butonuyla açılır/kapanır
- `vault_get_backlinks` (Tauri) — pages.json'dan backlink listesi
- `vault_get_similar_notes` (Tauri) — embedding cosine similarity ile benzer sayfalar
- `vault:reindexed` event'e subscribe, otomatik yeniler
- Bir backlink'e tıklamak o vault sayfasına navigate eder

**Katkısı:** Vault artık gezinilebilir bir bilgi grafiği — "bunu başka hangi sayfa referans alıyor?" ve "buna benzer neler var?" anlık cevap.

---

### `/search` Slash Command ✅ YENİ — bu oturum

`/search {sorgu}` — LLM turunu beklemeden vault_search çalıştırır ve sonuçları tablo olarak döner. Hızlı vault araması için doğrudan erişim.

---

### Phase F — Polish

| Özellik | Dosya | Efor | Durum |
|---------|-------|------|-------|
| BacklinkPanel gerçek veri | `backlinks/` | Küçük | ✅ **Tamamlandı** |
| Mermaid önizleme editörde | `EditorPane.tsx` | Orta | ✅ **Tamamlandı** |
| Browser geçmişi kalıcı | `browser/browserHistory.ts` | Küçük | ✅ **Tamamlandı** |
| Graf görünümü (vault backlinks) | `modules/graph/` | Büyük | ✅ **Tamamlandı** |
| Sesli not → Atlas-Maker | `useWhisperRecording.ts` | Küçük | ✅ **Tamamlandı** |
| Canvas UX iyileştirmeleri | `canvas/` | Orta | ✅ **Tamamlandı** |

---

## Şu An Çalışan Her Şey

| Özellik | Nasıl test edilir |
|---------|------------------|
| Terminal tab | Varsayılan, PowerShell çalışır |
| Editor tab | Dosyaya çift tıkla → CodeMirror |
| Preview tab | Tab menüsü → Preview → URL gir |
| Browser tab | Vault (asset://) + Web (native WebView) |
| **Backlinks & Similar** | Vault tab'da iken link butonuna tıkla → sağ panel |
| **Mermaid önizleme** | `.md`/`.mmd` dosyası aç → "Mermaid ◂" butonuna tıkla → bölünmüş görünüm |
| **Browser geçmişi** | Adres çubuğuna tıkla → önceki URL'ler otomatik öneri olarak çıkar |
| **Sesli not** | Mikrofon butonuna bas → konuş → dur → `/voice [transkript]` otomatik dolar → Enter → Atlas-Maker vault sayfası oluşturur |
| **Graf görünümü** | `Ctrl+Shift+G` veya header'daki ağ simgesi → vault sayfaları ve bağlantıları force-directed grafik; node'a tıkla → vault tab'da açılır |
| Vault Home | Uygulama açılışında varsayılan; vault arama |
| AI Chat | Alt kısımda, model seçiliyken çalışır |
| Agent Office | Ctrl+Shift+A → agent seç → Office → veya StatusBar Office butonu |
| Agent Self-RAG | Vault/Coder/Atlas-Maker/Sentor başlarken kendi ofisini okur |
| Vault arama | vault_search (keyword + semantic, scope filtreli) |
| **`/search {sorgu}`** | Chat input'ta `/search atlas` → anlık tablo |
| `/decision {karar}` | Aktif agent log.md'ye kaydeder |
| `/meeting {konu}` | Agent toplantı notu oluşturur |
| Vault yazma | Atlas-Maker → onay kartı → dosya → re-index |
| Web arama | web_search via SearXNG |
| Web okuma | web_fetch → metin çıkarma (50 KB) |
| Canvas | Infinite pan/zoom, sub-canvas, connection edges |
| **Per-vault canvas** | Workspace değiştir → canvas otomatik kaydedilir/yüklenir |
| **FileBrowser paneli** | Canvas sağ tık → File Browser → breadcrumb nav, çift tık aç |
| **Canvas tam ekran** | Başlık çubuğuna çift tıkla → tam ekran; Esc ile çık |
| **Canvas dock** | `−` butonuyla küçült → alt chip şeridine iner; chip'e tıklayınca geri gelir |
| **Canvas katman sırası** | Herhangi bir panele tıkla → otomatik öne çıkar (sabitleniş paneller dahil) |
| Agent Builder | Sağ tık → Agent paneli → kaydet → Chat açılır |
| Blueprint | `blueprint_save` (AI) + Import modal (sağ tık) |
| Focused Mode | Ctrl+Alt+F, şeffaf overlay, click-through |
| StatusBar | Agent adı · phase göstergesi · Office butonu |
| **Atlas Instance** | Canvas sağ tık → ◈ Atlas Instance → vault klasörü seç → diğer vault'un arama UI'si iframe'de |
| **Launcher** | Uygulamayı aç → Studio kartı (geliştirme) veya build kartları (paketlenmiş sürümler) |
| **Build sistemi** | `atlas.bat → [B] Build IDE → [V] Package Build` → `build\atlas-studio-vX.Y.Z-YYYYMMDD\` |

---

## Geliştirme Komutları

```bash
cd ide && npm run tauri dev        # IDE başlat
cd ide && npx tsc --noEmit        # TypeScript kontrol (0 hata beklenir)
cd ide/src-tauri && cargo build   # Rust derleme
python tools/indexer.py           # Re-index (vault değiştikten sonra)
python tools/embedder.py          # Semantic embedding (Ollama gerekli)
python tools/embedder.py --check  # Ollama bağlantısını kontrol et
```

---

---

### Canvas UX İyileştirmeleri ✅ YENİ — bu oturum

Canvas panel kullanım kolaylıkları:

| Özellik | Nasıl çalışır |
|---------|--------------|
| **Çift tıkla tam ekran** | Panel başlık çubuğuna çift tıkla → tam ekran; Esc ile çık; başlık metnine çift tıklamak hâlâ yeniden adlandırma açar |
| **Dock'a küçült** | `−` butonu → panel canvas'tan kaybolur, altta chip olarak görünür; chip'e tıkla → geri gelir; chip üzerindeki `×` kapatır |
| **Z-index / katman düzeltmesi** | İki sabitlenmiş panel üst üste geldiğinde tıklanan öne çıkar — `onPointerDownCapture` ile başlık butonu `stopPropagation`'ı artık engel olmaz |

**Değişen dosyalar:**
- `canvas/types.ts` — `minimized?: boolean` eklendi
- `canvas/canvasStore.ts` — `toggleMinimized(id)` aksiyonu eklendi
- `canvas/CanvasPanel.tsx` — local minimized state kaldırıldı; store'dan okunuyor; çift tık tam ekran; `onPointerDownCapture`; tüm butonlara `onDoubleClick stopPropagation`
- `canvas/CanvasDock.tsx` — **yeni** — küçültülmüş panelleri chip satırı olarak canvas altında gösterir
- `canvas/InfiniteCanvas.tsx` — `<CanvasDock />` eklendi

---

## MCP + IDE Control API ✅ YENİ — bu oturum

### MCP Sunucusu (`mcp/server.py`)
Atlas OS araçlarını Model Context Protocol (JSON-RPC 2.0) üzerinden dışarıya açar.

**Çalıştırma:**
```bash
python mcp/server.py               # stdio (Claude Desktop, Cursor…)
python mcp/server.py --http 4244   # HTTP mod
```

**13 araç:** `vault_search`, `vault_read`, `vault_write`, `vault_list_pages`, `web_search`, `web_fetch`, `read_file`, `list_directory`, `canvas_get_state`, `canvas_add_panel`, `canvas_remove_panel`, `ide_open_tab`, `ide_send_message`

**Claude Desktop config:**
```json
{ "mcpServers": { "atlas-os": { "command": "python", "args": ["C:/Atlas OS/mcp/server.py"] } } }
```

### REST IDE Control API (port 4242 üzerine eklendi)

| Endpoint | Açıklama |
|----------|----------|
| `GET /api/ide/status` | IDE durumu + kuyruk |
| `GET /api/ide/canvas` | Canvas state snapshot |
| `POST /api/ide/canvas/panels` | Panel ekle `{panelType, title?, meta?}` |
| `DELETE /api/ide/canvas/panels/{id}` | Panel kaldır |
| `POST /api/ide/agent/message` | Agent'a mesaj `{message, agentId?}` |
| `POST /api/ide/tab` | Tab aç `{url}` |

### Mimari
```
Claude Desktop ──stdio──▶ mcp/server.py ──▶ vault / web / canvas araçları
cURL/script    ──HTTP:4244──▶ mcp/server.py
REST istemci   ──HTTP:4242──▶ api/server.py ──▶ .mcp-queue.json
                                                       ↓
IDE (Tauri) poll 1.5s ──mcp_dequeue()──▶ canvas add/remove, tab aç, mesaj gönder
IDE canvas değişince ──mcp_export_state()──▶ .ide-state.json
```

**Değişen dosyalar:**
- `mcp/server.py` — **yeni** — 13 araçlı MCP sunucusu
- `api/server.py` — 6 IDE control endpoint eklendi
- `ide/src-tauri/src/modules/mcp.rs` — **yeni** — `mcp_dequeue` + `mcp_export_state`
- `ide/src-tauri/src/modules/mod.rs` — mcp modülü
- `ide/src-tauri/src/lib.rs` — komutlar register
- `ide/src/app/App.tsx` — canvas export + queue poller

---

## Phase F — Tamamlandı ✅

Tüm Phase F maddeleri tamamlandı. Proje Phase 0–F arası tamamen bitti.

---

## Atlas OS Studio + Build Sistemi ✅ YENİ

### Yeniden İsimlendirme
- `tauri.conf.json` productName + window title → **"Atlas OS Studio"**
- `atlas.bat` başlığı → "Atlas OS Studio"

### Build Versiyonlama
```bat
atlas.bat → [B] Build IDE    # release binary derle (bir kez)
atlas.bat → [V] Package Build # build/ klasörüne versiyonlu kopyala
```
Çıktı: `build\atlas-studio-v0.6.1-20260520\atlas.exe` + `build-info.json`

### Atlas Instance Paneli ✅ YENİ — bu oturum

Canvas'a sağ tık → **◈ Atlas Instance** → vault klasörü seç → **Bağlan**

**Config ekranı** (`meta.vaultRoot` boşken):
- İsim + vault kök dizini girdisi; `⊕` butonu sistem klasör seçici açar
- "Bağlan" → `updatePanel` ile `meta.vaultRoot` kaydedilir

**Bağlı ekran** (`meta.vaultRoot` doluyken):
- İnce üst bar: yol göstergesi + `×` bağlantı kesme butonu
- Sandboxed `<iframe>` → `asset://localhost/…/ui/index.html` yüklenir
- Diğer vault'un kendi `pages.js` / `pages.json`'u bağımsız olarak çalışır
- Z-index çakışması yok — native WebView kullanılmıyor

**Launcher → Instance akışı:**
- Launcher'dan build kartına tıklandığında `exePath`'den 3 seviye yukarısı vault kökü olarak hesaplanır
- Instance paneli `meta: { vaultRoot }` ile otomatik bağlı açılır

**Değişen dosyalar:**
- `canvas/CanvasPanelContent.tsx` — `CanvasInstance` yeniden yazıldı (terminal → iframe vault browser)
- `canvas/canvasStore.ts` — instance panel boyutu `560×500`
- `app/App.tsx` — `onBuild` handler vault kökü hesaplama + instance panel oluşturma

---

## Per-Vault Canvas İzolasyonu ✅ YENİ — bu oturum

Her vault root'u kendi canvas state'ini (panels, connections, viewport) ayrı dosyada saklar.

**Nasıl çalışır:**
- `canvasStore.ts` → `_simpleHash(root)` ile vault yolundan `atlas-canvas-{hash}.json` üretir
- `switchVault(root)` aksiyonu: mevcut canvas'ı flush → `_persistStore` değiştirilir → `_hydrated` sıfırlanır → yeni vault yüklenir
- `App.tsx` → `workspaceRoot` değiştiğinde `switchVault()` otomatik tetiklenir
- Vault değiştirme = sıfır veri kayıpı; her vault kendi terminalleri/agentlerini hatırlar

**Değişen dosyalar:**
- `canvas/canvasStore.ts` — `_simpleHash`, `let _persistStore/let _persistKey` (değiştirilebilir), `switchVault(root)`, `addConnection` → `string` döner, `updateConnectionKind(id, kind)` yeni aksiyon
- `canvas/types.ts` — `"filebrowser"` PanelType'a eklendi
- `app/App.tsx` — `switchVault` selector + `useEffect` on `workspaceRoot`

---

## FileBrowser Canvas Paneli ✅ YENİ — bu oturum

Klasik Windows Explorer tarzı dosya gezgini; **canvas paneli olarak açılır** (sol sidebar değil — focus mode uyumu için ayrı tutuldu).

**Özellikler:**
- Breadcrumb navigasyon çubuğu — her segmente tıklayınca o dizine gider
- `↑` ile üst dizine çık, `↺` yenile
- Tek tık → seç, çift tık → klasörse gir / dosyaysa yan editor paneli aç
- `fmtSize` ile dosya boyutları (B / KB / MB)
- `panel.meta.cwd` — son gezinilen dizin panel kapansa bile hatırlanır
- Status bar: öğe sayısı + seçili isim

**Özel ikon sistemi** (`entryIcon(name, kind)`):
| Tür | Glyph | Renk |
|-----|-------|------|
| Dizin | `▶` | `#f59e0b` (amber) |
| `.md` | `◈` | `#9b72ef` (mor) |
| `.html/.htm` | `◎` | `#f97316` (turuncu) |
| `.json/.yaml/.yml` | `⊙` | `#eab308` (sarı) |
| `.js` | `⬡` | `#eab308` · `.ts` → `#3b82f6` · `.tsx/.jsx` → `#61dafb` |
| `.py/.rs/.go` | `⬡` | sırasıyla `#3b82f6` / `#f97316` / `#22d3ee` |
| `.css/.scss` | `⬟` | `#ec4899` (pembe) |
| Görsel (png/jpg…) | `▣` | `#4ade80` (yeşil) · `.svg` → `#a78bfa` |
| `.sh/.bat` | `▷` | `#22d3ee` (cyan) |
| Sembolik bağ | `⇢` | `#888888` |
| Diğer metin | `▤` | `#555555` |

**Değişen dosyalar:**
- `canvas/FileBrowserPanel.tsx` — **yeni** — tam bileşen
- `canvas/CanvasPanelContent.tsx` — `case "filebrowser"` eklendi
- `canvas/canvasStore.ts` — `PANEL_DEFAULTS["filebrowser"]` ekli (480 × 520)

---

## Açılış Ekranı (Launcher) ✅ YENİ

Atlas OS Studio her açılışında bir launcher ekranı gösterir:

**Sol Panel (VS Code tarzı):**
- Çalışma alanı seçimi — **"Klasör Aç…"** → `pick_folder` → `workspaceRoot` güncellenir
- Aktif workspace göstergesi
- Son kullanılan çalışma alanları (localStorage, son 6)

**Sağ Panel (ortam seçimi):**
- **Atlas OS Studio** kartı (mavi aksan) → geliştirme ortamı, direkt açılır
- **Build kartları** (`build/` klasöründen otomatik taranır) → `atlas.exe` canvas instance olarak başlatılır
- Build yoksa ghost kart: `atlas → [B] → [V]`

**Native WebView Fix:**
- Launcher açılışında `webLayerManager.hideAll()` çağrılır
- Kapanışta viewport ticki → CanvasWeb'in sync effect'i native WebView'ları otomatik geri getirir

| Özellik | Nasıl test edilir |
|---------|------------------|
| Launcher | Uygulamayı aç → sol+sağ panel görünür |
| Klasör Aç | Sol panelde "Klasör Aç…" → sistem dialog |
| Build seç | `[V] Package Build` sonrası build kartı görünür |
| WebView fix | Web paneli açıkken launcher açıldığında üst üste gelmez |
| **Atlas Instance** | Canvas sağ tık → ◈ Atlas Instance → vault seç → başka vault'un UI'si iframe içinde açılır |
| **Build → Instance** | Launcher'da build kartı → studio açılır, instance paneli vault root pre-filled gelir |
