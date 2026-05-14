# Atlas OS — Proje Durum Raporu

*14 Mayıs 2026*

---

## Ne Yaptık

### 1. Altyapı Kurulumu
Claude Code'a global design system kurduk.

- `~/.claude/CLAUDE.md` → Claude Code'un her oturumda okuduğu kurallar
- `~/.interface-design/system.md` → OS/dark minimal tasarım sistemi (renkler, tipografi, spacing, component kuralları)
- Stack: HTML + Tailwind CDN, Vanilla JS, sistem fontu, border-only depth

### 2. Proje Mimarisi
Claude Code `.last/` klasöründeki örnek sayfaları inceleyerek tam bir teknik mimari belgesi üretti. Onayladık.

**Klasör yapısı:**
```
Atlas OS/
├── vault/              ← kullanıcının HTML sayfaları
│   └── {kategori}/{slug}/index.html
├── .index/
│   ├── pages.json      ← CLI ve API için
│   └── pages.js        ← browser için (window.ATLAS_INDEX)
├── ui/                 ← arama arayüzü
│   ├── index.html
│   ├── app.js
│   └── style.css
├── tools/
│   └── indexer.py
├── cli/
│   └── atlas.py
└── api/
    └── server.py
```

**Temel kararlar:**
- Index formatı: JSON (SQLite değil, dependency yok)
- Browser search: Fuse.js CDN (fuzzy, threshold 0.35)
- CLI search: Python term-frequency (sıfır dependency)
- API server: Python stdlib (kurulum yok)
- Kategori sistemi: klasör adı = kategori (config yok)
- `file://` CORS sorunu: `pages.js` ile çözüldü (`window.ATLAS_INDEX`, fetch yok)

---

### 3. MVP Geliştirme — Phase 1

#### tools/indexer.py ✅
- `_PageParser`: `<title>`, `<meta description>`, `<h1-h3>`, body text (3000 char), local linkler
- `_resolve_link()`: relative href → category/slug
- `build_index()`: vault tarar, backlink second-pass
- `write_index()`: hem `pages.json` hem `pages.js` üretir

#### ui/index.html ✅
- Shell only, logic yok
- Tailwind config ile design system token'ları extend edildi
- Load order: style.css → Tailwind → Fuse.js → pages.js → app.js
- ID hook'ları: `search-input`, `category-nav`, `result-count`, `results-list`, `empty-state`, `no-results-msg`

#### ui/app.js ✅
- 3 state machine view: empty / no-results / results
- `setVisible()` ile tek çağrıda toggle
- Fuse.js: `threshold: 0.35`, `ignoreLocation: true`, `minMatchCharLength: 2`
- Category nav: boot'ta bir kez build, her update'te sadece active state refresh
- XSS koruması: tüm user content `textContent`, tek `innerHTML` → `escapeHtml()` ile

#### ui/style.css ⏳
Şu an burada. Onay bekleniyor.

---

## Sistem Nasıl Çalışıyor

```
vault/                     ← kullanıcı buraya yazar
    │
    ▼
tools/indexer.py           ← HTML parse eder
    │
    ▼
.index/pages.json + pages.js   ← tek kaynak

    ├── ui/app.js          → browser'da fuzzy search
    ├── cli/atlas.py       → terminalde search
    └── api/server.py      → Ollama agent'lar için REST API
```

---

## Devamındaki Plan

### Phase 1 — Tamamlanıyor (şu an)
- [ ] `ui/style.css` — design system ile uyumlu dark OS teması

### Phase 2 — CLI + API
- [ ] `cli/atlas.py` — `atlas search`, `atlas index`, `atlas list`, `atlas open`
- [ ] `api/server.py` — Python stdlib HTTP server
  - `GET /api/search?q=...&limit=...`
  - `GET /api/page/{category}/{slug}`
  - `GET /api/categories`
  - `GET /api/pages`
- [ ] `atlas serve` komutu
- [ ] `atlas new "Başlık" kategori` — yeni sayfa template'i
- [ ] `.last/` → `vault/` migration script

### Phase 3 — Ollama Entegrasyonu
- [ ] `tools/ollama-tools.json` — Ollama tool definition
  - `search_knowledge(query, limit)`
  - `get_page(id)`
- [ ] Qwen2.5-Coder ile test
- [ ] Agent workflow: search → get_page → context window

### Phase 4 — Polish
- [ ] Backlink paneli (vault sayfalarına inject)
- [ ] `atlas watch` — file watcher, otomatik reindex
- [ ] Kategori landing sayfaları
- [ ] Sayfa içi prev/next navigasyon
- [ ] terax-ai OS entegrasyonu (github.com/crynta/terax-ai)

---

## Teknik Notlar

- Tailwind CDN kullanılıyor, build step yok
- `file://` protokolünde çalışır, server zorunlu değil (Phase 1)
- ~500 sayfa için index ~2MB, memory'e yükleme anlık
- Python 3.x gerekli (stdlib only, pip install yok)
- BeautifulSoup kullanılmıyor, stdlib `html.parser`
