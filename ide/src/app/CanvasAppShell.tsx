import { useCallback, useEffect, useState } from "react";
import {
  AgentRunBridge,
  AiMiniWindow,
  hasAnyKey,
  useChatStore,
} from "@/modules/ai";
import { AiComposerProvider } from "@/modules/ai/lib/composer";
import { InfiniteCanvas, PinnedPanelsPortal, useCanvasStore } from "@/modules/canvas";
import { CanvasTopBar } from "@/modules/canvas/CanvasTopBar";
import { CanvasSettingsOverlay } from "@/modules/canvas/CanvasSettingsOverlay";
import { ThemeProvider } from "@/modules/theme";
import { AgentSwitcherModal } from "@/modules/agents-office/AgentSwitcherModal";
import { ShortcutsDialog } from "@/modules/shortcuts";
import { UpdaterDialog } from "@/modules/updater";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OnboardingWizard } from "@/modules/onboarding/OnboardingWizard";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useApiKeys } from "./hooks/useApiKeys";
import { useMcpBridge } from "./hooks/useMcpBridge";
import { useVaultTrashCleanup } from "./hooks/useVaultTrashCleanup";
import type { AiDiffStatus } from "@/modules/tabs";

function CanvasAppShellInner() {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [agentSwitcherOpen, setAgentSwitcherOpen] = useState(false);
  const [miniOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const apiKeys = useChatStore((s) => s.apiKeys);
  const setApiKeys = useChatStore((s) => s.setApiKeys);
  const hasComposer = hasAnyKey(apiKeys);

  const workspaceRoot = usePreferencesStore((s) => s.workspaceRoot) ?? "";
  const prefsHydrated = usePreferencesStore((s) => s.hydrated);
  const onboarded = usePreferencesStore((s) => s.onboarded);

  const canvasHydrated = useCanvasStore((s) => s.hydrated);
  const addPanel = useCanvasStore((s) => s.addPanel);
  const updatePanel = useCanvasStore((s) => s.updatePanel);

  useEffect(() => {
    if (prefsHydrated && !onboarded) setShowOnboarding(true);
  }, [prefsHydrated, onboarded]);

  useApiKeys(setApiKeys);
  useVaultTrashCleanup(workspaceRoot);

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
    (_input: {
      path: string;
      originalContent: string;
      proposedContent: string;
      approvalId: string;
      isNewFile: boolean;
    }) => null as number | null,
    [],
  );

  const setAiDiffStatus = useCallback(
    (_approvalId: string, _status: AiDiffStatus) => undefined,
    [],
  );

  return (
    <div className="canvas-root relative h-screen overflow-hidden bg-[#050505] text-[#f5f5f5]">
      <div className="relative h-full w-full overflow-hidden">
        <InfiniteCanvas />
      </div>

      <CanvasTopBar onOpenSettings={() => setSettingsOpen(true)} />

      <PinnedPanelsPortal />

      {hasComposer && (
        <AgentRunBridge
          openAiDiffTab={openAiDiffTab}
          setAiDiffStatus={setAiDiffStatus}
        />
      )}

      {miniOpen && hasComposer && (
        <AiMiniWindow key="ai-mini" isFocused={false} onBoundsChange={undefined} />
      )}

      {settingsOpen && (
        <CanvasSettingsOverlay onClose={() => setSettingsOpen(false)} />
      )}

      {showOnboarding && (
        <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
      )}

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      <AgentSwitcherModal
        open={agentSwitcherOpen}
        onClose={() => setAgentSwitcherOpen(false)}
      />

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
