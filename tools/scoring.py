"""
Atlas OS — Shared keyword scoring + default exclusions.

Imported by both `cli/atlas.py` and `api/server.py`. Previously the function
was hand-duplicated so each file would stay independently runnable; the
duplication is no longer worth the sync risk now that both callers add
`tools/` to sys.path anyway.

Scoring weights (intentional):
  title    × 3
  headings × 2
  desc     × 2
  text     × 1
"""

# Page types excluded from keyword search by default. Callers can opt items
# back in via the `include` set in `_passes_default_filter`.
DEFAULT_EXCLUDE_TYPES = frozenset({"template", "agent-log", "agent-profile-source"})


def score(page: dict, terms: list[str]) -> int:
    title    = page.get('title', '').lower()
    headings = ' '.join(page.get('headings', [])).lower()
    desc     = page.get('description', '').lower()
    text     = page.get('text', '').lower()
    s        = 0
    for t in terms:
        if t in title:    s += 3
        if t in headings: s += 2
        if t in desc:     s += 2
        if t in text:     s += 1
    return s


def passes_default_filter(page: dict, include: set[str]) -> bool:
    """Apply default exclusions unless `include` opts a type back in."""
    ptype = page.get("type", "note")
    if ptype in DEFAULT_EXCLUDE_TYPES:
        return False
    if ptype == "archive" and "archive" not in include:
        return False
    return True
