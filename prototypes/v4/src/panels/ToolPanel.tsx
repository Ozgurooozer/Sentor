export function ToolPanel({ panelId }: { panelId: string }) {
  return (
    <div style={{ padding: 12, color: "var(--text-secondary)", fontSize: 13, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 24 }}>🔧</span>
      <span>inference-sh tools component</span>
      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>npx shadcn add https://inference.sh/r/tools.json</span>
    </div>
  );
}
