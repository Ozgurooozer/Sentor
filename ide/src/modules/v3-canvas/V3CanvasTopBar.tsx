import { useRef, useState } from "react";
import { Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCanvasStore } from "@/modules/canvas/canvasStore";
import { runCanvas } from "@/modules/canvas/canvasEngine";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useChatStore } from "@/modules/ai";
import { getModel, OPENCODE_DEFAULT_BASE_URL } from "@/modules/ai/config";

interface Props {
  onOpenSettings?: () => void;
  secondary?: boolean;
}

export function V3CanvasTopBar({ onOpenSettings, secondary = false }: Props) {
  const activeCanvasId = useCanvasStore((s) => s.activeCanvasId);
  const canvases       = useCanvasStore((s) => s.canvases);
  const renameCanvas   = useCanvasStore((s) => s.renameCanvas);
  const isSplit        = useCanvasStore((s) => s.isSplit);
  const openSplit      = useCanvasStore((s) => s.openSplit);
  const closeSplit     = useCanvasStore((s) => s.closeSplit);
  const secondaryTitle = useCanvasStore((s) => s.secondaryTitle);
  const connections    = useCanvasStore((s) => secondary ? s.secondaryConnections : s.connections);

  const canRun  = connections.length > 0;
  const panels  = useCanvasStore((s) => secondary ? s.secondaryPanels : s.panels);

  const [running, setRunning] = useState(false);

  const opencodeModel = usePreferencesStore((s) => s.opencodeChatModelId) || "deepseek-v4-flash-free";
  const selectedModelId = useChatStore((s) => s.selectedModelId);
  const apiKeys       = useChatStore((s) => s.apiKeys);
  const modelProvider = getModel(selectedModelId).provider;

  const handleRun = async () => {
    if (!canRun || running) return;
    setRunning(true);
    try {
      await runCanvas(panels, connections, {
        modelProvider,
        ollamaBase: "", lmBase: "", ollamaModel: "", lmModel: "",
        opencodeKey: apiKeys.opencode ?? "", opencodeBase: OPENCODE_DEFAULT_BASE_URL, opencodeModel,
      });
    } finally {
      setRunning(false);
    }
  };

  const activeCanvas = canvases.find((c) => c.id === activeCanvasId);
  const displayTitle  = secondary ? secondaryTitle : (activeCanvas?.title ?? "Canvas");

  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setDraft(displayTitle);
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  };

  const commitEdit = () => {
    setEditing(false);
    const next = draft.trim() || displayTitle;
    if (secondary) {
      useCanvasStore.setState({ secondaryTitle: next });
    } else {
      renameCanvas(activeCanvasId, next);
    }
  };

  const glassPill: React.CSSProperties = {
    background: "rgba(8, 8, 14, 0.80)",
    backdropFilter: "blur(20px) saturate(160%)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 10,
  };

  const splitIcon = (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="1" y="1" width="5" height="12" rx="1.5"/>
      <rect x="8" y="1" width="5" height="12" rx="1.5"/>
    </svg>
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center justify-between px-3 py-2.5">
      {/* Drag strip — only on primary bar */}
      {!secondary && (
        <div
          className="pointer-events-auto absolute inset-0"
          data-tauri-drag-region
          style={{ cursor: "grab" }}
        />
      )}

      {/* Left pill — editable canvas title */}
      <div className="pointer-events-auto relative z-10 flex items-center gap-2 px-2.5 py-1.5" style={glassPill}>
        <div
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] font-bold text-[12px]"
          style={{ background: secondary ? "linear-gradient(135deg,#9b72ef,#5b8def)" : "linear-gradient(135deg,#5b8def,#9b72ef)", color: "#0a0a0a" }}
        >
          {secondary ? "B" : "A"}
        </div>

        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(false); }}
            className="rounded px-1 py-0 text-[12px] font-medium outline-none"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(91,141,239,0.4)", color: "#f5f5f5", width: Math.max(80, draft.length * 8) }}
          />
        ) : (
          <span
            className="cursor-text text-[12px] font-medium select-none"
            style={{ color: "#f5f5f5" }}
            onDoubleClick={startEdit}
            title="Double-click to rename"
          >
            {displayTitle}
          </span>
        )}
      </div>

      {/* Right pill — run + add + split + settings */}
      <div className="pointer-events-auto relative z-10 flex items-center p-1" style={glassPill}>

        {/* Run button — active (green) when canvas has wired connections */}
        <button
          type="button"
          title={canRun ? "Run canvas workflow" : "No connections — wire nodes to enable run"}
          onClick={() => void handleRun()}
          disabled={running}
          className="flex items-center gap-1.5 rounded-[6px] px-2.5 py-[5px] font-mono text-[11px] font-medium transition-all duration-150 ease-out"
          style={{
            color:      canRun ? "#4db89a" : "rgba(255,255,255,0.18)",
            background: running ? "rgba(77,184,154,0.20)" : canRun ? "rgba(77,184,154,0.10)" : "transparent",
            border:     `1px solid ${canRun ? "rgba(77,184,154,0.32)" : "rgba(255,255,255,0.06)"}`,
            cursor:     canRun && !running ? "pointer" : "default",
          }}
          onMouseEnter={(e) => { if (canRun && !running) (e.currentTarget as HTMLButtonElement).style.background = "rgba(77,184,154,0.18)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = running ? "rgba(77,184,154,0.20)" : canRun ? "rgba(77,184,154,0.10)" : "transparent"; }}
        >
          {running ? (
            <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor" style={{ animation: "spin 1s linear infinite" }}>
              <path d="M4.5 1a3.5 3.5 0 011 6.87V9A4.5 4.5 0 104.5 0v1z" opacity="0.8"/>
            </svg>
          ) : (
            <svg width="9" height="10" viewBox="0 0 9 10" fill="currentColor">
              <path d="M1 1.5 L8 5 L1 8.5 Z"/>
            </svg>
          )}
          {running ? "…" : "Run"}
        </button>

        <div className="mx-1 h-[18px] w-px" style={{ background: "rgba(255,255,255,0.08)" }} />

        <button
          type="button"
          title="Add node (Ctrl+K)"
          onClick={() => window.dispatchEvent(new CustomEvent(secondary ? "canvas:open-secondary-add-panel" : "canvas:open-add-panel"))}
          className="flex items-center gap-1.5 rounded-[6px] px-2.5 py-[5px] text-[11.5px] font-medium transition-colors duration-150 ease-out"
          style={{ color: "#5b8def", border: "1px solid rgba(91,141,239,0.25)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(91,141,239,0.10)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M6 2v8M2 6h8"/>
          </svg>
          Add
        </button>

        <div className="mx-1 h-[18px] w-px" style={{ background: "rgba(255,255,255,0.08)" }} />

        {/* Split/unsplit button — only on primary */}
        {!secondary && (
          <>
            <button
              type="button"
              title={isSplit ? "Close second canvas" : "Open second canvas (split view)"}
              onClick={() => (isSplit ? closeSplit() : openSplit())}
              className="flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors duration-150 ease-out"
              style={{ color: isSplit ? "#5b8def" : "rgba(255,255,255,0.3)", background: isSplit ? "rgba(91,141,239,0.12)" : "transparent" }}
              onMouseEnter={(e) => { if (!isSplit) { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.6)"; } }}
              onMouseLeave={(e) => { if (!isSplit) { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.3)"; } }}
            >
              {splitIcon}
            </button>
            <div className="mx-1 h-[18px] w-px" style={{ background: "rgba(255,255,255,0.08)" }} />
          </>
        )}

        {/* Input bar'ı geri getir */}
        <button
          type="button"
          onClick={() => {
            void (async () => {
              const w = await WebviewWindow.getByLabel("v3-input");
              if (!w) return;
              await w.show();
              await w.setAlwaysOnTop(true);
              await w.setFocus();
            })();
          }}
          className="flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors duration-150 ease-out"
          style={{ color: "rgba(255,255,255,0.3)" }}
          title="Input bar'ı göster"
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.6)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.3)"; }}
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="12" height="6" rx="2"/>
            <path d="M4 7h6M9 5.5v3"/>
          </svg>
        </button>

        <button
          type="button"
          onClick={() => onOpenSettings?.()}
          className="flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors duration-150 ease-out"
          style={{ color: "rgba(255,255,255,0.3)" }}
          title="Settings"
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.6)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.3)"; }}
        >
          <HugeiconsIcon icon={Settings01Icon} size={12} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
