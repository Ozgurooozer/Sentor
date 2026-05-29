# Canvas Phase N — MiniMap · Multi-Select · Copy/Paste · Ambient Glass BG · Transparency Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add minimap navigation, marquee + Ctrl+A multi-selection, Ctrl+C/V copy-paste, replace WebGL background with CSS ambient glass (fixes backdrop-filter transparency), and enable batch-drag of multi-selected panels.

**Architecture:** WebGL `V3CanvasBg` is deleted and replaced by `V3CanvasBgAmbient` (pure CSS radial orbs + noise grain). This unblocks `backdrop-filter` on all glass panels. Four new canvasStore actions (`selectAll`, `selectMany`, `moveSelectedExcept`, `pasteFromClipboard`) power multi-select and copy-paste. Marquee state lives in `V3InfiniteCanvas` as a ref+state pair. `V3MiniMap` reads panels + viewport directly from the store.

**Tech Stack:** React, Zustand, CSS `@keyframes`, SVG noise filter, no new npm packages.

---

## Dosya Haritası

| Durum | Dosya | Ne değişiyor |
|---|---|---|
| **Create** | `ide/src/modules/v3-canvas/V3CanvasBgAmbient.tsx` | CSS-only ambient glass arka plan |
| **Create** | `ide/src/modules/v3-canvas/V3MiniMap.tsx` | Minimap bileşeni |
| **Delete** | `ide/src/modules/v3-canvas/V3CanvasBg.tsx` | WebGL → silinir |
| **Modify** | `ide/src/modules/canvas/canvasStore.ts` | 4 yeni action |
| **Modify** | `ide/src/modules/v3-canvas/V3InfiniteCanvas.tsx` | Marquee, Ctrl+A/C/V, bg swap, minimap |
| **Modify** | `ide/src/modules/v3-canvas/V3CanvasNode.tsx` | Çoklu panel sürükleme |
| **Modify** | `ide/src/styles/globals.css` | Orb @keyframes eklenir |

---

### Task 1: CSS Ambient Glass Arka Plan + Şeffaflık Fix

**Files:**
- Create: `ide/src/modules/v3-canvas/V3CanvasBgAmbient.tsx`
- Modify: `ide/src/styles/globals.css` (append keyframes)

**Neden:** `V3CanvasBg` WebGL renderer DOM'a `<canvas>` ekler. Tarayıcı, WebGL canvas üstünden geçen CSS katmanlarına `backdrop-filter` uygulamaz — blur hiçbir şeyi bulanıklaştırmaz. Pure CSS arka plan bu sorunu ortadan kaldırır.

- [ ] **Step 1: `globals.css`'e orb animasyon keyframe'lerini ekle**

Dosyanın sonuna ekle (`ide/src/styles/globals.css`):

```css
/* ── Canvas ambient orb animations ──────────────────────────────────────── */
@keyframes atlas-orb-1 {
  0%   { transform: translate(0px,   0px)   scale(1.00); }
  100% { transform: translate(60px,  40px)  scale(1.08); }
}
@keyframes atlas-orb-2 {
  0%   { transform: translate(0px,   0px)   scale(1.00); }
  100% { transform: translate(-50px, 60px)  scale(0.94); }
}
@keyframes atlas-orb-3 {
  0%   { transform: translate(0px,   0px)   scale(1.00); }
  100% { transform: translate(80px, -40px)  scale(1.06); }
}
@keyframes atlas-orb-4 {
  0%   { transform: translate(0px,   0px)   scale(1.00); }
  100% { transform: translate(-60px,-50px)  scale(1.10); }
}
```

- [ ] **Step 2: `V3CanvasBgAmbient.tsx` oluştur**

