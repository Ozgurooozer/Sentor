/**
 * ChatPanel — canvas-resident chat surface. Each panel gets its own session
 * (stored in panel.meta.sessionId) so it stays independent from the bottom
 * bar's global session. Rendered by CanvasPanel when `panel.type === "chat"`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import {
  getOrCreateChat,
} from "../store/chatStore";
import {
  loadAll,
  newSessionId,
  type SessionMeta,
} from "../lib/sessions";
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
import { setLinkedTerminal } from "@/modules/canvas/terminalLink";
import { cn } from "@/lib/utils";


type Props = {
  savedSessionId?: string;
  onSessionCreated?: (sessionId: string) => void;
  panelId?: string;
};

export function ChatPanel({ savedSessionId, onSessionCreated, panelId }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(savedSessionId ?? null);
  const [applyToAll, setApplyToAll] = useState(false);
  const [terminalToolActive, setTerminalToolActive] = useState(false);

  const wireBlocks = useAllIncomingWireData(panelId ?? "");

  const connections = useCanvasStore((s) => s.connections);
  const panels      = useCanvasStore((s) => s.panels);
  const updatePanel = useCanvasStore((s) => s.updatePanel);

  const linkedTerminalPanel = (() => {
    if (!panelId) return null;
    const triggerConns = connections.filter(
      (c) => c.fromPanel === panelId && c.kind === "trigger",
    );
    for (const c of triggerConns) {
      const target = panels.find((p) => p.id === c.toPanel && p.type === "terminal");
      if (target) return target;
    }
    return null;
  })();

  useEffect(() => {
    if (!sessionId) return;
    setLinkedTerminal(
      sessionId,
      terminalToolActive && linkedTerminalPanel ? linkedTerminalPanel.id : null,
    );
    return () => { if (sessionId) setLinkedTerminal(sessionId, null); };
  }, [sessionId, terminalToolActive, linkedTerminalPanel]);

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

  const dispatchTriggers = useCallback(
    (userText: string) => {
      if (!panelId || !userText.trim()) return;
      const conns = useCanvasStore.getState().connections;
      const targets = conns.filter(
        (c) => c.fromPanel === panelId && c.kind === "trigger",
      );
      for (const t of targets) {
        useCanvasStore.getState().triggerTerminal(t.toPanel, userText);
      }
    },
    [panelId],
  );

  // switch to a different or brand-new session
  const switchSession = useCallback(
    (id: string) => {
      setSessionId(id);
      if (panelId) {
        const p = useCanvasStore.getState().panels.find((x) => x.id === panelId);
        if (p) updatePanel(panelId, { meta: { ...p.meta, sessionId: id } });
      }
      onSessionCreated?.(id);
    },
    [panelId, updatePanel, onSessionCreated],
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
        Yükleniyor…
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
        linkedTerminalTitle={linkedTerminalPanel?.title ?? null}
        terminalToolActive={terminalToolActive}
        onToggleTerminalTool={() => setTerminalToolActive((v) => !v)}
        onSwitchSession={switchSession}
      />
    </AiComposerProvider>
  );
}

// ── history dropdown ──────────────────────────────────────────────────────────
function HistoryMenu({
  currentId,
  onSelect,
  onClose,
}: {
  currentId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const ref                       = useRef<HTMLDivElement>(null);
  const [sessions, setSessions]   = useState<SessionMeta[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    loadAll().then(({ sessions }) => {
      setSessions(sessions.slice().sort((a, b) => b.updatedAt - a.updatedAt));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handler);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-50 mt-1 flex w-64 flex-col overflow-hidden rounded-lg"
      style={{
        background: "rgba(14,14,22,0.97)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
        backdropFilter: "blur(16px)",
      }}
    >
      <div className="border-b border-[#1e1e1e] px-3 py-2 text-[9px] uppercase tracking-widest text-[#444]">
        Chat Geçmişi
      </div>
      <div className="max-h-60 overflow-y-auto">
        {loading && (
          <div className="px-3 py-3 text-[10px] text-[#333]">Yükleniyor…</div>
        )}
        {!loading && sessions.length === 0 && (
          <div className="px-3 py-3 text-[10px] text-[#333]">Henüz chat yok</div>
        )}
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => { onSelect(s.id); onClose(); }}
            className={cn(
              "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors duration-100",
              s.id === currentId
                ? "bg-[#5b8def14] text-[#5b8def]"
                : "text-[#888] hover:bg-[#ffffff07] hover:text-[#c0c0c0]",
            )}
          >
            <span className="max-w-full truncate text-[11px]">{s.title}</span>
            <span className="text-[9px] text-[#444]">
              {new Date(s.updatedAt).toLocaleDateString("tr-TR", {
                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
              })}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── chat body ─────────────────────────────────────────────────────────────────
function ChatBody({
  sessionId,
  wireBlocks,
  applyToAll,
  onToggleApplyToAll,
  linkedTerminalTitle,
  terminalToolActive,
  onToggleTerminalTool,
  onSwitchSession,
}: {
  sessionId: string;
  wireBlocks: WireBlock[];
  applyToAll: boolean;
  onToggleApplyToAll: () => void;
  linkedTerminalTitle: string | null;
  terminalToolActive: boolean;
  onToggleTerminalTool: () => void;
  onSwitchSession: (id: string) => void;
}) {
  const chat    = useMemo(() => getOrCreateChat(sessionId), [sessionId]);
  const helpers = useChat<UIMessage>({ chat });
  const { attachImageDataUrl } = useComposer();

  const [showHistory, setShowHistory] = useState(false);

  // Auto-attach image wires
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

  const handleNewChat = () => {
    onSwitchSession(newSessionId());
    setShowHistory(false);
  };

  return (
    <div className="flex h-full flex-col bg-[#0a0a0a]">
      {/* ── header ── */}
      <div className="relative flex h-8 shrink-0 items-center gap-1 border-b border-[#1e1e1e] bg-[#0d0d0d] px-1.5">
        <AgentSwitcher isMiniWindow />

        <div className="ml-auto flex items-center gap-0.5">
          {/* history button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              title="Chat geçmişi"
              className={cn(
                "flex h-6 items-center gap-1 rounded px-1.5 text-[10px] transition-colors duration-150",
                showHistory
                  ? "bg-[#5b8def18] text-[#5b8def]"
                  : "text-[#444] hover:bg-[#ffffff08] hover:text-[#888]",
              )}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="8" cy="8" r="6"/>
                <path d="M8 5v3l2 2"/>
              </svg>
              Geçmiş
            </button>

            {showHistory && (
              <HistoryMenu
                currentId={sessionId}
                onSelect={onSwitchSession}
                onClose={() => setShowHistory(false)}
              />
            )}
          </div>

          {/* new chat button */}
          <button
            type="button"
            onClick={handleNewChat}
            title="Yeni chat başlat"
            className="flex h-6 items-center gap-1 rounded px-1.5 text-[10px] text-[#444] transition-colors duration-150 hover:bg-[#ffffff08] hover:text-[#5b8def]"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M8 3v10M3 8h10"/>
            </svg>
            Yeni
          </button>
        </div>
      </div>

      {/* ── wire context badges ── */}
      {wireBlocks.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[#1e1e1e] bg-[#0d0d0d] px-2 py-1">
          <span className="text-[8px] text-[#444]">ctx:</span>
          {wireBlocks.map((b) => {
            const live  = b.connectionKind === "context" || applyToAll;
            const color = b.connectionKind === "context" ? "#9b72ef" : "#5b8def";
            return (
              <span
                key={b.panelId}
                title={`${b.panelTitle} · ${b.panelType} · ${b.connectionKind} · ${typeof b.data?.value === "string" ? b.data.value.length : 0} chars`}
                className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[8px] transition-opacity duration-150"
                style={{ color, backgroundColor: `${color}1a`, opacity: live ? 1 : 0.45 }}
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
          >
            ⊞ all
          </button>
        </div>
      )}

      {/* ── terminal link ── */}
      {linkedTerminalTitle && (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-[#1e1e1e] bg-[#0d0d0d] px-2 py-1">
          <span className="font-mono text-[8px] text-[#444]">{">"}_</span>
          <span className="flex-1 truncate font-mono text-[8px] text-[#666]">{linkedTerminalTitle}</span>
          <button
            type="button"
            onClick={onToggleTerminalTool}
            className="rounded px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wide transition-colors duration-150"
            style={{
              color: terminalToolActive ? "#4db89a" : "#555",
              backgroundColor: terminalToolActive ? "#4db89a22" : "transparent",
              border: `1px solid ${terminalToolActive ? "#4db89a44" : "#2a2a2a"}`,
            }}
          >
            {terminalToolActive ? "araç ✓" : "araç"}
          </button>
        </div>
      )}

      {/* ── messages ── */}
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

      {/* ── input ── */}
      <div className="shrink-0 border-t border-[#1e1e1e]">
        <AiInputBar />
      </div>
    </div>
  );
}
