"""
Sentor — Shared ANSI color helpers for CLI output.

Usage:
    from tools.colors import accent, dim, ok, err

All functions auto-detect whether stdout is a TTY.
"""

import sys

_COLOR = sys.stdout.isatty()
_ACCENT = "\033[38;2;91;141;239m"
_DIM = "\033[2m"
_OK = "\033[38;2;29;158;117m"
_ERR = "\033[38;2;221;82;82m"
_PRP = "\033[38;2;123;109;239m"
_RESET = "\033[0m"


def _c(s: str, code: str) -> str:
    return f"{code}{s}{_RESET}" if _COLOR else s


def accent(s: str) -> str:
    return _c(s, _ACCENT)


def dim(s: str) -> str:
    return _c(s, _DIM)


def ok(s: str) -> str:
    return _c(s, _OK)


def err(s: str) -> str:
    return _c(s, _ERR)


def prp(s: str) -> str:
    return _c(s, _PRP)
