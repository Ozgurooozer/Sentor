import { useEffect, useMemo, useRef } from "react";

const MERMAID_RE = /```mermaid\r?\n([\s\S]*?)```/g;

function extractBlocks(content: string): string[] {
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  MERMAID_RE.lastIndex = 0;
  while ((m = MERMAID_RE.exec(content)) !== null) {
    const trimmed = m[1].trim();
    if (trimmed) blocks.push(trimmed);
  }
  return blocks;
}

type Props = {
  /** Full file content (markdown or raw .mmd). */
  content: string;
  /** True when the file itself is a .mmd / .mermaid diagram file. */
  isMmd?: boolean;
};

export function MermaidPreview({ content, isMmd }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sentRef = useRef<string>("");

  const diagrams = useMemo(
    () => (isMmd ? [content.trim()] : extractBlocks(content)),
    [content, isMmd],
  );

  const push = (d: string[]) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: "mermaid-render", diagrams: d }, "*");
  };

  // Debounce: send 400 ms after the last content change.
  useEffect(() => {
    clearTimeout(timerRef.current);
    const key = diagrams.join("\n\x00\n");
    if (key === sentRef.current) return;
    timerRef.current = setTimeout(() => {
      sentRef.current = key;
      push(diagrams);
    }, 400);
    return () => clearTimeout(timerRef.current);
  }, [diagrams]);

  // Push immediately once the iframe has loaded (it wasn't ready before).
  const handleLoad = () => {
    sentRef.current = "";
    push(diagrams);
  };

  if (!isMmd && diagrams.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-[#444]">
        No mermaid blocks in this file
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      src="/mermaid-preview.html"
      onLoad={handleLoad}
      className="h-full w-full border-0 bg-[#0a0a0a]"
      title="Mermaid preview"
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
