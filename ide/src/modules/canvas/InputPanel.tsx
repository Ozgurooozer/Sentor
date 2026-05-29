import { useRef, useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCanvasStore } from "./canvasStore";
import type { CanvasPanelNode } from "./types";

type InputKind = "text" | "image" | "file";

// Shared glass token helpers
const G = {
  input: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#e8e8ec",
    borderRadius: 7,
    fontFamily: "system-ui",
  } as React.CSSProperties,
  tabActive: (accent = "#5b8def") => ({
    background: `${accent}20`,
    color: accent,
    border: `1px solid ${accent}35`,
  }) as React.CSSProperties,
  tabIdle: {
    background: "transparent",
    color: "rgba(255,255,255,0.25)",
    border: "1px solid transparent",
  } as React.CSSProperties,
};

export function InputPanel({ panel }: { panel: CanvasPanelNode }) {
  const updatePanel   = useCanvasStore((s) => s.updatePanel);
  const setOutputData = useCanvasStore((s) => s.setOutputData);

  const kind: InputKind  = (panel.meta?.inputKind as InputKind) ?? "text";
  const storedValue       = (panel.meta?.value as string) ?? "";

  const [text, setText]                 = useState(storedValue);
  const [imagePreview, setImagePreview] = useState<string>("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (kind === "image" && storedValue && !imagePreview) setImagePreview(storedValue);
  }, [kind, storedValue, imagePreview]);

  const setKind = (k: InputKind) => {
    updatePanel(panel.id, { meta: { ...panel.meta, inputKind: k, value: "" } });
    setOutputData(panel.id, { kind: k === "file" ? "text" : k, value: "" });
    setText("");
    setImagePreview("");
  };

  const commitText = (v: string) => {
    setText(v);
    updatePanel(panel.id, { meta: { ...panel.meta, value: v } });
    setOutputData(panel.id, { kind: "text", value: v });
  };

  const onImagePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImagePreview(dataUrl);
      updatePanel(panel.id, { meta: { ...panel.meta, value: dataUrl } });
      setOutputData(panel.id, { kind: "image", value: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    commitText(file.name);
  };

  useEffect(() => {
    if (kind !== "file" || !text.trim()) return;
    invoke<string>("fs_read_file", { path: text.trim() })
      .then((content) => setOutputData(panel.id, { kind: "text", value: content.slice(0, 8000) }))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, text]);

  return (
    <div className="flex h-full flex-col">
      {/* Kind tab bar */}
      <div
        className="flex h-7 shrink-0 items-center gap-1 px-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        {(["text", "image", "file"] as InputKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className="rounded-[5px] px-2 py-0.5 text-[9px] font-medium uppercase tracking-widest transition-all duration-150"
            style={kind === k ? G.tabActive() : G.tabIdle}
          >
            {k}
          </button>
        ))}
        <div className="flex-1" />
        <span
          className="font-mono text-[8px] uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.18)" }}
        >
          → output
        </span>
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1 flex-col p-2">
        {kind === "text" && (
          <textarea
            value={text}
            onChange={(e) => commitText(e.target.value)}
            placeholder="Type or paste text…"
            className="h-full w-full resize-none p-2 text-[11px] leading-relaxed outline-none transition-colors duration-150 placeholder:opacity-30"
            style={{ ...G.input, fontSize: 11 }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        )}

        {kind === "image" && (
          <div className="flex h-full flex-col items-center justify-center gap-2.5">
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={onImagePicked} />
            {imagePreview ? (
              <>
                <img
                  src={imagePreview}
                  alt="input"
                  className="max-h-[80px] max-w-full rounded-lg object-contain"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                />
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="text-[9px] transition-colors duration-150"
                  style={{ color: "rgba(255,255,255,0.30)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.65)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.30)")}
                >
                  Change image
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="flex flex-col items-center gap-1.5 rounded-xl px-6 py-4 transition-all duration-150"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px dashed rgba(255,255,255,0.10)",
                  color: "rgba(255,255,255,0.30)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(91,141,239,0.08)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(91,141,239,0.30)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.03)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.10)";
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="3"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <path d="M21 15l-5-5L5 21"/>
                </svg>
                <span className="text-[9px] uppercase tracking-widest">Pick image</span>
              </button>
            )}
          </div>
        )}

        {kind === "file" && (
          <div className="flex h-full flex-col gap-1.5">
            <input ref={fileInputRef} type="file" className="hidden" onChange={onFilePicked} />
            <input
              value={text}
              onChange={(e) => commitText(e.target.value)}
              placeholder="File path…"
              className="h-7 w-full px-2 text-[10px] outline-none"
              style={G.input}
              onPointerDown={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-7 rounded-[7px] text-[9px] uppercase tracking-widest transition-all duration-150"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
                color: "rgba(255,255,255,0.35)",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
            >
              Browse…
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
