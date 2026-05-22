import { useCanvasStore } from "./canvasStore";

interface Props {
  onSketch?: () => void;
  onOpenAddPanel?: () => void;
}

const iconBtn = (
  title: string,
  onClick: () => void,
  children: React.ReactNode,
  primary?: boolean,
) => (
  <button
    key={title}
    type="button"
    title={title}
    onClick={onClick}
    className={[
      "flex items-center justify-center rounded-[10px] transition-colors duration-150 ease-out",
      primary
        ? "h-11 w-11 rounded-full border border-[#3a3a3a] bg-[#111111] text-[#f5f5f5] hover:border-[#5b8def]/40 hover:text-[#5b8def]"
        : "h-[38px] w-[38px] text-[#555555] hover:bg-[#1a1a1a] hover:text-[#888888]",
    ].join(" ")}
  >
    {children}
  </button>
);

export function CanvasFab({ onSketch, onOpenAddPanel }: Props) {
  const addPanel = useCanvasStore((s) => s.addPanel);

  return (
    <div className="canvas-chrome absolute right-3 top-1/2 z-[60] flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-[14px] border p-1.5" style={{ background: "color-mix(in oklab, #111111 80%, transparent)", borderColor: "#2e2e2e", boxShadow: "0 10px 32px rgba(0,0,0,.4)" }}>
      {/* Primary: + / open palette */}
      {iconBtn("Add node (Ctrl+K)", () => onOpenAddPanel?.(), (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <path d="M8 3v10M3 8h10"/>
        </svg>
      ), true)}

      <div className="h-px w-6 bg-[#2a2a2a]" />

      {/* Sketch */}
      {iconBtn("Sketch", () => { onSketch?.(); addPanel("sketch"); }, (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1 1-8 8H4v-1l8-8z"/><path d="M11 4l1 1"/>
        </svg>
      ))}

      {/* Note */}
      {iconBtn("Sticky note", () => addPanel("note"), (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3h10v10H9l-6-6V3z"/><path d="M9 13V9h4"/>
        </svg>
      ))}

      {/* Chat */}
      {iconBtn("Chat", () => addPanel("chat"), (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2H3a1 1 0 00-1 1v7a1 1 0 001 1h1v3l4-3h5a1 1 0 001-1V3a1 1 0 00-1-1z"/>
        </svg>
      ))}

      {/* Terminal */}
      {iconBtn("Terminal", () => addPanel("terminal"), (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="12" height="10" rx="1.5"/>
          <path d="M5 7l2 2-2 2M9 11h2"/>
        </svg>
      ))}

      <div className="h-px w-6 bg-[#2a2a2a]" />

      {/* Agent */}
      {iconBtn("AI Agent", () => addPanel("agent"), (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="8" cy="8" r="3"/>
          <circle cx="8" cy="8" r="6"/>
        </svg>
      ))}
    </div>
  );
}
