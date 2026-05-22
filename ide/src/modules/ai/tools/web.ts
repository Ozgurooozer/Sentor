import { tool } from "ai";
import { z } from "zod";
import { invoke } from "@tauri-apps/api/core";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { ToolContext } from "./context";

export function buildWebTools(_ctx: ToolContext) {
  return {
    web_search: tool({
      description:
        "Search the open web via SearXNG. Use when vault_search returns no good results (score < 6) or the question needs current/external information. Returns titles, URLs, and snippets.",
      inputSchema: z.object({
        query: z.string().describe("Search query"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe("Max results (default 8)"),
      }),
      execute: async ({ query, limit }) => {
        const searxngUrl = usePreferencesStore.getState().searxngUrl || undefined;
        try {
          const results = await invoke<
            Array<{ title: string; url: string; snippet: string }>
          >("web_search", { query, limit, searxngUrl });
          return { query, results };
        } catch (e) {
          return { error: String(e), results: [] };
        }
      },
    }),

    web_fetch: tool({
      description:
        "Fetch a URL and return its readable text content (scripts, nav, footer stripped; capped at 50 KB). Use after web_search to read the full content of a promising result. Check `truncated: true` in the result — if set, the page exceeded 50 KB and the text was cut off; mention this caveat when using the content.",
      inputSchema: z.object({
        url: z.string().url().describe("https:// URL to fetch"),
      }),
      execute: async ({ url }) => {
        try {
          return await invoke("web_fetch", { url });
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),
  } as const;
}
