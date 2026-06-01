import { useCanvasStore } from "@/store/canvasStore";

export function NotePanel({ panelId }: { panelId: string }) {
  const panel = useCanvasStore((s) => s.panels.find((p) => p.id === panelId));
  const setMeta = useCanvasStore((s) => s.setMeta);
  const text = (panel?.meta.text as string) ?? "";

  return (
    <textarea
      value={text}
      onChange={(e) => setMeta(panelId, { text: e.target.value })}
      placeholder="Note..."
      style={{
        width: "100%", height: "100%", background: "transparent",
        border: "none", outline: "none", resize: "none",
        color: "var(--text-primary)", fontFamily: "system-ui", fontSize: 13,
        padding: 8, lineHeight: 1.5,
      }}
    />
  );
}
