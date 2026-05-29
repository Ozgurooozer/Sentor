import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AgentRunBridge, useChatStore } from "@/modules/ai";
import { getModel, OPENCODE_DEFAULT_BASE_URL } from "@/modules/ai/config";
import { AiComposerProvider } from "@/modules/ai/lib/composer";
import { PinnedPanelsPortal, useCanvasStore } from "@/modules/canvas";
import { OnboardingWizard } from "@/modules/onboarding/OnboardingWizard";

import { useOrkestraStore } from "@/modules/canvas/orkestraStore";
import { V3InfiniteCanvas, V3CanvasTopBar, V3SecondaryCanvas } from "@/modules/v3-canvas";
import { CanvasSettingsOverlay } from "@/modules/canvas/CanvasSettingsOverlay";
import { ThemeProvider } from "@/modules/theme";
import { UpdaterDialog } from "@/modules/updater";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useVariableStore } from "@/modules/canvas/variableStore";
import { useApiKeys } from "./hooks/useApiKeys";
import { useMcpBridge } from "./hooks/useMcpBridge";
import { useVaultTrashCleanup } from "./hooks/useVaultTrashCleanup";
import { setLogVaultRoot } from "@/modules/logs/logStore";
import type { AiDiffStatus } from "@/modules/tabs";

function CanvasAppShellInner() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const prefsHydrated = usePreferencesStore((s) => s.hydrated);
  const isOnboarded   = usePreferencesStore((s) => s.onboarded);

  const setApiKeys = useChatStore((s) => s.setApiKeys);

  const workspaceRoot = usePreferencesStore((s) => s.workspaceRoot) ?? "C:\\Atlas OS";
  const canvasHydrated = useCanvasStore((s) => s.hydrated);
  const addPanel = useCanvasStore((s) => s.addPanel);
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const isSplit = useCanvasStore((s) => s.isSplit);

  const selectedModelId = useChatStore((s) => s.selectedModelId);
  const opencodeBase   = OPENCODE_DEFAULT_BASE_URL;
  const opencodeModel  = usePreferencesStore((s) => s.opencodeChatModelId) || "deepseek/deepseek-v4-flash-free";

  useApiKeys(setApiKeys);
  useVaultTrashCleanup(workspaceRoot);

  useEffect(() => {
    void useVariableStore.getState().hydrate();
  }, []);

  useEffect(() => {
    setLogVaultRoot(workspaceRoot || "C:\\Atlas OS");
  }, [workspaceRoot]);

  // Switch canvas storage file when vault (workspace root) changes.
  // Without this, all vaults share the same atlas-canvas.json file.
  useEffect(() => {
    if (!prefsHydrated) return;
    void useCanvasStore.getState().switchVault(workspaceRoot);
  }, [workspaceRoot, prefsHydrated]);

  // ── V3 Input → Canvas bridge ─────────────────────────────────────────────
  useEffect(() => {
    const ork = useOrkestraStore.getState();
    const promptP = listen<{ text: string }>("atlas:canvas-prompt", ({ payload }) => {
      ork.setCollapsed(false);
      ork.setV3InputActive(true);
      const model = getModel(selectedModelId);
      const keys = useChatStore.getState().apiKeys;
      void ork.send(payload.text, model.provider, "", "", "", "", keys.opencode ?? "", opencodeBase, opencodeModel);
    });
    const unlinkP = listen("atlas:canvas-unlink", () => {
      useOrkestraStore.getState().setV3InputActive(false);
    });
    return () => {
      void promptP.then((fn) => fn());
      void unlinkP.then((fn) => fn());
    };
  }, [selectedModelId, opencodeBase, opencodeModel]);

  const openVaultTab = useCallback(
    (url: string) => {
      const id = addPanel("preview");
      updatePanel(id, { meta: { path: url } });
    },
    [addPanel, updatePanel],
  );

  const openWebTab = useCallback(
    (url: string) => {
      const id = addPanel("web");
      const cur = useCanvasStore.getState().panels.find((p) => p.id === id);
      updatePanel(id, { meta: { ...(cur?.meta ?? {}), url } });
    },
    [addPanel, updatePanel],
  );

  useMcpBridge({
    canvasHydrated,
    workspaceRoot,
    openVaultTab,
    openWebTab,
    openPanel: () => {},
    focusInput: () => {},
  });

  const openAiDiffTab = useCallback(
    (_input: { path: string; originalContent: string; proposedContent: string; approvalId: string; isNewFile: boolean }) =>
      null as number | null,
    [],
  );

  const setAiDiffStatus = useCallback(
    (_approvalId: string, _status: AiDiffStatus) => undefined,
    [],
  );

  // Onboarding: prefs yüklendi ve henüz tamamlanmadıysa wizard göster
  if (prefsHydrated && !isOnboarded) {
    return (
      <OnboardingWizard onComplete={() => {
        // setOnboarded(true) wizard içinde çağrılıyor; preferences store event ile güncellenir
      }} />
    );
  }

  return (
    <div className="canvas-root relative h-screen overflow-hidden" style={{ background: "#050507" }}>
      {isSplit ? (
        /* ── Split view: two canvases side-by-side ── */
        <div className="flex h-full w-full">
          {/* Primary canvas */}
          <div className="relative flex-1 overflow-hidden" style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
            <V3InfiniteCanvas />
            <V3CanvasTopBar onOpenSettings={() => setSettingsOpen(true)} />
          </div>
          {/* Secondary canvas */}
          <div className="relative flex-1 overflow-hidden">
            <V3SecondaryCanvas />
            <V3CanvasTopBar secondary onOpenSettings={() => setSettingsOpen(true)} />
          </div>
        </div>
      ) : (
        /* ── Single canvas ── */
        <div className="relative h-full w-full overflow-hidden">
          <V3InfiniteCanvas />
          <V3CanvasTopBar onOpenSettings={() => setSettingsOpen(true)} />
        </div>
      )}

      <PinnedPanelsPortal />

<AgentRunBridge openAiDiffTab={openAiDiffTab} setAiDiffStatus={setAiDiffStatus} />

      {settingsOpen && <CanvasSettingsOverlay onClose={() => setSettingsOpen(false)} />}

      <UpdaterDialog />
    </div>
  );
}

export function CanvasAppShell() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <AiComposerProvider>
          <CanvasAppShellInner />
        </AiComposerProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
