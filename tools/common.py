"""
Shared scoring and similarity utilities for Atlas OS Python components.

Both api/server.py and cli/atlas.py duplicate these functions so each file
stays independently runnable. This module is the canonical source — keep
api/server.py, cli/atlas.py, and mcp/server.py in sync with any changes here.
"""

import math


# ── Keyword scoring ───────────────────────────────────────────────────────────

DEFAULT_EXCLUDE_TYPES = frozenset({"template", "agent-log", "agent-profile-source"})


def score(page: dict, terms: list[str]) -> int:
    """TF-IDF-style keyword score. title(3) > headings/desc(2) > body(1)."""
    title    = page["title"].lower()
    headings = " ".join(page.get("headings", [])).lower()
    desc     = page.get("description", "").lower()
    text     = page.get("text", "").lower()
    s = 0
    for t in terms:
        if t in title:    s += 3
        if t in headings: s += 2
        if t in desc:     s += 2
        if t in text:     s += 1
    return s


def passes_default_filter(page: dict, include: set[str]) -> bool:
    """Return True if the page should be included in default search results."""
    ptype = page.get("type", "note")
    if ptype in DEFAULT_EXCLUDE_TYPES and ptype not in include:
        return False
    return True


# ── Cosine similarity ─────────────────────────────────────────────────────────

def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na  = math.sqrt(sum(x * x for x in a))
    nb  = math.sqrt(sum(x * x for x in b))
    return dot / (na * nb) if na and nb else 0.0
