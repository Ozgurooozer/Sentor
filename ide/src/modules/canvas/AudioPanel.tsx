import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasStore } from "./canvasStore";
import type { CanvasPanelNode } from "./types";

// ─── meta shape (serialised to canvas JSON) ───────────────────────────────
export interface AudioPanelMeta {
  mode: "file" | "mic" | "live";
  endpoint: string;        // transcribe server URL
  language: string;        // "auto" | ISO-639-1 code
  transcript: string;      // accumulated text
  status: "idle" | "recording" | "transcribing" | "done" | "error";
  errorMsg: string;
  fileName: string;
  overlapMs: number;       // overlap window in ms (live mode)
}

const DEFAULT_META: AudioPanelMeta = {
  mode: "live",
  endpoint: "http://localhost:3001/transcribe",
  language: "auto",
  transcript: "",
  status: "idle",
  errorMsg: "",
  fileName: "",
  overlapMs: 500,
};

const CHUNK_MS = 2000;

const LANGUAGES = [
  { code: "auto", label: "Auto" },
  { code: "tr",   label: "Türkçe" },
  { code: "en",   label: "English" },
  { code: "de",   label: "Deutsch" },
  { code: "fr",   label: "Français" },
  { code: "es",   label: "Español" },
  { code: "ja",   label: "日本語" },
  { code: "zh",   label: "中文" },
];

// ─── POST a blob to the transcribe server ────────────────────────────────
async function postChunk(
  blob: Blob,
  endpoint: string,
  language: string,
  fileName = "audio.webm",
): Promise<string> {
  const fd = new FormData();
  fd.append("audio", blob, fileName);
  if (language !== "auto") fd.append("language", language);

  const res = await fetch(endpoint, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
  const json = await res.json();
  return ((json.text ?? json.transcript ?? "") as string).trim();
}

// ─── live-overlap buffer ──────────────────────────────────────────────────
// Keeps the last N ms of audio to prepend to the next chunk, reducing
// word-boundary drops at Whisper segment edges.
class OverlapBuffer {
  private chunks: { blob: Blob; ms: number }[] = [];

  push(blob: Blob, durationMs: number) {
    this.chunks.push({ blob, ms: durationMs });
  }

  tail(windowMs: number): Blob[] {
    let acc = 0;
    const out: Blob[] = [];
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      acc += this.chunks[i].ms;
      out.unshift(this.chunks[i].blob);
      if (acc >= windowMs) break;
    }
    return out;
  }

  clear() { this.chunks = []; }
}

// ─── waveform bar visualiser ─────────────────────────────────────────────
function Waveform({ stream }: { stream: MediaStream | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    if (!stream) {
      cancelAnimationFrame(rafRef.current);
      const c = canvasRef.current;
      if (c) c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
      return;
    }

    const ac = new AudioContext();
    const analyser = ac.createAnalyser();
    analyser.fftSize = 256;
    ac.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      analyser.getByteFrequencyData(buf);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width / buf.length;
      for (let i = 0; i < buf.length; i++) {
        const ratio = buf[i] / 255;
        const h = ratio * canvas.height;
        ctx.fillStyle = `rgba(91,141,239,${0.25 + ratio * 0.75})`;
        ctx.fillRect(i * w, canvas.height - h, Math.max(w - 1, 1), h);
      }
    };
    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      ac.close();
    };
  }, [stream]);

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={36}
      className="w-full rounded"
      style={{ background: "rgba(91,141,239,0.04)" }}
    />
  );
}

