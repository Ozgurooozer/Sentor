/**
 * `HitBitmapSync` — invisible component that wires the zone registry to the
 * Rust input core. Mount once when entering focused mode; unmount when
 * leaving.
 *
 * Responsibility:
 *   • Subscribe to the zone store.
 *   • Debounce changes to one frame (~16 ms) so a burst of resize updates
 *     produces a single bitmap push.
 *   • Track the screen size so the Rust side can resample correctly.
 *   • Clear the bitmap on unmount so the IDE returns to normal click behaviour.
 */
import { useEffect } from "react";
import { useZoneStore, selectSortedZones } from "./zoneStore";
import { paintBitmap, pushBitmap, clearBitmap, setInputActive } from "./bitmapRenderer";

export function HitBitmapSync() {
  useEffect(() => {
    // Activate BEFORE the first bitmap push so there's never a moment where
    // the WindowProc subclass is reading a stale bitmap with the flag on.
    void setInputActive(true).catch(() => undefined);
    let frame = 0;
    let cancelled = false;

    const flush = () => {
      if (cancelled) return;
      frame = 0;
      const zones = selectSortedZones(useZoneStore.getState());
      const dpr = window.devicePixelRatio || 1;
      const screenW = Math.round(window.screen.width * dpr);
      const screenH = Math.round(window.screen.height * dpr);
      const data = paintBitmap(zones, screenW, screenH);
      void pushBitmap(data, screenW, screenH).catch(() => undefined);
    };

    const schedule = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(flush);
    };

    // Initial push.
    schedule();

    // Re-push whenever the registry changes.
    const unsub = useZoneStore.subscribe(schedule);
    // Also re-push on screen size changes.
    window.addEventListener("resize", schedule);

    return () => {
      cancelled = true;
      if (frame !== 0) cancelAnimationFrame(frame);
      unsub();
      window.removeEventListener("resize", schedule);
      // Disable BEFORE clearing so there's no window where the subclass is
      // still active but reading a bitmap that classifies every pixel as
      // passthrough.
      void setInputActive(false)
        .then(() => clearBitmap())
        .catch(() => undefined);
    };
  }, []);

  return null;
}
