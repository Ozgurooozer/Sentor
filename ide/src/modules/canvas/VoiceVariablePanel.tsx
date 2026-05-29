/**
 * VoiceVariablePanel — records speech via the browser's Web Speech API,
 * stores the final transcript in a named variableStore variable, and
 * emits it on the output wire.
 *
 * Phase M: "Voice Variable node"
 */
import { useCallback, useEffect, useState } from "react";
import { useSpeechRecognition } from "@/modules/ai/hooks/useSpeechRecognition";
import { useVariableStore } from "./variableStore";
import { useCanvasStore } from "./canvasStore";
import type { CanvasPanelNode } from "./types";

interface VoiceVariableMeta {
  varName: string;
  transcript: string;
  autoStore: boolean;
}

const DEFAULT_META: VoiceVariableMeta = {
  varName: "voiceInput",
  transcript: "",
  autoStore: true,
};

export function VoiceVariablePanel({ panel }: { panel: CanvasPanelNode }) {
  const updatePanel  = useCanvasStore((s) => s.updatePanel);
  const setOutputData = useCanvasStore((s) => s.setOutputData);
  const setVariable  = useVariableStore((s) => s.setVariable);

  const raw  = panel.meta as Partial<VoiceVariableMeta>;
  const meta: VoiceVariableMeta = { ...DEFAULT_META, ...raw };

  const patch = useCallback(
    (p: Partial<VoiceVariableMeta>) =>
      updatePanel(panel.id, { meta: { ...meta, ...p } }),
    [panel.id, meta, updatePanel],
  );

  const [liveText, setLiveText] = useState("");

  const { state, start, stop, supported } = useSpeechRecognition({
    onResult: (text) => {
      const next = meta.transcript ? `${meta.transcript} ${text}` : text;
      setLiveText(next);
      patch({ transcript: next });
    },
  });

  const isRecording = state === "recording";

  // Push transcript to wire + variable store whenever it changes.
  useEffect(() => {
    if (!meta.transcript) return;
    setOutputData(panel.id, { kind: "text", value: meta.transcript });
    if (meta.autoStore && meta.varName.trim()) {
      setVariable(meta.varName.trim(), meta.transcript, "text");
    }
  }, [meta.transcript, meta.autoStore, meta.varName, panel.id, setOutputData, setVariable]);

  const handleToggle = useCallback(() => {
    if (isRecording) {
      stop();
    } else {
      setLiveText(meta.transcript);
      void start();
    }
  }, [isRecording, start, stop, meta.transcript]);

  const handleClear = useCallback(() => {
    patch({ transcript: "" });
    setLiveText("");
    setOutputData(panel.id, { kind: "text", value: "" });
    if (meta.varName.trim()) setVariable(meta.varName.trim(), "", "text");
  }, [patch, panel.id, setOutputData, setVariable, meta.varName]);

  const accentColor = isRecording ? "#ef4444" : "#d4a843";

  return (
    <div
      className="flex h-full flex-col gap-0 overflow-hidden"
      style={{ background: "#111", color: "#f5f5f5", fontFamily: "system-ui" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Variable name row */}
      <div
        className="flex shrink-0 items-center gap-2 px-2.5 py-1.5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-widest" style={{ color: "#888" }}>
          var
        </span>
        <input
          value={meta.varName}
          onChange={(e) => patch({ varName: e.target.value })}
          placeholder="variableName"
          className="flex-1 rounded bg-transparent font-mono text-[11.5px] outline-none"
          style={{ color: "#d4a843", caretColor: "#d4a843" }}
          onPointerDown={(e) => e.stopPropagation()}
        />
        <label
          className="flex cursor-pointer items-center gap-1 text-[9.5px]"
          style={{ color: meta.autoStore ? "#d4a843" : "#555" }}
          title="Auto-store in variableStore on each result"
        >
          <input
            type="checkbox"
            checked={meta.autoStore}
            onChange={(e) => patch({ autoStore: e.target.checked })}
            className="accent-yellow-400"
            onPointerDown={(e) => e.stopPropagation()}
          />
          store
        </label>
      </div>

      {/* Record button */}
      <div className="flex shrink-0 flex-col items-center gap-1.5 py-3">
        {!supported ? (
          <span className="text-[10.5px]" style={{ color: "#666" }}>
            Web Speech API not available.{"\n"}Use the Audio panel + Whisper.
          </span>
        ) : (
          <button
            type="button"
            onClick={handleToggle}
            className="flex size-14 items-center justify-center rounded-full transition-all duration-150"
            style={{
              background: isRecording ? "rgba(239,68,68,0.12)" : "rgba(212,168,67,0.10)",
              border: `2px solid ${accentColor}`,
              color: accentColor,
              boxShadow: isRecording ? `0 0 12px rgba(239,68,68,0.3)` : "none",
            }}
            title={isRecording ? "Stop recording" : "Start recording"}
          >
            {isRecording ? (
              /* Stop square */
              <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
                <rect x="3" y="3" width="10" height="10" rx="1"/>
              </svg>
            ) : (
              /* Mic */
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <rect x="5" y="1" width="6" height="9" rx="3"/>
                <path d="M2 8a6 6 0 0012 0M8 14v2"/>
              </svg>
            )}
          </button>
        )}

        <span className="text-[9.5px]" style={{ color: isRecording ? "#ef4444" : "#555" }}>
          {isRecording ? "● recording" : state === "transcribing" ? "processing…" : "tap to record"}
        </span>
      </div>

      {/* Transcript area */}
      <div
        className="mx-2 mb-2 flex min-h-0 flex-1 flex-col gap-1 rounded-lg p-2"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[9.5px] uppercase tracking-widest" style={{ color: "#555" }}>transcript</span>
          {(meta.transcript || liveText) && (
            <button
              type="button"
              onClick={handleClear}
              className="text-[9.5px] transition-colors"
              style={{ color: "#444" }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              clear
            </button>
          )}
        </div>
        <div
          className="flex-1 overflow-y-auto font-sans text-[11px] leading-relaxed"
          style={{ color: meta.transcript ? "#e0e0e8" : "#444", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
        >
          {meta.transcript || (isRecording ? "Listening…" : "No transcript yet.")}
        </div>
      </div>
    </div>
  );
}
