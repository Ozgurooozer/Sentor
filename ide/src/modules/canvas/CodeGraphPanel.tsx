/**
 * CodeGraphPanel — canvas panel that renders the CodeGraph bridge output as an
 * interactive D3 force-directed graph. Nodes are colored by symbol kind.
 * Clicking a node opens an editor canvas panel at the symbol's file.
 *
 * Requires the CodeGraph bridge to be running:
 *   node tools/codegraph_bridge.js [workspace-root]
 */
import { useEffect, useRef, useState, useCallback } from "react";
// @ts-ignore — d3 ships its own types via package.json "types" field
import * as d3 from "d3";
import { useCanvasStore } from "./canvasStore";
import type { CanvasPanelNode } from "./types";

const BRIDGE = "http://localhost:4245";

// ── Types ────────────────────────────────────────────────────────────────────

interface CgNode {
  id: string;
  name: string;
  kind: string;
  file: string;
  line?: number;
}

type PanelStatus = "loading" | "ready" | "not_running" | "error";

// ── Colors ───────────────────────────────────────────────────────────────────

const KIND_COLORS: Record<string, string> = {
  function:  "#5b8def",
  method:    "#7b6def",
  class:     "#4db89a",
  interface: "#45a8a8",
  type:      "#e09a5b",
  component: "#5b8def",
  variable:  "#666666",
  route:     "#d06c74",
  file:      "#555555",
};

function kindColor(kind: string): string {
  return KIND_COLORS[kind?.toLowerCase()] ?? "#888888";
}

// ── Main component ───────────────────────────────────────────────────────────

