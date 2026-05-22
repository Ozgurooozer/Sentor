/**
 * Zone Registry — the single source of truth for which screen rectangles
 * claim input.
 *
 * Other modules never read the bitmap directly; they declare zones via
 * `useZoneRegistration` and the bitmap renderer rasterises the store.
 */
import { create } from "zustand";
import type { ZoneEntry, ZoneRect, ZoneType } from "./types";

interface ZoneStore {
  /** Map for O(1) update / unregister. Selectors derive arrays. */
  zones: Map<string, ZoneEntry>;

  register(entry: ZoneEntry): void;
  update(id: string, patch: { rect?: ZoneRect; zoneType?: ZoneType; zIndex?: number }): void;
  unregister(id: string): void;
  clear(): void;
}

export const useZoneStore = create<ZoneStore>((set) => ({
  zones: new Map(),

  register(entry) {
    set((s) => {
      const next = new Map(s.zones);
      next.set(entry.id, entry);
      return { zones: next };
    });
  },

  update(id, patch) {
    set((s) => {
      const existing = s.zones.get(id);
      if (!existing) return s;
      const next = new Map(s.zones);
      next.set(id, {
        ...existing,
        rect: patch.rect ?? existing.rect,
        zoneType: patch.zoneType ?? existing.zoneType,
        zIndex: patch.zIndex ?? existing.zIndex,
      });
      return { zones: next };
    });
  },

  unregister(id) {
    set((s) => {
      if (!s.zones.has(id)) return s;
      const next = new Map(s.zones);
      next.delete(id);
      return { zones: next };
    });
  },

  clear() {
    set({ zones: new Map() });
  },
}));

/** Selector helper — returns zones sorted ascending by zIndex (paint order). */
export function selectSortedZones(s: ZoneStore): ZoneEntry[] {
  return Array.from(s.zones.values()).sort((a, b) => a.zIndex - b.zIndex);
}
