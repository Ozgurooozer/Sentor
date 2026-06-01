#!/usr/bin/env python3
"""
Sentor Worker — Sentor CLI görev katmanı.

Görevler JSON olarak vault/agents/sentor/tasks/<id>.json altında yaşar.
Her görev: provider tercihi, vault scope, izinler, prompt, on_done/on_error.

Public API (main.py'den çağrılır):
  new_task(args)        — interaktif wizard
  run_task(task_id)     — JSON yükle, provider çağır, sonucu logla
  list_tasks()          — kayıtlı görevleri listele
  show_task(task_id)    — JSON içeriğini yazdır
  delete_task(task_id)  — görevi sil
  provider_status()     — local/openrouter probe
  provider_wait(name)   — provider boşalana kadar bekle
  notify(msg)           — bildirim + log
"""

import json
import os
import sys
import time
import uuid
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────

ROOT       = Path(__file__).resolve().parent.parent
TASKS_DIR  = ROOT / 'vault' / 'agents' / 'sentor' / 'tasks'
LOG_DIR    = ROOT / 'vault' / 'agents' / 'sentor' / 'runs'
NOTIFY_LOG = ROOT / 'vault' / 'agents' / 'sentor' / 'notifications.log'

TASKS_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)


# ── ANSI helpers ──────────────────────────────────────────────────────────────

sys.path.insert(0, str(ROOT / 'tools'))
from colors import accent, dim, ok, err  # noqa: E402, F401


# ── Provider probe ───────────────────────────────────────────────────────────

PROVIDERS = {
    'local-ollama':   'http://localhost:11434/api/tags',
    'local-lmstudio': 'http://localhost:1234/v1/models',
}

# context_tokens preset
CTX_PRESET = {'small': 4096, 'medium': 16384, 'large': 65536}


def _probe(url, timeout=2):
    try:
        r = urllib.request.urlopen(url, timeout=timeout)
        return r.status == 200
    except Exception:
        return False


def _ollama_busy():
    """True jika ollama'da yüklü bir model varsa (kabaca meşgul göstergesi)."""
    try:
        r = urllib.request.urlopen('http://localhost:11434/api/ps', timeout=2)
        data = json.loads(r.read())
        return bool(data.get('models'))
    except Exception:
        return False


def provider_status():
    print()
    rows = []
    for name, url in PROVIDERS.items():
        up = _probe(url)
        busy = (name == 'local-ollama' and up and _ollama_busy())
        state = ok('idle') if up and not busy else (dim('busy') if busy else err('down'))
        rows.append((name, state, url))

    # openrouter — sadece API key kontrolü
    has_key = bool(os.environ.get('OPENROUTER_API_KEY'))
    rows.append(('openrouter', ok('ready') if has_key else dim('no-key'),
                 'OPENROUTER_API_KEY env var'))

    width = max(len(n) for n, _, _ in rows)
    for name, state, url in rows:
        print(f'  {accent(name.ljust(width))}  {state}  {dim(url)}')
    print()


def provider_wait(name='local-ollama', max_wait=300):
    """Provider boşalana kadar bekle (varsayılan 5 dk)."""
    start = time.time()
    print(f'  {dim(f"waiting for {name}...")}')
    while time.time() - start < max_wait:
        if name == 'local-ollama':
            if _probe(PROVIDERS['local-ollama']) and not _ollama_busy():
                print(f'  {ok(f"{name} idle")}')
                return True
        elif name in PROVIDERS:
            if _probe(PROVIDERS[name]):
                print(f'  {ok(f"{name} up")}')
                return True
        else:
            print(f'  {err(f"unknown provider: {name}")}')
            return False
        time.sleep(2)
    print(f'  {err(f"timeout after {max_wait}s")}')
    return False


# ── Task JSON ────────────────────────────────────────────────────────────────

def _task_path(task_id):
    return TASKS_DIR / f'{task_id}.json'


def _slugify(s):
    out = ''.join(c if c.isalnum() or c in '-_' else '-' for c in s.lower())
    while '--' in out:
        out = out.replace('--', '-')
    return out.strip('-') or f'task-{uuid.uuid4().hex[:6]}'


def _load_task(task_id):
    p = _task_path(task_id)
    if not p.exists():
        raise FileNotFoundError(f"task not found: {task_id}")
    return json.loads(p.read_text(encoding='utf-8'))


def _save_task(task):
    p = _task_path(task['id'])
    p.write_text(json.dumps(task, indent=2, ensure_ascii=False), encoding='utf-8')
    return p


def _now_iso():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def _prompt(label, default=None):
    suffix = f' [{default}]' if default is not None else ''
    try:
        v = input(f'  {label}{suffix}: ').strip()
    except (KeyboardInterrupt, EOFError):
        print('\n  aborted.\n')
        sys.exit(1)
    return v or (default or '')


