import { useState, useRef, useCallback, useEffect } from "react";
import { emit, emitTo, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { currentMonitor } from "@tauri-apps/api/window";
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
  const [linkedCanvasId, setLinkedCanvasId] = useState<string | null>(
    () => localStorage.getItem("v3-linked-canvas-id") ?? null,
  );
  const [canvasList, setCanvasList] = useState<{ id: string; title: string }[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const BASE_H   = 52;
  const PICKER_H = 196;

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

  // ── Canvas list from main window ─────────────────────────────────────────
  useEffect(() => {
    const unsubP = listen<{ canvases: { id: string; title: string }[] }>(
      "atlas:canvas-list",
      ({ payload }) => setCanvasList(payload.canvases),
    );
    void emit("atlas:request-canvases", {}).catch(() => {});
    return () => { void unsubP.then(fn => fn()); };
  }, []);

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
   
  }, []);

  // ── Send helpers ──────────────────────────────────────────────────────────
  const sendText = useCallback(async (text: string) => {
    if (!text || busy || orkLoading) return;
    if (linkedCanvasId !== null) {
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
  }, [busy, orkLoading, linkedCanvasId, vaultRoute]);

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

  // Scroll to bottom on new message
  useEffect(() => {
    if (historyOpen) {
      historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [orkMessages.length, historyOpen]);

  // Mark this window as V3 so globals.css clears the opaque body background
  useEffect(() => {
    document.documentElement.setAttribute("data-v3", "true");
    return () => document.documentElement.removeAttribute("data-v3");
  }, []);

  // Proje store hydrate
  useEffect(() => { void useProjectStore.getState().hydrate(); }, []);
  const activeProject = useProjectStore(s => s.getActive());

  const resizeTo = useCallback(async (targetH: number) => {
    const win = getCurrentWindow();
    const mon = await currentMonitor();
    const sf  = mon?.scaleFactor ?? 1;
    const monTop = (mon?.position.y ?? 0) / sf;
    const monH   = (mon?.size.height ?? 1080) / sf;
    const workH  = monH - 48;
    const size = await win.outerSize();
    const pos  = await win.outerPosition();
    const curBottom = (pos.y + size.height) / sf;
    const newY = curBottom - targetH;
    const clampY = Math.max(monTop + 4, Math.min(newY, monTop + workH - targetH - 4));
    await win.setSize(new LogicalSize(getBarW(), targetH));
    await win.setPosition(new PhysicalPosition(pos.x, Math.round(clampY * sf)));
  }, []);

  const togglePanel = useCallback(async () => {
    const opening = !panelOpen;
    setPanelOpen(opening);
    if (opening && historyOpen) setHistoryOpen(false);
    if (opening && pickerOpen)  setPickerOpen(false);
    await resizeTo(BASE_H + (opening ? PANEL_H : 0));
    if (!opening) inputRef.current?.focus();
  }, [panelOpen, historyOpen, pickerOpen, resizeTo]);

  const toggleHistory = useCallback(async () => {
    if (panelOpen) return;
    const opening = !historyOpen;
    setHistoryOpen(opening);
    await resizeTo(BASE_H + (opening ? HISTORY_H : 0) + (pickerOpen ? PICKER_H : 0));
    if (!opening) inputRef.current?.focus();
  }, [historyOpen, panelOpen, pickerOpen, resizeTo]);

  const togglePicker = useCallback(async () => {
    const opening = !pickerOpen;
    setPickerOpen(opening);
    if (opening) void emit("atlas:request-canvases", {}).catch(() => {});
    await resizeTo(BASE_H + (opening ? PICKER_H : 0) + (historyOpen ? HISTORY_H : 0));
  }, [pickerOpen, historyOpen, resizeTo]);

  const handleSelectCanvas = useCallback(async (id: string) => {
    setLinkedCanvasId(id);
    localStorage.setItem("v3-linked-canvas-id", id);
    setPickerOpen(false);
    void emit("atlas:canvas-switch", { id }).catch(() => {});
    await resizeTo(BASE_H + (historyOpen ? HISTORY_H : 0));
  }, [historyOpen, resizeTo]);

  const handleDisconnect = useCallback(async () => {
    setLinkedCanvasId(null);
    localStorage.removeItem("v3-linked-canvas-id");
    setPickerOpen(false);
    setHistoryOpen(false);
    void emit("atlas:canvas-unlink", {}).catch(() => {});
    await resizeTo(BASE_H);
  }, [resizeTo]);

  // Auto-open history when first canvas message arrives
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    const count = orkMessages.length;
    if (linkedCanvasId !== null && count > 0 && !historyOpen && !panelOpen && prevMsgCountRef.current === 0) {
      setHistoryOpen(true);
      void resizeTo(BASE_H + HISTORY_H + (pickerOpen ? PICKER_H : 0));
    }
    prevMsgCountRef.current = count;
  }, [orkMessages.length, linkedCanvasId, historyOpen, panelOpen, pickerOpen, resizeTo]);

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
          border: linkedCanvasId !== null ? "1px solid rgba(77,184,154,0.30)" : "1px solid rgba(255,255,255,0.08)",
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
        {linkedCanvasId !== null && historyOpen && orkMessages.length > 0 && (
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
              placeholder={linkedCanvasId !== null ? "Canvas'ı yönet — node ekle, bağla, çalıştır…" : vaultRoute ? "Vault'a yaz — Atlas-Maker sayfa oluşturacak…" : "Atlas'a bir şey sor…"}
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-[13.5px] text-[#e8e8ec] outline-none placeholder:text-[#2e2e3a]"
              style={{ caretColor: "#5b8def" }}
            />
          </div>

          {/* Sağ: fonksiyonel tuşlar + ayırıcı + pencere chrome */}
          <div className="flex shrink-0 items-center gap-[3px] px-2">

            {/* Canvas history toggle */}
            {linkedCanvasId !== null && orkMessages.length > 0 && (
              <IBtn
                onClick={() => void toggleHistory()}
                title={historyOpen ? "Geçmişi gizle" : "Konuşmayı göster"}
                active={historyOpen}
                activeColor="blue"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M1 2.5h10M1 6h7.5M1 9.5h5"/>
                </svg>
              </IBtn>
            )}

            {/* Vault-route toggle */}
            {linkedCanvasId === null && (
              <IBtn
                onClick={() => setVaultRoute((v) => !v)}
                title={vaultRoute ? "Vault modunu kapat" : "Vault modu"}
                active={vaultRoute}
                activeColor="purple"
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 1.5l1.4 3.8h3.8l-3 2.3 1.1 3.8L7 9l-3.3 2.4 1.1-3.8-3-2.3H5.6z"/>
                </svg>
              </IBtn>
            )}

            {/* Canvas picker */}
            <CanvasPicker
              canvasList={canvasList}
              linkedId={linkedCanvasId}
              open={pickerOpen}
              onToggle={() => void togglePicker()}
              onSelect={(id) => void handleSelectCanvas(id)}
              onDisconnect={() => void handleDisconnect()}
            />

            {/* TTS */}
            <IBtn
              onClick={toggleTts}
              title={ttsEnabled ? "Sesli yanıtı kapat" : "Sesli yanıt"}
              active={ttsEnabled}
              activeColor="purple"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6H1v4h2l4 3V3L3 6z"/>
                {ttsEnabled
                  ? <path d="M11 5a4 4 0 010 6M13.5 2.5a7.5 7.5 0 010 11"/>
                  : <path d="M13 5l-4 6"/>
                }
              </svg>
            </IBtn>

            {/* Mic */}
            <button
              type="button"
              onClick={() => void toggleMic()}
              title={
                micState === "recording"
                  ? silenceProgress > 0 ? "Sessizlik — durduruyor…" : "Dinliyor…"
                  : micState === "transcribing" ? "Yazıya döküyor…"
                  : "Sesli giriş"
              }
              className="relative flex h-[28px] w-[28px] items-center justify-center rounded-md"
              style={{
                transition: "background 80ms ease-out, border-color 80ms ease-out, box-shadow 80ms ease-out",
                background: micState === "recording"
                  ? `rgba(224,90,60,${0.15 + audioLevel * 0.28})`
                  : micState === "transcribing" ? "rgba(91,141,239,0.15)"
                  : "rgba(255,255,255,0.06)",
                color: micState === "recording"
                  ? `rgb(${Math.round(224 + audioLevel * 20)},${Math.round(90 - audioLevel * 20)},60)`
                  : micState === "transcribing" ? "#5b8def"
                  : "#666",
                border: micState === "recording"
                  ? `1px solid rgba(224,90,60,${0.35 + audioLevel * 0.45})`
                  : micState === "transcribing" ? "1px solid rgba(91,141,239,0.30)"
                  : "1px solid rgba(255,255,255,0.10)",
                boxShadow: micState === "recording" && audioLevel > 0.15
                  ? `0 0 ${Math.round(audioLevel * 12)}px rgba(224,90,60,${audioLevel * 0.5})`
                  : "none",
              }}
            >
              {micState === "recording" && silenceProgress > 0 && (
                <svg style={{ position: "absolute", inset: -1, pointerEvents: "none" }} width="30" height="30" viewBox="0 0 30 30">
                  <circle cx="15" cy="15" r="13" fill="none" stroke="rgba(224,90,60,0.75)" strokeWidth="2" strokeLinecap="round"
                    strokeDasharray={`${81.7 * (1 - silenceProgress)} 81.7`} transform="rotate(-90 15 15)"/>
                </svg>
              )}
              {micState === "transcribing" ? (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M8 2v4M8 10v4M2 8h4M10 8h4" style={{ animation: "atlas-pulse 1s ease-in-out infinite" }}/>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="1" width="6" height="9" rx="3" fill={micState === "recording" ? `rgba(224,90,60,${0.15 + audioLevel * 0.3})` : "none"}/>
                  <path d="M3 8a5 5 0 0010 0M8 13v2M5 15h6"/>
                </svg>
              )}
            </button>

            {/* Gönder */}
            <button
              type="button"
              onClick={() => void send()}
              disabled={!val.trim() || busy}
              className="flex h-[28px] w-[28px] items-center justify-center rounded-md transition-all duration-150"
              style={{
                background: val.trim() && !busy
                  ? linkedCanvasId !== null ? "rgba(77,184,154,0.20)" : "rgba(91,141,239,0.20)"
                  : "rgba(255,255,255,0.04)",
                color: val.trim() && !busy
                  ? linkedCanvasId !== null ? "#4db89a" : "#5b8def"
                  : "#3a3a48",
                border: val.trim() && !busy
                  ? linkedCanvasId !== null ? "1px solid rgba(77,184,154,0.35)" : "1px solid rgba(91,141,239,0.35)"
                  : "1px solid rgba(255,255,255,0.07)",
              }}
            >
              {busy
                ? <span className="size-1.5 animate-pulse rounded-full" style={{ background: linkedCanvasId !== null ? "#4db89a" : "#5b8def" }}/>
                : <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M8 13V3M3 8l5-5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
              }
            </button>

            {/* Ayırıcı */}
            <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.07)", margin: "0 2px" }}/>

            {/* Gizle (close → hide, pencere yok olmaz) */}
            <button
              type="button"
              onClick={() => void getCurrentWindow().hide()}
              className="flex h-[22px] w-[22px] items-center justify-center rounded text-[#444] transition-colors duration-150 hover:bg-white/[0.07] hover:text-[#aaa]"
              title="Gizle — uygulamayı kapatmaz"
            >
              <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
                <path d="M0 1h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function CanvasPicker({
  canvasList, linkedId, open, onToggle, onSelect, onDisconnect,
}: {
  canvasList: { id: string; title: string }[];
  linkedId: string | null;
  open: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onDisconnect: () => void;
}) {
  const label = linkedId
    ? (canvasList.find(c => c.id === linkedId)?.title ?? "Canvas")
    : "Canvas";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        title="Canvas bağlantısı"
        className="flex h-[28px] items-center gap-1 rounded-md px-2 transition-all duration-150"
        style={{
          background: linkedId  ? "rgba(77,184,154,0.16)"
                    : open      ? "rgba(255,255,255,0.08)"
                    :             "rgba(255,255,255,0.06)",
          color:     linkedId  ? "#4db89a"
                    : open      ? "#c8c8d0"
                    :             "#666",
          border: linkedId
            ? "1px solid rgba(77,184,154,0.32)"
            : "1px solid rgba(255,255,255,0.10)",
          maxWidth: 100,
        }}
      >
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1.5" y="1.5" width="11" height="11" rx="2"/>
          <path d="M4 5h6M4 7h4M4 9h2.5"/>
        </svg>
        <span className="truncate text-[10px]" style={{ maxWidth: 52 }}>{label}</span>
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 3.5l3-2.5 3 2.5M2 6.5l3 2.5 3-2.5"/>
        </svg>
      </button>

      {open && (
        <div
          className="absolute bottom-[calc(100%+6px)] left-0 z-50 w-[176px] overflow-hidden rounded-[9px]"
          style={{
            background: "rgba(11,11,17,0.98)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            animation: "v3-fadein 0.12s ease",
          }}
        >
          <div className="px-3 pt-2 pb-1">
            <span className="font-mono text-[8px] uppercase tracking-widest"
              style={{ color: "rgba(255,255,255,0.22)" }}>
              Kanvaslar
            </span>
          </div>

          <div className="px-1 pb-1">
            {canvasList.length === 0 && (
              <div className="px-2 py-2 text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                Kanvas bulunamadı
              </div>
            )}
            {canvasList.map(c => {
              const isLinked = c.id === linkedId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className="flex w-full items-center gap-2 rounded-[6px] px-2 py-[5px] text-left transition-all duration-150"
                  style={{
                    background: isLinked ? "rgba(77,184,154,0.08)" : "transparent",
                    border: isLinked ? "1px solid rgba(77,184,154,0.20)" : "1px solid transparent",
                  }}
                  onMouseEnter={e => {
                    if (!isLinked) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)";
                  }}
                  onMouseLeave={e => {
                    if (!isLinked) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  <span style={{ fontSize: 7, lineHeight: 1, color: isLinked ? "#4db89a" : "rgba(255,255,255,0.25)" }}>◈</span>
                  <span className="min-w-0 flex-1 truncate text-[11px]"
                    style={{ color: isLinked ? "#4db89a" : "rgba(255,255,255,0.60)" }}>
                    {c.title}
                  </span>
                  {isLinked && (
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none"
                      stroke="#4db89a" strokeWidth="1.6" strokeLinecap="round">
                      <path d="M2 6l3 3 5-5"/>
                    </svg>
                  )}
                </button>
              );
            })}
          </div>

          {linkedId && (
            <>
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0 8px" }} />
              <div className="p-1">
                <button
                  type="button"
                  onClick={onDisconnect}
                  className="flex w-full items-center gap-2 rounded-[6px] px-2 py-[5px] text-left transition-all duration-150"
                  style={{ color: "rgba(224,90,60,0.65)" }}
                  onMouseEnter={e => {
                    const b = e.currentTarget as HTMLButtonElement;
                    b.style.background = "rgba(224,90,60,0.08)";
                    b.style.color = "#e05a3c";
                  }}
                  onMouseLeave={e => {
                    const b = e.currentTarget as HTMLButtonElement;
                    b.style.background = "transparent";
                    b.style.color = "rgba(224,90,60,0.65)";
                  }}
                >
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none"
                    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M2 2l8 8M10 2l-8 8"/>
                  </svg>
                  <span className="text-[11px]">Bağlantıyı kes</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Küçük icon tuş bileşeni ───────────────────────────────────────────────────
const COLOR = {
  blue:   { bg: "rgba(91,141,239,0.16)",  border: "rgba(91,141,239,0.32)",  text: "#5b8def" },
  green:  { bg: "rgba(77,184,154,0.16)",  border: "rgba(77,184,154,0.32)",  text: "#4db89a" },
  purple: { bg: "rgba(155,114,239,0.16)", border: "rgba(155,114,239,0.32)", text: "#9b72ef" },
} as const;

function IBtn({ children, onClick, title, active, activeColor }: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  active?: boolean;
  activeColor?: keyof typeof COLOR;
}) {
  const c = active && activeColor ? COLOR[activeColor] : null;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex h-[28px] w-[28px] items-center justify-center rounded-md transition-all duration-150 hover:brightness-125"
      style={{
        background: c ? c.bg : "rgba(255,255,255,0.06)",
        color:      c ? c.text : "#666",
        border:     `1px solid ${c ? c.border : "rgba(255,255,255,0.10)"}`,
      }}
    >
      {children}
    </button>
  );
}

function hexToRgb(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
