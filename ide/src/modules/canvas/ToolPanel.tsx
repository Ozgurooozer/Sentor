interface Props {
  toolName?: string;
  toolIcon?: string;
  canvasId?: string;
  onDrillIn?: (canvasId: string) => void;
}

export function ToolPanel({ toolName = "Tool", toolIcon = "⚙", canvasId, onDrillIn }: Props) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-2 p-3"
      onDoubleClick={() => canvasId && onDrillIn?.(canvasId)}
      title={canvasId ? "Double-click to open" : undefined}
      style={{ cursor: canvasId ? "pointer" : "default" }}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] text-2xl">
        {toolIcon}
      </div>
      <span className="text-center text-[11px] font-medium text-[#888888]">{toolName}</span>
      {canvasId && (
        <span className="rounded border border-[#2a2a2a] bg-[#111111] px-1.5 py-0.5 font-mono text-[9px] text-[#555555]">
          hidden canvas
        </span>
      )}
    </div>
  );
}
