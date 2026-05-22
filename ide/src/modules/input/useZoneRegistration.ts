/**
 * `useZoneRegistration` — hook that tracks a DOM element's screen rectangle
 * and registers it in the zone store. The bitmap renderer picks it up
 * automatically.
 *
 * Usage:
 *   const ref = useRef<HTMLDivElement>(null);
 *   useZoneRegistration(ref, ZoneType.Bar);
 *   return <div ref={ref}>…</div>;
 */
import { useEffect, useId, useRef } from "react";
import { useZoneStore } from "./zoneStore";
import type { ZoneType } from "./types";

interface Options {
  /** Higher value paints later, overwriting lower zones. Defaults to 0. */
  zIndex?: number;
  /** When false the hook does nothing — useful for `layoutMode !== "focused"`. */
  enabled?: boolean;
}

export function useZoneRegistration<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  zoneType: ZoneType,
  options: Options = {},
) {
  const { zIndex = 0, enabled = true } = options;
  const reactId = useId();
  // Stable id across rerenders. `useId` returns a string with colons — we
  // strip them so the id is safe to use in any context.
  const idRef = useRef(`zone-${reactId.replace(/:/g, "")}`);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const id = idRef.current;
    const store = useZoneStore.getState();

    const pushRect = () => {
      const r = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const rect = {
        x: Math.round(r.left * dpr),
        y: Math.round(r.top * dpr),
        w: Math.round(r.width * dpr),
        h: Math.round(r.height * dpr),
      };
      if (store.zones.has(id)) {
        store.update(id, { rect, zoneType, zIndex });
      } else {
        store.register({ id, rect, zoneType, zIndex });
      }
    };

    pushRect();

    const resizeObs = new ResizeObserver(() => pushRect());
    resizeObs.observe(el);

    // IntersectionObserver fires on scroll / transform changes that
    // ResizeObserver misses.
    const intersectionObs = new IntersectionObserver(() => pushRect(), {
      threshold: [0, 0.5, 1],
    });
    intersectionObs.observe(el);

    window.addEventListener("scroll", pushRect, true);
    window.addEventListener("resize", pushRect);

    return () => {
      resizeObs.disconnect();
      intersectionObs.disconnect();
      window.removeEventListener("scroll", pushRect, true);
      window.removeEventListener("resize", pushRect);
      useZoneStore.getState().unregister(id);
    };
  }, [ref, zoneType, zIndex, enabled]);
}
