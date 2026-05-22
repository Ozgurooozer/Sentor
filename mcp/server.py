#!/usr/bin/env python3
"""
Atlas OS — MCP Server
  Exposes Atlas OS tools via Model Context Protocol (JSON-RPC 2.0).

  Stdio transport (Claude Desktop, Cursor, VS Code, any MCP client):
    python mcp/server.py

  HTTP transport (REST + MCP, port 4244):
    python mcp/server.py --http [port]

  Simple REST tool call (no MCP client needed):
    curl -X POST http://localhost:4244/tools/vault_search \
         -H "Content-Type: application/json" \
         -d '{"query": "canvas", "limit": 5}'

  Claude Desktop config  (~/.claude/claude_desktop_config.json):
    {
      "mcpServers": {
        "atlas-os": {
          "command": "python",
          "args": ["C:/Atlas OS/mcp/server.py"],
          "cwd": "C:/Atlas OS"
        }
      }
    }
"""

import html as _html
import json
import math
import os
import re
import subprocess
import sys
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT       = Path(__file__).resolve().parent.parent
VAULT_DIR  = ROOT / "vault"
INDEX_FILE = ROOT / ".index" / "pages.json"
EMBED_FILE = ROOT / ".index" / "embeddings.json"
QUEUE_FILE = ROOT / ".mcp-queue.json"
STATE_FILE = ROOT / ".ide-state.json"

MCP_VERSION = "2024-11-05"
SERVER_NAME = "atlas-os"
SERVER_VER  = "1.0.0"

# ── Auth + I/O utils ───────────────────────────────────────────────────────────
sys.path.insert(0, str(ROOT / "tools"))
from io_utils import get_or_create_token, write_atomic  # noqa: E402

_API_TOKEN = get_or_create_token()

_ALLOWED_ORIGINS = frozenset({
    "tauri://localhost",
    "https://tauri.localhost",
    "http://localhost:1420",
    "http://127.0.0.1:1420",
})

# RFC 1918 + link-local + loopback block (SSRF guard)
import ipaddress as _ipaddress

_BLOCKED_NETS = [
    _ipaddress.ip_network("10.0.0.0/8"),
    _ipaddress.ip_network("172.16.0.0/12"),
    _ipaddress.ip_network("192.168.0.0/16"),
    _ipaddress.ip_network("169.254.0.0/16"),
    _ipaddress.ip_network("127.0.0.0/8"),
    _ipaddress.ip_network("::1/128"),
    _ipaddress.ip_network("fc00::/7"),
]

_SAFE_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


# ── Shared helpers (duplicated from api/server.py for standalone operation) ────

DEFAULT_EXCLUDE = frozenset({"template", "agent-log", "agent-profile-source"})

_pages_cache: list[dict] = []
_pages_mtime: float = 0.0


def _load_pages() -> list[dict]:
    global _pages_cache, _pages_mtime
    try:
        mtime = INDEX_FILE.stat().st_mtime
    except OSError:
        return []
    if mtime != _pages_mtime:
        try:
            data = json.loads(INDEX_FILE.read_text(encoding="utf-8"))
            _pages_cache = data.get("pages", [])
            _pages_mtime = mtime
        except Exception:
            pass
    return _pages_cache


def _score(page: dict, terms: list[str]) -> int:
    title    = page["title"].lower()
    headings = " ".join(page.get("headings", [])).lower()
    desc     = page.get("description", "").lower()
    text     = page.get("text", "").lower()
    score    = 0
    for t in terms:
        if t in title:    score += 3
        if t in headings: score += 2
        if t in desc:     score += 2
        if t in text:     score += 1
    return score


_BLOCK = re.compile(r"<(?:br|p|div|h[1-6]|li|tr|blockquote)[^>]*/?>", re.I)
_SKIP  = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.DOTALL | re.I)
_TAG   = re.compile(r"<[^>]+>")


def _to_text(raw: str) -> str:
    t = _SKIP.sub(" ", raw)
    t = _BLOCK.sub("\n", t)
    t = _TAG.sub("", t)
    t = _html.unescape(t)
    lines = [l.strip() for l in t.splitlines()]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(l for l in lines if l)).strip()


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na  = math.sqrt(sum(x * x for x in a))
    nb  = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


