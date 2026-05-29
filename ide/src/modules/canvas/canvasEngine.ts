/**
 * Canvas Run Engine — topological execution of a node/wire graph.
 *
 * Traversal: Kahn's BFS topo-sort over data/context wires (triggers ignored
 * for ordering). Panels execute sequentially in dependency order.
 *
 * Gate panels can BLOCK their downstream: when a gate is closed all panels
 * reachable only through that gate are skipped.
 *
 * Each panel's result is written back to canvasStore via setOutputData so
 * downstream panels (and the wire layer) see the updated values.
 */

import type { CanvasPanelNode, Connection, PanelType, WireData } from "./types";
import { useCanvasStore } from "./canvasStore";
import { useVariableStore } from "./variableStore";

// ── Public types ──────────────────────────────────────────────────────────────

export interface RunOptions {
  modelProvider: string;
  ollamaBase: string;
  lmBase: string;
  ollamaModel: string;
  lmModel: string;
  opencodeKey?: string;
  opencodeBase?: string;
  opencodeModel?: string;
}

export type RunEvent =
  | { type: "start";         total: number }
  | { type: "panel-start";   panelId: string; title: string }
  | { type: "panel-done";    panelId: string; output: WireData | null }
  | { type: "panel-blocked"; panelId: string; title: string }
  | { type: "panel-error";   panelId: string; title: string; error: string }
  | { type: "done" };

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Kahn's topo-sort; cycles get appended at end (best-effort). */
function topoSort(panels: CanvasPanelNode[], connections: Connection[]): string[] {
  const dataCons = connections.filter((c) => c.kind !== "trigger");
  const inDeg = new Map<string, number>();
  const adj   = new Map<string, string[]>();

  for (const p of panels) { inDeg.set(p.id, 0); adj.set(p.id, []); }

  for (const c of dataCons) {
    if (!inDeg.has(c.fromPanel) || !inDeg.has(c.toPanel)) continue;
    inDeg.set(c.toPanel, (inDeg.get(c.toPanel) ?? 0) + 1);
    adj.get(c.fromPanel)!.push(c.toPanel);
  }

  const queue = panels.filter((p) => (inDeg.get(p.id) ?? 0) === 0).map((p) => p.id);
  const out: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    out.push(id);
    for (const nxt of adj.get(id) ?? []) {
      const d = (inDeg.get(nxt) ?? 0) - 1;
      inDeg.set(nxt, d);
      if (d === 0) queue.push(nxt);
    }
  }

  // Append any remaining (cycle participants)
  for (const p of panels) if (!out.includes(p.id)) out.push(p.id);
  return out;
}

/** Get the first non-null incoming wire value for a panel/port pair. */
function getWireData(
  panelId: string,
  portId: string | undefined,
  connections: Connection[],
  outputs: Map<string, WireData>,
): WireData | null {
  const incoming = connections.filter(
    (c) =>
      c.toPanel === panelId &&
      c.kind !== "trigger" &&
      (portId === undefined || c.toPort === portId || c.toPort === undefined),
  );
  for (const c of incoming) {
    const v = outputs.get(c.fromPanel);
    if (v) return v;
  }
  return null;
}

// ── Gate evaluation ───────────────────────────────────────────────────────────

function evalGate(signal: WireData | null, criteria: string, mode: string): boolean {
  if (!signal) return false;
  const val = String(signal.value ?? "");

  if (!criteria && mode !== "not-empty") {
    // No criteria + default mode → pass if non-empty
    return val.trim().length > 0;
  }

  switch (mode) {
    case "not-empty":
      return val.trim().length > 0;
    case "contains":
      return val.toLowerCase().includes(criteria.toLowerCase());
    case "regex":
      try { return new RegExp(criteria, "i").test(val); }
      catch { return false; }
    case "truthy":
    default:
      return !["", "false", "0", "null", "undefined", "no"].includes(
        val.trim().toLowerCase(),
      );
  }
}

// ── Dev proxy (matches orkestraStore) ────────────────────────────────────────

