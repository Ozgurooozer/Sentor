#!/usr/bin/env python3
"""
Atlas OS CLI
  atlas index              rebuild the search index
  atlas search "q"         search pages
  atlas list [category]    list all pages, or pages in a category
  atlas open category/slug open a page in the default browser
"""

import argparse
import json
import os
import subprocess
import sys
import webbrowser
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────

ROOT       = Path(__file__).resolve().parent.parent
VAULT_DIR  = ROOT / "vault"
INDEX_FILE = ROOT / ".index" / "pages.json"
INDEXER    = ROOT / "tools" / "indexer.py"


# ── Windows: UTF-8 output + ANSI VT processing ───────────────────────────────

if os.name == 'nt':
    if hasattr(sys.stdout, 'reconfigure'):
        try:
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        except Exception:
            pass
    if sys.stdout.isatty():
        try:
            import ctypes
            ctypes.windll.kernel32.SetConsoleMode(
                ctypes.windll.kernel32.GetStdHandle(-11), 7
            )
        except Exception:
            pass


# ── ANSI — accent color for category slugs only, dim for secondary text ───────

_COLOR  = sys.stdout.isatty()
_ACCENT = '\033[38;2;91;141;239m'   # #5b8def
_DIM    = '\033[2m'
_RESET  = '\033[0m'


def _accent(s: str) -> str:
    return f'{_ACCENT}{s}{_RESET}' if _COLOR else s


def _dim(s: str) -> str:
    return f'{_DIM}{s}{_RESET}' if _COLOR else s


# ── Index ─────────────────────────────────────────────────────────────────────

def _load_pages() -> list[dict]:
    if not INDEX_FILE.exists():
        print('\n  No index found. Run:  atlas index\n')
        sys.exit(1)
    try:
        return json.loads(INDEX_FILE.read_text(encoding='utf-8')).get('pages', [])
    except (json.JSONDecodeError, OSError) as exc:
        print(f'\n  Index unreadable: {exc}\n')
        sys.exit(1)


# ── Search helpers ────────────────────────────────────────────────────────────

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


def _snippet(text: str, terms: list[str], length: int = 100) -> str:
    """Short excerpt centred on the first matching term."""
    low = text.lower()
    for t in terms:
        idx = low.find(t)
        if idx >= 0:
            start = max(0, idx - 30)
            end   = min(len(text), start + length)
            chunk = text[start:end].strip()
            return ('…' if start else '') + chunk + ('…' if end < len(text) else '')
    return text[:length].rstrip() + ('…' if len(text) > length else '')


def _relevant_headings(page: dict, terms: list[str]) -> list[str]:
    matched = [h for h in page['headings']
               if any(t in h.lower() for t in terms)]
    return (matched or page['headings'])[:3]


def _id_colored(page: dict) -> str:
    """category/slug — only the category part in accent color."""
    return f'{_accent(page["category"])}/{page["slug"]}'


# ── Commands ──────────────────────────────────────────────────────────────────

def cmd_index() -> None:
    if not INDEXER.exists():
        print(f'\n  Indexer not found: {INDEXER}\n')
        sys.exit(1)
    result = subprocess.run([sys.executable, str(INDEXER)])
    sys.exit(result.returncode)


def cmd_search(query: str) -> None:
    terms = [t for t in query.lower().strip().split() if t]
    if not terms:
        print('\n  Usage: atlas search "your query"\n')
        return

    pages   = _load_pages()
    results = sorted(
        [(p, s) for p in pages if (s := _score(p, terms)) > 0],
        key=lambda x: x[1],
        reverse=True,
    )

    n = len(results)
    print()

    if not n:
        print(f'  No results for "{query}"\n')
        return

    print(f'  {n} result{"s" if n != 1 else ""} for "{query}"\n')

    for page, _ in results[:10]:
        # Separator rule.
        # Measure visible length only (no ANSI bytes) before adding color.
        visible_prefix = len(page['id']) + 6      # "  ── " (5) + " " (1) = 6
        rule = '─' * max(4, 62 - visible_prefix)
        print(f'  ── {_id_colored(page)} {rule}')

        # Title
        print(f'     {page["title"]}')

        # Description or snippet
        blurb = page['description'] or _snippet(page['text'], terms)
        if blurb:
            print(f'     {_dim(blurb[:100])}')

        # Headings that contain the query terms
        heads = _relevant_headings(page, terms)
        if heads:
            print(f'     {_dim("  ·  ".join(heads))}')

        print()