```tsx
// ide/src/modules/v3-canvas/V3CanvasBgAmbient.tsx
export function V3CanvasBgAmbient() {
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 0 }}>
      {/* Base */}
      <div className="absolute inset-0" style={{ background: "#050507" }} />

      {/* Orb 1 — blue, top-left */}
      <div
        className="absolute"
        style={{
          width: 900, height: 900, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(91,141,239,0.11) 0%, transparent 68%)",
          top: -280, left: -180,
          animation: "atlas-orb-1 20s ease-in-out infinite alternate",
          willChange: "transform",
        }}
      />

      {/* Orb 2 — violet, right */}
      <div
        className="absolute"
        style={{
          width: 760, height: 760, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(155,114,239,0.09) 0%, transparent 68%)",
          top: "18%", right: -200,
          animation: "atlas-orb-2 25s ease-in-out infinite alternate",
          willChange: "transform",
        }}
      />

      {/* Orb 3 — teal, bottom-center */}
      <div
        className="absolute"
        style={{
          width: 640, height: 640, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(77,184,154,0.07) 0%, transparent 68%)",
          bottom: -120, left: "28%",
          animation: "atlas-orb-3 30s ease-in-out infinite alternate",
          willChange: "transform",
        }}
      />

      {/* Orb 4 — blue, center drift */}
      <div
        className="absolute"
        style={{
          width: 520, height: 520, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(91,141,239,0.06) 0%, transparent 68%)",
          top: "38%", left: "38%",
          animation: "atlas-orb-4 35s ease-in-out infinite alternate",
          willChange: "transform",
        }}
      />

      {/* Noise grain — SVG feTurbulence, overlay blend */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ opacity: 0.032, mixBlendMode: "overlay" }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="atlas-canvas-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#atlas-canvas-noise)" />
      </svg>
    </div>
  );
}
```

- [ ] **Step 3: `V3InfiniteCanvas.tsx`'de `V3CanvasBg` → `V3CanvasBgAmbient` ile değiştir**

`V3InfiniteCanvas.tsx`'de:
```typescript
// ESKİ import (sil):
import { V3CanvasBg } from "./V3CanvasBg";

// YENİ import (ekle):
import { V3CanvasBgAmbient } from "./V3CanvasBgAmbient";
```

JSX'de:
```tsx
// ESKİ (sil):
<V3CanvasBg />

// YENİ (ekle):
<V3CanvasBgAmbient />
```

- [ ] **Step 4: `V3CanvasBg.tsx`'i sil**

```bash
git rm ide/src/modules/v3-canvas/V3CanvasBg.tsx
```

- [ ] **Step 5: `V3SecondaryCanvas.tsx`'de de aynı import swap'ı yap (varsa)**

```bash
grep -r "V3CanvasBg" ide/src --include="*.tsx" -l
```

Çıkan her dosyada `V3CanvasBg` → `V3CanvasBgAmbient` yap.

- [ ] **Step 6: TypeScript doğrula**

```bash
cd ide && npx tsc --noEmit 2>&1 | head -20
```

Sıfır hata bekleniyor.

- [ ] **Step 7: Commit**

```bash
git add ide/src/modules/v3-canvas/V3CanvasBgAmbient.tsx \
        ide/src/styles/globals.css \
        ide/src/modules/v3-canvas/V3InfiniteCanvas.tsx
git commit -m "feat(canvas): replace WebGL bg with CSS ambient glass — fixes backdrop-filter"
```

---

### Task 2: canvasStore — 4 yeni action

**Files:**
- Modify: `ide/src/modules/canvas/canvasStore.ts`

Bu task'taki tüm değişiklikler `canvasStore.ts` içinde, mevcut action'ların yanına eklenir.

- [ ] **Step 1: Interface'e 4 yeni action imzası ekle**

`canvasStore.ts`'de `StoreState` interface'ini bul (yaklaşık satır 60–130). `deleteSelected(): void;` satırından sonra ekle:

```typescript
  /** Tüm canvas panellerini seç. */
  selectAll(): void;
  /** Verilen ID listesini seçili yap (mevcut seçimi ezer). */
  selectMany(ids: string[]): void;
  /**
   * Seçili tüm panelleri (excludeId hariç) dx/dy kadar kaydır.
   * Panel title drag'ı sırasında diğer seçili panelleri senkronize eder.
   */
  moveSelectedExcept(excludeId: string, dx: number, dy: number): void;
  /**
   * Kopyalanan panelleri viewport merkezine yapıştırır.
   * Her panel yeni UUID alır; paste sonrası seçili hale gelir.
   */
  pasteFromClipboard(nodes: CanvasPanelNode[]): void;
```

