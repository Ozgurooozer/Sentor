import { useMemo } from "react";
import { useCanvasStore } from "./canvasStore";
import type { WireBlock, WireData } from "./types";

export type { WireBlock, WireData };

const DEFAULT_CHAR_LIMIT = 4000;

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
          const rawData = src
            ? (c.fromPort
                ? (src.meta.portOutputData as Record<string, WireData> | undefined)?.[c.fromPort]
                : (src.meta.outputData as WireData | undefined))
            : null;

          let data: WireData | null = rawData ?? null;
          const lim = c.charLimit ?? DEFAULT_CHAR_LIMIT;

          if (data && typeof data.value === "string" && data.value.length > lim) {
            data = { ...data, value: data.value.slice(-lim) };
          } else if (data && typeof data.value !== "string") {
            const s = JSON.stringify(data.value) ?? "";
            if (s.length > lim) data = { kind: "text", value: s.slice(-lim) };
          }

          return {
            connectionId: c.id,
            fromPanelId: c.fromPanel,
            fromPortId: c.fromPort,
            kind: c.kind,
            data,
            charLimit: lim,
          } satisfies WireBlock;
        }),
    [connections, panelMap, panelId],
  );
}
