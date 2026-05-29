import { useRef, useState, useEffect, useCallback } from "react";
import { useOrkestraStore } from "@/modules/canvas/orkestraStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { getModel, OPENCODE_DEFAULT_BASE_URL } from "@/modules/ai/config";
import { useChatStore } from "@/modules/ai/store/chatStore";

const TRANSCRIBE_ENDPOINT = "http://localhost:3001/transcribe";

async function transcribeBlob(blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("audio", blob, "recording.webm");
  const res = await fetch(TRANSCRIBE_ENDPOINT, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`transcribe ${res.status}`);
  const data = await res.json() as { text?: string; error?: string };
  if (data.error) throw new Error(data.error);
  return data.text ?? "";
}

const MAX_HISTORY = 40;

function ToolBadge({ tool, status }: { tool: string; status: "running" | "done" | "error" }) {
  const colors = {
    running: { bg: "rgba(91,141,239,0.10)", border: "rgba(91,141,239,0.25)", text: "#5b8def" },
    done:    { bg: "rgba(77,184,154,0.08)", border: "rgba(77,184,154,0.22)", text: "#4db89a" },
    error:   { bg: "rgba(224,90,60,0.08)",  border: "rgba(224,90,60,0.22)",  text: "#e05a3c" },
  }[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "1px 7px", borderRadius: 4,
      background: colors.bg, border: `1px solid ${colors.border}`,
      color: colors.text, fontFamily: "monospace", fontSize: 10,
    }}>
      {status === "running" && <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>}
      {status === "done"    && "✓"}
      {status === "error"   && "✗"}
      {" "}{tool}
    </span>
  );
}

