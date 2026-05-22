import { tool } from "ai";
import { z } from "zod";
import type { ToolContext } from "./context";

const BRIDGE = "http://localhost:4245";

async function call(endpoint: string, body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${BRIDGE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  if (data.error) return `CodeGraph error: ${data.error}`;
  return JSON.stringify(data, null, 2);
}

async function bridgeStatus(): Promise<{ ready: boolean; status: string }> {
  try {
    const res = await fetch(`${BRIDGE}/status`, { signal: AbortSignal.timeout(3000) });
    const d = await res.json();
    return { ready: d.status === "ready", status: d.status ?? "unknown" };
  } catch {
    return { ready: false, status: "not_running" };
  }
}

export function buildCodegraphTools(_ctx: ToolContext) {
  const root = () => _ctx.getWorkspaceRoot() ?? ".";

  return {
    code_search: tool({
      description:
        "Search for code symbols (functions, classes, methods, variables) by name across the entire workspace. Uses a pre-built SQLite index — much faster than grep. Returns name, kind, file, and line. Use this BEFORE reading files.",
      inputSchema: z.object({
        query: z.string().describe("Symbol name or partial name, e.g. 'toggleMinimized', 'AuthService', 'useCanvas'"),
        kind: z
          .enum(["function", "method", "class", "interface", "type", "variable", "route", "component"])
          .optional()
          .describe("Filter by symbol type"),
        limit: z.number().int().min(1).max(50).optional().describe("Max results (default 15)"),
      }),
      execute: async ({ query, kind, limit }) => {
        const { ready, status } = await bridgeStatus();
        if (!ready) return `CodeGraph bridge is ${status}. Start it: node tools/codegraph_bridge.js "${root()}"`;
        return call("/search", { query, kind, limit: limit ?? 15 });
      },
    }),

    code_explore: tool({
      description:
        "Deep exploration — returns comprehensive context (entry points, related symbols, source code sections) for a topic in ONE call. Use specific symbol/file names in the query, not full sentences. Call code_search first to discover symbol names, then use them here. Example query: 'toggleMinimized CanvasDock canvasStore' not 'how does minimize work'.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("Space-separated symbol names, file names, or short code terms. e.g. 'toggleMinimized CanvasDock InfiniteCanvas'"),
        maxFiles: z.number().int().min(1).max(20).optional().describe("Max source files to include (default 10)"),
      }),
      execute: async ({ query, maxFiles }) => {
        const { ready, status } = await bridgeStatus();
        if (!ready) return `CodeGraph bridge is ${status}. Start it: node tools/codegraph_bridge.js "${root()}"`;
        return call("/explore", { query, maxFiles: maxFiles ?? 10 });
      },
    }),

    code_callers: tool({
      description:
        "Find all functions/methods that call a specific symbol. Answers 'who calls this?' without reading files. Essential before refactoring — understand the full blast radius first.",
      inputSchema: z.object({
        symbol: z.string().describe("Function, method, or class name"),
        limit: z.number().int().min(1).max(50).optional().describe("Max callers to return (default 20)"),
      }),
      execute: async ({ symbol, limit }) => {
        const { ready, status } = await bridgeStatus();
        if (!ready) return `CodeGraph bridge is ${status}. Start it: node tools/codegraph_bridge.js "${root()}"`;
        return call("/callers", { symbol, limit: limit ?? 20 });
      },
    }),

    code_callees: tool({
      description:
        "Find all functions/methods that a specific symbol calls. Answers 'what does this call?' — understand dependencies and code flow without reading files.",
      inputSchema: z.object({
        symbol: z.string().describe("Function, method, or class name"),
        limit: z.number().int().min(1).max(50).optional().describe("Max callees to return (default 20)"),
      }),
      execute: async ({ symbol, limit }) => {
        const { ready, status } = await bridgeStatus();
        if (!ready) return `CodeGraph bridge is ${status}. Start it: node tools/codegraph_bridge.js "${root()}"`;
        return call("/callees", { symbol, limit: limit ?? 20 });
      },
    }),

    code_impact: tool({
      description:
        "Analyze the full impact radius of changing a symbol. Shows every symbol that would be affected — callers of callers, transitive dependencies. Use this before any refactor to understand what could break.",
      inputSchema: z.object({
        symbol: z.string().describe("Function, method, class, or type name to analyze"),
        depth: z
          .number()
          .int()
          .min(1)
          .max(4)
          .optional()
          .describe("How many levels of dependencies to traverse (default 2)"),
      }),
      execute: async ({ symbol, depth }) => {
        const { ready, status } = await bridgeStatus();
        if (!ready) return `CodeGraph bridge is ${status}. Start it: node tools/codegraph_bridge.js "${root()}"`;
        return call("/impact", { symbol, depth: depth ?? 2 });
      },
    }),

    code_status: tool({
      description:
        "Check if the CodeGraph index is ready and get stats: file count, symbol count, last sync. Call this first if you're unsure whether the index exists.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const res = await fetch(`${BRIDGE}/status`, { signal: AbortSignal.timeout(4000) });
          return JSON.stringify(await res.json(), null, 2);
        } catch {
          return `CodeGraph bridge not running. Start it: node tools/codegraph_bridge.js "${root()}"`;
        }
      },
    }),
  };
}
