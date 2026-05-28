import type { UIMessage } from "@ai-sdk/react";
import { DirectChatTransport } from "ai";
import { TERMINAL_BUFFER_LINES, type ModelId } from "../config";
import { createAtlasAgent, type ProviderConfigs } from "./agent";
import type { ProviderKeys } from "./keyring";
import { native } from "./native";
import type { ToolContext } from "../tools/tools";

const ATLAS_MD_MAX_BYTES = 32 * 1024;
type MemoryCacheEntry = { content: string | null; mtime: number };
const projectMemoryCache = new Map<string, MemoryCacheEntry>();

type SelfContextCacheEntry = { content: string | null; mtime: number };
const selfContextCache = new Map<string, SelfContextCacheEntry>();

async function readAgentSelfContext(): Promise<string | null> {
  try {
    const { useAgentsStore } = await import("@/modules/ai/store/agentsStore");
    const activeId = useAgentsStore.getState().activeId;
    const slug = activeId.startsWith("builtin:")
      ? activeId.slice("builtin:".length)
      : activeId;
    const cacheKey = slug;
    const cached = selfContextCache.get(cacheKey);
    if (cached && Date.now() - cached.mtime < 15_000) return cached.content;
    const { invoke } = await import("@tauri-apps/api/core");
    const snap = await invoke<{
      agent: string;
      state: Record<string, unknown>;
      recent_log: string[];
      open_projects: string[];
    }>("vault_agent_snapshot", { slug });
    const lines = [`## AGENT SELF-CONTEXT [${snap.agent}]`];
    const st = snap.state ?? {};
    if (st.status) lines.push(`status: ${String(st.status)}`);
    if (st.focus) lines.push(`focus: ${String(st.focus)}`);
    if (st.updated) lines.push(`updated: ${String(st.updated)}`);
    if (snap.open_projects.length > 0)
      lines.push(`open_projects: ${snap.open_projects.join(", ")}`);
    if (snap.recent_log.length > 0) {
      lines.push("recent_log (last 10):");
      snap.recent_log.slice(-10).forEach((l) => lines.push(`  ${l}`));
    }
    const content = lines.join("\n");
    selfContextCache.set(cacheKey, { content, mtime: Date.now() });
    return content;
  } catch {
    return null;
  }
}

async function readAtlasMd(workspaceRoot: string | null): Promise<string | null> {
  if (!workspaceRoot) return null;
  const path = `${workspaceRoot.replace(/\/$/, "")}/ATLAS.md`;
  const cached = projectMemoryCache.get(workspaceRoot);
  // Cache for 30s — cheap re-read after that to pick up edits.
  if (cached && Date.now() - cached.mtime < 30_000) return cached.content;
  try {
    const r = await native.readFile(path);
    if (r.kind !== "text") {
      projectMemoryCache.set(workspaceRoot, { content: null, mtime: Date.now() });
      return null;
    }
    const content =
      r.content.length > ATLAS_MD_MAX_BYTES
        ? r.content.slice(0, ATLAS_MD_MAX_BYTES)
        : r.content;
    projectMemoryCache.set(workspaceRoot, { content, mtime: Date.now() });
    return content;
  } catch {
    projectMemoryCache.set(workspaceRoot, { content: null, mtime: Date.now() });
    return null;
  }
}

type LiveSnapshot = {
  cwd: string | null;
  terminal: string | null;
  workspaceRoot: string | null;
  activeFile: string | null;
};

const MAX_TERMINAL_CHARS = 12_000;

type Deps = {
  getKeys: () => ProviderKeys;
  toolContext: ToolContext;
  getModelId: () => ModelId;
  getCustomInstructions: () => string;
  getAgentPersona: () => { name: string; instructions: string } | null;
  getLive: () => LiveSnapshot;
  /** Per-provider base URL + model overrides. */
  getProviders?: () => ProviderConfigs;
  onStep?: (step: string | null) => void;
  getPlanMode?: () => boolean;
  getAgentToolset?: () => string[] | undefined;
  /** When set, the canvas node/wire snapshot is injected into the system context block. */
  getCanvasSnapshot?: () => string | null;
};

