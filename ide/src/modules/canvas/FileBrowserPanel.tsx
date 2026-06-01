import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCanvasStore } from "./canvasStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { CanvasPanelNode } from "./types";

interface DirEntry { name: string; kind: "file" | "dir" | "symlink"; size: number; mtime: number; }

function entryIcon(name: string, kind: string): [string, string] {
  if (kind === "dir")     return ["▶", "#f59e0b"];
  if (kind === "symlink") return ["⇢", "#888888"];
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, [string, string]> = {
    md: ["◈","#9b72ef"], html: ["◎","#f97316"], htm: ["◎","#f97316"],
    json: ["⊙","#eab308"], yaml: ["⊙","#eab308"], yml: ["⊙","#eab308"],
    toml: ["⊙","#f59e0b"], csv: ["⊟","#4ade80"],
    js: ["⬡","#eab308"], jsx: ["⬡","#61dafb"], ts: ["⬡","#3b82f6"], tsx: ["⬡","#61dafb"],
    py: ["⬡","#3b82f6"], rs: ["⬡","#f97316"], go: ["⬡","#22d3ee"],
    c: ["⬡","#888888"], cpp: ["⬡","#888888"],
    css: ["⬟","#ec4899"], scss: ["⬟","#ec4899"],
    png: ["▣","#4ade80"], jpg: ["▣","#4ade80"], jpeg: ["▣","#4ade80"],
    gif: ["▣","#4ade80"], svg: ["▣","#a78bfa"], webp: ["▣","#4ade80"],
    sh: ["▷","#22d3ee"], bat: ["▷","#22d3ee"], env: ["⊞","#f59e0b"],
    txt: ["▤","#888888"], log: ["▤","#555555"],
  };
  return map[ext] ?? ["▤", "#555555"];
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`;
  return `${(bytes / 1024 / 1024).toFixed(1)}M`;
}

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "avif"]);

type SortField = "name" | "size" | "type" | "date";
type SortDir   = "asc" | "desc";
type ViewMode  = "list" | "small" | "large";

export function FileBrowserPanel({ panel }: { panel: CanvasPanelNode }) {
  const workspaceRoot = usePreferencesStore((s) => s.workspaceRoot) ?? "c:\\Sentor";
  const addPanel      = useCanvasStore((s) => s.addPanel);
  const updatePanel   = useCanvasStore((s) => s.updatePanel);
  const setOutputData = useCanvasStore((s) => s.setOutputData);

  const initCwd = (panel.meta?.cwd as string | undefined) ?? workspaceRoot;
  const [cwd, setCwd]         = useState(initCwd);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [vaultCats, setVaultCats] = useState<string[]>([]);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [viewMode,  setViewMode]  = useState<ViewMode>(
    () => (panel.meta?.viewMode  as ViewMode  | undefined) ?? "list",
  );
  const [sortField, setSortField] = useState<SortField>(
    () => (panel.meta?.sortField as SortField | undefined) ?? "name",
  );
  const [sortDir,   setSortDir]   = useState<SortDir>(
    () => (panel.meta?.sortDir   as SortDir   | undefined) ?? "asc",
  );

  const loadDir = useCallback(async (path: string) => {
    setLoading(true); setError(null); setSelected(null);
    try {
      const result = await invoke<DirEntry[]>("fs_read_dir", { path });
      setEntries(result); setCwd(path);
      updatePanel(panel.id, { meta: { ...panel.meta, cwd: path } });
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [panel.id, panel.meta, updatePanel]);

  useEffect(() => {
    const vaultPath = workspaceRoot.replace(/\\/g, "/") + "/vault";
    invoke<DirEntry[]>("fs_read_dir", { path: vaultPath })
      .then((res) => setVaultCats(res.filter((e) => e.kind === "dir").map((e) => e.name)))
      .catch(() => undefined);
  }, [workspaceRoot]);

  const sorted = useMemo(() => {
    const arr = [...entries];
    arr.sort((a, b) => {
      if (a.kind === "dir" && b.kind !== "dir") return -1;
      if (b.kind === "dir" && a.kind !== "dir") return  1;
      let cmp = 0;
      switch (sortField) {
        case "name": cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" }); break;
        case "size": cmp = a.size - b.size; break;
        case "type": {
          const ea = a.name.split(".").pop()?.toLowerCase() ?? "";
          const eb = b.name.split(".").pop()?.toLowerCase() ?? "";
          cmp = ea.localeCompare(eb);
          break;
        }
        case "date": cmp = a.mtime - b.mtime; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [entries, sortField, sortDir]);

  useEffect(() => { void loadDir(initCwd); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    updatePanel(panel.id, {
      meta: { ...panel.meta, viewMode, sortField, sortDir },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, sortField, sortDir]);

  const handleClick = (entry: DirEntry) => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current); clickTimer.current = null;
      if (entry.kind === "dir") {
        void loadDir(`${cwd}\\${entry.name}`.replace(/\//g, "\\"));
      } else {
        const path = `${cwd}\\${entry.name}`.replace(/\//g, "\\");
        const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
        if (IMAGE_EXTS.has(ext)) {
          const prevId = addPanel("preview", { x: panel.x + panel.width + 20, y: panel.y });
          updatePanel(prevId, { title: entry.name, meta: { path } });
        } else {
          const editorId = addPanel("editor", { x: panel.x + panel.width + 20, y: panel.y });
          updatePanel(editorId, { title: entry.name, meta: { path } });
        }
      }
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        setSelected(entry.name);
        if (entry.kind === "file") {
          const path = `${cwd}\\${entry.name}`.replace(/\//g, "\\");
          invoke<string>("fs_read_file", { path })
            .then((content) => setOutputData(panel.id, { kind: "text", value: content.slice(0, 8000) }))
            .catch(() => undefined);
        }
      }, 220);
    }
  };

  const goUp = () => {
    const parts = cwd.replace(/\//g, "\\").split("\\");
    if (parts.length <= 1) return;
    parts.pop();
    void loadDir(parts.join("\\") || "\\");
  };

  const segments = cwd.replace(/\//g, "\\").split("\\").filter(Boolean);

  const pinned = [
    { label: "Vault",   path: workspaceRoot + "\\vault",  color: "#9b72ef" },
    { label: "Project", path: workspaceRoot,               color: "#5b8def" },
    { label: "Canvas",  path: workspaceRoot + "\\ide\\src\\modules\\canvas", color: "#4db89a" },
    { label: "Output",  path: workspaceRoot + "\\output",  color: "#d4a843" },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Breadcrumb bar */}
      <div
        className="flex shrink-0 items-center gap-1 px-2 py-1"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <button
          onClick={goUp}
          className="rounded-[5px] px-1.5 py-0.5 text-[10px] transition-all duration-150"
          style={{ color: "rgba(255,255,255,0.28)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#c8c8d0"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.28)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          title="Go up"
        >↑</button>

        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-0.5">
              {i > 0 && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.15)" }}>\</span>}
              <button
                onClick={() => {
                  const path = segments.slice(0, i + 1).join("\\");
                  void loadDir(path.includes(":") ? path : "\\" + path);
                }}
                className="max-w-[80px] truncate rounded-[4px] px-1 py-0.5 text-[9px] transition-all duration-150"
                style={{ color: "rgba(255,255,255,0.38)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#c8c8d0"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.38)"; }}
              >
                {seg}
              </button>
            </span>
          ))}
        </div>

        <button
          onClick={() => void loadDir(cwd)}
          className="rounded-[5px] px-1.5 py-0.5 text-[10px] transition-all duration-150"
          style={{ color: "rgba(255,255,255,0.20)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#c8c8d0"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.20)"; }}
          title="Refresh"
        >↺</button>
      </div>

      {/* Toolbar: sort + view mode */}
      <div
        className="flex shrink-0 items-center justify-between px-2 py-[3px]"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
      >
        {/* Sort buttons */}
        <div className="flex items-center gap-0.5">
          {(["name", "size", "type", "date"] as SortField[]).map(field => {
            const active = sortField === field;
            return (
              <button
                key={field}
                type="button"
                onClick={() => {
                  if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
                  else { setSortField(field); setSortDir("asc"); }
                }}
                className="flex items-center gap-0.5 rounded-[4px] px-1.5 py-0.5 transition-all duration-150"
                style={{
                  fontSize: 8,
                  fontFamily: "monospace",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.04em",
                  background: active ? "rgba(91,141,239,0.12)" : "transparent",
                  color: active ? "#5b8def" : "rgba(255,255,255,0.28)",
                  border: active ? "1px solid rgba(91,141,239,0.22)" : "1px solid transparent",
                }}
              >
                {field === "name" ? "Ad" : field === "size" ? "Boy" : field === "type" ? "Tür" : "Tarih"}
                {active && (
                  <span style={{ fontSize: 7, lineHeight: 1 }}>
                    {sortDir === "asc" ? "↑" : "↓"}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* View mode buttons */}
        <div className="flex items-center gap-0.5">
          {([
            ["list",  "≡", "Liste"],
            ["small", "⊞", "Küçük simgeler"],
            ["large", "⊟", "Büyük simgeler"],
          ] as [ViewMode, string, string][]).map(([mode, icon, title]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              title={title}
              className="flex h-[18px] w-[18px] items-center justify-center rounded-[4px] transition-all duration-150"
              style={{
                fontSize: 10,
                background: viewMode === mode ? "rgba(255,255,255,0.10)" : "transparent",
                color: viewMode === mode ? "#c8c8d0" : "rgba(255,255,255,0.28)",
              }}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* Body: sidebar + file list */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <div
          className="w-[120px] shrink-0 overflow-y-auto py-1.5 no-scrollbar"
          style={{ borderRight: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div className="px-2 pb-1">
            <span
              className="font-mono text-[8px] uppercase tracking-widest"
              style={{ color: "rgba(255,255,255,0.18)" }}
            >
              Pinned
            </span>
          </div>
          {pinned.map((p) => {
            const isActive = cwd.startsWith(p.path.replace(/\//g, "\\"));
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => void loadDir(p.path.replace(/\//g, "\\"))}
                className="flex w-full items-center gap-1.5 rounded-[5px] px-2 py-1 text-left text-[10.5px] transition-all duration-150"
                style={{
                  background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
                  color: isActive ? "#c8c8d0" : "rgba(255,255,255,0.35)",
                }}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                <span className="text-[9px]" style={{ color: p.color }}>◈</span>
                <span className="truncate">{p.label}</span>
              </button>
            );
          })}

          {vaultCats.length > 0 && (
            <>
              <div className="px-2 pb-1 pt-2.5">
                <span
                  className="font-mono text-[8px] uppercase tracking-widest"
                  style={{ color: "rgba(255,255,255,0.18)" }}
                >
                  Vault
                </span>
              </div>
              {vaultCats.map((cat) => {
                const catPath = (workspaceRoot + "\\vault\\" + cat).replace(/\//g, "\\");
                const isActive = cwd === catPath;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => void loadDir(catPath)}
                    className="flex w-full items-center gap-1.5 rounded-[5px] px-2 py-1 text-left text-[10.5px] transition-all duration-150"
                    style={{
                      background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
                      color: isActive ? "#c8c8d0" : "rgba(255,255,255,0.35)",
                    }}
                    onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
                    onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                  >
                    <span className="text-[9px]" style={{ color: "#88a0c8" }}>◈</span>
                    <span className="truncate">{cat}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* File list — list / small-grid / large-grid */}
        <div
          className={viewMode === "list"
            ? "flex-1 overflow-y-auto p-1 no-scrollbar"
            : "flex-1 overflow-y-auto p-1.5 no-scrollbar"}
          style={viewMode !== "list" ? {
            display: "grid",
            gridTemplateColumns: viewMode === "large" ? "1fr 1fr" : "1fr 1fr 1fr 1fr",
            gap: 4,
            alignContent: "start",
          } : undefined}
        >
          {loading && (
            <div className="flex h-12 items-center justify-center font-mono text-[9px]"
              style={{ color: "rgba(255,255,255,0.18)", gridColumn: "1 / -1" }}>
              Loading…
            </div>
          )}
          {error && (
            <div className="px-2 py-1 text-[9px] text-red-400/70"
              style={{ gridColumn: "1 / -1" }}>{error}</div>
          )}
          {!loading && !error && sorted.length === 0 && (
            <div className="flex h-12 items-center justify-center font-mono text-[9px]"
              style={{ color: "rgba(255,255,255,0.18)", gridColumn: "1 / -1" }}>
              Empty
            </div>
          )}

          {/* LIST VIEW */}
          {!loading && viewMode === "list" && sorted.map((entry) => {
            const [glyph, color] = entryIcon(entry.name, entry.kind);
            const isSel = entry.name === selected;
            return (
              <button
                key={entry.name}
                onClick={() => handleClick(entry)}
                className="flex w-full items-center gap-1.5 rounded-[5px] px-2 py-[4px] text-left transition-all duration-150"
                style={{
                  background: isSel ? "rgba(91,141,239,0.10)" : "transparent",
                  color: isSel ? "#c8c8d0" : "rgba(255,255,255,0.45)",
                }}
                onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                <span className="w-[13px] shrink-0 text-center text-[10px] leading-none" style={{ color }}>
                  {glyph}
                </span>
                <span className="min-w-0 flex-1 truncate text-[10.5px]">{entry.name}</span>
                {entry.kind === "file" && (
                  <span className="shrink-0 font-mono text-[8px]" style={{ color: "rgba(255,255,255,0.18)" }}>
                    {fmtSize(entry.size)}
                  </span>
                )}
                {entry.kind === "dir" && (
                  <span className="shrink-0 text-[9px]" style={{ color: "rgba(255,255,255,0.20)" }}>›</span>
                )}
              </button>
            );
          })}

          {/* GRID VIEW (small = 4 cols, large = 2 cols) */}
          {!loading && viewMode !== "list" && sorted.map((entry) => {
            const [glyph, color] = entryIcon(entry.name, entry.kind);
            const isSel = entry.name === selected;
            const iconSize = viewMode === "large" ? 28 : 18;
            return (
              <button
                key={entry.name}
                onClick={() => handleClick(entry)}
                className="flex flex-col items-center rounded-[6px] transition-all duration-150"
                style={{
                  padding: viewMode === "large" ? "8px 4px 6px" : "5px 2px 4px",
                  background: isSel ? "rgba(91,141,239,0.10)" : "transparent",
                  gap: 3,
                }}
                onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                <span style={{ fontSize: iconSize, lineHeight: 1, color }}>{glyph}</span>
                <span
                  className="w-full text-center leading-tight"
                  style={{
                    fontSize: viewMode === "large" ? 9 : 8,
                    color: isSel ? "#c8c8d0" : "rgba(255,255,255,0.55)",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical" as const,
                    overflow: "hidden",
                    wordBreak: "break-all",
                  }}
                >
                  {entry.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Status bar */}
      <div
        className="flex shrink-0 items-center justify-between px-2.5 py-0.5"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        <span className="font-mono text-[8px]" style={{ color: "rgba(255,255,255,0.18)" }}>
          {entries.length} item{entries.length !== 1 ? "s" : ""}
        </span>
        {selected && (
          <span className="max-w-[140px] truncate font-mono text-[8px]" style={{ color: "rgba(255,255,255,0.28)" }}>
            {selected}
          </span>
        )}
      </div>
    </div>
  );
}
