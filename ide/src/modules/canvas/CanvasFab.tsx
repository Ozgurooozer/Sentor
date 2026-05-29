import { convertFileSrc } from "@tauri-apps/api/core";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useCanvasStore } from "./canvasStore";

interface Props {
  onSketch?: () => void;
  onOpenAddPanel?: () => void;
  onOpenTweaks?: () => void;
  tweaksActive?: boolean;
}

const iconBtn = (
  title: string,
  onClick: () => void,
  children: React.ReactNode,
  variant?: "primary" | "active" | "default",
) => (
  <button
    key={title}
    type="button"
    title={title}
    onClick={onClick}
    className={[
      "flex items-center justify-center rounded-[10px] transition-colors duration-150 ease-out",
      variant === "primary"
        ? "h-11 w-11 rounded-full border border-[#3a3a3a] bg-[#111111] text-[#f5f5f5] hover:border-[#5b8def]/40 hover:text-[#5b8def]"
        : variant === "active"
          ? "h-[38px] w-[38px] bg-[#5b8def]/10 text-[#5b8def] hover:bg-[#5b8def]/20"
          : "h-[38px] w-[38px] text-[#555555] hover:bg-[#1a1a1a] hover:text-[#888888]",
    ].join(" ")}
  >
    {children}
  </button>
);

export function CanvasFab({ onSketch, onOpenAddPanel, onOpenTweaks, tweaksActive }: Props) {
  const addPanel = useCanvasStore((s) => s.addPanel);
  const workspaceRoot = usePreferencesStore((s) => s.workspaceRoot) ?? "C:\\Atlas OS";

  return (
    <div className="canvas-chrome absolute left-3.5 top-1/2 z-[60] flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-[14px] border p-1.5" style={{ background: "color-mix(in oklab, #111111 80%, transparent)", borderColor: "#2e2e2e", boxShadow: "0 10px 32px rgba(0,0,0,.4)" }} onPointerDown={(e) => e.stopPropagation()}>
      {/* Primary: + / open palette */}
      {iconBtn("Add node (Ctrl+K)", () => onOpenAddPanel?.(), (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <path d="M8 3v10M3 8h10"/>
        </svg>
      ), "primary")}

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

      {/* Pipe — auto-transformer */}
      {iconBtn("Auto-pipe (AI transform)", () => addPanel("pipe"), (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 8h4m4 0h4M10 5l3 3-3 3"/>
          <rect x="5" y="5" width="6" height="6" rx="1"/>
        </svg>
      ))}

      {/* Vault */}
      {iconBtn("Vault (knowledge base)", () => addPanel("vault-home"), (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 2l5 3v6l-5 3-5-3V5l5-3z"/>
          <path d="M3 5l5 3 5-3" strokeOpacity="0.6"/>
          <path d="M8 8v6" strokeOpacity="0.6"/>
        </svg>
      ))}

      {/* Atlas0fis Office */}
      {iconBtn("Atlas0fis Ofis", () => {
        const root = workspaceRoot.replace(/\\/g, "/");
        const url = convertFileSrc(`${root}/vault/forum/atlas0fis/index.html`);
        addPanel("web", undefined, { url });
      }, (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="12" height="9" rx="1"/>
          <path d="M5 5V4a3 3 0 016 0v1"/>
          <path d="M8 9v2" strokeWidth="1.75"/>
        </svg>
      ))}

      <div className="h-px w-6 bg-[#2a2a2a]" />

      {/* Tweaks */}
      {iconBtn("Canvas tweaks", () => onOpenTweaks?.(), (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="2.5"/>
          <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.22 3.22l1.42 1.42M11.36 11.36l1.42 1.42M11.36 4.64l1.42-1.42M3.22 12.78l1.42-1.42"/>
        </svg>
      ), tweaksActive ? "active" : "default")}
    </div>
  );
}