# ── Command queue (IDE control) ────────────────────────────────────────────────

_queue_lock = threading.Lock()


def _enqueue(cmd: dict) -> None:
    with _queue_lock:
        existing: list[dict] = []
        if QUEUE_FILE.exists():
            try:
                existing = json.loads(QUEUE_FILE.read_text(encoding="utf-8"))
            except Exception:
                existing = []
        existing.append(cmd)
        write_atomic(QUEUE_FILE, json.dumps(existing, ensure_ascii=False))


# ── Tool implementations ───────────────────────────────────────────────────────

def tool_vault_search(query: str, limit: int = 10, category: str | None = None) -> dict:
    terms = query.lower().split()
    pages = [
        p for p in _load_pages()
        if p.get("type") not in DEFAULT_EXCLUDE
        and (category is None or p.get("category") == category)
    ]
    scored = sorted(
        [(p, s) for p in pages if (s := _score(p, terms)) > 0],
        key=lambda x: x[1], reverse=True,
    )
    results = [
        {"id": p["id"], "title": p["title"], "category": p.get("category", ""),
         "description": p.get("description", ""), "score": s}
        for p, s in scored[:max(1, min(limit, 50))]
    ]
    return {"results": results, "total": len(results)}


def tool_vault_read(page_id: str) -> dict:
    page = next((p for p in _load_pages() if p["id"] == page_id), None)
    if not page:
        raise ValueError(f"Page not found: {page_id}")
    src = ROOT / page.get("path", "")
    try:
        full_text = _to_text(src.read_text(encoding="utf-8", errors="replace"))
    except OSError:
        full_text = page.get("text", "")
    return {
        "id": page["id"],
        "title": page["title"],
        "category": page.get("category", ""),
        "description": page.get("description", ""),
        "url": page.get("url", ""),
        "text": full_text,
        "links": page.get("links", []),
        "backlinks": page.get("backlinks", []),
    }


def tool_vault_write(category: str, slug: str, title: str, html_content: str) -> dict:
    if not _SAFE_SLUG_RE.match(category):
        raise ValueError(f"Invalid category name: {category!r}")
    if not _SAFE_SLUG_RE.match(slug):
        raise ValueError(f"Invalid slug: {slug!r}")
    target = (VAULT_DIR / category / slug / "index.html").resolve()
    if not str(target).startswith(str(VAULT_DIR.resolve())):
        raise ValueError("Resolved path escapes vault directory")
    target.parent.mkdir(parents=True, exist_ok=True)
    write_atomic(target, html_content)
    # Re-index in background
    threading.Thread(
        target=lambda: subprocess.run(
            [sys.executable, str(ROOT / "tools" / "indexer.py")],
            cwd=str(ROOT), capture_output=True, timeout=30,
        ), daemon=True,
    ).start()
    return {"ok": True, "path": str(target.relative_to(ROOT)), "id": f"{category}/{slug}"}


def tool_vault_list_pages(category: str | None = None, limit: int = 50) -> dict:
    pages = [
        p for p in _load_pages()
        if p.get("type") not in DEFAULT_EXCLUDE
        and (category is None or p.get("category") == category)
    ]
    results = [
        {"id": p["id"], "title": p["title"],
         "category": p.get("category", ""), "type": p.get("type", "note")}
        for p in pages[:max(1, min(limit, 200))]
    ]
    return {"pages": results, "total": len(pages)}


def tool_web_search(query: str, limit: int = 5) -> dict:
    """Search via SearXNG — reads SEARXNG_URL env or defaults to localhost:8888."""
    base = os.environ.get("SEARXNG_URL", "http://localhost:8888")
    url  = f"{base}/search?q={urllib.parse.quote(query)}&format=json&categories=general"
    import urllib.parse
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "AtlasOS-MCP/1.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read())
        results = [
            {"title": r.get("title", ""), "url": r.get("url", ""), "snippet": r.get("content", "")}
            for r in data.get("results", [])[:max(1, min(limit, 20))]
        ]
        return {"results": results, "total": len(results)}
    except Exception as e:
        raise RuntimeError(f"SearXNG unreachable ({base}): {e}")