- [ ] **Step 2: 4 implementasyonu ekle**

`deleteSelected()` implementasyonunu bul, hemen ardından ekle:

```typescript
    selectAll() {
      set((s) => ({ selectedPanelIds: s.panels.filter((p) => !p.pinned && !p.minimized).map((p) => p.id) }));
    },

    selectMany(ids) {
      set({ selectedPanelIds: ids });
    },

    moveSelectedExcept(excludeId, dx, dy) {
      const { selectedPanelIds } = get();
      if (selectedPanelIds.length <= 1) return;
      set((s) => ({
        panels: s.panels.map((p) =>
          s.selectedPanelIds.includes(p.id) && p.id !== excludeId && !p.pinned
            ? { ...p, x: p.x + dx, y: p.y + dy }
            : p,
        ),
      }));
      schedulePersist({
        panels: get().panels,
        connections: get().connections,
        viewport: get().viewport,
        nextZ: get().nextZ,
      });
    },

    pasteFromClipboard(nodes) {
      if (nodes.length === 0) return;
      const { nextZ, viewport } = get();
      // Viewport merkezi canvas uzayında
      const cx = (window.innerWidth  / 2 - viewport.x) / viewport.scale;
      const cy = (window.innerHeight / 2 - viewport.y) / viewport.scale;
      // Clipboard node'larının bounding box merkezi
      const minX = Math.min(...nodes.map((n) => n.x));
      const minY = Math.min(...nodes.map((n) => n.y));
      const maxX = Math.max(...nodes.map((n) => n.x + n.width));
      const maxY = Math.max(...nodes.map((n) => n.y + n.height));
      const clipCX = (minX + maxX) / 2;
      const clipCY = (minY + maxY) / 2;
      const offX = cx - clipCX + 40;
      const offY = cy - clipCY + 40;
      let z = nextZ;
      const newPanels: CanvasPanelNode[] = nodes.map((n) => ({
        ...n,
        id: crypto.randomUUID(),
        x: n.x + offX,
        y: n.y + offY,
        zIndex: z++,
        meta: { ...(n.meta ?? {}) },
      }));
      set((s) => ({
        panels: [...s.panels, ...newPanels],
        nextZ: z,
        selectedPanelIds: newPanels.map((p) => p.id),
      }));
      schedulePersist({
        panels: get().panels,
        connections: get().connections,
        viewport: get().viewport,
        nextZ: get().nextZ,
      });
    },
```

- [ ] **Step 3: TypeScript doğrula**

```bash
cd ide && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add ide/src/modules/canvas/canvasStore.ts
git commit -m "feat(canvas): add selectAll/selectMany/moveSelectedExcept/pasteFromClipboard to canvasStore"
```

---

### Task 3: Multi-Selection — Ctrl+A ve Marquee (Shift+Drag)

**Files:**
- Modify: `ide/src/modules/v3-canvas/V3InfiniteCanvas.tsx`

Mevcut `V3InfiniteCanvas.tsx`'in tamamını aşağıdaki değişikliklerle güncelle.

- [ ] **Step 1: Yeni import'ları ve clipboard değişkenini dosyanın başına ekle**

Mevcut `import` bloğunun altına, `export function V3InfiniteCanvas()` öncesine ekle:

```typescript
// Module-level clipboard — tab-isolated, kalıcılık gerekmez
let _clipboard: import("@/modules/canvas/types").CanvasPanelNode[] = [];
```

- [ ] **Step 2: `useCanvasStore` call'una yeni action'ları ekle**

```typescript
const selectAll        = useCanvasStore((s) => s.selectAll);
const selectMany       = useCanvasStore((s) => s.selectMany);
const pasteFromClipboard = useCanvasStore((s) => s.pasteFromClipboard);
```

