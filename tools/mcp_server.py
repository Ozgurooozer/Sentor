#!/usr/bin/env python3
"""
Atlas OS — MCP stdio server

Exposes the Atlas vault (search + read) as a Model Context Protocol server
that any MCP-compatible client (Claude Code, Cursor, Continue, Cline, ...)
can connect to over stdio.

Why stdio + Python:
  - Zero dependencies (stdlib only — JSON-RPC framing on stdin/stdout).
  - IDE-independent: the vault index lives in `.index/pages.json` on disk,
    so this works whether or not the Tauri IDE is running.
  - Reuses `tools/scoring.py` so search behaviour matches the CLI + REST API.

Tools exposed:
  - vault_search       keyword search across the vault
  - vault_read         full text of a single page by id
  - vault_categories   list of category folders
  - vault_pages        flat list of all pages (id + title + category)

Registering with Claude Code (per-project .mcp.json or global config):
  {
    "mcpServers": {
      "atlas": {
        "command": "python",
        "args": ["C:/Atlas OS/tools/mcp_server.py"],
        "env": { "ATLAS_VAULT_ROOT": "C:/Atlas OS" }
      }
    }
  }

Code graph tools (code_search, code_explore, …) are NOT exposed here — the
graph index currently lives in the Tauri process. A future PR can either
extract a headless indexer or proxy these via the existing `.mcp-queue.json`
bridge (see `ide/src-tauri/src/modules/mcp.rs`).
"""

import json
import os
import sys
from pathlib import Path

# Force UTF-8 on the stdio channels. Vault pages routinely contain symbols
# (arrows, emoji, non-Latin scripts) that crash Windows's default cp1252
# stdout — the JSON-RPC framing would die mid-response and the client would
# see a silent disconnect. UTF-8 is what the MCP spec mandates anyway.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Resolve workspace root: env var wins, then walk up from this file.
ROOT = Path(
    os.environ.get("ATLAS_VAULT_ROOT")
    or Path(__file__).resolve().parent.parent
)
INDEX_FILE = ROOT / ".index" / "pages.json"

# Reuse the shared scoring module so this server, the CLI, and the REST API
# all behave the same.
sys.path.insert(0, str(ROOT / "tools"))
from scoring import (  # noqa: E402
    DEFAULT_EXCLUDE_TYPES,
    passes_default_filter,
    score,
)


# ── JSON-RPC framing ──────────────────────────────────────────────────────────

