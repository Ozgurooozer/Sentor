#!/usr/bin/env python3
"""
Atlas Pipeline runner.

Pipelines JSON olarak vault/agents/sentor/pipelines/<id>.json altında yaşar.
Her pipeline: adımlar listesi, her adımda on_error/on_success mantığı.

Step tipleri:
  shell   — kabuk komutu çalıştır
  task    — kayıtlı Sentor görevi çalıştır
  notify  — bildirim gönder

atlas.py'den çağrılır:
  atlas pipeline list
  atlas pipeline run <id> [key=value ...]
  atlas pipeline new <id>
  atlas pipeline show <id>
"""

import json
import os
import shlex
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT          = Path(__file__).resolve().parent.parent
PIPELINES_DIR = ROOT / 'vault' / 'agents' / 'sentor' / 'pipelines'
PIPELINES_DIR.mkdir(parents=True, exist_ok=True)

_cli_path   = str(ROOT / 'cli')
_tools_path = str(ROOT / 'tools')
for _p in (_cli_path, _tools_path):
    if _p not in sys.path:
        sys.path.insert(0, _p)
from colors import accent, dim, ok, err  # noqa: E402


def _now_iso():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def _pipeline_path(pid):
    return PIPELINES_DIR / f'{pid}.json'


def _load_pipeline(pid):
    p = _pipeline_path(pid)
    if not p.exists():
        raise FileNotFoundError(f"pipeline not found: {pid}")
    return json.loads(p.read_text(encoding='utf-8'))


def _save_pipeline(pl):
    _pipeline_path(pl['id']).write_text(
        json.dumps(pl, indent=2, ensure_ascii=False), encoding='utf-8'
    )


# ── Step executor ─────────────────────────────────────────────────────────────

def _run_shell_step(step, ctx):
    raw = step.get('cmd', '')
    for k, v in ctx.items():
        raw = raw.replace(f'{{{{{k}}}}}', str(v))
    cmd = shlex.split(raw)
    cwd = ctx.get('cwd', str(ROOT))
    result = subprocess.run(cmd, shell=False, cwd=cwd, capture_output=True, text=True)
    output = (result.stdout + result.stderr).strip()
    return result.returncode == 0, output


def _run_task_step(step, ctx):
    from sentor import run_task  # noqa: PLC0415
    task_id = step.get('task_id', '')
    extra   = step.get('input', ctx.get('input', ''))
    code    = run_task(task_id, wait=step.get('wait', False), extra_input=extra or None)
    return code == 0, ''


def _run_notify_step(step, ctx):
    from sentor import notify as _notify  # noqa: PLC0415
    msg = step.get('msg', 'pipeline step done')
    for k, v in ctx.items():
        msg = msg.replace(f'{{{{{k}}}}}', str(v))
    _notify(msg)
    return True, msg


STEP_FNS = {
    'shell':  _run_shell_step,
    'task':   _run_task_step,
    'notify': _run_notify_step,
}


# ── Commands ──────────────────────────────────────────────────────────────────

def list_pipelines():
    files = sorted(PIPELINES_DIR.glob('*.json'))
    print()
    if not files:
        print(f'  {dim("no pipelines. create one with: atlas pipeline new <id>")}\n')
        return
    print(f'  {len(files)} pipeline{"s" if len(files) != 1 else ""}\n')
    for f in files:
        try:
            p = json.loads(f.read_text(encoding='utf-8'))
        except Exception:
            continue
        steps_col = dim(f'{len(p.get("steps",[]))} steps')
        trig = p.get('trigger', {}).get('type', 'manual')
        print(f'  {accent(p["id"].ljust(26))} {dim(f"[{trig}]".ljust(10))} {steps_col}  {p.get("name","")}')
    print()


def show_pipeline(pid):
    try:
        pl = _load_pipeline(pid)
    except FileNotFoundError as e:
        print(f'\n  {err(str(e))}\n')
        return
    print()
    print(json.dumps(pl, indent=2, ensure_ascii=False))
    print()


def run_pipeline(pid, extra_ctx=None):
    try:
        pl = _load_pipeline(pid)
    except FileNotFoundError as e:
        print(f'\n  {err(str(e))}\n')
        return 1
    ctx = dict(extra_ctx or {})
    ctx.setdefault('cwd', str(ROOT))

    print()
    print(f'  {accent("pipeline")}[{pl["id"]}] {dim(pl.get("name",""))}')
    steps = pl.get('steps', [])
    print(f'  {len(steps)} step{"s" if len(steps)!=1 else ""}\n')

    for i, step in enumerate(steps):
        stype  = step.get('type', 'shell')
        label  = step.get('id', f'step{i+1}')
        fn     = STEP_FNS.get(stype)
        if not fn:
            print(f'  {err(f"unknown step type: {stype}")} [{label}]')
            return 1

        print(f'  {dim(f"[{i+1}/{len(steps)}]")} {accent(label)} {dim(stype)}', end='', flush=True)
        success, output = fn(step, ctx)

        if success:
            print(f'  {ok("✓")}')
            if output and step.get('print_output'):
                for line in output.splitlines()[:10]:
                    print(f'       {dim(line)}')
        else:
            print(f'  {err("✗")}')
            if output:
                for line in output.splitlines()[:5]:
                    print(f'       {err(line)}')
            on_error = step.get('on_error', 'stop')
            if on_error == 'stop':
                print(f'\n  {err("pipeline stopped at")} {label}\n')
                return 1
            elif on_error == 'notify':
                from sentor import notify as _notify  # noqa: PLC0415
                _notify(f'pipeline {pid} step {label} failed', error=True)
            # on_error == 'continue' → fall through

    print(f'\n  {ok("pipeline done")}\n')
    return 0


def new_pipeline(pid=None):
    if not pid:
        pid = f'pipeline-{uuid.uuid4().hex[:6]}'
    tpl = {
        'id': pid,
        'name': pid,
        'trigger': {'type': 'manual'},
        'steps': [
            {'id': 'step1', 'type': 'notify', 'msg': 'pipeline started'},
            {'id': 'step2', 'type': 'shell',  'cmd': 'echo hello', 'on_error': 'stop'},
            {'id': 'step3', 'type': 'notify', 'msg': 'pipeline done'},
        ],
        'created_at': _now_iso(),
    }
    path = _pipeline_path(pid)
    if path.exists():
        print(f'\n  {err(f"already exists: {pid}")}\n')
        return
    _save_pipeline(tpl)
    print(f'\n  {ok("created")}  {dim(str(path))}')
    print(f'  edit the JSON then run: {accent(f"atlas pipeline run {pid}")}\n')


# ── Dispatcher ────────────────────────────────────────────────────────────────

def dispatch(args):
    sub = args.pipeline_cmd
    if sub == 'list' or sub is None:
        list_pipelines()
    elif sub == 'run':
        ctx = {}
        for kv in (args.ctx or []):
            if '=' in kv:
                k, v = kv.split('=', 1)
                ctx[k] = v
        sys.exit(run_pipeline(args.pipeline_id, ctx))
    elif sub == 'show':
        show_pipeline(args.pipeline_id)
    elif sub == 'new':
        new_pipeline(args.pipeline_id)
    else:
        list_pipelines()
