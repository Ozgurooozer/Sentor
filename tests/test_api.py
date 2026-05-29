#!/usr/bin/env python3
"""
Atlas OS API test suite.
Starts a temporary server in a background thread — no running instance needed.
Run: python tools/test_api.py
"""

import json
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

if sys.platform == 'win32' and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

sys.path.insert(0, str(ROOT / 'api'))
sys.path.insert(0, str(ROOT / 'tools'))

try:
    from server import _Handler, _API_TOKEN
except ImportError as exc:
    print(f'\n  Cannot import server: {exc}')
    print('  Build api/server.py first.\n')
    sys.exit(1)

# Use a dedicated test port to avoid colliding with a running instance
TEST_PORT = 4299
BASE      = f'http://localhost:{TEST_PORT}'


# ── Server lifecycle ───────────────────────────────────────────────────────────

def _start_server() -> HTTPServer:
    httpd  = HTTPServer(('127.0.0.1', TEST_PORT), _Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd


def _wait_ready(timeout: float = 5.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            # /api/categories is a public (no-auth) endpoint
            urllib.request.urlopen(f'{BASE}/api/categories', timeout=1)
            return True
        except Exception:
            time.sleep(0.05)
    return False


# ── Test runner ────────────────────────────────────────────────────────────────

_passed = 0
_failed = 0


def test(name: str, fn) -> None:
    global _passed, _failed
    try:
        fn()
        print(f'  PASS  {name}')
        _passed += 1
    except AssertionError as exc:
        print(f'  FAIL  {name}')
        if str(exc):
            print(f'        {exc}')
        _failed += 1
    except Exception as exc:
        print(f'  ERR   {name}: {exc}')
        _failed += 1


# ── HTTP helpers ───────────────────────────────────────────────────────────────

def _get(path: str, auth: bool = True):
    req = urllib.request.Request(f'{BASE}{path}')
    if auth:
        req.add_header('Authorization', f'Bearer {_API_TOKEN}')
    resp = urllib.request.urlopen(req, timeout=5)
    assert resp.status == 200, f'HTTP {resp.status}'
    cors = resp.getheader('Access-Control-Allow-Origin') or ''
    assert cors != '', f'Missing CORS header on {path}'
    return json.loads(resp.read().decode('utf-8'))


def _get_unauth(path: str) -> int:
    """Expect a 401 for an unauthenticated request."""
    req = urllib.request.Request(f'{BASE}{path}')
    try:
        urllib.request.urlopen(req, timeout=5)
        return 200  # should not happen
    except urllib.error.HTTPError as e:
        return e.code


def _get_error(path: str, auth: bool = True) -> tuple[int, dict]:
    """Expect a non-200 response; return (status, body)."""
    req = urllib.request.Request(f'{BASE}{path}')
    if auth:
        req.add_header('Authorization', f'Bearer {_API_TOKEN}')
    try:
        urllib.request.urlopen(req, timeout=5)
        raise AssertionError(f'Expected an error response but got 200 for {path}')
    except urllib.error.HTTPError as exc:
        body = json.loads(exc.read().decode('utf-8'))
        return exc.code, body


def _options(path: str) -> int:
    req  = urllib.request.Request(f'{BASE}{path}', method='OPTIONS')
    resp = urllib.request.urlopen(req, timeout=5)
    return resp.status


# ── Tests ──────────────────────────────────────────────────────────────────────

def _first_page_id() -> str | None:
    """Return the first indexed page ID, or None if the vault is empty."""
    data = _get('/api/pages')
    pages = data.get('pages', [])
    return pages[0]['id'] if pages else None


def test_categories():
    data = _get('/api/categories')
    assert isinstance(data, list), f'Expected list, got {type(data).__name__}'
    for item in data:
        assert 'name'  in item, 'Category item missing "name"'
        assert 'count' in item, 'Category item missing "count"'
        assert isinstance(item['count'], int) and item['count'] > 0, \
            'count must be a positive integer'


def test_pages_index():
    data = _get('/api/pages')
    assert isinstance(data, dict),        'Expected object'
    assert 'pages'     in data,           'Missing "pages" field'
    assert 'count'     in data,           'Missing "count" field'
    assert 'generated' in data,           'Missing "generated" field'
    assert isinstance(data['pages'], list), '"pages" must be an array'
    assert data['count'] == len(data['pages']), \
        f'count {data["count"]} != len(pages) {len(data["pages"])}'


def test_search_returns_results():
    data = _get('/api/search?q=html')
    assert isinstance(data, list), f'Expected list, got {type(data).__name__}'
    if data:
        r = data[0]
        for key in ('id', 'title', 'category', 'description', 'url', 'score'):
            assert key in r, f'Result missing field "{key}"'
        assert isinstance(r['score'], (int, float)), '"score" must be numeric'
        assert r['score'] > 0, '"score" must be positive'


def test_search_empty_query():
    data = _get('/api/search?q=')
    assert data == [], f'Empty query should return [], got {data!r}'


def test_search_empty_query_no_param():
    data = _get('/api/search')
    assert data == [], f'Missing query param should return [], got {data!r}'


def test_search_limit():
    data = _get('/api/search?q=html&limit=1')
    assert isinstance(data, list), 'Expected list'
    assert len(data) <= 1, f'limit=1 returned {len(data)} results'


def test_search_category_filter():
    cats = _get('/api/categories')
    if not cats:
        return                          # vault is empty, skip
    cat  = cats[0]['name']
    data = _get(f'/api/search?q=html&category={cat}')
    assert isinstance(data, list), 'Expected list'
    for r in data:
        assert r['category'] == cat, \
            f'Result category "{r["category"]}" does not match filter "{cat}"'


def test_page_full_text():
    page_id = _first_page_id()
    if not page_id:
        return                          # vault is empty, skip
    api_path = '/api/page/' + page_id
    data = _get(api_path)
    assert isinstance(data, dict), 'Expected object'
    for key in ('id', 'title', 'text', 'headings', 'links', 'backlinks', 'modified'):
        assert key in data, f'Page response missing field "{key}"'
    assert isinstance(data['text'], str) and data['text'], \
        '"text" must be a non-empty string'
    # The text must not begin with an HTML tag — confirms stripping worked
    assert not data['text'].startswith('<'), \
        f'"text" starts with "<", suggesting HTML was not stripped'


def test_page_cors_header():
    page_id = _first_page_id()
    if not page_id:
        return
    # _get() already asserts the CORS header; calling it here is sufficient
    _get('/api/page/' + page_id)


def test_page_not_found():
    status, body = _get_error('/api/page/nonexistent/nonexistent')
    assert status == 404,     f'Expected 404, got {status}'
    assert 'error' in body,   'Error response must contain "error" field'
    assert body['error'],     '"error" field must not be empty'


def test_page_bad_path():
    status, body = _get_error('/api/page/only-one-segment')
    assert status == 404,   f'Expected 404, got {status}'
    assert 'error' in body, 'Error response must contain "error" field'


def test_unknown_endpoint():
    status, body = _get_error('/api/does-not-exist')
    assert status == 404,   f'Expected 404, got {status}'
    assert 'error' in body, 'Error response must contain "error" field'


def test_cors_preflight():
    status = _options('/api/categories')
    assert status == 204, f'OPTIONS should return 204, got {status}'


def test_cors_on_error():
    """CORS header must be present even on error responses."""
    req = urllib.request.Request(f'{BASE}/api/page/x/y')
    req.add_header('Authorization', f'Bearer {_API_TOKEN}')
    try:
        urllib.request.urlopen(req, timeout=5)
    except urllib.error.HTTPError as exc:
        header = exc.headers.get('Access-Control-Allow-Origin')
        assert header, f'CORS header missing on error response (got {header!r})'


def test_auth_required():
    """Unauthenticated requests to protected endpoints must return 401."""
    status = _get_unauth('/api/pages')
    assert status == 401, f'Expected 401 for unauth request, got {status}'


def test_public_path_no_auth():
    """Public endpoints (categories) should work without a token."""
    req = urllib.request.Request(f'{BASE}/api/categories')
    resp = urllib.request.urlopen(req, timeout=5)
    assert resp.status == 200, f'Expected 200 for public /api/categories without auth'


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    httpd = _start_server()
    if not _wait_ready():
        print(f'\n  Server did not start on port {TEST_PORT}\n')
        sys.exit(1)

    print(f'\n  Atlas OS API — {BASE}\n')

    test('GET /api/categories              returns list[{name, count}]', test_categories)
    test('GET /api/pages                   returns full index object',    test_pages_index)
    test('GET /api/search?q=html           returns scored results',       test_search_returns_results)
    test('GET /api/search?q=              empty query -> []',              test_search_empty_query)
    test('GET /api/search (no q param)    no param -> []',                test_search_empty_query_no_param)
    test('GET /api/search?q=html&limit=1  respects limit',               test_search_limit)
    test('GET /api/search?category={cat}  filters by category',          test_search_category_filter)
    test('GET /api/page/{cat}/{slug}      returns full stripped text',    test_page_full_text)
    test('GET /api/page/{cat}/{slug}      CORS header present',           test_page_cors_header)
    test('GET /api/page/x/x              404 + error body',              test_page_not_found)
    test('GET /api/page/one-segment      404 + error body',              test_page_bad_path)
    test('GET /api/does-not-exist        404 + error body',              test_unknown_endpoint)
    test('OPTIONS /api/categories         204 CORS preflight',           test_cors_preflight)
    test('GET /api/page/x/y (error)      CORS header on error response', test_cors_on_error)
    test('GET /api/pages (no auth)       401 Unauthorised',              test_auth_required)
    test('GET /api/categories (no auth)  200 public endpoint',           test_public_path_no_auth)

    httpd.shutdown()

    total = _passed + _failed
    print(f'\n  {_passed}/{total} passed', end='')
    print('\n' if _failed == 0 else f'  ({_failed} failed)\n')
    sys.exit(0 if _failed == 0 else 1)


if __name__ == '__main__':
    main()
