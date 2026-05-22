import { CheckListIcon, SparklesIcon } from "@hugeicons/core-free-icons";
import { usePlanStore } from "../store/planStore";

/**
 * Outcome of intercepting a slash command from the composer.
 *
 * - `"handled"`: command ran; the composer should NOT send a chat message.
 * - `"send-prompt"`: replace the user's text with `prompt` and send normally.
 * - `"none"`: not a slash command; let the composer behave as usual.
 */
export type SlashOutcome =
  | { kind: "handled"; toast?: string }
  | { kind: "send-prompt"; prompt: string; commandName?: string }
  | { kind: "none" };

const INIT_PROMPT = `Scan this workspace and produce ATLAS.md at the workspace root with:

- One-paragraph project description.
- Build / test / dev commands.
- Architecture overview (subsystems, data flow, key dirs).
- Conventions worth knowing (naming, patterns, gotchas).
- Paths to entry points.

Use grep/glob/list_directory/read_file to explore. Cap ATLAS.md under 200 lines. Use write_file to create it (will go through normal approval).`;

export type SlashCommandMeta = {
  name: string;
  invocation: string;
  label: string;
  icon: typeof SparklesIcon;
};

export const SLASH_COMMANDS: Record<string, SlashCommandMeta> = {
  init: {
    name: "init",
    invocation: "/init",
    label: "Initialize workspace",
    icon: SparklesIcon,
  },
  plan: {
    name: "plan",
    invocation: "/plan",
    label: "Plan mode",
    icon: CheckListIcon,
  },
  decision: {
    name: "decision",
    invocation: "/decision",
    label: "Log a decision",
    icon: CheckListIcon,
  },
  meeting: {
    name: "meeting",
    invocation: "/meeting",
    label: "Log meeting notes",
    icon: SparklesIcon,
  },
  search: {
    name: "search",
    invocation: "/search",
    label: "Search vault",
    icon: SparklesIcon,
  },
  voice: {
    name: "voice",
    invocation: "/voice",
    label: "Voice note to vault",
    icon: SparklesIcon,
  },
};

export const ATLAS_CMD_RE =
  /^<atlas-command\s+name="([a-z0-9-]+)"(?:\s+state="([a-z]+)")?\s*\/>(?:\n+|$)/;

export function wrapWithCommandMarker(prompt: string, name: string): string {
  return `<atlas-command name="${name}" />\n\n${prompt}`;
}

export async function tryRunSlashCommand(input: string): Promise<SlashOutcome> {
  const trimmed = input.trim();
  const lead = trimmed[0];
  if (lead !== "/" && lead !== "#") return { kind: "none" };
  const [head, ...rest] = trimmed.slice(1).split(/\s+/);
  if (lead === "#" && !SLASH_COMMANDS[head]) return { kind: "none" };
  const tail = rest.join(" ").trim();

  switch (head) {
    case "plan": {
      const store = usePlanStore.getState();
      if (tail === "off" || tail === "exit") {
        store.disable();
        return { kind: "handled", toast: "Plan mode off" };
      }
      store.toggle();
      const nowActive = usePlanStore.getState().active;
      return {
        kind: "handled",
        toast: nowActive ? "Plan mode on" : "Plan mode off",
      };
    }
    case "init": {
      return {
        kind: "send-prompt",
        prompt: INIT_PROMPT,
        commandName: "init",
      };
    }
    case "decision": {
      if (!tail) return { kind: "none" };
      const { useAgentsStore } = await import("@/modules/ai/store/agentsStore");
      const { invoke } = await import("@tauri-apps/api/core");
      const activeId = useAgentsStore.getState().activeId;
      const slug = activeId.startsWith("builtin:")
        ? activeId.slice("builtin:".length)
        : activeId;
      try {
        await invoke("vault_agent_log", { slug, event: "decision", msg: tail });
        return { kind: "handled", toast: `Decision logged to ${slug} office` };
      } catch {
        // Agent office not set up — fall back to AI prompt
        return {
          kind: "send-prompt",
          prompt: `Log this decision to my vault agent office by calling vault_agent_log(event="decision", msg="${tail.replace(/"/g, '\\"')}"). Confirm when done with a single line.`,
          commandName: "decision",
        };
      }
    }
    case "meeting": {
      const topic = tail || "Untitled meeting";
      const today = new Date().toISOString().split("T")[0];
      return {
        kind: "send-prompt",
        prompt: `MEETING — ${topic} (${today})

1. Call vault_agent_log(event="meeting", msg="Meeting: ${topic}") to record this session.
2. Create a vault page at meetings/{slug} capturing: date, attendees (ask if unknown), agenda items, key decisions, and action items.
3. Reply with "Meeting saved to vault/meetings/{slug}."`,
        commandName: "meeting",
      };
    }
    case "search": {
      if (!tail) return { kind: "none" };
      return {
        kind: "send-prompt",
        prompt: `vault_search("${tail.replace(/"/g, '\\"')}") — call vault_search with this query, then list the top results as a concise markdown table: | Title | Category | Score | Snippet |. No preamble, no commentary. Just the table.`,
        commandName: "search",
      };
    }
    case "voice": {
      if (!tail) return { kind: "none" };
      const { useAgentsStore } = await import("@/modules/ai/store/agentsStore");
      useAgentsStore.getState().setActiveId("builtin:atlas-maker");
      return {
        kind: "send-prompt",
        prompt: `Create a vault page from this voice note:

"${tail.replace(/"/g, '\\"')}"

1. Call vault_search to check if a related page already exists.
2. Infer a suitable title and category from the content.
3. Write a complete vault HTML page with vault_write.
4. Reply with "Saved to vault/{category}/{slug}".`,
        commandName: "voice",
      };
    }
    default:
      return { kind: "none" };
  }
}
