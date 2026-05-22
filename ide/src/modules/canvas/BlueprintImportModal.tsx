/**
 * BlueprintImportModal — lists saved blueprints from vault/blueprints/ and
 * loads the selected one into the current canvas.
 *
 * Blueprint files are written by the `blueprint_save` AI tool as:
 *   vault/blueprints/{slug}/blueprint.json
 *
 * On import, panel IDs are re-stamped and positions are offset so they don't
 * land on top of existing panels.
 */
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCanvasStore } from "./canvasStore";
import type { CanvasPanelNode, Connection } from "./types";

type BlueprintMeta = {
  slug: string;
  name: string;
  description: string;
  panelCount: number;
  connectionCount: number;
  created: string;
  path: string;
};

type BlueprintFile = {
  $schema: string;
  slug: string;
  name: string;
  description: string;
  panels: CanvasPanelNode[];
  connections: Connection[];
  created: string;
};

async function listBlueprints(workspaceRoot: string): Promise<BlueprintMeta[]> {
  const root = workspaceRoot.replace(/[\\/]+$/, "").replace(/\\/g, "/");
  const blueprintsDir = `${root}/vault/blueprints`;
  try {
    type FsEntry = { name: string; kind: string };
    const entries = await invoke<FsEntry[]>("fs_read_dir", { path: blueprintsDir });
    const dirs = entries.filter((e) => e.kind === "dir");
    const metas: BlueprintMeta[] = [];
    for (const dir of dirs) {
      try {
        const jsonPath = `${blueprintsDir}/${dir.name}/blueprint.json`;
        const result = await invoke<{ kind: string; content?: string }>("fs_read_file", { path: jsonPath });
        if (result.kind !== "text" || !result.content) continue;
        const bp = JSON.parse(result.content) as BlueprintFile;
        if (bp.$schema !== "atlas-blueprint-v1") continue;
        metas.push({
          slug: bp.slug,
          name: bp.name,
          description: bp.description,
          panelCount: bp.panels?.length ?? 0,
          connectionCount: bp.connections?.length ?? 0,
          created: bp.created?.slice(0, 10) ?? "",
          path: jsonPath,
        });
      } catch {
        // Malformed or missing blueprint.json — skip.
      }
    }
    return metas;
  } catch {
    return [];
  }
}

async function loadBlueprint(path: string): Promise<BlueprintFile | null> {
  try {
    const result = await invoke<{ kind: string; content?: string }>("fs_read_file", { path });
    if (result.kind !== "text" || !result.content) return null;
    return JSON.parse(result.content) as BlueprintFile;
  } catch {
    return null;
  }
}

type Props = {
  workspaceRoot: string | null;
  onClose: () => void;
};

export function BlueprintImportModal({ workspaceRoot, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const loadBlueprint_ = useCanvasStore((s) => s.loadBlueprint);

  const [blueprints, setBlueprints] = useState<BlueprintMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceRoot) {
      setLoading(false);
      setError("No workspace root set. Open a folder first.");
      return;
    }
    void listBlueprints(workspaceRoot).then((list) => {
      setBlueprints(list);
      setLoading(false);
    });
  }, [workspaceRoot]);

  // Close on outside click or Escape.
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const handleImport = async (meta: BlueprintMeta) => {
    setImporting(meta.slug);
    setError(null);
    const bp = await loadBlueprint(meta.path);
    if (!bp || !Array.isArray(bp.panels)) {
      setError(`Failed to load blueprint "${meta.name}".`);
      setImporting(null);
      return;
    }
    loadBlueprint_({ panels: bp.panels, connections: bp.connections ?? [] });
    onClose();
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center">
      <div
        ref={ref}
        className="pointer-events-auto w-[420px] rounded-lg border border-[#333] bg-[#111] p-4"
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="mb-3 flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-[#555]">Blueprint</span>
          <span className="flex-1 font-mono text-[12px] font-medium text-[#f5f5f5]">Import Blueprint</span>
          <button
            type="button"
            onClick={onClose}
            className="flex size-5 items-center justify-center rounded text-[#555] hover:bg-[#2a2a2a] hover:text-[#f5f5f5]"
          >
            <span className="text-[12px]">×</span>
          </button>
        </div>

        {/* Body */}
        {loading && (
          <p className="py-6 text-center font-mono text-[11px] text-[#555]">Loading blueprints…</p>
        )}
        {!loading && error && (
          <p className="py-4 font-mono text-[11px] text-[#ef4444]">{error}</p>
        )}
        {!loading && !error && blueprints.length === 0 && (
          <p className="py-6 text-center font-mono text-[11px] text-[#555]">
            No blueprints found in vault/blueprints/
          </p>
        )}
        {!loading && blueprints.length > 0 && (
          <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {blueprints.map((meta) => (
              <div
                key={meta.slug}
                className="flex items-start gap-3 rounded border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[11px] text-[#f5f5f5]">{meta.name}</div>
                  {meta.description && (
                    <div className="mt-0.5 truncate font-mono text-[9px] text-[#555]">{meta.description}</div>
                  )}
                  <div className="mt-1 flex gap-2 font-mono text-[9px] text-[#444]">
                    <span>{meta.panelCount} panels</span>
                    <span>·</span>
                    <span>{meta.connectionCount} connections</span>
                    <span>·</span>
                    <span>{meta.created}</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={importing === meta.slug}
                  onClick={() => void handleImport(meta)}
                  className="shrink-0 rounded bg-[#1a1a1a] px-2.5 py-1 font-mono text-[10px] text-[#888] transition-colors hover:bg-[#5b8def]/20 hover:text-[#5b8def] disabled:opacity-40"
                >
                  {importing === meta.slug ? "…" : "Import"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
