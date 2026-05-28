import { useEffect, useRef } from "react";
import { useCanvasStore } from "./canvasStore";
import { useVariableStore } from "./variableStore";
import { useAllIncomingWireData } from "./useWireData";

interface Props { panelId: string }

export function VariablePanel({ panelId }: Props) {
  const panel       = useCanvasStore((s) => s.panels.find((p) => p.id === panelId));
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const setOutput   = useCanvasStore((s) => s.setOutputData);
  const { setVariable, getVariable } = useVariableStore();

  const wireBlocks = useAllIncomingWireData(panelId);
  const setWire    = wireBlocks.find((b) => b.toPort === "set" || !b.toPort);

  const varName = String(panel?.meta?.varName ?? "myVar");
  const initial = panel?.meta?.initialValue ?? "";

  const lastWireRef = useRef<unknown>(undefined);
  useEffect(() => {
    const incoming = setWire?.data?.value ?? initial;
    if (incoming === lastWireRef.current) return;
    lastWireRef.current = incoming;
    setVariable(varName, incoming);
    setOutput(panelId, { kind: "text", value: String(incoming) });
  }, [setWire?.data?.value, varName, initial, panelId, setVariable, setOutput]);

  useEffect(() => {
    const stored = getVariable(varName)?.value ?? initial;
    setOutput(panelId, { kind: "text", value: String(stored) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [varName]);

  const currentVal = String(getVariable(varName)?.value ?? initial);
  const accent = "#5b8def";

  return (
    <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "system-ui", letterSpacing: "0.08em", textTransform: "uppercase" }}>VAR</span>
        <input
          value={varName}
          onChange={(e) => updatePanel(panelId, { meta: { ...panel?.meta, varName: e.target.value } })}
          style={{
            flex: 1, background: "rgba(255,255,255,0.05)",
            border: `1px solid ${accent}35`, borderRadius: 5,
            color: accent, fontSize: 12, fontFamily: "system-ui",
            padding: "2px 7px", outline: "none",
          }}
          placeholder="variableName"
          spellCheck={false}
        />
      </div>
      <div style={{
        flex: 1, background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6,
        padding: "6px 8px", fontSize: 12, color: "#c8c8d0",
        fontFamily: "system-ui", overflow: "hidden",
        wordBreak: "break-all", whiteSpace: "pre-wrap", lineHeight: 1.5,
      }}>
        {currentVal || <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>}
      </div>
      {setWire && (
        <div style={{ fontSize: 10, color: "rgba(91,141,239,0.6)", fontFamily: "system-ui" }}>
          ← {setWire.panelTitle}
        </div>
      )}
    </div>
  );
}
