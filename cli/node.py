#!/usr/bin/env python3
"""
atlas node — unified node manager (pipelines + tasks).

  atlas node list                       list all nodes
  atlas node run <id> [key=value]       run a node; stdin → ctx['input']
  atlas node pipe <id> <id> ... [key=value]  chain nodes (output → next input)
  atlas node show <id>                  print node JSON
  atlas node log <id>                   show run history
  atlas node edit <id>                  open node JSON in $EDITOR
  atlas node new <id>                   create a template pipeline node
  atlas node delete <id>                delete a node
"""

import contextlib
import io
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT          = Path(__file__).resolve().parent.parent
PIPELINES_DIR = ROOT / 'vault' / 'agents' / 'sentor' / 'pipelines'
TASKS_DIR     = ROOT / 'vault' / 'agents' / 'sentor' / 'tasks'
RUNS_DIR      = ROOT / 'vault' / 'agents' / 'sentor' / 'runs'

sys.path.insert(0, str(ROOT / 'tools'))
from colors import accent as acc, dim, ok, err, prp  # noqa: E402

_ANSI_RE = re.compile(r'\033\[[^m]*m')
def _strip_ansi(s: str) -> str:
    return _ANSI_RE.sub('', s)


def _find(node_id: str):
    pl  = PIPELINES_DIR / f'{node_id}.json'
    tsk = TASKS_DIR / f'{node_id}.json'
    if pl.exists():  return pl,  'pipeline'
    if tsk.exists(): return tsk, 'task'
    return None, None


def _load(node_id: str):
    path, kind = _find(node_id)
    if not path:
        print(f'\n  {err(f"node not found: {node_id}")}\n')
        sys.exit(1)
    return json.loads(path.read_text(encoding='utf-8')), kind


def _ensure_cli_path():
    cli_dir = str(ROOT / 'cli')
    if cli_dir not in sys.path:
        sys.path.insert(0, cli_dir)


# ── Commands ──────────────────────────────────────────────────────────────────

def list_nodes():
    PIPELINES_DIR.mkdir(parents=True, exist_ok=True)
    TASKS_DIR.mkdir(parents=True, exist_ok=True)
    pipelines = sorted(PIPELINES_DIR.glob('*.json'))
    tasks     = sorted(TASKS_DIR.glob('*.json'))
    total = len(pipelines) + len(tasks)
    print()
    if not total:
        print(f'  {dim("no nodes yet. create one: atlas node new <id>")}\n')
        return
    print(f'  {total} node{"s" if total != 1 else ""}\n')
    for f in pipelines:
        try:
            p = json.loads(f.read_text(encoding='utf-8'))
            steps = dim(f'{len(p.get("steps",[]))} steps')
            trig  = dim(f'[{p.get("trigger",{}).get("type","manual")}]')
            print(f'  {acc(p["id"].ljust(28))} {trig.ljust(12)} {steps}  {p.get("name","")}')
        except Exception as exc:
            print(f'  [node] skipping pipeline {f.name}: {exc}', file=sys.stderr)
    for f in tasks:
        try:
            t = json.loads(f.read_text(encoding='utf-8'))
            print(f'  {prp(t["id"].ljust(28))} {dim("[task]".ljust(12))} {dim("1 step")}  {t.get("name","")}')
        except Exception as exc:
            print(f'  [node] skipping task {f.name}: {exc}', file=sys.stderr)
    print()


def show_node(node_id: str):
    data, kind = _load(node_id)
    print(f'\n  {dim(f"({kind})")}')
    print(json.dumps(data, indent=2, ensure_ascii=False))
    print()


def log_node(node_id: str):
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    runs = sorted(RUNS_DIR.glob(f'{node_id}-*.md'), reverse=True)
    print()
    if not runs:
        print(f'  {dim(f"no runs recorded for: {node_id}")}\n')
        return
    print(f'  {len(runs)} run{"s" if len(runs) != 1 else ""} for {acc(node_id)}\n')
    for r in runs[:20]:
        stat = r.stat()
        ts = datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M:%S')
        size = f'{stat.st_size}b'
        print(f'  {dim(ts)}  {r.name}  {dim(size)}')
    if len(runs) > 20:
        print(f'  {dim(f"… and {len(runs)-20} more")}')
    print()


def edit_node(node_id: str):
    path, _ = _find(node_id)
    if not path:
        print(f'\n  {err(f"node not found: {node_id}")}\n')
        sys.exit(1)
    editor = os.environ.get('EDITOR', os.environ.get('VISUAL', 'notepad' if os.name == 'nt' else 'nano'))
    subprocess.run([editor, str(path)])


