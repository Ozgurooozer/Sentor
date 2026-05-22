import {
  Experimental_Agent as Agent,
  DirectChatTransport,
  stepCountIs,
  type LanguageModel,
} from "ai";
import {
  CUSTOM_DEFAULT_BASE_URL,
  DEFAULT_MODEL_ID,
  getModel,
  LMSTUDIO_DEFAULT_BASE_URL,
  OLLAMA_DEFAULT_BASE_URL,
  MAX_AGENT_STEPS,
  providerNeedsKey,
  SYSTEM_PROMPT,
  type ModelId,
  type ProviderId,
} from "../config";
import type { ProviderKeys } from "./keyring";
import { buildTools, type ToolContext } from "../tools/tools";

/** Per-provider configuration: base URL and model identifier overrides. */
export type ProviderConfig = {
  /** Override the OpenAI-compatible base URL (LM Studio / Ollama / custom). */
  baseURL?: string;
  /** Override the model identifier sent to the provider. */
  modelId?: string;
};

/** Map of provider id → its config. Missing entries fall back to defaults. */
export type ProviderConfigs = Partial<Record<ProviderId, ProviderConfig>>;

export type AgentDeps = {
  keys: ProviderKeys;
  modelId?: ModelId;
  customInstructions?: string;
  /** Persona / role for this conversation (system prompt addendum). */
  agentPersona?: { name: string; instructions: string } | null;
  toolContext: ToolContext;
  onStep?: (step: string | null) => void;
  /** Per-provider base URL + model overrides. Replaces the flat per-provider fields. */
  providers?: ProviderConfigs;
  /** True when /plan is active — agent should batch edits for review. */
  planMode?: boolean;
  /** Contents of ATLAS.md at workspace root, if present. Appended verbatim. */
  projectMemory?: string | null;
  /** Formatted self-context block from this agent's vault office (state + recent log). */
  agentSelfContext?: string | null;
  /** Tool names this agent is allowed to call. Undefined = all tools allowed. */
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
  bash_background: (i) =>
    `Spawning ${ellipsize(String(i.command ?? ""), 60)}`,
  bash_logs: () => `Reading logs`,
  bash_list: () => `Listing background processes`,
  bash_kill: () => `Stopping background process`,
  suggest_command: (i) =>
    `Suggesting ${ellipsize(String(i.command ?? ""), 60)}`,
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
  /** Per-provider base URL + model overrides. */
  providers?: ProviderConfigs;
};

// In dev, route localhost provider URLs through the Vite proxy to avoid CORS.
function toDevProxyURL(url: string): string {
  if (!import.meta.env.DEV) return url;
  const origin = window.location.origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1):1234/.test(url))
    return url.replace(/^https?:\/\/(localhost|127\.0\.0\.1):1234/, `${origin}/lmstudio-proxy`);
  if (/^https?:\/\/(localhost|127\.0\.0\.1):11434/.test(url))
    return url.replace(/^https?:\/\/(localhost|127\.0\.0\.1):11434/, `${origin}/ollama-proxy`);
  return url;
}

// Memoize built models — provider clients are not free to construct.
const modelCache = new Map<string, LanguageModel>();

const PROVIDER_DEFAULT_BASE_URL: Partial<Record<ProviderId, string>> = {
  lmstudio: LMSTUDIO_DEFAULT_BASE_URL,
  ollama: OLLAMA_DEFAULT_BASE_URL,
  custom: CUSTOM_DEFAULT_BASE_URL,
};

function resolveBaseURL(provider: ProviderId, providers?: ProviderConfigs): string {
  const fromConfig = providers?.[provider]?.baseURL;
  const fallback = PROVIDER_DEFAULT_BASE_URL[provider] ?? "";
  return toDevProxyURL(fromConfig ?? fallback);
}

export async function buildLanguageModel(
  provider: ProviderId,
  keys: ProviderKeys,
  resolvedModelId: string,
  options: BuildModelOptions = {},
): Promise<LanguageModel> {
  if (providerNeedsKey(provider) && !keys[provider]) {
    throw new Error(
      `No API key configured for ${provider}. Open Settings → AI to add one.`,
    );
  }
  const effectiveModelId =
    options.providers?.[provider]?.modelId || resolvedModelId;
  const baseURL = resolveBaseURL(provider, options.providers);
  const cacheKey = `${provider} ${effectiveModelId} ${baseURL}`;
  const hit = modelCache.get(cacheKey);
  if (hit) return hit;

  let built: LanguageModel;
  switch (provider) {
    case "lmstudio": {
      const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
      built = createOpenAICompatible({ name: "lmstudio", baseURL })(effectiveModelId);
      break;
    }
    case "ollama": {
      const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
      built = createOpenAICompatible({ name: "ollama", baseURL })(effectiveModelId);
      break;
    }
    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      built = createOpenAI({ apiKey: keys.openai ?? "" })(effectiveModelId);
      break;
    }
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      built = createAnthropic({ apiKey: keys.anthropic ?? "" })(effectiveModelId);
      break;
    }
    case "groq": {
      const { createGroq } = await import("@ai-sdk/groq");
      built = createGroq({ apiKey: keys.groq ?? "" })(effectiveModelId);
      break;
    }
    case "custom": {
      const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
      const headers: Record<string, string> = keys.custom
        ? { Authorization: `Bearer ${keys.custom}` }
        : {};
      built = createOpenAICompatible({ name: "custom", baseURL, headers })(effectiveModelId);
      break;
    }
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unsupported provider: ${_exhaustive as ProviderId}`);
    }
  }
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
