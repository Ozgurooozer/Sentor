# Atlas Infinite Canvas — Implementation Plan

> **Vision:** Atlas focused mode is not a window — it's a *semantic input compositor + infinite working surface + native passthrough overlay*. Every pixel on screen is semantically classified; mouse events are routed to the right consumer (desktop, canvas, panel, bar) at the OS level. On top of that runs an infinite canvas where users spawn floating tool panels (Terminal, Editor, Preview, Vault Home, Web) and wire them together like a node graph.

---

## Three-layer architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Windows Desktop (OS)                     │
└───────────────────────▲─────────────────────────────────────┘
                        │ WM_NCHITTEST / pointer events
┌───────────────────────┴─────────────────────────────────────┐
│              Layer 1 — Native Input Core (Rust)             │
│                                                             │
│  • WindowProc subclass on the main HWND                     │
│  • Hit-bitmap sampler (per-pixel zone lookup)               │
│  • Routes WM_NCHITTEST → HTTRANSPARENT or HTCLIENT          │
│  • Tauri command: update_hit_bitmap(w, h, bytes)            │
└───────────────────────▲─────────────────────────────────────┘
                        │ in-process RwLock<HitBitmap>
┌───────────────────────┴─────────────────────────────────────┐
│        Layer 2 — Interaction Runtime (TypeScript)           │
│                                                             │
│  • Zone Registry (Zustand) — { id, rect, zoneType }[]       │
│  • Bitmap Renderer — OffscreenCanvas → bytes → invoke()     │
│  • useZoneRegistration hook                                 │
│  • (Phase 3) Temporal Intent Classifier                     │
└───────────────────────▲─────────────────────────────────────┘
                        │ React props/refs
┌───────────────────────┴─────────────────────────────────────┐
│              Layer 3 — Visual Runtime (React)               │
│                                                             │
│  • InfiniteCanvas    — pan/zoom/dot grid                    │
│  • CanvasPanel       — drag/resize/ports/content slot       │
│  • PanelMenu         — "+" dropdown in FocusedBar           │
│  • Chat overlay      — separate OS window (already shipped) │
└─────────────────────────────────────────────────────────────┘
```

---

## Modules

### Rust — `ide/src-tauri/src/input/`

```
mod.rs            re-exports + init_input(app)
zone_type.rs      ZoneType enum (u8 repr): Passthrough=0, Interactive=1, Canvas=2, Bar=3, Panel=4
bitmap.rs         HitBitmap struct, sample(screen_x, screen_y) → ZoneType
subclass.rs       (windows-only) install_subclass(hwnd) + WindowProc intercepting WM_NCHITTEST
state.rs          InputState { bitmap: RwLock<HitBitmap> } — Tauri-managed state
commands.rs       #[tauri::command] update_hit_bitmap, get_hit_bitmap_size
```

### Frontend — `ide/src/modules/input/`

```
index.ts             public exports
types.ts             ZoneType enum + ZoneEntry interface (mirrors Rust)
zoneStore.ts         Zustand store: zones, addZone, updateZone, removeZone
bitmapRenderer.ts    paintBitmap(zones, w, h) → Uint8Array; debounced push
HitBitmapSync.tsx    component that subscribes to zoneStore + pushes to Rust
useZoneRegistration.ts  hook: registers a DOM element's rect + zone type
```

### Frontend — `ide/src/modules/canvas/` (Phase 1+)

```
index.ts             public exports
types.ts             PanelType, CanvasPanelNode, Connection, Viewport
canvasStore.ts       Zustand: panels, connections, viewport
InfiniteCanvas.tsx   root: pan/zoom/grid/SVG/panels
CanvasPanel.tsx      one panel: drag/resize/title/ports/content
PanelMenu.tsx        "+" dropdown
connections.ts       bezier helpers (Phase 2)
panelContent/        per-type content adapters
  TerminalContent.tsx
  EditorContent.tsx
  PreviewContent.tsx
  VaultHomeContent.tsx
  WebContent.tsx