def send(msg: dict) -> None:
    sys.stdout.write(json.dumps(msg, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def reply(req_id, result: dict) -> None:
    send({"jsonrpc": "2.0", "id": req_id, "result": result})


def reply_error(req_id, code: int, message: str) -> None:
    send({"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}})


def log(msg: str) -> None:
    sys.stderr.write(f"[atlas-mcp] {msg}\n")


# ── Tool definitions ──────────────────────────────────────────────────────────

TOOLS = [
    {
        "name": "vault_search",
        "description": (
            "Keyword search across the Atlas vault. Returns the top-N matching "
            "pages with their score, title, category, and slug. Use this to "
            "discover whether the vault already has a page on a topic before "
            "answering from scratch."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search terms (space-separated)."},
                "limit": {"type": "number", "description": "Maximum results (default 5)."},
                "category": {"type": "string", "description": "Restrict to one category folder."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "vault_read",
        "description": (
            "Read the full plain-text content of one vault page by its id "
            "(format: category/slug). Use this after vault_search returns a "
            "promising hit."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "id": {"type": "string", "description": "Page id (category/slug)."},
            },
            "required": ["id"],
        },
    },
    {
        "name": "vault_categories",
        "description": "List all category folder names in the vault.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "vault_pages",
        "description": (
            "Flat listing of every page in the vault. Returns id, title, "
            "category for each. Use this when you need the full inventory "
            "(e.g. to summarise what the user has written about)."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "category": {"type": "string", "description": "Optional category filter."},
            },
        },
    },
]


# ── Vault access ──────────────────────────────────────────────────────────────

_pages_cache: list[dict] | None = None
_pages_mtime: float = 0.0


def load_pages() -> list[dict]:
    """Read `.index/pages.json` with a tiny mtime-based cache so repeated
    tools/call invocations don't re-parse the file every time."""
    global _pages_cache, _pages_mtime
    if not INDEX_FILE.exists():
        return []
    mtime = INDEX_FILE.stat().st_mtime
    if _pages_cache is not None and mtime == _pages_mtime:
        return _pages_cache
    try:
        data = json.loads(INDEX_FILE.read_text(encoding="utf-8"))
        _pages_cache = data.get("pages", [])
        _pages_mtime = mtime
        return _pages_cache
    except Exception as exc:
        log(f"index load failed: {exc}")
        return []


def _strip_html(raw: str) -> str:
    """Minimal HTML → text. Keeps newlines at block-tag boundaries.
    Independent copy of api/server.py's `_strip_to_text` — small enough that
    sharing isn't worth the import dance."""
    import re
    raw = re.sub(r"<(script|style|noscript)[^>]*>.*?</\1>", " ", raw,
                 flags=re.DOTALL | re.IGNORECASE)
    raw = re.sub(
        r"<(?:br|p|div|h[1-6]|li|tr|dt|dd|blockquote|section|article|header|footer|nav|main)[^>]*/?>",
        "\n", raw, flags=re.IGNORECASE,
    )
    raw = re.sub(r"<[^>]+>", "", raw)
    return re.sub(r"\n{3,}", "\n\n", raw).strip()


# ── Tool handlers ─────────────────────────────────────────────────────────────

def tool_vault_search(args: dict) -> dict:
    query = str(args.get("query", "")).strip().lower()
    if not query:
        return {"error": "query is required"}
    limit = int(args.get("limit") or 5)
    category = args.get("category")

    terms = [t for t in query.split() if t]
    pages = load_pages()
    if not pages:
        return {"error": "vault index missing — run `python tools/indexer.py` first"}

    results = []
    for p in pages:
        if not passes_default_filter(p, set()):
            continue
        if category and p.get("category") != category:
            continue
        s = score(p, terms)
        if s > 0:
            results.append({
                "id": p["id"],
                "title": p.get("title", ""),
                "category": p.get("category", ""),
                "slug": p.get("slug", ""),
                "score": s,
            })
    results.sort(key=lambda r: -r["score"])
    return {"query": query, "results": results[:limit]}


def tool_vault_read(args: dict) -> dict:
    page_id = str(args.get("id", "")).strip()
    if not page_id:
        return {"error": "id is required"}

    pages = load_pages()
    page = next((p for p in pages if p["id"] == page_id), None)
    if not page:
        return {"error": f"page not found: {page_id}"}

    src = ROOT / page.get("path", "")
    try:
        src_resolved = src.resolve()
        if not src_resolved.is_relative_to(ROOT.resolve()):
            return {"error": "page path escapes the vault root"}
        raw = src_resolved.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        return {"error": f"read failed: {exc}"}

    return {
        "id": page_id,
        "title": page.get("title", ""),
        "category": page.get("category", ""),
        "headings": page.get("headings", []),
        "content": _strip_html(raw),
    }


def tool_vault_categories(_args: dict) -> dict:
    pages = load_pages()
    cats = sorted({p.get("category", "") for p in pages if p.get("category")})
    return {"categories": cats}


def tool_vault_pages(args: dict) -> dict:
    category = args.get("category")
    pages = load_pages()
    out = []
    for p in pages:
        if p.get("type") in DEFAULT_EXCLUDE_TYPES:
            continue
        if category and p.get("category") != category:
            continue
        out.append({
            "id": p["id"],
            "title": p.get("title", ""),
            "category": p.get("category", ""),
        })
    return {"pages": out}


TOOL_HANDLERS = {
    "vault_search": tool_vault_search,
    "vault_read": tool_vault_read,
    "vault_categories": tool_vault_categories,
    "vault_pages": tool_vault_pages,
}


# ── Dispatcher ────────────────────────────────────────────────────────────────

def handle(req: dict) -> None:
    req_id = req.get("id")
    method = req.get("method")
    params = req.get("params") or {}

    if method == "initialize":
        reply(req_id, {
            "protocolVersion": "2024-11-05",
            "serverInfo": {"name": "atlas-os", "version": "0.1.0"},
            "capabilities": {"tools": {}},
        })
        return

    if method == "notifications/initialized":
        # Client signal — no response required.
        return

    if method == "tools/list":
        reply(req_id, {"tools": TOOLS})
        return

    if method == "tools/call":
        name = params.get("name")
        args = params.get("arguments") or {}
        handler = TOOL_HANDLERS.get(name)
        if not handler:
            reply_error(req_id, -32601, f"unknown tool: {name}")
            return
        try:
            result = handler(args)
        except Exception as exc:
            reply_error(req_id, -32603, f"tool {name} raised: {exc}")
            return
        # MCP wraps tool output in a content array. JSON text content is the
        # simplest interop — clients pretty-print it.
        reply(req_id, {
            "content": [
                {"type": "text", "text": json.dumps(result, ensure_ascii=False, indent=2)},
            ],
            "isError": "error" in result,
        })
        return

    # Other methods (ping, etc.) — politely refuse if they have an id.
    if req_id is not None:
        reply_error(req_id, -32601, f"unknown method: {method}")


def main() -> None:
    log(f"started — vault root: {ROOT}")
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as exc:
            log(f"bad JSON on stdin: {exc}")
            continue
        try:
            handle(req)
        except Exception as exc:
            log(f"handler crash: {exc}")
    log("stdin closed — exiting")


if __name__ == "__main__":
    main()
