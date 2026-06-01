import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useProjectStore } from "./projectStore";

const PROJECT_COLORS = ["#5b8def", "#4caf7d", "#d4a853", "#9b72ef", "#4fc3f7", "#ef5b5b"];

// ignore "already exists" — idempotent scaffold
async function mkdirSafe(path: string) {
  await invoke("fs_create_dir", { path }).catch((e: unknown) => {
    if (typeof e === "string" && e.includes("already exists")) return;
    throw e;
  });
}

async function scaffoldProject(path: string, name: string): Promise<void> {
  const norm = path.replace(/\\/g, "/");
  await mkdirSafe(`${norm}/vault`);
  await mkdirSafe(`${norm}/vault/notes`);
  await mkdirSafe(`${norm}/.sentor`);
  const vaultHome = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>${name} — Vault</title>
<meta name="description" content="${name} projesi için bilgi tabanı.">
<meta name="category" content="home">
</head>
<body>
<h1>${name}</h1>
<p>Bu proje vault'unun ana sayfası.</p>
</body>
</html>`;
  await invoke("fs_write_file", { path: `${norm}/vault/index.html`, content: vaultHome });
  const config = JSON.stringify({ name, created: new Date().toISOString(), version: "1" }, null, 2);
  await invoke("fs_write_file", { path: `${norm}/.sentor/config.json`, content: config });
}

export function V3LauncherShell() {
  const { projects, activeId, addProject, setActive, hydrate } = useProjectStore();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName]   = useState("");
  const [newPath, setNewPath]   = useState("");
  const [newColor, setNewColor] = useState(PROJECT_COLORS[0]);
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-v3", "true");
    void hydrate();
    return () => document.documentElement.removeAttribute("data-v3");
  }, [hydrate]);

  const pickFolder = useCallback(async () => {
    const p = await invoke<string | null>("pick_folder");
    if (p) setNewPath(p.replace(/\\/g, "/"));
  }, []);

  const openProject = useCallback(async (id: string) => {
    await setActive(id);
    await invoke("v3_launcher_done").catch(() => {});
  }, [setActive]);

  const createAndOpen = useCallback(async () => {
    const name = newName.trim();
    if (!name) { setErr("Proje adı gerekli"); return; }
    if (!newPath) { setErr("Klasör seç"); return; }
    setBusy(true); setErr(null);
    try {
      const fullPath = `${newPath}/${name}`;
      await mkdirSafe(fullPath);
      await scaffoldProject(fullPath, name);
      const p = await addProject({ name, path: fullPath, vaultPath: `${fullPath}/vault`, color: newColor });
      await setActive(p.id);
      await invoke("v3_launcher_done").catch(() => {});
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }, [newName, newPath, newColor, addProject, setActive]);

  const startDrag = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    void getCurrentWindow().startDragging();
  }, []);

  return (
    <div
      className="flex h-screen w-screen flex-col"
      style={{
        background: "rgba(6,6,8,0.94)",
        backdropFilter: "blur(32px) saturate(160%)",
        WebkitBackdropFilter: "blur(32px) saturate(160%)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        fontFamily: '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
        fontFeatureSettings: '"ss01", "cv01"',
        overflow: "hidden",
      }}
    >
      {/* ── Başlık / drag region ──────────────────────────────────────────── */}
      <div
        className="flex shrink-0 cursor-grab select-none items-center justify-between px-4 py-3 active:cursor-grabbing"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
        onMouseDown={startDrag}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-[28px] w-[28px] items-center justify-center rounded-[8px] text-[12px] font-bold text-white"
            style={{ background: "linear-gradient(135deg,#5b8def,#9b72ef)" }}
          >
            S
          </div>
          <div>
            <div className="text-[13px] font-semibold" style={{ color: "#e8e8ec" }}>Sentor</div>
            <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>Çalışma alanı seç</div>
          </div>
        </div>
        <button
          type="button"
          onMouseDown={e => e.stopPropagation()}
          onClick={() => void invoke("v3_launcher_done").catch(() => {})}
          className="flex h-[22px] w-[22px] items-center justify-center rounded text-[#333] transition-colors hover:bg-[rgba(255,70,70,0.12)] hover:text-[#ff4646]"
        >
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* ── Proje listesi ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ scrollbarWidth: "none" }}>
        {projects.map(proj => {
          const isActive = proj.id === activeId;
          return (
            <button
              key={proj.id}
              type="button"
              onClick={() => void openProject(proj.id)}
              className="group flex w-full items-center gap-3 rounded-[9px] px-3 py-2.5 text-left transition-all duration-150 hover:bg-white/5"
              style={{
                background: isActive ? "rgba(91,141,239,0.09)" : "transparent",
                border: `1px solid ${isActive ? "rgba(91,141,239,0.2)" : "transparent"}`,
                marginBottom: 2,
              }}
            >
              {/* Renk dot */}
              <div
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[8px] text-[13px] font-bold text-white"
                style={{ background: proj.color + "28", border: `1px solid ${proj.color}40` }}
              >
                <span style={{ color: proj.color, fontSize: 14 }}>{proj.name[0]?.toUpperCase()}</span>
              </div>

              {/* İsim + yol */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-medium" style={{ color: isActive ? "#e8e8ec" : "rgba(255,255,255,0.6)" }}>
                    {proj.name}
                  </span>
                  {isActive && (
                    <span className="rounded-[3px] px-1 text-[9px] font-medium"
                      style={{ background: "rgba(91,141,239,0.15)", color: "#5b8def" }}>
                      aktif
                    </span>
                  )}
                </div>
                <div className="truncate text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.2)" }}>
                  {proj.path.length > 44 ? "…" + proj.path.slice(-42) : proj.path}
                </div>
              </div>

              {/* Open ok */}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                style={{ color: "rgba(255,255,255,0.3)" }}>
                <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          );
        })}
      </div>

      {/* ── Yeni proje formu ─────────────────────────────────────────────── */}
      <div className="shrink-0 px-3 pb-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        {!creating ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-[9px] py-2 text-[12px] font-medium transition-colors hover:bg-white/5"
            style={{ color: "rgba(255,255,255,0.3)", border: "1px dashed rgba(255,255,255,0.1)" }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            Yeni proje oluştur
          </button>
        ) : (
          <div className="mt-3 flex flex-col gap-2 rounded-[9px] p-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            {/* Ad */}
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && void createAndOpen()}
              placeholder="Proje adı"
              autoFocus
              className="rounded-[6px] bg-transparent px-2.5 py-1.5 text-[12px] text-[#e8e8ec] outline-none placeholder:text-[#2e2e3a]"
              style={{ border: "1px solid rgba(255,255,255,0.09)", caretColor: "#5b8def" }}
            />

            {/* Klasör seç */}
            <button
              type="button"
              onClick={() => void pickFolder()}
              className="flex items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[11px] transition-colors hover:bg-white/5"
              style={{ border: "1px solid rgba(255,255,255,0.07)", color: newPath ? "#a0aec0" : "#333" }}
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.086a1 1 0 0 1 .707.293l.914.914A1 1 0 0 0 6.914 3.5H9.5A1.5 1.5 0 0 1 11 5v4a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 1 9V3.5z" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
              <span className="truncate">{newPath || "Üst klasör seç…"}</span>
            </button>

            {/* Renk */}
            <div className="flex items-center gap-2">
              <span className="text-[10px]" style={{ color: "#444" }}>Renk</span>
              {PROJECT_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setNewColor(c)}
                  className="h-[13px] w-[13px] rounded-full transition-transform hover:scale-110"
                  style={{ background: c, outline: c === newColor ? `2px solid ${c}` : "none", outlineOffset: 1 }} />
              ))}
            </div>

            {err && <p className="text-[10px]" style={{ color: "#ef5b5b" }}>{err}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setCreating(false); setErr(null); }}
                className="flex-1 rounded-[6px] py-1.5 text-[11px] transition-colors hover:bg-white/5"
                style={{ color: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                İptal
              </button>
              <button
                type="button"
                disabled={busy || !newName.trim() || !newPath}
                onClick={() => void createAndOpen()}
                className="flex-1 rounded-[6px] py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40"
                style={{ background: "rgba(91,141,239,0.18)", color: "#7aa4f0", border: "1px solid rgba(91,141,239,0.25)" }}
              >
                {busy ? "Oluşturuluyor…" : "Oluştur ve Aç"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