```

---

## Phase 0 — Native Input Core

**Goal:** Per-pixel hit-test working end-to-end. No canvas yet. Test target: spawn a single test panel on the transparent overlay; clicking the panel reacts in our app, clicking around it passes through to the desktop.

### Rust details

**`bitmap.rs`** — `HitBitmap` holds `width: u32, height: u32, data: Vec<u8>`. `sample(x, y)` maps screen coords → bitmap coords (nearest neighbour), returns `ZoneType` from the single-byte cell. Out-of-bounds → `Passthrough`.

**`subclass.rs`** — Uses `SetWindowLongPtrW(hwnd, GWLP_WNDPROC, new_proc)` + `CallWindowProcW(prev_proc, ...)`. Stores the original WindowProc pointer in a thread-local or `OnceLock`. The new WindowProc:
- On `WM_NCHITTEST`: extracts screen `(x, y)` from `lParam`, samples the global bitmap, returns `HTTRANSPARENT` for `Passthrough` else passes through to original proc.
- All other messages: forwarded to original proc.

**`state.rs`** — `InputState { bitmap: Arc<RwLock<HitBitmap>> }` registered as Tauri-managed state. The subclass WindowProc reads through a `OnceLock<Arc<RwLock<HitBitmap>>>` that's initialised when `init_input` runs (so the WindowProc, which can't access app state directly, has a stable handle).

**`commands.rs`** — `update_hit_bitmap(width, height, data: Vec<u8>)`:
- Validates `data.len() == (width * height) as usize`.
- Acquires the write lock briefly, replaces the bitmap.

**`init_input(app)`** — Called from `run()`. Gets the main window's HWND via `app.get_webview_window("main").window_handle()`, installs subclass, registers state.

### Frontend details

**`types.ts`**
```ts
export enum ZoneType {
  Passthrough = 0,
  Interactive = 1,
  Canvas = 2,
  Bar = 3,
  Panel = 4,
}
export interface ZoneEntry {
  id: string;
  rect: { x: number; y: number; w: number; h: number };  // physical pixels
  zoneType: ZoneType;
  zIndex: number;
}
```

**`zoneStore.ts`** — Zustand. Actions: `register(entry)`, `update(id, patch)`, `unregister(id)`. State: `zones: Map<string, ZoneEntry>` (keep as Map for O(1) updates; selectors derive arrays).

**`bitmapRenderer.ts`** —
- Resolution: 256×144 (16:9, ~36 KB). High enough for resize handles & ports at 1920×1080.
- `paintBitmap(zones, screenW, screenH)`: creates `OffscreenCanvas`, fills with Passthrough (0), then for each zone (sorted by zIndex asc) draws a filled rect using the zone type as the red channel value.
- Reads `ImageData`, extracts every 4th byte (R channel) into a `Uint8Array` of length `w*h`.
- Pushes via `invoke("update_hit_bitmap", { width, height, data })`.
- Debounced 16 ms (one frame).

**`HitBitmapSync.tsx`** — Effect-only component (renders null). Subscribes to `zoneStore` + window resize, calls `paintBitmap` + `invoke()` on change. Skipped entirely when `layoutMode !== "focused"`.

**`useZoneRegistration.ts`** —
```ts
useZoneRegistration(ref: RefObject<HTMLElement>, zoneType: ZoneType, zIndex = 0)
```
Inside: `ResizeObserver` + `IntersectionObserver` (catches scroll/transform). On change, computes physical pixel rect via `getBoundingClientRect()` + `devicePixelRatio` and calls `register` / `update`. Unregisters on unmount.

### Phase 0 validation

1. Add a single test `<div>` to FocusedBar that uses `useZoneRegistration(..., Interactive)`.
2. Enter focused mode → click the test div: should still respond.
3. Click empty transparent area: should pass through to desktop (focus the desktop window underneath).
4. Move the test div via animation: zone should follow, bitmap should re-render, click-through behaviour should track.
5. Existing `set_click_through` command can stay for now — replaced by bitmap in Phase 1.

---

## Phase 1 — Canvas Substrate

**Goal:** Infinite canvas with pan/zoom, registered as a `Canvas` zone (interactive). Empty canvas area registers as `Passthrough` (still see desktop through). FocusedBar gets a `[+]` button (no menu yet — spawns a test panel).

### `canvasStore.ts`
```ts
interface CanvasStore {
  panels: CanvasPanelNode[];
  connections: Connection[];
  viewport: { x: number; y: number; scale: number };
  nextZ: number;
  addPanel(type: PanelType): void;
  removePanel(id: string): void;
  updatePanel(id: string, patch: Partial<CanvasPanelNode>): void;
  bringToFront(id: string): void;
  setViewport(patch: Partial<Viewport>): void;
}
```

### `InfiniteCanvas.tsx`
- Renders a transparent full-size `<div>`.
- `onPointerDown` on the canvas itself (not bubbled): begin pan if no panel under cursor.
- `onWheel`: zoom (clamped `[0.3, 3.0]`, origin = cursor position).
- Inner `<div>` has `transform: translate(x, y) scale(s)` applied to all panels and the SVG layer.
- Dot grid: fixed background (CSS radial-gradient pattern), not transformed (parallax feel).
- Registers an empty-canvas `Passthrough` zone for any area not covered by a panel. (Implementation: rather than subtracting panel rects, paint the canvas as `Passthrough` first, then panels paint themselves as `Panel` zones on top via their own `useZoneRegistration`.)

### Phase 1 validation

1. Empty canvas in focused mode: clicking anywhere → desktop responds.
2. `[+]` spawns a test panel (just a `<div>` with title bar).
3. Clicking the panel → React handler fires.
4. Pan: drag empty area → viewport translates.
5. Zoom: wheel → viewport scales (cursor-centred).

---

## Phase 2 — Panel Runtime

**Goal:** All five panel types working inside canvas panels. Drag, resize, minimize, fullscreen, click-to-front.

### `CanvasPanel.tsx`

- Wrapper `<div>` positioned via `left/top/width/height` (canvas-space).
- Registers itself as `Panel` zone via `useZoneRegistration`.
- **Title bar**: type icon + title + minimize/fullscreen/close buttons. `cursor: move`, `onPointerDown` begins drag.
- **Resize**: 8 handles (4 corners + 4 edges). Each is its own `Panel` zone child; bitmap automatically picks them up.
- **Content slot**: renders one of `TerminalContent` / `EditorContent` / `PreviewContent` / `VaultHomeContent` / `WebContent` based on `panel.type`.
- **Ports**: small dots on left (input) and right (output) edges. Visual only in Phase 2; interactive in Phase 3.
- **Fullscreen**: sets `position: fixed; inset: 0` + escape from canvas transform.
- **Click-to-front**: `onPointerDown` calls `bringToFront(id)`.

### `panelContent/` adapters

Each adapter is a thin wrapper that pulls the panel's stored type-specific data from the store and renders the real underlying component:

- `TerminalContent` → wraps the existing terminal pane (single leaf, owns its own session).
- `EditorContent` → wraps `EditorPane` with a stored path; shows file picker if path empty.
- `PreviewContent` → `<iframe src={panel.previewUrl}>` with an internal address bar.
- `VaultHomeContent` → `<VaultHomePane>`.
- `WebContent` → `<iframe>` (native WebView cannot follow canvas transform).

### `PanelMenu.tsx`

Radix `DropdownMenu` triggered by `[+]` button in FocusedBar:
- Terminal · Editor · Preview · Vault Home · Web
- Each item calls `canvasStore.addPanel(type)`.
- New panel spawns at viewport center, size 480×320, gets the next zIndex.

### Phase 2 validation

1. `[+] → Terminal`: terminal panel appears, can type, drag title bar to move, resize from corners.
2. Spawn two panels: clicking one brings it above the other.
3. Fullscreen: panel fills the canvas area; Esc exits.
4. Click empty space between/around panels: desktop responds (passthrough still works thanks to bitmap).

---

## Phase 3 — Connections & Temporal Classifier

**Only if needed.** Adds:

- **Interactive ports** — drag from output port → rubber-band SVG line → drop on input port → connection created.
- **Bezier edges** in SVG layer, animated flow dots.
- **Data flow semantics:**
  - Terminal → Editor: OSC 7 / detected path opens in linked editor.
  - Terminal → Preview: detected localhost URL opens in linked preview.
  - Editor → Preview: save triggers preview reload.
- **Temporal Intent Classifier** (optional): 40 ms observation window for ambiguous gestures (e.g., drag near canvas edge — pan vs OS window resize). Only ship if a concrete ambiguity emerges in testing.

---

## Phase 4 — Layer settings & persistence

- Settings → General → "Canvas layers": drag-to-reorder list (Chat / Canvas Panels / Desktop).
- Persist canvas layout (panels + positions + connections) to Tauri store.
- Per-workspace canvas state (optional).

---

## Modularity principles

1. **Layer isolation**: no Layer 3 (React) code imports from Rust crates directly; everything goes through Tauri commands. Vice versa for `input/` module which never reaches into `canvas/` types.
2. **Module boundaries**: `input/` knows nothing about panels. `canvas/` uses `input/`'s `useZoneRegistration` hook but never imports the renderer or store internals.
3. **Per-type panel content**: each panel type lives in its own file under `panelContent/`. Adding "Graph" or "Chat" later = one new file + one entry in the registry.
4. **Zone types are an enum** shared between Rust and TS. Adding a new zone = bump the enum on both sides + paint it in `bitmapRenderer`.
5. **No cross-cutting state**: `zoneStore`, `canvasStore`, `chatStore` are independent. They communicate via events or explicit refs, never by direct store imports across module boundaries.

---

## Design constraints (from `interface-setup/.interface-design/system.md`)

- Panel body: `rgba(10, 10, 10, 0.6)` so the desktop bleeds through slightly.
- Panel border: `border-subtle` (#2a2a2a); `border-active` (#404040) on focused panel.
- Title bar: `bg-overlay` (#222222).
- No box-shadows — depth via border only. Single exception: focus ring (`ring-2 ring-accent/40`).
- Transitions: 150 ms ease-out.
- Accent: `#5b8def` for ports, active handles, connection curves.
- Dot grid: `rgba(255, 255, 255, 0.04)` dots, 24 px spacing.

