import {
  Experimental_Agent as Agent,
  DirectChatTransport,
  stepCountIs,
  type LanguageModel,
} from "ai";
import {
  DEFAULT_MODEL_ID,
  getModel,
  OPENCODE_DEFAULT_BASE_URL,
  MAX_AGENT_STEPS,
  SYSTEM_PROMPT,
  type ModelId,
  type ProviderId,
} from "../config";
import type { ProviderKeys } from "./keyring";
import { buildTools, type ToolContext } from "../tools/tools";

/** Per-provider configuration: base URL and model identifier overrides. */
export type ProviderConfig = {
  baseURL?: string;
  modelId?: string;
};

/** Map of provider id → its config. Missing entries fall back to defaults. */
export type ProviderConfigs = Partial<Record<ProviderId, ProviderConfig>>;

export type AgentDeps = {
  keys: ProviderKeys;
  modelId?: ModelId;
  customInstructions?: string;
  agentPersona?: { name: string; instructions: string } | null;
  toolContext: ToolContext;
  onStep?: (step: string | null) => void;
  providers?: ProviderConfigs;
  planMode?: boolean;
  projectMemory?: string | null;
  agentSelfContext?: string | null;
  toolset?: string[];
};

const TOOL_LABELS: Record<string, (input: Record<string, unknown>) => string> = {
  read_file: (i) => `Reading ${shortPath(i.path)}`,
  list_directory: (i) => `Listing ${shortPath(i.path)}`,
  grep: (i) => `Grepping ${ellipsize(String(i.pattern ?? ""), 40)}`,
  glob: (i) => `Globbing ${ellipsize(String(i.pattern ?? ""), 40)}`,
  edit: (i) => `Editing ${shortPath(i.path)}`,
  multi_edit: (i) => `Editing ${shortPath(i.path)}`,
  write_file: (i) => `Writing ${shortPath(i.path)}`,
  create_directory: (i) => `Creating ${shortPath(i.path)}`,
  bash_run: (i) => `Running ${ellipsize(String(i.command ?? ""), 60)}`,
  bash_background: (i) => `Spawning ${ellipsize(String(i.command ?? ""), 60)}`,
  bash_logs: () => `Reading logs`,
  bash_list: () => `Listing background processes`,
  bash_kill: () => `Stopping background process`,
  suggest_command: (i) => `Suggesting ${ellipsize(String(i.command ?? ""), 60)}`,
  todo_write: (i) =>
    `Updating plan (${Array.isArray(i.todos) ? i.todos.length : 0} items)`,
  run_subagent: (i) => `Spawning ${String(i.type ?? "subagent")} subagent`,
  vault_search: (i) => `Searching vault: ${ellipsize(String(i.query ?? ""), 40)}`,
  vault_read: (i) => `Reading vault/${String(i.category ?? "")}/${String(i.slug ?? "")}`,
  vault_write: (i) => `Writing vault/${String(i.category ?? "")}/${String(i.slug ?? "")}`,
};

function shortPath(p: unknown): string {
  if (typeof p !== "string") return "";
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

function ellipsize(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export type BuildModelOptions = {
  providers?: ProviderConfigs;
};

// In dev, route OpenCode Zen requests through the Vite proxy to avoid CORS.
function toDevProxyURL(url: string): string {
  if (!import.meta.env.DEV) return url;
  const origin = window.location.origin;
  if (/^https?:\/\/opencode\.ai/.test(url))
    return url.replace(/^https?:\/\/opencode\.ai/, `${origin}/opencode-proxy`);
  return url;
}

// Memoize built models — provider clients are not free to construct.
const modelCache = new Map<string, LanguageModel>();

export async function buildLanguageModel(
  provider: ProviderId,
  keys: ProviderKeys,
  resolvedModelId: string,
  options: BuildModelOptions = {},
): Promise<LanguageModel> {
  if (!keys.opencode) {
    throw new Error(
      "No API key configured for OpenCode Zen. Open Settings → AI to add one.",
    );
  }
  const effectiveModelId =
    options.providers?.[provider]?.modelId || resolvedModelId;
  const baseURL = toDevProxyURL(
    options.providers?.[provider]?.baseURL ?? OPENCODE_DEFAULT_BASE_URL,
  );
  const cacheKey = `${provider} ${effectiveModelId} ${baseURL}`;
  const hit = modelCache.get(cacheKey);
  if (hit) return hit;

  const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
  const built = createOpenAICompatible({
    name: "opencode",
    baseURL,
    headers: {
      Authorization: `Bearer ${keys.opencode}`,
    },
  })(effectiveModelId);

  modelCache.set(cacheKey, built);
  return built;
}

function buildModel(
  modelId: ModelId,
  keys: ProviderKeys,
  providers: ProviderConfigs,
): Promise<LanguageModel> {
  const m = getModel(modelId);
  return buildLanguageModel(m.provider, keys, m.id, { providers });
}

export async function createAtlasAgent({
  keys,
  modelId = DEFAULT_MODEL_ID,
  customInstructions,
  agentPersona,
  toolContext,
  onStep,
  providers = {},
  planMode,
  projectMemory,
  agentSelfContext,
  toolset,
}: AgentDeps) {
  const trimmedCustom = customInstructions?.trim();
  const personaBlock = agentPersona?.instructions.trim()
    ? `\n\n## ACTIVE AGENT — ${agentPersona.name}\n${agentPersona.instructions.trim()}`
    : "";
  const customBlock = trimmedCustom
    ? `\n\n## USER CUSTOM INSTRUCTIONS — follow unless they conflict with safety rules above\n${trimmedCustom}`
    : "";
  const memoryBlock =
    projectMemory && projectMemory.trim().length > 0
      ? `\n\n## PROJECT — ATLAS.md\n${projectMemory.trim()}`
      : "";
  const selfContextBlock =
    agentSelfContext && agentSelfContext.trim().length > 0
      ? `\n\n${agentSelfContext.trim()}`
      : "";
  const planBlock = planMode
    ? `\n\n## PLAN MODE — ACTIVE\nMutating tools (write_file, edit, multi_edit, create_directory) will queue their changes for the user to review as a single diff. Do NOT execute bash_run or bash_background while plan mode is active — restrict yourself to reads (read_file, grep, glob, list_directory) and the queued mutations. After queueing the full set of edits, stop and return a brief summary; do not continue acting until the user has accepted/rejected.`
    : "";
  const instructions = `${SYSTEM_PROMPT}${memoryBlock}${selfContextBlock}${personaBlock}${customBlock}${planBlock}`;
  const model = await buildModel(modelId, keys, providers);
  const allTools = buildTools(toolContext);
  const tools =
    toolset && toolset.length > 0
      ? (Object.fromEntries(
          Object.entries(allTools).filter(([name]) => toolset.includes(name)),
        ) as typeof allTools)
      : allTools;
  return new Agent({
    model,
    instructions,
    tools,
    stopWhen: stepCountIs(MAX_AGENT_STEPS),
    onStepFinish: (step) => {
      if (!onStep) return;
      const last = step.toolCalls?.[step.toolCalls.length - 1];
      if (last) {
        const label = TOOL_LABELS[last.toolName];
        onStep(
          label
            ? label((last.input ?? {}) as Record<string, unknown>)
            : `Calling ${last.toolName}`,
        );
      } else if (step.text) {
        onStep("Writing");
      }
    },
    onFinish: () => {
      onStep?.(null);
    },
  });
}

export type AtlasAgent = Awaited<ReturnType<typeof createAtlasAgent>>;

export function createAtlasTransport(agent: AtlasAgent) {
  return new DirectChatTransport({ agent });
}
