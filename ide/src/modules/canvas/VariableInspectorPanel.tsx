import { useVariableStore, type VariableRecord } from "./variableStore";

const TrashIcon = () => (
  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 4h10M6 4V3h4v1M5 4v9h6V4"/>
  </svg>
);

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return v.length > 120 ? v.slice(0, 120) + "…" : v;
  const s = JSON.stringify(v);
  return s.length > 120 ? s.slice(0, 120) + "…" : s;
}

function relTime(ts: number): string {
  const d = Date.now() - ts;
  if (d < 3000) return "now";
  if (d < 60_000) return `${Math.floor(d / 1000)}s ago`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  return `${Math.floor(d / 3_600_000)}h ago`;
}

const BADGE: Record<VariableRecord["dataType"], string> = {
  text:   "#4db89a",
  json:   "#9b72ef",
  number: "#5b8def",
  any:    "#888888",
};

export function VariableInspectorPanel() {
  const variables = useVariableStore((s) => s.variables);
  const remove = useVariableStore((s) => s.removeVariable);

  return (
    <div className="flex h-full flex-col gap-0 overflow-hidden" style={{ fontFamily: "system-ui" }}>
      {/* header */}
      <div
        className="flex shrink-0 items-center justify-between px-3 py-1.5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span className="text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
          Variables
        </span>
        <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.2)" }}>
          {variables.length}
        </span>
      </div>

      {/* list */}
      {variables.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-center text-[10.5px]" style={{ color: "rgba(255,255,255,0.18)", fontFamily: "system-ui" }}>
            No variables yet.{"\n"}Use a Variable node to store values.
          </span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto no-scrollbar" style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
          {variables.map((v) => (
            <VariableRow key={v.id} record={v} onDelete={() => remove(v.name)} />
          ))}
        </div>
      )}
    </div>
  );
}

function VariableRow({ record, onDelete }: { record: VariableRecord; onDelete: () => void }) {
  const color = BADGE[record.dataType] ?? "#888888";
  return (
    <div
      className="group relative flex flex-col gap-0.5 rounded-[6px] px-2.5 py-2 transition-colors"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
    >
      {/* name + type badge + delete */}
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium" style={{ color: "#e0e0e8" }}>
          {record.name}
        </span>
        <span
          className="shrink-0 rounded px-1 py-0.5 font-mono text-[9px] uppercase tracking-widest"
          style={{ background: `${color}18`, color, border: `1px solid ${color}28` }}
        >
          {record.dataType}
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          style={{ color: "rgba(255,100,100,0.6)", padding: "1px 2px" }}
          title="Remove variable"
        >
          <TrashIcon />
        </button>
      </div>
      {/* value */}
      <span
        className="truncate font-mono text-[10px] leading-snug"
        style={{ color: "rgba(255,255,255,0.40)", wordBreak: "break-all", whiteSpace: "pre-wrap" }}
      >
        {formatValue(record.value)}
      </span>
      {/* timestamp */}
      <span className="mt-0.5 text-[9.5px]" style={{ color: "rgba(255,255,255,0.16)" }}>
        {relTime(record.updatedAt)}
      </span>
    </div>
  );
}
