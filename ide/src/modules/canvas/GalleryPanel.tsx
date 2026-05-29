import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { localToAsset } from "@/modules/browser/assetUrl";
import type { DirEntry } from "@/modules/ai/lib/native";
import { useCanvasStore } from "./canvasStore";
import type { CanvasPanelNode } from "./types";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;
const MAX_THUMBNAILS = 64;

export function GalleryPanel({ panel }: { panel: CanvasPanelNode }) {
  const updatePanel   = useCanvasStore((s) => s.updatePanel);
  const setOutputData = useCanvasStore((s) => s.setOutputData);

  const dir      = (panel.meta?.dir      as string | undefined) || "";
  const selected = (panel.meta?.selected as string | undefined) || "";

  const [images, setImages]       = useState<string[]>([]);
  const [error, setError]         = useState<string | null>(null);
  const [pickPending, setPickPending] = useState(false);

  useEffect(() => {
    if (!dir) { setImages([]); return; }
    let alive = true;
    invoke<DirEntry[]>("fs_read_dir", { path: dir })
      .then((entries) => {
        if (!alive) return;
        const sep = dir.includes("\\") ? "\\" : "/";
        setImages(
          entries
            .filter((e) => e.kind === "file" && IMAGE_EXT.test(e.name))
            .slice(0, MAX_THUMBNAILS)
            .map((e) => `${dir}${sep}${e.name}`),
        );
        setError(null);
      })
      .catch((e) => { if (!alive) return; setImages([]); setError(String(e)); });
    return () => { alive = false; };
  }, [dir]);

  const pickFolder = useCallback(async () => {
    setPickPending(true);
    try {
      const picked = await invoke<string | null>("pick_folder");
      if (picked) {
        updatePanel(panel.id, { meta: { ...panel.meta, dir: picked, selected: "" } });
        setOutputData(panel.id, null);
      }
    } catch (e) { setError(String(e)); }
    finally { setPickPending(false); }
  }, [panel.id, panel.meta, updatePanel, setOutputData]);

  const selectImage = useCallback(async (absPath: string) => {
    try {
      const r = await fetch(localToAsset(absPath));
      if (!r.ok) throw new Error(`fetch ${r.status}`);
      const b = await r.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(b);
      });
      if (!dataUrl) return;
      updatePanel(panel.id, { meta: { ...panel.meta, selected: absPath } });
      setOutputData(panel.id, { kind: "image", value: dataUrl });
    } catch (e) { setError(String(e)); }
  }, [panel.id, panel.meta, updatePanel, setOutputData]);

  const selectedNorm = useMemo(() => selected.replace(/\\/g, "/"), [selected]);

  if (!dir) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2" strokeLinecap="round">
          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
        <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.22)" }}>
          No folder selected
        </span>
        <button
          type="button"
          onClick={pickFolder}
          disabled={pickPending}
          className="rounded-[8px] px-3 py-1.5 text-[11px] transition-all duration-150 disabled:opacity-50"
          style={{
            background: "rgba(155,114,239,0.15)",
            border: "1px solid rgba(155,114,239,0.30)",
            color: "#b48ef5",
          }}
        >
          {pickPending ? "Picking…" : "Pick folder"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" onPointerDown={(e) => e.stopPropagation()}>
      {/* Toolbar */}
      <div
        className="flex shrink-0 items-center gap-2 px-2.5 py-1.5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <span
          className="min-w-0 flex-1 truncate font-mono text-[9px]"
          title={dir}
          style={{ color: "rgba(255,255,255,0.28)" }}
        >
          {dir.split(/[\\/]/).slice(-2).join("/")}
        </span>
        {error && <span className="text-[9px] text-red-400/80" title={error}>!</span>}
        <button
          type="button"
          onClick={pickFolder}
          disabled={pickPending}
          className="shrink-0 rounded-[5px] px-1.5 py-0.5 text-[9px] uppercase tracking-widest transition-all duration-150 disabled:opacity-50"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
            color: "rgba(255,255,255,0.30)",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#c8c8d0"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.30)"; }}
        >
          change
        </button>
      </div>

      {/* Grid */}
      {images.length === 0 ? (
        <div
          className="flex flex-1 items-center justify-center text-[10px] uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.18)" }}
        >
          No images here.
        </div>
      ) : (
        <div className="grid flex-1 auto-rows-min grid-cols-4 gap-1.5 overflow-y-auto p-2 no-scrollbar">
          {images.map((path) => {
            const isSel = path.replace(/\\/g, "/") === selectedNorm;
            return (
              <button
                key={path}
                type="button"
                onClick={() => selectImage(path)}
                title={path.split(/[\\/]/).pop() ?? path}
                className="group relative aspect-square overflow-hidden rounded-lg transition-all duration-150"
                style={{
                  border: isSel
                    ? "1.5px solid rgba(155,114,239,0.80)"
                    : "1px solid rgba(255,255,255,0.06)",
                  outline: isSel ? "1px solid rgba(155,114,239,0.25)" : "none",
                  outlineOffset: 2,
                }}
                onMouseEnter={(e) => {
                  if (!isSel) (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.14)";
                }}
                onMouseLeave={(e) => {
                  if (!isSel) (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.06)";
                }}
              >
                <img
                  src={localToAsset(path)}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover transition-opacity duration-150"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.15"; }}
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Count */}
      <div
        className="shrink-0 px-2.5 py-1"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        <span className="font-mono text-[8.5px]" style={{ color: "rgba(255,255,255,0.18)" }}>
          {images.length} image{images.length !== 1 ? "s" : ""}
          {selected && ` · ${selected.split(/[\\/]/).pop()}`}
        </span>
      </div>
    </div>
  );
}
