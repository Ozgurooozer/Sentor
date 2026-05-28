#!/usr/bin/env python3
"""
Atlas OS — MCP stdio server  (vault + canvas control + screenshot)

Exposes the Atlas vault and the running IDE canvas as a Model Context
Protocol server that any MCP-compatible client can connect to over stdio:
Claude Code, Cursor, Continue, Cline, VS Code MCP extension, etc.

WHY stdio + Python
  Zero dependencies (stdlib only).  IDE-independent for vault reads;
  canvas writes go via the .mcp-queue.json file bridge which the running
  IDE processes automatically.

TOOLS
  Vault (IDE-independent):
    vault_search       keyword search
    vault_read         full text of one page by id
    vault_categories   list category folders
    vault_pages        flat listing of all pages

  Canvas (requires IDE running):
    canvas_get_state   current nodes + wires JSON  (.ide-state.json)
    canvas_add_node    add a panel (queued)
    canvas_remove_node remove a panel by id (queued)
    canvas_connect     wire two panels together (queued)
    canvas_update_node patch a panel's title / meta / position (queued)
    canvas_clear       wipe all non-pinned panels (queued)
    canvas_screenshot  screenshot of the primary screen → base64 PNG

REGISTER WITH CLAUDE CODE (.mcp.json or global config):
  {
    "mcpServers": {
      "atlas": {
        "command": "python",
        "args": ["C:/Atlas OS/tools/mcp_server.py"],
        "env": { "ATLAS_VAULT_ROOT": "C:/Atlas OS" }
      }
    }
  }

REGISTER WITH CURSOR / CONTINUE / CLINE:
  Identical — point "command" at this file with ATLAS_VAULT_ROOT set.
"""

import base64
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# ── UTF-8 stdio (Windows cp1252 crashes on vault symbols) ─────────────────────
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT = Path(
    os.environ.get("ATLAS_VAULT_ROOT")
    or Path(__file__).resolve().parent.parent
)
INDEX_FILE  = ROOT / ".index"  / "pages.json"
STATE_FILE  = ROOT / ".ide-state.json"   # exported by IDE on every canvas change
QUEUE_FILE  = ROOT / ".mcp-queue.json"   # read + cleared by IDE (Rust mcp_dequeue)

sys.path.insert(0, str(ROOT / "tools"))
from scoring import DEFAULT_EXCLUDE_TYPES, passes_default_filter, score  # noqa: E402


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
    sys.stderr.flush()


# ── Tool definitions ──────────────────────────────────────────────────────────

