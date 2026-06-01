/**
 * Minimal Markdown renderer stub.
 * Renders content as preformatted text with basic whitespace preservation.
 * Replace with a full markdown library (e.g. react-markdown) if needed.
 */

import React, { memo } from 'react';

interface MarkdownProps {
  content: string;
  className?: string;
}

export const Markdown = memo(function Markdown({ content, className }: MarkdownProps) {
  return (
    <div
      className={className}
      style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
    >
      {content}
    </div>
  );
});

Markdown.displayName = 'Markdown';