- [ ] **Step 3: Marquee için ref'leri ve state'i ekle**

```typescript
// Marquee (rubber-band) seçimi için
const marqueeActiveRef = useRef(false);
const marqueeStartScreen = useRef({ x: 0, y: 0 });
const marqueeCurrentRef = useRef({ x1: 0, y1: 0, x2: 0, y2: 0 });
const [marqueeScreen, setMarqueeScreen] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
```

- [ ] **Step 4: `onCanvasPointerDown` — Shift+drag → marquee, else pan**

Mevcut `onCanvasPointerDown`'ı tamamen değiştir:

```typescript
const onCanvasPointerDown = useCallback(
  (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || panelDragging) return;
    if ((e.target as HTMLElement).closest("[data-canvas-panel]")) return;
    deselectAll();

    if (e.shiftKey) {
      // Shift+drag = marquee seçimi
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x1 = e.clientX - rect.left;
      const y1 = e.clientY - rect.top;
      marqueeActiveRef.current = true;
      marqueeStartScreen.current = { x: x1, y: y1 };
      marqueeCurrentRef.current = { x1, y1, x2: x1, y2: y1 };
      setMarqueeScreen({ x1, y1, x2: x1, y2: y1 });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } else {
      // Default: canvas pan
      panState.current = { active: true, startX: e.clientX, startY: e.clientY, origVX: viewport.x, origVY: viewport.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  },
  [viewport.x, viewport.y, panelDragging, deselectAll],
);
```

- [ ] **Step 5: `onCanvasPointerMove` — marquee branch ekle**

Mevcut `onCanvasPointerMove`'u değiştir:

```typescript
const onCanvasPointerMove = useCallback(
  (e: React.PointerEvent<HTMLDivElement>) => {
    if (marqueeActiveRef.current) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x2 = e.clientX - rect.left;
      const y2 = e.clientY - rect.top;
      const next = { x1: marqueeStartScreen.current.x, y1: marqueeStartScreen.current.y, x2, y2 };
      marqueeCurrentRef.current = next;
      setMarqueeScreen(next);
      return;
    }
    if (!panState.current.active) return;
    setViewport({
      x: panState.current.origVX + (e.clientX - panState.current.startX),
      y: panState.current.origVY + (e.clientY - panState.current.startY),
    });
  },
  [setViewport],
);
```

- [ ] **Step 6: `onCanvasPointerUp` — marquee finalise + panel seçimi**

Mevcut `onCanvasPointerUp`'u değiştir:

```typescript
const onCanvasPointerUp = useCallback(
  (e: React.PointerEvent<HTMLDivElement>) => {
    if (marqueeActiveRef.current) {
      marqueeActiveRef.current = false;
      const r = marqueeCurrentRef.current;
      const vp = useCanvasStore.getState().viewport;
      // Screen → canvas space
      const minCX = (Math.min(r.x1, r.x2) - vp.x) / vp.scale;
      const maxCX = (Math.max(r.x1, r.x2) - vp.x) / vp.scale;
      const minCY = (Math.min(r.y1, r.y2) - vp.y) / vp.scale;
      const maxCY = (Math.max(r.y1, r.y2) - vp.y) / vp.scale;
      const ids = useCanvasStore.getState().panels
        .filter((p) => !p.pinned && !p.minimized)
        .filter((p) => p.x < maxCX && p.x + p.width > minCX && p.y < maxCY && p.y + p.height > minCY)
        .map((p) => p.id);
      if (ids.length > 0) selectMany(ids);
      setMarqueeScreen(null);
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      return;
    }
    panState.current.active = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  },
  [selectMany],
);
```

- [ ] **Step 7: `useEffect` keydown handler'a Ctrl+A ekle**

Mevcut `useEffect` içindeki `onKey` fonksiyonunu bul. `if ((e.ctrlKey || e.metaKey) && e.key === "k")` bloğunun öncesine ekle:

