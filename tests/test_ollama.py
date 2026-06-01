#!/usr/bin/env python3
"""
Sentor — Ollama agent integration test.
Full loop: API reachable -> Ollama reachable -> tool call -> result -> final answer.
Run: python tools/test_ollama.py
Requires: ollama (pip install ollama), Ollama running, sentor serve running.
"""

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

if sys.platform == 'win32' and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

API_BASE    = 'http://localhost:4242'
OLLAMA_BASE = 'http://localhost:11434'
TOOLS_FILE  = ROOT / 'tools' / 'ollama-tools.json'
SYSTEM_FILE = ROOT / 'tools' / 'ollama-system.md'
TEST_QUERY  = 'semantic HTML'


# ── Step reporter ──────────────────────────────────────────────────────────────

_step   = 0
_passed = 0
_failed = 0


def step(label: str, ok: bool, detail: str = '') -> bool:
    global _step, _passed, _failed
    _step += 1
    status = 'PASS' if ok else 'FAIL'
    suffix = f'  ({detail})' if detail else ''
    print(f'  [{_step}] {label}: {status}{suffix}')
    if ok:
        _passed += 1
    else:
        _failed += 1
    return ok


# ── HTTP helpers ───────────────────────────────────────────────────────────────

def _get_json(url: str, timeout: float = 5.0):
    """Returns (data, None) on success or (None, error_str) on failure."""
    try:
        resp = urllib.request.urlopen(url, timeout=timeout)
        return json.loads(resp.read().decode('utf-8')), None
    except urllib.error.HTTPError as e:
        return None, f'HTTP {e.code}'
    except Exception as e:
        return None, str(e)


def _call_tool(name: str, args: dict):
    """Execute a tool call against the Sentor API."""
    if name == 'search_knowledge':
        query    = args.get('query', '')
        limit    = args.get('limit', 5)
        category = args.get('category', '')
        url = f'{API_BASE}/api/search?q={urllib.parse.quote(str(query))}&limit={int(limit)}'
        if category:
            url += f'&category={urllib.parse.quote(str(category))}'
        data, err = _get_json(url)
        return data if data is not None else {'error': err}

    if name == 'get_page':
        page_id = args.get('id', '')
        parts   = page_id.split('/', 1)
        if len(parts) != 2:
            return {'error': f'Invalid page ID format: {page_id!r}'}
        cat, slug = parts
        url = f'{API_BASE}/api/page/{urllib.parse.quote(cat)}/{urllib.parse.quote(slug)}'
        data, err = _get_json(url)
        return data if data is not None else {'error': err}

    return {'error': f'Unknown tool: {name}'}


