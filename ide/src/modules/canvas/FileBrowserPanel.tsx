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

function entryIcon(name: string, kind: string): [string, string] {
  if (kind === "dir")     return ["▶", "#f59e0b"];
  if (kind === "symlink") return ["⇢", "#888888"];
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, [string, string]> = {
    md:   ["◈", "#9b72ef"], html: ["◎", "#f97316"], htm: ["◎", "#f97316"],
    json: ["⊙", "#eab308"], yaml: ["⊙", "#eab308"], yml: ["⊙", "#eab308"],
    toml: ["⊙", "#f59e0b"], csv:  ["⊟", "#4ade80"],
    js:   ["⬡", "#eab308"], jsx:  ["⬡", "#61dafb"], ts: ["⬡", "#3b82f6"],
    tsx:  ["⬡", "#61dafb"], py: ["⬡", "#3b82f6"],   rs: ["⬡", "#f97316"],
    go:   ["⬡", "#22d3ee"], c: ["⬡", "#888888"],    cpp: ["⬡", "#888888"],
    css:  ["⬟", "#ec4899"], scss: ["⬟", "#ec4899"],
    png:  ["▣", "#4ade80"], jpg: ["▣", "#4ade80"],   jpeg: ["▣", "#4ade80"],
    gif:  ["▣", "#4ade80"], svg: ["▣", "#a78bfa"],   webp: ["▣", "#4ade80"],
    sh:   ["▷", "#22d3ee"], bat: ["▷", "#22d3ee"],   env: ["⊞", "#f59e0b"],
    txt:  ["▤", "#888888"], log: ["▤", "#555555"],
  };
  return map[ext] ?? ["▤", "#555555"];
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`;
  return `${(bytes / 1024 / 1024).toFixed(1)}M`;
}

export function FileBrowserPanel({ panel }: { panel: CanvasPanelNode }) {
  const workspaceRoot = usePreferencesStore((s) => s.workspaceRoot) ?? "c:\\Atlas OS";
  const addPanel      = useCanvasStore((s) => s.addPanel);
  const updatePanel   = useCanvasStore((s) => s.updatePanel);

  const setOutputData   = useCanvasStore((s) => s.setOutputData);

  const initCwd = (panel.meta?.cwd as string | undefined) ?? workspaceRoot;
  const [cwd, setCwd]         = useState(initCwd);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [vaultCats, setVaultCats] = useState<string[]>([]);
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

  // Load vault categories for sidebar
  useEffect(() => {
    const vaultPath = workspaceRoot.replace(/\\/g, "/") + "/vault";
    invoke<DirEntry[]>("fs_read_dir", { path: vaultPath })
      .then((res) => setVaultCats(res.filter((e) => e.kind === "dir").map((e) => e.name)))
      .catch(() => undefined);
  }, [workspaceRoot]);

  useEffect(() => { void loadDir(initCwd); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClick = (entry: DirEntry) => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      if (entry.kind === "dir") {
        void loadDir(`${cwd}\\${entry.name}`.replace(/\//g, "\\"));
      } else {
        const path = `${cwd}\\${entry.name}`.replace(/\//g, "\\");
        const editorId = addPanel("editor", { x: panel.x + panel.width + 20, y: panel.y });
        updatePanel(editorId, { title: entry.name, meta: { path } });
      }
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        setSelected(entry.name);
        // Push file content to the output wire so connected nodes see it.
        if (entry.kind === "file") {
          const path = `${cwd}\\${entry.name}`.replace(/\//g, "\\");
          invoke<string>("fs_read_file", { path })
            .then((content) => {
              setOutputData(panel.id, { kind: "text", value: content.slice(0, 8000) });
            })
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

  // Pinned quick-access folders
  const pinned = [
    { label: "Vault",   path: workspaceRoot + "\\vault",  color: "#9b72ef" },
    { label: "Project", path: workspaceRoot,               color: "#5b8def" },
    { label: "Canvas",  path: workspaceRoot + "\\ide\\src\\modules\\canvas", color: "#4db89a" },
    { label: "Output",  path: workspaceRoot + "\\output",  color: "#d4a843" },
  ];

  const SidebarSection = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="mb-1">
      <div className="px-2 pt-2.5 pb-1 font-mono text-[9px] uppercase tracking-widest text-[#3a3a3a]">
        {label}
      </div>
      {children}
    </div>
  );

  const SidebarBtn = ({
    label, color, onClick, active,
  }: { label: string; color?: string; onClick: () => void; active: boolean }) => (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex w-full items-center gap-2 rounded-[5px] px-2 py-1 text-left text-[11px] transition-colors duration-150",
        active
          ? "bg-[#1a1a1a] text-[#f5f5f5]"
          : "text-[#7a7873] hover:bg-[#141414] hover:text-[#f5f5f5]",
      ].join(" ")}
    >
      {color && (
        <span className="shrink-0 rounded-[3px] text-[9px]" style={{ color }}>{color ? "◈" : ""}</span>
      )}
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <div className="flex h-full flex-col bg-[#0a0a0a] text-[#f5f5f5]">
      {/* Breadcrumb bar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-[#1e1e1e] bg-[#111111] px-2 py-1">
        <button
          onClick={goUp}
          className="rounded px-1.5 py-0.5 text-[10px] text-[#555] transition-colors duration-150 hover:bg-[#1a1a1a] hover:text-[#f5f5f5]"
          title="Go up"
        >↑</button>
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-0.5">
              {i > 0 && <span className="text-[9px] text-[#333]">\</span>}
              <button
                onClick={() => {
                  const path = segments.slice(0, i + 1).join("\\");
                  void loadDir(path.includes(":") ? path : "\\" + path);
                }}
                className="max-w-[90px] truncate rounded px-1 py-0.5 text-[10px] text-[#888] transition-colors duration-150 hover:bg-[#1a1a1a] hover:text-[#f5f5f5]"
              >{seg}</button>
            </span>
          ))}
        </div>
        <button
          onClick={() => void loadDir(cwd)}
          className="rounded px-1.5 py-0.5 text-[10px] text-[#444] transition-colors duration-150 hover:text-[#888]"
          title="Refresh"
        >↺</button>
      </div>

      {/* Body: sidebar + file list */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <div className="w-[130px] shrink-0 overflow-y-auto border-r border-[#1e1e1e] bg-[#0d0d0d] py-1 no-scrollbar">
          <SidebarSection label="Pinned">
            {pinned.map((p) => (
              <SidebarBtn
                key={p.label}
                label={p.label}
                color={p.color}
                active={cwd.startsWith(p.path.replace(/\//g, "\\"))}
                onClick={() => void loadDir(p.path.replace(/\//g, "\\"))}
              />
            ))}
          </SidebarSection>

          {vaultCats.length > 0 && (
            <SidebarSection label="Vault">
              {vaultCats.map((cat) => {
                const catPath = (workspaceRoot + "\\vault\\" + cat).replace(/\//g, "\\");
                return (
                  <SidebarBtn
                    key={cat}
                    label={cat}
                    color="#88a0c8"
                    active={cwd === catPath}
                    onClick={() => void loadDir(catPath)}
                  />
                );
              })}
            </SidebarSection>
          )}

          <SidebarSection label="Files">
            <SidebarBtn
              label="IDE src"
              color="#4db89a"
              active={cwd.includes("ide\\src")}
              onClick={() => void loadDir((workspaceRoot + "\\ide\\src").replace(/\//g, "\\"))}
            />
            <SidebarBtn
              label="Tools"
              color="#e07b54"
              active={cwd.endsWith("tools")}
              onClick={() => void loadDir((workspaceRoot + "\\tools").replace(/\//g, "\\"))}
            />
          </SidebarSection>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto p-1 no-scrollbar">
          {loading && (
            <div className="flex h-16 items-center justify-center text-[10px] text-[#444]">Loading…</div>
          )}
          {error && (
            <div className="px-2 py-1 text-[10px] text-red-500/80">{error}</div>
          )}
          {!loading && !error && entries.length === 0 && (
            <div className="flex h-16 items-center justify-center text-[10px] text-[#444]">Empty</div>
          )}
          {!loading && entries.map((entry) => {
            const [glyph, color] = entryIcon(entry.name, entry.kind);
            const isSelected = entry.name === selected;
            return (
              <button
                key={entry.name}
                onClick={() => handleClick(entry)}
                className={[
                  "flex w-full items-center gap-2 rounded-[4px] px-2 py-[5px] text-left transition-colors duration-150",
                  isSelected
                    ? "bg-[#5b8def]/12 text-[#f5f5f5]"
                    : "text-[#aaa9a4] hover:bg-[#141414] hover:text-[#f5f5f5]",
                ].join(" ")}
              >
                <span className="shrink-0 text-[11px] leading-none w-[14px] text-center" style={{ color }}>
                  {glyph}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px]">{entry.name}</span>
                {entry.kind === "file" && (
                  <span className="shrink-0 font-mono text-[9px] text-[#3a3a3a]">{fmtSize(entry.size)}</span>
                )}
                {entry.kind === "dir" && (
                  <span className="shrink-0 text-[9px] text-[#333]">›</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex shrink-0 items-center justify-between border-t border-[#1e1e1e] bg-[#0d0d0d] px-2 py-0.5">
        <span className="font-mono text-[9px] text-[#3a3a3a]">
          {entries.length} item{entries.length !== 1 ? "s" : ""}
        </span>
        {selected && (
          <span className="max-w-[140px] truncate font-mono text-[9px] text-[#555]">{selected}</span>
        )}
      </div>
    </div>
  );
}