def _check_ssrf(url: str) -> None:
    """Raise ValueError if url points to a private/local address."""
    from urllib.parse import urlparse as _up
    import socket as _socket
    parsed = _up(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Unsupported scheme: {parsed.scheme!r}")
    host = parsed.hostname or ""
    try:
        addr = _socket.getaddrinfo(host, None)[0][4][0]
        ip = _ipaddress.ip_address(addr)
        for net in _BLOCKED_NETS:
            if ip in net:
                raise ValueError(f"SSRF: address {addr} is in blocked range {net}")
    except _socket.gaierror:
        pass  # DNS failure — let urlopen handle it


def tool_web_fetch(url: str, max_chars: int = 50000) -> dict:
    _check_ssrf(url)
    req = urllib.request.Request(
        url, headers={"User-Agent": "AtlasOS-MCP/1.0 (web_fetch)"}
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read(max_chars + 1024).decode("utf-8", errors="replace")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Fetch failed: {e}")
    text = _to_text(raw)[:max_chars]
    return {"url": url, "text": text, "length": len(text)}


def tool_read_file(path: str) -> dict:
    p = Path(path)
    if not p.is_absolute():
        p = ROOT / path
    p = p.resolve()
    if not str(p).startswith(str(ROOT.resolve())):
        raise PermissionError("Path outside workspace")
    if not p.exists():
        raise FileNotFoundError(f"Not found: {path}")
    content = p.read_text(encoding="utf-8", errors="replace")
    return {"path": str(p), "content": content, "size": p.stat().st_size}


def tool_list_directory(path: str = ".") -> dict:
    p = Path(path)
    if not p.is_absolute():
        p = ROOT / path
    p = p.resolve()
    if not str(p).startswith(str(ROOT.resolve())):
        raise PermissionError("Path outside workspace")
    if not p.is_dir():
        raise NotADirectoryError(f"Not a directory: {path}")
    entries = []
    for item in sorted(p.iterdir()):
        entries.append({
            "name": item.name,
            "type": "directory" if item.is_dir() else "file",
            "size": item.stat().st_size if item.is_file() else None,
        })
    return {"path": str(p), "entries": entries}


def tool_canvas_get_state() -> dict:
    if not STATE_FILE.exists():
        return {"panels": [], "connections": [], "viewport": {"x": 0, "y": 0, "scale": 1}, "note": "IDE not running or state not exported yet"}
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception as e:
        raise RuntimeError(f"Could not read IDE state: {e}")


def tool_canvas_add_panel(panel_type: str, title: str | None = None, meta: dict | None = None, x: float | None = None, y: float | None = None) -> dict:
    valid = {"terminal", "editor", "chat", "web", "vault-home", "canvas", "agent", "preview"}
    if panel_type not in valid:
        raise ValueError(f"Unknown panel type: {panel_type}. Valid: {sorted(valid)}")
    cmd = {
        "type": "add_panel",
        "panelType": panel_type,
        "title": title or panel_type.capitalize(),
        "meta": meta or {},
    }
    if x is not None: cmd["x"] = x
    if y is not None: cmd["y"] = y
    _enqueue(cmd)
    return {"ok": True, "queued": cmd}


def tool_canvas_remove_panel(panel_id: str) -> dict:
    _enqueue({"type": "remove_panel", "id": panel_id})
    return {"ok": True, "queued_remove": panel_id}


def tool_ide_open_tab(url: str) -> dict:
    _enqueue({"type": "open_tab", "url": url})
    return {"ok": True, "queued_url": url}


def tool_ide_send_message(message: str, agent_id: str | None = None) -> dict:
    cmd: dict = {"type": "send_message", "message": message}
    if agent_id:
        cmd["agentId"] = agent_id
    _enqueue(cmd)
    return {"ok": True, "queued_message": message[:100]}


# ── Tool registry ──────────────────────────────────────────────────────────────

TOOLS = {
    "vault_search": {
        "description": "Search Atlas OS vault pages by keyword. Returns matching pages with scores.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query":    {"type": "string",  "description": "Search query"},
                "limit":    {"type": "integer", "description": "Max results (1-50)", "default": 10},
                "category": {"type": "string",  "description": "Filter by vault category (optional)"},
            },
            "required": ["query"],
        },
        "fn": lambda args: tool_vault_search(args["query"], args.get("limit", 10), args.get("category")),
    },
    "vault_read": {
        "description": "Read the full text of a vault page by its ID (e.g. 'home/atlas-os').",
        "inputSchema": {
            "type": "object",
            "properties": {"page_id": {"type": "string", "description": "Page ID from vault index"}},
            "required": ["page_id"],
        },
        "fn": lambda args: tool_vault_read(args["page_id"]),
    },
    "vault_write": {
        "description": "Write or create a vault HTML page. Re-indexes automatically.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "category":     {"type": "string", "description": "Vault category folder name"},
                "slug":         {"type": "string", "description": "Page slug (folder name under category)"},
                "title":        {"type": "string", "description": "Page title"},
                "html_content": {"type": "string", "description": "Full HTML content of the page"},
            },
            "required": ["category", "slug", "title", "html_content"],
        },
        "fn": lambda args: tool_vault_write(args["category"], args["slug"], args["title"], args["html_content"]),
    },
    "vault_list_pages": {
        "description": "List all vault pages, optionally filtered by category.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "category": {"type": "string",  "description": "Filter by category (optional)"},
                "limit":    {"type": "integer", "description": "Max pages (1-200)", "default": 50},
            },
        },
        "fn": lambda args: tool_vault_list_pages(args.get("category"), args.get("limit", 50)),
    },
    "web_search": {
        "description": "Search the web via SearXNG. Requires a running SearXNG instance.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string",  "description": "Search query"},
                "limit": {"type": "integer", "description": "Max results (1-20)", "default": 5},
            },
            "required": ["query"],
        },
        "fn": lambda args: tool_web_search(args["query"], args.get("limit", 5)),
    },
    "web_fetch": {
        "description": "Fetch a URL and return its plain text content (up to 50 000 chars).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "url":       {"type": "string",  "description": "URL to fetch"},
                "max_chars": {"type": "integer", "description": "Max characters to return", "default": 50000},
            },
            "required": ["url"],
        },
        "fn": lambda args: tool_web_fetch(args["url"], args.get("max_chars", 50000)),
    },
    "read_file": {
        "description": "Read a file inside the Atlas OS workspace. Path can be absolute or relative to workspace root.",
        "inputSchema": {
            "type": "object",
            "properties": {"path": {"type": "string", "description": "File path"}},
            "required": ["path"],
        },
        "fn": lambda args: tool_read_file(args["path"]),
    },
    "list_directory": {
        "description": "List directory contents inside the Atlas OS workspace.",
        "inputSchema": {
            "type": "object",
            "properties": {"path": {"type": "string", "description": "Directory path", "default": "."}},
        },
        "fn": lambda args: tool_list_directory(args.get("path", ".")),
    },
    "canvas_get_state": {
        "description": "Get the current Atlas OS canvas state: all panels, connections, and viewport. Requires the IDE to be running.",
        "inputSchema": {"type": "object", "properties": {}},
        "fn": lambda _: tool_canvas_get_state(),
    },
    "canvas_add_panel": {
        "description": "Add a new panel to the Atlas OS canvas. The IDE must be running. Panel appears immediately.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "panel_type": {"type": "string", "description": "terminal|editor|chat|web|vault-home|canvas|agent|preview"},
                "title":      {"type": "string", "description": "Panel title (optional)"},
                "meta":       {"type": "object", "description": "Extra panel options, e.g. {cwd, initCmd, url}"},
                "x":          {"type": "number", "description": "Canvas x position (optional)"},
                "y":          {"type": "number", "description": "Canvas y position (optional)"},
            },
            "required": ["panel_type"],
        },
        "fn": lambda args: tool_canvas_add_panel(
            args["panel_type"], args.get("title"), args.get("meta"), args.get("x"), args.get("y")
        ),
    },
    "canvas_remove_panel": {
        "description": "Remove a panel from the Atlas OS canvas by its ID.",
        "inputSchema": {
            "type": "object",
            "properties": {"panel_id": {"type": "string", "description": "Panel ID from canvas_get_state"}},
            "required": ["panel_id"],
        },
        "fn": lambda args: tool_canvas_remove_panel(args["panel_id"]),
    },
    "ide_open_tab": {
        "description": "Open a URL in the Atlas OS browser (vault page or web URL).",
        "inputSchema": {
            "type": "object",
            "properties": {"url": {"type": "string", "description": "vault:// asset URL or https:// web URL"}},
            "required": ["url"],
        },
        "fn": lambda args: tool_ide_open_tab(args["url"]),
    },
    "ide_send_message": {
        "description": "Send a chat message to an Atlas OS agent. The IDE must be running.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "message":  {"type": "string", "description": "Message to send"},
                "agent_id": {"type": "string", "description": "Agent ID, e.g. builtin:vault (optional — uses active agent)"},
            },
            "required": ["message"],
        },
        "fn": lambda args: tool_ide_send_message(args["message"], args.get("agent_id")),
    },
}


