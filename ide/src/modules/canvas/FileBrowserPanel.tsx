import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCanvasStore } from "./canvasStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { CanvasPanelNode } from "./types";

interface DirEntry {
  name: string;
  kind: "file" | "dir" | "symlink";
  size: number;
  mtime: number;
}

// ── Icon system ───────────────────────────────────────────────────────────────
// Each entry returns [glyph, hex-color]. Designed for the Atlas dark palette.
function entryIcon(name: string, kind: string): [string, string] {
  if (kind === "dir") return ["▶", "#f59e0b"];
  if (kind === "symlink") return ["⇢", "#888888"];
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, [string, string]> = {
    // Markup / docs
    md:   ["◈", "#9b72ef"],
    html: ["◎", "#f97316"],
    htm:  ["◎", "#f97316"],
    // Data
    json: ["⊙", "#eab308"],
    yaml: ["⊙", "#eab308"],
    yml:  ["⊙", "#eab308"],
    toml: ["⊙", "#f59e0b"],
    csv:  ["⊟", "#4ade80"],
    // Web scripts
    js:   ["⬡", "#eab308"],
    jsx:  ["⬡", "#61dafb"],
    ts:   ["⬡", "#3b82f6"],
    tsx:  ["⬡", "#61dafb"],
    // Systems
    py:   ["⬡", "#3b82f6"],
    rs:   ["⬡", "#f97316"],
    go:   ["⬡", "#22d3ee"],
    c:    ["⬡", "#888888"],
    cpp:  ["⬡", "#888888"],
    // Style
    css:  ["⬟", "#ec4899"],
    scss: ["⬟", "#ec4899"],
    // Images
    png:  ["▣", "#4ade80"],
    jpg:  ["▣", "#4ade80"],
    jpeg: ["▣", "#4ade80"],
    gif:  ["▣", "#4ade80"],
    svg:  ["▣", "#a78bfa"],
    webp: ["▣", "#4ade80"],
    // Shell / config
    sh:   ["▷", "#22d3ee"],
    bat:  ["▷", "#22d3ee"],
    env:  ["⊞", "#f59e0b"],
    // Text
    txt:  ["▤", "#888888"],
    log:  ["▤", "#555555"],
  };
  return map[ext] ?? ["▤", "#555555"];
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function FileBrowserPanel({ panel }: { panel: CanvasPanelNode }) {
  const workspaceRoot = usePreferencesStore((s) => s.workspaceRoot) ?? "c:\\Atlas OS";
  const addPanel = useCanvasStore((s) => s.addPanel);
  const updatePanel = useCanvasStore((s) => s.updatePanel);

  const initCwd = (panel.meta?.cwd as string | undefined) ?? workspaceRoot;
  const [cwd, setCwd] = useState(initCwd);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDir = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      const result = await invoke<DirEntry[]>("fs_read_dir", { path });
      setEntries(result);
      setCwd(path);
      updatePanel(panel.id, { meta: { ...panel.meta, cwd: path } });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [panel.id, panel.meta, updatePanel]);

  useEffect(() => { void loadDir(initCwd); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClick = (entry: DirEntry) => {
    if (clickTimer.current) {
      // Double-click
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      if (entry.kind === "dir") {
        void loadDir(`${cwd}\\${entry.name}`.replace(/\//g, "\\"));
      } else {
        // Open in editor panel nearby
        const path = `${cwd}\\${entry.name}`.replace(/\//g, "\\");
        const editorId = addPanel("editor", { x: panel.x + panel.width + 20, y: panel.y });
        updatePanel(editorId, { title: entry.name, meta: { path } });
      }
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        setSelected(entry.name);
      }, 220);
    }
  };

  const goUp = () => {
    const parts = cwd.replace(/\//g, "\\").split("\\");
    if (parts.length <= 1) return;
    parts.pop();
    void loadDir(parts.join("\\") || "\\");
  };

  // Breadcrumb segments
  const segments = cwd.replace(/\//g, "\\").split("\\").filter(Boolean);

  return (
    <div className="flex h-full flex-col bg-[#0a0a0a] text-[#f5f5f5]">
      {/* Breadcrumb bar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-[#2a2a2a] bg-[#111111] px-2 py-1">
        <button
          onClick={goUp}
          className="rounded px-1.5 py-0.5 text-[10px] text-[#888] transition-colors duration-150 hover:bg-[#1a1a1a] hover:text-[#f5f5f5]"
          title="Go up"
        >
          ↑
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-0.5">
              {i > 0 && <span className="text-[9px] text-[#444]">\</span>}
              <button
                onClick={() => {
                  const path = segments.slice(0, i + 1).join("\\");
                  void loadDir(path.includes(":") ? path : "\\" + path);
                }}
                className="max-w-[100px] truncate rounded px-1 py-0.5 text-[10px] text-[#888] transition-colors duration-150 hover:bg-[#1a1a1a] hover:text-[#f5f5f5]"
              >
                {seg}
              </button>
            </span>
          ))}
        </div>
        <button
          onClick={() => void loadDir(cwd)}
          className="rounded px-1.5 py-0.5 text-[10px] text-[#555] transition-colors duration-150 hover:text-[#888]"
          title="Refresh"
        >
          ↺
        </button>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto p-1">
        {loading && (
          <div className="flex h-16 items-center justify-center text-[10px] text-[#444]">
            Loading…
          </div>
        )}
        {error && (
          <div className="px-2 py-1 text-[10px] text-red-500">{error}</div>
        )}
        {!loading && !error && entries.length === 0 && (
          <div className="flex h-16 items-center justify-center text-[10px] text-[#444]">
            Empty folder
          </div>
        )}
        {!loading &&
          entries.map((entry) => {
            const [glyph, color] = entryIcon(entry.name, entry.kind);
            const isSelected = entry.name === selected;
            return (
              <button
                key={entry.name}
                onClick={() => handleClick(entry)}
                className={[
                  "flex w-full items-center gap-2 rounded px-2 py-1 text-left transition-colors duration-150",
                  isSelected
                    ? "bg-[#5b8def]/15 text-[#f5f5f5]"
                    : "text-[#c0c0c0] hover:bg-[#1a1a1a] hover:text-[#f5f5f5]",
                ].join(" ")}
              >
                {/* Icon */}
                <span
                  className="shrink-0 text-[11px] leading-none"
                  style={{ color }}
                >
                  {glyph}
                </span>
                {/* Name */}
                <span className="min-w-0 flex-1 truncate text-[11px]">
                  {entry.name}
                </span>
                {/* Size (files only) */}
                {entry.kind === "file" && (
                  <span className="shrink-0 text-[9px] text-[#444]">
                    {fmtSize(entry.size)}
                  </span>
                )}
                {/* Dir chevron */}
                {entry.kind === "dir" && (
                  <span className="shrink-0 text-[9px] text-[#444]">›</span>
                )}
              </button>
            );
          })}
      </div>

      {/* Status bar */}
      <div className="flex shrink-0 items-center justify-between border-t border-[#2a2a2a] bg-[#111111] px-2 py-0.5">
        <span className="text-[9px] text-[#444]">
          {entries.length} item{entries.length !== 1 ? "s" : ""}
        </span>
        {selected && (
          <span className="max-w-[160px] truncate text-[9px] text-[#666]">{selected}</span>
        )}
      </div>
    </div>
  );
}
