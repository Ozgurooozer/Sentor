import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { localToAsset } from "@/modules/browser/assetUrl";
import type { DirEntry } from "@/modules/ai/lib/native";
import { useCanvasStore } from "./canvasStore";
import type { CanvasPanelNode } from "./types";

/**
 * Gallery node — pick a folder, browse images inside it, wire one to chat
 * as an image attachment. Useful for moodboards, colour palettes, screenshot
 * references that the AI should look at as part of a prompt.
 *
 * Storage:
 *   panel.meta.dir        — currently-browsed folder (absolute path)
 *   panel.meta.selected   — absolute path of the actively-selected image
 *   panel.meta.outputData — { kind: "image", value: dataUrl } when selected
 */

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;
const MAX_THUMBNAILS = 64;

export function GalleryPanel({ panel }: { panel: CanvasPanelNode }) {
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const setOutputData = useCanvasStore((s) => s.setOutputData);

  const dir = (panel.meta?.dir as string | undefined) || "";
  const selected = (panel.meta?.selected as string | undefined) || "";
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pickPending, setPickPending] = useState(false);

  // ── Scan the configured folder for image files ────────────────────────────
  useEffect(() => {
    if (!dir) {
      setImages([]);
      return;
    }
    let alive = true;
    invoke<DirEntry[]>("fs_read_dir", { path: dir })
      .then((entries) => {
        if (!alive) return;
        const sep = dir.includes("\\") ? "\\" : "/";
        const matches = entries
          .filter((e) => e.kind === "file" && IMAGE_EXT.test(e.name))
          .slice(0, MAX_THUMBNAILS)
          .map((e) => `${dir}${sep}${e.name}`);
        setImages(matches);
        setError(null);
      })
      .catch((e) => {
        if (!alive) return;
        setImages([]);
        setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [dir]);

  const pickFolder = useCallback(async () => {
    setPickPending(true);
    try {
      const picked = await invoke<string | null>("pick_folder");
      if (picked) {
        updatePanel(panel.id, { meta: { ...panel.meta, dir: picked, selected: "" } });
        setOutputData(panel.id, null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setPickPending(false);
    }
  }, [panel.id, panel.meta, updatePanel, setOutputData]);

  const selectImage = useCallback(
    async (absPath: string) => {
      try {
        // Fetch via asset:// so the browser handles encoding (works for all types including SVG).
        const r = await fetch(localToAsset(absPath));
        if (!r.ok) throw new Error(`fetch ${r.status}`);
        const b = await r.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(b);
        });
        if (!dataUrl) return;
        updatePanel(panel.id, { meta: { ...panel.meta, selected: absPath } });
        setOutputData(panel.id, { kind: "image", value: dataUrl });
      } catch (e) {
        setError(String(e));
      }
    },
    [panel.id, panel.meta, updatePanel, setOutputData],
  );

  // Stable view of selected path for highlight comparison.
  const selectedNorm = useMemo(() => selected.replace(/\\/g, "/"), [selected]);

  if (!dir) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <span className="text-[11px] text-[#555]">No folder selected</span>
        <button
          type="button"
          onClick={pickFolder}
          disabled={pickPending}
          className="rounded border border-[#2a2a2a] bg-[#1a1a1a] px-2.5 py-1 text-[11px] text-[#f5f5f5] transition-colors duration-150 hover:border-[#404040] disabled:opacity-50"
        >
          {pickPending ? "Picking…" : "Pick folder"}
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-[#2a2a2a] bg-[#0d0d0d] px-2 py-1">
        <span className="min-w-0 flex-1 truncate text-[10px] text-[#888]" title={dir}>
          {dir}
        </span>
        <button
          type="button"
          onClick={pickFolder}
          disabled={pickPending}
          className="rounded px-1.5 py-0.5 text-[10px] text-[#888] transition-colors duration-150 hover:bg-[#1a1a1a] hover:text-[#f5f5f5]"
          title="Pick a different folder"
        >
          change
        </button>
      </div>

      {error && (
        <div className="shrink-0 px-2 py-1 text-[10px] text-red-400" title={error}>
          {error.length > 80 ? `${error.slice(0, 80)}…` : error}
        </div>
      )}

      {images.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-[11px] text-[#555]">
          No images here.
        </div>
      ) : (
        <div className="grid flex-1 auto-rows-min grid-cols-4 gap-1 overflow-y-auto p-1.5">
          {images.map((path) => {
            const isSel = path.replace(/\\/g, "/") === selectedNorm;
            return (
              <button
                key={path}
                type="button"
                onClick={() => selectImage(path)}
                title={path.split(/[\\/]/).pop() ?? path}
                className={cn(
                  "group relative aspect-square overflow-hidden rounded border bg-[#0a0a0a] transition-all duration-150",
                  isSel
                    ? "border-[#5b8def] ring-2 ring-[#5b8def]/40"
                    : "border-[#2a2a2a] hover:border-[#404040]",
                )}
              >
                <img
                  src={localToAsset(path)}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.opacity = "0.2";
                  }}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
