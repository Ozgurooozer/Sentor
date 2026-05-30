#!/usr/bin/env python3
"""
Atlas OS — Local Knowledge API
  GET /api/search?q=&limit=&category=&scope=&include=
  GET /api/semantic?q=&limit=&scope=
  GET /api/page/{*path}                  (flexible depth, slash-joined ID)
  GET /api/agent/{slug}                  (state + recent log + open projects)
  GET /api/categories
  GET /api/pages

Run standalone:  python api/server.py [port]
Via CLI:         atlas serve [port]            (default port: 4242)
"""

import json
import math
import mimetypes
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import urllib.request
import urllib.error

ROOT         = Path(__file__).resolve().parent.parent

# ── Auth token (loaded once at startup) ───────────────────────────────────────
sys.path.insert(0, str(ROOT / "tools"))
from io_utils import get_or_create_token, write_atomic  # noqa: E402

_API_TOKEN: str = get_or_create_token()

# Requests from these origins skip CORS restrictions (Tauri webview origins)
_ALLOWED_ORIGINS = frozenset({
    "tauri://localhost",
    "https://tauri.localhost",
    "http://localhost:1420",  # Vite dev server
    "http://127.0.0.1:1420",
})

# Endpoints that don't require a token (read-only info or health check)
_PUBLIC_PATHS = frozenset({"/api", "", "/api/categories", "/api/ide/status"})

# Mutation endpoints that always require a token
_MUTATION_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
VAULT_DIR    = ROOT / "vault"
INDEX_FILE   = ROOT / ".index" / "pages.json"
EMBED_FILE   = ROOT / ".index" / "embeddings.json"
CONFIG_FILE  = ROOT / ".atlas-embed.json"
QUEUE_FILE   = ROOT / ".mcp-queue.json"
STATE_FILE   = ROOT / ".ide-state.json"
DEFAULT_PORT = 4242

_queue_lock = threading.Lock()

def _ide_enqueue(cmd: dict) -> None:
    with _queue_lock:
        existing: list = []
        if QUEUE_FILE.exists():
            try:
                existing = json.loads(QUEUE_FILE.read_text(encoding="utf-8"))
            except Exception:
                existing = []
        existing.append(cmd)
        write_atomic(QUEUE_FILE, json.dumps(existing, ensure_ascii=False))


def _embed_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except Exception as e:
            print(f'warning: could not load embed config: {e}', file=sys.stderr)
    return {}


# ── Search scoring (shared with cli/atlas.py via tools/scoring.py) ─────────────

from scoring import (  # noqa: E402  — sys.path already includes tools/
    DEFAULT_EXCLUDE_TYPES,
    score as _score,
    passes_default_filter as _passes_default_filter,
    cosine as _cosine,
)


# ── HTML → plain text ──────────────────────────────────────────────────────────

from html_utils import strip_html as _strip_to_text  # noqa: E402


# ── Index cache ────────────────────────────────────────────────────────────────

class _Cache:
    """Holds the page list in memory; reloads when pages.json mtime changes."""

    def __init__(self):
        self._pages: list[dict] = []
        self._mtime: float      = 0.0
        self._lock              = threading.Lock()

    def pages(self) -> list[dict]:
        with self._lock:
            try:
                mtime = INDEX_FILE.stat().st_mtime
            except OSError:
                return []
            if mtime != self._mtime:
                try:
                    data        = json.loads(INDEX_FILE.read_text(encoding='utf-8'))
                    self._pages = data.get('pages', [])
                    self._mtime = mtime
                except (json.JSONDecodeError, OSError):
                    pass
            return self._pages


_cache = _Cache()


# ── Semantic search — lazy model + embedding cache ─────────────────────────────

_sem_model     = None
_sem_records:  list[dict] = []
_sem_mtime:    float      = 0.0
_sem_lock                 = threading.Lock()