def cmd_list(category: str | None) -> None:
    pages = _load_pages()

    if category:
        pages = [p for p in pages if p['category'] == category]
        if not pages:
            print(f'\n  No pages in category "{category}"\n')
            return

    pages = sorted(pages, key=lambda p: (p['category'], p['slug']))
    n     = len(pages)

    # Measure column widths from actual data — pad BEFORE applying color.
    cat_w  = max(len(p['category']) + 2 for p in pages)   # +2 for []
    slug_w = max(len(p['slug'])         for p in pages)

    print()
    label = f'  {n} page{"s" if n != 1 else ""}'
    if category:
        label += f'  ·  {_accent(category)}'
    print(label)
    print()

    for page in pages:
        cat_label = f'[{page["category"]}]'
        cat_col   = _accent(cat_label.ljust(cat_w))    # pad first, color second
        slug_col  = page['slug'].ljust(slug_w)
        title     = page['title']
        if len(title) > 48:
            title = title[:47] + '…'
        print(f'  {cat_col}  {slug_col}  {title}')

    print()


def cmd_serve(port: int) -> None:
    # Lazy import — only loads api/server.py when this command is used.
    api_dir = str(ROOT / 'api')
    if api_dir not in sys.path:
        sys.path.insert(0, api_dir)
    try:
        from server import serve as _serve   # noqa: PLC0415
        _serve(port)
    except ImportError as exc:
        print(f'\n  Could not load API server: {exc}\n')
        sys.exit(1)


def cmd_chat(model_name: str | None) -> None:
    # Lazy imports — only loads these when chat subcommand is used.
    try:
        import ollama as _ollama
    except ImportError:
        print('\n  ollama library not found. Install it first:\n'
              '    pip install ollama\n')
        sys.exit(1)

    tools_file  = ROOT / 'tools' / 'ollama-tools.json'
    system_file = ROOT / 'tools' / 'ollama-system.md'

    if not tools_file.exists():
        print(f'\n  Tool definitions not found: {tools_file}\n')
        sys.exit(1)

    tools  = json.loads(tools_file.read_text(encoding='utf-8'))['tools']
    system = system_file.read_text(encoding='utf-8') if system_file.exists() else ''

    # Discover available models
    import urllib.request, urllib.error
    try:
        resp   = urllib.request.urlopen('http://localhost:11434/api/tags', timeout=3)
        models = [m['name'] for m in json.loads(resp.read())['models']]
    except Exception:
        print('\n  Ollama is not running. Start it with:  ollama serve\n')
        sys.exit(1)

    if model_name:
        model = model_name
    else:
        model = (
            next((m for m in models if 'qwen2.5-coder' in m.lower()), None) or
            next((m for m in models if 'qwen'          in m.lower()), None) or
            (models[0] if models else None)
        )

    if not model:
        print('\n  No models found. Pull one first:  ollama pull qwen2.5-coder\n')
        sys.exit(1)

    # Check API server is reachable
    try:
        urllib.request.urlopen('http://localhost:4242/api/categories', timeout=2)
    except Exception:
        print('\n  Atlas API is not running. Start it with:  atlas serve\n')
        sys.exit(1)

    print(f'\n  {_accent("Atlas OS")} chat  ·  model: {_dim(model)}')
    print(f'  {_dim("Type your question. Press Ctrl+C or type /quit to exit.")}\n')

    messages = []
    if system:
        messages.append({'role': 'system', 'content': system})

    def _call_tool(name: str, args: dict):
        import urllib.parse
        if name == 'search_knowledge':
            query    = args.get('query', '')
            limit    = args.get('limit', 5)
            category = args.get('category', '')
            url = (f'http://localhost:4242/api/search'
                   f'?q={urllib.parse.quote(str(query))}&limit={int(limit)}')
            if category:
                url += f'&category={urllib.parse.quote(str(category))}'
        elif name == 'get_page':
            parts = str(args.get('id', '')).split('/', 1)
            if len(parts) != 2:
                return {'error': f'Invalid ID: {args.get("id")}'}
            cat, slug = parts
            url = (f'http://localhost:4242/api/page'
                   f'/{urllib.parse.quote(cat)}/{urllib.parse.quote(slug)}')
        else:
            return {'error': f'Unknown tool: {name}'}
        try:
            r = urllib.request.urlopen(url, timeout=5)
            return json.loads(r.read().decode('utf-8'))
        except Exception as e:
            return {'error': str(e)}

    while True:
        try:
            user_input = input('  > ').strip()
        except (KeyboardInterrupt, EOFError):
            print()
            break

        if not user_input:
            continue
        if user_input.lower() in ('/quit', '/exit', 'quit', 'exit', 'q'):
            break

        messages.append({'role': 'user', 'content': user_input})

        # Agentic loop — keep going until no more tool calls
        while True:
            try:
                resp = _ollama.chat(model=model, messages=messages, tools=tools)
            except Exception as e:
                print(f'  {_dim(f"[error] {e}")}\n')
                messages.pop()   # remove the user message that failed
                break

            msg  = resp.message
            tcs  = getattr(msg, 'tool_calls', None) or []
            messages.append(msg)

            if not tcs:
                # Final answer
                text = (msg.content or '').strip()
                if text:
                    print()
                    for line in text.splitlines():
                        print(f'  {line}')
                    print()
                break

            # Execute tool calls silently (show activity in dim)
            for tc in tcs:
                name = tc.function.name
                args = dict(tc.function.arguments)
                print(f'  {_dim(f"[{name}] {json.dumps(args)}")}')
                result = _call_tool(name, args)
                messages.append({'role': 'tool', 'content': json.dumps(result)})

    print(f'  {_dim("Goodbye.")}\n')


