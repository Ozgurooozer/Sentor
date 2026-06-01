import type { PanelType } from "@/store/types";
import { TerminalPanel } from "./TerminalPanel";
import { InputPanel } from "./InputPanel";
import { OutputPanel } from "./OutputPanel";

export function PanelContent({ panelId, type }: { panelId: string; type: PanelType }) {
  switch (type) {
    case "terminal": return <TerminalPanel panelId={panelId} />;
    case "input":    return <InputPanel panelId={panelId} />;
    case "output":   return <OutputPanel panelId={panelId} />;
  }
}