def run_node(node_id: str, ctx: dict | None = None):
    """Run a node, reading stdin as ctx['input'] if stdin is piped."""
    _ensure_cli_path()
    _, kind = _find(node_id)
    if not kind:
        print(f'\n  {err(f"node not found: {node_id}")}\n')
        sys.exit(1)

    merged = dict(ctx or {})
    # Inject stdin as input if data is piped in
    if not sys.stdin.isatty():
        stdin_data = sys.stdin.read().strip()
        if stdin_data:
            merged.setdefault('input', stdin_data)

    if kind == 'pipeline':
        from pipeline import run_pipeline  # noqa: PLC0415
        sys.exit(run_pipeline(node_id, merged))
    else:
        from sentor import run_task  # noqa: PLC0415
        extra = merged.get('input')
        sys.exit(run_task(node_id, wait=True, extra_input=extra))


def _run_node_capture(node_id: str, ctx: dict) -> tuple[int, str]:
    """Run a node and return (exit_code, captured_text_output). Used for pipe chains."""
    _ensure_cli_path()
    _, kind = _find(node_id)
    if not kind:
        return 1, f'node not found: {node_id}'

    buf = io.StringIO()
    code = 0
    try:
        if kind == 'pipeline':
            from pipeline import run_pipeline  # noqa: PLC0415
            with contextlib.redirect_stdout(buf):
                code = run_pipeline(node_id, dict(ctx))
        else:
            from sentor import run_task  # noqa: PLC0415
            with contextlib.redirect_stdout(buf):
                code = run_task(node_id, wait=True, extra_input=ctx.get('input'))
    except SystemExit as exc:
        code = int(exc.code) if exc.code is not None else 0

    captured = buf.getvalue()
    sys.stdout.write(captured)  # still show to terminal
    clean = _strip_ansi(captured)
    lines = [l for l in clean.splitlines() if l.strip()]
    return code, '\n'.join(lines)


def pipe_nodes(node_ids: list[str], initial_ctx: dict | None = None):
    """Chain nodes: output of each becomes input of the next."""
    if not node_ids:
        print(f'\n  {err("pipe requires at least one node id")}\n')
        sys.exit(1)

    ctx = dict(initial_ctx or {})

    # Read stdin as initial input if piped
    if not sys.stdin.isatty():
        stdin_data = sys.stdin.read().strip()
        if stdin_data:
            ctx.setdefault('input', stdin_data)

    print(f'\n  {acc("pipe")} {dim(" → ".join(node_ids))}\n')

    for i, node_id in enumerate(node_ids):
        print(f'  {dim(f"[{i+1}/{len(node_ids)}]")} {acc(node_id)}')
        code, output = _run_node_capture(node_id, ctx)
        if code != 0:
            print(f'\n  {err(f"pipe stopped at {node_id} (exit {code})")}\n')
            sys.exit(code)
        ctx['input'] = output

    print(f'\n  {ok("pipe complete")}')
    if ctx.get('input'):
        print(f'\n  {dim("final output:")}')
        for line in ctx['input'].splitlines()[-10:]:
            print(f'  {line}')
    print()


def new_node(node_id: str | None = None):
    import uuid
    from datetime import datetime, timezone
    if not node_id:
        node_id = f'node-{uuid.uuid4().hex[:6]}'
    PIPELINES_DIR.mkdir(parents=True, exist_ok=True)
    path = PIPELINES_DIR / f'{node_id}.json'
    if path.exists():
        print(f'\n  {err(f"already exists: {node_id}")}\n')
        return
    tpl = {
        'id':   node_id,
        'name': node_id,
        'canvas_meta': {
            'color':       '#5b8def',
            'icon':        '▶',
            'output_kind': 'text',
        },
        'trigger': {'type': 'manual'},
        'steps': [
            {'id': 'step1', 'type': 'notify', 'msg': f'{node_id} started'},
            {'id': 'step2', 'type': 'shell',  'cmd': 'echo done', 'on_error': 'stop'},
        ],
        'created_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    }
    path.write_text(json.dumps(tpl, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f'\n  {ok("created")}  {dim(str(path))}')
    print(f'  edit the JSON then run: {acc(f"atlas node run {node_id}")}\n')


def delete_node(node_id: str):
    path, kind = _find(node_id)
    if not path:
        print(f'\n  {err(f"node not found: {node_id}")}\n')
        sys.exit(1)
    path.unlink()
    print(f'\n  {ok("deleted")} {dim(node_id)} ({kind})\n')


def dispatch(args):
    sub = args.node_cmd
    if sub == 'list' or sub is None:
        list_nodes()
    elif sub == 'run':
        ctx = {}
        for kv in (args.ctx or []):
            if '=' in kv:
                k, v = kv.split('=', 1)
                ctx[k] = v
        run_node(args.node_id, ctx)
    elif sub == 'pipe':
        ctx = {}
        for kv in (getattr(args, 'ctx', None) or []):
            if '=' in kv:
                k, v = kv.split('=', 1)
                ctx[k] = v
        pipe_nodes(args.node_ids, ctx)
    elif sub == 'show':
        show_node(args.node_id)
    elif sub == 'log':
        log_node(args.node_id)
    elif sub == 'edit':
        edit_node(args.node_id)
    elif sub == 'new':
        new_node(getattr(args, 'node_id', None))
    elif sub == 'delete':
        delete_node(args.node_id)
    else:
        list_nodes()
