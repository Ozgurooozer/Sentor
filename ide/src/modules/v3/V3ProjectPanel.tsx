import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useProjectStore, ATLAS_DEFAULT_PROJECT } from "./projectStore";

const PROJECT_COLORS = ["#5b8def", "#4caf7d", "#d4a853", "#9b72ef", "#4fc3f7", "#ef5b5b"];

// Proje için klasör yapısını oluşturur
async function scaffoldProject(path: string, name: string): Promise<void> {
  const norm = path.replace(/\\/g, "/");
  // Dizinler
  await invoke("fs_create_dir", { path: `${norm}/vault` });
  await invoke("fs_create_dir", { path: `${norm}/vault/notes` });
  await invoke("fs_create_dir", { path: `${norm}/.atlas` });

  // Vault ana sayfası
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
<p>Bu proje vault'unun ana sayfası. Atlas-Maker ajanını kullanarak sayfa ekleyebilirsin.</p>
</body>
</html>`;
  await invoke("fs_write_file", { path: `${norm}/vault/index.html`, content: vaultHome });

  // .atlas/config.json
  const config = JSON.stringify({ name, created: new Date().toISOString(), version: "1" }, null, 2);
  await invoke("fs_write_file", { path: `${norm}/.atlas/config.json`, content: config });
}

interface Props {
  onClose: () => void;
}

export function V3ProjectPanel({ onClose }: Props) {
  const { projects, activeId, addProject, removeProject, setActive } = useProjectStore();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName]   = useState("");
  const [newPath, setNewPath]   = useState("");
  const [newColor, setNewColor] = useState(PROJECT_COLORS[1]);
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState<string | null>(null);

  const pickFolder = useCallback(async () => {
    const p = await invoke<string | null>("pick_folder");
    if (p) setNewPath(p.replace(/\\/g, "/"));
  }, []);

  const createProject = useCallback(async () => {
    const name = newName.trim();
    if (!name) { setErr("Proje adı gerekli"); return; }
    if (!newPath) { setErr("Klasör seç"); return; }
    setBusy(true); setErr(null);
    try {
      const fullPath = `${newPath}/${name}`;
      // Ana klasörü oluştur
      await invoke("fs_create_dir", { path: fullPath });
      // Vault yapısını oluştur
      await scaffoldProject(fullPath, name);
      const p = await addProject({
        name,
        path: fullPath,
        vaultPath: `${fullPath}/vault`,
        color: newColor,
      });
      await setActive(p.id);
      setCreating(false);
      setNewName(""); setNewPath(""); setNewColor(PROJECT_COLORS[1]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [newName, newPath, newColor, addProject, setActive]);

  const switchProject = useCallback(async (id: string) => {
    await setActive(id);
    onClose();
  }, [setActive, onClose]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      {/* Başlık */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.35)", letterSpacing: ".06em", textTransform: "uppercase" }}>
          Projeler
        </span>
        <button
          type="button"
          onClick={() => setCreating(v => !v)}
          className="flex h-[20px] w-[20px] items-center justify-center rounded text-[#333] transition-colors hover:bg-white/5 hover:text-[#888]"
          title="Yeni proje"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Yeni proje formu */}
      {creating && (
        <div className="mx-3 mb-2 overflow-hidden rounded-[7px]" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex flex-col gap-2 p-3">
            {/* Ad */}
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && void createProject()}
              placeholder="Proje adı"
              autoFocus
              className="rounded-[5px] bg-transparent px-2 py-1 text-[12px] text-[#e8e8ec] outline-none placeholder:text-[#333]"
              style={{ border: "1px solid rgba(255,255,255,0.08)", caretColor: "#5b8def" }}
            />

            {/* Konum */}
            <button
              type="button"
              onClick={() => void pickFolder()}
              className="flex items-center gap-2 rounded-[5px] px-2 py-1 text-left text-[11px] transition-colors hover:bg-white/5"
              style={{ border: "1px solid rgba(255,255,255,0.06)", color: newPath ? "#a0aec0" : "#333" }}
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.086a1 1 0 0 1 .707.293l.914.914A1 1 0 0 0 6.914 3.5H9.5A1.5 1.5 0 0 1 11 5v4a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 1 9V3.5z" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
              <span className="truncate">{newPath || "Klasör seç…"}</span>
            </button>

            {/* Renk */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px]" style={{ color: "#333" }}>Renk</span>
              {PROJECT_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setNewColor(c)}
                  className="h-[14px] w-[14px] rounded-full transition-transform hover:scale-110"
                  style={{ background: c, outline: c === newColor ? `2px solid ${c}` : "none", outlineOffset: 1 }} />
              ))}
            </div>

            {err && <p className="text-[10px]" style={{ color: "#ef5b5b" }}>{err}</p>}

            {/* Oluştur */}
            <button
              type="button"
              disabled={busy || !newName.trim() || !newPath}
              onClick={() => void createProject()}
              className="rounded-[5px] py-1 text-[12px] font-medium transition-colors disabled:opacity-40"
              style={{ background: "rgba(91,141,239,0.18)", color: "#7aa4f0", border: "1px solid rgba(91,141,239,0.25)" }}
            >
              {busy ? "Oluşturuluyor…" : "Oluştur"}
            </button>
          </div>
        </div>
      )}

      {/* Proje listesi */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        {projects.map(proj => {
          const isActive = proj.id === activeId;
          return (
            <button
              key={proj.id}
              type="button"
              onClick={() => void switchProject(proj.id)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/4"
              style={{ background: isActive ? "rgba(255,255,255,0.04)" : "transparent" }}
            >
              {/* Renk dot */}
              <div className="h-[8px] w-[8px] shrink-0 rounded-full" style={{ background: proj.color }} />

              {/* İsim + yol */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-medium truncate"
                    style={{ color: isActive ? "#e8e8ec" : "rgba(255,255,255,0.45)" }}>
                    {proj.name}
                  </span>
                  {isActive && (
                    <span className="shrink-0 rounded-[3px] px-1 text-[9px] font-medium"
                      style={{ background: "rgba(91,141,239,0.15)", color: "#5b8def" }}>
                      aktif
                    </span>
                  )}
                </div>
                <div className="truncate text-[10px]" style={{ color: "rgba(255,255,255,0.18)" }}>
                  {proj.path.length > 38 ? "…" + proj.path.slice(-36) : proj.path}
                </div>
              </div>

              {/* Sil (default proje silinemez) */}
              {proj.id !== ATLAS_DEFAULT_PROJECT.id && (
                <button
                  type="button"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={async (e) => { e.stopPropagation(); await removeProject(proj.id); }}
                  className="shrink-0 flex h-[16px] w-[16px] items-center justify-center rounded opacity-0 transition-opacity hover:bg-white/5 hover:text-red-400 group-hover:opacity-100"
                  style={{ color: "rgba(255,255,255,0.2)" }}
                >
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                    <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
