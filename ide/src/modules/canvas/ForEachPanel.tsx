import { useEffect } from "react";
import { useCanvasStore } from "./canvasStore";
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
  const setOutput = useCanvasStore((s) => s.setOutputData);
  const wireBlocks = useAllIncomingWireData(panelId);

  const itemsWire = wireBlocks.find(
    (b) => b.toPort === "items" || !b.toPort
  );
  const rawValue = itemsWire?.data?.value;

  useEffect(() => {
    const items = parseItems(rawValue);
    setOutput(panelId, { kind: "json", value: JSON.stringify(items) });
  }, [rawValue, panelId, setOutput]);

  const items = parseItems(rawValue);
  const accent = "#5b8def";

  return (
    <div
      style={{
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        height: "100%",
        fontFamily: "system-ui",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.35)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          FOR EACH
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 7px",
            borderRadius: 4,
            background:
              items.length > 0 ? accent + "20" : "rgba(255,255,255,0.05)",
            color:
              items.length > 0 ? accent : "rgba(255,255,255,0.3)",
            border: `1px solid ${
              items.length > 0 ? accent + "35" : "rgba(255,255,255,0.08)"
            }`,
          }}
        >
          {items.length} items
        </span>
      </div>
      <div
        style={{
          flex: 1,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 6,
          padding: "6px 8px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        {items.length === 0 ? (
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
            — wire items port
          </span>
        ) : (
          items.slice(0, 8).map((item, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  color: "rgba(255,255,255,0.25)",
                  minWidth: 16,
                  textAlign: "right",
                }}
              >
                {i + 1}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "#c8c8d0",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item}
              </span>
            </div>
          ))
        )}
        {items.length > 8 && (
          <span
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.25)",
              paddingLeft: 22,
            }}
          >
            +{items.length - 8} more
          </span>
        )}
      </div>
      {itemsWire && (
        <div
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.3)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          ← {itemsWire.panelTitle}
        </div>
      )}
    </div>
  );
}
