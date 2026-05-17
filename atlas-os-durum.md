# Atlas OS — Proje Durum Raporu

*17 Mayıs 2026 — Güncel*

---

## Genel Bakış

Atlas OS; vault (kişisel offline web), CLI, API ve tam donanımlı bir AI IDE'den oluşan
sıfır-bağımlılıklı kişisel işletim sistemi / bilgi tabanıdır.

**Plan durumu:** ATLAS_PLAN.md v2 içindeki **Phase 0, A, B, C, D tamamlandı.**
Şu an Phase E (Vault Home) bekliyor.

---

## Mimari Şeması

```
vault/{category}/{slug}/index.html   ← kaynak gerçek; HTML sayfalar
         │
tools/indexer.py                     ← HTML parse → index yazar (vault_write sonrası otomatik)
tools/embedder.py                    ← 384-dim vektörler (all-MiniLM-L6-v2)
         │
.index/pages.json                    ← makine-okunabilir (API + CLI + VaultHome)
.index/pages.js                      ← tarayıcı-yüklenebilir (window.ATLAS_INDEX)
.index/embeddings.json               ← semantik vektörler (384-dim)
         │
         ├── ui/index.html           ← istemci-taraflı fuzzy arama (Fuse.js) — standalone
         ├── api/server.py           ← REST API (port 4242) — opsiyonel
         ├── cli/atlas.py            ← terminal CLI
         └── ide/                    ← Tauri v2 + React AI IDE (AKTİF)
               ├── Browser tab       ← gerçek tarayıcı (asset:// + https://)  ✅ YENİ
               ├── AI Agents         ← Vault, Atlas-Maker, Coder              ✅ YENİ
               └── web_search/fetch  ← SearXNG üzerinden web araması          ✅ YENİ
```

---

## Phase Durumları

### Phase 0 — Fast Refresh Düzeltmeleri ✅ TAMAMLANDI

| Sorun | Dosya | Çözüm |
|-------|-------|-------|
| `useComposer` hook bileşen ile aynı dosyada | `composer.tsx` | `useComposer.ts`'e taşındı |
| `useTheme` hook bileşen ile aynı dosyada | `ThemeProvider.tsx` | `useTheme.ts`'e taşındı |

**Etki:** Her kaydet'te tam sayfa yeniden yükleme durdu. Vite HMR artık `hmr update` (invalidate değil) gösteriyor.

---

### Phase A — Web Araçları ✅ TAMAMLANDI

| Bileşen | Dosya | Durum |
|---------|-------|-------|
| Rust HTTP istemcisi | `ide/src-tauri/src/modules/web.rs` | reqwest + scraper + urlencoding |
| `web_search` komutu | `web.rs` | SearXNG JSON API, 8 sonuç limiti |
| `web_fetch` komutu | `web.rs` | HTML → metin (50 KB limit, script/nav/footer temizlendi) |
| TypeScript araçları | `ide/src/modules/ai/tools/web.ts` | `buildWebTools()` → tools.ts'e eklendi |
| SearXNG URL ayarı | `ide/src/modules/settings/store.ts` | Settings → Models'da yapılandırılabilir |
| Mermaid (offline) | `ide/public/vendor/mermaid.min.js` | Yerel bundle (CDN yok) |

**Nasıl çalışır:** Agent `web_search` aracını çağırır → Rust SearXNG'ye istek atar → JSON sonuçlar döner → Agent `web_fetch` ile URL içeriğini okur. Her iki araç da otomatik çalışır (kullanıcı onayı gerekmez — read-only).

---

### Phase B — Agent Sistemi Yeniden Yapılandırma ✅ TAMAMLANDI

**Önceki durum:** Planner + Builder (2 generic agent, 5 subagent tipi)
**Şimdiki durum:** Vault + Atlas-Maker + Coder (3 odaklı agent, 2 subagent tipi)

| Agent | ID | Görevi |
|-------|----|--------|
| Vault | `builtin:vault` | Vault önce arar, yoksa web'e bakar. Varsayılan. |
| Atlas-Maker | `builtin:atlas-maker` | Her yanıt bir vault HTML sayfası yazar. Mermaid destekli. |
| Coder | `builtin:coder` | Workspace'deki kaynak kod dosyalarını düzenler. |

**Subagent tipleri:** `explore` + `general` (planner, code-review, security silindi)

**Atlas-Maker'ın HTML kuralları:**
- `/vendor/mermaid.min.js` (CDN yok)
- CSS değişkenleri: `--bg:#0a0a0a`, `--accent:#5b8def` vb.
- `box-shadow` yasak — sadece `border` derinlik
- `system-ui` font — Google Fonts yok

---

### Phase C — Otomatik Re-index ✅ TAMAMLANDI

| Bileşen | Dosya | Durum |
|---------|-------|-------|
| `findPython()` yardımcısı | `ide/src/modules/ai/tools/vault.ts` | `py` → `python3` → `python` sıralaması |
| Re-index tetikleyicisi | `vault_write.execute` sonrası | `shell_bg_spawn` ile arka planda |
| Re-embed tetikleyicisi | `vault_write.execute` sonrası | embeddings.json varsa çalışır, yoksa atlar |
| Vault-page-written event | `vault.ts` → `App.tsx` | Tauri event: `atlas://vault-page-written` |