function devProxy(url: string): string {
  if (!import.meta.env.DEV) return url;
  const o = window.location.origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1):1234/.test(url))
    return url.replace(/^https?:\/\/(localhost|127\.0\.0\.1):1234/, `${o}/lmstudio-proxy`);
  if (/^https?:\/\/(localhost|127\.0\.0\.1):11434/.test(url))
    return url.replace(/^https?:\/\/(localhost|127\.0\.0\.1):11434/, `${o}/ollama-proxy`);
  return url;
}

async function callModel(prompt: string, opts: RunOptions): Promise<string> {
  if (opts.modelProvider === "opencode") {
    if (!opts.opencodeKey) {
      return "Error: OpenCode API key not configured. Set it in Settings → Models.";
    }
    const base = (opts.opencodeBase ?? "https://opencode.ai/zen/v1").replace(/\/v1\/?$/, "");
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.opencodeKey ?? ""}`,
      },
      body: JSON.stringify({
        model: opts.opencodeModel || "deepseek/deepseek-v4-flash-free",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? "";
  } else if (opts.modelProvider === "ollama") {
    const url = devProxy(`${opts.ollamaBase}/api/chat`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.ollamaModel,
        messages: [{ role: "user", content: prompt }],
        stream: false,
      }),
    });
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content ?? "";
  } else {
    const base = opts.lmBase.replace(/\/v1\/?$/, "");
    const url  = devProxy(`${base}/v1/chat/completions`);
    const res  = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.lmModel,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? "";
  }
}

// ── Per-panel execution ───────────────────────────────────────────────────────

async function execPanel(
  panel: CanvasPanelNode,
  connections: Connection[],
  outputs: Map<string, WireData>,
  opts: RunOptions,
): Promise<{ output: WireData | null; blocked: boolean }> {
  const wire = (port?: string) => getWireData(panel.id, port, connections, outputs);

  switch (panel.type as PanelType) {

    case "input": {
      const val = String(panel.meta?.value ?? "");
      return { output: { kind: "text", value: val }, blocked: false };
    }

    case "note": {
      const val = String(panel.meta?.text ?? "");
      return { output: { kind: "text", value: val }, blocked: false };
    }

    case "variable": {
      const name = String(panel.meta?.varName ?? "");
      const incoming = wire("set");
      if (incoming && name) {
        useVariableStore.getState().setVariable(name, String(incoming.value), "any");
        return { output: incoming, blocked: false };
      }
      const rec = name ? useVariableStore.getState().getVariable(name) : null;
      const val = rec ? String(rec.value) : String(panel.meta?.initialValue ?? "");
      return { output: { kind: "text", value: val }, blocked: false };
    }

    case "if-else": {
      const cond    = wire("condition");
      const trueV   = wire("true_val");
      const falseV  = wire("false_val");
      const condStr = cond ? String(cond.value) : String(panel.meta?.condition ?? "");
      const isTrue  = !["", "false", "0", "null", "undefined"].includes(condStr.trim().toLowerCase());
      return { output: (isTrue ? trueV : falseV) ?? { kind: "text", value: "" }, blocked: false };
    }

    case "for-each": {
      const items = wire("items");
      const raw   = items ? String(items.value) : "";
      let arr: string[];
      try {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) arr = p.map(String);
        else arr = raw.split("\n").filter(Boolean);
      } catch {
        arr = raw.split("\n").filter(Boolean);
      }
      return { output: { kind: "json", value: JSON.stringify(arr) }, blocked: false };
    }

    case "gate": {
      const signal   = wire("signal") ?? wire(undefined);
      const condWire = wire("condition");
      const criteria = String(condWire?.value ?? panel.meta?.criteria ?? "");
      const mode     = String(panel.meta?.mode ?? "truthy");
      const passes   = evalGate(signal, criteria, mode);

      // Update gate status so UI shows open/closed indicator
      useCanvasStore.getState().updatePanel(panel.id, {
        meta: { ...panel.meta, gateStatus: passes ? "open" : "closed" },
      });

      return {
        output: passes ? signal : null,
        blocked: !passes,
      };
    }

    case "pipe": {
      const inWire = wire("in") ?? wire(undefined);
      const prompt = String(panel.meta?.prompt ?? "");
      if (!prompt && !inWire) return { output: null, blocked: false };
      const userContent = [prompt, inWire ? String(inWire.value) : ""].filter(Boolean).join("\n\n");
      try {
        const text = await callModel(userContent, opts);
        return { output: { kind: "text", value: text }, blocked: false };
      } catch (e) {
        return { output: { kind: "text", value: `Error: ${String(e)}` }, blocked: false };
      }
    }

    case "terminal": {
      const cmdWire = wire("cmd") ?? wire(undefined);
      const cmd     = String(cmdWire?.value ?? panel.meta?.defaultCmd ?? "");
      if (cmd) useCanvasStore.getState().triggerTerminal(panel.id, cmd);
      // Terminal output is async; we return the command as-sent for wire continuity
      return { output: { kind: "text", value: cmd }, blocked: false };
    }

    default: {
      // Pass through existing outputData (e.g. editor, checklist, note with pre-set value)
      const existing = panel.meta?.outputData as WireData | undefined;
      return { output: existing ?? null, blocked: false };
    }
  }
}

// ── Main run function ─────────────────────────────────────────────────────────

export async function runCanvas(
  panels: CanvasPanelNode[],
  connections: Connection[],
  opts: RunOptions,
  onEvent?: (e: RunEvent) => void,
): Promise<void> {
  const emit  = onEvent ?? (() => undefined);
  const store = useCanvasStore.getState;

  // Ignore pinned/minimized panels in execution
  const active = panels.filter((p) => !p.pinned && !p.minimized);
  const sorted = topoSort(active, connections);

  emit({ type: "start", total: sorted.length });

  const outputs  = new Map<string, WireData>();  // panelId → computed output
  const blocked  = new Set<string>();            // panelIds cut off by a gate

  // Pre-build downstream adjacency for gate blocking propagation
  const dataCons = connections.filter((c) => c.kind !== "trigger");
  function propagateBlock(fromId: string) {
    for (const c of dataCons) {
      if (c.fromPanel === fromId && !blocked.has(c.toPanel)) {
        blocked.add(c.toPanel);
        propagateBlock(c.toPanel);
      }
    }
  }

  for (const panelId of sorted) {
    const panel = active.find((p) => p.id === panelId);
    if (!panel) continue;

    // Skip if blocked by an upstream gate
    if (blocked.has(panelId)) {
      store().updatePanel(panelId, { status: "idle" });
      emit({ type: "panel-blocked", panelId, title: panel.title });
      continue;
    }

    store().updatePanel(panelId, { status: "running" });
    emit({ type: "panel-start", panelId, title: panel.title });

    try {
      const { output, blocked: panelBlocked } = await execPanel(panel, connections, outputs, opts);

      if (output) {
        outputs.set(panelId, output);
        store().setOutputData(panelId, output);
      }

      if (panelBlocked) {
        blocked.add(panelId);
        propagateBlock(panelId);
        store().updatePanel(panelId, { status: "error" }); // red = gate closed
      } else {
        store().updatePanel(panelId, { status: "done" });
      }

      emit({ type: "panel-done", panelId, output });
    } catch (err) {
      store().updatePanel(panelId, { status: "error" });
      emit({ type: "panel-error", panelId, title: panel.title, error: String(err) });
      console.error(`[CANVAS:ENGINE] ${panel.title} (${panel.type}) threw:`, err);
    }
  }

  emit({ type: "done" });

  // Reset all status indicators after 3s
  setTimeout(() => {
    for (const panelId of sorted) {
      store().updatePanel(panelId, { status: "idle" });
    }
    // Also clear gate status
    for (const p of active.filter((x) => x.type === "gate")) {
      store().updatePanel(p.id, { meta: { ...p.meta, gateStatus: "idle" } });
    }
  }, 3000);
}
