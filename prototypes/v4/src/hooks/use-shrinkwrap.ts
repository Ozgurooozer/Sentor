/**
 * useShrinkwrap - calculates optimal bubble width for user messages.
 * Returns undefined if no shrinkwrapping needed.
 */

import { useMemo } from 'react';

interface ShrinkwrapOptions {
  paddingX?: number;
}

export function useShrinkwrap(
  text: string | undefined,
  maxWidth: number,
  options: ShrinkwrapOptions = {}
): number | undefined {
  const { paddingX = 0 } = options;

  return useMemo(() => {
    if (!text || maxWidth <= 0) return undefined;

    const lines = text.split('\n');
    const maxLineLength = Math.max(...lines.map(l => l.length));
    // Approximate: ~7px per character for 14px font
    const approxWidth = maxLineLength * 7 + paddingX * 2;

    if (approxWidth >= maxWidth) return undefined;
    return Math.max(approxWidth, 80);
  }, [text, maxWidth, paddingX]);
}
