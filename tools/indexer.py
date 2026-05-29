#!/usr/bin/env python3
"""
Atlas OS Indexer (v2 — flexible depth, type/scope, markdown support)

Scans vault/ and writes:
  .index/pages.json  — for CLI and API
  .index/pages.js    — for browser (loaded via <script src>, bypasses file:// CORS)

Usage:
    python tools/indexer.py
    python tools/indexer.py --changed-files vault/home/atlas-os/index.html,vault/agents/vault/log.md
"""

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path

ROOT      = Path(__file__).resolve().parent.parent
VAULT_DIR = ROOT / "vault"
INDEX_DIR = ROOT / ".index"
INDEX_FILE = INDEX_DIR / "pages.json"


# ── Type / scope derivation ───────────────────────────────────────────────────
# (glob_pattern, type, scope_fn) — first match wins. segments excludes filename.

# Rule = (depth_match, segments_to_match, type, scope_fn)
# depth_match: exact segment count INCLUDING the filename; None = any depth.
# Segment matching is positional and segment-aware (no fnmatch greediness).
# segment_to_match supports literal strings and "*" wildcard for one segment.
TYPE_RULES = [
    # 5-segment specific (agents/{a}/projects/{p}/...)
    (5, ("agents", "*", "projects", "*", "index.html"),
        "agent-project", lambda s: f"agent:{s[1]}"),
    (5, ("agents", "*", "projects", "*", "log.md"),
        "agent-project-log", lambda s: f"agent:{s[1]}"),
    (5, ("agents", "*", "projects", "*", "decisions.md"),
        "agent-project-decisions", lambda s: f"agent:{s[1]}"),
    # 5-segment meetings
    (5, ("agents", "*", "meetings", "*", "index.html"),
        "agent-meeting", lambda s: f"agent:{s[1]}"),
    # 3-segment agent root files
    (3, ("agents", "*", "index.html"),
        "agent-profile", lambda s: f"agent:{s[1]}"),
    (3, ("agents", "*", "state.md"),
        "agent-state", lambda s: f"agent:{s[1]}"),
    (3, ("agents", "*", "log.md"),
        "agent-log", lambda s: f"agent:{s[1]}"),
    (3, ("agents", "*", "decisions.md"),
        "agent-decisions", lambda s: f"agent:{s[1]}"),
    (3, ("agents", "*", "profile.md"),
        "agent-profile-source", lambda s: f"agent:{s[1]}"),
    # 3-segment meetings / templates
    (3, ("meetings", "*", "index.html"),
        "meeting", lambda s: "vault"),
    (3, ("templates", "*", "index.html"),
        "template", lambda s: "meta"),
    (3, ("templates", "*", "*"),  # any markdown/HTML in templates
        "template", lambda s: "meta"),
    # Prefix-based fallbacks (any depth)
    (None, ("archive",),  "archive",   lambda s: "vault"),
    (None, ("home",),     "note",      lambda s: "vault"),
    (None, ("projects",), "project",   lambda s: "vault"),
    (None, ("html",),     "reference", lambda s: "vault"),
]

DEFAULT_TYPE = "note"
DEFAULT_SCOPE = "vault"


def _segments_match(parts: tuple[str, ...], pattern: tuple[str, ...]) -> bool:
    if len(parts) != len(pattern):
        return False
    for actual, expected in zip(parts, pattern):
        if expected == "*":
            continue
        if expected != actual:
            return False
    return True


def _prefix_match(parts: tuple[str, ...], prefix: tuple[str, ...]) -> bool:
    return len(parts) >= len(prefix) and parts[:len(prefix)] == prefix


def _match_rule(parts: tuple[str, ...], segments: list[str]) -> tuple[str, str]:
    """parts = full segments INCLUDING filename. segments = directory parts only."""
    for depth, pattern, ptype, scope_fn in TYPE_RULES:
        if depth is None:
            if _prefix_match(parts, pattern):
                return ptype, scope_fn(segments)
        else:
            if _segments_match(parts, pattern):
                return ptype, scope_fn(segments)
    return DEFAULT_TYPE, DEFAULT_SCOPE


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
        self._htag:     str | None = None
        self._hbuf:     str       = ""

    def handle_starttag(self, tag, attrs):
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

    def handle_endtag(self, tag):
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

    def handle_data(self, data):
        if self._skip:
            return

        if self._in_title:
            self.title += data
            return

        text = data.strip()
        if not text:
            return

        if self._htag:
            self._hbuf += data

        self._texts.append(text)

    @property
    def text(self) -> str:
        raw = " ".join(self._texts)
        return " ".join(raw.split())[:3000]


# ── Markdown mini-parser (stdlib only) ────────────────────────────────────────

_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
_MD_HEADING_RE = re.compile(r"^(#{1,3})\s+(.+?)\s*$", re.MULTILINE)
_MD_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
_MD_CODE_FENCE_RE = re.compile(r"```.*?```", re.DOTALL)
_MD_INLINE_CODE_RE = re.compile(r"`[^`]*`")
_MD_FORMAT_RE = re.compile(r"[*_~`]+")
_GENERATED_BLOCK_RE = re.compile(
    r"<!--\s*generated:start\s*-->.*?<!--\s*generated:end\s*-->",
    re.DOTALL | re.IGNORECASE,
)


