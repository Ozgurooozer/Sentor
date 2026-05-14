# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

**Re-index the vault** (run after adding/editing pages):
```bash
python tools/indexer.py
```

**Open the search UI** — open `ui/index.html` directly in a browser. No server needed; the `file://` protocol works because `pages.js` loads the index as `window.ATLAS_INDEX` (avoids CORS).

**Install global design system** (only needed once per machine):
```bash
cd interface-setup && bash install.sh
```

No build step, no `npm install`, no virtual environment.

---

## Architecture

Atlas OS is a zero-dependency personal knowledge base:

```
vault/{category}/{slug}/index.html   ← source of truth; category = folder name
    │
tools/indexer.py                     ← parses HTML, builds index
    │
.index/pages.json                    ← machine-readable (CLI, API)
.index/pages.js                      ← browser-loadable (window.ATLAS_INDEX)
    │
ui/index.html + app.js + style.css   ← client-side fuzzy search (Fuse.js CDN)
cli/atlas.py                         ← planned Phase 2
api/server.py                        ← planned Phase 2
```

**indexer.py** does a two-pass scan: first pass extracts title, description, h1–h3, body text (capped 3000 chars), and local links per page; second pass resolves backlinks across all pages. Output: both `pages.json` and `pages.js`.

**app.js** is a 3-state view machine: `empty` (no query) → `no-results` → `results`. Category nav is built once at boot; only active state refreshes on filter change. Fuse.js weights: title (3) > headings/description (2) > body (1), threshold 0.35. All user content goes through `textContent`; only the category badge uses `innerHTML` after `escapeHtml()`.

**Vault page format** — each page lives at `vault/{category}/{slug}/index.html`. The indexer reads `<title>`, `<meta name="description">`, `<h1>`–`<h3>`, and body text. Relative links between pages become backlinks.

---

## Design System

Read `interface-setup/.interface-design/system.md` (also installed at `~/.interface-design/system.md`) before touching any UI. Key rules:

**Color tokens** (dark OS theme):
- `bg-base` #0a0a0a → `bg-surface` #111111 → `bg-elevated` #1a1a1a → `bg-overlay` #222222
- `border-subtle` #2a2a2a, `border-active` #404040
- `text-primary` #f5f5f5, `text-secondary` #888888, `text-tertiary` #555555
- `accent` #5b8def, `accent-hover` #4a7de0

**Depth:** Border-only — no `box-shadow` anywhere. Single exception: focus ring (`ring-2 ring-accent/40`).

**Typography:** `system-ui` font stack only. No Google Fonts.

**Transitions:** 150ms ease-out only. No complex animations.

**Forbidden:** gradient backgrounds, box-shadows, colorful large blocks, rounded corners beyond `rounded-lg`, external animation libraries.

---

## Philosophy

- Fewer lines > more lines; readable > clever; working > perfect
- Zero dependencies: Python stdlib only for indexing; CDN for Tailwind and Fuse.js; no npm, no pip
- Before creating any new component, state the spacing/color/depth decisions and get approval
- Warn when you see design inconsistencies against `system.md`
- Never suggest unnecessary dependencies

---

## Roadmap Context

Phase 1 (browser UI + indexer) is complete. Phase 2 adds `cli/atlas.py` and `api/server.py` using Python stdlib only. Phase 3 integrates Ollama tool-calling (`tools/ollama-tools.json`) for agent workflows. The `.last/` directory contains old UI examples that will be migrated to `vault/` in Phase 2.
