/**
 * GatePanel — AI-controllable wire gate.
 *
 * Inputs:  signal (any data), condition (optional text override)
 * Outputs: pass (signal forwarded when gate is open)
 *          rejected (signal forwarded when gate is closed)
 *
 * Evaluation modes:
 *   truthy   — passes if signal is non-empty / not falsy
 *   not-empty — passes if signal has content
 *   contains  — passes if signal contains the criteria string
 *   regex     — passes if signal matches the criteria regex
 *
 * During canvas:run the engine evaluates the gate and sets
 * meta.gateStatus ("idle"|"open"|"closed") which this UI reflects.
 */
import { useEffect } from "react";
import { useCanvasStore } from "./canvasStore";
import { useAllIncomingWireData } from "./useWireData";

type GateMode = "truthy" | "not-empty" | "contains" | "regex";
const MODES: { id: GateMode; label: string }[] = [
  { id: "truthy",    label: "Truthy"   },
  { id: "not-empty", label: "Boş değil" },
  { id: "contains",  label: "İçerir"   },
  { id: "regex",     label: "Regex"    },
];

function evalGate(signal: unknown, mode: GateMode, criteria: string): boolean {
  if (signal == null || signal === "") return false;
  const s = String(signal);
  if (mode === "truthy")    return !!s && s !== "0" && s !== "false" && s !== "null";
  if (mode === "not-empty") return s.trim().length > 0;
  if (mode === "contains")  return s.includes(criteria);
  if (mode === "regex")     { try { return new RegExp(criteria).test(s); } catch { return false; } }
  return false;
}

export function GatePanel({ panelId }: { panelId: string }) {
  const panel          = useCanvasStore((s) => s.panels.find((p) => p.id === panelId));
  const updatePanel    = useCanvasStore((s) => s.updatePanel);
  const setPortOutput  = useCanvasStore((s) => s.setPortOutputData);
  const wireBlocks     = useAllIncomingWireData(panelId);

  const criteria   = String(panel?.meta?.criteria   ?? "");
  const mode       = (panel?.meta?.mode as GateMode) ?? "truthy";
  const gateStatus = (panel?.meta?.gateStatus as string) ?? "idle";

  const conditionWire = wireBlocks.find((b) => b.toPort === "condition");
  const signalWire = wireBlocks.find(
    (b) => b.toPort === "signal" || b.connectionKind === "data",
  );
  const signalPreview = signalWire
    ? String(signalWire.data?.value ?? "").slice(0, 80)
    : null;

  // Reactive gate evaluation: route signal to pass or rejected port.
  const effectiveCriteria = conditionWire
    ? String(conditionWire.data?.value ?? "")
    : criteria;
  const signalVal = signalWire?.data?.value;

  useEffect(() => {
    if (signalVal == null) {
      setPortOutput(panelId, "pass", null);
      setPortOutput(panelId, "rejected", null);
      updatePanel(panelId, { meta: { ...panel?.meta, gateStatus: "idle" } });
      return;
    }
    const passes = evalGate(signalVal, mode, effectiveCriteria);
    const wireData = { kind: "text" as const, value: String(signalVal) };
    setPortOutput(panelId, "pass",     passes  ? wireData : null);
    setPortOutput(panelId, "rejected", !passes ? wireData : null);
    updatePanel(panelId, { meta: { ...panel?.meta, gateStatus: passes ? "open" : "closed" } });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalVal, mode, effectiveCriteria, panelId]);

  const statusColor =
    gateStatus === "open"   ? "#4db89a" :
    gateStatus === "closed" ? "#e07b54" :
    "rgba(255,255,255,0.22)";

  const statusLabel =
    gateStatus === "open"   ? "geçti ▸" :
    gateStatus === "closed" ? "bloke ✕" :
    "bekliyor";

  const set = (patch: Record<string, unknown>) =>
    updatePanel(panelId, { meta: { ...panel?.meta, ...patch } });

  return (
    <div className="flex h-full flex-col" style={{ background: "transparent", minWidth: 0 }}>

      {/* ── Status bar ── */}
      <div
        className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5"
        style={{ borderColor: "rgba(255,255,255,0.05)" }}
      >
        <div
          style={{
            width: 8, height: 8, borderRadius: "50%",
            background: statusColor,
            boxShadow: gateStatus !== "idle" ? `0 0 8px ${statusColor}` : "none",
            transition: "all 300ms ease-out",
            flexShrink: 0,
          }}
        />
        <span style={{
          fontSize: 9, color: statusColor, fontFamily: "system-ui",
          letterSpacing: "0.08em", textTransform: "uppercase", transition: "color 300ms ease-out",
        }}>
          {statusLabel}
        </span>
        {/* Circuit-breaker icon */}
        <svg
          width="12" height="12" viewBox="0 0 16 16" fill="none"
          stroke={statusColor} strokeWidth="1.6" strokeLinecap="round"
          style={{ marginLeft: "auto", transition: "stroke 300ms ease-out" }}
        >
          {gateStatus === "closed" ? (
            // Broken circuit
            <>
              <path d="M2 8h4"/>
              <path d="M10 8h4"/>
              <path d="M6 6l4 4M6 10l4-4" stroke="#e07b54" strokeWidth="1.4"/>
            </>
          ) : (
            // Closed circuit (normal)
            <>
              <path d="M2 8h3"/>
              <path d="M11 8h3"/>
              <rect x="5" y="5" width="6" height="6" rx="1.5"/>
              <path d="M8 5v6" strokeOpacity="0.4"/>
            </>
          )}
        </svg>
      </div>

      {/* ── Mode pills ── */}
      <div className="shrink-0 px-3 pt-2">
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>
          Koşul modu
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => set({ mode: m.id })}
              style={{
                padding: "2px 8px", borderRadius: 4, fontSize: 9, fontFamily: "system-ui",
                cursor: "pointer", transition: "all 150ms ease-out",
                background: mode === m.id ? "rgba(91,141,239,0.14)" : "transparent",
                border: `1px solid ${mode === m.id ? "rgba(91,141,239,0.40)" : "rgba(255,255,255,0.07)"}`,
                color: mode === m.id ? "#5b8def" : "rgba(255,255,255,0.35)",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Criteria input (only for contains / regex) ── */}
      {(mode === "contains" || mode === "regex") && (
        <div className="shrink-0 px-3 pt-2">
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
            {mode === "contains" ? "Aranan metin" : "Regex pattern"}
          </div>
          <input
            value={criteria}
            onChange={(e) => set({ criteria: e.target.value })}
            placeholder={mode === "contains" ? "örn: hata" : "örn: ^error.*"}
            style={{
              width: "100%", background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6,
              padding: "4px 8px", fontSize: 11, color: "#c8c8d0",
              outline: "none", fontFamily: "monospace", caretColor: "#5b8def",
            }}
          />
        </div>
      )}

      {/* ── Signal preview ── */}
      <div className="mt-auto shrink-0 px-3 pb-3 pt-2">
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
          Gelen sinyal
        </div>
        <div style={{
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 6, padding: "5px 8px", fontSize: 10,
          color: signalPreview ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.18)",
          fontFamily: "monospace", wordBreak: "break-all", minHeight: 28,
        }}>
          {signalPreview ?? "(bağlı değil)"}
        </div>
      </div>
    </div>
  );
}