# ── MCP JSON-RPC dispatch ──────────────────────────────────────────────────────

def _dispatch(req: dict) -> dict | None:
    method = req.get("method", "")
    req_id = req.get("id")
    params = req.get("params", {}) or {}

    def ok(result):
        if req_id is None:
            return None  # notification
        return {"jsonrpc": "2.0", "id": req_id, "result": result}

    def err(code, msg, data=None):
        if req_id is None:
            return None
        e = {"code": code, "message": msg}
        if data is not None:
            e["data"] = data
        return {"jsonrpc": "2.0", "id": req_id, "error": e}

    if method == "initialize":
        return ok({
            "protocolVersion": MCP_VERSION,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": SERVER_NAME, "version": SERVER_VER},
        })

    if method == "initialized":
        return None  # notification, no response

    if method == "tools/list":
        tools_list = [
            {
                "name": name,
                "description": spec["description"],
                "inputSchema": spec["inputSchema"],
            }
            for name, spec in TOOLS.items()
        ]
        return ok({"tools": tools_list})

    if method == "tools/call":
        name = params.get("name", "")
        args = params.get("arguments", {}) or {}
        spec = TOOLS.get(name)
        if not spec:
            return err(-32601, f"Tool not found: {name}")
        try:
            result = spec["fn"](args)
            text   = json.dumps(result, ensure_ascii=False, indent=2)
            return ok({"content": [{"type": "text", "text": text}]})
        except (ValueError, PermissionError, FileNotFoundError) as exc:
            return err(-32602, str(exc))
        except Exception as exc:
            return err(-32603, f"Tool error: {exc}")

    if method == "ping":
        return ok({})

    return err(-32601, f"Method not found: {method}")


