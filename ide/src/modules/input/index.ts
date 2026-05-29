/**
 * Public surface of the `input` module.
 *
 * Other modules consume this barrel only — they never reach into internals
 * like `bitmapRenderer` or `zoneStore` directly.
 */
export { ZoneType } from "./types";
export type { ZoneEntry, ZoneRect } from "./types";
export { useZoneRegistration } from "./useZoneRegistration";
