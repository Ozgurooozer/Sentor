"""
DEPRECATED — use `from scoring import ...` instead.

This module exists only for backward compatibility. All functions are
re-exported from `tools/scoring.py`, which is the single canonical source.
"""

import warnings as _warnings

from scoring import (  # noqa: F401 — re-export
    DEFAULT_EXCLUDE_TYPES,
    cosine,
    passes_default_filter,
    score,
)

_warnings.warn(
    "tools.common is deprecated; use `from scoring import ...` instead.",
    DeprecationWarning,
    stacklevel=2,
)