# ── Commands ─────────────────────────────────────────────────────────────────

def new_task(args):
    print(f'\n  {accent("Sentor")} — new task wizard\n')

    name = _prompt('name', 'untitled')
    task_id = _slugify(name)
    if _task_path(task_id).exists():
        task_id = f'{task_id}-{uuid.uuid4().hex[:4]}'

    desc = _prompt('description', '')

    type_ = _prompt('type (single/loop/event)', 'single')
    if type_ not in ('single', 'loop', 'event'):
        type_ = 'single'

    provider = _prompt('provider (local-ollama/local-lmstudio/openrouter)',
                       'local-ollama')

    model = _prompt('model id (boş = provider default)', '')

    ctx_label = _prompt('context size (small/medium/large)', 'small')
    ctx = CTX_PRESET.get(ctx_label, CTX_PRESET['small'])

    vault_scope = _prompt('vault scope (boş = tüm vault)', '')

    perms_raw = _prompt('permissions (csv)', 'vault:read,notify:send')
    perms = [p.strip() for p in perms_raw.split(',') if p.strip()]

    prompt_text = _prompt('görev prompt', f'Görev: {name}')

    on_done = _prompt('on_done (notify/silent)', 'notify')
    on_error = _prompt('on_error (notify/silent/retry)', 'notify')

    task = {
        'id': task_id,
        'name': name,
        'description': desc,
        'type': type_,
        'provider': provider,
        'model': model,
        'context_tokens': ctx,
        'vault_scope': vault_scope,
        'permissions': perms,
        'tools': [],
        'prompt': prompt_text,
        'on_done': on_done,
        'on_error': on_error,
        'retry_count': 3,
        'created_at': _now_iso(),
    }

    path = _save_task(task)
    print(f'\n  {ok("saved")}  {dim(str(path))}')
    print(f'  run: {accent(f"sentor run {task_id}")}\n')


def list_tasks():
    files = sorted(TASKS_DIR.glob('*.json'))
    print()
    if not files:
        print(f'  {dim("no tasks. create one with: sentor new-task")}\n')
        return
    print(f'  {len(files)} task{"s" if len(files) != 1 else ""}\n')
    for f in files:
        try:
            t = json.loads(f.read_text(encoding='utf-8'))
        except Exception as exc:
            print(f'  [sentor] skipping task {f.name}: {exc}', file=sys.stderr)
            continue
        type_col = dim(f'[{t.get("type","?"):<6}]')
        prov_col = dim(f'{t.get("provider","?"):<16}')
        print(f'  {accent(t["id"].ljust(24))} {type_col} {prov_col} {t.get("name","")}')
    print()


def show_task(task_id):
    try:
        t = _load_task(task_id)
    except FileNotFoundError as e:
        print(f'\n  {err(str(e))}\n')
        return
    print()
    print(json.dumps(t, indent=2, ensure_ascii=False))
    print()


def delete_task(task_id):
    p = _task_path(task_id)
    if not p.exists():
        print(f'\n  {err(f"task not found: {task_id}")}\n')
        return
    p.unlink()
    print(f'\n  {ok("deleted")} {dim(task_id)}\n')


# ── Runner ───────────────────────────────────────────────────────────────────

