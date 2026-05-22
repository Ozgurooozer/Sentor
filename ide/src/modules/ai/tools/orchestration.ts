/**
 * Orchestration tools — let Orkestra (or any coordinator agent) delegate
 * read-only tasks to other registered agents.
 *
 *   agent_invoke  — run any registered agent on a self-contained task
 *                   (read-only safe pool only; mutating agents must be triggered
 *                   manually by the user)
 */
import { tool } from "ai";
import { z } from "zod";
import { BUILTIN_AGENTS } from "../lib/agents";
import { useAgentsStore } from "../store/agentsStore";
import { useChatStore } from "../store/chatStore";
import type { ToolContext } from "./context";

// Tools that never require user approval — safe to give to sub-invocations.
const INVOKE_SAFE_TOOLS = new Set([
  "vault_search",
  "vault_read",
  "web_search",
  "web_fetch",
  "read_file",
  "list_directory",
  "grep",
  "glob",
  "canvas_read_state",
]);

const INVOKE_MAX_STEPS = 10;

export function buildOrchestrationTools(ctx: ToolContext) {
  return {
    agent_invoke: tool({
      description: `Invoke a registered agent to handle a self-contained read-only task and return its summary. Useful for Orkestra to delegate research or analysis to a specialized agent (e.g. Vault for knowledge lookups, a custom research agent).

Important constraints:
- Only read-only tools are available inside the invoked agent (vault_search, vault_read, web_search, web_fetch, read_file, list_directory, grep, glob, canvas_read_state).
- Do NOT invoke Atlas-Maker or Coder this way — they need user interaction. Instead, describe the plan and tell the user to switch agents.
- The invoked agent has no memory of the current conversation — include all relevant context in the task.

Auto-executes (no approval needed).`,
      inputSchema: z.object({
        agent: z
          .string()
          .describe(
            "Agent name (case-insensitive, e.g. 'Vault') or id (e.g. 'builtin:vault').",
          ),
        task: z
          .string()
          .min(1)
          .describe(
            "Self-contained task description with all relevant context the agent needs.",
          ),
        description: z
          .string()
          .optional()
          .describe("Short label shown in the chat UI for the invocation card."),
      }),
      execute: async ({ agent: agentRef, task }) => {
        const { customAgents } = useAgentsStore.getState();
        const all = [...BUILTIN_AGENTS, ...customAgents];
        const target = all.find(
          (a) =>
            a.id === agentRef ||
            a.name.toLowerCase() === agentRef.toLowerCase(),
        );
        if (!target) {
          const names = all.map((a) => a.name).join(", ");
          return { error: `Agent "${agentRef}" not found. Available: ${names}` };
        }

        // Intersect the agent's declared toolset with the safe pool.
        const { buildTools } = await import("./tools");
        const allTools = buildTools(ctx);
        const allowedNames = target.toolset
          ? target.toolset.filter((t) => INVOKE_SAFE_TOOLS.has(t))
          : [...INVOKE_SAFE_TOOLS];
        const filteredTools: Record<string, unknown> = {};
        for (const name of allowedNames) {
          if (name in allTools)
            filteredTools[name] = allTools[name as keyof typeof allTools];
        }

        if (Object.keys(filteredTools).length === 0) {
          return {
            error: `Agent "${target.name}" has no safe read-only tools available for remote invocation. Tell the user to switch to this agent instead.`,
          };
        }

        const { apiKeys, selectedModelId } = useChatStore.getState();
        const prefs = (
          await import("@/modules/settings/preferences")
        ).usePreferencesStore.getState();
        const { buildLanguageModel } = await import("../lib/agent");
        const { getModel } = await import("../config");
        const { Experimental_Agent: AgentClass, stepCountIs } = await import("ai");

        const provider = getModel(selectedModelId).provider;
        const modelIdOverride =
          provider === "lmstudio"
            ? prefs.lmstudioChatModelId || undefined
            : prefs.ollamaChatModelId || undefined;

        let model;
        try {
          model = await buildLanguageModel(
            provider,
            apiKeys,
            getModel(selectedModelId).id,
            {
              providers: {
                [provider]: {
                  baseURL:
                    provider === "lmstudio"
                      ? prefs.lmstudioBaseURL
                      : prefs.ollamaBaseURL,
                  modelId: modelIdOverride,
                },
              },
            },
          );
        } catch (e) {
          return { error: String(e), agent: target.name };
        }

        const agent = new AgentClass({
          model,
          instructions: target.instructions,
          tools: filteredTools,
          stopWhen: stepCountIs(INVOKE_MAX_STEPS),
        } as never);

        const start = Date.now();
        try {
          const result = await (
            agent as unknown as {
              generate: (a: { prompt: string }) => Promise<unknown>;
            }
          ).generate({ prompt: task });
          const durationMs = Date.now() - start;
          const r = result as { text?: string; steps?: unknown[] };
          const summary = r.text ?? "(no output)";
          const stepCount = Array.isArray(r.steps) ? r.steps.length : 0;
          return { agent: target.name, summary, stepCount, durationMs };
        } catch (e) {
          return { error: String(e), agent: target.name };
        }
      },
    }),
  } as const;
}
