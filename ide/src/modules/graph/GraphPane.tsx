import { readIndex, type IndexPage } from "@/modules/ai/tools/vault";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { GraphView, type GraphLink, type GraphNode } from "./GraphView";

type Props = {
  workspaceRoot: string | null;
  onOpenVaultTab: (url: string) => void;
};

function buildGraph(pages: IndexPage[]): { nodes: GraphNode[]; links: GraphLink[] } {
  const ids = new Set(pages.map((p) => p.id));
  const nodes: GraphNode[] = pages.map((p) => ({
    id: p.id,
    title: p.title,
    category: p.category,
    url: p.url,
  }));
  const links: GraphLink[] = [];
  for (const p of pages) {
    for (const target of p.links ?? []) {
      if (ids.has(target)) links.push({ source: p.id, target });
    }
  }
  return { nodes, links };
}

export function GraphPane({ workspaceRoot, onOpenVaultTab }: Props) {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [loading, setLoading] = useState(true);

  const load = (root: string | null) => {
    if (!root) { setLoading(false); return; }
    setLoading(true);
    readIndex(root)
      .then((pages) => {
        const { nodes: n, links: l } = buildGraph(pages);
        setNodes(n);
        setLinks(l);
      })
      .catch(() => {
        setNodes([]);
        setLinks([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(workspaceRoot); }, [workspaceRoot]);

  useEffect(() => {
    const unsub = listen("vault:reindexed", () => load(workspaceRoot));
    return () => { void unsub.then((fn) => fn()); };
  }, [workspaceRoot]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading graph…
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No vault pages indexed yet.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <GraphView
        nodes={nodes}
        links={links}
        onNodeClick={(_id, url) => onOpenVaultTab(url)}
      />
      <div className="absolute bottom-3 left-3 select-none text-[10px] text-[#444]">
        {nodes.length} pages · {links.length} links — scroll to zoom, drag to pan
      </div>
    </div>
  );
}
