#!/usr/bin/env python3
"""
Sentor — Semantic Embedder (v2 — Ollama-only, incremental, scope-aware)

Reads .index/pages.json, embeds every page, writes .index/embeddings.json.
Ollama is the only backend. If Ollama is unavailable the embedder degrades
to a no-op and prints a one-line install hint — search will fall back to
keyword scoring at the API layer.

Config (.sentor-embed.json, optional):
  { "ollamaUrl": "http://localhost:11434", "ollamaModel": "all-minilm" }

Usage:
    python tools/embedder.py               # build / incremental update
    python tools/embedder.py --check       # report status, no embedding
    python tools/embedder.py --force       # rebuild every embedding
"""

import argparse
import hashlib
import json
import sys
import urllib.request
import urllib.error
from pathlib import Path

ROOT        = Path(__file__).resolve().parent.parent
INDEX_FILE  = ROOT / ".index" / "pages.json"
EMBED_FILE  = ROOT / ".index" / "embeddings.json"
CONFIG_FILE = ROOT / ".sentor-embed.json"

DEFAULT_URL = "http://localhost:11434"
DEFAULT_MODEL = "all-minilm"

# Types we never embed — full-text only.
NON_EMBEDDABLE_TYPES = {"agent-log", "agent-project-log", "template", "agent-profile-source"}

INSTALL_HINT = (
    "  Ollama not reachable. Install: https://ollama.com  then run:\n"
    "    ollama pull all-minilm\n"
    "  Semantic search disabled — keyword search remains active."
)

sys.path.insert(0, str(ROOT / "tools"))
from scoring import cosine  # noqa: E402


# ── Config ────────────────────────────────────────────────────────────────────

def _load_config() -> tuple[str, str]:
    if CONFIG_FILE.exists():
        try:
            cfg = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            return cfg.get("ollamaUrl", DEFAULT_URL), cfg.get("ollamaModel", DEFAULT_MODEL)
        except Exception as exc:
            print(f'  [embedder] config parse error, using defaults: {exc}', file=sys.stderr)
    return DEFAULT_URL, DEFAULT_MODEL


# ── Helpers ───────────────────────────────────────────────────────────────────

def _page_text(page: dict, max_chars: int = 600) -> str:
    parts = [
        page.get("title", ""),
        page.get("description", ""),
        page.get("text", ""),
    ]
    joined = ". ".join(p for p in parts if p).strip()
    return joined[:max_chars]


# ── Ollama backend ────────────────────────────────────────────────────────────

class OllamaUnavailable(RuntimeError):
    pass


