#!/usr/bin/env python3
"""
Atlas OS Indexer
Scans vault/ and writes:
  .index/pages.json  — for CLI and API
  .index/pages.js    — for browser (loaded via <script src>, bypasses file:// CORS)
"""

import json
import sys
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path

ROOT      = Path(__file__).resolve().parent.parent
VAULT_DIR = ROOT / "vault"
INDEX_DIR = ROOT / ".index"


# ── HTML parser ───────────────────────────────────────────────────────────────

class _PageParser(HTMLParser):
    """Extract title, description, headings, body text, and local links."""

    _SKIP  = frozenset({"script", "style", "noscript"})
    _HEADS = frozenset({"h1", "h2", "h3"})

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title       = ""
        self.description = ""
        self.headings: list[str] = []
        self.links:    list[str] = []

        self._texts:    list[str] = []
        self._in_title: bool      = False
        self._skip:     int       = 0
        self._htag:     str|None  = None
        self._hbuf:     str       = ""

    def handle_starttag(self, tag: str, attrs: list) -> None:
        tag = tag.lower()
        d   = dict(attrs)

        if tag in self._SKIP:
            self._skip += 1
            return

        if tag == "meta" and d.get("name", "").lower() == "description":
            self.description = d.get("content", "")
            return

        if tag == "title":
            self._in_title = True
            return

        # Only open a heading block if we're not already inside one
        if tag in self._HEADS and not self._skip and not self._htag:
            self._htag = tag
            self._hbuf = ""
            return

        if tag == "a":
            href = d.get("href", "")
            if href and not href.startswith(
                ("http", "//", "#", "mailto:", "javascript:", "data:")
            ):
                self.links.append(href)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()

        if tag in self._SKIP:
            self._skip = max(0, self._skip - 1)
            return

        if tag == "title":
            self._in_title = False
            return

        if tag == self._htag:
            h = self._hbuf.strip()
            if h:
                self.headings.append(h)
            self._htag = None
            self._hbuf = ""

    def handle_data(self, data: str) -> None:
        if self._skip:
            return

        if self._in_title:
            self.title += data
            return

        text = data.strip()
        if not text:
            return

        if self._htag:
            self._hbuf += data      # accumulate heading text

        self._texts.append(text)    # all body text (headings included)

    @property
    def text(self) -> str:
        raw = " ".join(self._texts)
        return " ".join(raw.split())[:3000]   # normalize whitespace, cap size


# ── Link resolver ─────────────────────────────────────────────────────────────

def _resolve_link(href: str, category: str, slug: str) -> str | None:
    """
    Walk the relative href from vault/category/slug/ and return a page ID
    (category/slug) if it points to a different vault entry. Returns None
    for same-page resources (.html files, anchors, sub-page assets).
    """
    base: list[str] = [category, slug]

    for part in href.replace("\\", "/").split("/"):
        if part == "..":
            if base:
                base.pop()
        elif part in (".", "", "index.html") or part.endswith(".html"):
            pass    # skip self-links and sibling .html sub-pages
        else:
            base.append(part)

    if len(base) < 2:
        return None

    # Return None if it resolved back to the current page
    if base[0] == category and base[1] == slug:
        return None

    return f"{base[0]}/{base[1]}"


# ── Core indexing ─────────────────────────────────────────────────────────────

def _parse_page(html_file: Path) -> tuple[_PageParser, str]:
    content = html_file.read_text(encoding="utf-8", errors="replace")
    parser  = _PageParser()
    parser.feed(content)
    return parser


def build_index() -> list[dict]:
    if not VAULT_DIR.exists():
        print(f"Error: vault/ not found at {VAULT_DIR}")
        print("Create vault/ and add pages, then run again.")
        sys.exit(1)

    html_files = sorted(VAULT_DIR.rglob("index.html"))

    if not html_files:
        print("vault/ is empty — add pages first.")
        return []

    print(f"Scanning {len(html_files)} file(s) in vault/ ...\n")

    pages: list[dict] = []

    for html_file in html_files:
        parts = html_file.relative_to(VAULT_DIR).parts
        # Valid structure: category/slug/index.html (exactly 3 parts)
        if len(parts) != 3:
            continue

        category, slug = parts[0], parts[1]
        page_id        = f"{category}/{slug}"

        try:
            parser = _parse_page(html_file)
        except OSError as exc:
            print(f"  ! skip  {page_id}: {exc}")
            continue
        except Exception as exc:           # noqa: BLE001
            print(f"  ! parse {page_id}: {exc}")
            parser = _PageParser()          # use empty parser on failure

        mtime = datetime.fromtimestamp(
            html_file.stat().st_mtime
        ).strftime("%Y-%m-%dT%H:%M:%S")

        raw_links = (_resolve_link(h, category, slug) for h in parser.links)
        links     = list(dict.fromkeys(lnk for lnk in raw_links if lnk))

        page = {
            "id":          page_id,
            "slug":        slug,
            "title":       parser.title.strip() or slug,
            "description": parser.description.strip(),
            "category":    category,
            "path":        f"vault/{category}/{slug}/index.html",
            "url":         f"../vault/{category}/{slug}/",
            "text":        parser.text,
            "headings":    parser.headings,
            "links":       links,
            "backlinks":   [],
            "modified":    mtime,
        }
        pages.append(page)

        label = (parser.title.strip() or slug)[:52]
        print(f"  + {page_id:<38}  {label}")

    # Resolve backlinks in a second pass
    id_map = {p["id"]: p for p in pages}
    for page in pages:
        for target_id in page["links"]:
            if target_id in id_map:
                bl = id_map[target_id]["backlinks"]
                if page["id"] not in bl:
                    bl.append(page["id"])

    return pages


# ── Output ────────────────────────────────────────────────────────────────────

def write_index(pages: list[dict]) -> None:
    INDEX_DIR.mkdir(parents=True, exist_ok=True)

    index = {
        "generated": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "count":     len(pages),
        "pages":     pages,
    }

    # pages.json — machine-readable, for CLI and future HTTP API
    json_path = INDEX_DIR / "pages.json"
    json_path.write_text(
        json.dumps(index, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # pages.js — loaded via <script src> in the browser UI.
    # A <script src> tag is not subject to file:// CORS restrictions,
    # so the browser UI works without any local server.
    js_path = INDEX_DIR / "pages.js"
    js_path.write_text(
        "window.ATLAS_INDEX = "
        + json.dumps(index, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )

    print(f"\n  {len(pages)} page(s) indexed")
    print(f"  {json_path}")
    print(f"  {js_path}")


# ── Entry point ───────────────────────────────────────────────────────────────

def run() -> None:
    pages = build_index()
    if pages:
        write_index(pages)


if __name__ == "__main__":
    run()