```typescript
if ((e.ctrlKey || e.metaKey) && e.key === "a") {
  e.preventDefault();
  selectAll();
  return;
}
```

- [ ] **Step 8: JSX'e marquee overlay div ekle**

`{showAddPanel && <V3NodePalette ... />}` satırından ÖNCE ekle:

```tsx
{/* Rubber-band marquee selection overlay */}
{marqueeScreen && (
  <div
    className="pointer-events-none absolute"
    style={{
      left:   Math.min(marqueeScreen.x1, marqueeScreen.x2),
      top:    Math.min(marqueeScreen.y1, marqueeScreen.y2),
      width:  Math.abs(marqueeScreen.x2 - marqueeScreen.x1),
      height: Math.abs(marqueeScreen.y2 - marqueeScreen.y1),
      border: "1px solid rgba(91,141,239,0.55)",
      background: "rgba(91,141,239,0.06)",
      zIndex: 55,
    }}
  />
)}
```

- [ ] **Step 9: TypeScript doğrula**

```bash
cd ide && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 10: Commit**

```bash
git add ide/src/modules/v3-canvas/V3InfiniteCanvas.tsx
git commit -m "feat(canvas): Ctrl+A select-all + Shift+drag marquee rubber-band selection"
```

---

### Task 4: Copy/Paste — Ctrl+C / Ctrl+V

**Files:**
- Modify: `ide/src/modules/v3-canvas/V3InfiniteCanvas.tsx`

Task 3'teki module-level `_clipboard` değişkenini kullanır.

- [ ] **Step 1: `useEffect` keydown handler'a Ctrl+C ve Ctrl+V ekle**

Task 3'te eklediğimiz `Ctrl+A` bloğunun hemen ardından:

```typescript
if ((e.ctrlKey || e.metaKey) && e.key === "c") {
  const { selectedPanelIds, panels } = useCanvasStore.getState();
  _clipboard = panels.filter((p) => selectedPanelIds.includes(p.id));
  return;
}
if ((e.ctrlKey || e.metaKey) && e.key === "v") {
  if (_clipboard.length > 0) {
    useCanvasStore.getState().pasteFromClipboard(_clipboard);
  }
  return;
}
```

- [ ] **Step 2: TypeScript doğrula**

```bash
cd ide && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add ide/src/modules/v3-canvas/V3InfiniteCanvas.tsx
git commit -m "feat(canvas): Ctrl+C/V copy-paste for selected panels"
```

---

### Task 5: Çoklu Panel Sürükleme (Multi-Drag)

**Files:**
- Modify: `ide/src/modules/v3-canvas/V3CanvasNode.tsx`

Bir panel title'ından sürüklenince, seçili diğer tüm paneller de aynı delta ile hareket eder.

- [ ] **Step 1: `dragState` ref tipine `prevDxCanvas` ve `prevDyCanvas` ekle**

`V3CanvasNode.tsx`'de `dragState` ref'ini bul:

```typescript
// ESKİ:
const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

// YENİ:
const dragState = useRef<{
  startX: number; startY: number;
  origX: number;  origY: number;
  prevDxCanvas: number; prevDyCanvas: number;
} | null>(null);
```

- [ ] **Step 2: `onTitlePointerDown`'da `prevDxCanvas: 0, prevDyCanvas: 0` başlangıç değeri ekle**

```typescript
// ESKİ:
dragState.current = {
  startX: e.clientX, startY: e.clientY,
  origX: panel.pinned ? (panel.screenX ?? 0) : panel.x,
  origY: panel.pinned ? (panel.screenY ?? 0) : panel.y,
};

