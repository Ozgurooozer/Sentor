/**
 * Bitmap Renderer — paints the zone registry into a tiny hit-bitmap and
 * pushes it to the Rust input core.
 *
 * Resolution is intentionally low (~36 KB) so the upload is cheap. The
 * WindowProc subclass resamples to screen coordinates on every hit-test, so
 * the precision we lose here is at most ~7 pixels at 1920x1080.
 */
import { invoke } from "@tauri-apps/api/core";
import type { ZoneEntry } from "./types";
import { ZoneType } from "./types";

export const BITMAP_W = 256;
export const BITMAP_H = 144;

/**
 * Rasterise zones into a `Uint8Array` of length `BITMAP_W * BITMAP_H`.
 * Each cell holds a `ZoneType` byte. Zones are painted in ascending zIndex
 * order, so higher zones overwrite lower ones (same as DOM stacking).
 */
export function paintBitmap(
  zones: ZoneEntry[],
  screenW: number,
  screenH: number,
): Uint8Array {
  const out = new Uint8Array(BITMAP_W * BITMAP_H);
  // Default everywhere is Passthrough (0). `Uint8Array` is already zeroed.

  if (screenW <= 0 || screenH <= 0) return out;

  for (const zone of zones) {
    const x0 = Math.max(0, Math.floor((zone.rect.x / screenW) * BITMAP_W));
    const y0 = Math.max(0, Math.floor((zone.rect.y / screenH) * BITMAP_H));
    const x1 = Math.min(
      BITMAP_W,
      Math.ceil(((zone.rect.x + zone.rect.w) / screenW) * BITMAP_W),
    );
    const y1 = Math.min(
      BITMAP_H,
      Math.ceil(((zone.rect.y + zone.rect.h) / screenH) * BITMAP_H),
    );
    if (x1 <= x0 || y1 <= y0) continue;
    const byte = zone.zoneType as number;
    for (let y = y0; y < y1; y++) {
      const rowStart = y * BITMAP_W;
      out.fill(byte, rowStart + x0, rowStart + x1);
    }
  }

  return out;
}

/** Push the freshly painted bitmap to the Rust core. */
export async function pushBitmap(
  data: Uint8Array,
  screenW: number,
  screenH: number,
): Promise<void> {
  await invoke("update_hit_bitmap", {
    width: BITMAP_W,
    height: BITMAP_H,
    screenW,
    screenH,
    // Tauri serialises this as a JSON array of numbers; the Rust side reads
    // `Vec<u8>`. The size (~36 KB) is small enough that the JSON overhead is
    // acceptable for a one-per-frame push.
    data: Array.from(data),
  });
}

/** Reset the Rust-side bitmap to the all-passthrough default. */
export async function clearBitmap(): Promise<void> {
  await invoke("clear_hit_bitmap");
}

/**
 * Toggle WM_NCHITTEST interception on/off. Pair every `setInputActive(true)`
 * with a matching `setInputActive(false)` on unmount, otherwise classic
 * (non-focused) mode will inherit passthrough behaviour and clicks on the
 * IDE will fall through to the desktop.
 */
export async function setInputActive(active: boolean): Promise<void> {
  await invoke("set_input_active", { active });
}

/** Re-exported for callers that want to inspect the default zone. */
export const DEFAULT_ZONE = ZoneType.Passthrough;
