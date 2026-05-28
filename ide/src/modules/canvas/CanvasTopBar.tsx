import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getModel, getProvider } from "@/modules/ai/config";
import { useChatStore } from "@/modules/ai/store/chatStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setWorkspaceRoot } from "@/modules/settings/store";
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

  const workspaceRoot = usePreferencesStore((s) => s.workspaceRoot);
  const chatModelDisplay = model.label;

  // Folder name only (last path segment) for compact display.
  const vaultLabel = workspaceRoot
    ? workspaceRoot.replace(/[\\/]$/, "").split(/[\\/]/).pop() ?? workspaceRoot
    : null;

  const pickVault = async () => {
    const picked = await invoke<string | null>("pick_folder");
    if (picked) await setWorkspaceRoot(picked);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center justify-between px-3 py-2.5">
      {/* Full-width drag strip — sits below the pills so the empty bar area drags the window */}
      <div
        className="pointer-events-auto absolute inset-0"
        data-tauri-drag-region
        style={{ cursor: "grab" }}
      />
      {/* Left pill: brand + vault picker + breadcrumb + mode switch */}
      <div className="pointer-events-auto relative z-10 flex items-center gap-2 rounded-[10px] border border-[#2a2a2a] bg-[#111111]/90 px-2.5 py-1.5 backdrop-blur-sm">
        {/* Brand mark */}
        <div
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] font-bold text-[12px] text-[#0a0a0a]"
          style={{ background: "linear-gradient(135deg, #5b8def, #9b72ef)" }}
        >
          A
        </div>
        <span className="text-[12px] font-medium text-[#f5f5f5]">Atlas OS</span>

        <div className="h-[18px] w-px bg-[#2a2a2a]" />

        {/* Vault picker button */}
        <button
          type="button"
          onClick={() => void pickVault()}
          title={workspaceRoot ?? "Vault seç"}
          className="flex items-center gap-1.5 rounded-[6px] px-1.5 py-0.5 transition-colors duration-150 ease-out hover:bg-[#1a1a1a]"
        >
          {/* Vault / folder icon */}
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={vaultLabel ? "#d4a843" : "#555"} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4a1 1 0 011-1h3l2 2h5a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"/>
          </svg>
          {vaultLabel ? (
            <span className="max-w-[120px] truncate font-mono text-[10px] text-[#d4a843]">{vaultLabel}</span>
          ) : (
            <span className="font-mono text-[10px] text-[#555]">vault seç</span>
          )}
        </button>

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

      {/* Right pill */}
      <div className="pointer-events-auto relative z-10 flex items-center rounded-[10px] border border-[#2a2a2a] bg-[#111111]/90 p-1 backdrop-blur-sm">
        {/* Add node — primary action */}
        <button
          type="button"
          title="Add node (Ctrl+K)"
          onClick={() => window.dispatchEvent(new CustomEvent("canvas:open-add-panel"))}
          className="flex items-center gap-1.5 rounded-[6px] px-2.5 py-[5px] text-[11.5px] font-medium transition-colors duration-150 ease-out hover:bg-[#5b8def]/10"
          style={{ color: "#5b8def", border: "1px solid rgba(91,141,239,0.25)" }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M6 2v8M2 6h8"/>
          </svg>
          Add
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