def _run_tool_calls(tool_calls, messages: list) -> dict:
    """Execute all tool calls, append results to messages, return results keyed by tool name."""
    results = {}
    for tc in tool_calls:
        name   = tc.function.name
        args   = dict(tc.function.arguments)
        result = _call_tool(name, args)
        results[name] = result
        messages.append({'role': 'tool', 'content': json.dumps(result)})
    return results


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print(f'\n  Sentor - Ollama Integration Test\n')

    # [1] API reachable
    data, err = _get_json(f'{API_BASE}/api/categories')
    if not step('API reachable', data is not None, err or ''):
        print('\n  Start the API first:  sentor serve\n')
        sys.exit(1)

    # [2] Ollama reachable
    data, err = _get_json(f'{OLLAMA_BASE}/api/tags')
    if not step('Ollama reachable', data is not None, err or ''):
        print('\n  Start Ollama first:   ollama serve\n')
        sys.exit(1)

    # Pick model — prefer qwen2.5-coder, then any qwen, then first available
    models = [m['name'] for m in data.get('models', [])]
    model  = (
        next((m for m in models if 'qwen2.5-coder' in m.lower()), None) or
        next((m for m in models if 'qwen'          in m.lower()), None) or
        (models[0] if models else None)
    )
    if not model:
        print('  No models found. Pull one first: ollama pull qwen2.5-coder\n')
        sys.exit(1)
    print(f'  Model: {model}\n')

    # Load tool definitions and system prompt
    tools  = json.loads(TOOLS_FILE.read_text(encoding='utf-8'))['tools']
    system = SYSTEM_FILE.read_text(encoding='utf-8') if SYSTEM_FILE.exists() else ''

    # Import ollama library (optional runtime dep)
    try:
        import ollama as _ollama
    except ImportError:
        step('ollama library import', False, 'pip install ollama')
        sys.exit(1)

    # Build initial messages
    messages = []
    if system:
        messages.append({'role': 'system', 'content': system})
    messages.append({'role': 'user', 'content': f'What is {TEST_QUERY}?'})

    # ── Round 1: expect search_knowledge ──────────────────────────────────────
    try:
        resp1 = _ollama.chat(model=model, messages=messages, tools=tools)
    except Exception as e:
        step(f'Tool call received: search_knowledge("{TEST_QUERY}")', False, str(e))
        sys.exit(1)

    tool_calls1 = getattr(resp1.message, 'tool_calls', None) or []
    messages.append(resp1.message)

    if not tool_calls1:
        # Model skipped tools entirely — record the gap, then report what we got
        step(f'Tool call received: search_knowledge("{TEST_QUERY}")', False,
             'model returned text instead of tool call (check system prompt)')
        final = resp1.message.content or ''
        step('API returned results',   True, 'skipped')
        step('get_page called',        True, 'skipped')
        step('Final answer generated', bool(final.strip()), f'{len(final)} chars')
        _done()
        return

    # [3] Tool call received
    first   = tool_calls1[0]
    fn_name = first.function.name
    fn_args = dict(first.function.arguments)
    step(f'Tool call received: {fn_name}({json.dumps(fn_args)})', True)

    # Execute round-1 tool calls
    results1 = _run_tool_calls(tool_calls1, messages)

    # [4] Validate search result
    search_result = results1.get('search_knowledge')
    if isinstance(search_result, list):
        step('API returned results', len(search_result) > 0,
             f'{len(search_result)} result(s)')
    else:
        step('API returned results', True, 'skipped (first call was not search_knowledge)')

    # ── Round 2: may call get_page, or give final answer ──────────────────────
    try:
        resp2 = _ollama.chat(model=model, messages=messages, tools=tools)
    except Exception as e:
        step('get_page called', False, str(e))
        sys.exit(1)

    tool_calls2 = getattr(resp2.message, 'tool_calls', None) or []
    messages.append(resp2.message)

    if tool_calls2:
        gp = next((tc for tc in tool_calls2 if tc.function.name == 'get_page'), None)
        if gp:
            page_id = dict(gp.function.arguments).get('id', '?')
            step(f'get_page called: {page_id}', True)
        else:
            name2 = tool_calls2[0].function.name
            step(f'{name2} called', True, 'expected get_page but accepted any tool call')

        _run_tool_calls(tool_calls2, messages)

        # Round 3: final answer after second tool round
        try:
            resp3 = _ollama.chat(model=model, messages=messages)
        except Exception as e:
            step('Final answer generated', False, str(e))
            sys.exit(1)
        final = resp3.message.content or ''
    else:
        step('get_page called', True, 'skipped (model answered after search)')
        final = resp2.message.content or ''

    # [6] Final answer
    ok = bool(final.strip())
    step('Final answer generated', ok, f'{len(final)} chars')
    if ok:
        preview = final[:200].replace('\n', ' ').strip()
        print(f'\n  Preview: {preview}\n')

    _done()


def _done():
    total = _passed + _failed
    print(f'  {_passed}/{total} passed', end='')
    print('\n' if _failed == 0 else f'  ({_failed} failed)\n')
    sys.exit(0 if _failed == 0 else 1)


if __name__ == '__main__':
    main()