**Nasıl çalışır:** Atlas-Maker bir sayfa yazdıktan sonra `indexer.py` arka planda sessizce çalışır. Kullanıcı beklemez. `embeddings.json` zaten kuruluysa `embedder.py` de çalışır. Bir sonraki Vault agent araması yeni sayfayı bulur.

---

### Phase D — Browser Tab ✅ TAMAMLANDI

| Bileşen | Dosya | Durum |
|---------|-------|-------|
| asset:// protokolü | `tauri.conf.json` → `assetProtocol` | Yerel HTML'yi iframe'de açar |
| URL dönüştürücü | `ide/src/modules/browser/assetUrl.ts` | `localToAsset()`, `vaultPageAssetUrl()` |
| Yer imi deposu | `ide/src/modules/browser/bookmarks.ts` | `appDataDir()`'a JSON dosyası |
| Adres çubuğu | `ide/src/modules/browser/AddressBar.tsx` | Geri/ileri/yenile/yer imi/dış açma |
| Ana panel | `ide/src/modules/browser/BrowserPane.tsx` | URL → iframe, metin → arama kartları |
| Tab yığını | `ide/src/modules/browser/BrowserStack.tsx` | Tüm browser tab'ları DOM'da (iframe reload önlenir) |
| Tab tipleri | `ide/src/modules/tabs/lib/useTabs.ts` | `BrowserTab`, `VaultHomeTab` eklendi |
| Tab yönetimi | `useTabs` | `openBrowserTab`, `openVaultHomeTab`, `updateBrowserUrl`, `navigateBrowserHistory` |
| Tab bar | `ide/src/modules/tabs/TabBar.tsx` | "Browser" ve "Vault Home" menü seçenekleri |
| Dosya explorer | `FileTreeNode.tsx` | `.html` dosyaları için "Open in Browser" context menüsü |
| Otomatik açma | `App.tsx` | `vault-page-written` event → yeni browser tab |

**Adres çubuğu akıllı yönlendirme:**

| Girilen | Sonuç |
|---------|-------|
| `https://github.com` | Doğrudan iframe'de açar |
| `github.com` | `https://` ekler, iframe'de açar |
| `C:\vault\...index.html` | `asset://` URL'e çevirir, iframe'de açar |
| `mermaid diagram types` | SearXNG araması yapar, kart listesi gösterir |

**Yer imleri:** Yıldız ikonuna tıkla → `appDataDir/bookmarks.json`'a kaydedilir.
**Harici açma:** `https://` URL'ler için Share ikonu → sistem tarayıcısında açar.
**Birden fazla browser tab:** Hepsi DOM'da mount'lu tutulur → tab değişiminde iframe yeniden yüklenmez.

---

## Şu An Çalışan Her Şey

| Özellik | Nasıl test edilir |
|---------|------------------|
| Terminal tab | Varsayılan açılır, PowerShell çalışır |
| Editor tab | Dosyaya çift tıkla → CodeMirror açılır |
| Preview tab | Tab menüsü → Preview → URL gir |
| Browser tab | Tab menüsü → Browser → adres çubuğuna yaz |
| AI Chat paneli | Alt kısımda, model seçiliyken çalışır |
| Vault arama | Vault agent: vault_search çalışır (keyword + semantic) |
| Vault yazma | Atlas-Maker: vault_write → onay kartı → dosya yazılır → re-index |
| Web arama | Vault/Atlas-Maker: web_search via SearXNG |
| Web okuma | web_fetch → metin çıkarma (50 KB) |
| Re-index | vault_write sonrası otomatik arka planda |
| Dosya explorer | Klasör aç/kapat, sağ tık menüsü, "Open in Browser" (.html) |
| Mermaid offline | `/vendor/mermaid.min.js` sunuluyor |
| Shortcuts | Ctrl+T (terminal), Ctrl+E (editor), Ctrl+P (preview) vb. |
| Settings | Models ekranında SearXNG URL, model ID ayarlanabilir |

---

## Tamamlanmamış / Bekleyen

### Phase E — Vault Home ❌ YAPILMADI

Şu an: Vault Home tab seçilince `"Vault Home — coming in Phase E"` yazısı görünür.

