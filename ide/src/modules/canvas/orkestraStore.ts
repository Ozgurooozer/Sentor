import { create } from "zustand";
import { useCanvasStore } from "./canvasStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useVariableStore } from "./variableStore";
import { PORT_DEFS } from "./portDefs";
import type { PanelType } from "./types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant";
export type ToolStatus = "running" | "done" | "error";

export interface ToolCallRecord {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  result?: string;
  status: ToolStatus;
}

export interface OrkMsg {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCallRecord[];
  ts: number;
}

interface OrkState {
  messages: OrkMsg[];
  loading: boolean;
  collapsed: boolean;
  v3InputActive: boolean;
  addMessage(msg: Omit<OrkMsg, "id" | "ts">): string;
  updateMessage(id: string, patch: Partial<OrkMsg>): void;
  clearMessages(): void;
  setLoading(v: boolean): void;
  setCollapsed(v: boolean): void;
  setV3InputActive(v: boolean): void;
  send(text: string, modelProvider: string, ollamaBase: string, lmBase: string, ollamaModel: string, lmModel: string, opencodeKey?: string, opencodeBase?: string, opencodeModel?: string): Promise<void>;
}

let nextId = 0;
const uid = () => String(++nextId);

// ── Dev proxy ─────────────────────────────────────────────────────────────────

function devProxy(url: string): string {
  if (!import.meta.env.DEV) return url;
  const o = window.location.origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1):1234/.test(url))
    return url.replace(/^https?:\/\/(localhost|127\.0\.0\.1):1234/, `${o}/lmstudio-proxy`);
  if (/^https?:\/\/(localhost|127\.0\.0\.1):11434/.test(url))
    return url.replace(/^https?:\/\/(localhost|127\.0\.0\.1):11434/, `${o}/ollama-proxy`);
  if (/^https?:\/\/opencode\.ai/.test(url))
    return url.replace(/^https?:\/\/opencode\.ai/, `${o}/opencode-proxy`);
  return url;
}

// ── Node alias system ─────────────────────────────────────────────────────────
// Models struggle with UUIDs. We assign short aliases: n1, n2, n3…
// The alias map is rebuilt every time we call buildSystem().

let _aliasToId: Record<string, string> = {};

function resolveId(alias: string): string {
  // Accept "n3", "#3", "3" — all resolve via alias map
  const key = String(alias).replace(/^#/, "").toLowerCase();
  if (_aliasToId[key]) return _aliasToId[key];
  // Fallback: maybe it's already a real UUID
  const panels = useCanvasStore.getState().panels;
  if (panels.find((p) => p.id === alias)) return alias;
  return ""; // not found — callers check for empty string
}

// ── Tool call extraction ──────────────────────────────────────────────────────

interface ToolCall { tool: string; [k: string]: unknown; }

/** Brace-balanced JSON scanner — handles multi-line tool calls correctly. */
function extractCalls(text: string): ToolCall[] {
  const out: ToolCall[] = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf("{", i);
    if (start === -1) break;
    let depth = 0, j = start;
    while (j < text.length) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}") { depth--; if (depth === 0) break; }
      j++;
    }
    const chunk = text.slice(start, j + 1);
    try {
      const obj = JSON.parse(chunk) as ToolCall;
      if (typeof obj.tool === "string") out.push(obj);
    } catch { /* skip */ }
    i = j + 1;
  }
  return out;
}

// ── Tool execution ────────────────────────────────────────────────────────────

