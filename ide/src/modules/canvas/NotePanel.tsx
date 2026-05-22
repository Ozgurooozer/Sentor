import { useCallback, useEffect, useRef } from "react";
import { useCanvasStore } from "./canvasStore";

interface Props {
  panelId: string;
  initialText?: string;
}

export function NotePanel({ panelId, initialText = "" }: Props) {
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const setOutputData = useCanvasStore((s) => s.setOutputData);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Seed outputData from initial text on mount so pre-existing notes are wired.
  useEffect(() => {
    if (initialText) setOutputData(panelId, { kind: "text", value: initialText });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const v = e.target.value;
      updatePanel(panelId, { meta: { text: v } });
      setOutputData(panelId, { kind: "text", value: v });
    },
    [panelId, updatePanel, setOutputData],
  );

  return (
    <div
      className="relative flex h-full flex-col"
      style={{ background: "linear-gradient(135deg, #f5e58b 0%, #eed572 100%)" }}
    >
      {/* Folded corner */}
      <div
        className="absolute right-0 top-0 h-5 w-5"
        style={{
          background: "linear-gradient(225deg, #c8b84a 50%, transparent 50%)",
        }}
      />
      <textarea
        ref={textRef}
        defaultValue={initialText}
        onChange={onChange}
        placeholder="Write a note…"
        className="flex-1 resize-none bg-transparent p-3 pr-6 text-[12px] leading-relaxed text-[#3a3000] placeholder-[#a09040] outline-none"
        style={{ fontFamily: "system-ui, sans-serif" }}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
