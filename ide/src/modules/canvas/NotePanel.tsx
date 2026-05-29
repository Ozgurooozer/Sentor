import { useCallback, useEffect } from "react";
import { useCanvasStore } from "./canvasStore";

interface Props {
  panelId: string;
  initialText?: string;
}

export function NotePanel({ panelId, initialText = "" }: Props) {
  const updatePanel  = useCanvasStore((s) => s.updatePanel);
  const setOutputData = useCanvasStore((s) => s.setOutputData);

  useEffect(() => {
    if (initialText) setOutputData(panelId, { kind: "text", value: initialText });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const v = e.target.value;
      const curMeta = useCanvasStore.getState().panels.find((p) => p.id === panelId)?.meta ?? {};
      updatePanel(panelId, { meta: { ...curMeta, text: v } });
      setOutputData(panelId, { kind: "text", value: v });
    },
    [panelId, updatePanel, setOutputData],
  );

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Ambient amber tint */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 30% 20%, rgba(210,165,30,0.10) 0%, transparent 65%)",
        }}
      />
      {/* Folded corner — glass style */}
      <div
        className="pointer-events-none absolute right-0 top-0 z-10"
        style={{
          width: 20,
          height: 20,
          background: "linear-gradient(225deg, rgba(210,165,30,0.35) 50%, transparent 50%)",
        }}
      />
      <textarea
        defaultValue={initialText}
        onChange={onChange}
        placeholder="Write a note…"
        className="relative z-0 flex-1 resize-none bg-transparent p-3 pr-6 text-[12px] leading-relaxed outline-none"
        style={{
          color: "#e8dfc0",
          fontFamily: "system-ui, sans-serif",
          caretColor: "#d4a843",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