def _parse_yaml_lite(block: str) -> dict:
    """Tiny YAML — top-level key: value, lists with leading dash. No nesting."""
    out: dict = {}
    current_key: str | None = None
    current_list: list | None = None
    for line in block.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if line.startswith("  - ") or line.startswith("- "):
            val = line.lstrip("- ").strip().strip('"').strip("'")
            if current_list is not None:
                current_list.append(val)
            continue
        if ":" in line and not line.startswith(" "):
            key, _, val = line.partition(":")
            key = key.strip()
            val = val.strip()
            if not val:
                # next lines may form a list
                current_key = key
                current_list = []
                out[key] = current_list
            else:
                # strip quotes, parse bools/null
                if val.startswith("[") and val.endswith("]"):
                    inner = val[1:-1].strip()
                    out[key] = [x.strip().strip('"').strip("'") for x in inner.split(",") if x.strip()] if inner else []
                else:
                    v = val.strip('"').strip("'")
                    if v.lower() in ("true", "false"):
                        out[key] = (v.lower() == "true")
                    elif v.lower() in ("null", "~", ""):
                        out[key] = None
                    else:
                        out[key] = v
                current_key = None
                current_list = None
    return out


def _parse_markdown(content: str) -> dict:
    """Extract frontmatter, headings, links, body text from markdown."""
    frontmatter: dict = {}
    m = _FRONTMATTER_RE.match(content)
    body = content
    if m:
        frontmatter = _parse_yaml_lite(m.group(1))
        body = content[m.end():]

    headings = [h[1].strip() for h in _MD_HEADING_RE.findall(body)]
    links = [href for _, href in _MD_LINK_RE.findall(body)
             if not href.startswith(("http", "//", "#", "mailto:"))]

    text = _MD_CODE_FENCE_RE.sub(" ", body)
    text = _MD_INLINE_CODE_RE.sub(" ", text)
    text = _MD_LINK_RE.sub(r"\1", text)
    text = _MD_FORMAT_RE.sub("", text)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    text = " ".join(text.split())[:3000]

    title = frontmatter.get("title") or (headings[0] if headings else "")
    description = frontmatter.get("description", "")

    return {
        "title": title,
        "description": description,
        "headings": headings,
        "links": links,
        "text": text,
        "frontmatter": frontmatter,
    }


# ── Link resolver ─────────────────────────────────────────────────────────────

def _resolve_link(href: str, segments: list[str]) -> str | None:
    """Resolve relative href to a vault page ID (slash-joined segments)."""
    base = list(segments)
    for part in href.replace("\\", "/").split("/"):
        if part == "..":
            if base:
                base.pop()
        elif part in (".", "", "index.html") or part.endswith((".html", ".md")):
            pass
        else:
            base.append(part)
    if len(base) < 2:
        return None
    candidate = "/".join(base)
    if candidate == "/".join(segments):
        return None
    return candidate


# ── Per-file parsing ──────────────────────────────────────────────────────────

def _parse_file(path: Path, segments: list[str]) -> dict | None:
    parts = tuple(segments + [path.name])
    relpath = "/".join(parts)
    ptype, scope = _match_rule(parts, segments)

    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        print(f"  ! skip  {relpath}: {exc}")
        return None

    if path.suffix == ".html":
        # Strip generated blocks before parsing — generated content is derived,
        # indexing it would double-count and amplify churn during re-renders.
        clean = _GENERATED_BLOCK_RE.sub("", raw)
        parser = _PageParser()
        try:
            parser.feed(clean)
        except Exception as exc:
            print(f"  ! parse {relpath}: {exc}")
        title = parser.title.strip() or segments[-1]
        record = {
            "title":       title,
            "description": parser.description.strip(),
            "headings":    parser.headings,
            "links":       [resolved for resolved in
                            (_resolve_link(h, segments) for h in parser.links)
                            if resolved],
            "text":        parser.text,
            "frontmatter": {},
        }
    elif path.suffix == ".md":
        md = _parse_markdown(raw)
        title = md["title"] or segments[-1]
        record = {
            "title":       title,
            "description": md["description"],
            "headings":    md["headings"],
            "links":       [resolved for resolved in
                            (_resolve_link(h, segments) for h in md["links"])
                            if resolved],
            "text":        md["text"],
            "frontmatter": md["frontmatter"],
        }
    else:
        return None

    # ID = path segments minus trailing index.html; .md files keep stem
    if path.name == "index.html":
        page_id = "/".join(segments)
    else:
        page_id = "/".join(segments + [path.stem])

    content_hash = hashlib.sha1(raw.encode("utf-8")).hexdigest()
    mtime = datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%dT%H:%M:%S")

    record.update({
        "id":           page_id,
        "slug":         segments[-1] if segments else page_id,
        "category":     segments[0] if segments else "",
        "type":         ptype,
        "scope":        scope,
        "depth":        len(segments),
        "path":         f"vault/{relpath}",
        "url":          f"../vault/{'/'.join(segments)}/",
        "modified":     mtime,
        "content_hash": content_hash,
        "backlinks":    [],
    })
    return record


