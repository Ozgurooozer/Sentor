"""
Sentor — Shared HTML-to-text utilities.
"""

import html as _html
import re

_BLOCK_TAGS = re.compile(
    r"<(?:br|p|div|h[1-6]|li|tr|dt|dd|blockquote|section|article|header|footer|nav|main)[^>]*/?>",
    re.IGNORECASE,
)
_SKIP_BLOCKS = re.compile(
    r"<(script|style|noscript)[^>]*>.*?</\1>",
    re.DOTALL | re.IGNORECASE,
)
_ANY_TAG = re.compile(r"<[^>]+>")


def strip_html(raw: str) -> str:
    """Convert raw HTML to clean plain text."""
    text = _SKIP_BLOCKS.sub(" ", raw)
    text = _BLOCK_TAGS.sub("\n", text)
    text = _ANY_TAG.sub("", text)
    text = _html.unescape(text)
    lines = [line.strip() for line in text.splitlines()]
    text = "\n".join(line for line in lines if line)
    return re.sub(r"\n{3,}", "\n\n", text).strip()
