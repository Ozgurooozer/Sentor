import { useEffect, useRef, useState } from "react";
import { useCanvasStore } from "./canvasStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useChatStore } from "@/modules/ai/store/chatStore";
import type { CanvasPanelNode } from "./types";

interface Props { panel: CanvasPanelNode; }

const STATUS_COLORS: Record<string, string> = {
  idle: "rgba(255,255,255,0.18)",
  running: "#d4a843",
  done: "#4db89a",
  error: "#ef5b5b",
};
const STATUS_LABELS: Record<string, string> = {
  idle: "waiting for input",
  running: "processing…",
  done: "done",
  error: "error",
};

export function PipePanel({ panel }: Props) {
  const connections = useCanvasStore((s) => s.connections);
  const panels      = useCanvasStore((s) => s.panels);
  const updatePanel = useCanvasStore((s) => s.updatePanel);

  const opencodeModel = usePreferencesStore((s) => s.opencodeChatModelId) || "deepseek-v4-flash-free";
  const apiKeys    = useChatStore((s) => s.apiKeys);

  const [prompt, setPrompt] = useState<string>((panel.meta?.pipePrompt as string) || "Translate to English:");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [output, setOutput] = useState<string>((panel.meta?.outputData as { value?: string })?.value ?? "");
  const lastInputRef = useRef<string>("");

  const inWire = connections.find((c) => c.toPanel === panel.id && c.toPort === "in");
  const upstreamPanel = inWire ? panels.find((p) => p.id === inWire.fromPanel) : null;
  const inputValue = (upstreamPanel?.meta?.outputData as { kind?: string; value?: unknown })?.value;
  const inputText  = typeof inputValue === "string" ? inputValue : "";

  useEffect(() => {
    if (!inputText || inputText === lastInputRef.current) return;
    lastInputRef.current = inputText;
    void run(inputText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputText]);

  const run = async (text: string) => {
    setStatus("running");
    try {
      const base = "https://opencode.ai/zen/v1".replace(/\/v1\/?$/, "");
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKeys.opencode ?? ""}`,
        },
        body: JSON.stringify({
          model: opencodeModel,
          messages: [{ role: "system", content: prompt }, { role: "user", content: text }],
          max_tokens: 1024,
        }),
      });
      const json = await res.json() as { choices?: { message?: { content?: string } }[] };
      const result = json.choices?.[0]?.message?.content?.trim() ?? "";
      setOutput(result);
      setStatus("done");
      updatePanel(panel.id, { meta: { ...panel.meta, pipePrompt: prompt, outputData: { kind: "text", value: result } } });
    } catch (err) {
      setStatus("error");
      console.error("[pipe]", err);
    }
  };

  const handlePromptChange = (val: string) => {
    setPrompt(val);
    updatePanel(panel.id, { meta: { ...panel.meta, pipePrompt: val } });
  };

  const sc = STATUS_COLORS[status] ?? STATUS_COLORS.idle;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Prompt section */}
      <div
        className="shrink-0 px-3 py-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div
          className="mb-1.5 font-mono text-[8.5px] uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.22)" }}
        >
          System prompt
        </div>
        <textarea
          value={prompt}
          onChange={(e) => handlePromptChange(e.target.value)}
          rows={2}
          className="w-full resize-none p-2 font-mono text-[10px] leading-relaxed outline-none placeholder:opacity-30 transition-colors duration-150"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 7,
            color: "#c8c8d0",
          }}
          placeholder="Describe the transformation…"
          onPointerDown={(e) => e.stopPropagation()}
        />
      </div>

      {/* Status row */}
      <div
        className="flex shrink-0 items-center justify-between px-3 py-1.5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="flex items-center gap-1.5">
          <div
            className="h-[5px] w-[5px] rounded-full transition-all duration-200"
            style={{
              background: sc,
              boxShadow: status !== "idle" ? `0 0 6px ${sc}88` : "none",
            }}
          />
          <span className="font-mono text-[9px]" style={{ color: "rgba(255,255,255,0.28)" }}>
            {inWire ? STATUS_LABELS[status] : "no wire connected"}
          </span>
        </div>

        <button
          type="button"
          disabled={!inputText || status === "running"}
          onClick={() => { if (inputText) void run(inputText); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="rounded-[6px] px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-widest transition-all duration-150 disabled:opacity-30"
          style={{
            background: "rgba(91,141,239,0.14)",
            color: "#5b8def",
            border: "1px solid rgba(91,141,239,0.28)",
          }}
        >
          ▶ run
        </button>
      </div>

      {/* Output */}
      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        {output ? (
          <p
            className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed"
            style={{ color: status === "error" ? "#ef8080" : "#a8c4e8" }}
          >
            {output}
          </p>
        ) : (
          <p
            className="font-mono text-[10px]"
            style={{ color: "rgba(255,255,255,0.15)" }}
          >
            Output will appear here…
          </p>
        )}
      </div>
    </div>
  );
}
