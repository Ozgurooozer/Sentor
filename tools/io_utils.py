"""Shared I/O utilities for Atlas OS Python components."""

import os
import secrets
import tempfile
from pathlib import Path

ATLAS_DIR = Path.home() / ".atlas"
TOKEN_FILE = ATLAS_DIR / "api-token"


def write_atomic(path: Path, text: str, encoding: str = "utf-8") -> None:
    """Write text to path atomically (write temp → rename) to prevent corruption."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-")
    try:
        with os.fdopen(fd, "w", encoding=encoding) as f:
            f.write(text)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def get_or_create_token() -> str:
    """Return the API token, generating one on first call."""
    ATLAS_DIR.mkdir(parents=True, exist_ok=True)
    if TOKEN_FILE.exists():
        token = TOKEN_FILE.read_text(encoding="utf-8").strip()
        if token:
            return token
    token = secrets.token_hex(32)
    TOKEN_FILE.write_text(token, encoding="utf-8")
    try:
        TOKEN_FILE.chmod(0o600)
    except OSError:
        pass
    return token
