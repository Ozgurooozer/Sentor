import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DirEntry } from "@/modules/ai/lib/native";

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

/**
 * On IDE startup, sweep `.vault-trash/` under the workspace root and delete
 * any backup files older than 7 days. Keeps the trash bounded without the
 * user having to manage it.
 *
 * A missing trash directory is the common case (no agent has ever written a
 * vault page) — we silently swallow `fs_read_dir` rejections instead of
 * routing them through `safeInvoke`, which would log them as errors.
 */
export function useVaultTrashCleanup(workspaceRoot: string) {
  useEffect(() => {
    if (!workspaceRoot) return;
    const sep = workspaceRoot.includes("\\") ? "\\" : "/";
    const trashDir = `${workspaceRoot}${sep}.vault-trash`;
    const cutoffSec = Math.floor(Date.now() / 1000) - SEVEN_DAYS_SECONDS;

    const readDirQuiet = (path: string) =>
      invoke<DirEntry[]>("fs_read_dir", { path }).catch(
        () => null as DirEntry[] | null,
      );

    void (async () => {
      const categories = await readDirQuiet(trashDir);
      if (!categories) return; // dir missing — nothing to do
      for (const cat of categories) {
        if (cat.kind !== "dir") continue;
        const catDir = `${trashDir}${sep}${cat.name}`;
        const files = await readDirQuiet(catDir);
        if (!files) continue;
        for (const f of files) {
          if (f.kind !== "file") continue;
          if (f.mtime > cutoffSec) continue;
          await invoke("fs_delete", {
            path: `${catDir}${sep}${f.name}`,
          }).catch(() => {/* best-effort */});
        }
      }
    })();
  }, [workspaceRoot]);
}
