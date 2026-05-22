import { useEffect, useRef, type RefObject } from "react";
import type { EditorPaneHandle } from "@/modules/editor";
import type { Tab } from "@/modules/tabs";

/**
 * When an AI diff is approved (write_file applied to disk), reload any open
 * editor tabs targeting that file path so the user sees the new content.
 * Tracks already-handled approval IDs so each diff fires the reload exactly
 * once.
 */
export function useDiffReloadTrigger(
  tabs: Tab[],
  editorRefs: RefObject<Map<number, EditorPaneHandle>>,
) {
  const appliedDiffsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const t of tabs) {
      if (t.kind !== "ai-diff") continue;
      if (t.status !== "approved") continue;
      if (appliedDiffsRef.current.has(t.approvalId)) continue;
      appliedDiffsRef.current.add(t.approvalId);
      for (const e of tabs) {
        if (e.kind !== "editor") continue;
        if (e.path !== t.path) continue;
        editorRefs.current.get(e.id)?.reload();
      }
    }
  }, [tabs, editorRefs]);
}