// ─── main panel ──────────────────────────────────────────────────────────
export function AudioPanel({ panel }: { panel: CanvasPanelNode }) {
  const updatePanel  = useCanvasStore((s) => s.updatePanel);
  const setOutputData = useCanvasStore((s) => s.setOutputData);

  const raw  = panel.meta as Partial<AudioPanelMeta>;
  const meta: AudioPanelMeta = { ...DEFAULT_META, ...raw };

  const patch = useCallback(
    (partial: Partial<AudioPanelMeta>) =>
      updatePanel(panel.id, { meta: { ...meta, ...partial } }),
    [panel.id, meta, updatePanel],
  );

  // mic state
  const mediaRef   = useRef<MediaRecorder | null>(null);
  const chunksRef  = useRef<Blob[]>([]);
  const overlapBuf = useRef(new OverlapBuffer());
  const [stream, setStream]   = useState<MediaStream | null>(null);
  const [showCfg, setShowCfg] = useState(false);

  const stopStream = useCallback(() => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  }, [stream]);

  useEffect(() => () => { stopStream(); }, [stopStream]);

  // push transcript to wire whenever it changes
  useEffect(() => {
    if (meta.transcript)
      setOutputData(panel.id, { kind: "text", value: meta.transcript });
  }, [meta.transcript, panel.id, setOutputData]);

  // ── derived ──────────────────────────────────────────────────────────────
  const isRecording    = meta.status === "recording";
  const isTranscribing = meta.status === "transcribing";
  const isBusy         = isRecording || isTranscribing;

  // ── file mode ─────────────────────────────────────────────────────────────
  const transcribeFile = useCallback(async (file: File) => {
    patch({ status: "transcribing", fileName: file.name, errorMsg: "" });
    try {
      const text = await postChunk(file, meta.endpoint, meta.language, file.name);
      patch({ transcript: text, status: "done" });
    } catch (err) {
      patch({ status: "error", errorMsg: String(err) });
    }
  }, [meta.endpoint, meta.language, patch]);

  // ── mic mode (record → stop → transcribe once) ────────────────────────────
  const startMic = useCallback(async () => {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    setStream(s);
    chunksRef.current = [];
    const mr = new MediaRecorder(s, { mimeType: "audio/webm" });
    mediaRef.current = mr;
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.start();
    patch({ status: "recording", errorMsg: "" });
  }, [patch]);

  const stopMic = useCallback(async () => {
    const mr = mediaRef.current;
    if (!mr) return;
    patch({ status: "transcribing" });
    mr.stop();
    stopStream();
    await new Promise<void>((res) => { mr.onstop = () => res(); });
    try {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const text = await postChunk(blob, meta.endpoint, meta.language);
      patch({ transcript: text, status: "done" });
    } catch (err) {
      patch({ status: "error", errorMsg: String(err) });
    }
    mediaRef.current = null;
  }, [meta.endpoint, meta.language, patch, stopStream]);

  // ── live mode (2s chunks + overlap buffer) ────────────────────────────────
  const startLive = useCallback(async () => {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    setStream(s);
    overlapBuf.current.clear();

    const mr = new MediaRecorder(s, { mimeType: "audio/webm" });
    mediaRef.current = mr;

    mr.ondataavailable = async (e) => {
      if (e.data.size < 500) return; // skip near-silent chunks

      // build combined blob: [overlap tail] + [current chunk]
      const tail = overlapBuf.current.tail(meta.overlapMs);
      const combined = new Blob([...tail, e.data], { type: "audio/webm" });

      // store current chunk in overlap buffer
      overlapBuf.current.push(e.data, CHUNK_MS);

      try {
        const text = await postChunk(combined, meta.endpoint, meta.language);
        if (!text) return;
        // read latest transcript from store (not stale closure)
        const cur = useCanvasStore.getState().panels.find((p) => p.id === panel.id)
          ?.meta as Partial<AudioPanelMeta> | undefined;
        const prev = cur?.transcript ?? "";
        patch({ transcript: prev ? `${prev} ${text}` : text, status: "recording" });
      } catch {
        // swallow chunk errors — live mode continues on partial failure
      }
    };

    mr.start(CHUNK_MS);
    patch({ status: "recording", errorMsg: "" });
  }, [meta.endpoint, meta.language, meta.overlapMs, panel.id, patch]);

  const stopLive = useCallback(() => {
    mediaRef.current?.stop();
    mediaRef.current = null;
    stopStream();
    overlapBuf.current.clear();
    patch({ status: "done" });
  }, [patch, stopStream]);

  // ── status indicator ──────────────────────────────────────────────────────
  const dotColor =
    meta.status === "recording"    ? "#ef4444" :
    meta.status === "transcribing" ? "#f59e0b" :
    meta.status === "done"         ? "#22c55e" :
    meta.status === "error"        ? "#ef4444" : "#444";

  const statusLabel =
    meta.status === "idle"         ? "Ready" :
    meta.status === "recording"    ? "Recording…" :
    meta.status === "transcribing" ? "Transcribing…" :
    meta.status === "done"         ? (meta.fileName ? `Done — ${meta.fileName}` : "Done") :
    `Error: ${meta.errorMsg}`;

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div
      className="flex h-full flex-col overflow-hidden text-[11px]"
      style={{ background: "#111", color: "#f5f5f5" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* mode tabs */}
      <div className="flex shrink-0 border-b border-[#2a2a2a]">
        {(["file", "mic", "live"] as const).map((m) => (
          <button
            key={m}
            onClick={() => { if (!isBusy) patch({ mode: m, status: "idle", errorMsg: "" }); }}
            className="flex-1 py-1.5 capitalize transition-colors duration-150 ease-out"
            style={{
              color:        meta.mode === m ? "#5b8def" : "#888",
              borderBottom: meta.mode === m ? "1px solid #5b8def" : "1px solid transparent",
              background:   "none",
              cursor:       isBusy ? "not-allowed" : "pointer",
            }}
          >
            {m === "file" ? "📂 File" : m === "mic" ? "🎙 Mic" : "📡 Live"}
          </button>
        ))}
        <button
          onClick={() => setShowCfg((v) => !v)}
          className="px-2 text-[#555] transition-colors duration-150 hover:text-[#888]"
          title="Settings"
          style={{ background: "none" }}
        >
          ⚙
        </button>
      </div>

      {/* config drawer */}
      {showCfg && (
        <div className="flex shrink-0 flex-col gap-1.5 border-b border-[#2a2a2a] bg-[#0a0a0a] p-2">
          <label className="text-[#888]">Server endpoint</label>
          <input
            className="rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-[#f5f5f5] outline-none focus:border-[#5b8def]"
            value={meta.endpoint}
            onChange={(e) => patch({ endpoint: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="http://localhost:3001/transcribe"
          />
          <label className="text-[#888]">Language</label>
          <select
            className="rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-[#f5f5f5] outline-none focus:border-[#5b8def]"
            value={meta.language}
            onChange={(e) => patch({ language: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          {meta.mode === "live" && (
            <>
              <label className="text-[#888]">Overlap window (ms)</label>
              <input
                type="number"
                min={0}
                max={1000}
                step={100}
                className="rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-[#f5f5f5] outline-none focus:border-[#5b8def]"
                value={meta.overlapMs}
                onChange={(e) => patch({ overlapMs: Number(e.target.value) })}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </>
          )}
        </div>
      )}

      {/* body */}
      <div className="flex flex-1 flex-col gap-2 overflow-hidden p-2">

        {/* status */}
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className="inline-block size-1.5 shrink-0 rounded-full"
            style={{
              background:  dotColor,
              boxShadow:   isRecording ? `0 0 5px ${dotColor}` : "none",
            }}
          />
          <span className="truncate text-[#888]">{statusLabel}</span>
        </div>

        {/* waveform */}
        {meta.mode !== "file" && isRecording && <Waveform stream={stream} />}

        {/* FILE mode */}
        {meta.mode === "file" && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) transcribeFile(f);
            }}
            className="flex shrink-0 flex-col items-center justify-center gap-2 rounded border border-dashed border-[#2a2a2a] p-4 text-center transition-colors duration-150 hover:border-[#5b8def]/50"
          >
            <span className="text-xl">🎵</span>
            <span className="text-[#555]">Drop audio / video file</span>
            <label className="cursor-pointer rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-[#888] transition-colors duration-150 hover:border-[#5b8def] hover:text-[#f5f5f5]">
              Browse
              <input
                type="file"
                accept="audio/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) transcribeFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        )}

        {/* MIC mode */}
        {meta.mode === "mic" && (
          <div className="flex shrink-0 flex-col items-center gap-2">
            <button
              onClick={isRecording ? stopMic : startMic}
              disabled={isTranscribing}
              className="flex items-center gap-1.5 rounded border px-3 py-1.5 transition-colors duration-150"
              style={{
                borderColor: isRecording ? "#ef4444" : "#5b8def",
                color:       isRecording ? "#ef4444" : "#5b8def",
                background:  isRecording ? "rgba(239,68,68,0.08)" : "rgba(91,141,239,0.08)",
                opacity:     isTranscribing ? 0.5 : 1,
                cursor:      isTranscribing ? "not-allowed" : "pointer",
              }}
            >
              {isRecording ? "⏹ Stop" : isTranscribing ? "⏳ Transcribing…" : "⏺ Record"}
            </button>
          </div>
        )}

        {/* LIVE mode */}
        {meta.mode === "live" && (
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            <button
              onClick={isRecording ? stopLive : startLive}
              className="flex items-center gap-1.5 rounded border px-3 py-1.5 transition-colors duration-150"
              style={{
                borderColor: isRecording ? "#ef4444" : "#22c55e",
                color:       isRecording ? "#ef4444" : "#22c55e",
                background:  isRecording ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)",
                cursor:      "pointer",
              }}
            >
              {isRecording ? "⏹ Stop Live" : "📡 Start Live"}
            </button>
            <span className="text-[#444]">2s chunks · {meta.overlapMs}ms overlap</span>
          </div>
        )}

        {/* transcript */}
        <div className="flex shrink-0 items-center justify-between">
          <span className="text-[#555]">Transcript</span>
          {meta.transcript && (
            <button
              onClick={() => patch({ transcript: "", status: "idle", fileName: "" })}
              className="text-[#444] transition-colors hover:text-[#888]"
            >
              clear
            </button>
          )}
        </div>
        <textarea
          value={meta.transcript}
          onChange={(e) => patch({ transcript: e.target.value })}
          placeholder="Transcript will appear here…"
          className="min-h-[60px] flex-1 resize-none rounded border border-[#2a2a2a] bg-[#0a0a0a] p-2 leading-relaxed text-[#f5f5f5] placeholder-[#333] outline-none focus:border-[#5b8def]"
          onPointerDown={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}
