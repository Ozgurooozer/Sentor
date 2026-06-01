import { useEffect, useRef, useState, useCallback } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useCanvasStore } from "./canvasStore";
import type { CanvasPanelNode } from "./types";

const ANIMS = [
  { id: "idle",      label: "Idle",      emoji: "💤" },
  { id: "thinking",  label: "Thinking",  emoji: "🤔" },
  { id: "working",   label: "Working",   emoji: "⌨️" },
  { id: "walk",      label: "Walk",      emoji: "🚶" },
  { id: "wave",      label: "Wave",      emoji: "👋" },
  { id: "celebrate", label: "Celebrate", emoji: "🎉" },
];

// Absolute path to the self-contained prototype HTML (no npm dep needed)
const PROTO_PATH = "C:\\Sentor\\prototypes\\stickman\\index.html";

export function StickManPanel({ panel }: { panel: CanvasPanelNode }) {
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const setOutputData = useCanvasStore((s) => s.setOutputData);

  const iframeRef    = useRef<HTMLIFrameElement>(null);
  const [activeAnim, setActiveAnim] = useState<string>(
    (panel.meta?.anim as string) ?? "idle",
  );
  const [bubbleText, setBubbleText] = useState<string>(
    (panel.meta?.text as string) ?? "",
  );
  const [capturing, setCapturing] = useState(false);

  // Convert to asset:// so Tauri's WebView can load the local file
  const src = convertFileSrc(PROTO_PATH);

  const postToBot = useCallback((msg: object) => {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  }, []);

  // When iframe loads, sync stored state into it
  const handleLoad = useCallback(() => {
    // small delay so the module finishes bootstrapping
    setTimeout(() => {
      postToBot({ type: "setAnimation", anim: activeAnim });
      if (bubbleText) postToBot({ type: "setSpeechText", text: bubbleText });
    }, 600);
  }, [activeAnim, bubbleText, postToBot]);

  // Listen for render results posted back from the iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== "render") return;
      const { dataUrl, anim } = e.data as { dataUrl: string; anim: string };
      // forward as wire output (other panels can consume this)
      setOutputData(panel.id, { kind: "image", value: dataUrl });
      // trigger browser download
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `sentorbot-${anim}-${Date.now()}.png`;
      a.click();
      setCapturing(false);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [panel.id, setOutputData]);

  const selectAnim = (id: string) => {
    setActiveAnim(id);
    updatePanel(panel.id, { meta: { ...panel.meta, anim: id } });
    postToBot({ type: "setAnimation", anim: id });
  };

  const handleBubble = (text: string) => {
    setBubbleText(text);
    updatePanel(panel.id, { meta: { ...panel.meta, text } });
    postToBot({ type: "setSpeechText", text });
  };

  const captureRender = () => {
    setCapturing(true);
    postToBot({ type: "capture" });
    // timeout fallback
    setTimeout(() => setCapturing(false), 4000);
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] select-none overflow-hidden">
      {/* iframe — hides native panel UI; only the 3D canvas shows */}
      <div className="relative flex-1 min-h-0">
        <iframe
          ref={iframeRef}
          src={src}
          title="SentorBot"
          onLoad={handleLoad}
          className="absolute inset-0 w-full h-full border-0"
          // hide the prototype's own side-panel; we provide our own controls
          style={{ clipPath: "inset(0 196px 0 0)" }}
          sandbox="allow-scripts allow-same-origin"
        />
        {capturing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-[#5b8def] text-xs tracking-widest">
            Capturing…
          </div>
        )}
      </div>

      {/* ── overlay controls (bottom strip) ── */}
      <div className="flex-shrink-0 border-t border-[#1e1e1e] bg-[#111] px-3 py-2 flex items-center gap-2 flex-wrap">
        {/* anim pills */}
        {ANIMS.map(({ id, label, emoji }) => (
          <button
            key={id}
            onClick={() => selectAnim(id)}
            className={[
              "text-[10px] px-2 py-1 rounded-md border transition-colors duration-150 ease-out",
              activeAnim === id
                ? "border-[#5b8def] bg-[#0d1a32] text-[#5b8def]"
                : "border-[#242424] text-[#555] hover:border-[#404040] hover:text-[#aaa]",
            ].join(" ")}
            title={label}
          >
            {emoji} {label}
          </button>
        ))}

        <div className="h-4 border-l border-[#222] mx-1" />

        {/* speech bubble */}
        <input
          type="text"
          value={bubbleText}
          onChange={(e) => handleBubble(e.target.value)}
          placeholder="Speech bubble…"
          className="flex-1 min-w-[100px] max-w-[200px] bg-[#161616] border border-[#222] text-[#aaa] text-[10px] px-2 py-1 rounded-md outline-none focus:border-[#5b8def] placeholder:text-[#333] transition-colors duration-150"
        />

        {/* render button */}
        <button
          onClick={captureRender}
          disabled={capturing}
          className="text-[10px] px-2 py-1 rounded-md border border-[#2a2a2a] text-[#666] hover:border-[#5b8def] hover:text-[#5b8def] transition-colors duration-150 disabled:opacity-40"
          title="Export PNG render"
        >
          📸
        </button>
      </div>
    </div>
  );
}
