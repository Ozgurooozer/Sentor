import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { setWorkspaceRoot } from "@/modules/settings/store";
import { webLayerManager } from "@/modules/canvas/webLayer/WebLayerManager";

// ── Types ──────────────────────────────────────────────────────────────────

interface DirEntry {
  name: string;
  kind: "file" | "dir" | "symlink";
}

interface Build {
  folder: string;
  version: string;
  dateLabel: string;
  exePath: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parseFolder(name: string, root: string): Build | null {
  const m = name.match(/^atlas-studio-v([\d.]+)-(\d{8})$/);
  if (!m) return null;
  const [, version, d] = m;
  const dateLabel = `${d.slice(6, 8)}.${d.slice(4, 6)}.${d.slice(0, 4)}`;
  return {
    folder: name,
    version,
    dateLabel,
    exePath: `${root}\\build\\${name}\\atlas.exe`,
  };
}

const RECENT_KEY = "atlas-recent-roots";

function getRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[]; }
  catch { return []; }
}

function pushRecent(path: string): string[] {
  const next = [path, ...getRecent().filter((p) => p !== path)].slice(0, 6);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  workspaceRoot: string;
  onStudio: () => void;
  onBuild: (exePath: string, name: string) => void;
  onRootChange: (newRoot: string) => void;
}