# ── Stdio transport ────────────────────────────────────────────────────────────

def _read_message(stream) -> dict | None:
    """Read one LSP-framed message from stream."""
    headers: dict[str, str] = {}
    while True:
        line = stream.readline()
        if not line:
            return None
        line = line.decode("utf-8").rstrip("\r\n")
        if not line:
            break
        if ": " in line:
            k, _, v = line.partition(": ")
            headers[k.lower()] = v
    length = int(headers.get("content-length", 0))
    if not length:
        return None
    body = stream.read(length)
    return json.loads(body.decode("utf-8"))


def _write_message(stream, msg: dict) -> None:
    body = json.dumps(msg, ensure_ascii=False).encode("utf-8")
    header = f"Content-Length: {len(body)}\r\n\r\n".encode("utf-8")
    stream.write(header + body)
    stream.flush()


def run_stdio():
    stdin  = sys.stdin.buffer
    stdout = sys.stdout.buffer
    sys.stderr.write(f"[atlas-mcp] stdio ready ({len(TOOLS)} tools)\n")
    sys.stderr.flush()
    while True:
        try:
            msg = _read_message(stdin)
        except Exception:
            break
        if msg is None:
            break
        response = _dispatch(msg)
        if response is not None:
            _write_message(stdout, response)


# ── HTTP transport ─────────────────────────────────────────────────────────────

