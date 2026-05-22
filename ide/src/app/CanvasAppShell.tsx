import { useCallback, useState } from "react";
import {
  AgentRunBridge,
  AiMiniWindow,
  hasAnyKey,
  useChatStore,
} from "@/modules/ai";
import { AiComposerProvider } from "@/modules/ai/lib/composer";
import {
  InfiniteCanvas,
  PinnedPanelsPortal,
} from "@/modules/canvas";
import { CanvasTopBar } from "@/modules/canvas/CanvasTopBar";
import { CanvasSettingsOverlay } from "@/modules/canvas/CanvasSettingsOverlay";
import { ThemeProvider } from "@/modules/theme";
import { AgentSwitcherModal } from "@/modules/agents-office/AgentSwitcherModal";
import { ShortcutsDialog } from "@/modules/shortcuts";
import { UpdaterDialog } from "@/modules/updater";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AiDiffStatus } from "@/modules/tabs";

function CanvasAppShellInner() {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [agentSwitcherOpen, setAgentSwitcherOpen] = useState(false);
  const [miniOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const apiKeys = useChatStore((s) => s.apiKeys);
  const hasComposer = hasAnyKey(apiKeys);

  const openAiDiffTab = useCallback(
    (_input: { path: string; originalContent: string; proposedContent: string; approvalId: string; isNewFile: boolean }) => {
      // Canvas mode: diffs surface in a canvas panel — stub for now
      return null as number | null;
    },
    [],
  );

  const setAiDiffStatus = useCallback(
    (_approvalId: string, _status: AiDiffStatus) => undefined,
    [],
  );

  return (
    <div className="canvas-root relative h-screen overflow-hidden bg-[#050505] text-[#f5f5f5]">
      {/* Canvas fills full height; topbar floats above it */}
      <div className="relative h-full w-full overflow-hidden">
        <InfiniteCanvas />
      </div>

      <CanvasTopBar onOpenSettings={() => setSettingsOpen(true)} />

      {/* Pinned panels portal */}
      <PinnedPanelsPortal />

      {hasComposer ? (
        <AgentRunBridge
          openAiDiffTab={openAiDiffTab}
          setAiDiffStatus={setAiDiffStatus}
        />
      ) : null}

      {miniOpen && hasComposer ? (
        <AiMiniWindow key="ai-mini" isFocused={false} onBoundsChange={undefined} />
      ) : null}

      {settingsOpen && (
        <CanvasSettingsOverlay onClose={() => setSettingsOpen(false)} />
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