def _call_ollama(model, prompt, ctx_tokens):
    """Ollama'ya generate isteği. Yanıtı string olarak döner."""
    body = json.dumps({
        'model': model or 'qwen2.5-coder',
        'prompt': prompt,
        'stream': False,
        'options': {'num_ctx': ctx_tokens},
    }).encode('utf-8')

    req = urllib.request.Request(
        'http://localhost:11434/api/generate',
        data=body,
        headers={'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        data = json.loads(r.read())
    return data.get('response', '').strip()


def _call_lmstudio(model, prompt, ctx_tokens):
    body = json.dumps({
        'model': model or 'local-model',
        'messages': [{'role': 'user', 'content': prompt}],
        'max_tokens': min(2048, ctx_tokens // 2),
    }).encode('utf-8')
    req = urllib.request.Request(
        'http://localhost:1234/v1/chat/completions',
        data=body,
        headers={'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        data = json.loads(r.read())
    return data['choices'][0]['message']['content'].strip()


def _call_openrouter(model, prompt, ctx_tokens):
    key = os.environ.get('OPENROUTER_API_KEY')
    if not key:
        raise RuntimeError('OPENROUTER_API_KEY not set')
    body = json.dumps({
        'model': model or 'meta-llama/llama-3.1-8b-instruct:free',
        'messages': [{'role': 'user', 'content': prompt}],
    }).encode('utf-8')
    req = urllib.request.Request(
        'https://openrouter.ai/api/v1/chat/completions',
        data=body,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {key}',
        },
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        data = json.loads(r.read())
    return data['choices'][0]['message']['content'].strip()


PROVIDER_FNS = {
    'local-ollama':   _call_ollama,
    'local-lmstudio': _call_lmstudio,
    'openrouter':     _call_openrouter,
}


def _run_log_path(task_id):
    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    return LOG_DIR / f'{task_id}-{ts}.md'


def run_task(task_id, wait=False, extra_input=None):
    try:
        task = _load_task(task_id)
    except FileNotFoundError as e:
        print(f'\n  {err(str(e))}\n')
        return 1
    provider = task.get('provider', 'local-ollama')

    print()
    print(f'  {accent("sentor")}[{task_id}] {dim(task.get("name",""))}')
    print(f'  provider: {provider}  ·  ctx: {task["context_tokens"]}  ·  type: {task["type"]}')

    # Provider check
    if wait:
        if provider.startswith('local-'):
            if not provider_wait(provider):
                print(f'  {err("provider unavailable, aborting")}\n')
                _notify(f'task {task_id} aborted: provider unavailable', error=True)
                return 1
    else:
        if provider in PROVIDERS and not _probe(PROVIDERS[provider]):
            print(f'  {err(f"{provider} is down. use --wait to queue.")}\n')
            return 1
        if provider == 'local-ollama' and _ollama_busy():
            print(f'  {dim("ollama is busy (model loaded). continuing anyway.")}')

    fn = PROVIDER_FNS.get(provider)
    if not fn:
        print(f'  {err(f"unknown provider: {provider}")}\n')
        return 1

    prompt = task.get('prompt', '')
    if extra_input:
        prompt = f'{prompt}\n\nInput:\n{extra_input}'

    started = time.time()
    print(f'  {dim("running...")}')
    try:
        out = fn(task.get('model', ''), prompt, task['context_tokens'])
    except Exception as e:
        elapsed = time.time() - started
        msg = f'task {task_id} failed after {elapsed:.1f}s: {e}'
        print(f'\n  {err(msg)}\n')
        if task.get('on_error') == 'notify':
            _notify(msg, error=True)
        return 1

    elapsed = time.time() - started

    # Run log yaz
    log_path = _run_log_path(task_id)
    log_path.write_text(
        f'# {task["name"]} — run log\n\n'
        f'- task: `{task_id}`\n'
        f'- started: {_now_iso()}\n'
        f'- elapsed: {elapsed:.1f}s\n'
        f'- provider: {provider}\n\n'
        f'## prompt\n\n```\n{prompt}\n```\n\n'
        f'## output\n\n{out}\n',
        encoding='utf-8',
    )

    print(f'\n  {ok("done")}  {elapsed:.1f}s  {dim(str(log_path))}\n')
    print(out)
    print()

    if task.get('on_done') == 'notify':
        _notify(f'task {task_id} done ({elapsed:.1f}s)')

    return 0


# ── Notify ───────────────────────────────────────────────────────────────────

def _notify(msg, error=False):
    """Bildirim: terminal + log. Windows'ta msg.exe varsa toast benzeri."""
    line = f'[{_now_iso()}] {"ERR" if error else "OK "} {msg}\n'
    try:
        with NOTIFY_LOG.open('a', encoding='utf-8') as f:
            f.write(line)
    except Exception as exc:
        print(f'  [sentor] notify log write failed: {exc}', file=sys.stderr)

    tag = err('!') if error else ok('✓')
    print(f'  {tag} {msg}')

    # Windows toast (BurntToast varsa) — opsiyonel, sessizce başarısız ol
    if os.name == 'nt':
        try:
            import subprocess
            ps = (
                f'powershell -NoProfile -Command '
                f'"[reflection.assembly]::loadwithpartialname(\'System.Windows.Forms\') | Out-Null; '
                f'[System.Windows.Forms.MessageBox]::Show(\'{msg}\',\'Sentor\') | Out-Null"'
            )
            # MessageBox bloklayıcı, kullanma. Sadece log + console yeter.
            _ = ps
        except Exception:
            pass


def notify(msg):
    _notify(msg, error=False)


# ── CLI entry (main.py'den çağrılır) ────────────────────────────────────────

def dispatch(args):
    """main.py içinden çağrılan dispatcher."""
    cmd = args.cmd

    if cmd == 'new-task':
        new_task(args)
    elif cmd == 'run':
        sys.exit(run_task(args.task_id, wait=args.wait, extra_input=args.input))
    elif cmd == 'task':
        sub = args.task_cmd
        if sub == 'list':       list_tasks()
        elif sub == 'show':     show_task(args.task_id)
        elif sub == 'delete':   delete_task(args.task_id)
        else:                   list_tasks()
    elif cmd == 'provider':
        sub = args.provider_cmd
        if sub == 'status':     provider_status()
        elif sub == 'wait':     provider_wait(args.name)
        else:                   provider_status()
    elif cmd == 'notify':
        notify(' '.join(args.message))
    else:
        print(f'\n  unknown sentor command: {cmd}\n')