// YENİ:
dragState.current = {
  startX: e.clientX, startY: e.clientY,
  origX: panel.pinned ? (panel.screenX ?? 0) : panel.x,
  origY: panel.pinned ? (panel.screenY ?? 0) : panel.y,
  prevDxCanvas: 0,
  prevDyCanvas: 0,
};
```

- [ ] **Step 3: `moveSelectedExcept` import'u ekle**

`useCanvasStore` call'una ekle:

```typescript
const moveSelectedExcept = useCanvasStore((s) => s.moveSelectedExcept);
```

- [ ] **Step 4: `onTitlePointerMove`'u güncelle — delta hesaplayıp diğer panelleri de hareket ettir**

```typescript
const onTitlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
  if (!dragState.current) return;
  const dx = e.clientX - dragState.current.startX;
  const dy = e.clientY - dragState.current.startY;
  if (panel.pinned) {
    updatePanel(panel.id, {
      screenX: dragState.current.origX + dx,
      screenY: dragState.current.origY + dy,
    });
  } else {
    const dxCanvas = dx / viewportScale;
    const dyCanvas = dy / viewportScale;
    updatePanel(panel.id, {
      x: dragState.current.origX + dxCanvas,
      y: dragState.current.origY + dyCanvas,
    });
    // Diğer seçili panelleri delta farkıyla hareket ettir
    const ddx = dxCanvas - dragState.current.prevDxCanvas;
    const ddy = dyCanvas - dragState.current.prevDyCanvas;
    if (ddx !== 0 || ddy !== 0) {
      moveSelectedExcept(panel.id, ddx, ddy);
    }
    dragState.current.prevDxCanvas = dxCanvas;
    dragState.current.prevDyCanvas = dyCanvas;
  }
}, [panel.id, panel.pinned, viewportScale, updatePanel, moveSelectedExcept]);
```

- [ ] **Step 5: TypeScript doğrula**

```bash
cd ide && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add ide/src/modules/v3-canvas/V3CanvasNode.tsx
git commit -m "feat(canvas): multi-drag — move all selected panels together when dragging one"
```

---

### Task 6: MiniMap

**Files:**
- Create: `ide/src/modules/v3-canvas/V3MiniMap.tsx`
- Modify: `ide/src/modules/v3-canvas/V3InfiniteCanvas.tsx` (1 satır import + 1 satır JSX)

- [ ] **Step 1: `V3MiniMap.tsx` oluştur**

```tsx
// ide/src/modules/v3-canvas/V3MiniMap.tsx
import { useCallback, useRef } from "react";
import { useCanvasStore } from "@/modules/canvas/canvasStore";

const MAP_W = 160;
const MAP_H = 96;
const PAD   = 120;

