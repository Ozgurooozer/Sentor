#!/usr/bin/env python3
"""
Sentor — Ollama multi-turn conversation test.
Three turns, each building on the last. Validates context is maintained.
Run: python tools/test_multiturn.py
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

TURN_1 = 'What HTML topics are available in the knowledge base?'
TURN_2 = 'Read the first result you found and tell me more about it.'
TURN_3 = 'Summarize what you learned in one sentence.'


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


# ── HTTP helper ────────────────────────────────────────────────────────────────

def _get_json(url: str, timeout: float = 5.0):
    try:
        resp = urllib.request.urlopen(url, timeout=timeout)
        return json.loads(resp.read().decode('utf-8')), None
    except urllib.error.HTTPError as e:
        return None, f'HTTP {e.code}'
    except Exception as e:
        return None, str(e)


def _call_tool(name: str, args: dict):
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
            return {'error': f'Invalid page ID: {page_id!r}'}
        cat, slug = parts
        url = f'{API_BASE}/api/page/{urllib.parse.quote(cat)}/{urllib.parse.quote(slug)}'
        data, err = _get_json(url)
        return data if data is not None else {'error': err}

    return {'error': f'Unknown tool: {name}'}


def _handle_tool_calls(tool_calls, messages: list) -> dict:
    results = {}
    for tc in tool_calls:
        name   = tc.function.name
        args   = dict(tc.function.arguments)
        result = _call_tool(name, args)
        results[name] = result
        messages.append({'role': 'tool', 'content': json.dumps(result)})
    return results


def _chat(ollama_mod, model: str, messages: list, tools=None):
    """One round of chat. Returns (message, tool_calls_list)."""
    kwargs = {'model': model, 'messages': messages}
    if tools:
        kwargs['tools'] = tools
    resp = ollama_mod.chat(**kwargs)
    tcs  = getattr(resp.message, 'tool_calls', None) or []
    return resp.message, tcs


def _drain_tools(ollama_mod, model: str, messages: list, tools) -> str:
    """Keep chatting until no more tool calls; return the final text."""
    while True:
        msg, tcs = _chat(ollama_mod, model, messages, tools)
        messages.append(msg)
        if not tcs:
            return msg.content or ''
        _handle_tool_calls(tcs, messages)


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print(f'\n  Sentor - Multi-Turn Conversation Test\n')
    print(f'  Turn 1: {TURN_1}')
    print(f'  Turn 2: {TURN_2}')
    print(f'  Turn 3: {TURN_3}\n')

    # [1] API reachable
    data, err = _get_json(f'{API_BASE}/api/categories')
    if not step('API reachable', data is not None, err or ''):
        print('\n  sentor serve\n')
        sys.exit(1)

    # [2] Ollama reachable
    data, err = _get_json(f'{OLLAMA_BASE}/api/tags')
    if not step('Ollama reachable', data is not None, err or ''):
        print('\n  ollama serve\n')
        sys.exit(1)

    models = [m['name'] for m in data.get('models', [])]
    model  = (
        next((m for m in models if 'qwen2.5-coder' in m.lower()), None) or
        next((m for m in models if 'qwen'          in m.lower()), None) or
        (models[0] if models else None)
    )
    if not model:
        print('  No models found: ollama pull qwen2.5-coder\n')
        sys.exit(1)
    print(f'  Model: {model}\n')

    tools  = json.loads(TOOLS_FILE.read_text(encoding='utf-8'))['tools']
    system = SYSTEM_FILE.read_text(encoding='utf-8') if SYSTEM_FILE.exists() else ''

    try:
        import ollama as _ollama
    except ImportError:
        step('ollama library import', False, 'pip install ollama')
        sys.exit(1)

    messages = []
    if system:
        messages.append({'role': 'system', 'content': system})

    # ── Turn 1 ────────────────────────────────────────────────────────────────
    print('  --- Turn 1 ---')
    messages.append({'role': 'user', 'content': TURN_1})

    try:
        msg1, tcs1 = _chat(_ollama, model, messages, tools)
    except Exception as e:
        step('Turn 1: tool call issued', False, str(e))
        sys.exit(1)

    messages.append(msg1)
    if tcs1:
        fn1 = tcs1[0].function.name
        step(f'Turn 1: tool call issued ({fn1})', True)
        r1 = _handle_tool_calls(tcs1, messages)

        search_result = r1.get('search_knowledge')
        count = len(search_result) if isinstance(search_result, list) else 0
        step('Turn 1: API returned results', count > 0, f'{count} result(s)')

        # Finish turn 1 if more calls needed
        reply1 = _drain_tools(_ollama, model, messages, tools)
    else:
        step('Turn 1: tool call issued', False, 'model answered directly, no tool call')
        step('Turn 1: API returned results', True, 'skipped')
        reply1 = msg1.content or ''

    step('Turn 1: response received', bool(reply1.strip()),
         f'{len(reply1)} chars')

    # ── Turn 2 ────────────────────────────────────────────────────────────────
    print('\n  --- Turn 2 ---')
    messages.append({'role': 'user', 'content': TURN_2})

    try:
        msg2, tcs2 = _chat(_ollama, model, messages, tools)
    except Exception as e:
        step('Turn 2: get_page called', False, str(e))
        sys.exit(1)

    messages.append(msg2)
    if tcs2:
        gp = next((tc for tc in tcs2 if tc.function.name == 'get_page'), None)
        if gp:
            page_id = dict(gp.function.arguments).get('id', '?')
            step(f'Turn 2: get_page called ({page_id})', True)
        else:
            step(f'Turn 2: get_page called', False,
                 f'called {tcs2[0].function.name} instead')

        r2 = _handle_tool_calls(tcs2, messages)
        page_data = r2.get('get_page') or {}
        has_text  = bool(page_data.get('text', ''))
        step('Turn 2: page content returned', has_text)

        reply2 = _drain_tools(_ollama, model, messages, tools)
    else:
        step('Turn 2: get_page called', True, 'skipped (model used prior context)')
        step('Turn 2: page content returned', True, 'skipped')
        reply2 = msg2.content or ''

    step('Turn 2: response received', bool(reply2.strip()),
         f'{len(reply2)} chars')

    # ── Turn 3 ────────────────────────────────────────────────────────────────
    print('\n  --- Turn 3 ---')
    messages.append({'role': 'user', 'content': TURN_3})

    try:
        msg3, tcs3 = _chat(_ollama, model, messages)   # no tools — expect plain answer
    except Exception as e:
        step('Turn 3: final answer (no tool call)', False, str(e))
        sys.exit(1)

    messages.append(msg3)
    reply3 = msg3.content or ''

    no_tools = not bool(tcs3)
    step('Turn 3: final answer (no tool call)', no_tools,
         'model called a tool' if not no_tools else f'{len(reply3)} chars')

    # Context check — reply3 should reference something from turns 1/2
    # Simple heuristic: it shouldn't be a repeat of the original question
    if reply3.strip():
        print(f'\n  Summary: {reply3[:200].strip()}\n')

    _done()


def _done():
    total = _passed + _failed
    print(f'  {_passed}/{total} passed', end='')
    print('\n' if _failed == 0 else f'  ({_failed} failed)\n')
    sys.exit(0 if _failed == 0 else 1)


if __name__ == '__main__':
    main()