export function CodeGraphPanel({ panel }: { panel: CanvasPanelNode }) {
  const addPanel = useCanvasStore((s) => s.addPanel);
  const updatePanel = useCanvasStore((s) => s.updatePanel);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const onClickRef = useRef<(file: string) => void>(() => undefined);

  const [nodes, setNodes] = useState<CgNode[]>([]);
  const [status, setStatus] = useState<PanelStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [filter, setFilter] = useState("");

  // Open a file in a new editor canvas panel
  const openFile = useCallback(
    (file: string) => {
      if (!file) return;
      const editorId = addPanel("editor", { x: panel.x + panel.width + 20, y: panel.y });
      updatePanel(editorId, { meta: { path: file } });
    },
    [addPanel, updatePanel, panel.x, panel.y, panel.width],
  );

  onClickRef.current = openFile;

  // ── Fetch graph data ─────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch(`${BRIDGE}/graph`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 300 }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(`Bridge returned ${res.status}`);
        return;
      }
      const data = await res.json();
      if (data.error) {
        setStatus("error");
        setErrorMsg(data.error);
        return;
      }
      setNodes(Array.isArray(data.nodes) ? data.nodes : []);
      setStatus("ready");
    } catch {
      setStatus("not_running");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── D3 graph ──────────────────────────────────────────────────────────────

  const filteredNodes = filter
    ? nodes.filter(
        (n) =>
          n.name.toLowerCase().includes(filter.toLowerCase()) ||
          n.kind.toLowerCase().includes(filter.toLowerCase()),
      )
    : nodes;

  useEffect(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg || status !== "ready") return;

    const w = container.clientWidth || 700;
    const h = container.clientHeight || 500;

    const root = d3
      .select(svg)
      .attr("viewBox", [0, 0, w, h])
      .attr("width", w)
      .attr("height", h);

    root.selectAll("*").remove();

    const g = root.append("g");

    root.call(
      d3
        .zoom()
        .scaleExtent([0.1, 6])
        .on("zoom", (event: any) => g.attr("transform", event.transform)),
    );

    const simNodes = filteredNodes.map((n) => ({ ...n }));

    const simulation = d3
      .forceSimulation(simNodes)
      .force("charge", d3.forceManyBody().strength(-80))
      .force("center", d3.forceCenter(w / 2, h / 2))
      .force("collision", d3.forceCollide(12))
      .force("x", d3.forceX(w / 2).strength(0.05))
      .force("y", d3.forceY(h / 2).strength(0.05));

    const node = g
      .append("g")
      .selectAll("g")
      .data(simNodes)
      .join("g")
      .attr("cursor", "pointer")
      .call(
        d3
          .drag()
          .on("start", (event: any, d: any) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event: any, d: any) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event: any, d: any) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      );

    node
      .append("circle")
      .attr("r", 5)
      .attr("fill", (d: any) => kindColor(d.kind))
      .attr("stroke", "#0a0a0a")
      .attr("stroke-width", 1);

    node
      .append("text")
      .attr("dx", 8)
      .attr("dy", "0.35em")
      .attr("font-size", "8px")
      .attr("fill", "#555")
      .attr("pointer-events", "none")
      .text((d: any) => (d.name.length > 22 ? d.name.slice(0, 22) + "…" : d.name));

    node.on("click", (_event: any, d: any) => {
      onClickRef.current((d as CgNode).file);
    });

    node.on("mouseenter", (_event: any) => {
      d3.select(_event.currentTarget)
        .select("circle")
        .attr("stroke", "#5b8def")
        .attr("stroke-width", 2)
        .attr("r", 7);
      d3.select(_event.currentTarget)
        .select("text")
        .attr("fill", "#aaa");
    });

    node.on("mouseleave", (_event: any) => {
      d3.select(_event.currentTarget)
        .select("circle")
        .attr("stroke", "#0a0a0a")
        .attr("stroke-width", 1)
        .attr("r", 5);
      d3.select(_event.currentTarget)
        .select("text")
        .attr("fill", "#555");
    });

    simulation.on("tick", () => {
      node.attr("transform", (d: any) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => simulation.stop();
  }, [filteredNodes, status]);

  // ── Legend ────────────────────────────────────────────────────────────────

  const kindCounts = filteredNodes.reduce<Record<string, number>>((acc, n) => {
    acc[n.kind] = (acc[n.kind] ?? 0) + 1;
    return acc;
  }, {});

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-[#0a0a0a]">
      {/* Toolbar */}
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-[#1a1a1a] px-2">
        <span className="text-[10px] font-medium text-[#888]">Code Graph</span>
        <div className="flex-1" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter…"
          className="h-5 w-28 rounded bg-[#111] px-1.5 text-[9px] text-[#f5f5f5] outline-none focus:bg-[#1a1a1a]"
        />
        <button
          type="button"
          onClick={() => void load()}
          title="Refresh"
          disabled={status === "loading"}
          className="h-5 rounded bg-[#111] px-1.5 text-[10px] text-[#555] transition-colors hover:bg-[#1a1a1a] hover:text-[#f5f5f5] disabled:opacity-40"
        >
          ↺
        </button>
      </div>

      {/* Main area */}
      <div className="relative min-h-0 flex-1" ref={containerRef}>
        {status === "loading" && (
          <Overlay>
            <span className="text-[10px] text-[#555]">Loading index…</span>
          </Overlay>
        )}

        {status === "not_running" && (
          <Overlay>
            <div className="flex flex-col items-center gap-1.5 text-center">
              <span className="text-[11px] text-[#f5f5f5]">Bridge not running</span>
              <span className="text-[9px] text-[#555]">
                node tools/codegraph_bridge.js &quot;C:\Atlas OS&quot;
              </span>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-1 rounded bg-[#5b8def]/20 px-3 py-1 text-[10px] text-[#5b8def] hover:bg-[#5b8def]/30"
              >
                Retry
              </button>
            </div>
          </Overlay>
        )}

        {status === "error" && (
          <Overlay>
            <div className="flex flex-col items-center gap-1.5 text-center">
              <span className="text-[11px] text-[#f5f5f5]">Error</span>
              <span className="max-w-[240px] text-[9px] text-[#888]">{errorMsg}</span>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-1 rounded bg-[#1a1a1a] px-3 py-1 text-[10px] text-[#888] hover:text-[#f5f5f5]"
              >
                Retry
              </button>
            </div>
          </Overlay>
        )}

        {status === "ready" && filteredNodes.length === 0 && (
          <Overlay>
            <span className="text-[10px] text-[#555]">
              {filter ? `No results for "${filter}"` : "No symbols indexed"}
            </span>
          </Overlay>
        )}

        <svg ref={svgRef} className="h-full w-full" />

        {/* Legend */}
        {status === "ready" && filteredNodes.length > 0 && (
          <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-1.5">
            {Object.entries(kindCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([kind, count]) => (
                <span
                  key={kind}
                  className="flex items-center gap-1 rounded bg-[#0a0a0a]/80 px-1.5 py-0.5"
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: kindColor(kind) }}
                  />
                  <span className="text-[8px] text-[#555]">
                    {kind} {count}
                  </span>
                </span>
              ))}
            <span className="flex items-center rounded bg-[#0a0a0a]/80 px-1.5 py-0.5">
              <span className="text-[8px] text-[#444]">{filteredNodes.length} nodes</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">{children}</div>
  );
}
