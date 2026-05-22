import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { Tab } from "./useTabs";

type Result = {
  explorerRoot: string | null;
  inheritedCwdForNewTab: () => string | undefined;
};

export function useWorkspaceCwd(
  activeTab: Tab | undefined,
  tabs: Tab[],
  home: string | null,
): Result {
  const lastTerminalCwd = useRef<string | null>(null);
  const pinnedRoot = usePreferencesStore((s) => s.workspaceRoot);

  useEffect(() => {
    if (activeTab?.kind === "terminal" && activeTab.cwd) {
      lastTerminalCwd.current = activeTab.cwd;
    }
  }, [activeTab]);

  const explorerRoot = useMemo<string | null>(() => {
    // Explicitly pinned folder takes priority over terminal cwd.
    if (pinnedRoot) return pinnedRoot;
    if (activeTab?.kind === "terminal" && activeTab.cwd) return activeTab.cwd;
    if (lastTerminalCwd.current) return lastTerminalCwd.current;
    const anyTerm = tabs.find((t) => t.kind === "terminal" && t.cwd);
    if (anyTerm?.kind === "terminal" && anyTerm.cwd) return anyTerm.cwd;
    return home;
  }, [pinnedRoot, activeTab, tabs, home]);

  const inheritedCwdForNewTab = useCallback((): string | undefined => {
    // Pinned vault/workspace root wins: every terminal belongs to its canvas's
    // vault and should not leak into the OS home or an unrelated cwd.
    if (pinnedRoot) return pinnedRoot;
    if (activeTab?.kind === "terminal" && activeTab.cwd) return activeTab.cwd;
    return lastTerminalCwd.current ?? home ?? undefined;
  }, [pinnedRoot, activeTab, home]);

  return { explorerRoot, inheritedCwdForNewTab };
}