export function V3MiniMap() {
  const panels     = useCanvasStore((s) => s.panels.filter((p) => !p.pinned && !p.minimized));
  const viewport   = useCanvasStore((s) => s.viewport);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const dragRef    = useRef(false);

  if (panels.length === 0) return null;

  // Tüm panel'lerin bounding box'ı (canvas uzayı)
  const minX = Math.min(...panels.map((p) => p.x)) - PAD;
  const minY = Math.min(...panels.map((p) => p.y)) - PAD;
  const maxX = Math.max(...panels.map((p) => p.x + p.width))  + PAD;
  const maxY = Math.max(...panels.map((p) => p.y + p.height)) + PAD;
  const bw   = maxX - minX;
  const bh   = maxY - minY;

  // Map ölçeği — her iki eksende de sığacak şekilde
  const s = Math.min(MAP_W / bw, MAP_H / bh);
  const mapW = bw * s;
  const mapH = bh * s;
  const offX = (MAP_W - mapW) / 2;
  const offY = (MAP_H - mapH) / 2;

  const toMap = (cx: number, cy: number) => ({
    x: (cx - minX) * s + offX,
    y: (cy - minY) * s + offY,
  });

  // Viewport görünür alanı (canvas uzayı)
  const vpCX = -viewport.x / viewport.scale;
  const vpCY = -viewport.y / viewport.scale;
  const vpCW = window.innerWidth  / viewport.scale;
  const vpCH = window.innerHeight / viewport.scale;

  const vpMap  = toMap(vpCX, vpCY);
  const vpMapW = vpCW * s;
  const vpMapH = vpCH * s;

  // Tıklama / sürükleme ile viewport'u taşı
  const moveToMapPoint = useCallback((mx: number, my: number) => {
    // Map px → canvas uzayı
    const cx = (mx - offX) / s + minX;
    const cy = (my - offY) / s + minY;
    setViewport({
      x: window.innerWidth  / 2 - cx * viewport.scale,
      y: window.innerHeight / 2 - cy * viewport.scale,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.scale, offX, offY, s, minX, minY]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    moveToMapPoint(e.clientX - rect.left, e.clientY - rect.top);
  }, [moveToMapPoint]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    moveToMapPoint(e.clientX - rect.left, e.clientY - rect.top);
  }, [moveToMapPoint]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div
      className="absolute bottom-3 right-3 z-50 select-none overflow-hidden"
      style={{
        width: MAP_W, height: MAP_H,
        background: "rgba(8,8,14,0.80)",
        backdropFilter: "blur(14px) saturate(140%)",
        WebkitBackdropFilter: "blur(14px) saturate(140%)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 8,
        cursor: "crosshair",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Panel dikdörtgenleri */}
      {panels.map((p) => {
        const m = toMap(p.x, p.y);
        return (
          <div
            key={p.id}
            className="pointer-events-none absolute rounded-[1px]"
            style={{
              left:   m.x,
              top:    m.y,
              width:  Math.max(3, p.width  * s),
              height: Math.max(2, p.height * s),
              background: "rgba(91,141,239,0.45)",
            }}
          />
        );
      })}

      {/* Viewport göstergesi */}
      <div
        className="pointer-events-none absolute"
        style={{
          left:   vpMap.x,
          top:    vpMap.y,
          width:  Math.max(8, vpMapW),
          height: Math.max(6, vpMapH),
          border: "1px solid rgba(91,141,239,0.70)",
          background: "rgba(91,141,239,0.08)",
        }}
      />

      {/* "map" etiketi */}
      <div
        className="pointer-events-none absolute bottom-1 left-1.5 font-mono text-[8px] uppercase tracking-widest"
        style={{ color: "rgba(255,255,255,0.16)" }}
      >
        map
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `V3InfiniteCanvas.tsx`'e import ve JSX ekle**

Import bloğuna:
```typescript
import { V3MiniMap } from "./V3MiniMap";
```

JSX'de `{showAddPanel && <V3NodePalette ... />}` satırının hemen ÖNÜNE:
```tsx
<V3MiniMap />
```

- [ ] **Step 3: TypeScript doğrula**

```bash
cd ide && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add ide/src/modules/v3-canvas/V3MiniMap.tsx \
        ide/src/modules/v3-canvas/V3InfiniteCanvas.tsx
git commit -m "feat(canvas): add V3MiniMap — viewport indicator with click-to-navigate"
```

---

### Task 7: Final doğrulama

- [ ] **Step 1: Tam TypeScript kontrolü**

```bash
cd ide && npx tsc --noEmit 2>&1
```

Sıfır hata bekleniyor.

- [ ] **Step 2: Cargo check**

```bash
cd ide/src-tauri && cargo check 2>&1 | tail -3
```

- [ ] **Step 3: Manuel test listesi (IDE açıkken)**

```
□ Arka plan: Three.js grid yok, yumuşak mavi/mor/teal orb'lar görünüyor
□ Şeffaflık: Panel glass'ı arkasındaki renkleri bulanıklaştırıyor (backdrop-filter çalışıyor)
□ MiniMap: Sağ alt köşede görünüyor, tıklayınca viewport atlıyor
□ Ctrl+A: Tüm paneller seçilir (mavi kenarlık)
□ Shift+Drag: Boş alana sürükleyince mavi seçim dikdörtgeni çizilir, bırakınca kesişen paneller seçilir
□ Multi-drag: Birden fazla seçiliyken birini sürükleyince hepsi hareket eder
□ Ctrl+C → Ctrl+V: Panel kopyalanır, yapıştırılan seçili olur
□ Canvas sohbet ederken kaymayor (Task 3'ten önceki fix korunmuş)
```

- [ ] **Step 4: Son commit (gerekirse)**

```bash
git status
# Temiz ise hazır
```
