/**
 * ChatPanel — canvas-resident chat surface. Each panel gets its own session
 * (stored in panel.meta.sessionId) so it stays independent from the bottom
 * bar's global session. Rendered by CanvasPanel when `panel.type === "chat"`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { getOrCreateChat } from "../store/chatStore";
import { newSessionId } from "../lib/sessions";
import { AiComposerProvider } from "../lib/composer";
import { useComposer } from "../lib/useComposer";
import { AiChatView } from "./AiChat";
import { AiInputBar } from "./AiInputBar";
import { AgentSwitcher } from "./AgentSwitcher";
import {
  useAllIncomingWireData,
  PANEL_ICONS,
  type WireBlock,
} from "@/modules/canvas/useWireData";
import { useCanvasStore } from "@/modules/canvas/canvasStore";

/** Custom DOM event used to fan chat-panel submits out over trigger wires.
 *  Detail: { panelId: target terminal panel id, text: user's raw message }. */
const TERMINAL_TRIGGER_EVENT = "atlas:terminal-trigger";

type Props = {
  /** Session ID previously saved in panel.meta.sessionId — null on first open. */
  savedSessionId?: string;
  /** Called once when a new session is created, so the canvas store can persist it. */
  onSessionCreated?: (sessionId: string) => void;
  /** Canvas panel ID — used to read incoming wire data from the canvas store. */
  panelId?: string;
};

export function ChatPanel({ savedSessionId, onSessionCreated, panelId }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(savedSessionId ?? null);
  /**
   * "Apply to all" — when off (default), only `context` wires are silently
   * folded into the prompt; explicit `data` wires sit dormant as visible
   * chips. Flip on to splice every data wire into the prompt too.
   */
  const [applyToAll, setApplyToAll] = useState(false);

  // Always call the hook unconditionally; empty string → empty array.
  const wireBlocks = useAllIncomingWireData(panelId ?? "");

  const buildContextPrefix = useCallback((): string => {
    const included = wireBlocks.filter(
      (b) => b.connectionKind === "context" || applyToAll,
    );
    const blocks = included
      .filter((b): b is WireBlock & { data: { kind: "text"; value: string } } =>
        b.data?.kind === "text" && typeof b.data.value === "string" && b.data.value.length > 0
      )
      .map(
        (b) =>
          `[${PANEL_ICONS[b.panelType] ?? "◉"} ${b.panelTitle} · ${b.panelType}]\n${b.data.value}`,
      )
      .join("\n\n---\n\n");
    return blocks ? `<connected-context>\n${blocks}\n</connected-context>\n\n` : "";
  }, [wireBlocks, applyToAll]);

  // Outgoing trigger wires — chat → terminal command pulses. On each submit
  // we dispatch a DOM event per target so CanvasTerminal mounts can pick it
  // up without us holding a direct ref to their xterm handles.
  const dispatchTriggers = useCallback(
    (userText: string) => {
      if (!panelId || !userText.trim()) return;
      const conns = useCanvasStore.getState().connections;
      const targets = conns.filter(
        (c) => c.fromPanel === panelId && c.kind === "trigger",
      );
      for (const t of targets) {
        window.dispatchEvent(
          new CustomEvent(TERMINAL_TRIGGER_EVENT, {
            detail: { panelId: t.toPanel, text: userText },
          }),
        );
      }
    },
    [panelId],
  );

  useEffect(() => {
    if (sessionId) return;
    const id = newSessionId();
    setSessionId(id);
    onSessionCreated?.(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-[#555555]">
        Loading session…
      </div>
    );
  }

  return (
    <AiComposerProvider
      sessionId={sessionId}
      contextPrefix={buildContextPrefix}
      onSubmit={dispatchTriggers}
    >
      <ChatBody
        sessionId={sessionId}
        wireBlocks={wireBlocks}
        applyToAll={applyToAll}
        onToggleApplyToAll={() => setApplyToAll((v) => !v)}
      />
    </AiComposerProvider>
  );
}

function ChatBody({
  sessionId,
  wireBlocks,
  applyToAll,
  onToggleApplyToAll,
}: {
  sessionId: string;
  wireBlocks: WireBlock[];
  applyToAll: boolean;
  onToggleApplyToAll: () => void;
}) {
  const chat = useMemo(() => getOrCreateChat(sessionId), [sessionId]);
  const helpers = useChat<UIMessage>({ chat });
  const { attachImageDataUrl } = useComposer();

  // Auto-attach image wires when they update.
  const imageBlocks = wireBlocks.filter((b) => b.data?.kind === "image");
  const imageKey = imageBlocks.map((b) => String(b.data?.value ?? "").slice(0, 40)).join("|");
  useEffect(() => {
    for (const block of imageBlocks) {
      if (typeof block.data?.value === "string") {
        attachImageDataUrl(block.data.value, `wire-${block.panelId}`);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageKey]);

  return (
    <div className="flex h-full flex-col bg-[#0a0a0a]">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-[#2a2a2a] bg-[#111111] px-2">
        <AgentSwitcher isMiniWindow />
      </div>

      {/* Connected panel badges. Context-kind wires are always live so they
          render at full opacity; data-kind wires dim until the user flips
          the apply-to-all toggle, signalling that they're dormant. */}
      {wireBlocks.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[#2a2a2a] bg-[#0d0d0d] px-2 py-1">
          <span className="text-[8px] text-[#444]">ctx:</span>
          {wireBlocks.map((b) => {
            const live = b.connectionKind === "context" || applyToAll;
            const color =
              b.connectionKind === "context" ? "#9b72ef" : "#5b8def";
            return (
              <span
                key={b.panelId}
                title={`${b.panelTitle} · ${b.panelType} · ${b.connectionKind} · ${typeof b.data?.value === "string" ? b.data.value.length : 0} chars`}
                className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[8px] transition-opacity duration-150"
                style={{
                  color,
                  backgroundColor: `${color}1a`,
                  opacity: live ? 1 : 0.45,
                }}
              >
                <span>{PANEL_ICONS[b.panelType] ?? "◉"}</span>
                <span className="max-w-[80px] truncate">{b.panelTitle}</span>
              </span>
            );
          })}
          <button
            type="button"
            onClick={onToggleApplyToAll}
            className="ml-auto rounded px-1.5 py-0.5 text-[9px] tracking-wide uppercase transition-colors duration-150"
            style={{
              color: applyToAll ? "#5b8def" : "#666",
              backgroundColor: applyToAll ? "#5b8def22" : "transparent",
            }}
            title={
              applyToAll
                ? "Apply-to-all ON — every data wire is folded into each prompt"
                : "Apply-to-all OFF — only context wires are silent; data wires are dormant chips"
            }
          >
            ⊞ all
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <AiChatView
          messages={helpers.messages}
          status={helpers.status}
          error={helpers.error}
          clearError={helpers.clearError}
          addToolApprovalResponse={helpers.addToolApprovalResponse}
          stop={helpers.stop}
        />
      </div>

      <div className="shrink-0 border-t border-[#2a2a2a]">
        <AiInputBar />
      </div>
    </div>
  );
}