class _HttpHandler(BaseHTTPRequestHandler):

    def do_GET(self):
        if not self._check_auth():
            return
        path = urlparse(self.path).path.rstrip("/")
        if path in ("", "/"):
            self._json({
                "name": SERVER_NAME,
                "version": SERVER_VER,
                "protocol": MCP_VERSION,
                "endpoints": {
                    "POST /": "JSON-RPC 2.0 (MCP protocol)",
                    "GET /tools": "list all tools",
                    "POST /tools/{name}": "call a tool directly (REST)",
                    "GET /health": "status check",
                },
                "tools": list(TOOLS.keys()),
            })
        elif path == "/tools":
            self._json([
                {"name": n, "description": s["description"], "inputSchema": s["inputSchema"]}
                for n, s in TOOLS.items()
            ])
        elif path == "/health":
            self._json({"status": "ok", "root": str(ROOT), "pages": len(_load_pages())})
        else:
            self._json({"error": f"No GET endpoint: {path}"}, 404)

    def do_POST(self):
        if not self._check_auth():
            return
        path = urlparse(self.path).path.rstrip("/")
        body = self._read_body()

        # ── JSON-RPC (full MCP)
        if path in ("", "/", "/mcp"):
            if not body:
                self._json({"error": "empty body"}, 400)
                return
            try:
                req = json.loads(body)
            except json.JSONDecodeError:
                self._json({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}})
                return
            response = _dispatch(req)
            if response is None:
                self._raw(b"{}", 204)
            else:
                self._json(response)

        # ── Simple REST: /tools/{name}
        elif path.startswith("/tools/"):
            tool_name = path[len("/tools/"):]
            spec = TOOLS.get(tool_name)
            if not spec:
                self._json({"error": f"Tool not found: {tool_name}"}, 404)
                return
            args = {}
            if body:
                try:
                    args = json.loads(body)
                except Exception:
                    self._json({"error": "invalid JSON"}, 400)
                    return
            try:
                result = spec["fn"](args)
                self._json(result)
            except (ValueError, PermissionError, FileNotFoundError) as e:
                self._json({"error": str(e)}, 400)
            except Exception as e:
                self._json({"error": str(e)}, 500)
        else:
            self._json({"error": f"No endpoint: {path}"}, 404)

    def _origin(self) -> str:
        return self.headers.get("Origin", "")

    def _cors_origin(self) -> str:
        o = self._origin()
        return o if o in _ALLOWED_ORIGINS else "tauri://localhost"

    def _check_auth(self) -> bool:
        if self.command == "OPTIONS":
            return True
        auth = self.headers.get("Authorization", "")
        if auth == f"Bearer {_API_TOKEN}":
            return True
        if self.headers.get("X-Atlas-Token", "") == _API_TOKEN:
            return True
        body = json.dumps({"error": "Unauthorised"}).encode()
        self.send_response(401)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", self._cors_origin())
        self.end_headers()
        self.wfile.write(body)
        return False

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", self._cors_origin())
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, X-Atlas-Token, Content-Type")
        self.end_headers()

    def _read_body(self) -> bytes:
        length = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(length) if length else b""

    def _json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", self._cors_origin())
        self.end_headers()
        self.wfile.write(body)

    def _raw(self, body: bytes, status=200):
        self.send_response(status)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f"  {self.command:<7} {self.path:<45}  {args[1]}")


def run_http(port: int = 4244):
    server = HTTPServer(("127.0.0.1", port), _HttpHandler)
    base   = f"http://localhost:{port}"
    print(f"\n  Atlas OS MCP (HTTP)  —  {base}")
    print(f"  {base}/            ← JSON-RPC 2.0 (MCP protocol)")
    print(f"  {base}/tools       ← list tools (GET)")
    print(f"  {base}/tools/vault_search  ← call tool (POST + JSON body)")
    print(f"  {base}/health      ← status")
    print(f"\n  {len(TOOLS)} tools available")
    print(f"  Ctrl+C to stop\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.\n")


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import urllib.parse  # ensure imported for web_search

    http_mode = "--http" in sys.argv
    if http_mode:
        idx  = sys.argv.index("--http")
        port = 4244
        if idx + 1 < len(sys.argv):
            try:
                port = int(sys.argv[idx + 1])
            except ValueError:
                pass
        run_http(port)
    else:
        run_stdio()