TOOLS = [
    # ── Vault ────────────────────────────────────────────────────────────────
    {
        "name": "vault_search",
        "description": (
            "Keyword search across the Atlas vault. Returns top-N pages with "
            "score, title, category, slug. Use before answering from scratch."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query":    {"type": "string",  "description": "Search terms."},
                "limit":    {"type": "number",  "description": "Max results (default 5)."},
                "category": {"type": "string",  "description": "Restrict to one category."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "vault_read",
        "description": "Full plain-text of one vault page by its id (category/slug).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "id": {"type": "string", "description": "Page id e.g. 'notes/my-note'."},
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
        "description": "Flat list of every vault page — id, title, category.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "category": {"type": "string", "description": "Optional category filter."},
            },
        },
    },

    # ── IDE logs ─────────────────────────────────────────────────────────────
    {
        "name": "ide_get_logs",
        "description": (
            "Read the IDE's live log stream — all console.log / warn / error / "
            "info calls, uncaught errors, promise rejections, and agent events. "
            "Logs are captured by the console interceptor and written to disk "
            "every 3 s. Use level filter to focus on errors or warnings. "
            "Also returns counts per level so you can scan quickly."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "number",
                    "description": "Max entries to return, newest first (default 100).",
                },
                "level": {
                    "type": "string",
                    "description": "Filter by level: log | info | warn | error | debug | agent | system. Omit for all.",
                    "enum": ["log","info","warn","error","debug","agent","system"],
                },
                "search": {
                    "type": "string",
                    "description": "Case-insensitive substring filter on message.",
                },
            },
        },
    },

    # ── Canvas ───────────────────────────────────────────────────────────────
    {
        "name": "canvas_get_state",
        "description": (
            "Read the current live canvas as JSON: all nodes (id, type, title, "
            "x, y, width, height, meta) and all wires (fromPanel, toPanel, "
            "fromPort, toPort, kind). The IDE exports this file on every change. "
            "Call this first to know which node IDs exist before mutating."
        ),
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "canvas_add_node",
        "description": (
            "Add a new node panel to the canvas. The IDE processes this "
            "asynchronously (usually <100 ms). Call canvas_get_state after to "
            "confirm the new id."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "type":  {
                    "type": "string",
                    "description": "Panel type.",
                    "enum": ["chat","agent","terminal","editor","web","filebrowser",
                             "input","sketch","note","checklist","gallery","header",
                             "canvas","pipeline","codegraph"],
                },
                "title": {"type": "string",  "description": "Display title."},
                "x":     {"type": "number",  "description": "Canvas X position."},
                "y":     {"type": "number",  "description": "Canvas Y position."},
                "meta":  {"type": "object",  "description": "Panel-specific metadata (e.g. {text:...} for note)."},
            },
            "required": ["type"],
        },
    },
    {
        "name": "canvas_remove_node",
        "description": "Remove a panel by its id. Get ids from canvas_get_state.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "id": {"type": "string", "description": "Panel id to remove."},
            },
            "required": ["id"],
        },
    },
    {
        "name": "canvas_connect",
        "description": (
            "Draw a wire between two panels. Use canvas_get_state to inspect "
            "available port names (fromPort / toPort). If omitted, defaults to "
            "the first output → first input. kind: data | context | trigger."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "from_id":   {"type": "string", "description": "Source panel id."},
                "to_id":     {"type": "string", "description": "Target panel id."},
                "from_port": {"type": "string", "description": "Output port name (optional)."},
                "to_port":   {"type": "string", "description": "Input port name (optional)."},
                "kind":      {"type": "string", "enum": ["data","context","trigger"],
                              "description": "Wire kind (default: data)."},
            },
            "required": ["from_id", "to_id"],
        },
    },
    {
        "name": "canvas_update_node",
        "description": (
            "Patch a panel's title, position (x/y), or meta. "
            "Only supplied fields are changed."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "id":    {"type": "string", "description": "Panel id."},
                "title": {"type": "string"},
                "x":     {"type": "number"},
                "y":     {"type": "number"},
                "meta":  {"type": "object"},
            },
            "required": ["id"],
        },
    },
    {
        "name": "canvas_clear",
        "description": (
            "Remove ALL non-pinned panels and wires from the canvas. "
            "Pinned system panels (breadcrumb, toolbar) are kept. "
            "Use carefully — this cannot be undone via MCP."
        ),
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "canvas_screenshot",
        "description": (
            "Capture the primary screen and return it as a PNG image. "
            "Use this to visually inspect the current canvas state, verify "
            "that nodes were added, or understand the layout before mutating. "
            "Windows only (uses PowerShell + System.Drawing)."
        ),
        "inputSchema": {"type": "object", "properties": {}},
    },
]


# ── Queue helper ──────────────────────────────────────────────────────────────

def _enqueue(cmd: dict) -> dict:
    """Append cmd to .mcp-queue.json using atomic write (temp → rename)."""
    try:
        if QUEUE_FILE.exists():
            try:
                existing = json.loads(QUEUE_FILE.read_text(encoding="utf-8"))
                if not isinstance(existing, list):
                    existing = []
            except Exception:
                existing = []
        else:
            QUEUE_FILE.parent.mkdir(parents=True, exist_ok=True)
            existing = []
        existing.append({**cmd, "_ts": time.time()})
        content = json.dumps(existing, ensure_ascii=False)
        tmp_fd, tmp_path = tempfile.mkstemp(dir=QUEUE_FILE.parent, suffix=".tmp")
        try:
            with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
                f.write(content)
            os.replace(tmp_path, QUEUE_FILE)
        except Exception:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise
        return {"ok": True, "queued": cmd}
    except Exception as exc:
        return {"error": str(exc)}


# ── Vault handlers ────────────────────────────────────────────────────────────

_pages_cache: list[dict] | None = None
_pages_mtime: float = 0.0

def _load_pages() -> list[dict]:
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

from html_utils import strip_html as _strip_html  # noqa: E402

def tool_vault_search(args: dict) -> dict:
    query = str(args.get("query", "")).strip().lower()
    if not query:
        return {"error": "query is required"}
    limit = int(args.get("limit") or 5)
    category = args.get("category")
    terms = [t for t in query.split() if t]
    pages = _load_pages()
    if not pages:
        return {"error": "vault index missing — run `python tools/indexer.py`"}
    results = []
    for p in pages:
        if not passes_default_filter(p, set()):
            continue
        if category and p.get("category") != category:
            continue
        s = score(p, terms)
        if s > 0:
            results.append({
                "id": p["id"], "title": p.get("title", ""),
                "category": p.get("category", ""), "slug": p.get("slug", ""),
                "score": s,
            })
    results.sort(key=lambda r: -r["score"])
    return {"query": query, "results": results[:limit]}

