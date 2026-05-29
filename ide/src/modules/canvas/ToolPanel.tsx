interface Props {
  toolName?: string;
  toolIcon?: string;
  canvasId?: string;
  onDrillIn?: (canvasId: string) => void;
}

export function ToolPanel({ toolName = "Tool", toolIcon = "⚙", canvasId, onDrillIn }: Props) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 p-4"
      onDoubleClick={() => canvasId && onDrillIn?.(canvasId)}
      style={{ cursor: canvasId ? "pointer" : "default" }}
      title={canvasId ? "Double-click to open" : undefined}
    >
      {/* Icon bubble */}
      <div
        className="flex h-14 w-14 items-center justify-center rounded-xl text-2xl transition-all duration-150"
        style={{
          background: "rgba(91,141,239,0.10)",
          border: "1px solid rgba(91,141,239,0.22)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        {toolIcon}
      </div>

      <span
        className="text-center text-[11.5px] font-medium"
        style={{ color: "#c8c8d0", fontFamily: "system-ui" }}
      >
        {toolName}
      </span>

      {canvasId && (
        <span
          className="rounded-[6px] px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
            color: "rgba(255,255,255,0.25)",
          }}
        >
          hidden canvas
        </span>
      )}
    </div>
  );
}
