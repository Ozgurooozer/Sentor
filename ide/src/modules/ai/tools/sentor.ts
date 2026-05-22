import { tool } from "ai";
import { z } from "zod";
import { invoke } from "@tauri-apps/api/core";
import type { ToolContext } from "./context";

const SENTOR_URL = "http://127.0.0.1:3000";
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120_000;

let _bgHandle: number | null = null;

export async function isSentorRunning(): Promise<boolean> {
  try {
    const code = await invoke<number>("http_ping", { url: SENTOR_URL });
    return code >= 200 && code < 500;
  } catch {
    return false;
  }
}

export async function startSentorIfNeeded(sentorPath: string): Promise<void> {
  if (!sentorPath) return;
  if (await isSentorRunning()) return;
  // Use the wrapper script which handles Node 20 via fnm.
  // cmd /C start-sentor.bat searches cwd for the bat file.
  _bgHandle = await invoke<number>("shell_bg_spawn", {
    command: "start-sentor.bat",
    cwd: sentorPath,
  });
}

/** Poll until Sentor is ready or the timeout expires. Returns true if ready. */
export async function waitForSentor(timeoutMs = POLL_TIMEOUT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isSentorRunning()) return true;
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

export async function stopSentor(): Promise<void> {
  if (_bgHandle == null) return;
  await invoke("shell_bg_kill", { handle: _bgHandle });
  _bgHandle = null;
}

export function buildSentorTools(_ctx: ToolContext) {
  return {
    sentor_list_flows: tool({
      description:
        "List all Sentor visual agent flows. Returns id, name, and type for each. Call this before sentor_run_flow to get valid IDs.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const raw = await invoke<string>("sentor_api", {
            method: "GET",
            path: "/api/v1/chatflows",
          });
          return JSON.parse(raw) as unknown;
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    sentor_run_flow: tool({
      description:
        "Run a Sentor flow by ID and return its response. Use sentor_list_flows first to get valid IDs.",
      inputSchema: z.object({
        flowId: z.string().describe("Chatflow or agentflow ID"),
        question: z.string().describe("The user input to send to the flow"),
      }),
      execute: async ({ flowId, question }) => {
        try {
          const raw = await invoke<string>("sentor_api", {
            method: "POST",
            path: `/api/v1/prediction/${flowId}`,
            body: JSON.stringify({ question }),
          });
          return JSON.parse(raw) as unknown;
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),
  } as const;
}