def tool_vault_read(args: dict) -> dict:
    page_id = str(args.get("id", "")).strip()
    if not page_id:
        return {"error": "id is required"}
    pages = _load_pages()
    page = next((p for p in pages if p["id"] == page_id), None)
    if not page:
        return {"error": f"page not found: {page_id}"}
    src = (ROOT / page.get("path", "")).resolve()
    try:
        if not src.is_relative_to(ROOT.resolve()):
            return {"error": "path escapes vault root"}
        raw = src.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        return {"error": f"read failed: {exc}"}
    return {
        "id": page_id, "title": page.get("title", ""),
        "category": page.get("category", ""),
        "headings": page.get("headings", []),
        "content": _strip_html(raw),
    }

def tool_vault_categories(_args: dict) -> dict:
    pages = _load_pages()
    cats = sorted({p.get("category", "") for p in pages if p.get("category")})
    return {"categories": cats}

def tool_vault_pages(args: dict) -> dict:
    category = args.get("category")
    pages = _load_pages()
    out = []
    for p in pages:
        if p.get("type") in DEFAULT_EXCLUDE_TYPES:
            continue
        if category and p.get("category") != category:
            continue
        out.append({"id": p["id"], "title": p.get("title", ""), "category": p.get("category", "")})
    return {"pages": out}


# ── IDE log handler ──────────────────────────────────────────────────────────

def tool_ide_get_logs(args: dict) -> dict:
    import datetime
    limit  = int(args.get("limit") or 100)
    level  = args.get("level")
    search = (args.get("search") or "").lower()

    log_dir = ROOT / "vault" / "logs"
    if not log_dir.exists():
        return {"error": "No log files yet. IDE must be open for at least one flush (~3s)."}

    # Collect today + yesterday files so recent errors near midnight aren't missed
    today     = datetime.date.today().isoformat()
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    entries: list[dict] = []
    for fname in [f"{today}.json", f"{yesterday}.json"]:
        fpath = log_dir / fname
        if not fpath.exists():
            continue
        try:
            batch = json.loads(fpath.read_text(encoding="utf-8"))
            if isinstance(batch, list):
                entries.extend(batch)
        except Exception:
            pass

    # Apply filters
    if level:
        entries = [e for e in entries if e.get("level") == level]
    if search:
        entries = [e for e in entries if search in e.get("message", "").lower()]

    # Newest first, then trim
    entries.sort(key=lambda e: e.get("ts", 0), reverse=True)
    trimmed = entries[:limit]

    # Counts per level (from unfiltered)
    counts: dict[str, int] = {}
    for e in entries:
        lv = e.get("level", "log")
        counts[lv] = counts.get(lv, 0) + 1

    return {
        "total_matching": len(entries),
        "returned": len(trimmed),
        "counts_by_level": counts,
        "entries": trimmed,
    }


# ── Canvas handlers ───────────────────────────────────────────────────────────

def tool_canvas_get_state(_args: dict) -> dict:
    if not STATE_FILE.exists():
        return {
            "error": (
                "IDE not running or no canvas exported yet. "
                "Start the IDE and open a canvas."
            )
        }
    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        # Surface a clean summary alongside the raw state
        panels = data.get("panels", [])
        conns  = data.get("connections", [])
        return {
            "node_count": len([p for p in panels if not p.get("pinned")]),
            "wire_count": len(conns),
            "panels": [
                {k: p[k] for k in ("id","type","title","x","y","width","height","pinned","meta")
                 if k in p}
                for p in panels
            ],
            "connections": conns,
            "viewport": data.get("viewport"),
        }
    except Exception as exc:
        return {"error": str(exc)}

def tool_canvas_add_node(args: dict) -> dict:
    panel_type = args.get("type", "note")
    cmd: dict = {"type": "add_panel", "panelType": panel_type}
    if args.get("title"):        cmd["title"] = args["title"]
    if args.get("x") is not None: cmd["x"] = float(args["x"])
    if args.get("y") is not None: cmd["y"] = float(args["y"])
    if args.get("meta"):         cmd["meta"]  = args["meta"]
    result = _enqueue(cmd)
    if result.get("ok"):
        result["hint"] = "Call canvas_get_state in ~200ms to see the new panel id."
    return result

def tool_canvas_remove_node(args: dict) -> dict:
    node_id = str(args.get("id", "")).strip()
    if not node_id:
        return {"error": "id is required"}
    return _enqueue({"type": "remove_panel", "id": node_id})