export function createContextAwareTransport(deps: Deps) {
  return {
    async sendMessages(options: {
      messages: UIMessage[];
      [k: string]: unknown;
    }) {
      const live = deps.getLive();
      const [projectMemory, agentSelfContext] = await Promise.all([
        readAtlasMd(live.workspaceRoot),
        readAgentSelfContext(),
      ]);
      const agent = await createAtlasAgent({
        keys: deps.getKeys(),
        modelId: deps.getModelId(),
        customInstructions: deps.getCustomInstructions(),
        agentPersona: deps.getAgentPersona(),
        toolContext: deps.toolContext,
        onStep: deps.onStep,
        providers: deps.getProviders?.(),
        planMode: deps.getPlanMode?.(),
        projectMemory,
        agentSelfContext,
        toolset: deps.getAgentToolset?.(),
      });
      const base = new DirectChatTransport({ agent });
      const augmented = injectContext(options.messages, deps.getLive(), deps.getCanvasSnapshot?.() ?? null);
      return base.sendMessages({
        ...options,
        messages: augmented,
      } as Parameters<typeof base.sendMessages>[0]);
    },
    async reconnectToStream(options: unknown) {
      const live = deps.getLive();
      const [projectMemory, agentSelfContext] = await Promise.all([
        readAtlasMd(live.workspaceRoot),
        readAgentSelfContext(),
      ]);
      const agent = await createAtlasAgent({
        keys: deps.getKeys(),
        modelId: deps.getModelId(),
        customInstructions: deps.getCustomInstructions(),
        agentPersona: deps.getAgentPersona(),
        toolContext: deps.toolContext,
        onStep: deps.onStep,
        providers: deps.getProviders?.(),
        planMode: deps.getPlanMode?.(),
        projectMemory,
        agentSelfContext,
        toolset: deps.getAgentToolset?.(),
      });
      const base = new DirectChatTransport({ agent });
      type ReconnectArg = Parameters<typeof base.reconnectToStream>[0];
      return base.reconnectToStream(options as ReconnectArg);
    },
  };
}

function injectContext(messages: UIMessage[], live: LiveSnapshot, canvasSnapshot: string | null): UIMessage[] {
  if (!live.cwd && !live.terminal && !live.workspaceRoot && !canvasSnapshot) return messages;
  const lastUserIdx = lastIndex(messages, (m) => m.role === "user");
  if (lastUserIdx === -1) return messages;

  const block = formatContextBlock(live, canvasSnapshot);
  return messages.map((m, i) => {
    if (i !== lastUserIdx) return m;
    const contextPart = { type: "text" as const, text: block };
    return {
      ...m,
      parts: [contextPart, ...m.parts] as UIMessage["parts"],
    };
  });
}

function formatContextBlock(live: LiveSnapshot, canvasSnapshot: string | null): string {
  const lines = [
    '<terminal-context note="auto-injected, read-only">',
    `workspace_root: ${live.workspaceRoot ?? "(unknown)"}`,
    `active_terminal_cwd: ${live.cwd ?? "(unknown)"}`,
  ];
  if (live.activeFile) lines.push(`active_file: ${live.activeFile}`);
  if (live.terminal) {
    const trimmed = capChars(
      lastNLines(live.terminal, TERMINAL_BUFFER_LINES),
      MAX_TERMINAL_CHARS,
    );
    lines.push("recent_terminal_output:");
    lines.push("```");
    lines.push(trimmed);
    lines.push("```");
  }
  if (canvasSnapshot) {
    lines.push("canvas_state:");
    lines.push("```");
    lines.push(canvasSnapshot);
    lines.push("```");
  }
  lines.push("</terminal-context>");
  lines.push("");
  return lines.join("\n");
}

function lastNLines(s: string, n: number): string {
  const all = s.split("\n");
  return all.length <= n ? s : all.slice(all.length - n).join("\n");
}

function capChars(s: string, max: number): string {
  if (s.length <= max) return s;
  return `…[truncated ${s.length - max} chars]…\n${s.slice(s.length - max)}`;
}

function lastIndex<T>(arr: T[], pred: (x: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return i;
  return -1;
}

export const CONTEXT_BLOCK_RE =
  /^<terminal-context[^>]*>[\s\S]*?<\/terminal-context>\n*/;

export function stripContextBlock(text: string): string {
  return text.replace(CONTEXT_BLOCK_RE, "");
}
