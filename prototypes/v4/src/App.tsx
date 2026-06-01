import { useEffect } from "react";
import { V3InfiniteCanvas } from "@/canvas/V3InfiniteCanvas";
import { useCanvasStore } from "@/store/canvasStore";
import { useVariableStore } from "@/store/variableStore";

export function App() {
  const hydrate = useCanvasStore((s) => s.hydrate);
  const hydrateVars = useVariableStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
    hydrateVars();
  }, [hydrate, hydrateVars]);

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "var(--bg-base)" }}>
      <V3InfiniteCanvas />
    </div>
  );
}
