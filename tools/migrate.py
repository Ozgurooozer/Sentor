#!/usr/bin/env python3
"""
Atlas OS — Index migration runner.

Checks whether .index/pages.json and .index/embeddings.json are up to date
with the current schema versions. If not, creates a timestamped backup and
re-runs the indexer (and optionally the embedder).

Usage:
  python tools/migrate.py             # check + migrate if needed
  python tools/migrate.py --check     # check only, exit 1 if migration needed
  python tools/migrate.py --backup    # force backup without migrating
"""

import json
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT        = Path(__file__).resolve().parent.parent
INDEX_DIR   = ROOT / ".index"
INDEX_FILE  = INDEX_DIR / "pages.json"
EMBED_FILE  = INDEX_DIR / "embeddings.json"
BACKUP_DIR  = INDEX_DIR / "backups"

CURRENT_INDEX_SCHEMA   = 2
CURRENT_EMBED_SCHEMA   = 1

MAX_BACKUPS = 3


def _index_version() -> int:
    """Return schema_version from pages.json, or 0 if missing/unversioned."""
    if not INDEX_FILE.exists():
        return 0
    try:
        data = json.loads(INDEX_FILE.read_text(encoding="utf-8"))
        return int(data.get("schema_version", 1))
    except Exception:
        return 0


def _embed_version() -> int:
    if not EMBED_FILE.exists():
        return 0
    try:
        data = json.loads(EMBED_FILE.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return 0  # old format
        return int(data.get("schema_version", 0))
    except Exception:
        return 0


def create_backup(label: str = "") -> Path | None:
    """Copy current .index/ contents to a timestamped backup folder."""
    if not any([INDEX_FILE.exists(), EMBED_FILE.exists()]):
        return None

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    name  = f"backup-{stamp}" + (f"-{label}" if label else "")
    dest  = BACKUP_DIR / name
    dest.mkdir(parents=True, exist_ok=True)

    for f in (INDEX_FILE, EMBED_FILE, INDEX_DIR / "pages.js"):
        if f.exists():
            shutil.copy2(f, dest / f.name)

    print(f"  Backup → {dest}")
    _prune_old_backups()
    return dest


def _prune_old_backups() -> None:
    """Keep only the most recent MAX_BACKUPS folders."""
    if not BACKUP_DIR.exists():
        return
    folders = sorted(BACKUP_DIR.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)
    for old in folders[MAX_BACKUPS:]:
        shutil.rmtree(old, ignore_errors=True)
        print(f"  Pruned old backup: {old.name}")


def needs_migration() -> tuple[bool, bool]:
    """Return (index_needs_migration, embed_needs_migration)."""
    return (
        _index_version() < CURRENT_INDEX_SCHEMA,
        _embed_version() < CURRENT_EMBED_SCHEMA,
    )


def run_indexer() -> bool:
    result = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "indexer.py")],
        cwd=str(ROOT),
    )
    return result.returncode == 0


def run_embedder() -> bool:
    result = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "embedder.py"), "--check"],
        cwd=str(ROOT),
    )
    if result.returncode != 0:
        print("  Ollama not available — skipping embedding migration")
        return False
    result = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "embedder.py")],
        cwd=str(ROOT),
    )
    return result.returncode == 0


def main() -> None:
    check_only = "--check" in sys.argv
    backup_only = "--backup" in sys.argv

    idx_stale, emb_stale = needs_migration()

    if backup_only:
        create_backup("manual")
        return

    if not idx_stale and not emb_stale:
        print("  Index is up to date (no migration needed)")
        return

    if check_only:
        if idx_stale:
            print(f"  pages.json schema v{_index_version()} → needs v{CURRENT_INDEX_SCHEMA}")
        if emb_stale:
            print(f"  embeddings.json schema v{_embed_version()} → needs v{CURRENT_EMBED_SCHEMA}")
        sys.exit(1)

    print("\n  Atlas OS — Index Migration")
    print(f"  Index schema: v{_index_version()} → v{CURRENT_INDEX_SCHEMA}")
    print(f"  Embed schema: v{_embed_version()} → v{CURRENT_EMBED_SCHEMA}")

    create_backup("pre-migration")

    if idx_stale:
        print("\n  Re-indexing vault…")
        if not run_indexer():
            print("  ERROR: indexer failed — aborting migration")
            sys.exit(1)

    if emb_stale:
        print("\n  Re-embedding vault…")
        run_embedder()

    print("\n  Migration complete.")


if __name__ == "__main__":
    main()