def _ollama_embed(text: str, url: str, model: str) -> list[float]:
    payload = json.dumps({"model": model, "input": text}).encode()
    req = urllib.request.Request(
        f"{url.rstrip('/')}/api/embed",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            vecs = data.get("embeddings", [])
            if not vecs:
                raise OllamaUnavailable(f"Ollama returned no embedding (model {model} not pulled?)")
            return vecs[0]
    except urllib.error.URLError as e:
        raise OllamaUnavailable(f"Ollama not reachable at {url}: {e}")


def _ollama_ping(url: str) -> bool:
    try:
        with urllib.request.urlopen(f"{url.rstrip('/')}/api/tags", timeout=2) as resp:
            return resp.status == 200
    except Exception:
        return False


# ── Existing embeddings ───────────────────────────────────────────────────────

def _load_existing() -> dict[str, dict]:
    if not EMBED_FILE.exists():
        return {}
    try:
        data = json.loads(EMBED_FILE.read_text(encoding="utf-8"))
        # Support both old format (list) and new format (dict with "records" key)
        records = data.get("records", data) if isinstance(data, dict) else data
        return {r["id"]: r for r in records if "id" in r}
    except Exception as exc:
        print(f'  [embedder] could not load existing embeddings: {exc}', file=sys.stderr)
        return {}


def _save(records: list[dict]) -> None:
    EMBED_FILE.parent.mkdir(parents=True, exist_ok=True)
    output = {
        "schema_version": 1,
        "model": "all-minilm",
        "dimensions": 384,
        "count": len(records),
        "records": records,
    }
    EMBED_FILE.write_text(
        json.dumps(output, ensure_ascii=False),
        encoding="utf-8",
    )


# ── Build ─────────────────────────────────────────────────────────────────────

def build(force: bool = False) -> None:
    if not INDEX_FILE.exists():
        print(f"  Index not found: {INDEX_FILE}\n  Run: python tools/indexer.py",
              file=sys.stderr)
        sys.exit(1)

    pages = json.loads(INDEX_FILE.read_text(encoding="utf-8")).get("pages", [])
    embeddable = [p for p in pages if p.get("type") not in NON_EMBEDDABLE_TYPES]
    if not embeddable:
        print("  No embeddable pages in index.")
        return

    url, model = _load_config()
    if not _ollama_ping(url):
        print(INSTALL_HINT)
        # Don't fail — leave existing embeddings.json untouched.
        return

    existing = {} if force else _load_existing()
    kept: list[dict] = []
    to_embed: list[tuple[dict, str, str]] = []

    for page in embeddable:
        text = _page_text(page)
        # content_hash already on the page record; if missing fall back to text hash
        h = page.get("content_hash") or hashlib.sha1(text.encode()).hexdigest()
        prev = existing.get(page["id"])
        if prev and prev.get("hash") == h and "embedding" in prev:
            kept.append({
                "id":        page["id"],
                "hash":      h,
                "scope":     page.get("scope", "vault"),
                "type":      page.get("type", "note"),
                "embedding": prev["embedding"],
            })
        else:
            to_embed.append((page, h, text))

    print(f"  Backend : ollama  ({model} @ {url})")
    print(f"  Cached  : {len(kept)}  Re-embed: {len(to_embed)}")

    for i, (page, h, text) in enumerate(to_embed, 1):
        print(f"  [{i}/{len(to_embed)}] {page['id']}", end="\r")
        try:
            vec = _ollama_embed(text, url, model)
        except OllamaUnavailable as e:
            print(f"\n  {e}")
            print(INSTALL_HINT)
            # save what we have so far + everything we kept
            _save(kept)
            return
        kept.append({
            "id":        page["id"],
            "hash":      h,
            "scope":     page.get("scope", "vault"),
            "type":      page.get("type", "note"),
            "embedding": vec,
        })

    print()
    _save(kept)
    print(f"  Saved -> {EMBED_FILE.name}  ({len(kept)} embeddings)")


# ── Search ────────────────────────────────────────────────────────────────────

def search(
    query: str,
    limit: int = 5,
    scope: str | None = None,
    exclude_types: set[str] | None = None,
) -> list[dict]:
    if not EMBED_FILE.exists():
        return []
    exclude_types = exclude_types or {"template", "agent-log"}
    data = json.loads(EMBED_FILE.read_text(encoding="utf-8"))
    records = data.get("records", data) if isinstance(data, dict) else data
    filtered = [
        r for r in records
        if r.get("type") not in exclude_types
        and (scope is None or r.get("scope") == scope)
    ]
    if not filtered:
        return []
    url, model = _load_config()
    if not _ollama_ping(url):
        return []
    try:
        q_vec = _ollama_embed(query, url, model)
    except OllamaUnavailable:
        return []
    scored = [(r["id"], cosine(q_vec, r["embedding"])) for r in filtered]
    scored.sort(key=lambda x: x[1], reverse=True)
    return [
        {"id": pid, "score": round(s, 4)}
        for pid, s in scored[:limit]
        if s > 0.0
    ]


# ── CLI ───────────────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Sentor embedder (Ollama-only)")
    p.add_argument("--check", action="store_true",
                   help="Report backend status, no embedding")
    p.add_argument("--force", action="store_true",
                   help="Re-embed every page, ignore cache")
    return p.parse_args()


def _check() -> None:
    url, model = _load_config()
    print(f"  URL    : {url}")
    print(f"  Model  : {model}")
    if _ollama_ping(url):
        print("  Status : Ollama reachable.")
    else:
        print("  Status : Ollama NOT reachable.")
        print(INSTALL_HINT)


if __name__ == "__main__":
    args = _parse_args()
    if args.check:
        _check()
    else:
        build(force=args.force)
