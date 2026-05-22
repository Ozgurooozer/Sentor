/**
 * Frontend mirror of `src-tauri/src/modules/input/zone_type.rs`.
 *
 * Each value is the single byte written into the hit-bitmap. Keep the enum
 * numerically aligned with the Rust side — the bytes travel across the
 * `update_hit_bitmap` Tauri command unchanged.
 */
export enum ZoneType {
  /** Click should pass through to whatever is behind our window. */
  Passthrough = 0,
  /** Generic interactive surface. */
  Interactive = 1,
  /** Canvas substrate (pan/zoom catcher). */
  Canvas = 2,
  /** FocusedBar. */
  Bar = 3,
  /** A canvas panel. */
  Panel = 4,
  /** Sub canvas viewport area — has its own pan/zoom. */
  SubCanvas = 5,
  /** Pinned panel — fixed screen-space position, outside pan/zoom. */
  PinnedPanel = 6,
}

/**
 * Physical-pixel rectangle. The renderer scales this into bitmap-space when
 * painting; the WindowProc on the Rust side resamples it back to screen
 * coordinates on every WM_NCHITTEST.
 */
export interface ZoneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ZoneEntry {
  id: string;
  rect: ZoneRect;
  zoneType: ZoneType;
  /** Higher z-index paints later, overwriting lower zones. */
  zIndex: number;
}
