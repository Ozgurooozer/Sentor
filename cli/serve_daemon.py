#!/usr/bin/env python3
"""
Atlas Serve Daemon — watcher + cron tetikleyici.

  atlas serve-daemon          # ön planda çalışır, Ctrl+C ile dur
  atlas serve-daemon --bg     # arka planda başlatır (Windows: start /B)

Desteklenen tetikleyiciler (pipeline trigger.type):
  manual          — yalnız elle çağrılır, daemon ignore eder
  cron            — "every Nm" | "every Nh" | "daily HH:MM"
  file            — trigger.path glob eşleşmesi + trigger.event "modified/created"
"""

import json
import os
import subprocess
import sys
import time
import threading
from datetime import datetime, timezone
from pathlib import Path
import fnmatch

ROOT          = Path(__file__).resolve().parent.parent
PIPELINES_DIR = ROOT / 'vault' / 'agents' / 'sentor' / 'pipelines'
TASKS_DIR     = ROOT / 'vault' / 'agents' / 'sentor' / 'tasks'
DAEMON_LOG    = ROOT / 'vault' / 'agents' / 'sentor' / 'daemon.log'

sys.path.insert(0, str(ROOT / 'tools'))
from colors import accent, dim, ok, err  # noqa: E402


def _log(msg, level='INFO'):
    ts = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    line = f'[{ts}] [{level}] {msg}\n'
    try:
        with DAEMON_LOG.open('a', encoding='utf-8') as f:
            f.write(line)
    except Exception as exc:
        print(f'  [daemon] log write failed: {exc}', file=sys.stderr)
    tag = ok('✓') if level == 'OK' else (err('!') if level == 'ERR' else dim('·'))
    print(f'  {tag} {msg}')


# ── Trigger parsers ───────────────────────────────────────────────────────────

def _parse_cron(expr):
    """Return seconds interval or (hour, minute) for 'daily HH:MM'. None = unknown."""
    expr = expr.strip().lower()
    if expr.startswith('every '):
        rest = expr[6:].strip()
        if rest.endswith('m'):
            return ('interval', int(rest[:-1]) * 60)
        if rest.endswith('h'):
            return ('interval', int(rest[:-1]) * 3600)
        if rest.endswith('s'):
            return ('interval', int(rest[:-1]))
    if expr.startswith('daily '):
        t = expr[6:].strip()
        try:
            hh, mm = t.split(':')
            return ('daily', int(hh), int(mm))
        except (ValueError, TypeError):
            return None
    return None


def _next_run_in(parsed_cron, last_run):
    """Seconds until next allowed run given parsed cron and last run epoch."""
    now = time.time()
    if parsed_cron[0] == 'interval':
        interval = parsed_cron[1]
        if last_run is None:
            return 0
        elapsed = now - last_run
        return max(0, interval - elapsed)
    if parsed_cron[0] == 'daily':
        _, hh, mm = parsed_cron
        dt = datetime.now(timezone.utc)
        target = dt.replace(hour=hh, minute=mm, second=0, microsecond=0)
        diff = (target - dt).total_seconds()
        if diff < 0:
            diff += 86400
        return diff
    return float('inf')


# ── Watchers ──────────────────────────────────────────────────────────────────

class FileWatcher:
    """Poll-based file watcher — no deps."""
    def __init__(self):
        self._mtimes = {}

    def snapshot(self, root, pattern):
        """Return dict path→mtime for all files matching pattern under root."""
        out = {}
        try:
            for p in Path(root).rglob('*'):
                if p.is_file() and fnmatch.fnmatch(p.name, pattern or '*'):
                    try:
                        out[str(p)] = p.stat().st_mtime
                    except OSError:
                        pass
        except Exception:
            pass
        return out

    def changed(self, root, pattern, event):
        """Return list of (path, event) tuples since last call."""
        key   = f'{root}|{pattern}'
        prev  = self._mtimes.get(key, {})
        curr  = self.snapshot(root, pattern)
        self._mtimes[key] = curr

        results = []
        if event in ('created', 'any'):
            for p in curr:
                if p not in prev:
                    results.append((p, 'created'))
        if event in ('modified', 'any'):
            for p, mt in curr.items():
                if p in prev and mt != prev[p]:
                    results.append((p, 'modified'))
        return results


# ── Runner thread ─────────────────────────────────────────────────────────────

_running_lock = threading.Lock()
_running: set = set()


def _fire(pipeline_id, ctx=None):
    """Run a pipeline in a background thread — skips if already running."""
    with _running_lock:
        if pipeline_id in _running:
            _log(f'pipeline [{pipeline_id}] already running, skipping', 'INFO')
            return
        _running.add(pipeline_id)

    def _go():
        try:
            sys.path.insert(0, str(ROOT / 'cli'))
            from pipeline import run_pipeline  # noqa: PLC0415
            _log(f'firing pipeline [{pipeline_id}]', 'OK')
            run_pipeline(pipeline_id, ctx)
        finally:
            with _running_lock:
                _running.discard(pipeline_id)

    t = threading.Thread(target=_go, daemon=True)
    t.start()


# ── Main daemon loop ──────────────────────────────────────────────────────────

def run_daemon(poll_interval=5):
    _log(f'Atlas daemon started  (poll={poll_interval}s)')
    _log(f'watching pipelines in {PIPELINES_DIR}')

    cron_last    = {}   # pipeline_id → last_run epoch
    file_watcher = FileWatcher()

    try:
        while True:
            pipelines = list(PIPELINES_DIR.glob('*.json'))
            for pf in pipelines:
                try:
                    pl = json.loads(pf.read_text(encoding='utf-8'))
                except Exception as exc:
                    print(f'  [daemon] skipping pipeline {pf.name}: {exc}', file=sys.stderr)
                    continue

                pid     = pl['id']
                trigger = pl.get('trigger', {})
                ttype   = trigger.get('type', 'manual')

                if ttype == 'cron':
                    parsed = _parse_cron(trigger.get('expr', ''))
                    if not parsed:
                        continue
                    wait = _next_run_in(parsed, cron_last.get(pid))
                    if wait <= 0:
                        cron_last[pid] = time.time()
                        _fire(pid)

                elif ttype == 'file':
                    watch_root    = trigger.get('path', str(ROOT))
                    watch_pattern = trigger.get('glob', '*')
                    watch_event   = trigger.get('event', 'modified')
                    changed       = file_watcher.changed(watch_root, watch_pattern, watch_event)
                    for changed_path, ev in changed:
                        _fire(pid, {'file': changed_path, 'event': ev})

            time.sleep(poll_interval)

    except KeyboardInterrupt:
        _log('daemon stopped (Ctrl+C)')


# ── CLI entry ─────────────────────────────────────────────────────────────────

def dispatch(args):
    poll = getattr(args, 'poll', 5)
    run_daemon(poll)
