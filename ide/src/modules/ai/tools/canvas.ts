/**
 * Canvas tools — give the AI agent visibility into and control over the
 * canvas workspace. These tools are intentionally narrow-scoped:
 *
 *   canvas_read_state  — read-only snapshot (auto-executes, no approval)
 *   agent_spawn        — create a new agent (requires approval)
 *   blueprint_save     — serialize canvas → vault/blueprints (requires approval)
 */
import { tool } from "ai";
import { z } from "zod";
import { useCanvasStore } from "@/modules/canvas/canvasStore";
import { useAgentsStore, newAgentId } from "@/modules/ai/store/agentsStore";
import { invoke } from "@tauri-apps/api/core";
import type { ToolContext } from "./context";
import type { PanelType } from "@/modules/canvas/types";

// ── Helpers ────────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-");
}

async function ensureDir(path: string): Promise<void> {
  try {
    await invoke("fs_create_directory", { path });
  } catch {
    // Directory may already exist — ignore.
  }
}

async function writeText(path: string, content: string): Promise<void> {
  await invoke("fs_write_file", { path, content });
}

function blueprintHtml(
  name: string,
  description: string,
  panelCount: number,
  connectionCount: number,
  created: string,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${name} — Blueprint</title>
<style>
:root{--bg:#0a0a0a;--surface:#111;--elevated:#1a1a1a;--border:#2a2a2a;--text:#f5f5f5;--dim:#888;--accent:#5b8def}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6;padding:32px}
header{border-bottom:1px solid var(--border);padding-bottom:16px;margin-bottom:24px}
h1{font-size:18px;font-weight:600;color:var(--text)}
.meta{font-size:11px;color:var(--dim);margin-top:4px}
.badge{display:inline-block;background:rgba(91,141,239,0.12);border:1px solid rgba(91,141,239,0.3);color:var(--accent);border-radius:4px;padding:2px 8px;font-size:10px;font-family:monospace;margin-right:6px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-top:20px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:16px}
.card-label{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--dim);margin-bottom:4px}
.card-value{font-size:22px;font-weight:700;color:var(--text)}
p{color:var(--dim);margin-top:12px;font-size:13px}
</style>
</head>
<body>
<header>
  <h1>${name}</h1>
  <div class="meta">
    <span class="badge">blueprint</span>
    <span class="badge">atlas-blueprint-v1</span>
    ${created}
  </div>
</header>
<p>${description || "No description."}</p>
<div class="grid">
  <div class="card"><div class="card-label">Panels</div><div class="card-value">${panelCount}</div></div>
  <div class="card"><div class="card-label">Connections</div><div class="card-value">${connectionCount}</div></div>
</div>
<p style="margin-top:24px;font-size:11px;color:#444">Load this blueprint in the canvas via right-click → Blueprint Import.</p>
</body>
</html>`;
}

// ── Tool definitions ───────────────────────────────────────────────────────────

export function buildCanvasTools(ctx: ToolContext) {
  return {
    canvas_read_state: tool({
      description:
        "Read a snapshot of the current canvas — panels (id, type, title, position) and connections. Use this to understand what the user has built before designing or spawning agents. Read-only; never modifies canvas state.",
      inputSchema: z.object({}),
      execute: async () => {
        const { panels, connections } = useCanvasStore.getState();
        type PanelSummary = Record<string, unknown>;
        const summarizePanel = (p: (typeof panels)[number]): PanelSummary => ({
          id: p.id,
          type: p.type,
          title: p.title,
          x: Math.round(p.x),
          y: Math.round(p.y),
          width: p.width,
          height: p.height,
          pinned: p.pinned ?? false,
          meta: p.meta,
          ...(p.children && p.children.length > 0
            ? { children: p.children.map(summarizePanel) }
            : { childCount: p.children?.length ?? 0 }),
        });
        return {
          panels: panels.map(summarizePanel),
          connections: connections.map((c) => ({
            id: c.id,
            from: c.fromPanel,
            fromSide: c.fromSide,
            to: c.toPanel,
            toSide: c.toSide,
          })),
          panelCount: panels.length,
          connectionCount: connections.length,
        };
      },
    }),

    agent_spawn: tool({
      description:
        "Create and register a new custom agent. Requires user approval. Do NOT include agent_spawn in the new agent's toolset (recursive builder prevention). Always call canvas_read_state first to understand the current workspace context.",
      inputSchema: z.object({
        name: z
          .string()
          .min(1)
          .max(64)
          .describe("Kebab-case agent name, e.g. research-agent"),
        task: z
          .string()
          .min(1)
          .describe("One-sentence description of what this agent does"),
        system_prompt: z
          .string()
          .min(1)
          .describe("The full system prompt for the new agent"),
        tools: z
          .array(z.string())
          .min(1)
          .describe(
            "List of tool names. Never include agent_spawn. Allowed: vault_search, vault_read, vault_write, web_search, web_fetch, read_file, write_file, list_directory, bash_run, canvas_read_state, blueprint_save, agent_invoke",
          ),
        memory: z
          .enum(["session", "ephemeral"])
          .default("session")
          .describe("session = remembers chat history; ephemeral = fresh context each time"),
        base_agent_id: z
          .string()
          .optional()
          .describe(
            "Optional ID of a builtin agent to extend. E.g. builtin:vault. Its instructions are prepended.",
          ),
      }),
      execute: async ({ name, task, system_prompt, tools, memory, base_agent_id }) => {
        const trimmed = name.trim();
        const allAgents = useAgentsStore.getState().all();

        if (allAgents.some((a) => a.name.toLowerCase() === trimmed.toLowerCase())) {
          return { error: `Agent named "${trimmed}" already exists. Choose a different name.` };
        }

        if (tools.includes("agent_spawn")) {
          return { error: "agent_spawn cannot be in the spawned agent's toolset." };
        }

        const { BUILTIN_AGENTS } = await import("@/modules/ai/lib/agents");
        const base = BUILTIN_AGENTS.find((a) => a.id === base_agent_id);
        const instructions = base
          ? `${base.instructions}\n\n---\n\n${system_prompt}`
          : system_prompt;

        const agent = {
          id: newAgentId(),
          name: trimmed,
          description: task,
          instructions,
          icon: "spark" as const,
          builtIn: false,
          toolset: tools,
          memory,
          baseAgentId: base_agent_id,
          createdBy: "sentor" as const,
          createdAt: new Date().toISOString(),
        };

        useAgentsStore.getState().upsert(agent);

        return {
          success: true,
          agentId: agent.id,
          name: agent.name,
          message: `Agent "${agent.name}" spawned and registered.`,
        };
      },
    }),

    canvas_add_node: tool({
      description:
        "Add a new node panel to the canvas. Returns the new panel id. Use canvas_read_state first to understand the layout before adding.",
      inputSchema: z.object({
        type: z.enum(["terminal","editor","chat","agent","input","note","checklist","gallery",
          "filebrowser","sketch","web","canvas","pipeline","codegraph","header","pipe"]).describe("Panel type"),
        title: z.string().optional().describe("Display title"),
        x: z.number().optional().describe("Canvas X position"),
        y: z.number().optional().describe("Canvas Y position"),
        meta: z.record(z.string(), z.unknown()).optional().describe("Panel-specific metadata"),
      }),
      execute: async ({ type, title, x, y, meta }) => {
        const at = x != null ? { x, y: y ?? 200 } : undefined;
        const id = useCanvasStore.getState().addPanel(type as PanelType, at, meta as Record<string, unknown>);
        if (title) useCanvasStore.getState().updatePanel(id, { title });
        return { ok: true, id, type, title: title ?? type };
      },
    }),

    canvas_remove_node: tool({
      description: "Remove a canvas panel by its id. Get ids from canvas_read_state.",
      inputSchema: z.object({ id: z.string().describe("Panel id") }),
      execute: async ({ id }) => {
        useCanvasStore.getState().removePanel(id);
        return { ok: true, removed: id };
      },
    }),

    canvas_update_node: tool({
      description: "Update a canvas panel's title, position, or meta. Supply only the fields to change.",
      inputSchema: z.object({
        id:    z.string().describe("Panel id"),
        title: z.string().optional(),
        x:     z.number().optional(),
        y:     z.number().optional(),
        meta:  z.record(z.string(), z.unknown()).optional(),
      }),
      execute: async ({ id, title, x, y, meta }) => {
        const patch: Record<string, unknown> = {};
        if (title !== undefined) patch.title = title;
        if (x     !== undefined) patch.x = x;
        if (y     !== undefined) patch.y = y;
        if (meta  !== undefined) patch.meta = meta;
        useCanvasStore.getState().updatePanel(id, patch);
        return { ok: true, updated: id };
      },
    }),

    canvas_connect: tool({
      description:
        "Wire two canvas panels together. kind: data (blue, value) | context (purple, silent) | trigger (green, execution signal).",
      inputSchema: z.object({
        from_id:   z.string().describe("Source panel id"),
        to_id:     z.string().describe("Target panel id"),
        from_port: z.string().optional().describe("Output port name (omit for default)"),
        to_port:   z.string().optional().describe("Input port name (omit for default)"),
        kind:      z.enum(["data","context","trigger"]).default("data"),
      }),
      execute: async ({ from_id, to_id, from_port, to_port, kind }) => {
        const id = useCanvasStore.getState().addConnection(
          from_id, "right", to_id, "left", from_port, to_port, kind,
        );
        return { ok: true, connectionId: id };
      },
    }),

    canvas_clear: tool({
      description:
        "Remove ALL non-pinned panels and wires from the active canvas. Cannot be undone. Confirm with the user before calling.",
      inputSchema: z.object({}),
      execute: async () => {
        const s = useCanvasStore.getState();
        const toRemove = s.panels.filter((p) => !p.pinned).map((p) => p.id);
        toRemove.forEach((id) => s.removePanel(id));
        return { ok: true, removed: toRemove.length };
      },
    }),

    canvas_send_to_terminal: tool({
      description:
        "Send a shell command to a terminal panel on the canvas. The terminal must already exist (use canvas_add_node to create one first).",
      inputSchema: z.object({
        panel_id: z.string().describe("Terminal panel id"),
        cmd:      z.string().describe("Command to execute"),
      }),
      execute: async ({ panel_id, cmd }) => {
        useCanvasStore.getState().triggerTerminal(panel_id, cmd);
        return { ok: true, sent: cmd.slice(0, 80) };
      },
    }),

    blueprint_save: tool({
      description:
        "Save the current canvas state as a reusable blueprint. Writes blueprint.json + an index.html preview page to vault/blueprints/{slug}/. Requires workspace root to be set.",
      inputSchema: z.object({
        name: z.string().min(1).describe("Human-readable blueprint name"),
        description: z
          .string()
          .default("")
          .describe("What this blueprint does / when to use it"),
      }),
      execute: async ({ name, description }) => {
        const workspaceRoot = ctx.getWorkspaceRoot();
        if (!workspaceRoot) {
          return { error: "No workspace root set. Open a folder first." };
        }

        const slug = slugify(name) || `blueprint-${Date.now()}`;
        const sep = workspaceRoot.includes("\\") ? "\\" : "/";
        const dir = `${workspaceRoot}${sep}vault${sep}blueprints${sep}${slug}`;

        const { panels, connections } = useCanvasStore.getState();
        const created = new Date().toISOString();

        const blueprint = {
          $schema: "atlas-blueprint-v1",
          slug,
          name,
          version: 1,
          description,
          panels,
          connections,
          created,
          updated: created,
        };

        try {
          await ensureDir(`${workspaceRoot}${sep}vault${sep}blueprints`);
          await ensureDir(dir);
          await writeText(
            `${dir}${sep}blueprint.json`,
            JSON.stringify(blueprint, null, 2),
          );
          await writeText(
            `${dir}${sep}index.html`,
            blueprintHtml(
              name,
              description,
              panels.length,
              connections.length,
              created.slice(0, 10),
            ),
          );
          return {
            success: true,
            slug,
            path: `vault/blueprints/${slug}`,
            panelCount: panels.length,
            connectionCount: connections.length,
          };
        } catch (e) {
          return { error: String(e), slug };
        }
      },
    }),
  } as const;
}