---

## Phase 0 todo

- [ ] `input/zone_type.rs` — `ZoneType` enum
- [ ] `input/bitmap.rs` — `HitBitmap` + sampling
- [ ] `input/state.rs` — Tauri state + `OnceLock` handle
- [ ] `input/subclass.rs` — Win32 WindowProc subclass intercepting `WM_NCHITTEST`
- [ ] `input/commands.rs` — `update_hit_bitmap`
- [ ] `input/mod.rs` — `init_input(app)` + re-exports
- [ ] Wire `init_input` into `lib.rs:run()`
- [ ] `src/modules/input/types.ts` — TS mirror of `ZoneType`
- [ ] `src/modules/input/zoneStore.ts` — Zustand store
- [ ] `src/modules/input/bitmapRenderer.ts` — OffscreenCanvas paint + invoke
- [ ] `src/modules/input/HitBitmapSync.tsx` — effect-only sync component
- [ ] `src/modules/input/useZoneRegistration.ts` — hook
- [ ] `src/modules/input/index.ts` — exports
- [ ] Mount `<HitBitmapSync>` in `App.tsx` when `layoutMode === "focused"`
- [ ] Add `useZoneRegistration(ref, Bar)` to `FocusedBar`
- [ ] `cargo check` clean, `tsc --noEmit` clean
