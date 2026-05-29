import { useEffect } from "react";
import { useCanvasStore } from "./canvasStore";
import { useAllIncomingWireData } from "./useWireData";

interface Props { panelId: string }

function evalCondition(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  const s = String(val).trim().toLowerCase();
  return s !== "" && s !== "0" && s !== "false" && s !== "null" && s !== "undefined";
}

export function IfElsePanel({ panelId }: Props) {
  const setPortOutput = useCanvasStore((s) => s.setPortOutputData);
  const wireBlocks = useAllIncomingWireData(panelId);

  const condWire  = wireBlocks.find((b) => b.toPort === "condition");
  const trueWire  = wireBlocks.find((b) => b.toPort === "true_val");
  const falseWire = wireBlocks.find((b) => b.toPort === "false_val");

  const condVal  = condWire?.data?.value;
  const trueVal  = trueWire?.data?.value;
  const falseVal = falseWire?.data?.value;

  useEffect(() => {
    if (condVal === undefined) return;
    const branch = evalCondition(condVal);
    // Route to separate then_out / else_out ports
    setPortOutput(panelId, "then_out", branch ? { kind: "text", value: String(trueVal ?? "") } : null);
    setPortOutput(panelId, "else_out", !branch ? { kind: "text", value: String(falseVal ?? "") } : null);
  }, [condVal, trueVal, falseVal, panelId, setPortOutput]);

  const isTrue  = condVal !== undefined && evalCondition(condVal);
  const isFalse = condVal !== undefined && !evalCondition(condVal);
  const activeVal = condVal !== undefined
    ? String(isTrue ? (trueVal ?? "") : (falseVal ?? ""))
    : null;
  const resultVal = activeVal;

  const accent = "#5b8def";
  const green  = "#4db89a";
  const orange = "#e09060";

  return (
    <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, height: "100%", fontFamily: "system-ui" }}>
      {/* Condition row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase" }}>IF</span>
        <div style={{
          flex: 1, padding: "3px 8px",
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${condWire ? accent + "40" : "rgba(255,255,255,0.07)"}`,
          borderRadius: 5, fontSize: 11,
          color: condWire ? accent : "rgba(255,255,255,0.2)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {condWire ? String(condVal ?? "") : "— wire condition port"}
        </div>
        {condVal !== undefined && (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
            background: isTrue ? green + "25" : orange + "25",
            color: isTrue ? green : orange,
            border: `1px solid ${isTrue ? green : orange}35`,
          }}>
            {isTrue ? "TRUE" : "FALSE"}
          </span>
        )}
      </div>

      {/* Branch rows */}
      {([
        { label: "THEN", wire: trueWire,  active: isTrue,  color: green  },
        { label: "ELSE", wire: falseWire, active: isFalse, color: orange },
      ] as const).map(({ label, wire, active, color }) => (
        <div key={label} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "4px 8px",
          background: active ? color + "15" : "rgba(255,255,255,0.03)",
          border: `1px solid ${active ? color + "35" : "rgba(255,255,255,0.06)"}`,
          borderRadius: 6,
          transition: "background 150ms ease-out, border-color 150ms ease-out",
        }}>
          <span style={{ fontSize: 9, color: active ? color : "rgba(255,255,255,0.3)", letterSpacing: "0.08em", textTransform: "uppercase", minWidth: 32 }}>{label}</span>
          <span style={{ fontSize: 11, color: wire ? "#c8c8d0" : "rgba(255,255,255,0.2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {wire ? String(wire.data?.value ?? "") : "— wire port"}
          </span>
        </div>
      ))}

      {/* Result */}
      {resultVal !== null && (
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          → {resultVal || <em>empty</em>}
        </div>
      )}
    </div>
  );
}
