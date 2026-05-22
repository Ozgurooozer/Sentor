import { useEffect, useRef } from "react";
// TODO: add @types/d3 or split into d3-selection / d3-force / d3-zoom / d3-drag deps.
// @ts-ignore — d3 has no bundled .d.ts files; tree-shaking via named imports still works.
import { select, zoom, forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, drag } from "d3";

const CATEGORY_COLORS: Record<string, string> = {
  home:     "#5b8def",
  agents:   "#7b6def",
  meetings: "#4db89a",
  projects: "#e09a5b",
  notes:    "#888888",
  tools:    "#d06c74",
};

function nodeColor(category: string): string {
  return CATEGORY_COLORS[category] ?? "#5b8def";
}

export interface GraphNode {
  id: string;
  title: string;
  category: string;
  url: string;
}

export interface GraphLink {
  source: string;
  target: string;
}

type Props = {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeClick: (id: string, url: string) => void;
};

export function GraphView({ nodes, links, onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const onClickRef = useRef(onNodeClick);
  onClickRef.current = onNodeClick;

  useEffect(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const root = select(svg)
      .attr("viewBox", [0, 0, width, height])
      .attr("width", width)
      .attr("height", height);

    root.selectAll("*").remove();

    const g = root.append("g");

    root.call(
      zoom()
        .scaleExtent([0.15, 5])
        .on("zoom", (event: any) => g.attr("transform", event.transform)),
    );

    const simNodes = nodes.map((n) => ({ ...n }));
    const nodeById = new Map(simNodes.map((n) => [n.id, n]));
    const validLinks = links.filter(
      (l) => nodeById.has(l.source) && nodeById.has(l.target),
    );

    const simulation = forceSimulation(simNodes)
      .force("link", forceLink(validLinks).id((d: any) => d.id).distance(70))
      .force("charge", forceManyBody().strength(-150))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collision", forceCollide(20));

    const link = g
      .append("g")
      .selectAll("line")
      .data(validLinks)
      .join("line")
      .attr("stroke", "#2a2a2a")
      .attr("stroke-width", 1);

    const node = g
      .append("g")
      .selectAll("g")
      .data(simNodes)
      .join("g")
      .attr("cursor", "pointer")
      .call(
        drag()
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
      .attr("r", 7)
      .attr("fill", (d: any) => nodeColor(d.category))
      .attr("stroke", "#0a0a0a")
      .attr("stroke-width", 1.5);

    node
      .append("text")
      .attr("dx", 10)
      .attr("dy", "0.35em")
      .attr("font-size", "9px")
      .attr("fill", "#666")
      .attr("pointer-events", "none")
      .text((d: any) =>
        d.title.length > 24 ? d.title.slice(0, 24) + "…" : d.title,
      );

    node.on("click", (_event: any, d: any) => {
      onClickRef.current(d.id, d.url);
    });

    node.on("mouseenter", (_event: any, _d: any) => {
      select(_event.currentTarget)
        .select("circle")
        .attr("stroke", "#5b8def")
        .attr("stroke-width", 2);
    });

    node.on("mouseleave", (_event: any) => {
      select(_event.currentTarget)
        .select("circle")
        .attr("stroke", "#0a0a0a")
        .attr("stroke-width", 1.5);
    });

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => simulation.stop();
  }, [nodes, links]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <svg ref={svgRef} className="h-full w-full bg-[#0a0a0a]" />
    </div>
  );
}