def cmd_open(page_id: str) -> None:
    parts = page_id.strip('/').split('/')
    if len(parts) != 2:
        print(f'\n  Invalid ID: "{page_id}"')
        print('  Expected:   category/slug  (e.g. html/html-quality)\n')
        sys.exit(1)

    category, slug = parts
    html_file = VAULT_DIR / category / slug / 'index.html'

    if not html_file.exists():
        print(f'\n  Not found: {html_file}\n')
        sys.exit(1)

    print(f'\n  Opening {_accent(page_id)}')
    print(f'  {_dim(str(html_file))}\n')
    webbrowser.open(html_file.as_uri())


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(
        prog='atlas',
        description='Atlas OS — local knowledge base',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            'examples:\n'
            '  atlas index\n'
            '  atlas search "semantic html"\n'
            '  atlas list\n'
            '  atlas list html\n'
            '  atlas open html/html-quality\n'
            '  atlas serve\n'
            '  atlas serve 8080\n'
            '  atlas chat\n'
            '  atlas chat --model qwen2.5-coder:7b\n'
        ),
    )
    sub = ap.add_subparsers(dest='cmd')

    sub.add_parser('index',  help='rebuild the search index')

    ps = sub.add_parser('search', help='search pages')
    ps.add_argument('query', nargs='+', help='search terms')

    pl = sub.add_parser('list', help='list pages')
    pl.add_argument('category', nargs='?', default=None, help='filter by category')

    po = sub.add_parser('open', help='open a page in the browser')
    po.add_argument('id', help='page ID: category/slug')

    pv = sub.add_parser('serve', help='start the local HTTP API server')
    pv.add_argument('port', nargs='?', type=int, default=4242,
                    help='port to listen on (default: 4242)')

    pc = sub.add_parser('chat', help='interactive AI chat powered by Ollama')
    pc.add_argument('--model', default=None, metavar='MODEL',
                    help='Ollama model to use (default: auto-detect qwen2.5-coder)')

    args = ap.parse_args()

    if   args.cmd == 'index':  cmd_index()
    elif args.cmd == 'search': cmd_search(' '.join(args.query))
    elif args.cmd == 'list':   cmd_list(args.category)
    elif args.cmd == 'open':   cmd_open(args.id)
    elif args.cmd == 'serve':  cmd_serve(args.port)
    elif args.cmd == 'chat':   cmd_chat(args.model)
    else:                      ap.print_help()


if __name__ == '__main__':
    main()
