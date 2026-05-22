import { useEffect, useRef, type RefObject } from "react";
import type { SearchAddon } from "@xterm/addon-search";
import { disposeSession, leafIds, type TerminalPaneHandle } from "@/modules/terminal";
import type { Tab } from "@/modules/tabs";

type Refs = {
  terminalRefs: RefObject<Map<number, TerminalPaneHandle>>;
  searchAddons: RefObject<Map<number, SearchAddon>>;
  detectedUrls: RefObject<Map<number, string>>;
};

/**
 * Drive terminal session disposal off the pane tree, not React lifecycles —
 * split/unsplit re-mounts components while the leaf itself is still live.
 *
 * Each render: compute the set of currently-live leaf ids from `tabs`;
 * dispose any leaves that disappeared since last render; prune the per-leaf
 * ref maps so we don't leak handles for dead leaves.
 */
export function useLeafLifecycle(tabs: Tab[], refs: Refs) {
  const liveLeavesRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const live = new Set<number>();
    for (const t of tabs) {
      if (t.kind === "terminal") {
        for (const id of leafIds(t.paneTree)) live.add(id);
      }
    }
    for (const id of liveLeavesRef.current) {
      if (!live.has(id)) disposeSession(id);
    }
    liveLeavesRef.current = live;
    for (const k of [...refs.terminalRefs.current.keys()])
      if (!live.has(k)) refs.terminalRefs.current.delete(k);
    for (const k of [...refs.searchAddons.current.keys()])
      if (!live.has(k)) refs.searchAddons.current.delete(k);
    for (const k of [...refs.detectedUrls.current.keys()])
      if (!live.has(k)) refs.detectedUrls.current.delete(k);
  }, [tabs, refs]);
}
