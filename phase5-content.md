# Atlas OS — Phase 5: İçerik ve Vault Kurulumu

## Hedef
Sistemi gerçek bilgi tabanıyla doldurmak.
AI ile sayfa üretimi, mevcut notları import etmek, vault'u büyütmek.

---

## 5.1 Atlas OS Landing Page (vault'un ilk sayfası)
**Dosya:** `vault/atlas-os/index.html`

Claude Design tool ile tasarlandı (ayrı iş akışı).
Tamamlanınca buraya koy, `atlas index` çalıştır.

**Test:**
```
atlas search "atlas os"  → 1 result
atlas open atlas-os/atlas-os  → landing page açılıyor
```

---

## 5.2 AI ile Sayfa Üretici
**Dosya:** `tools/gen_page.py`

**Claude Code prompt:**
```
Build tools/gen_page.py

Uses Ollama (localhost:11434) with qwen2.5-coder to generate vault pages.

Usage:
  python tools/gen_page.py "JavaScript Promises" js
  python tools/gen_page.py "Docker Basics" devops --model llama3.2

Behavior:
1. Sends prompt to Ollama:
   "Generate a comprehensive HTML knowledge page about {topic}.
    Use this exact structure:
    - <title>{topic}</title>
    - <meta name="description"> with one sentence summary
    - <h1> main title
    - <h2> sections: Overview, Key Concepts, Examples, Related Topics
    - Plain semantic HTML, dark background #0a0a0a, system-ui font
    - No external dependencies
    Output ONLY the HTML, no explanation."
2. Saves to vault/{category}/{slug}/index.html
3. Runs atlas index automatically
4. Prints: "Generated: vault/{category}/{slug}/"

Test:
  python tools/gen_page.py "CSS Grid" css
  atlas search "css grid" → 1 result
  Open page → readable, structured content
```

---

## 5.3 Başlangıç Vault İçeriği
Sistemi test etmek için minimum 10 sayfa.

**Claude Code prompt:**
```
Using gen_page.py, generate starter vault pages for these topics:

Category: html
- Semantic HTML
- HTML Forms
- Web Components

Category: css
- CSS Grid
- CSS Variables
- Flexbox

Category: js
- JavaScript Promises
- ES Modules
- Web APIs

Category: tools
- Git Basics
- Terminal Commands

Run: python tools/gen_page.py "{topic}" {category} for each.
After all generated: atlas index
Verify: atlas list → 11 pages minimum
```

---

## 5.4 Markdown Import (isteğe bağlı)
Obsidian veya başka yerdeki eski notları vault'a taşımak için.

**Claude Code prompt:**
```
Build tools/import_md.py

Converts a markdown file to Atlas OS vault page format.

Usage:
  python tools/import_md.py notes/my-note.md html

Behavior:
- Reads markdown file
- Extracts title from first # heading (or filename)
- Converts markdown to semantic HTML (stdlib only, no markdown lib):
  - # → <h1>, ## → <h2>, ### → <h3>
  - **bold** → <strong>, *italic* → <em>
  - ``` code ``` → <pre><code>
  - Paragraphs → <p>
- Wraps in Atlas page template with design system styles
- Saves to vault/{category}/{slug}/index.html

Test:
  Create a test.md with headings, bold, code block
  python tools/import_md.py test.md html
  atlas index → page searchable
  Open in browser → renders correctly
```

---

## Test Kriterleri (Phase 5 geçiş şartı)

- [ ] Landing page vault'ta, aranabiliyor
- [ ] `gen_page.py` ile 10+ sayfa üretildi
- [ ] `atlas list` → 11+ sayfa
- [ ] Tüm kategorilerde search çalışıyor
- [ ] `import_md.py` markdown'ı doğru HTML'e çeviriyor
