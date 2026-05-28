/**
 * CanvasOrkestraBar — floating bottom input bar in canvas mode.
 * Sends commands to OrkestraStore (canvas AI). Replaces the need for
 * the separate V3InputShell window when running in standard canvas mode.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useOrkestraStore } from "./orkestraStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useChatStore } from "@/modules/ai";
import { getModel } from "@/modules/ai/config";

const MAX_VISIBLE_MSGS = 5;

export function CanvasOrkestraBar() {
  const [val, setVal]         = useState("");
  const [expanded, setExpanded] = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);
  const msgsRef   = useRef<HTMLDivElement>(null);

  const messages  = useOrkestraStore((s) => s.messages);
  const loading   = useOrkestraStore((s) => s.loading);
  const send      = useOrkestraStore((s) => s.send);

  const selectedModelId = useChatStore((s) => s.selectedModelId);
  const ollamaBase  = usePreferencesStore((s) => s.ollamaBaseURL)       || "http://localhost:11434";
  const lmBase      = usePreferencesStore((s) => s.lmstudioBaseURL)     || "http://localhost:1234";
  const ollamaModel = usePreferencesStore((s) => s.ollamaChatModelId)   || "llama3.2";
  const lmModel     = usePreferencesStore((s) => s.lmstudioChatModelId) || "local-model";

  // Scroll messages to bottom when new arrive
  useEffect(() => {
    if (msgsRef.current) {
      msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-expand when a response arrives
  useEffect(() => {
    if (messages.length > 0) setExpanded(true);
  }, [messages.length]);

  const handleSend = useCallback(() => {
    const text = val.trim();
    if (!text || loading) return;
    setVal("");
    const model = getModel(selectedModelId);
    void send(text, model.provider, ollamaBase, lmBase, ollamaModel, lmModel);
  }, [val, loading, send, selectedModelId, ollamaBase, lmBase, ollamaModel, lmModel]);

  const visibleMsgs = messages.slice(-MAX_VISIBLE_MSGS);
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  const accent = "#5b8def";

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        width: "min(600px, 92vw)",
        pointerEvents: "none",
      }}
    >
      {/* Messages panel — shown when expanded */}
      {expanded && messages.length > 0 && (
        <div
          ref={msgsRef}
          style={{
            width: "100%",
            maxHeight: 260,
            overflowY: "auto",
            background: "rgba(8, 8, 14, 0.92)",
            backdropFilter: "blur(24px) saturate(160%)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12,
            padding: "8px 0",
            pointerEvents: "auto",
          }}
        >
          {visibleMsgs.map((msg) => (
            <div
              key={msg.id}
              style={{
                padding: "4px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span style={{
                fontSize: 9,
                color: msg.role === "user" ? accent : "#4db89a",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontFamily: "system-ui",
              }}>
                {msg.role === "user" ? "sen" : "orkestra"}
              </span>
              <span style={{
                fontSize: 12,
                color: msg.role === "user" ? "rgba(255,255,255,0.7)" : "#c8c8d0",
                fontFamily: "system-ui",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                {msg.content || (msg.toolCalls?.length
                  ? msg.toolCalls.map((t) =>
                      `[${t.tool}${t.result ? ` → ${t.result.slice(0, 60)}` : ""}]`
                    ).join(" ")
                  : "…"
                )}
              </span>
            </div>
          ))}
          {loading && (
            <div style={{ padding: "4px 14px" }}>
              <span style={{
                fontSize: 11,
                color: "#4db89a",
                fontFamily: "system-ui",
                opacity: 0.7,
                animation: "pulse 1.2s ease-in-out infinite",
              }}>
                düşünüyor…
              </span>
            </div>
          )}
        </div>
      )}

      {/* Input bar */}
      <div
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "rgba(8, 8, 14, 0.90)",
          backdropFilter: "blur(24px) saturate(160%)",
          border: `1px solid ${loading ? accent + "50" : "rgba(255,255,255,0.08)"}`,
          borderRadius: 12,
          padding: "6px 8px 6px 14px",
          pointerEvents: "auto",
          transition: "border-color 150ms ease-out",
        }}
      >
        {/* Collapse/expand toggle */}
        {messages.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.3)",
              fontSize: 10,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              padding: 0,
            }}
            title={expanded ? "Kapat" : "Aç"}
          >
            {expanded ? "▼" : "▲"}
          </button>
        )}

        {/* Loading indicator */}
        {loading && (
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "#4db89a",
            flexShrink: 0,
            boxShadow: "0 0 6px #4db89a",
          }} />
        )}

        {/* Text input */}
        <input
          ref={inputRef}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={loading ? "yanıt bekleniyor…" : "canvas'a komut ver…"}
          disabled={loading}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: loading ? "rgba(255,255,255,0.4)" : "#e8e8ec",
            fontSize: 13,
            fontFamily: "system-ui",
            caretColor: accent,
          }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!val.trim() || loading}
          style={{
            padding: "4px 12px",
            borderRadius: 7,
            background: val.trim() && !loading ? `${accent}20` : "transparent",
            border: `1px solid ${val.trim() && !loading ? `${accent}50` : "rgba(255,255,255,0.06)"}`,
            color: val.trim() && !loading ? accent : "rgba(255,255,255,0.2)",
            fontSize: 11,
            fontFamily: "system-ui",
            cursor: val.trim() && !loading ? "pointer" : "default",
            transition: "all 150ms ease-out",
            flexShrink: 0,
          }}
        >
          ↵
        </button>
      </div>

      {/* Last response sneak peek (when collapsed) */}
      {!expanded && lastAssistant && (
        <div
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.3)",
            fontFamily: "system-ui",
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            padding: "0 4px",
          }}
        >
          {lastAssistant.content.slice(0, 80)}
        </div>
      )}
    </div>
  );
}