Yapılacaklar:
- `ide/src/modules/vault-home/VaultHomePane.tsx` yeni dosya
- `searchVault()` fonksiyonunu `vault.ts`'den ayrı export et
- Debounced arama kutusu (150ms)
- Son sayfalar (modified'a göre top 6)
- Kategori filtre chip'leri
- Sonuç kartı → tıkla → browser tab'da açılır
- Boş durum: "Run indexer" butonu
- Uygulama açılışında Vault Home varsayılan tab olarak başlasın (şu an terminal)

### Phase F — Polish (isteğe bağlı)

| Özellik | Dosya | Efor |
|---------|-------|------|
| Backlink paneli gerçek veri | `ide/src/modules/backlinks/` | Orta |
| Mermaid önizleme editörde | `EditorPane.tsx` | Orta |
| Graf görünümü (vault backlinks) | `ide/src/modules/graph/` | Büyük |
| Browser geçmişi kalıcı | `browser/historyStore.ts` | Küçük |
| Yer imi paneli | `browser/BookmarksPanel.tsx` | Küçük |
| Adres çubuğu otomatik tamamlama | `BrowserPane.tsx` | Orta |
| Sesli not → Atlas-Maker | `useWhisperRecording.ts` | Küçük |
| BacklinkPanel: stub Tauri komutlarını `.index/pages.json`'a bağla | `backlinks/` | Orta |

---

## Olası Sorunlar ve Sınırlamalar

| Sorun | Durum | Çözüm |
|-------|-------|-------|
| SearXNG public instance yavaş/kapalı | Normal | Settings'den kendi instance'ını yaz (`http://localhost:8080`) |
| Bazı siteler iframe'de açılmaz (X-Frame-Options) | Tasarım gereği | "Open in system browser" butonu her https:// URL'de görünür |
| Vault relative link'leri (`../`) asset:// üzerinde bozulabilir | Test edilmedi | Eğer bozulursa: lokal HTTP server (rastgele port) alternatif |
| Mermaid CDN yerine `/vendor/` kullan | Atlas-Maker prompt'unda kuralı var | Model kural dinlemezse post-write validator eklenebilir |

---

## Updater Hatası Açıklaması

```
[tauri_plugin_updater::updater][ERROR] update endpoint did not respond with a successful status code
```

**Ne anlama gelir:** Atlas OS'un `tauri.conf.json`'unda `updater` plugin'i aktif ama
gerçek bir güncelleme sunucusu kurulmamış. Uygulama başladığında Tauri otomatik güncelleme
kontrol eder, sunucu bulamayınca bu hata loglanır.

**Bu bir sorun mu?** **Hayır.** Uygulama tamamen normal çalışır — bu hata sadece konsola
yazılır, kullanıcıya hiçbir şey gösterilmez.

**Düzeltmek için 2 seçenek:**

1. **Kolay (şimdi için):** `tauri.conf.json`'dan updater endpoint'ini kaldır veya plugin'i devre dışı bırak:
   ```json
   "plugins": {
     "updater": {
       "active": false
     }
   }
   ```

2. **Gerçek çözüm (ileride):** GitHub Releases + `tauri-action` ile otomatik güncelleme
   altyapısı kur. Atlas OS dağıtıma hazır olduğunda anlamlı.

---

## API Endpoint'leri (port 4242, opsiyonel)

| Method | Endpoint | Açıklama |
|--------|----------|---------|
| GET | `/api/search?q=&limit=&category=` | Keyword arama |
| GET | `/api/semantic?q=&limit=` | Semantik arama |
| GET | `/api/page/{category}/{slug}` | Tam sayfa metni |
| GET | `/api/categories` | Kategori listesi |
| GET | `/api/pages` | Tüm index |

IDE bu API'ye bağlı değil — vault araması doğrudan `.index/pages.json` okur.

---

## Geliştirme Komutları

```bash
# IDE başlat (API opsiyonel)
atlas-ide.bat

# IDE manuel
cd ide && npm run tauri dev

# TypeScript kontrol
cd ide && npx tsc --noEmit

# Rust derleme
cd ide/src-tauri && cargo build

# Re-index (vault sayfaları değiştikten sonra)
python tools/indexer.py

# Semantic embedding (indexer sonrası)
python tools/embedder.py

# Offline semantic arama için Ollama model
ollama pull all-minilm
```

---

## Tasarım Sistemi Renk Tokenleri

| Token | Değer | Kullanım |
|-------|-------|---------|
| bg-base | #0a0a0a | Ana arka plan |
| bg-surface | #111111 | Panel yüzeyleri |
| bg-elevated | #1a1a1a | Kart, dropdown |
| bg-overlay | #222222 | Tooltip, popover |
| border-subtle | #2a2a2a | Normal kenarlar |
| border-active | #404040 | Hover/focus kenarlar |
| text-primary | #f5f5f5 | Ana metin |
| text-secondary | #888888 | İkincil metin |
| accent | #5b8def | Vurgu rengi |
| accent-hover | #4a7de0 | Hover vurgu |

**Kurallar:** Border-only derinlik (box-shadow yasak), 150ms ease-out, system-ui font, rounded-lg maksimum, gradient yasak.

---

## Sonraki Adım

**Phase E — Vault Home** başlatılmaya hazır.

Yapılacak iş listesi:
1. `ide/src/modules/ai/tools/vault.ts`'ten `searchVault()` fonksiyonunu ayrı export et
2. `ide/src/modules/vault-home/VaultHomePane.tsx` yeni dosya oluştur
3. `useTabs.ts`'te başlangıç tab'ını terminal yerine vault-home yap
4. `App.tsx`'te VaultHomePane'i gerçek bileşenle değiştir
5. Opsiyonel: `Ctrl+Shift+H` kısayolu ekle
