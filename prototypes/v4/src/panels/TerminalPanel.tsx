import { useRef } from "react";
import { TerminalPane } from "@/terminal/TerminalPane";

let _leafId = 100;

export function TerminalPanel({ panelId }: { panelId: string }) {
  const leafIdRef = useRef(_leafId++);

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <TerminalPane leafId={leafIdRef.current} visible={true} focused={false} />
    </div>
  );
}
