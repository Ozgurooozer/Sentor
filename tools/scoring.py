"""
Sentor — Shared keyword scoring, default exclusions, and cosine similarity.

Canonical source. Import by every component that needs scoring or similarity.
"""

import math

DEFAULT_EXCLUDE_TYPES = frozenset({"template", "agent-log", "agent-profile-source"})


def score(page: dict, terms: list[str]) -> int:
    """TF-IDF-style keyword score. title(3) > headings/desc(2) > body(1)."""
    title = page.get("title", "").lower()
    headings = " ".join(page.get("headings", [])).lower()
    desc = page.get("description", "").lower()
    text = page.get("text", "").lower()
    s = 0
    for t in terms:
        if t in title:
            s += 3
        if t in headings:
            s += 2
        if t in desc:
            s += 2
        if t in text:
            s += 1
    return s


def passes_default_filter(page: dict, include: set[str]) -> bool:
    """Apply default exclusions; use `include` to opt types back in."""
    ptype = page.get("type", "note")
    if ptype in DEFAULT_EXCLUDE_TYPES and ptype not in include:
        return False
    if ptype == "archive" and "archive" not in include:
        return False
    return True


def cosine(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0
