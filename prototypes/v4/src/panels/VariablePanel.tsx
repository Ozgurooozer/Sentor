import { useCanvasStore } from "@/store/canvasStore";
import { useVariableStore } from "@/store/variableStore";

export function VariablePanel({ panelId }: { panelId: string }) {
  const panel = useCanvasStore((s) => s.panels.find((p) => p.id === panelId));
  const setMeta = useCanvasStore((s) => s.setMeta);
  const setVariable = useVariableStore((s) => s.setVariable);

  const name = (panel?.meta.varName as string) ?? "";
  const value = (panel?.meta.value as string) ?? "";

  const commit = () => { if (name) setVariable(name, value); };

  return (
    <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6, height: "100%" }}>
      <input
        value={name}
        onChange={(e) => setMeta(panelId, { varName: e.target.value })}
        placeholder="variable name"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 4, padding: "4px 8px", color: "var(--text-primary)", fontSize: 12, outline: "none" }}
      />
      <textarea
        value={value}
        onChange={(e) => setMeta(panelId, { value: e.target.value })}
        onBlur={commit}
        placeholder="value"
        style={{ flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 4, padding: "4px 8px", color: "var(--text-primary)", fontSize: 12, outline: "none", resize: "none", fontFamily: "monospace" }}
      />
    </div>
  );
}
