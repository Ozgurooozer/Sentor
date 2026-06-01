import { useCanvasStore } from "@/store/canvasStore";

export function InputPanel({ panelId }: { panelId: string }) {
  const panel = useCanvasStore((s) => s.panels.find((p) => p.id === panelId));
  const setMeta = useCanvasStore((s) => s.setMeta);
  const setOutputData = useCanvasStore((s) => s.setOutputData);
  const text = (panel?.meta.text as string) ?? "";

  const onChange = (val: string) => {
    setMeta(panelId, { text: val });
    setOutputData(panelId, { kind: "text", value: val });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: 8, gap: 6 }}>
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type or paste text..."
        style={{
          flex: 1,
          background: "transparent",
          border: "none",
          outline: "none",
          resize: "none",
          color: "var(--text-primary)",
          fontFamily: "system-ui",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      />
      <div style={{ fontSize: 10, color: "var(--text-tertiary)", textAlign: "right" }}>
        {text.length} chars
      </div>
    </div>
  );
}