def tool_canvas_connect(args: dict) -> dict:
    from_id = str(args.get("from_id", "")).strip()
    to_id   = str(args.get("to_id",   "")).strip()
    if not from_id or not to_id:
        return {"error": "from_id and to_id are required"}
    return _enqueue({
        "type":      "connect_panels",
        "fromPanel": from_id,
        "toPanel":   to_id,
        "fromPort":  args.get("from_port"),
        "toPort":    args.get("to_port"),
        "kind":      args.get("kind", "data"),
    })

def tool_canvas_update_node(args: dict) -> dict:
    node_id = str(args.get("id", "")).strip()
    if not node_id:
        return {"error": "id is required"}
    patch: dict = {}
    if args.get("title") is not None: patch["title"] = args["title"]
    if args.get("x")     is not None: patch["x"]     = float(args["x"])
    if args.get("y")     is not None: patch["y"]     = float(args["y"])
    if args.get("meta")  is not None: patch["meta"]  = args["meta"]
    if not patch:
        return {"error": "supply at least one of: title, x, y, meta"}
    return _enqueue({"type": "update_panel", "id": node_id, "patch": patch})

def tool_canvas_clear(_args: dict) -> dict:
    return _enqueue({"type": "clear_canvas"})

def tool_canvas_screenshot(_args: dict) -> dict:
    # PowerShell + System.Drawing — Windows only, zero Python deps
    ps = r"""
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object Drawing.Bitmap $b.Width,$b.Height
$g = [Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location,[Drawing.Point]::Empty,$b.Size)
$g.Dispose()
$f = [IO.Path]::GetTempFileName() + '.png'
$bmp.Save($f,[Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output $f
"""
    try:
        r = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
            capture_output=True, text=True, timeout=20,
        )
        path = r.stdout.strip()
        if not path or not os.path.exists(path):
            return {"error": f"PowerShell screenshot failed: {r.stderr.strip()}"}
        with open(path, "rb") as f:
            data = base64.b64encode(f.read()).decode()
        os.unlink(path)
        # Special marker so the dispatcher emits an image content block
        return {"__image__": True, "data": data, "mimeType": "image/png"}
    except subprocess.TimeoutExpired:
        return {"error": "screenshot timed out (>20s)"}
    except Exception as exc:
        return {"error": str(exc)}


# ── Handler registry ──────────────────────────────────────────────────────────

TOOL_HANDLERS = {
    "vault_search":        tool_vault_search,
    "vault_read":          tool_vault_read,
    "vault_categories":    tool_vault_categories,
    "vault_pages":         tool_vault_pages,
    "ide_get_logs":        tool_ide_get_logs,
    "canvas_get_state":    tool_canvas_get_state,
    "canvas_add_node":     tool_canvas_add_node,
    "canvas_remove_node":  tool_canvas_remove_node,
    "canvas_connect":      tool_canvas_connect,
    "canvas_update_node":  tool_canvas_update_node,
    "canvas_clear":        tool_canvas_clear,
    "canvas_screenshot":   tool_canvas_screenshot,
}


# ── Dispatcher ────────────────────────────────────────────────────────────────

def handle(req: dict) -> None:
    req_id = req.get("id")
    method = req.get("method")
    params = req.get("params") or {}

    if method == "initialize":
        reply(req_id, {
            "protocolVersion": "2024-11-05",
            "serverInfo": {"name": "atlas-os", "version": "0.8.0"},
            "capabilities": {"tools": {}},
        })
        return

    if method == "notifications/initialized":
        return

    if method == "tools/list":
        reply(req_id, {"tools": TOOLS})
        return

    if method == "tools/call":
        name    = params.get("name")
        args    = params.get("arguments") or {}
        handler = TOOL_HANDLERS.get(name)
        if not handler:
            reply_error(req_id, -32601, f"unknown tool: {name}")
            return
        try:
            result = handler(args)
        except Exception as exc:
            reply_error(req_id, -32603, f"tool {name} raised: {exc}")
            return

        # Screenshot → image content block; everything else → text JSON
        if isinstance(result, dict) and result.get("__image__"):
            reply(req_id, {
                "content": [{
                    "type": "image",
                    "data": result["data"],
                    "mimeType": result["mimeType"],
                }],
                "isError": False,
            })
        else:
            reply(req_id, {
                "content": [
                    {"type": "text",
                     "text": json.dumps(result, ensure_ascii=False, indent=2)},
                ],
                "isError": "error" in result,
            })
        return

    if req_id is not None:
        reply_error(req_id, -32601, f"unknown method: {method}")


def main() -> None:
    log(f"started — vault root: {ROOT}  |  tools: {len(TOOLS)}")
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
