/**
 * PipelinePanel — canvas panel that represents a CLI node (pipeline or task).
 * Shows the node's steps, a run button, and live output.
 * On completion, stores output in meta.outputData so connected wires receive it.
 */
import { useEffect, useState, useCallback } from "react";
import { useCanvasStore } from "./canvasStore";
import type { CanvasPanelNode } from "./types";

const API = "http://127.0.0.1:4242";

interface NodeDef {
  id: string;
  name: string;
  kind: "pipeline" | "task";
  steps_count: number;
  trigger: string;
  color: string;
  icon: string;
  output_kind: string;
}

type RunStatus = "idle" | "running" | "done" | "error";

export function PipelinePanel({ panel }: { panel: CanvasPanelNode }) {
  const updatePanel = useCanvasStore((s) => s.updatePanel);
  const setOutputData = useCanvasStore((s) => s.setOutputData);

  const nodeId = panel.meta?.nodeId as string | undefined;
  const [nodeDef, setNodeDef] = useState<NodeDef | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [output, setOutput] = useState<string>("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!nodeId) return;
    fetch(`${API}/api/nodes`)
      .then((r) => r.json())
      .then((data) => {
        const found = (data.nodes as NodeDef[]).find((n) => n.id === nodeId);
        if (found) {
          setNodeDef(found);
          updatePanel(panel.id, { title: found.name });
        } else {
          setLoadError(`Node not found: ${nodeId}`);
        }
      })
      .catch(() => setLoadError("API not running — start: python api/server.py"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  const run = useCallback(async () => {
    if (!nodeId || runStatus === "running") return;
    setRunStatus("running");
    setOutput("");
    try {
      const res = await fetch(`${API}/api/nodes/${nodeId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ctx: {} }),
      });
      const data = await res.json();
      if (data.ok) {
        const msg = `Started: ${data.id} (${data.kind})`;
        setOutput(msg);
        setRunStatus("done");
        setOutputData(panel.id, { kind: "text", value: msg });
        updatePanel(panel.id, { meta: { ...panel.meta, lastRun: new Date().toISOString() } });
      } else {
        setOutput(data.error ?? "Unknown error");
        setRunStatus("error");
      }
    } catch {
      setOutput("API not reachable — start: python api/server.py");
      setRunStatus("error");
    }
  }, [nodeId, runStatus, panel.id, panel.meta, setOutputData, updatePanel]);

  const statusColor = runStatus === "done" ? "#4db89a" : runStatus === "error" ? "#d06c74" : runStatus === "running" ? "#e09a5b" : "#555";

  if (!nodeId) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center">
        <span className="text-[10px] text-[#555]">No node selected — spawn from canvas right-click → Nodes</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center">
        <span className="text-[10px] text-[#888]">{loadError}</span>
      </div>
    );
  }

  if (!nodeDef) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-[10px] text-[#555]">Loading…</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#0a0a0a]">
      {/* Header */}
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-[#1a1a1a] px-2">
        <span style={{ color: nodeDef.color }} className="text-sm">{nodeDef.icon}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[#f5f5f5]">{nodeDef.name}</span>
        <span className="shrink-0 rounded bg-[#1a1a1a] px-1.5 py-0.5 text-[8px] text-[#555]">
          {nodeDef.kind}
        </span>
      </div>

      {/* Steps info */}
      <div className="shrink-0 border-b border-[#111] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-[#444]">{nodeDef.steps_count} step{nodeDef.steps_count !== 1 ? "s" : ""}</span>
          <span className="text-[9px] text-[#333]">·</span>
          <span className="text-[9px] text-[#444]">trigger: {nodeDef.trigger}</span>
          {!!panel.meta?.lastRun && (
            <>
              <span className="text-[9px] text-[#333]">·</span>
              <span className="text-[9px] text-[#333]">
                last: {new Date(String(panel.meta.lastRun)).toLocaleTimeString()}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Output area */}
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {output ? (
          <pre className="whitespace-pre-wrap text-[9px]" style={{ color: statusColor }}>
            {output}
          </pre>
        ) : (
          <span className="text-[9px] text-[#333]">No output yet</span>
        )}
      </div>

      {/* Run button */}
      <div className="shrink-0 border-t border-[#111] p-2">
        <button
          type="button"
          onClick={() => void run()}
          disabled={runStatus === "running"}
          className="flex w-full items-center justify-center gap-1.5 rounded py-1.5 text-[10px] font-medium transition-colors disabled:opacity-40"
          style={{
            backgroundColor: `${nodeDef.color}20`,
            color: nodeDef.color,
          }}
        >
          {runStatus === "running" ? (
            <><span className="animate-spin">↻</span> Running…</>
          ) : (
            <><span>{nodeDef.icon}</span> Run</>
          )}
        </button>
      </div>
    </div>
  );
}
