import { useEffect, useRef, useState } from "react";
import { useCanvasStore } from "./canvasStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setOllamaChatModelId, setLmstudioChatModelId } from "@/modules/settings/store";
import { useChatStore } from "@/modules/ai/store/chatStore";
import { getModel } from "@/modules/ai/config";
import type { PanelType } from "./types";

const QUICK_TYPES: { type: PanelType; label: string }[] = [
  { type: "terminal", label: "terminal" },
  { type: "chat",     label: "chat" },
  { type: "agent",    label: "agent" },
  { type: "editor",   label: "editor" },
];

interface Props {
  onAdd?: (type: PanelType) => void;
}

type OllamaTag = { name: string };

export function Orkestra({ onAdd }: Props) {
  const allPanels   = useCanvasStore((s) => s.panels);
  const connections = useCanvasStore((s) => s.connections);
  const panels      = allPanels.filter((p) => !p.minimized && !p.pinned);

  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState("");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const selectedModelId = useChatStore((s) => s.selectedModelId);
  const model = getModel(selectedModelId);
  const ollamaChatModel = usePreferencesStore((s) => s.ollamaChatModelId);
  const lmChatModel    = usePreferencesStore((s) => s.lmstudioChatModelId);

  const currentModelLabel = (() => {
    if (model.provider === "ollama" && ollamaChatModel) return ollamaChatModel;
    if (model.provider === "lmstudio" && lmChatModel)  return lmChatModel;
    return model.label;
  })();

  // Fetch Ollama models when picker opens
  useEffect(() => {
    if (!showModelPicker) return;
    const base = usePreferencesStore.getState().ollamaBaseURL || "http://localhost:11434";
    fetch(`${base}/api/tags`)
      .then((r) => r.json())
      .then((d: { models?: OllamaTag[] }) => {
        if (Array.isArray(d.models)) {
          setOllamaModels(d.models.map((m) => m.name));
        }
      })
      .catch(() => undefined);
  }, [showModelPicker]);

  // Close picker on outside click
  useEffect(() => {
    if (!showModelPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showModelPicker]);

  const selectModel = (name: string) => {
    if (model.provider === "ollama") {
      void setOllamaChatModelId(name);
    } else {
      void setLmstudioChatModelId(name);
    }
    setShowModelPicker(false);
  };

  const actionBtn = (title: string, icon: React.ReactNode) => (
    <button
      key={title}
      type="button"
      title={title}
      className="flex items-center justify-center rounded-[6px] transition-colors duration-150 ease-out text-[#4a4845] hover:bg-[#1a1a1a] hover:text-[#888888]"
      style={{ width: 26, height: 26 }}
    >
      {icon}
    </button>
  );

  return (
    <div
      className="canvas-chrome pointer-events-auto absolute inset-x-3.5 z-[70] rounded-[14px] border flex flex-col gap-1.5"
      style={{
        bottom: 14,
        background: "color-mix(in oklab, #111111 88%, transparent)",
        borderColor: focused
          ? "color-mix(in oklab, #5b8def 40%, #2e2e2e)"
          : "#2e2e2e",
        boxShadow: focused
          ? "0 20px 60px rgba(0,0,0,.5), 0 0 0 1px color-mix(in oklab, #5b8def 25%, transparent), 0 0 60px color-mix(in oklab, #5b8def 10%, transparent)"
          : "0 20px 60px rgba(0,0,0,.5)",
        padding: "8px 12px",
        transition: "border-color 180ms ease, box-shadow 180ms ease",
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Top row: brand + counters + actions */}
      <div className="flex items-center justify-between border-b pb-1.5" style={{ borderColor: "#232323" }}>
        <div className="flex items-center gap-2">
          <div
            className="rounded-full"
            style={{
              width: 8, height: 8,
              background: "#5b8def",
              boxShadow: "0 0 8px #5b8def",
            }}
          />
          <span style={{ font: "500 12px/1 'Geist Variable', sans-serif", color: "#f5f5f5" }}>
            Atlas
          </span>
          <span className="font-mono text-[10px]" style={{ color: "#4a4845" }}>
            {panels.length}n · {connections.length}w
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5">
          {actionBtn("Add node (Ctrl+K)", (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
              <rect x="2" y="2" width="5" height="5" rx="1"/>
              <rect x="9" y="2" width="5" height="5" rx="1"/>
              <rect x="2" y="9" width="5" height="5" rx="1"/>
              <rect x="9" y="9" width="5" height="5" rx="1"/>
            </svg>
          ))}
          {actionBtn("Sketch", (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1 1-8 8H4v-1l8-8z"/>
            </svg>
          ))}
          {actionBtn("Code", (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 4l-3 4 3 4M11 4l3 4-3 4"/>
            </svg>
          ))}
          {actionBtn("Notifications", (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M8 2a5 5 0 00-5 5v2l-1 2h12l-1-2V7a5 5 0 00-5-5zM7 13a1 1 0 002 0"/>
            </svg>
          ))}
          {actionBtn("Wires", (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 5h4a2 2 0 012 2v2a2 2 0 002 2h4"/>
            </svg>
          ))}
          {actionBtn("Spark", (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 2l-2 5h4l-2 7 5-8H9l2-4H9z"/>
            </svg>
          ))}
        </div>
      </div>

      {/* Input row */}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Ask Atlas anything  ·  # for snippets and commands"
          className="flex-1 min-w-0 bg-transparent border-none outline-none"
          style={{
            font: "13px/1 'Geist Variable', sans-serif",
            color: "#f5f5f5",
            caretColor: "#5b8def",
          }}
        />

        {/* Model picker */}
        <div className="relative shrink-0" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setShowModelPicker((v) => !v)}
            className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors duration-150 ease-out hover:border-[#3a3a3a]"
            style={{
              background: "#0d0d0d",
              borderColor: showModelPicker ? "#5b8def" : "#2e2e2e",
              font: "500 11px/1 'Geist Variable', monospace",
              color: "#888888",
              maxWidth: 160,
            }}
            title="Switch model"
          >
            <div className="h-[7px] w-[7px] rounded-full shrink-0" style={{ background: "#4db89a", boxShadow: "0 0 5px #4db89a" }} />
            <span className="truncate" style={{ maxWidth: 120 }}>
              {currentModelLabel || model.provider}
            </span>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="shrink-0">
              <path d={showModelPicker ? "M1.5 5l2.5-2 2.5 2" : "M1.5 3l2.5 2 2.5-2"}/>
            </svg>
          </button>

          {showModelPicker && (
            <div
              className="absolute bottom-full right-0 mb-2 rounded-[10px] border overflow-hidden"
              style={{
                background: "#111111",
                borderColor: "#2a2a2a",
                minWidth: 200,
                maxHeight: 240,
                overflowY: "auto",
                boxShadow: "0 12px 40px rgba(0,0,0,.6)",
                animation: "panel-in 150ms cubic-bezier(.2,.7,.2,1)",
              }}
            >
              <div className="px-3 py-2 border-b" style={{ borderColor: "#1e1e1e" }}>
                <span className="font-mono text-[9.5px] uppercase tracking-widest text-[#4a4845]">
                  {model.provider === "ollama" ? "Ollama models" : "LM Studio models"}
                </span>
              </div>
              {ollamaModels.length === 0 ? (
                <div className="px-3 py-3 font-mono text-[10px] text-[#555555]">
                  {model.provider !== "ollama"
                    ? "LM Studio models are set in Settings → Models"
                    : "No Ollama models found — is Ollama running?"}
                </div>
              ) : (
                ollamaModels.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => selectModel(name)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors duration-150 ease-out hover:bg-[#1a1a1a]"
                  >
                    {name === currentModelLabel && (
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="#5b8def" className="shrink-0">
                        <circle cx="4.5" cy="4.5" r="3"/>
                      </svg>
                    )}
                    {name !== currentModelLabel && <div className="w-[9px] shrink-0" />}
                    <span className="font-mono text-[11px] truncate" style={{ color: name === currentModelLabel ? "#f5f5f5" : "#888888" }}>
                      {name}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Mic */}
        <button
          type="button"
          className="flex items-center justify-center rounded-full border shrink-0 transition-colors duration-150 ease-out hover:text-[#888888]"
          style={{ width: 28, height: 28, background: "#0d0d0d", borderColor: "#2e2e2e", color: "#4a4845" }}
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <rect x="5.5" y="1" width="5" height="9" rx="2.5"/>
            <path d="M3 7.5A5 5 0 0013 7.5M8 12.5v2"/>
          </svg>
        </button>
      </div>

      {/* Quick-add row (hidden when typing) */}
      {!query && (
        <div className="flex items-center gap-1 pt-0.5">
          {QUICK_TYPES.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              onClick={() => onAdd?.(type)}
              className="font-mono text-[10px] px-2 py-0.5 rounded transition-colors duration-150 ease-out text-[#4a4845] hover:text-[#888888] hover:bg-[#1a1a1a]"
            >
              + {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
