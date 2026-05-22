import { useMemo } from "react";
import { useCanvasStore } from "./canvasStore";
import type { PanelType, WireBlock, WireData } from "./types";

export type { WireBlock, WireData };

const DEFAULT_CHAR_LIMIT = 4000;

/**
 * Collect every upstream wire feeding `panelId`, except trigger wires —
 * those carry execution signals, not context.
 *
 * Each block is clipped to `connection.charLimit ?? DEFAULT_CHAR_LIMIT`
 * characters so a noisy producer (e.g. long terminal scrollback) can't
 * push the chat's token budget over the cliff.
 */
export function useAllIncomingWireData(panelId: string): WireBlock[] {
  const connections = useCanvasStore((s) => s.connections);
  const panels = useCanvasStore((s) => s.panels);

  const panelMap = useMemo(
    () => new Map(panels.map((p) => [p.id, p])),
    [panels],
  );

  return useMemo(
    () =>
      connections
        .filter((c) => c.toPanel === panelId && c.kind !== "trigger")
        .map((c) => {
          const src = panelMap.get(c.fromPanel);
          // Snapshot mode: when the producer panel has a frozen snapshot,
          // serve that instead of the live outputData so downstream chats
          // see a stable view even when the upstream keeps churning.
          const snap = src?.meta?.snapshotData as WireData | undefined;
          const raw =
            (snap ??
              (src?.meta?.outputData as WireData | undefined)) ??
            undefined;
          const limit = c.charLimit ?? DEFAULT_CHAR_LIMIT;
          const data: WireData | null = raw
            ? {
                kind: raw.kind,
                value:
                  typeof raw.value === "string"
                    ? raw.value.slice(0, limit)
                    : raw.value,
              }
            : null;
          return {
            panelId: c.fromPanel,
            panelTitle: src?.title ?? "Unknown",
            panelType: (src?.type ?? "input") as PanelType,
            connectionKind: c.kind ?? "data",
            charLimit: limit,
            data,
          } satisfies WireBlock;
        })
        .filter((b) => b.data?.value != null),
    [connections, panelId, panelMap],
  );
}

export const PANEL_ICONS: Partial<Record<PanelType, string>> = {
  terminal: "⬛",
  editor: "◈",
  input: "□",
  web: "◌",
  "vault-home": "◎",
  checklist: "✓",
  gallery: "⊞",
  chat: "◉",
  agent: "◉",
  pipeline: "⊕",
};
