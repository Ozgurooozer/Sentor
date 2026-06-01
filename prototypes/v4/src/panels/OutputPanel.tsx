import { useAllIncomingWireData } from "@/store/useWireData";

export function OutputPanel({ panelId }: { panelId: string }) {
  const wires = useAllIncomingWireData(panelId);
  const text = wires
    .map((w) => (typeof w.data?.value === "string" ? w.data.value : JSON.stringify(w.data?.value ?? "")))
    .join("\n\n");

  return (
    <div style={{ height: "100%", overflow: "auto", padding: 8 }}>
      {text ? (
        <pre style={{
          margin: 0,
          fontFamily: "monospace",
          fontSize: 12,
          color: "var(--text-primary)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          lineHeight: 1.5,
        }}>
          {text}
        </pre>
      ) : (
        <div style={{ color: "var(--text-tertiary)", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
          wire a source to see output
        </div>
      )}
    </div>
  );
}