export function LauncherScreen({ workspaceRoot, onStudio, onBuild, onRootChange }: Props) {
  const normalize = (p: string) => p.replace(/\//g, "\\");
  const [currentRoot, setCurrentRoot] = useState(() => normalize(workspaceRoot));
  const [builds, setBuilds] = useState<Build[]>([]);
  const [recent, setRecent] = useState<string[]>(() => getRecent());

  // Hide all native WebViews — they sit above every z-index.
  useEffect(() => {
    void webLayerManager.hideAll();
    // Also hide any that finish hydrating after the initial mount.
    const t = setTimeout(() => void webLayerManager.hideAll(), 800);
    return () => clearTimeout(t);
  }, []);

  // Reload builds whenever the workspace root changes.
  useEffect(() => {
    const root = normalize(currentRoot);
    invoke<DirEntry[]>("fs_read_dir", { path: `${root}\\build` })
      .then((entries) => {
        const parsed = entries
          .filter((e) => e.kind === "dir")
          .map((e) => parseFolder(e.name, root))
          .filter((b): b is Build => b !== null)
          .reverse();
        setBuilds(parsed);
      })
      .catch(() => setBuilds([]));
  }, [currentRoot]);

  const applyRoot = async (picked: string) => {
    const r = normalize(picked);
    setCurrentRoot(r);
    setRecent(pushRecent(r));
    await setWorkspaceRoot(r);
    onRootChange(r);
  };

  const handleOpenFolder = async () => {
    const picked = await invoke<string | null>("pick_folder");
    if (picked) await applyRoot(picked);
  };

  // ── Render ─────────────────────────────────────────────────────────────

  const actionBtn = (label: string, icon: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 rounded px-2 py-1.5 text-left text-[12px] text-[#777]
        transition-colors hover:bg-[#181818] hover:text-[#d0d0d0]"
    >
      <span className="w-4 text-center text-[11px] text-[#555]">{icon}</span>
      {label}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-[#0a0a0a]"
      style={{ animation: "launcherFadeIn 280ms ease-out" }}
    >
      {/* ── Title bar drag region ────────────────────────────────────────── */}
      <div
        data-tauri-drag-region
        className="flex h-8 w-full shrink-0 select-none items-center border-b border-[#111] pr-[140px]"
      >
        <span
          data-tauri-drag-region
          className="ml-4 font-mono text-[9px] tracking-[0.35em] uppercase text-[#2a2a2a]"
        >
          Atlas OS Studio
        </span>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">

      {/* ── Left panel ──────────────────────────────────────────────────── */}
      <div className="flex w-64 shrink-0 flex-col gap-7 overflow-y-auto border-r border-[#171717] px-7 py-8">

        {/* Logo */}
        <div className="flex flex-col gap-0.5 select-none">
          <span className="font-mono text-[9px] tracking-[0.4em] uppercase text-[#383838]">Atlas OS</span>
          <span className="text-[26px] font-semibold leading-tight text-[#f0f0f0]">Studio</span>
        </div>

        {/* Quick actions */}
        <div className="flex flex-col gap-0.5">
          <div className="mb-1.5 font-mono text-[9px] tracking-widest uppercase text-[#3a3a3a]">Başla</div>
          {actionBtn("Klasör Aç…", "⊕", () => void handleOpenFolder())}
        </div>

        {/* Active workspace */}
        <div className="flex flex-col gap-1.5">
          <div className="font-mono text-[9px] tracking-widest uppercase text-[#3a3a3a]">Aktif</div>
          <div
            title={currentRoot}
            className="rounded bg-[#111] px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-[#5b8def] break-all"
          >
            {currentRoot}
          </div>
        </div>

        {/* Recent workspaces */}
        {recent.filter((r) => r !== currentRoot).length > 0 && (
          <div className="flex flex-col gap-0.5">
            <div className="mb-1.5 font-mono text-[9px] tracking-widest uppercase text-[#3a3a3a]">Son</div>
            {recent
              .filter((r) => r !== currentRoot)
              .slice(0, 4)
              .map((r) => (
                <button
                  key={r}
                  type="button"
                  title={r}
                  onClick={() => void applyRoot(r)}
                  className="truncate rounded px-2 py-1 text-left font-mono text-[10px] text-[#555]
                    transition-colors hover:bg-[#181818] hover:text-[#999]"
                >
                  {r.split("\\").pop() ?? r}
                  <span className="ml-1 text-[#3a3a3a]">
                    {r.split("\\").slice(0, -1).join("\\") || r}
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>

      {/* ── Right panel — builds ─────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 overflow-y-auto p-10">

        <p className="select-none text-[11px] text-[#444]">Hangi ortamı açmak istiyorsun?</p>

        <div className="flex flex-wrap items-stretch justify-center gap-3">

          {/* Studio card */}
          <button
            type="button"
            onClick={onStudio}
            className="group flex w-52 flex-col gap-3 rounded-xl border border-[#5b8def]/30 bg-[#0d1525]
              p-5 text-left transition-all duration-150 hover:border-[#5b8def]/60 hover:bg-[#10192e]"
          >
            <div className="font-mono text-[9px] tracking-[0.3em] uppercase text-[#5b8def]">Geliştirme</div>
            <div className="text-[15px] font-semibold text-[#f0f0f0]">Atlas OS Studio</div>
            <div className="text-[11px] leading-relaxed text-[#4a4a4a]">
              Kaynak kod · Canvas · AI araçlar
            </div>
            <div className="mt-auto text-[11px] font-medium text-[#5b8def]
              transition-transform group-hover:translate-x-0.5">
              Geliştirme ortamını aç →
            </div>
          </button>

          {/* Build cards */}
          {builds.map((b) => (
            <button
              key={b.folder}
              type="button"
              onClick={() => onBuild(b.exePath, `Atlas OS v${b.version}`)}
              className="group flex w-52 flex-col gap-3 rounded-xl border border-[#222] bg-[#111]
                p-5 text-left transition-all duration-150 hover:border-[#383838] hover:bg-[#161616]"
            >
              <div className="font-mono text-[9px] tracking-[0.3em] uppercase text-[#444]">Build</div>
              <div className="text-[15px] font-semibold text-[#f0f0f0]">Atlas OS</div>
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-medium text-[#888]">v{b.version}</span>
                <span className="text-[10px] text-[#444]">{b.dateLabel}</span>
              </div>
              <div className="mt-auto text-[11px] font-medium text-[#555]
                transition-all group-hover:translate-x-0.5 group-hover:text-[#888]">
                Başlat →
              </div>
            </button>
          ))}

          {/* Empty-state ghost card */}
          {builds.length === 0 && (
            <div className="flex w-52 flex-col gap-3 rounded-xl border border-dashed border-[#1c1c1c] p-5 opacity-40">
              <div className="font-mono text-[9px] tracking-[0.3em] uppercase text-[#3a3a3a]">Build</div>
              <div className="text-[15px] font-semibold text-[#333]">Atlas OS</div>
              <div className="text-[11px] text-[#333]">Henüz build yok</div>
              <div className="mt-auto font-mono text-[10px] text-[#333]">atlas → [B] → [V]</div>
            </div>
          )}
        </div>
      </div>

      </div>{/* ── /Body ── */}
    </div>
  );
}
