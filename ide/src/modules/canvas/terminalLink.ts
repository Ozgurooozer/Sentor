/**
 * Tracks which canvas terminal panel a given chat session is "tool-linked" to.
 * When the link is active, bash_run commands mirror to that terminal's PTY.
 * Set by ChatPanel when the user enables the "araç" toggle on a trigger wire.
 */

const links = new Map<string, string>();

export function setLinkedTerminal(sessionId: string, panelId: string | null): void {
  if (panelId) links.set(sessionId, panelId);
  else links.delete(sessionId);
}

export function getLinkedTerminal(sessionId: string): string | null {
  return links.get(sessionId) ?? null;
}
