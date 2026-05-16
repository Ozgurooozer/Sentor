#!/usr/bin/env python3
"""
Atlas OS — Semantic Embedder
Reads .index/pages.json, embeds every page with all-MiniLM-L6-v2,
writes .index/embeddings.json.

Usage:
    python tools/embedder.py              # embed all pages
    python tools/embedder.py --check      # verify installation only

Requirements:
    pip install sentence-transformers
Model (~22 MB) downloads automatically on first run, then works offline.
"""

import json
import math
import sys
from pathlib import Path

MODEL_NAME = "all-MiniLM-L6-v2"

ROOT       = Path(__file__).resolve().parent.parent
INDEX_FILE = ROOT / ".index" / "pages.json"
EMBED_FILE = ROOT / ".index" / "embeddings.json"


# ── Helpers ────────────────────────────────────────────────────────────────────

def _load_model():
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        print(
            "  sentence-transformers not installed.\n"
            "  Run: pip install sentence-transformers",
            file=sys.stderr,
        )
        sys.exit(1)
    print(f"  Loading model: {MODEL_NAME} (first run downloads ~22 MB) …")
    return SentenceTransformer(MODEL_NAME)


def _page_text(page: dict) -> str:
    """Combine title + description + body into one embedding input.

    MiniLM truncates at ~256 tokens internally; we cap the body excerpt at
    1 000 chars so we don't feed it pages that are mostly boilerplate CSS.
    """
    parts = [
        page.get("title",       ""),
        page.get("description", ""),
        page.get("text",        "")[:1000],
    ]
    return ". ".join(p for p in parts if p).strip()


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na  = math.sqrt(sum(x * x for x in a))
    nb  = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


# ── Public API ─────────────────────────────────────────────────────────────────

def build(model=None) -> None:
    """Embed all vault pages and write .index/embeddings.json."""
    if not INDEX_FILE.exists():
        print(f"  Index not found: {INDEX_FILE}\n  Run: python tools/indexer.py", file=sys.stderr)
        sys.exit(1)

    pages = json.loads(INDEX_FILE.read_text(encoding="utf-8")).get("pages", [])
    if not pages:
        print("  No pages found in index. Add pages to vault/ and re-index first.")
        return

    if model is None:
        model = _load_model()

    texts = [_page_text(p) for p in pages]
    print(f"  Embedding {len(pages)} page(s) …")
    vecs = model.encode(texts, show_progress_bar=True, convert_to_numpy=True)

    records = [
        {"id": p["id"], "embedding": vec.tolist()}
        for p, vec in zip(pages, vecs)
    ]

    EMBED_FILE.parent.mkdir(parents=True, exist_ok=True)
    EMBED_FILE.write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
    print(f"  Saved -> .index/embeddings.json  ({len(records)} embeddings)")


def search(query: str, limit: int = 5, model=None) -> list[dict]:
    """Return top-K page IDs ranked by cosine similarity to the query.

    Returns a list of {"id": "category/slug", "score": float}.
    Returns [] if embeddings haven't been built yet.
    """
    if not EMBED_FILE.exists():
        return []

    records = json.loads(EMBED_FILE.read_text(encoding="utf-8"))
    if not records:
        return []

    if model is None:
        model = _load_model()

    q_vec = model.encode([query], convert_to_numpy=True)[0].tolist()

    scored = [(r["id"], cosine(q_vec, r["embedding"])) for r in records]
    scored.sort(key=lambda x: x[1], reverse=True)

    return [
        {"id": page_id, "score": round(score, 4)}
        for page_id, score in scored[:limit]
        if score > 0.0
    ]


# ── CLI entry point ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if "--check" in sys.argv:
        try:
            import sentence_transformers  # noqa: F401
            print(f"  sentence-transformers is installed. Model: {MODEL_NAME}")
        except ImportError:
            print("  NOT installed. Run: pip install sentence-transformers")
        sys.exit(0)

    build()
