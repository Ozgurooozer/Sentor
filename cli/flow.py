#!/usr/bin/env python3
"""
atlas flow — named multi-node flows (CLI version of canvas wire connections).

  atlas flow list                        list all saved flows
  atlas flow new <id> [--name "..."]     create a new empty flow
  atlas flow show <id>                   print flow JSON
  atlas flow add-step <flow-id> <node-id> [key=value]  append a node step
  atlas flow run <id> [key=value]        run all steps in order
  atlas flow delete <id>                 delete a flow
"""

import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT      = Path(__file__).resolve().parent.parent
FLOWS_DIR = ROOT / 'vault' / 'agents' / 'sentor' / 'flows'

_COLOR  = sys.stdout.isatty()
_ACCENT = '\033[38;2;91;141;239m'
_DIM    = '\033[2m'
_OK     = '\033[38;2;29;158;117m'
_ERR    = '\033[38;2;221;82;82m'
_RESET  = '\033[0m'

def _c(s, code): return f'{code}{s}{_RESET}' if _COLOR else s
def acc(s):  return _c(s, _ACCENT)
def dim(s):  return _c(s, _DIM)
def ok(s):   return _c(s, _OK)
def err(s):  return _c(s, _ERR)


def _now():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def _flow_path(flow_id: str) -> Path:
    return FLOWS_DIR / f'{flow_id}.json'


def _load(flow_id: str) -> dict:
    p = _flow_path(flow_id)
    if not p.exists():
        print(f'\n  {err(f"flow not found: {flow_id}")}\n')
        sys.exit(1)
    return json.loads(p.read_text(encoding='utf-8'))


def _save(flow: dict):
    FLOWS_DIR.mkdir(parents=True, exist_ok=True)
    _flow_path(flow['id']).write_text(
        json.dumps(flow, indent=2, ensure_ascii=False), encoding='utf-8'
    )


# ── Commands ──────────────────────────────────────────────────────────────────

def list_flows():
    FLOWS_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(FLOWS_DIR.glob('*.json'))
    print()
    if not files:
        print(f'  {dim("no flows yet. create one: atlas flow new <id>")}\n')
        return
    print(f'  {len(files)} flow{"s" if len(files) != 1 else ""}\n')
    for f in files:
        try:
            fl = json.loads(f.read_text(encoding='utf-8'))
            steps = fl.get('steps', [])
            nodes = ' → '.join(s['node'] for s in steps) if steps else dim('(empty)')
            print(f'  {acc(fl["id"].ljust(24))}  {fl.get("name", fl["id"])}')
            print(f'  {"".ljust(24)}  {dim(nodes)}\n')
        except Exception:
            pass
    print()


def show_flow(flow_id: str):
    fl = _load(flow_id)
    print()
    print(json.dumps(fl, indent=2, ensure_ascii=False))
    print()


def new_flow(flow_id: str | None = None, name: str | None = None):
    FLOWS_DIR.mkdir(parents=True, exist_ok=True)
    if not flow_id:
        flow_id = f'flow-{uuid.uuid4().hex[:6]}'
    p = _flow_path(flow_id)
    if p.exists():
        print(f'\n  {err(f"already exists: {flow_id}")}\n')
        return
    fl = {
        'id':         flow_id,
        'name':       name or flow_id,
        'steps':      [],
        'created_at': _now(),
    }
    _save(fl)
    print(f'\n  {ok("created")}  {dim(str(p))}')
    print(f'  add steps:    {acc(f"atlas flow add-step {flow_id} <node-id>")}')
    print(f'  run it:       {acc(f"atlas flow run {flow_id}")}\n')


def add_step(flow_id: str, node_id: str, ctx: dict | None = None):
    # Verify the node exists
    cli_dir = str(ROOT / 'cli')
    if cli_dir not in sys.path:
        sys.path.insert(0, cli_dir)
    from node import _find  # noqa: PLC0415
    _, kind = _find(node_id)
    if not kind:
        print(f'\n  {err(f"node not found: {node_id}")}\n')
        sys.exit(1)

    fl = _load(flow_id)
    step = {'node': node_id}
    if ctx:
        step['ctx'] = ctx
    fl['steps'].append(step)
    fl['updated_at'] = _now()
    _save(fl)
    n = len(fl['steps'])
    print(f'\n  {ok("added")} step {n}: {acc(node_id)} → {acc(flow_id)}\n')


def run_flow(flow_id: str, extra_ctx: dict | None = None):
    fl = _load(flow_id)
    steps = fl.get('steps', [])
    if not steps:
        print(f'\n  {err("flow has no steps")}\n')
        sys.exit(1)

    cli_dir = str(ROOT / 'cli')
    if cli_dir not in sys.path:
        sys.path.insert(0, cli_dir)
    from node import _run_node_capture  # noqa: PLC0415

    # Merge initial context: flow default ctx + extra_ctx + optional stdin
    base_ctx = dict(extra_ctx or {})
    if not sys.stdin.isatty():
        stdin_data = sys.stdin.read().strip()
        if stdin_data:
            base_ctx.setdefault('input', stdin_data)

    print(f'\n  {acc("flow")}[{fl["id"]}]  {fl.get("name", fl["id"])}')
    print(f'  {len(steps)} step{"s" if len(steps)!=1 else ""}\n')

    value = base_ctx.get('input', '')
    for i, step in enumerate(steps):
        node_id = step['node']
        ctx = dict(base_ctx)
        ctx.update(step.get('ctx', {}))
        if value:
            ctx['input'] = value

        print(f'  {dim(f"[{i+1}/{len(steps)}]")} {acc(node_id)}')
        code, output = _run_node_capture(node_id, ctx)
        if code != 0:
            print(f'\n  {err(f"flow stopped at step {i+1} ({node_id}), exit {code}")}\n')
            sys.exit(code)
        value = output

    print(f'\n  {ok("flow complete")}')
    if value:
        print(f'\n  {dim("final output:")}')
        for line in value.splitlines()[-10:]:
            print(f'  {line}')
    print()


def delete_flow(flow_id: str):
    p = _flow_path(flow_id)
    if not p.exists():
        print(f'\n  {err(f"flow not found: {flow_id}")}\n')
        sys.exit(1)
    p.unlink()
    print(f'\n  {ok("deleted")} {dim(flow_id)}\n')


def dispatch(args):
    sub = args.flow_cmd
    if sub == 'list' or sub is None:
        list_flows()
    elif sub == 'new':
        new_flow(getattr(args, 'flow_id', None), getattr(args, 'name', None))
    elif sub == 'show':
        show_flow(args.flow_id)
    elif sub == 'add-step':
        ctx = {}
        for kv in (getattr(args, 'ctx', None) or []):
            if '=' in kv:
                k, v = kv.split('=', 1)
                ctx[k] = v
        add_step(args.flow_id, args.node_id, ctx or None)
    elif sub == 'run':
        ctx = {}
        for kv in (getattr(args, 'ctx', None) or []):
            if '=' in kv:
                k, v = kv.split('=', 1)
                ctx[k] = v
        run_flow(args.flow_id, ctx or None)
    elif sub == 'delete':
        delete_flow(args.flow_id)
    else:
        list_flows()