def _ollama_embed(text: str, url: str, model: str) -> list[float]:
    payload = json.dumps({"model": model, "input": text}).encode()
    req = urllib.request.Request(
        f"{url.rstrip('/')}/api/embed",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
        vecs = data.get("embeddings", [])
        if not vecs:
            raise RuntimeError(f"Ollama returned no embeddings (model {model} not pulled?)")
        return vecs[0]


def _get_records() -> list[dict]:
    """Reload embeddings from disk when the file changes."""
    global _sem_records, _sem_mtime
    with _sem_lock:
        try:
            mtime = EMBED_FILE.stat().st_mtime
        except OSError:
            raise RuntimeError("Embeddings not built yet. Run: python tools/embedder.py")
        if mtime != _sem_mtime:
            data = json.loads(EMBED_FILE.read_text(encoding="utf-8"))
            # Support both old (list) and new (dict with "records") format
            _sem_records = data.get("records", data) if isinstance(data, dict) else data
            _sem_mtime   = mtime
        return _sem_records


def _embed_query(q: str) -> list[float]:
    """Embed a query string via Ollama (only supported backend)."""
    cfg = _embed_config()
    url   = cfg.get("ollamaUrl",   "http://localhost:11434")
    model = cfg.get("ollamaModel", "all-minilm")
    return _ollama_embed(q, url, model)


# ── Request handler ────────────────────────────────────────────────────────────

class _Handler(BaseHTTPRequestHandler):

    # ── Auth & CORS helpers ────────────────────────────────────────────────────

    def _origin(self) -> str:
        return self.headers.get("Origin", "")

    def _cors_origin(self) -> str:
        origin = self._origin()
        return origin if origin in _ALLOWED_ORIGINS else "tauri://localhost"

    def _check_auth(self) -> bool:
        """Return True if request is authorised, False (and send 401) if not."""
        path = urlparse(self.path).path.rstrip("/")
        # Public read-only endpoints
        if self.command == "GET" and path in _PUBLIC_PATHS:
            return True
        # OPTIONS preflight always passes
        if self.command == "OPTIONS":
            return True
        auth = self.headers.get("Authorization", "")
        if auth == f"Bearer {_API_TOKEN}":
            return True
        token_header = self.headers.get("X-Atlas-Token", "")
        if token_header == _API_TOKEN:
            return True
        body = json.dumps({"error": "Unauthorised — include Authorization: Bearer <token>"}).encode()
        self.send_response(401)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", self._cors_origin())
        self.end_headers()
        self.wfile.write(body)
        return False

    # ── Routing ────────────────────────────────────────────────────────────────

    def do_GET(self):
        if not self._check_auth():
            return
        parsed = urlparse(self.path)
        path   = parsed.path.rstrip('/')
        params = parse_qs(parsed.query)

        if path in ('', '/api'):
            self._json({
                'name': 'Atlas OS API',
                'endpoints': [
                    '/api/search?q=&limit=&category=&scope=&include=',
                    '/api/semantic?q=&limit=&scope=',
                    '/api/hybrid?q=&limit=&category=&scope=&include=&alpha=',
                    '/api/page/{*path}',
                    '/api/agent/{slug}',
                    '/api/categories',
                    '/api/pages',
                ],
            })
        elif path == '/api/search':
            self._search(params)
        elif path == '/api/hybrid':
            self._hybrid(params)
        elif path == '/api/semantic':
            self._semantic(params)
        elif path == '/api/categories':
            self._categories()
        elif path == '/api/pages':
            self._all_pages()
        elif path.startswith('/api/agent/'):
            slug = path[len('/api/agent/'):].strip('/')
            if slug:
                self._agent(slug)
            else:
                self._error(400, 'Expected /api/agent/{slug}')
        elif path.startswith('/api/page/'):
            page_id = path[len('/api/page/'):].strip('/')
            if page_id:
                self._page(page_id)
            else:
                self._error(400, 'Expected /api/page/{*path}')
        elif path == '/api/nodes':
            self._nodes_list()
        elif path == '/api/ide/status':
            self._ide_status()
        elif path == '/api/ide/canvas':
            self._ide_canvas()
        elif path == '/api/cli/tasks':
            self._cli_tasks()
        elif path == '/api/cli/pipelines':
            self._cli_pipelines()
        elif path == '/api/cli/provider':
            self._cli_provider()
        elif path.startswith('/ui/') or path.startswith('/vault/'):
            self._static(path)
        else:
            self._error(404, f'No endpoint: {path}')

    def do_POST(self):
        if not self._check_auth():
            return
        parsed = urlparse(self.path)
        path   = parsed.path.rstrip('/')
        length = int(self.headers.get('Content-Length', 0))
        body   = {}
        if length:
            if length > 1_048_576:  # 1 MB
                self._error(413, 'request body too large (max 1 MB)')
                return
            try:
                body = json.loads(self.rfile.read(length).decode('utf-8'))
            except Exception:
                self._error(400, 'invalid JSON body')
                return

        if path == '/api/cli/run':
            self._cli_run(body)
        elif path == '/api/cli/notify':
            self._cli_notify(body)
        elif path == '/api/cli/pipeline/run':
            self._cli_pipeline_run(body)
        elif path.startswith('/api/nodes/') and path.endswith('/run'):
            node_id = path[len('/api/nodes/'):-len('/run')]
            self._node_run(node_id, body)
        elif path == '/api/ide/canvas/panels':
            self._ide_add_panel(body)
        elif path == '/api/ide/agent/message':
            self._ide_send_message(body)
        elif path == '/api/ide/tab':
            self._ide_open_tab(body)
        else:
            self._error(404, f'No POST endpoint: {path}')

    def do_DELETE(self):
        if not self._check_auth():
            return
        parsed = urlparse(self.path)
        path   = parsed.path.rstrip('/')
        if path.startswith('/api/ide/canvas/panels/'):
            panel_id = path[len('/api/ide/canvas/panels/'):]
            if panel_id:
                _ide_enqueue({'type': 'remove_panel', 'id': panel_id})
                self._json({'ok': True, 'queued_remove': panel_id})
            else:
                self._error(400, 'Expected /api/ide/canvas/panels/{id}')
        else:
            self._error(404, f'No DELETE endpoint: {path}')

    def do_OPTIONS(self):
        """CORS preflight — browsers and some Ollama clients send this first."""
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin',  self._cors_origin())
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, X-Atlas-Token, Content-Type')
        self.end_headers()

    # ── Endpoints ──────────────────────────────────────────────────────────────

    def _hybrid(self, params: dict) -> None:
        """Hybrid search: merge keyword + semantic results, rerank by combined score.

        Query params:
          q        — search query (required)
          limit    — max results (default 10, max 50)
          category — filter by category
          scope    — filter by scope
          include  — comma-separated types to opt back in (e.g. archive)
          alpha    — semantic weight 0.0–1.0 (default 0.6)
        """
        q        = params.get('q',        [''])[0].strip()
        category = params.get('category', [''])[0].strip() or None
        scope    = params.get('scope',    [''])[0].strip() or None
        include  = set(params.get('include', [''])[0].split(',')) - {''}
        try:
            limit = max(1, min(int(params.get('limit', ['10'])[0]), 50))
        except (ValueError, IndexError):
            limit = 10
        try:
            alpha = max(0.0, min(float(params.get('alpha', ['0.6'])[0]), 1.0))
        except (ValueError, IndexError):
            alpha = 0.6

        if not q:
            self._json([])
            return

        # ── 1. Keyword pass ──────────────────────────────────────────────────
        terms = q.lower().split()
        candidates = [
            p for p in _cache.pages()
            if _passes_default_filter(p, include)
            and (scope is None or p.get('scope') == scope)
            and (category is None or p.get('category') == category)
        ]
        kw_raw = [(p, _score(p, terms)) for p in candidates]
        kw_raw = [(p, s) for p, s in kw_raw if s > 0]

        max_kw = max((s for _, s in kw_raw), default=1) or 1
        # Normalised keyword scores keyed by page id
        kw_scores: dict[str, float] = {
            p['id']: s / max_kw for p, s in kw_raw
        }
        pages_by_id: dict[str, dict] = {p['id']: p for p in candidates}
        # Also include semantic-only candidates not yet in pages_by_id
        for p in _cache.pages():
            if p['id'] not in pages_by_id:
                pages_by_id[p['id']] = p

        # ── 2. Semantic pass (optional — degrade gracefully) ─────────────────
        sem_scores: dict[str, float] = {}
        sem_available = False
        if alpha > 0.0:
            try:
                records  = _get_records()
                q_vec    = _embed_query(q)
                filtered = [
                    r for r in records
                    if r.get('type') not in DEFAULT_EXCLUDE_TYPES
                    and (scope is None or r.get('scope') == scope)
                ]
                for r in filtered:
                    s = _cosine(q_vec, r['embedding'])
                    if s > 0.1:
                        sem_scores[r['id']] = round(s, 4)
                sem_available = True
            except RuntimeError:
                pass  # embeddings not built yet — keyword-only
            except urllib.error.URLError:
                pass  # Ollama offline — keyword-only

        # ── 3. Merge & rerank ────────────────────────────────────────────────
        all_ids = set(kw_scores) | set(sem_scores)
        if not all_ids:
            self._json({'results': [], 'mode': 'empty'})
            return

        effective_alpha = alpha if sem_available else 0.0

        combined: list[tuple[str, float]] = []
        for pid in all_ids:
            kw  = kw_scores.get(pid, 0.0)
            sem = sem_scores.get(pid, 0.0)
            final = effective_alpha * sem + (1.0 - effective_alpha) * kw
            combined.append((pid, round(final, 4)))

        combined.sort(key=lambda x: x[1], reverse=True)

        result = []
        for pid, final_score in combined[:limit]:
            p = pages_by_id.get(pid)
            if not p:
                continue
            entry: dict = {
                'id':          pid,
                'title':       p['title'],
                'category':    p.get('category', ''),
                'type':        p.get('type', 'note'),
                'scope':       p.get('scope', 'vault'),
                'description': p.get('description', ''),
                'url':         p.get('url', ''),
                'score':       final_score,
            }
            if kw_scores.get(pid, 0) > 0:
                entry['keyword_score'] = round(kw_scores[pid], 4)
            if sem_scores.get(pid, 0) > 0:
                entry['semantic_score'] = sem_scores[pid]
            result.append(entry)

        mode = 'hybrid' if sem_available and sem_scores else ('keyword' if sem_available else 'keyword-only')
        self._json({'results': result, 'mode': mode, 'alpha': effective_alpha})

    def _search(self, params: dict) -> None:
        q        = params.get('q',        [''])[0].strip()
        category = params.get('category', [''])[0].strip() or None
        scope    = params.get('scope',    [''])[0].strip() or None
        include  = set(params.get('include', [''])[0].split(',')) - {''}
        try:
            limit = max(1, min(int(params.get('limit', ['10'])[0]), 50))
        except (ValueError, IndexError):
            limit = 10

        if not q:
            self._json([])
            return

        terms  = q.lower().split()
        candidates = [
            p for p in _cache.pages()
            if _passes_default_filter(p, include)
            and (scope is None or p.get('scope') == scope)
            and (category is None or p.get('category') == category)
        ]
        scored = sorted(
            [(p, s) for p in candidates if (s := _score(p, terms)) > 0],
            key=lambda x: x[1],
            reverse=True,
        )

        self._json([
            {
                'id':          p['id'],
                'title':       p['title'],
                'category':    p.get('category', ''),
                'type':        p.get('type', 'note'),
                'scope':       p.get('scope', 'vault'),
                'description': p.get('description', ''),
                'url':         p.get('url', ''),
                'score':       s,
            }
            for p, s in scored[:limit]
        ])

    def _semantic(self, params: dict) -> None:
        q     = params.get('q', [''])[0].strip()
        scope = params.get('scope', [''])[0].strip() or None
        try:
            limit = max(1, min(int(params.get('limit', ['5'])[0]), 20))
        except (ValueError, IndexError):
            limit = 5

        if not q:
            self._json([])
            return

        try:
            records = _get_records()
        except RuntimeError as exc:
            # No embeddings — degrade to empty result with hint header.
            self._error(503, str(exc))
            return

        try:
            q_vec = _embed_query(q)
        except urllib.error.URLError:
            self._error(503, 'Ollama not reachable — run: ollama pull all-minilm')
            return
        except Exception as exc:
            self._error(500, f'Embed query failed: {exc}')
            return

        filtered = [
            r for r in records
            if r.get('type') not in DEFAULT_EXCLUDE_TYPES
            and (scope is None or r.get('scope') == scope)
        ]

        scored = [(r['id'], _cosine(q_vec, r['embedding'])) for r in filtered]
        scored.sort(key=lambda x: x[1], reverse=True)
        top = [(pid, s) for pid, s in scored[:limit] if s > 0.1]

        pages_by_id = {p['id']: p for p in _cache.pages()}
        result = []
        for pid, score in top:
            p = pages_by_id.get(pid)
            if p:
                result.append({
                    'id':          pid,
                    'title':       p['title'],
                    'category':    p.get('category', ''),
                    'type':        p.get('type', 'note'),
                    'scope':       p.get('scope', 'vault'),
                    'description': p.get('description', ''),
                    'url':         p.get('url', ''),
                    'score':       round(score, 4),
                })
        self._json(result)

    def _page(self, page_id: str) -> None:
        """Flexible-depth page lookup.

        The ID is the slash-joined path under vault/ minus the index.html
        filename (and minus the .md extension for non-index markdown files).
        """
        match = next((p for p in _cache.pages() if p['id'] == page_id), None)
        if not match:
            self._error(404, f'Page not found: {page_id}')
            return

        # Re-read source file for full text — index caps at 3000 chars.
        src = ROOT / match.get('path', '')
        try:
            full_text = _strip_to_text(src.read_text(encoding='utf-8', errors='replace'))
        except OSError:
            full_text = match.get('text', '')

        self._json({**match, 'text': full_text})

    def _agent(self, slug: str) -> None:
        """Aggregate snapshot for an agent office.

        Returns: state.md frontmatter+body, last N log lines, open projects,
        recent meeting page IDs. Reads the source files directly so it stays
        in sync without waiting for re-index.
        """
        office = VAULT_DIR / 'agents' / slug
        if not office.is_dir():
            self._error(404, f'Agent office not found: {slug}')
            return

        # state
        state_file = office / 'state.md'
        state_body = ''
        state_fm: dict = {}
        if state_file.exists():
            try:
                raw = state_file.read_text(encoding='utf-8', errors='replace')
                state_body = raw
                # Pull frontmatter from the page index (already parsed)
                page = next(
                    (p for p in _cache.pages()
                     if p['id'] == f'agents/{slug}/state'),
                    None,
                )
                if page:
                    state_fm = page.get('frontmatter', {})
            except OSError:
                pass

        # log
        log_file = office / 'log.md'
        recent_log: list[str] = []
        if log_file.exists():
            try:
                lines = log_file.read_text(encoding='utf-8', errors='replace').splitlines()
                recent_log = [ln for ln in lines if ln.strip()][-20:]
            except OSError:
                pass

        # open projects
        projects_dir = office / 'projects'
        open_projects: list[str] = []
        if projects_dir.is_dir():
            open_projects = sorted(
                p.name for p in projects_dir.iterdir() if p.is_dir()
            )

        # recent meetings (per-agent)
        meetings_dir = office / 'meetings'
        recent_meetings: list[str] = []
        if meetings_dir.is_dir():
            recent_meetings = sorted(
                (f'agents/{slug}/meetings/{m.name}'
                 for m in meetings_dir.iterdir() if m.is_dir()),
                reverse=True,
            )[:5]

        self._json({
            'agent':           slug,
            'state':           state_fm,
            'state_body':      state_body,
            'recent_log':      recent_log,
            'open_projects':   open_projects,
            'recent_meetings': recent_meetings,
        })

    # ── IDE control endpoints ──────────────────────────────────────────────────

    def _ide_status(self) -> None:
        queue_len = 0
        if QUEUE_FILE.exists():
            try:
                queue_len = len(json.loads(QUEUE_FILE.read_text(encoding='utf-8')))
            except Exception:
                queue_len = 0
        self._json({
            'name': 'Atlas OS IDE',
            'mcp_version': '2024-11-05',
            'ide_running': STATE_FILE.exists(),
            'vault_pages': len(_cache.pages()),
            'queue_pending': queue_len,
            'endpoints': {
                'GET  /api/ide/status':                'IDE status',
                'GET  /api/ide/canvas':                'canvas state snapshot',
                'POST /api/ide/canvas/panels':         'add panel  {panelType, title?, meta?, x?, y?}',
                'DELETE /api/ide/canvas/panels/{id}':  'remove panel by id',
                'POST /api/ide/agent/message':         'send message {message, agentId?}',
                'POST /api/ide/tab':                   'open tab {url}',
            },
        })

    def _ide_canvas(self) -> None:
        if not STATE_FILE.exists():
            self._json({'error': 'IDE not running or state not exported yet'}, 503)
            return
        try:
            self._json(json.loads(STATE_FILE.read_text(encoding='utf-8')))
        except Exception as e:
            self._error(500, f'Could not read canvas state: {e}')

    def _ide_add_panel(self, body: dict) -> None:
        panel_type = body.get('panelType', '').strip()
        valid = {'terminal', 'editor', 'chat', 'web', 'vault-home', 'canvas', 'agent', 'preview'}
        if panel_type not in valid:
            self._error(400, f'Unknown panelType: {panel_type}. Valid: {sorted(valid)}')
            return
        cmd = {
            'type':      'add_panel',
            'panelType': panel_type,
            'title':     body.get('title', panel_type.capitalize()),
            'meta':      body.get('meta', {}),
        }
        if 'x' in body: cmd['x'] = body['x']
        if 'y' in body: cmd['y'] = body['y']
        _ide_enqueue(cmd)
        self._json({'ok': True, 'queued': cmd})

    def _ide_send_message(self, body: dict) -> None:
        message = body.get('message', '').strip()
        if not message:
            self._error(400, 'message required')
            return
        cmd: dict = {'type': 'send_message', 'message': message}
        if body.get('agentId'):
            cmd['agentId'] = body['agentId']
        _ide_enqueue(cmd)
        self._json({'ok': True, 'queued_message': message[:120]})

    def _ide_open_tab(self, body: dict) -> None:
        url = body.get('url', '').strip()
        if not url:
            self._error(400, 'url required')
            return
        _ide_enqueue({'type': 'open_tab', 'url': url})
        self._json({'ok': True, 'queued_url': url})

    def _categories(self) -> None:
        counts: dict[str, int] = {}
        for p in _cache.pages():
            counts[p['category']] = counts.get(p['category'], 0) + 1
        self._json(
            sorted(
                [{'name': k, 'count': v} for k, v in counts.items()],
                key=lambda x: x['name'],
            )
        )

    def _all_pages(self) -> None:
        """Return the complete index object (generated timestamp + pages array)."""
        try:
            self._json(json.loads(INDEX_FILE.read_text(encoding='utf-8')))
        except (OSError, json.JSONDecodeError) as exc:
            self._error(503, f'Index unavailable: {exc}')

    # ── CLI bridge endpoints ───────────────────────────────────────────────────

    def _cli_tasks(self):
        tasks_dir = ROOT / 'vault' / 'agents' / 'sentor' / 'tasks'
        tasks = []
        for f in sorted(tasks_dir.glob('*.json')):
            try:
                t = json.loads(f.read_text(encoding='utf-8'))
                tasks.append({k: t[k] for k in ('id','name','type','provider','description')
                               if k in t})
            except Exception as exc:
                print(f'  [tasks] skipping {f.name}: {exc}', file=sys.stderr)
        self._json({'tasks': tasks})

    def _cli_pipelines(self):
        pl_dir = ROOT / 'vault' / 'agents' / 'sentor' / 'pipelines'
        pls = []
        for f in sorted(pl_dir.glob('*.json')):
            try:
                p = json.loads(f.read_text(encoding='utf-8'))
                pls.append({'id': p['id'], 'name': p.get('name',''),
                             'steps': len(p.get('steps',[])),
                             'trigger': p.get('trigger',{}).get('type','manual')})
            except Exception as exc:
                print(f'  [pipelines] skipping {f.name}: {exc}', file=sys.stderr)
        self._json({'pipelines': pls})

    def _cli_provider(self):
        def probe(url):
            try:
                r = urllib.request.urlopen(url, timeout=2)
                return r.status == 200
            except Exception:
                return False
        self._json({
            'local-ollama':   probe('http://localhost:11434/api/tags'),
            'local-lmstudio': probe('http://localhost:1234/v1/models'),
            'openrouter':     bool(os.environ.get('OPENROUTER_API_KEY')),
        })

    def _cli_run(self, body):
        task_id = body.get('task_id', '').strip()
        if not task_id:
            self._error(400, 'task_id required')
            return
        extra = body.get('input', '') or None
        wait  = bool(body.get('wait', False))

        def _go():
            try:
                cli_dir = str(ROOT / 'cli')
                if cli_dir not in sys.path:
                    sys.path.insert(0, cli_dir)
                from sentor import run_task  # noqa: PLC0415
                run_task(task_id, wait=wait, extra_input=extra)
            except Exception as exc:
                print(f'  [task:{task_id}] error: {exc}', file=sys.stderr)

        threading.Thread(target=_go, daemon=True).start()
        self._json({'ok': True, 'task_id': task_id, 'status': 'started'})

    def _cli_notify(self, body):
        msg = body.get('msg', '').strip()
        if not msg:
            self._error(400, 'msg required')
            return
        cli_dir = str(ROOT / 'cli')
        if cli_dir not in sys.path:
            sys.path.insert(0, cli_dir)
        from sentor import notify as _notify  # noqa: PLC0415
        _notify(msg)
        self._json({'ok': True})

    def _cli_pipeline_run(self, body):
        pid = body.get('pipeline_id', '').strip()
        if not pid:
            self._error(400, 'pipeline_id required')
            return
        ctx = body.get('ctx', {}) or {}

        def _go():
            try:
                cli_dir = str(ROOT / 'cli')
                if cli_dir not in sys.path:
                    sys.path.insert(0, cli_dir)
                from pipeline import run_pipeline  # noqa: PLC0415
                run_pipeline(pid, ctx)
            except Exception as exc:
                print(f'  [pipeline:{pid}] error: {exc}', file=sys.stderr)

        threading.Thread(target=_go, daemon=True).start()
        self._json({'ok': True, 'pipeline_id': pid, 'status': 'started'})

    # ── Nodes (unified pipeline + task listing for canvas menu) ───────────────

    def _nodes_list(self):
        nodes = []
        pl_dir  = ROOT / 'vault' / 'agents' / 'sentor' / 'pipelines'
        tsk_dir = ROOT / 'vault' / 'agents' / 'sentor' / 'tasks'
        for f in sorted(pl_dir.glob('*.json')):
            try:
                p = json.loads(f.read_text(encoding='utf-8'))
                cm = p.get('canvas_meta', {})
                nodes.append({
                    'id':          p['id'],
                    'name':        p.get('name', p['id']),
                    'kind':        'pipeline',
                    'steps_count': len(p.get('steps', [])),
                    'trigger':     p.get('trigger', {}).get('type', 'manual'),
                    'color':       cm.get('color', '#5b8def'),
                    'icon':        cm.get('icon', '▶'),
                    'output_kind': cm.get('output_kind', 'text'),
                })
            except Exception as exc:
                print(f'  [nodes] skipping pipeline {f.name}: {exc}', file=sys.stderr)
        for f in sorted(tsk_dir.glob('*.json')):
            try:
                t = json.loads(f.read_text(encoding='utf-8'))
                cm = t.get('canvas_meta', {})
                nodes.append({
                    'id':          t['id'],
                    'name':        t.get('name', t['id']),
                    'kind':        'task',
                    'steps_count': 1,
                    'trigger':     'manual',
                    'color':       cm.get('color', '#7b6def'),
                    'icon':        cm.get('icon', '⚙'),
                    'output_kind': cm.get('output_kind', 'text'),
                })
            except Exception as exc:
                print(f'  [nodes] skipping task {f.name}: {exc}', file=sys.stderr)
        self._json({'nodes': nodes})

    def _node_run(self, node_id: str, body: dict):
        if not node_id:
            self._error(400, 'node id required')
            return
        ctx = body.get('ctx', {}) or {}

        # Auto-detect kind from filesystem
        pl_path  = ROOT / 'vault' / 'agents' / 'sentor' / 'pipelines' / f'{node_id}.json'
        tsk_path = ROOT / 'vault' / 'agents' / 'sentor' / 'tasks'     / f'{node_id}.json'

        if pl_path.exists():
            kind = 'pipeline'
        elif tsk_path.exists():
            kind = 'task'
        else:
            self._error(404, f'Node not found: {node_id}')
            return

        def _go():
            try:
                cli_dir = str(ROOT / 'cli')
                if cli_dir not in sys.path:
                    sys.path.insert(0, cli_dir)
                if kind == 'pipeline':
                    from pipeline import run_pipeline  # noqa: PLC0415
                    run_pipeline(node_id, ctx)
                else:
                    from sentor import run_task  # noqa: PLC0415
                    run_task(node_id, wait=False, extra_input=ctx.get('input'))
            except Exception as exc:
                print(f'  [node:{node_id}] error: {exc}', file=sys.stderr)

        threading.Thread(target=_go, daemon=True).start()
        self._json({'ok': True, 'id': node_id, 'kind': kind, 'status': 'started'})

    # ── Response helpers ───────────────────────────────────────────────────────

    def _json(self, data, status: int = 200) -> None:
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type',                 'application/json; charset=utf-8')
        self.send_header('Content-Length',               str(len(body)))
        self.send_header('Access-Control-Allow-Origin',  self._cors_origin())
        self.send_header('Cache-Control',                'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _static(self, path: str) -> None:
        rel  = unquote(path.lstrip('/'))
        file = (ROOT / rel).resolve()
        if not file.is_relative_to(ROOT.resolve()):
            self._error(403, 'Forbidden')
            return
        if file.is_dir():
            file = file / 'index.html'
        if not file.exists() or not file.is_file():
            self._error(404, f'Not found: {path}')
            return
        mime, _ = mimetypes.guess_type(str(file))
        mime = mime or 'application/octet-stream'
        body = file.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type',                mime)
        self.send_header('Content-Length',              str(len(body)))
        self.send_header('Access-Control-Allow-Origin', self._cors_origin())
        self.send_header('Cache-Control',               'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _error(self, status: int, message: str) -> None:
        self._json({'error': message}, status=status)

    def log_message(self, fmt, *args) -> None:
        """One-line request log: METHOD  path  →  status"""
        print(f'  {self.command:<7} {self.path:<45}  {args[1]}')


# ── Public entry point (called by atlas serve or directly) ────────────────────

def serve(port: int = DEFAULT_PORT) -> None:
    ThreadingHTTPServer.allow_reuse_address = True
    server = ThreadingHTTPServer(('127.0.0.1', port), _Handler)
    base   = f'http://localhost:{port}'
    print(f'\n  Atlas OS API  —  {base}')
    print(f'  Token:      see ~/.atlas/api-token  ({_API_TOKEN[:8]}…)')
    print(f'  {base}/api/search?q=...')
    print(f'  {base}/api/semantic?q=...')
    print(f'  {base}/api/hybrid?q=...&alpha=0.6')
    print(f'  {base}/api/page/{{category}}/{{slug}}')
    print(f'  {base}/api/categories')
    print(f'  {base}/api/pages')
    print(f'  --- IDE control ---')
    print(f'  GET  {base}/api/ide/status')
    print(f'  GET  {base}/api/ide/canvas')
    print(f'  POST {base}/api/ide/canvas/panels     {{panelType, title, meta}}')
    print(f'  DEL  {base}/api/ide/canvas/panels/{{id}}')
    print(f'  POST {base}/api/ide/agent/message      {{message, agentId?}}')
    print(f'  POST {base}/api/ide/tab                {{url}}')
    print(f'\n  Ctrl+C to stop\n')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n  Stopped.\n')


if __name__ == '__main__':
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f'Invalid port: {sys.argv[1]}')
            sys.exit(1)
    serve(port)
