import { AgentStatusPill } from "@/modules/ai/components/AgentStatusPill";
import {
  AiOpenButton,
  AiStatusBarControls,
} from "@/modules/ai/components/AiStatusBarControls";
import { useChatStore } from "@/modules/ai";
import { AGENT_ICONS } from "@/modules/ai/components/AgentSwitcher";
import { useAgentsStore } from "@/modules/ai/store/agentsStore";
import { Globe02Icon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { CwdBreadcrumb } from "./CwdBreadcrumb";

type Props = {
  cwd: string | null;
  filePath?: string | null;
  home: string | null;
  onCd: (path: string) => void;
  onOpenMini: () => void;
  /** Only rendered when the AI panel is open and a key is loaded. */
  hasComposer: boolean;
  /** When set, render a one-click "Open preview" chip pointing at this URL. */
  detectedPreviewUrl?: string | null;
  onOpenPreview?: () => void;
  onOpenAgentSwitcher?: () => void;
  onOpenAgentOffice?: (slug: string) => void;
};

function useAgentPhase(slug: string): string | null {
  const [phase, setPhase] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    const load = () => {
      invoke<{ state: Record<string, unknown> }>("vault_agent_snapshot", { slug })
        .then((snap) => setPhase((snap.state.phase as string | undefined) ?? null))
        .catch(() => setPhase(null));
    };
    load();
    const unsub = listen("vault:reindexed", load);
    return () => { void unsub.then((fn) => fn()); };
  }, [slug]);

  return phase;
}

export function StatusBar({
  cwd,
  filePath,
  home,
  onCd,
  onOpenMini,
  hasComposer,
  detectedPreviewUrl,
  onOpenPreview,
  onOpenAgentSwitcher,
  onOpenAgentOffice,
}: Props) {
  const panelOpen = useChatStore((s) => s.panelOpen);
  const openPanel = useChatStore((s) => s.openPanel);
  const activeId = useAgentsStore((s) => s.activeId);
  const allAgents = useAgentsStore.getState().all();
  const activeAgent = allAgents.find((a) => a.id === activeId) ?? allAgents[0];
  const AgentIcon = activeAgent ? (AGENT_ICONS[activeAgent.icon] ?? SparklesIcon) : SparklesIcon;

  const slug = activeId.startsWith("builtin:") ? activeId.slice("builtin:".length) : activeId;
  const phase = useAgentPhase(slug);

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between gap-3 border-t border-border/60 bg-card/60 px-3 text-[11px]">
      <div className="min-w-0 flex-1 truncate">
        <CwdBreadcrumb cwd={cwd} filePath={filePath} home={home} onCd={onCd} />
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {activeAgent && (
          <button
            type="button"
            onClick={onOpenAgentSwitcher}
            title={`Active agent: ${activeAgent.name} — click to switch`}
            className="flex h-5 items-center gap-1 rounded border border-[#2a2a2a] px-1.5 text-[10px] text-[#555] transition-colors hover:border-[#404040] hover:text-[#888]"
          >
            <HugeiconsIcon icon={AgentIcon} size={10} strokeWidth={1.75} />
            <span>{activeAgent.name}</span>
            {phase && (
              <span className="text-[#5b8def]">· {phase}</span>
            )}
          </button>
        )}
        {onOpenAgentOffice && activeAgent && (
          <button
            type="button"
            onClick={() => onOpenAgentOffice(slug)}
            title={`Open ${activeAgent.name} office`}
            className="flex h-5 items-center rounded border border-[#2a2a2a] px-1.5 text-[10px] text-[#444] transition-colors hover:border-[#404040] hover:text-[#888]"
          >
            Office
          </button>
        )}
        {detectedPreviewUrl && onOpenPreview ? (
          <button
            type="button"
            onClick={onOpenPreview}
            title={`Open ${detectedPreviewUrl} as a preview tab`}
            className="flex h-6 max-w-64 items-center gap-1.5 rounded-md border border-border/70 bg-accent/40 px-2 text-[11px] text-foreground/90 transition-colors hover:bg-accent hover:text-foreground"
          >
            <HugeiconsIcon
              icon={Globe02Icon}
              size={11}
              strokeWidth={1.75}
              className="shrink-0 text-muted-foreground"
            />
            <span className="truncate">Open preview</span>
            <span className="truncate text-muted-foreground">
              {hostFromUrl(detectedPreviewUrl)}
            </span>
          </button>
        ) : null}
        <AgentStatusPill onClick={onOpenMini} />
        {panelOpen && hasComposer ? (
          <AiStatusBarControls />
        ) : (
          <AiOpenButton onOpen={openPanel} />
        )}
      </div>
    </footer>
  );
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