# ── File discovery ────────────────────────────────────────────────────────────

INDEXABLE_FILES = {"index.html", "state.md", "log.md", "decisions.md", "profile.md"}


def _is_indexable(path: Path) -> bool:
    if path.name in INDEXABLE_FILES:
        return True
    # Allow other .md inside meetings/templates dirs
    if path.suffix == ".md" and "meetings" in path.parts:
        return True
    return False


def _discover_files() -> list[tuple[Path, list[str]]]:
    if not VAULT_DIR.exists():
        return []
    out = []
    for path in sorted(VAULT_DIR.rglob("*")):
        if not path.is_file() or not _is_indexable(path):
            continue
        segments = list(path.relative_to(VAULT_DIR).parts[:-1])
        if not segments:
            continue
        out.append((path, segments))
    return out


# ── Full build ────────────────────────────────────────────────────────────────

def _resolve_backlinks(pages: list[dict]) -> None:
    id_map = {p["id"]: p for p in pages}
    seen = {p["id"]: set() for p in pages}
    for page in pages:
        for target in page.get("links", []):
            if target in id_map and page["id"] not in seen[target]:
                seen[target].add(page["id"])
                id_map[target]["backlinks"].append(page["id"])


def build_full() -> list[dict]:
    if not VAULT_DIR.exists():
        print(f"Error: vault/ not found at {VAULT_DIR}")
        sys.exit(1)
    files = _discover_files()
    if not files:
        print("vault/ has no indexable files.")
        return []
    print(f"Scanning {len(files)} file(s) in vault/ ...\n")
    pages: list[dict] = []
    for path, segments in files:
        rec = _parse_file(path, segments)
        if rec:
            pages.append(rec)
            label = rec["title"][:48]
            print(f"  + {rec['id']:<44}  [{rec['type']:<18}]  {label}")
    _resolve_backlinks(pages)
    return pages


def build_incremental(changed_paths: list[Path]) -> list[dict]:
    """Re-parse only the given files; merge into existing pages.json."""
    existing: list[dict] = []
    if INDEX_FILE.exists():
        try:
            existing = json.loads(INDEX_FILE.read_text(encoding="utf-8")).get("pages", [])
        except Exception:
            existing = []
    by_id = {p["id"]: p for p in existing}

    # Map changed path to (path, segments, file_id_if_indexable)
    deleted_ids: set[str] = set()
    updates: dict[str, dict] = {}

    for cp in changed_paths:
        if not cp.exists():
            # Find ID by path match in existing
            for pid, p in by_id.items():
                if Path(p["path"]) == cp.relative_to(ROOT) if cp.is_absolute() else Path(p["path"]) == cp:
                    deleted_ids.add(pid)
            continue
        if not _is_indexable(cp):
            continue
        try:
            segments = list(cp.relative_to(VAULT_DIR).parts[:-1])
        except ValueError:
            continue
        if not segments:
            continue
        rec = _parse_file(cp, segments)
        if rec:
            updates[rec["id"]] = rec

    # Merge: drop deleted, replace updated, keep rest
    new_pages = [p for p in existing if p["id"] not in deleted_ids and p["id"] not in updates]
    new_pages.extend(updates.values())
    # backlinks: cheaper to rebuild from scratch
    for p in new_pages:
        p["backlinks"] = []
    _resolve_backlinks(new_pages)
    print(f"  incremental: {len(updates)} updated, {len(deleted_ids)} deleted, "
          f"{len(new_pages)} total")
    return new_pages


# ── Output ────────────────────────────────────────────────────────────────────

def write_index(pages: list[dict]) -> None:
    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    index = {
        "schema_version": 2,
        "generated": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "count":     len(pages),
        "pages":     pages,
    }
    INDEX_FILE.write_text(
        json.dumps(index, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (INDEX_DIR / "pages.js").write_text(
        "window.ATLAS_INDEX = "
        + json.dumps(index, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"\n  {len(pages)} page(s) indexed")
    print(f"  {INDEX_FILE}")
    print(f"  {INDEX_DIR / 'pages.js'}")


# ── Entry point ───────────────────────────────────────────────────────────────

def run(changed_files: list[str] | None = None) -> None:
    if changed_files:
        paths = [Path(c) if Path(c).is_absolute() else (ROOT / c) for c in changed_files]
        pages = build_incremental(paths)
    else:
        pages = build_full()
    if pages or changed_files:
        write_index(pages)


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Atlas OS indexer")
    p.add_argument(
        "--changed-files",
        help="Comma-separated paths to re-parse incrementally (relative to repo root or absolute)",
    )
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    changed = [c.strip() for c in args.changed_files.split(",")] if args.changed_files else None
    run(changed)
