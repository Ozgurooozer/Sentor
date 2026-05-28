import { useState, useRef, useCallback, useEffect } from "react";
import { emit, emitTo } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { currentMonitor } from "@tauri-apps/api/window";
import { cn } from "@/lib/utils";
import { V3Cursor } from "./V3Cursor";
import { V3ProjectPanel } from "./V3ProjectPanel";
import { V3TtsOverlay } from "./V3TtsOverlay";
import { useProjectStore } from "./projectStore";
import { useOrkestraStore } from "@/modules/canvas/orkestraStore";

const TRANSCRIBE_ENDPOINT = "http://localhost:3001/transcribe";

async function transcribeBlob(blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("audio", blob, "recording.webm");
  fd.append("language", "tr");
  const res = await fetch(TRANSCRIBE_ENDPOINT, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`transcribe ${res.status}`);
  const { text, error } = await res.json() as { text?: string; error?: string };
  if (error) throw new Error(error);
  return text ?? "";
}

const PANEL_H    = 260;
const HISTORY_H  = 190;
// Match Rust: 40% of work area, clamped 480–620. Read from window at runtime.
function getBarW(): number { return Math.round(window.outerWidth) || 600; }

export function V3InputShell() {
  const [val, setVal]               = useState("");
  const [busy, setBusy]             = useState(false);
  const [panelOpen, setPanelOpen]   = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [canvasLinked, setCanvasLinked] = useState(
    () => localStorage.getItem("v3-canvas-linked") === "1"
  );
  const inputRef   = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const orkMessages = useOrkestraStore((s) => s.messages);
  const orkLoading  = useOrkestraStore((s) => s.loading);

  const [micState, setMicState]       = useState<"idle" | "recording" | "transcribing">("idle");
  const [audioLevel, setAudioLevel]   = useState(0);
  const [silenceProgress, setSilenceProgress] = useState(0);
  const [ttsEnabled, setTtsEnabled]   = useState(() => localStorage.getItem("v3-tts") === "1");
  const [ttsSpeaking, setTtsSpeaking] = useState(false);
  const [ttsOverlayOpen, setTtsOverlayOpen] = useState(false);
  const [vaultRoute, setVaultRoute]   = useState(false);
  const mrRef          = useRef<MediaRecorder | null>(null);
  const chunksRef      = useRef<Blob[]>([]);
  const analyserRef    = useRef<AnalyserNode | null>(null);
  const ctxRef         = useRef<AudioContext | null>(null);
  const rafRef         = useRef<number>(0);
  const prevLoadingRef = useRef(false);

  // ── TTS: speak last assistant message when loading ends ──────────────────
  useEffect(() => {
    if (ttsEnabled && prevLoadingRef.current && !orkLoading) {
      const last = orkMessages[orkMessages.length - 1];
      if (last?.role === "assistant" && last.content) {
        const clean = last.content.replace(/\{[^{}]{0,600}"tool"[^{}]{0,600}\}/gs, "").trim();
        if (clean) {
          const utt   = new SpeechSynthesisUtterance(clean);
          utt.lang    = "tr-TR";
          utt.rate    = 1.1;
          utt.onstart = () => setTtsSpeaking(true);
          utt.onend   = () => setTtsSpeaking(false);
          utt.onerror = () => setTtsSpeaking(false);
          speechSynthesis.cancel();
          speechSynthesis.speak(utt);
        }
      }
    }
    prevLoadingRef.current = orkLoading;
  }, [orkLoading, ttsEnabled, orkMessages]);

  // Release mic + AudioContext on unmount
  useEffect(() => {
    return () => {
      mrRef.current?.stop();
      cancelAnimationFrame(rafRef.current);
      analyserRef.current = null;
      if (ctxRef.current) { void ctxRef.current.close(); ctxRef.current = null; }
    };
  }, []);

  const toggleTts = useCallback(() => {
    setTtsEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("v3-tts", next ? "1" : "0");
      if (!next) { speechSynthesis.cancel(); setTtsSpeaking(false); setTtsOverlayOpen(false); }
      else setTtsOverlayOpen(true);
      return next;
    });
  }, []);

  // ── Audio level meter + VAD silence detection ─────────────────────────────
  const SPEECH_THRESHOLD = 0.055; // RMS level = "speaking"
  const SILENCE_MS       = 1200;  // ms of silence after speech → auto-stop

  const stopLevelMeter = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    analyserRef.current = null;
    if (ctxRef.current) { void ctxRef.current.close(); ctxRef.current = null; }
    setAudioLevel(0);
    setSilenceProgress(0);
  }, []);

  const startLevelMeter = useCallback((stream: MediaStream, onAutoStop: () => void) => {
    const ctx      = new AudioContext();
    ctxRef.current = ctx;
    const src      = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    analyserRef.current = analyser;
    const buf = new Uint8Array(analyser.frequencyBinCount);

    let hasSpeech   = false;
    let silenceStart: number | null = null;

    const tick = () => {
      if (!analyserRef.current) return;
      analyser.getByteFrequencyData(buf);
      const rms   = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length) / 128;
      const level = Math.min(1, rms * 2.5);
      setAudioLevel(level);

      if (rms > SPEECH_THRESHOLD) {
        hasSpeech   = true;
        silenceStart = null;
        setSilenceProgress(0);
      } else if (hasSpeech) {
        if (silenceStart === null) silenceStart = Date.now();
        const progress = Math.min(1, (Date.now() - silenceStart) / SILENCE_MS);
        setSilenceProgress(progress);
        if (progress >= 1) {
          analyserRef.current = null; // stop tick loop
          onAutoStop();
          return;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Send helpers ──────────────────────────────────────────────────────────
  const sendText = useCallback(async (text: string) => {
    if (!text || busy || orkLoading) return;
    if (canvasLinked) {
      await emit("atlas:canvas-prompt", { text }).catch((err) => {
        console.error("[V3:INPUT] canvas emit failed:", err);
      });
    } else {
      setBusy(true);
      try {
        await invoke("v3_show_output", { visible: true }).catch(() => {});
        const event = vaultRoute ? "atlas:v3-vault-message" : "atlas:v3-message";
        await emitTo("v3-output", event, { text });
      } finally {
        setBusy(false);
      }
    }
    inputRef.current?.focus();
  }, [busy, orkLoading, canvasLinked, vaultRoute]);

  // ── Mic recording (single click — VAD auto-stop → Whisper transcription) ───
  const toggleMic = useCallback(async () => {
    if (micState === "transcribing") return;
    if (micState === "recording") { mrRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mrRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        stopLevelMeter();
        setMicState("transcribing");
        try {
          const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
          const text = await transcribeBlob(blob);
          if (text) {
            setVal(text);
            await new Promise((r) => setTimeout(r, 1400));
            setVal("");
            void sendText(text);
          }
        } catch (err) {
          console.error("[V3:INPUT] transcription failed:", err);
          setVal("⚠ Ses tanıma başarısız");
          setTimeout(() => setVal(""), 2500);
        } finally { setMicState("idle"); }
      };
      mr.start();
      setMicState("recording");
      startLevelMeter(stream, () => mrRef.current?.stop());
    } catch (err) {
      console.error("[V3:INPUT] mic access failed:", err);
      setVal("⚠ Mikrofon erişimi reddedildi");
      setTimeout(() => setVal(""), 2000);
    }
  }, [micState, startLevelMeter, stopLevelMeter, sendText]);

  // Auto-open history when first canvas message arrives
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    const count = orkMessages.length;
    if (canvasLinked && count > 0 && !historyOpen && !panelOpen && prevMsgCountRef.current === 0) {
      setHistoryOpen(true);
      // Resize window to show history
      void (async () => {
        const win = getCurrentWindow();
        const curSize = await win.outerSize();
        const mon = await currentMonitor();
        const sf  = mon?.scaleFactor ?? 1;
        const curH = curSize.height / sf;
        await win.setSize(new LogicalSize(getBarW(), curH + HISTORY_H));
        const pos = await win.outerPosition();
        await win.setPosition(new PhysicalPosition(pos.x, Math.round((pos.y / sf - HISTORY_H) * sf)));
      })();
    }
    prevMsgCountRef.current = count;
  }, [orkMessages.length, canvasLinked, historyOpen, panelOpen]);

  // Scroll to bottom on new message
  useEffect(() => {
    if (historyOpen) {
      historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [orkMessages.length, historyOpen]);

  const toggleCanvasLink = useCallback(() => {
    const next = !canvasLinked;
    setCanvasLinked(next);
    localStorage.setItem("v3-canvas-linked", next ? "1" : "0");
    if (!next) {
      emit("atlas:canvas-unlink", {}).catch(() => {});
      setHistoryOpen(false);
    }
  }, [canvasLinked]);

  // Mark this window as V3 so globals.css clears the opaque body background
  useEffect(() => {
    document.documentElement.setAttribute("data-v3", "true");
    return () => document.documentElement.removeAttribute("data-v3");
  }, []);

  // Proje store hydrate
  useEffect(() => { void useProjectStore.getState().hydrate(); }, []);
  const activeProject = useProjectStore(s => s.getActive());

  // Pencereyi yeniden boyutlandır — iş alanı sınırlarını aşmaz
  const resizeWindow = useCallback(async (deltaH: number, growing: boolean) => {
    const win  = getCurrentWindow();
    const curr = await win.outerSize();
    const mon  = await currentMonitor();
    const sf   = mon?.scaleFactor ?? 1;
    const curH = curr.height / sf;
    const newH = curH + deltaH;

    // Work area top edge in logical pixels (prevent overflowing upward)
    const monTop    = (mon?.position.y ?? 0) / sf;
    const monH      = (mon?.size.height ?? 1080) / sf;
    // Estimate taskbar ~48px; use that as a floor for work area bottom
    const workTop   = monTop;
    const workH     = monH - 48;

    const pos    = await win.outerPosition();
    const curY   = pos.y / sf;
    const newY   = growing ? curY - deltaH : curY + deltaH;
    const clampY = Math.max(workTop + 4, Math.min(newY, workTop + workH - newH - 4));

    await win.setSize(new LogicalSize(getBarW(), newH));
    await win.setPosition(new PhysicalPosition(pos.x, Math.round(clampY * sf)));
  }, []);

  // Panel açılınca pencereyi yukarı doğru genişlet
  const togglePanel = useCallback(async () => {
    const opening = !panelOpen;
    setPanelOpen(opening);
    // Close history if opening project panel
    if (opening && historyOpen) {
      setHistoryOpen(false);
      await resizeWindow(PANEL_H - HISTORY_H, true);
    } else {
      await resizeWindow(PANEL_H, opening);
    }
    if (!opening) inputRef.current?.focus();
  }, [panelOpen, historyOpen, resizeWindow]);

  // Toggle canvas history panel
  const toggleHistory = useCallback(async () => {
    if (panelOpen) return; // don't overlap with project panel
    const opening = !historyOpen;
    setHistoryOpen(opening);
    await resizeWindow(HISTORY_H, opening);
    if (!opening) inputRef.current?.focus();
  }, [historyOpen, panelOpen, resizeWindow]);

  const send = async () => {
    const text = val.trim();
    if (!text) return;
    setVal("");
    await sendText(text);
  };

  const startDrag = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    void getCurrentWindow().startDragging();
  }, []);

  return (
    <>
      {ttsOverlayOpen && (
        <V3TtsOverlay
          speaking={ttsSpeaking}
          onClose={() => setTtsOverlayOpen(false)}
        />
      )}
      <V3Cursor />
      <div
        className="flex h-screen w-screen flex-col"
        style={{
          background: "rgba(6,6,8,0.88)",           // bg-void #060608
          backdropFilter: "blur(28px) saturate(160%)",
          WebkitBackdropFilter: "blur(28px) saturate(160%)",
          borderRadius: 12,
          border: canvasLinked ? "1px solid rgba(77,184,154,0.30)" : "1px solid rgba(255,255,255,0.08)",
          transition: "border-color 250ms ease",
          fontFamily: '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
          fontFeatureSettings: '"ss01", "cv01"',
        }}
      >
        {/* ── Proje paneli — bar genişleyince görünür ─────────────────── */}
        {panelOpen && (
          <div className="flex-1 overflow-hidden" style={{ animation: "v3-fadein 0.15s ease" }}>
            <V3ProjectPanel onClose={() => void togglePanel()} />
          </div>
        )}

        {/* ── Canvas AI geçmişi — canvas-linked iken görünür ────────── */}
        {canvasLinked && historyOpen && orkMessages.length > 0 && (
          <div
            ref={historyRef}
            style={{
              height: HISTORY_H,
              overflowY: "auto",
              borderTop: "1px solid rgba(255,255,255,0.05)",
              padding: "10px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              scrollbarWidth: "none",
            }}
          >
            {orkMessages.slice(-20).map((msg) => (
              <div key={msg.id} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{
                  fontFamily: "monospace", fontSize: 9, letterSpacing: "0.05em",
                  color: msg.role === "user" ? "rgba(91,141,239,0.55)" : "rgba(77,184,154,0.45)",
                }}>
                  {msg.role === "user" ? "▸ sen" : "◂ atlas"}
                </span>
                {msg.content && (
                  <div style={{
                    fontFamily: "system-ui", fontSize: 12, lineHeight: 1.5,
                    color: msg.role === "user" ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.50)",
                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    {msg.content.replace(/\{[^{}]{0,600}"tool"[^{}]{0,600}\}/gs, "").trim()}
                  </div>
                )}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                    {msg.toolCalls.map((tc) => (
                      <span key={tc.id} style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "1px 7px", borderRadius: 4, fontFamily: "monospace", fontSize: 10,
                        background: tc.status === "done" ? "rgba(77,184,154,0.08)" : tc.status === "error" ? "rgba(224,90,60,0.08)" : "rgba(91,141,239,0.08)",
                        border: `1px solid ${tc.status === "done" ? "rgba(77,184,154,0.22)" : tc.status === "error" ? "rgba(224,90,60,0.22)" : "rgba(91,141,239,0.22)"}`,
                        color:  tc.status === "done" ? "#4db89a" : tc.status === "error" ? "#e05a3c" : "#5b8def",
                      }}>
                        {tc.status === "running" ? "⟳ " : tc.status === "done" ? "✓ " : "✗ "}
                        {tc.tool}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {orkLoading && (
              <div style={{ display: "flex", gap: 4, alignItems: "center", paddingLeft: 2 }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{
                    width: 4, height: 4, borderRadius: "50%",
                    background: "rgba(91,141,239,0.45)",
                    animation: `atlas-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Input bar — her zaman altta ─────────────────────────────── */}
        <div
          className="flex h-[52px] shrink-0 items-center"
          style={{ borderTop: panelOpen ? "1px solid rgba(255,255,255,0.06)" : "none" }}
        >
          {/* Proje butonu — drag handle + project switcher */}
          <div
            className="flex h-full w-9 shrink-0 cursor-grab select-none items-center justify-center active:cursor-grabbing"
            style={{ borderRight: "1px solid rgba(255,255,255,0.04)" }}
            onMouseDown={startDrag}
          >
            <button
              type="button"
              onMouseDown={e => e.stopPropagation()}
              onClick={() => void togglePanel()}
              className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] transition-all hover:opacity-80"
              style={{
                background: panelOpen
                  ? `rgba(${hexToRgb(activeProject.color)},0.25)`
                  : "linear-gradient(135deg,#5b8def,#9b72ef)",
                border: panelOpen ? `1px solid rgba(${hexToRgb(activeProject.color)},0.4)` : "none",
              }}
              title={activeProject.name}
            >
              {panelOpen
                ? <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2 8l4-4 4 4" stroke="white" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                : <span className="text-[11px] font-bold text-white">A</span>
              }
            </button>
          </div>

          {/* Proje adı (kısa) + input */}
          <div className="flex flex-1 items-center gap-2 px-3">
            {!panelOpen && (
              <span
                className="shrink-0 truncate text-[10px] font-medium"
                style={{ color: activeProject.color, maxWidth: 72 }}
              >
                {activeProject.name}
              </span>
            )}
            <input
              ref={inputRef}
              type="text"
              value={val}
              onChange={e => setVal(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") void send(); }}
              placeholder={canvasLinked ? "Canvas'ı yönet — node ekle, bağla, çalıştır…" : vaultRoute ? "Vault'a yaz — Atlas-Maker sayfa oluşturacak…" : "Atlas'a bir şey sor…"}
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-[13.5px] text-[#e8e8ec] outline-none placeholder:text-[#2e2e3a]"
              style={{ caretColor: "#5b8def" }}
            />
          </div>

          {/* Sağ: canvas link + geçmiş + gönder + küçült + kapat */}
          <div className="flex shrink-0 items-center gap-1 px-2">

            {/* Canvas history toggle — only shown when linked */}
            {canvasLinked && orkMessages.length > 0 && (
              <button
                type="button"
                onClick={() => void toggleHistory()}
                title={historyOpen ? "Geçmişi gizle" : "Konuşmayı göster"}
                className="flex h-[28px] w-[28px] items-center justify-center rounded-full transition-all duration-150"
                style={{
                  background: historyOpen ? "rgba(91,141,239,0.15)" : "rgba(255,255,255,0.03)",
                  color:      historyOpen ? "#5b8def" : "#555",
                  border:     `1px solid ${historyOpen ? "rgba(91,141,239,0.30)" : "rgba(255,255,255,0.05)"}`,
                }}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <path d="M1 3h10M1 6h8M1 9h6"/>
                </svg>
              </button>
            )}

            {/* Vault-route toggle — routes text to Atlas-Maker instead of normal chat */}
            {!canvasLinked && (
              <button
                type="button"
                onClick={() => setVaultRoute((v) => !v)}
                title={vaultRoute ? "Vault modunu kapat" : "Vault modu — ses/yazı Atlas-Maker'a gönderilir"}
                className="flex h-[28px] w-[28px] items-center justify-center rounded-full transition-all duration-150"
                style={{
                  background: vaultRoute ? "rgba(155,114,239,0.15)" : "rgba(255,255,255,0.03)",
                  color:      vaultRoute ? "#9b72ef" : "#2e2e3a",
                  border:     `1px solid ${vaultRoute ? "rgba(155,114,239,0.35)" : "rgba(255,255,255,0.05)"}`,
                }}
                onMouseEnter={(e) => { if (!vaultRoute) (e.currentTarget as HTMLElement).style.color = "#888"; }}
                onMouseLeave={(e) => { if (!vaultRoute) (e.currentTarget as HTMLElement).style.color = "#2e2e3a"; }}
              >
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 1l1.5 4h4l-3 2.5 1 4L7 9l-3.5 2.5 1-4L1.5 5H6z"/>
                </svg>
              </button>
            )}

            {/* Canvas link toggle */}
            <button
              type="button"
              onClick={toggleCanvasLink}
              title={canvasLinked ? "Canvas'tan bağlantıyı kes" : "Canvas'a bağlan — konuşarak canvas'ı yönet"}
              className="flex h-[28px] w-[28px] items-center justify-center rounded-full transition-all duration-150"
              style={{
                background: canvasLinked ? "rgba(77,184,154,0.15)" : "rgba(255,255,255,0.03)",
                color:      canvasLinked ? "#4db89a" : "#2e2e3a",
                border:     `1px solid ${canvasLinked ? "rgba(77,184,154,0.35)" : "rgba(255,255,255,0.05)"}`,
              }}
              onMouseEnter={(e) => { if (!canvasLinked) (e.currentTarget as HTMLElement).style.color = "#888"; }}
              onMouseLeave={(e) => { if (!canvasLinked) (e.currentTarget as HTMLElement).style.color = "#2e2e3a"; }}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="1" width="12" height="12" rx="2"/>
                <path d="M4 5h6M4 7h4M4 9h2"/>
              </svg>
            </button>

            {/* TTS toggle */}
            <button
              type="button"
              onClick={toggleTts}
              title={ttsEnabled ? "Sesli yanıtı kapat" : "Sesli yanıtı aç"}
              className="flex h-[28px] w-[28px] items-center justify-center rounded-full transition-all duration-150"
              style={{
                background: ttsEnabled ? "rgba(155,114,239,0.15)" : "rgba(255,255,255,0.03)",
                color:      ttsEnabled ? "#9b72ef" : "#2e2e3a",
                border:     `1px solid ${ttsEnabled ? "rgba(155,114,239,0.35)" : "rgba(255,255,255,0.05)"}`,
              }}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6H1v4h2l4 3V3L3 6z"/>
                {ttsEnabled
                  ? <path d="M11 5a4 4 0 010 6M13.5 3a7 7 0 010 10"/>
                  : <path d="M13 5l-4 6"/>
                }
              </svg>
            </button>

            {/* Mic button with VAD silence-countdown arc */}
            <button
              type="button"
              onClick={() => void toggleMic()}
              title={
                micState === "recording"
                  ? silenceProgress > 0 ? "Sessizlik algılandı — durduruyor…" : "Konuşuyor — susunca otomatik gönderilir"
                  : micState === "transcribing" ? "Yazıya döküyor…"
                  : "Sesli giriş — bir kez bas, sus, gönderilir"
              }
              className="relative flex h-[28px] w-[28px] items-center justify-center rounded-full"
              style={{
                transition: "background 80ms ease-out, border-color 80ms ease-out, box-shadow 80ms ease-out",
                background: micState === "recording"
                  ? `rgba(224,90,60,${0.12 + audioLevel * 0.30})`
                  : micState === "transcribing"
                    ? "rgba(91,141,239,0.12)"
                    : "rgba(255,255,255,0.03)",
                color: micState === "recording"
                  ? `rgb(${Math.round(224 + audioLevel * 20)},${Math.round(90 - audioLevel * 20)},60)`
                  : micState === "transcribing"
                    ? "#5b8def"
                    : "#2e2e3a",
                border: micState === "recording"
                  ? `1px solid rgba(224,90,60,${0.25 + audioLevel * 0.55})`
                  : micState === "transcribing"
                    ? "1px solid rgba(91,141,239,0.25)"
                    : "1px solid rgba(255,255,255,0.05)",
                boxShadow: micState === "recording" && audioLevel > 0.15
                  ? `0 0 ${Math.round(audioLevel * 14)}px rgba(224,90,60,${audioLevel * 0.55})`
                  : "none",
              }}
            >
              {/* Silence countdown arc — appears when user stops speaking */}
              {micState === "recording" && silenceProgress > 0 && (
                <svg
                  style={{ position: "absolute", inset: -1, pointerEvents: "none" }}
                  width="30" height="30" viewBox="0 0 30 30"
                >
                  <circle
                    cx="15" cy="15" r="13"
                    fill="none"
                    stroke="rgba(224,90,60,0.75)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray={`${81.7 * (1 - silenceProgress)} 81.7`}
                    transform="rotate(-90 15 15)"
                  />
                </svg>
              )}
              {micState === "transcribing" ? (
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M8 2v4M8 10v4M2 8h4M10 8h4" style={{ animation: "atlas-pulse 1s ease-in-out infinite" }} />
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="1" width="6" height="9" rx="3"
                    fill={micState === "recording" ? `rgba(224,90,60,${0.15 + audioLevel * 0.35})` : "none"}
                  />
                  <path d="M3 8a5 5 0 0010 0M8 13v2M5 15h6" />
                </svg>
              )}
            </button>

            <button
              type="button"
              onClick={() => void send()}
              disabled={!val.trim() || busy}
              className={cn(
                "flex h-[28px] w-[28px] items-center justify-center rounded-full transition-all duration-150",
                val.trim() && !busy
                  ? canvasLinked
                    ? "bg-[rgba(77,184,154,0.18)] text-[#4db89a] hover:bg-[rgba(77,184,154,0.32)]"
                    : "bg-[rgba(91,141,239,0.18)] text-[#5b8def] hover:bg-[rgba(91,141,239,0.32)]"
                  : "text-[#252530]",
              )}
            >
              {busy
                ? <span className="size-1.5 animate-pulse rounded-full" style={{ background: canvasLinked ? "#4db89a" : "#5b8def" }} />
                : <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M8 13V3M3 8l5-5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
              }
            </button>
            <button
              type="button"
              onClick={() => void getCurrentWindow().minimize()}
              className="flex h-[22px] w-[22px] items-center justify-center rounded text-[#333] transition-colors hover:bg-white/5 hover:text-[#888]"
              title="Küçült"
            >
              <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
                <path d="M0 1h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </button>
            <button
              type="button"
              onClick={() => void getCurrentWindow().close()}
              className="flex h-[22px] w-[22px] items-center justify-center rounded text-[#333] transition-colors hover:bg-[rgba(255,70,70,0.12)] hover:text-[#ff4646]"
              title="Kapat"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function hexToRgb(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
