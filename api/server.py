#!/usr/bin/env python3
"""
Atlas OS — Local Knowledge API
  GET /api/search?q={query}&limit={n}&category={cat}
  GET /api/page/{category}/{slug}
  GET /api/categories
  GET /api/pages

Run standalone:  python api/server.py [port]
Via CLI:         atlas serve [port]            (default port: 4242)
"""

import html as _html
import json
import re
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT         = Path(__file__).resolve().parent.parent
VAULT_DIR    = ROOT / "vault"
INDEX_FILE   = ROOT / ".index" / "pages.json"
DEFAULT_PORT = 4242


# ── Search scoring ─────────────────────────────────────────────────────────────
# Kept in sync with cli/atlas.py by copying — not imported, to keep both files
# independently runnable without path manipulation.

def _score(page: dict, terms: list[str]) -> int:
    title    = page['title'].lower()
    headings = ' '.join(page['headings']).lower()
    desc     = page['description'].lower()
    text     = page['text'].lower()
    score    = 0
    for t in terms:
        if t in title:    score += 3
        if t in headings: score += 2
        if t in desc:     score += 2
        if t in text:     score += 1
    return score


# ── HTML → plain text ──────────────────────────────────────────────────────────

_BLOCK_TAGS = re.compile(
    r'<(?:br|p|div|h[1-6]|li|tr|dt|dd|blockquote|section|article|header|footer|nav|main)[^>]*/?>',
    re.IGNORECASE,
)
_SKIP_BLOCKS = re.compile(
    r'<(script|style|noscript)[^>]*>.*?</\1>',
    re.DOTALL | re.IGNORECASE,
)
_ANY_TAG = re.compile(r'<[^>]+>')


def _strip_to_text(raw_html: str) -> str:
    """Convert raw HTML to clean plain text for AI context windows."""
    text = _SKIP_BLOCKS.sub(' ',  raw_html)   # drop script/style content
    text = _BLOCK_TAGS.sub('\n',  text)        # block elements → newlines
    text = _ANY_TAG.sub('',       text)        # remove remaining tags
    text = _html.unescape(text)                # &amp; → & etc.
    lines = [line.strip() for line in text.splitlines()]
    text  = '\n'.join(line for line in lines if line)
    return re.sub(r'\n{3,}', '\n\n', text).strip()


# ── Index cache ────────────────────────────────────────────────────────────────

class _Cache:
    """Holds the page list in memory; reloads when pages.json mtime changes."""

    def __init__(self):
        self._pages: list[dict] = []
        self._mtime: float      = 0.0

    def pages(self) -> list[dict]:
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


# ── Request handler ────────────────────────────────────────────────────────────

class _Handler(BaseHTTPRequestHandler):

    # ── Routing ────────────────────────────────────────────────────────────────

    def do_GET(self):
        parsed = urlparse(self.path)
        path   = parsed.path.rstrip('/')
        params = parse_qs(parsed.query)

        if path in ('', '/api'):
            self._json({
                'name': 'Atlas OS API',
                'endpoints': [
                    '/api/search?q={query}&limit={n}&category={cat}',
                    '/api/page/{category}/{slug}',
                    '/api/categories',
                    '/api/pages',
                ],
            })
        elif path == '/api/search':
            self._search(params)
        elif path == '/api/categories':
            self._categories()
        elif path == '/api/pages':
            self._all_pages()
        elif path.startswith('/api/page/'):
            tail  = path[len('/api/page/'):].strip('/')
            parts = tail.split('/')
            if len(parts) == 2:
                self._page(parts[0], parts[1])
            else:
                self._error(400, 'Expected /api/page/{category}/{slug}')
        else:
            self._error(404, f'No endpoint: {path}')

    def do_OPTIONS(self):
        """CORS preflight — browsers and some Ollama clients send this first."""
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()

    # ── Endpoints ──────────────────────────────────────────────────────────────

    def _search(self, params: dict) -> None:
        q        = params.get('q',        [''])[0].strip()
        category = params.get('category', [''])[0].strip() or None
        try:
            limit = max(1, min(int(params.get('limit', ['10'])[0]), 50))
        except (ValueError, IndexError):
            limit = 10

        if not q:
            self._json([])
            return

        terms  = q.lower().split()
        scored = sorted(
            [(p, s) for p in _cache.pages() if (s := _score(p, terms)) > 0],
            key=lambda x: x[1],
            reverse=True,
        )
        if category:
            scored = [(p, s) for p, s in scored if p['category'] == category]

        self._json([
            {
                'id':          p['id'],
                'title':       p['title'],
                'category':    p['category'],
                'description': p['description'],
                'url':         p['url'],
                'score':       s,
            }
            for p, s in scored[:limit]
        ])

    def _page(self, category: str, slug: str) -> None:
        page_id = f'{category}/{slug}'
        match   = next((p for p in _cache.pages() if p['id'] == page_id), None)

        if not match:
            self._error(404, f'Page not found: {page_id}')
            return

        # Re-read the HTML file for full text — the index caps at 3000 chars,
        # but agents need the complete content for their context window.
        html_file = VAULT_DIR / category / slug / 'index.html'
        try:
            full_text = _strip_to_text(
                html_file.read_text(encoding='utf-8', errors='replace')
            )
        except OSError:
            full_text = match['text']   # fallback to index excerpt

        self._json({**match, 'text': full_text})

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

    # ── Response helpers ───────────────────────────────────────────────────────

    def _json(self, data, status: int = 200) -> None:
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type',                 'application/json; charset=utf-8')
        self.send_header('Content-Length',               str(len(body)))
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Cache-Control',                'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _error(self, status: int, message: str) -> None:
        self._json({'error': message}, status=status)

    def log_message(self, fmt, *args) -> None:
        """One-line request log: METHOD  path  →  status"""
        print(f'  {self.command:<7} {self.path:<45}  {args[1]}')


# ── Public entry point (called by atlas serve or directly) ────────────────────

def serve(port: int = DEFAULT_PORT) -> None:
    server = HTTPServer(('127.0.0.1', port), _Handler)
    base   = f'http://localhost:{port}'
    print(f'\n  Atlas OS API  —  {base}')
    print(f'  {base}/api/search?q=...')
    print(f'  {base}/api/page/{{category}}/{{slug}}')
    print(f'  {base}/api/categories')
    print(f'  {base}/api/pages')
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
