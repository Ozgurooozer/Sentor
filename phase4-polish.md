# Atlas OS — Phase 4: Polish

## Hedef
Sistemi günlük kullanıma hazır hale getirmek.
Yeni sayfa üretimi, backlink injection, file watcher, navigasyon.

---

## 4.1 Yeni Sayfa Template Üretici
**Dosya:** `cli/atlas.py` — `atlas new` komutu

**Claude Code prompt:**
```
Add atlas new command to cli/atlas.py

Usage: atlas new "Page Title" {category}
Example: atlas new "Web Components" html

Behavior:
- Creates vault/{category}/{slug}/index.html
  slug = title lowercased, spaces→hyphens, special chars stripped
- Template HTML:
  - <title>{title}</title>
  - <meta name="description" content="">
  - <h1>{title}</h1>
  - Placeholder sections: Overview, Details, Related
  - Design system colors inline (matches existing vault pages)
  - Comment: <!-- Edit this page, then run: atlas index -->
- If folder already exists: print error, exit 1
- After creating: print path, remind user to run atlas index

Test:
  atlas new "JavaScript Modules" js
  Expected: vault/js/javascript-modules/index.html created
  Run atlas index → page appears in search
  atlas search "javascript modules" → 1 result
```

---

## 4.2 Backlink Panel Injection
**Dosya:** `tools/inject_backlinks.py`

**Claude Code prompt:**
```
Build tools/inject_backlinks.py

For every page in vault/ that has backlinks in pages.json:
- Inject a <div id="atlas-backlinks"> panel at end of <body>
- Panel shows: "Linked from: [Page Title] · [Page Title]"
- Each title is an <a href> pointing to the other page (relative path)
- Style: dark, minimal, border-top, same font as page
- Idempotent: if panel already exists, replace it (don't duplicate)
- Run after atlas index

Add to atlas.py:
  atlas backlinks   → runs inject_backlinks.py

Test:
- Create 2 pages that link to each other
- atlas index → atlas backlinks
- Open page in browser → backlinks panel visible at bottom
- Run atlas backlinks again → panel not duplicated
```

---

## 4.3 File Watcher
**Dosya:** `tools/watcher.py`

**Claude Code prompt:**
```
Build tools/watcher.py

Uses Python stdlib watchdog alternative: poll-based, no pip install.
Polls vault/ every 2 seconds for mtime changes.
On change: runs indexer.py, prints "Reindexed: {changed file}"

Add to atlas.py:
  atlas watch   → starts watcher (blocking, Ctrl+C to stop)

Constraints:
- No watchdog, no third-party deps
- Works on Windows (os.stat mtime)
- Debounce: if multiple files change within 1s, reindex once

Test:
  Terminal 1: atlas watch
  Terminal 2: edit a vault page, save
  Expected: Terminal 1 prints reindex message within 3 seconds
```

---

## 4.4 Kategori Landing Sayfaları
**Dosya:** `tools/gen_categories.py`

**Claude Code prompt:**
```
Build tools/gen_categories.py

For each category in pages.json:
- Generate vault/{category}/index.html
- Lists all pages in that category as cards
- Card: title, description, slug link
- Same design system as ui/
- Auto-generated header comment (not hand-edited)
- Idempotent: regenerate on every atlas index run

Add to indexer.py: call gen_categories after writing pages.json

Test:
  Add 3 pages to html/ category
  atlas index
  Open vault/html/index.html in browser
  Expected: 3 page cards visible, links work
```

---

## 4.5 Sayfa İçi Prev/Next Navigasyon
**Dosya:** `tools/inject_nav.py`

**Claude Code prompt:**
```
Build tools/inject_nav.py

For every page in vault/:
- Inject prev/next navigation at bottom (within same category)
- Order: alphabetical by slug
- Shows: ← Previous Title | Next Title →
- Idempotent (replace if exists)
- Run after atlas index + atlas backlinks

Add to atlas.py:
  atlas nav   → runs inject_nav.py

Test:
  3 pages in same category
  atlas index → atlas nav
  Open middle page → both prev and next visible, links work
  First page → only next visible
  Last page → only prev visible
```

---

## Test Kriterleri (Phase 4 geçiş şartı)

- [ ] `atlas new "Test Page" test` → sayfa oluşuyor, index'e giriyor
- [ ] `atlas backlinks` → paneller doğru, tekrar çalıştırınca duplicate yok
- [ ] `atlas watch` → dosya değişince 3 saniye içinde reindex
- [ ] Kategori landing sayfaları browser'da açılıyor
- [ ] Prev/next nav first/last sayfalarda doğru davranıyor
