import { useState } from "react";
import { getModel, getProvider } from "@/modules/ai/config";
import { useChatStore } from "@/modules/ai/store/chatStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CanvasBreadcrumb } from "./CanvasBreadcrumb";

type CanvasMode = "performance" | "quality";

interface Props { onOpenSettings?: () => void; }

export function CanvasTopBar({ onOpenSettings }: Props) {
  const [mode, setMode] = useState<CanvasMode>("quality");

  const selectedModelId = useChatStore((s) => s.selectedModelId);
  const model = getModel(selectedModelId);
  const providerLabel = getProvider(model.provider).label;

  const lmChatModel = usePreferencesStore((s) => s.lmstudioChatModelId);
  const ollamaChatModel = usePreferencesStore((s) => s.ollamaChatModelId);

  const chatModelDisplay = (() => {
    if (model.provider === "lmstudio" && lmChatModel) return lmChatModel;
    if (model.provider === "ollama" && ollamaChatModel) return ollamaChatModel;
    return model.label;
  })();

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center justify-between px-3 py-2.5">
      {/* Left pill: brand + breadcrumb + mode switch */}
      <div className="pointer-events-auto flex items-center gap-2 rounded-[10px] border border-[#2a2a2a] bg-[#111111]/90 px-2.5 py-1.5 backdrop-blur-sm">
        {/* Brand mark */}
        <div
          className="flex h-[22px] w-[22px] items-center justify-center rounded-[6px] font-bold text-[12px] text-[#0a0a0a]"
          style={{ background: "linear-gradient(135deg, #5b8def, #9b72ef)" }}
        >
          A
        </div>
        <span className="text-[12px] font-medium text-[#f5f5f5]">Atlas OS</span>

        <div className="h-[18px] w-px bg-[#2a2a2a]" />

        <CanvasBreadcrumb />

        <div className="h-[18px] w-px bg-[#2a2a2a]" />

        {/* Performance / Quality toggle */}
        <div className="flex items-center gap-0.5 rounded-[6px] border border-[#2a2a2a] bg-[#0d0d0d] p-0.5">
          {(["performance", "quality"] as CanvasMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={[
                "rounded-[4px] px-2.5 py-1 font-mono text-[10px] font-medium tracking-widest uppercase transition-colors duration-150 ease-out",
                mode === m
                  ? "bg-[#1a1a1a] text-[#f5f5f5]"
                  : "text-[#555555] hover:text-[#888888]",
              ].join(" ")}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Right pill: Run + Share + provider */}
      <div className="pointer-events-auto flex items-center rounded-[10px] border border-[#2a2a2a] bg-[#111111]/90 p-1 backdrop-blur-sm">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-[6px] px-2.5 py-[5px] text-[11.5px] text-[#888888] transition-colors duration-150 ease-out hover:bg-[#1a1a1a] hover:text-[#f5f5f5]"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 3l10 5-10 5V3z"/>
          </svg>
          Run
        </button>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-[6px] px-2.5 py-[5px] text-[11.5px] text-[#888888] transition-colors duration-150 ease-out hover:bg-[#1a1a1a] hover:text-[#f5f5f5]"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="13" cy="3" r="1.5"/>
            <circle cx="13" cy="13" r="1.5"/>
            <circle cx="3" cy="8" r="1.5"/>
            <path d="M4.4 7.3L11.6 4M4.4 8.7l7.2 3.3"/>
          </svg>
          Share
        </button>

        <div className="mx-1 h-[18px] w-px bg-[#2a2a2a]" />

        {/* Provider indicator */}
        <div className="flex items-center gap-1.5 px-2 py-1">
          <div className="h-[7px] w-[7px] rounded-full bg-[#4db89a]" style={{ boxShadow: "0 0 6px #4db89a" }} />
          <span className="font-mono text-[11px] text-[#555555]">
            local · {chatModelDisplay !== providerLabel ? chatModelDisplay : providerLabel}
          </span>
        </div>

        <div className="mx-0.5 h-[18px] w-px bg-[#2a2a2a]" />

        <button
          type="button"
          onClick={() => onOpenSettings?.()}
          className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#555555] transition-colors duration-150 ease-out hover:bg-[#1a1a1a] hover:text-[#888888]"
          title="Settings"
        >
          <HugeiconsIcon icon={Settings01Icon} size={12} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
