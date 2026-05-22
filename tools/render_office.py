#!/usr/bin/env python3
"""
Atlas OS — Office Renderer

Reads agent state.md + log.md + projects/* + meetings/* and fills the
template at vault/templates/agent-office/index.html. Only the content
between <!-- generated:start --> and <!-- generated:end --> markers
inside vault/agents/{slug}/index.html is replaced; everything else
(user notes) is preserved.

Usage:
    python tools/render_office.py                 # all agents
    python tools/render_office.py vault coder     # only listed slugs
"""

import argparse
import html
import re
import sys
from pathlib import Path

ROOT     = Path(__file__).resolve().parent.parent
AGENTS   = ROOT / "vault" / "agents"
TEMPLATE = ROOT / "vault" / "templates" / "agent-office" / "index.html"

GENERATED_RE = re.compile(
    r"(<!--\s*generated:start\s*-->)(.*?)(<!--\s*generated:end\s*-->)",
    re.DOTALL | re.IGNORECASE,
)

_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
_LOG_LINE_RE = re.compile(
    r"^(?P<ts>\S+)\s+\[(?P<event>[^\]]+)\]\s+(?P<msg>.*)$"
)


def _parse_yaml_lite(block: str) -> dict:
    out: dict = {}
    current_list: list | None = None
    for line in block.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if line.startswith("  - ") or line.startswith("- "):
            val = line.lstrip("- ").strip().strip('"').strip("'")
            if current_list is not None:
                current_list.append(val)
            continue
        if ":" in line and not line.startswith(" "):
            key, _, val = line.partition(":")
            key, val = key.strip(), val.strip()
            if not val:
                current_list = []
                out[key] = current_list
            else:
                if val.startswith("[") and val.endswith("]"):
                    inner = val[1:-1].strip()
                    out[key] = [x.strip().strip('"').strip("'") for x in inner.split(",") if x.strip()] if inner else []
                else:
                    out[key] = val.strip('"').strip("'")
                current_list = None
    return out


def _read_state(office: Path) -> dict:
    f = office / "state.md"
    if not f.exists():
        return {}
    raw = f.read_text(encoding="utf-8", errors="replace")
    m = _FRONTMATTER_RE.match(raw)
    return _parse_yaml_lite(m.group(1)) if m else {}


def _read_log(office: Path, n: int = 8) -> list[dict]:
    f = office / "log.md"
    if not f.exists():
        return []
    lines = [ln for ln in f.read_text(encoding="utf-8", errors="replace").splitlines()
             if ln.strip() and not ln.lstrip().startswith("#")]
    out = []
    for ln in lines[-n:][::-1]:
        m = _LOG_LINE_RE.match(ln.strip())
        if m:
            out.append(m.groupdict())
        else:
            out.append({"ts": "", "event": "note", "msg": ln.strip()})
    return out


def _list_projects(office: Path) -> list[str]:
    p = office / "projects"
    return sorted(d.name for d in p.iterdir() if d.is_dir()) if p.is_dir() else []


def _list_meetings(office: Path, slug: str, n: int = 5) -> list[tuple[str, str]]:
    p = office / "meetings"
    if not p.is_dir():
        return []
    return [
        (m.name, f"./meetings/{m.name}/")
        for m in sorted((d for d in p.iterdir() if d.is_dir()), reverse=True)[:n]
    ]


def _h(s: str) -> str:
    return html.escape(s or "")


def _render_log_rows(log: list[dict]) -> str:
    if not log:
        return '<div class="empty">No events yet.</div>'
    rows = []
    for entry in log:
        ts = _h(entry["ts"][-8:] if len(entry["ts"]) >= 8 else entry["ts"])
        rows.append(
            f'<div class="row">'
            f'<span class="ts">{ts}</span>'
            f'<span class="tag">{_h(entry["event"])}</span>'
            f'<span>{_h(entry["msg"])}</span>'
            f'</div>'
        )
    return "\n  ".join(rows)


def _render_project_rows(projects: list[str]) -> str:
    if not projects:
        return '<div class="empty">No open projects.</div>'
    return "\n  ".join(
        f'<div class="row"><a href="./projects/{_h(p)}/">{_h(p)}</a></div>'
        for p in projects
    )


def _render_meeting_rows(meetings: list[tuple[str, str]]) -> str:
    if not meetings:
        return '<div class="empty">No recent meetings.</div>'
    return "\n  ".join(
        f'<div class="row"><a href="{_h(href)}">{_h(name)}</a></div>'
        for name, href in meetings
    )


def _fill_template(template: str, agent_name: str, state: dict,
                   log: list[dict], projects: list[str],
                   meetings: list[tuple[str, str]]) -> str:
    replacements = {
        "__AGENT_NAME__":     _h(agent_name),
        "__PHASE__":          _h(state.get("phase", "ideation")),
        "__ACTIVE_PROJECT__": _h(state.get("active_project") or "—"),
        "__UPDATED__":        _h(state.get("updated", "")),
        "__NEXT_ACTION__":    _h(state.get("next_action") or "—"),
        "__RECENT_LOG__":     _render_log_rows(log),
        "__OPEN_PROJECTS__":  _render_project_rows(projects),
        "__RECENT_MEETINGS__": _render_meeting_rows(meetings),
    }
    out = template
    for k, v in replacements.items():
        out = out.replace(k, v)
    return out


def render_one(slug: str) -> bool:
    office = AGENTS / slug
    if not office.is_dir():
        print(f"  ! {slug}: office not found ({office})")
        return False
    if not TEMPLATE.exists():
        print(f"  ! template not found: {TEMPLATE}")
        return False

    template = TEMPLATE.read_text(encoding="utf-8")
    state = _read_state(office)
    agent_name = state.get("name") or slug.capitalize()
    log = _read_log(office)
    projects = _list_projects(office)
    meetings = _list_meetings(office, slug)

    filled = _fill_template(template, agent_name, state, log, projects, meetings)

    # Extract just the generated block from the filled template
    m = GENERATED_RE.search(filled)
    if not m:
        print(f"  ! template missing <!-- generated --> markers")
        return False
    new_block = m.group(0)

    target = office / "index.html"
    if target.exists():
        existing = target.read_text(encoding="utf-8")
        if GENERATED_RE.search(existing):
            updated = GENERATED_RE.sub(lambda _: new_block, existing, count=1)
        else:
            # Office HTML present but no markers — refuse to clobber.
            print(f"  ! {slug}: index.html exists without generated markers — skipping")
            return False
    else:
        # First render: copy whole template (it already has the block + user area)
        updated = filled

    if target.exists() and target.read_text(encoding="utf-8") == updated:
        print(f"  = {slug:<14}  unchanged")
        return True

    target.write_text(updated, encoding="utf-8")
    print(f"  + {slug:<14}  rendered")
    return True


def render_all(slugs: list[str] | None = None) -> int:
    if not AGENTS.is_dir():
        print(f"  No agents directory: {AGENTS}")
        return 1
    targets = slugs or sorted(d.name for d in AGENTS.iterdir() if d.is_dir())
    ok = 0
    for s in targets:
        if render_one(s):
            ok += 1
    return 0 if ok == len(targets) else 1


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Render agent office cards")
    p.add_argument("slugs", nargs="*", help="Agent slugs to render (default: all)")
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    sys.exit(render_all(args.slugs or None))
