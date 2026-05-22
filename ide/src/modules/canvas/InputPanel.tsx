/**
 * InputPanel — a simple data-source node on the canvas.
 * The user types text, picks an image, or selects a file.
 * The value is stored in panel.meta.outputData and flows through
 * any connected wire to downstream panels (e.g. a chat panel).
 */
import { useRef, useState, useEffect } from "react";
import { useCanvasStore } from "./canvasStore";
import type { CanvasPanelNode } from "./types";

type InputKind = "text" | "image" | "file";

export function InputPanel({ panel }: { panel: CanvasPanelNode }) {
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const setOutputData = useCanvasStore((s) => s.setOutputData);

  const kind: InputKind = (panel.meta?.inputKind as InputKind) ?? "text";
  const storedValue = (panel.meta?.value as string) ?? "";

  const [text, setText] = useState(storedValue);
  const [imagePreview, setImagePreview] = useState<string>("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync imagePreview when panel restores from persistence
  useEffect(() => {
    if (kind === "image" && storedValue && !imagePreview) {
      setImagePreview(storedValue);
    }
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
    // In Tauri the File object's name isn't a full path, but it's the best we have.
    commitText(file.name);
  };

  const tabCls = (k: InputKind) =>
    `px-2 py-0.5 text-[9px] rounded transition-colors cursor-pointer ${
      kind === k
        ? "bg-[#5b8def]/20 text-[#5b8def]"
        : "text-[#555] hover:text-[#888]"
    }`;

  return (
    <div className="flex h-full flex-col bg-[#0a0a0a]">
      {/* Kind tabs */}
      <div className="flex h-6 shrink-0 items-center gap-0.5 border-b border-[#1a1a1a] px-2">
        <button type="button" className={tabCls("text")} onClick={() => setKind("text")}>Text</button>
        <button type="button" className={tabCls("image")} onClick={() => setKind("image")}>Image</button>
        <button type="button" className={tabCls("file")} onClick={() => setKind("file")}>File</button>
        <div className="flex-1" />
        <span className="text-[8px] text-[#333]">→ output</span>
      </div>

      {/* Content area */}
      <div className="flex min-h-0 flex-1 flex-col p-2">
        {kind === "text" && (
          <textarea
            value={text}
            onChange={(e) => commitText(e.target.value)}
            placeholder="Type or paste text…"
            className="h-full w-full resize-none rounded bg-[#111] p-1.5 text-[10px] text-[#f5f5f5] outline-none placeholder:text-[#333] focus:bg-[#131313]"
          />
        )}

        {kind === "image" && (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onImagePicked}
            />
            {imagePreview ? (
              <>
                <img
                  src={imagePreview}
                  alt="input"
                  className="max-h-[80px] max-w-full rounded border border-[#1a1a1a] object-contain"
                />
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="text-[9px] text-[#555] hover:text-[#888]"
                >
                  Change image
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="flex flex-col items-center gap-1 rounded border border-dashed border-[#2a2a2a] px-6 py-4 text-[#555] transition-colors hover:border-[#5b8def]/40 hover:text-[#888]"
              >
                <span className="text-lg">🖼</span>
                <span className="text-[9px]">Pick image</span>
              </button>
            )}
          </div>
        )}

        {kind === "file" && (
          <div className="flex h-full flex-col gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={onFilePicked}
            />
            <input
              value={text}
              onChange={(e) => commitText(e.target.value)}
              placeholder="File path…"
              className="h-6 w-full rounded bg-[#111] px-1.5 text-[10px] text-[#f5f5f5] outline-none focus:bg-[#131313]"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-6 rounded bg-[#1a1a1a] text-[9px] text-[#555] transition-colors hover:bg-[#222] hover:text-[#f5f5f5]"
            >
              Browse…
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