function execTool(call: ToolCall): string {
  const s = useCanvasStore.getState();
  const rid = (v: unknown) => resolveId(String(v ?? ""));

  switch (call.tool) {

    case "add": {
      // Single-purpose add: {"tool":"add","type":"terminal","title":"Term 1","x":100,"y":200}
      const type = (call.type as PanelType) ?? "note";
      const at   = call.x != null ? { x: Number(call.x), y: Number(call.y ?? 200) } : undefined;
      const initMeta = type === "terminal"
        ? { cwd: usePreferencesStore.getState().workspaceRoot ?? "C:\\Sentor" }
        : undefined;
      const id = s.addPanel(type, at, initMeta);
      if (call.title) s.updatePanel(id, { title: String(call.title) });
      const defs = PORT_DEFS[type];
      const ins  = defs?.inputs.map((p) => p.id).join(", ")  || "—";
      const outs = defs?.outputs.map((p) => p.id).join(", ") || "—";
      // Incrementally add to alias map so subsequent tool calls in this response can reference the new node.
      const nextAlias = `n${Object.keys(_aliasToId).length + 1}`;
      _aliasToId[nextAlias] = id;
      const newAlias = nextAlias;
      return `added "${call.title ?? type}" as ${newAlias} → id:${id} | in:[${ins}] out:[${outs}]`;
    }

    case "connect": {
      // {"tool":"connect","from":"n1","out":"value","to":"n2","in":"cmd"}
      const fromId = rid(call.from) || String(call.from ?? "");
      const toId   = rid(call.to)   || String(call.to   ?? "");
      const fromP  = call.out ? String(call.out) : call.fromPort ? String(call.fromPort) : undefined;
      const toP    = call.in  ? String(call.in)  : call.toPort   ? String(call.toPort)   : undefined;
      const kind   = (call.kind as "data" | "context" | "trigger") ?? "data";
      const fp = s.panels.find((p) => p.id === fromId);
      const tp = s.panels.find((p) => p.id === toId);
      if (!fp) return `error: source not found (${call.from})`;
      if (!tp) return `error: target not found (${call.to})`;
      s.addConnection(fromId, "right", toId, "left", fromP, toP, kind);
      return `connected "${fp.title}"[${fromP ?? "out"}] →(${kind})→ "${tp.title}"[${toP ?? "in"}]`;
    }

    case "wire": {
      // Shorthand: {"tool":"wire","from":"n1","to":"n2"}
      // Auto-picks first output → first input, smart kind detection
      const fromId = rid(call.from);
      const toId   = rid(call.to);
      const fp = s.panels.find((p) => p.id === fromId);
      const tp = s.panels.find((p) => p.id === toId);
      if (!fp) return `error: source not found (${call.from})`;
      if (!tp) return `error: target not found (${call.to})`;
      const fDefs = PORT_DEFS[fp.type];
      const tDefs = PORT_DEFS[tp.type];
      const fromP = fDefs?.outputs[0]?.id;
      const toP   = tDefs?.inputs[0]?.id;
      const kind  = fDefs?.outputs[0]?.kind ?? "data";
      s.addConnection(fromId, "right", toId, "left", fromP, toP, kind);
      return `wired "${fp.title}"[${fromP ?? "out"}] → "${tp.title}"[${toP ?? "in"}]`;
    }

    case "build": {
      // One-shot pipeline builder:
      // {"tool":"build","nodes":[{"type":"input","title":"Komut"},{"type":"terminal","title":"Shell"}],"wires":[[0,1]]}
      const nodes = (call.nodes as { type: PanelType; title?: string; x?: number; y?: number }[]) ?? [];
      const wires = (call.wires as [number, number, string?, string?][]) ?? [];
      const ids: string[] = [];
      const step = 280;
      const baseX = 120, baseY = 260;
      const termRoot = usePreferencesStore.getState().workspaceRoot ?? "C:\\Sentor";
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const initMeta = n.type === "terminal" ? { cwd: termRoot } : undefined;
        const id = s.addPanel(n.type, { x: n.x ?? baseX + i * step, y: n.y ?? baseY }, initMeta);
        if (n.title) s.updatePanel(id, { title: n.title });
        ids.push(id);
      }
      for (const [fi, ti, fromP, toP] of wires) {
        if (ids[fi] && ids[ti]) {
          const fp = s.panels.find((p) => p.id === ids[fi]);
          const tp = s.panels.find((p) => p.id === ids[ti]);
          const fDefs = fp ? PORT_DEFS[fp.type] : undefined;
          const tDefs = tp ? PORT_DEFS[tp.type] : undefined;
          const autoFrom = fromP ?? fDefs?.outputs[0]?.id;
          const autoTo   = toP   ?? tDefs?.inputs[0]?.id;
          const kind     = fDefs?.outputs[0]?.kind ?? "data";
          s.addConnection(ids[fi], "right", ids[ti], "left", autoFrom, autoTo, kind);
        }
      }
      const names = ids.map((id, i) => `${nodes[i]?.title ?? nodes[i]?.type}(${id.slice(0, 6)})`).join(" → ");
      return `built pipeline: ${names}`;
    }

    case "run": {
      // {"tool":"run","id":"n1","cmd":"echo hello"} — run command in terminal
      // id is optional — falls back to the first terminal on the canvas
      const resolved = call.id != null ? rid(call.id) : "";
      const termId = resolved || s.panels.find((p) => p.type === "terminal" && !p.pinned)?.id || "";
      const panel  = s.panels.find((p) => p.id === termId);
      if (!panel) return "error: no terminal node found — add one first";
      const text = String(call.cmd ?? call.text ?? "");
      if (!text) return "error: cmd is empty";
      useCanvasStore.getState().triggerTerminal(termId, text);
      return `→ "${panel.title}": ${text.slice(0, 80)}`;
    }

    case "set": {
      // {"tool":"set","id":"n1","value":"hello world"} — set input node value
      const id = rid(call.id ?? "") || String(call.id ?? "");
      const panel = s.panels.find((p) => p.id === id)
        ?? s.panels.find((p) => p.type === "input" && !p.pinned); // fallback: first input
      if (!panel) return `error: no input node found`;
      if (panel.type !== "input") return `error: "${panel.title}" is not an input node`;
      const val = call.value ?? call.text ?? "";
      s.updatePanel(id, { meta: { ...panel.meta, value: val } });
      s.setOutputData(id, { kind: "text", value: val });
      return `set "${panel.title}" = ${String(val).slice(0, 60)}`;
    }

    case "remove": {
      const id = rid(call.id ?? "");
      const panel = s.panels.find((p) => p.id === id);
      if (!panel) return `error: node not found (${call.id})`;
      s.removePanel(id);
      return `removed "${panel.title}"`;
    }

    case "clear": {
      const count = s.panels.filter((p) => !p.pinned).length;
      s.panels.filter((p) => !p.pinned).forEach((p) => s.removePanel(p.id));
      return `cleared canvas (${count} nodes removed)`;
    }

    case "rename": {
      const id = rid(call.id ?? "");
      const panel = s.panels.find((p) => p.id === id);
      if (!panel) return `error: node not found (${call.id})`;
      s.updatePanel(id, { title: String(call.title ?? call.name ?? "") });
      return `renamed "${panel.title}" → "${call.title ?? call.name}"`;
    }

    case "list": {
      const nodes = s.panels.filter((p) => !p.pinned).map((p, i) => {
        const defs = PORT_DEFS[p.type];
        const ins  = defs?.inputs.map((pt) => pt.id).join(",")  || "—";
        const outs = defs?.outputs.map((pt) => pt.id).join(",") || "—";
        return `n${i + 1}: "${p.title}" (${p.type}) id:${p.id} in:[${ins}] out:[${outs}]`;
      });
      const wires = s.connections.map((c) =>
        `  ${c.fromPanel.slice(0, 8)}[${c.fromPort ?? "out"}] →(${c.kind ?? "data"})→ ${c.toPanel.slice(0, 8)}[${c.toPort ?? "in"}] id:${c.id}`
      );
      return `NODES:\n${nodes.join("\n") || "(none)"}\nWIRES:\n${wires.join("\n") || "(none)"}`;
    }

    case "var_set": {
      // {"tool":"var_set","name":"myVar","value":"hello"}
      const name  = String((call as Record<string, unknown>).name ?? "").trim();
      const value = (call as Record<string, unknown>).value ?? "";
      if (!name) return "error: name is required";
      useVariableStore.getState().setVariable(name, String(value), "any");
      // Sync any variable panel with matching varName
      const varPanel = s.panels.find((p) => p.type === "variable" && p.meta?.varName === name);
      if (varPanel) s.setOutputData(varPanel.id, { kind: "text", value: String(value) });
      return `set $${name} = ${String(value).slice(0, 60)}`;
    }

    case "var_get": {
      // {"tool":"var_get","name":"myVar"}
      const name = String((call as Record<string, unknown>).name ?? "").trim();
      if (!name) return "error: name is required";
      const rec = useVariableStore.getState().getVariable(name);
      if (!rec) return `$${name} = (undefined)`;
      return `$${name} = ${String(rec.value).slice(0, 120)}`;
    }

    case "var_list": {
      // {"tool":"var_list"}
      const vars = useVariableStore.getState().listVariables();
      if (vars.length === 0) return "no variables set";
      return vars.map((v) => `$${v.name} = ${String(v.value).slice(0, 60)}`).join("\n");
    }

    // Legacy aliases
    case "add_node":      return execTool({ ...call, tool: "add" });
    case "write_terminal":return execTool({ ...call, tool: "run", cmd: call.text });
    case "set_input_value":return execTool({ ...call, tool: "set" });
    case "clear_canvas":  return execTool({ ...call, tool: "clear" });
    case "remove_node":   return execTool({ ...call, tool: "remove" });
    case "list_nodes":    return execTool({ ...call, tool: "list" });
    case "run_canvas":    window.dispatchEvent(new CustomEvent("canvas:run")); return "canvas run triggered";
    case "update_panel":  return execTool({ ...call, tool: "rename" });

    default:
      console.error(`[CANVAS:TOOL] Unknown tool: "${call.tool}"`, call);
      return `unknown tool: ${call.tool}`;
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystem(): string {
  const { panels, connections } = useCanvasStore.getState();
  const workspaceRoot = usePreferencesStore.getState().workspaceRoot ?? "C:\\Sentor";

  // Build alias map: n1, n2, n3… → real UUIDs
  _aliasToId = {};
  const visible = panels.filter((p) => !p.pinned);
  visible.forEach((p, i) => { _aliasToId[`n${i + 1}`] = p.id; });

  // Compact node list: n1:terminal("T") — no port details, cap at 30
  const nodeList = visible.slice(0, 30).map((p, i) =>
    `n${i + 1}:${p.type}("${p.title}")`
  ).join(" ") || "(empty)";
  const nodeOverflow = visible.length > 30 ? ` +${visible.length - 30} more` : "";

  // Compact wire list: n1→n2 n2→n3
  const wireList = connections.slice(0, 20).map((c) => {
    const fi = visible.findIndex((p) => p.id === c.fromPanel);
    const ti = visible.findIndex((p) => p.id === c.toPanel);
    const fa = fi >= 0 ? `n${fi + 1}` : "?";
    const ta = ti >= 0 ? `n${ti + 1}` : "?";
    return `${fa}→${ta}`;
  }).join(" ") || "none";

  const vars = useVariableStore.getState().listVariables();
  const varSection = vars.length > 0
    ? ` VARS:${vars.map((v) => `$${v.name}=${String(v.value).slice(0, 20)}`).join(",")}`
    : "";

  return `Canvas AI. Reply in user's language. Be concise. WS:${workspaceRoot}
NODES: ${nodeList}${nodeOverflow}
WIRES: ${wireList}${varSection}
TOOLS(JSON in reply): add(type,title,x?,y?) wire(from,to) connect(from,out,to,in,kind?) run(id,cmd) set(id,val) rename(id,title) remove(id) clear build(nodes[{type,title}],wires[[0,1]])
TYPES:terminal|input|chat|note|editor|agent|web|pipe|sketch|variable|gate|if-else|for-each
ALIASES:n1,n2… Emit all tools at once. Prefer build for pipelines.`;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useOrkestraStore = create<OrkState>((set, get) => ({
  messages: [],
  loading: false,
  collapsed: false,
  v3InputActive: false,

  addMessage(msg) {
    const id = uid();
    set((s) => ({ messages: [...s.messages.slice(-99), { ...msg, id, ts: Date.now() }] }));
    return id;
  },

  updateMessage(id, patch) {
    set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  },

  clearMessages() { set({ messages: [] }); },
  setLoading(v)   { set({ loading: v }); },
  setCollapsed(v) { set({ collapsed: v }); },
  setV3InputActive(v) { set({ v3InputActive: v }); },

  async send(text, modelProvider, ollamaBase, lmBase, ollamaModel, lmModel, opencodeKey = "", opencodeBase = "https://opencode.ai/zen/v1", opencodeModel = "deepseek-v4-flash-free") {
    const { addMessage, updateMessage, setLoading } = get();
    addMessage({ role: "user", content: text });
    setLoading(true);

    const asstId = addMessage({ role: "assistant", content: "", toolCalls: [] });

    try {
      const systemPrompt = buildSystem(); // rebuilds alias map with current canvas state
      // Keep last 6 messages (3 turns) to stay within small model context windows
      const history = get().messages
        .filter((m) => m.id !== asstId)
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      let fullText = "";

      if (modelProvider === "opencode") {
        const base = opencodeBase.replace(/\/v1\/?$/, "");
        const url = devProxy(`${base}/v1/chat/completions`);
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${opencodeKey}`,
          },
          body: JSON.stringify({
            model: opencodeModel || "deepseek-v4-flash-free",
            messages: [{ role: "system", content: systemPrompt }, ...history],
            stream: false,
          }),
        });
        if (!res.ok) console.error(`[CANVAS:AI] OpenCode HTTP ${res.status} for model "${opencodeModel}"`);
        const data = await res.json() as { choices?: { message?: { content?: string } }[] };
        fullText = data.choices?.[0]?.message?.content ?? "";
        updateMessage(asstId, { content: fullText });
      } else if (modelProvider === "ollama") {
        const url = devProxy(`${ollamaBase}/api/chat`);
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: ollamaModel,
            messages: [{ role: "system", content: systemPrompt }, ...history],
            stream: true,
            options: { num_ctx: 8192 },
          }),
        });
        if (!res.ok) console.error(`[CANVAS:AI] Ollama HTTP ${res.status} for model "${ollamaModel}"`);
        const reader = res.body?.getReader();
        const dec = new TextDecoder();
        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of dec.decode(value).split("\n").filter(Boolean)) {
            try {
              const chunk = JSON.parse(line) as { message?: { content?: string } };
              fullText += chunk.message?.content ?? "";
              updateMessage(asstId, { content: fullText });
            } catch { /* skip */ }
          }
        }
      } else {
        const base = lmBase.replace(/\/v1\/?$/, "");
        const url  = devProxy(`${base}/v1/chat/completions`);
        const res  = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: lmModel,
            messages: [{ role: "system", content: systemPrompt }, ...history],
          }),
        });
        if (!res.ok) console.error(`[CANVAS:AI] LM Studio HTTP ${res.status} for model "${lmModel}"`);
        const data = await res.json() as { choices?: { message?: { content?: string } }[] };
        fullText = data.choices?.[0]?.message?.content ?? "";
        updateMessage(asstId, { content: fullText });
      }

      // Execute all tool calls sequentially, updating UI after each
      const rawCalls = extractCalls(fullText);
      if (rawCalls.length > 0) {
        const toolCalls: ToolCallRecord[] = rawCalls.map((c) => ({
          id: uid(), tool: c.tool, input: c, status: "running" as ToolStatus,
        }));
        updateMessage(asstId, { toolCalls });

        const executed: ToolCallRecord[] = [];
        for (let i = 0; i < rawCalls.length; i++) {
          const tc = toolCalls[i];
          try {
            const result = execTool(rawCalls[i]);
            if (result.startsWith("error:") || result.startsWith("unknown tool")) {
              console.error(`[CANVAS:TOOL] ${tc.tool} → ${result}`, rawCalls[i]);
            }
            executed.push({ ...tc, result, status: result.startsWith("error:") ? "error" as ToolStatus : "done" as ToolStatus });
          } catch (e) {
            console.error(`[CANVAS:TOOL] ${tc.tool} threw:`, e, rawCalls[i]);
            executed.push({ ...tc, result: String(e), status: "error" as ToolStatus });
          }
          updateMessage(asstId, { toolCalls: [...executed, ...toolCalls.slice(i + 1)] });
        }
        updateMessage(asstId, { toolCalls: executed });
      }

    } catch (err) {
      console.error("[CANVAS:AI] send failed:", err);
      updateMessage(asstId, { content: `⚠ ${String(err)}` });
    } finally {
      setLoading(false);
    }
  },
}));
