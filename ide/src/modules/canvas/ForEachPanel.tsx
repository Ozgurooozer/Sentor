import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasStore } from "./canvasStore";
import { useVariableStore } from "./variableStore";
import { useAllIncomingWireData } from "./useWireData";

interface Props {
  panelId: string;
}

function parseItems(raw: unknown): string[] {
  if (raw === null || raw === undefined || raw === "") return [];
  const s = String(raw);
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* not JSON */
  }
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function ForEachPanel({ panelId }: Props) {
  const setOutput     = useCanvasStore((s) => s.setOutputData);
  const setPortOutput = useCanvasStore((s) => s.setPortOutputData);
  const updatePanel   = useCanvasStore((s) => s.updatePanel);
  const panel         = useCanvasStore((s) => s.panels.find((p) => p.id === panelId));
  const setVariable   = useVariableStore((s) => s.setVariable);
  const wireBlocks    = useAllIncomingWireData(panelId);

  const itemsWire  = wireBlocks.find((b) => b.toPort === "items" || !b.toPort);
  const rawValue   = itemsWire?.data?.value;
  const items      = parseItems(rawValue);

  // Sync items_json and item_count outputs whenever items change.
  useEffect(() => {
    setOutput(panelId, { kind: "json", value: JSON.stringify(items) });
    setPortOutput(panelId, "item_count", { kind: "text", value: String(items.length) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawValue, panelId]);

  const meta         = panel?.meta as Record<string, unknown> | undefined;
  const stepDelayMs  = Number(meta?.stepDelayMs ?? 500);
  const currentIndex = Number(meta?.currentIndex ?? -1);
  const running      = Boolean(meta?.running);

  const [localDelay, setLocalDelay] = useState(stepDelayMs);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patch = useCallback(
    (p: Record<string, unknown>) =>
      updatePanel(panelId, { meta: { ...meta, ...p } }),
    [panelId, meta, updatePanel],
  );

  // Step: emit current_item and advance index.
  const doStep = useCallback(
    (idx: number, arr: string[]) => {
      if (idx >= arr.length) {
        // Done — clear running state and current_item.
        setPortOutput(panelId, "current_item", null);
        patch({ running: false, currentIndex: arr.length });
        return;
      }
      const item = arr[idx];
      setPortOutput(panelId, "current_item", { kind: "text", value: item });
      setVariable("foreach_item", item, "text");
      setVariable("foreach_index", idx, "number");
      patch({ currentIndex: idx, running: true });
    },
    [panelId, setPortOutput, setVariable, patch],
  );

  // Effect: when running, schedule the next step.
  useEffect(() => {
    if (!running) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    const nextIdx = currentIndex + 1;
    timerRef.current = setTimeout(() => {
      doStep(nextIdx, items);
    }, stepDelayMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, currentIndex, stepDelayMs]);

  const handleRun = useCallback(() => {
    if (items.length === 0) return;
    patch({ running: true, currentIndex: -1, stepDelayMs: localDelay });
  }, [items, localDelay, patch]);

  const handleStop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPortOutput(panelId, "current_item", null);
    patch({ running: false });
  }, [panelId, setPortOutput, patch]);

  const displayIdx  = running || currentIndex >= 0 ? Math.min(currentIndex + 1, items.length) : null;
  const currentItem = currentIndex >= 0 && currentIndex < items.length ? items[currentIndex] : null;
  const accent = "#9b72ef";

  return (
    <div
      style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, height: "100%", fontFamily: "system-ui" }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          FOR EACH
        </span>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 4,
          background: items.length > 0 ? accent + "20" : "rgba(255,255,255,0.05)",
          color: items.length > 0 ? accent : "rgba(255,255,255,0.3)",
          border: `1px solid ${items.length > 0 ? accent + "35" : "rgba(255,255,255,0.08)"}`,
        }}>
          {items.length} items
        </span>
      </div>

      {/* Items list (collapsed when running) */}
      {!running && (
        <div style={{
          flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 6, padding: "6px 8px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 3,
        }}>
          {items.length === 0 ? (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>— wire items port</span>
          ) : (
            items.slice(0, 8).map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", minWidth: 16, textAlign: "right" }}>{i + 1}</span>
                <span style={{ fontSize: 11, color: "#c8c8d0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item}
                </span>
              </div>
            ))
          )}
          {items.length > 8 && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", paddingLeft: 22 }}>
              +{items.length - 8} more
            </span>
          )}
        </div>
      )}

      {/* Progress (visible when running) */}
      {running && currentItem !== null && (
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", gap: 8, justifyContent: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Step
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: accent }}>
              {displayIdx} / {items.length}
            </span>
          </div>
          {/* Progress bar */}
          <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 2, background: accent,
              width: `${(displayIdx! / items.length) * 100}%`,
              transition: "width 200ms ease-out",
            }} />
          </div>
          <div style={{
            background: "rgba(255,255,255,0.04)", border: `1px solid ${accent}28`,
            borderRadius: 6, padding: "5px 8px", fontSize: 11, color: "#c8c8d0",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {currentItem}
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {running ? (
          <button
            type="button"
            onClick={handleStop}
            style={{
              flex: 1, padding: "5px 0", borderRadius: 6, fontSize: 11, cursor: "pointer",
              background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)",
              color: "#ef4444", fontFamily: "system-ui",
            }}
          >
            ⏹ Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={handleRun}
            disabled={items.length === 0}
            style={{
              flex: 1, padding: "5px 0", borderRadius: 6, fontSize: 11, cursor: items.length === 0 ? "not-allowed" : "pointer",
              background: items.length === 0 ? "rgba(255,255,255,0.04)" : "rgba(155,114,239,0.12)",
              border: `1px solid ${items.length === 0 ? "rgba(255,255,255,0.06)" : "rgba(155,114,239,0.30)"}`,
              color: items.length === 0 ? "rgba(255,255,255,0.2)" : accent, fontFamily: "system-ui",
              opacity: items.length === 0 ? 0.5 : 1,
            }}
          >
            ▶ Run
          </button>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
          <span>ms</span>
          <input
            type="number"
            min={50}
            max={10000}
            step={50}
            value={localDelay}
            onChange={(e) => setLocalDelay(Math.max(50, Number(e.target.value)))}
            disabled={running}
            style={{
              width: 52, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 4, padding: "2px 5px", fontSize: 10, color: "#c8c8d0",
              outline: "none", fontFamily: "monospace", textAlign: "center",
              opacity: running ? 0.4 : 1,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </div>
      </div>

      {itemsWire && !running && (
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          ← {itemsWire.panelTitle}
        </div>
      )}
    </div>
  );
}