export function V3OrkPanel() {
  const messages  = useOrkestraStore((s) => s.messages);
  const loading   = useOrkestraStore((s) => s.loading);
  const collapsed = useOrkestraStore((s) => s.collapsed);
  const v3Active  = useOrkestraStore((s) => s.v3InputActive);
  const send      = useOrkestraStore((s) => s.send);
  const setCollapsed = useOrkestraStore((s) => s.setCollapsed);
  const clearMessages = useOrkestraStore((s) => s.clearMessages);

  const selectedModelId = useChatStore((s) => s.selectedModelId);
  const apiKeys     = useChatStore((s) => s.apiKeys);
  const opencodeModel = usePreferencesStore((s) => s.opencodeChatModelId) || "deepseek-v4-flash-free";

  const [input, setInput] = useState("");
  const [micState, setMicState] = useState<"idle" | "recording" | "transcribing">("idle");
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const mrRef      = useRef<MediaRecorder | null>(null);
  const chunksRef  = useRef<Blob[]>([]);

  const toggleMic = useCallback(async () => {
    if (micState === "recording") {
      mrRef.current?.stop();
      return;
    }
    if (micState === "transcribing") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mrRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setMicState("transcribing");
        try {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const text = await transcribeBlob(blob);
          if (text) setInput((prev) => prev ? prev + " " + text : text);
          inputRef.current?.focus();
        } catch (err) {
          console.error("transcribe error", err);
        } finally {
          setMicState("idle");
        }
      };
      mr.start();
      setMicState("recording");
    } catch (err) {
      console.error("mic error", err);
    }
  }, [micState]);

  const model = getModel(selectedModelId);

  const recent = messages.slice(-MAX_HISTORY);

  useEffect(() => {
    if (!collapsed) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, collapsed]);

  const handleSend = () => {
    const t = input.trim();
    if (!t || loading) return;
    setInput("");
    setCollapsed(false);
    void send(t, model.provider, "", "", "", "", apiKeys.opencode ?? "", OPENCODE_DEFAULT_BASE_URL, opencodeModel);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === "Escape") setCollapsed(true);
  };

  // Pill (collapsed)
  if (collapsed) {
    return (
      <div
        onClick={() => { setCollapsed(false); setTimeout(() => inputRef.current?.focus(), 50); }}
        style={{
          position: "absolute", bottom: 16, left: 16, zIndex: 50,
          display: "flex", alignItems: "center", gap: 7,
          padding: "6px 14px",
          background: "rgba(8,8,14,0.82)",
          backdropFilter: "blur(20px) saturate(160%)",
          border: v3Active
            ? "1px solid rgba(77,184,154,0.35)"
            : "1px solid rgba(255,255,255,0.07)",
          borderRadius: 24, cursor: "pointer",
          transition: "border-color 150ms ease-out",
        }}
      >
        {loading && (
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#5b8def", animation: "atlas-pulse 1s ease-in-out infinite", flexShrink: 0 }} />
        )}
        {!loading && v3Active && (
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4db89a", flexShrink: 0 }} />
        )}
        {!loading && !v3Active && (
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.18)", flexShrink: 0 }} />
        )}
        <span style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: "0.03em" }}>
          {loading ? "düşünüyor…" : v3Active ? "V3 bağlı" : "Orkestra"}
        </span>
        {messages.length > 0 && (
          <span style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.20)" }}>
            {messages.length}
          </span>
        )}
      </div>
    );
  }

  // Expanded panel
  return (
    <div
      style={{
        position: "absolute", bottom: 16, left: 16, zIndex: 50,
        width: 340, maxWidth: "calc(100vw - 32px)",
        display: "flex", flexDirection: "column",
        background: "rgba(8,8,14,0.90)",
        backdropFilter: "blur(28px) saturate(160%)",
        border: v3Active
          ? "1px solid rgba(77,184,154,0.30)"
          : "1px solid rgba(255,255,255,0.07)",
        borderRadius: 14,
        overflow: "hidden",
        transition: "border-color 150ms ease-out",
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {v3Active && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "1px 8px", borderRadius: 4,
              background: "rgba(77,184,154,0.10)", border: "1px solid rgba(77,184,154,0.22)",
              fontFamily: "monospace", fontSize: 9, color: "#4db89a",
            }}>
              <span className="animate-pulse" style={{ width: 5, height: 5, borderRadius: "50%", background: "#4db89a", flexShrink: 0, display: "inline-block" }} />
              V3 bağlı
            </span>
          )}
          {!v3Active && (
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.30)", letterSpacing: "0.05em" }}>
              ORKESTRA
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.20)", fontSize: 10, padding: "2px 4px", borderRadius: 3, transition: "color 150ms ease-out" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.20)")}
              title="Temizle"
            >
              ✕
            </button>
          )}
          <button
            onClick={() => setCollapsed(true)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.20)", fontSize: 11, padding: "2px 4px", borderRadius: 3, lineHeight: 1, transition: "color 150ms ease-out" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.50)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.20)")}
            title="Küçült"
          >
            ─
          </button>
        </div>
      </div>

      {/* Messages */}
      {recent.length > 0 && (
        <div style={{
          maxHeight: 260, overflowY: "auto",
          padding: "10px 12px",
          display: "flex", flexDirection: "column", gap: 8,
          scrollbarWidth: "none",
        }}>
          {recent.map((msg) => (
            <div key={msg.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {/* Role label */}
              <span style={{
                fontFamily: "monospace", fontSize: 9,
                color: msg.role === "user" ? "rgba(91,141,239,0.60)" : "rgba(77,184,154,0.50)",
                letterSpacing: "0.05em",
              }}>
                {msg.role === "user" ? "sen" : "atlas"}
              </span>

              {/* Content */}
              {msg.content && (
                <div style={{
                  fontFamily: "system-ui", fontSize: 12, lineHeight: 1.55,
                  color: msg.role === "user" ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.55)",
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  {msg.content.replace(/\{[^{}]{0,400}"tool"[^{}]{0,400}\}/g, "").trim()}
                </div>
              )}

              {/* Tool calls */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                  {msg.toolCalls.map((tc) => (
                    <ToolBadge key={tc.id} tool={tc.tool} status={tc.status} />
                  ))}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{
                  width: 4, height: 4, borderRadius: "50%",
                  background: "rgba(91,141,239,0.50)",
                  animation: `atlas-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Empty state */}
      {recent.length === 0 && (
        <div style={{
          padding: "16px 12px",
          fontFamily: "monospace", fontSize: 11,
          color: "rgba(255,255,255,0.15)",
          textAlign: "center",
        }}>
          canvas'ı yönet — node ekle, bağla, çalıştır
        </div>
      )}

      {/* Input */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 10px",
        borderTop: "1px solid rgba(255,255,255,0.04)",
        flexShrink: 0,
      }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder={v3Active ? "atlas input'tan bağlı…" : "node ekle, bağla, çalıştır…"}
          disabled={loading}
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            fontFamily: "system-ui", fontSize: 12,
            color: "rgba(255,255,255,0.75)",
            caretColor: "#5b8def",
          }}
        />
        {/* Mic button */}
        <button
          onClick={() => void toggleMic()}
          title={micState === "recording" ? "Kaydı durdur" : micState === "transcribing" ? "Yazıya döküyor…" : "Sesli giriş"}
          style={{
            background: "none", border: "none", flexShrink: 0,
            cursor: micState === "transcribing" ? "default" : "pointer",
            padding: "2px 4px", lineHeight: 1,
            color: micState === "recording"
              ? "#e05a3c"
              : micState === "transcribing"
                ? "#5b8def"
                : "rgba(255,255,255,0.20)",
            transition: "color 150ms ease-out",
          }}
        >
          {micState === "transcribing" ? (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <circle cx="8" cy="8" r="6" strokeDasharray="3 2" style={{ animation: "spin 1.2s linear infinite", transformOrigin: "center" }} />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="1" width="6" height="9" rx="3"
                fill={micState === "recording" ? "rgba(224,90,60,0.25)" : "none"}
              />
              <path d="M3 8a5 5 0 0010 0M8 13v2M5 15h6" />
            </svg>
          )}
        </button>

        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          style={{
            background: "none", border: "none", cursor: input.trim() && !loading ? "pointer" : "default",
            color: input.trim() && !loading ? "#5b8def" : "rgba(255,255,255,0.15)",
            fontSize: 14, lineHeight: 1, padding: "2px 4px", flexShrink: 0,
            transition: "color 150ms ease-out",
          }}
          title="Gönder (Enter)"
        >
          ↵
        </button>
      </div>
    </div>
  );
}
