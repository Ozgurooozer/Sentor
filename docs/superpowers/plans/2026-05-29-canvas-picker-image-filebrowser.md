# Canvas Picker + Image Preview + FileBrowser Views — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the canvas link toggle with a dropdown canvas picker (cross-window IPC), add image file preview support in canvas panels, and add 3-mode view (list/small/large) + sorting to FileBrowserPanel.

**Architecture:** Three independent changes sharing the canvas panel layer. V3InputShell (separate Tauri window) communicates with the main canvas window via Tauri events. Image preview reuses CanvasPreview by detecting extensions. FileBrowser gets a toolbar + CSS grid layout on top of the existing list.

**Tech Stack:** React (useState, useCallback, useEffect), Tauri v2 events (listen/emit/emitTo), Tauri LazyStore, existing canvasStore (Zustand), localToAsset (asset:// URLs for Tauri)

---

## File Map

| File | Change |
|---|---|
| `ide/src/app/CanvasAppShell.tsx` | Add 2 event listeners: `atlas:request-canvases` → reply with canvas list; `atlas:canvas-switch` → switchCanvas + reply |
| `ide/src/modules/v3/V3InputShell.tsx` | Replace `canvasLinked: boolean` with `linkedCanvasId: string \| null`; add `canvasList`, `pickerOpen` state; replace `resizeWindow` with `resizeTo`; add `CanvasPicker` component; replace canvas `IBtn` |
| `ide/src/modules/canvas/CanvasPanelContent.tsx` | Add `isImagePath()` helper; modify `CanvasPreview` to render `<img>` when path is an image extension |
| `ide/src/modules/canvas/FileBrowserPanel.tsx` | (a) Change double-click to open preview panel for images. (b) Add `viewMode`/`sortField`/`sortDir` state; add toolbar; add sort logic; add grid rendering |

---

## Task 1: CanvasAppShell — IPC for canvas list + switching

**Files:**
- Modify: `ide/src/app/CanvasAppShell.tsx`

- [ ] **Step 1: Add `emitTo` import and canvas IPC effect**

Open `ide/src/app/CanvasAppShell.tsx`. The current import on line 2 is:
```typescript
import { listen } from "@tauri-apps/api/event";
```
Replace with:
```typescript
import { listen, emitTo } from "@tauri-apps/api/event";
```

Then inside `CanvasAppShellInner`, add this `useEffect` after the existing `useEffect` for the V3 canvas bridge (after line ~76):

```typescript
// ── Canvas IPC for V3InputShell (separate window) ──────────────────────
useEffect(() => {
  const reqP = listen("atlas:request-canvases", async () => {
    const { canvases, activeCanvasId } = useCanvasStore.getState();
    await emitTo("v3-input", "atlas:canvas-list", { canvases, activeCanvasId }).catch(() => {});
  });
  const switchP = listen<{ id: string }>("atlas:canvas-switch", async ({ payload }) => {
    await useCanvasStore.getState().switchCanvas(payload.id);
    const { canvases, activeCanvasId } = useCanvasStore.getState();
    await emitTo("v3-input", "atlas:canvas-list", { canvases, activeCanvasId }).catch(() => {});
  });
  return () => {
    void reqP.then(fn => fn());
    void switchP.then(fn => fn());
  };
}, []);
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd ide && npx tsc --noEmit
```
Expected: no errors (or same warnings as before).

- [ ] **Step 3: Commit**

```bash
git add ide/src/app/CanvasAppShell.tsx
git commit -m "feat(v3): add canvas IPC — request-canvases + canvas-switch events"
```

---

## Task 2: V3InputShell — Canvas picker dropdown + height bug fix

**Files:**
- Modify: `ide/src/modules/v3/V3InputShell.tsx`

This task replaces `canvasLinked: boolean` with `linkedCanvasId: string | null`, fixes the window grow-on-toggle bug by anchoring to the window bottom, and adds a `CanvasPicker` dropdown component.

- [ ] **Step 1: Update imports at top of V3InputShell.tsx**

Find the existing import block at the top. Add `listen` to the `@tauri-apps/api/event` import:

```typescript
import { emit, emitTo, listen } from "@tauri-apps/api/event";
```

- [ ] **Step 2: Replace state declarations**

Find and replace these lines in `V3InputShell` component body:

**Remove:**
```typescript
const [canvasLinked, setCanvasLinked] = useState(
  () => localStorage.getItem("v3-canvas-linked") === "1"
);
```

**Add in its place:**
```typescript
const [linkedCanvasId, setLinkedCanvasId] = useState<string | null>(
  () => localStorage.getItem("v3-linked-canvas-id") ?? null,
);
const [canvasList, setCanvasList] = useState<{ id: string; title: string }[]>([]);
const [pickerOpen, setPickerOpen] = useState(false);
```

Add these constants near the top of the component (after the `useState` block, before `useRef`s):
```typescript
const BASE_H    = 52;
const PICKER_H  = 196;
```

- [ ] **Step 3: Add canvas list listener**

Add this `useEffect` after the existing TTS effect (after the `prevLoadingRef` effect):

```typescript
// ── Canvas list sync from main window ────────────────────────────────────
useEffect(() => {
  const unsubP = listen<{ canvases: { id: string; title: string }[] }>(
    "atlas:canvas-list",
    ({ payload }) => setCanvasList(payload.canvases),
  );
  // Request initial list
  void emit("atlas:request-canvases", {}).catch(() => {});
  return () => { void unsubP.then(fn => fn()); };
}, []);
```

- [ ] **Step 4: Replace `resizeWindow` with `resizeTo`**

**Remove** the entire `resizeWindow` useCallback (the one that takes `deltaH` and `growing`).

**Add** this replacement — anchors the window bottom and expands upward:

```typescript
const resizeTo = useCallback(async (targetH: number) => {
  const win = getCurrentWindow();
  const mon = await currentMonitor();
  const sf  = mon?.scaleFactor ?? 1;
  const monTop = (mon?.position.y ?? 0) / sf;
  const monH   = (mon?.size.height ?? 1080) / sf;
  const workH  = monH - 48;
  const size = await win.outerSize();
  const pos  = await win.outerPosition();
  const curBottom = (pos.y + size.height) / sf;
  const newY = curBottom - targetH;
  const clampY = Math.max(monTop + 4, Math.min(newY, monTop + workH - targetH - 4));
  await win.setSize(new LogicalSize(getBarW(), targetH));
  await win.setPosition(new PhysicalPosition(pos.x, Math.round(clampY * sf)));
}, []);
```

- [ ] **Step 5: Rewrite `togglePanel`, `toggleHistory`, and replace `toggleCanvasLink`**

**Replace** the three callback functions:

```typescript
const togglePanel = useCallback(async () => {
  const opening = !panelOpen;
  setPanelOpen(opening);
  if (opening && historyOpen) setHistoryOpen(false);
  if (opening && pickerOpen)  setPickerOpen(false);
  await resizeTo(BASE_H + (opening ? PANEL_H : 0));
  if (!opening) inputRef.current?.focus();
}, [panelOpen, historyOpen, pickerOpen, resizeTo]);

const toggleHistory = useCallback(async () => {
  if (panelOpen) return;
  const opening = !historyOpen;
  setHistoryOpen(opening);
  await resizeTo(BASE_H + (opening ? HISTORY_H : 0) + (pickerOpen ? PICKER_H : 0));
  if (!opening) inputRef.current?.focus();
}, [historyOpen, panelOpen, pickerOpen, resizeTo]);

const togglePicker = useCallback(async () => {
  const opening = !pickerOpen;
  setPickerOpen(opening);
  if (opening) void emit("atlas:request-canvases", {}).catch(() => {});
  await resizeTo(BASE_H + (opening ? PICKER_H : 0) + (historyOpen ? HISTORY_H : 0));
}, [pickerOpen, historyOpen, resizeTo]);

const handleSelectCanvas = useCallback(async (id: string) => {
  setLinkedCanvasId(id);
  localStorage.setItem("v3-linked-canvas-id", id);
  setPickerOpen(false);
  void emit("atlas:canvas-switch", { id }).catch(() => {});
  await resizeTo(BASE_H + (historyOpen ? HISTORY_H : 0));
}, [historyOpen, resizeTo]);

const handleDisconnect = useCallback(async () => {
  setLinkedCanvasId(null);
  localStorage.removeItem("v3-linked-canvas-id");
  setPickerOpen(false);
  setHistoryOpen(false);
  void emit("atlas:canvas-unlink", {}).catch(() => {});
  await resizeTo(BASE_H);
}, [resizeTo]);
```

- [ ] **Step 6: Update all `canvasLinked` references in the JSX**

Find and replace every occurrence of `canvasLinked` in the render/JSX section:

| Old | New |
|---|---|
| `if (canvasLinked)` | `if (linkedCanvasId !== null)` |
| `canvasLinked &&` | `linkedCanvasId !== null &&` |
| `!canvasLinked` | `linkedCanvasId === null` |
| `canvasLinked ? "Canvas'ı yönet…"` | `linkedCanvasId !== null ? "Canvas'ı yönet…"` |
| `canvasLinked ? "rgba(77,184,154,0.30)"` | `linkedCanvasId !== null ? "rgba(77,184,154,0.30)"` |
| `canvasLinked ? "rgba(77,184,154,0.20)"` | `linkedCanvasId !== null ? "rgba(77,184,154,0.20)"` |
| `canvasLinked ? "#4db89a"` | `linkedCanvasId !== null ? "#4db89a"` |
| `canvasLinked ? "rgba(77,184,154,0.35)"` | `linkedCanvasId !== null ? "rgba(77,184,154,0.35)"` |
| `canvasLinked ? "atlas-pulse…"` (busy span bg) | `linkedCanvasId !== null ? "#4db89a"` |

Also update the auto-open history `useEffect`:
```typescript
if (linkedCanvasId !== null && count > 0 && !historyOpen && !panelOpen && prevMsgCountRef.current === 0) {
  setHistoryOpen(true);
  void resizeTo(BASE_H + HISTORY_H + (pickerOpen ? PICKER_H : 0));
}
```

- [ ] **Step 7: Replace canvas link `IBtn` with `CanvasPicker`**

Find the `{/* Canvas link */}` block:
```tsx
{/* Canvas link */}
<IBtn
  onClick={toggleCanvasLink}
  title={canvasLinked ? "Canvas bağlantısını kes" : "Canvas'a bağlan"}
  active={canvasLinked}
  activeColor="green"
>
  <svg .../>
</IBtn>
```

Replace with:
```tsx
{/* Canvas picker */}
<CanvasPicker
  canvasList={canvasList}
  linkedId={linkedCanvasId}
  open={pickerOpen}
  onToggle={() => void togglePicker()}
  onSelect={(id) => void handleSelectCanvas(id)}
  onDisconnect={() => void handleDisconnect()}
/>
```

- [ ] **Step 8: Add `CanvasPicker` component at the bottom of the file (before `IBtn`)**

Add this component definition before the `IBtn` function:

```tsx
function CanvasPicker({
  canvasList, linkedId, open, onToggle, onSelect, onDisconnect,
}: {
  canvasList: { id: string; title: string }[];
  linkedId: string | null;
  open: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onDisconnect: () => void;
}) {
  const label = linkedId
    ? (canvasList.find(c => c.id === linkedId)?.title ?? "Canvas")
    : "Canvas";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        title="Canvas bağlantısı"
        className="flex h-[28px] items-center gap-1 rounded-md px-2 transition-all duration-150"
        style={{
          background: linkedId  ? "rgba(77,184,154,0.16)"
                    : open      ? "rgba(255,255,255,0.08)"
                    :             "rgba(255,255,255,0.06)",
          color:     linkedId  ? "#4db89a"
                    : open      ? "#c8c8d0"
                    :             "#666",
          border: linkedId
            ? "1px solid rgba(77,184,154,0.32)"
            : "1px solid rgba(255,255,255,0.10)",
          maxWidth: 100,
        }}
      >
        {/* canvas icon */}
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1.5" y="1.5" width="11" height="11" rx="2"/>
          <path d="M4 5h6M4 7h4M4 9h2.5"/>
        </svg>
        <span className="truncate text-[10px]" style={{ maxWidth: 52 }}>{label}</span>
        {/* chevrons up-down */}
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 3.5l3-2.5 3 2.5M2 6.5l3 2.5 3-2.5"/>
        </svg>
      </button>

      {open && (
        <div
          className="absolute bottom-[calc(100%+6px)] left-0 z-50 w-[176px] overflow-hidden rounded-[9px]"
          style={{
            background: "rgba(11,11,17,0.98)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            animation: "v3-fadein 0.12s ease",
          }}
        >
          {/* Header */}
          <div className="px-3 pt-2 pb-1">
            <span className="font-mono text-[8px] uppercase tracking-widest"
              style={{ color: "rgba(255,255,255,0.22)" }}>
              Kanvaslar
            </span>
          </div>

          {/* Canvas list */}
          <div className="px-1 pb-1">
            {canvasList.length === 0 && (
              <div className="px-2 py-2 text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                Kanvas bulunamadı
              </div>
            )}
            {canvasList.map(c => {
              const isLinked = c.id === linkedId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className="flex w-full items-center gap-2 rounded-[6px] px-2 py-[5px] text-left transition-all duration-150"
                  style={{
                    background: isLinked ? "rgba(77,184,154,0.08)" : "transparent",
                    border: isLinked ? "1px solid rgba(77,184,154,0.20)" : "1px solid transparent",
                  }}
                  onMouseEnter={e => {
                    if (!isLinked) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)";
                  }}
                  onMouseLeave={e => {
                    if (!isLinked) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  <span style={{ fontSize: 7, lineHeight: 1, color: isLinked ? "#4db89a" : "rgba(255,255,255,0.25)" }}>◈</span>
                  <span className="min-w-0 flex-1 truncate text-[11px]"
                    style={{ color: isLinked ? "#4db89a" : "rgba(255,255,255,0.60)" }}>
                    {c.title}
                  </span>
                  {isLinked && (
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none"
                      stroke="#4db89a" strokeWidth="1.6" strokeLinecap="round">
                      <path d="M2 6l3 3 5-5"/>
                    </svg>
                  )}
                </button>
              );
            })}
          </div>

          {/* Disconnect footer */}
          {linkedId && (
            <>
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0 8px" }} />
              <div className="p-1">
                <button
                  type="button"
                  onClick={onDisconnect}
                  className="flex w-full items-center gap-2 rounded-[6px] px-2 py-[5px] text-left transition-all duration-150"
                  style={{ color: "rgba(224,90,60,0.65)" }}
                  onMouseEnter={e => {
                    const b = e.currentTarget as HTMLButtonElement;
                    b.style.background = "rgba(224,90,60,0.08)";
                    b.style.color = "#e05a3c";
                  }}
                  onMouseLeave={e => {
                    const b = e.currentTarget as HTMLButtonElement;
                    b.style.background = "transparent";
                    b.style.color = "rgba(224,90,60,0.65)";
                  }}
                >
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none"
                    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M2 2l8 8M10 2l-8 8"/>
                  </svg>
                  <span className="text-[11px]">Bağlantıyı kes</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Verify TypeScript**

```bash
cd ide && npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 10: Commit**

```bash
git add ide/src/modules/v3/V3InputShell.tsx
git commit -m "feat(v3): canvas picker dropdown — replace toggle with multi-canvas selector + fix height drift"
```

---

## Task 3: CanvasPanelContent — Image preview in preview panels

**Files:**
- Modify: `ide/src/modules/canvas/CanvasPanelContent.tsx`

- [ ] **Step 1: Add `isImagePath` helper and update `CanvasPreview`**

Find the `CanvasPreview` function (currently around line 736). Add a helper directly above it:

```typescript
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "avif"]);

function isImagePath(p: string): boolean {
  return IMAGE_EXTS.has(p.split(".").pop()?.toLowerCase() ?? "");
}
```

Then inside `CanvasPreview`, add an image branch **before** the `return (<iframe .../>)` line (after the `if (!path)` block):

```typescript
  // Image preview — render <img> instead of iframe
  if (isImagePath(path)) {
    return (
      <div
        className="flex h-full w-full items-center justify-center overflow-hidden"
        style={{ background: "#080808" }}
      >
        <img
          src={localToAsset(path.replace(/\\/g, "/"))}
          alt={path.split(/[\\/]/).pop() ?? "image"}
          draggable={false}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
        />
      </div>
    );
  }
```

Also update the placeholder input hint from `"Absolute path to .html file..."` to `"Absolute path to file (html, png, jpg…)"`.

- [ ] **Step 2: Verify TypeScript**

```bash
cd ide && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add ide/src/modules/canvas/CanvasPanelContent.tsx
git commit -m "feat(canvas): image preview in preview panels — jpg/png/gif/webp/svg/avif"
```

---

## Task 4: FileBrowserPanel — Open images in preview panel

**Files:**
- Modify: `ide/src/modules/canvas/FileBrowserPanel.tsx`

- [ ] **Step 1: Add image extension set and update double-click handler**

At the top of the file, after the `fmtSize` function, add:

```typescript
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "avif"]);
```

Find the double-click branch inside `handleClick` (currently the `else` block when `clickTimer.current` is set). Replace the file-opening logic:

**Old:**
```typescript
} else {
  const path = `${cwd}\\${entry.name}`.replace(/\//g, "\\");
  const editorId = addPanel("editor", { x: panel.x + panel.width + 20, y: panel.y });
  updatePanel(editorId, { title: entry.name, meta: { path } });
}
```

**New:**
```typescript
} else {
  const path = `${cwd}\\${entry.name}`.replace(/\//g, "\\");
  const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTS.has(ext)) {
    const prevId = addPanel("preview", { x: panel.x + panel.width + 20, y: panel.y });
    updatePanel(prevId, { title: entry.name, meta: { path } });
  } else {
    const editorId = addPanel("editor", { x: panel.x + panel.width + 20, y: panel.y });
    updatePanel(editorId, { title: entry.name, meta: { path } });
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd ide && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add ide/src/modules/canvas/FileBrowserPanel.tsx
git commit -m "feat(filebrowser): double-click image files opens preview panel"
```

---

## Task 5: FileBrowserPanel — Sort toolbar + 3 view modes (list / small / large)

**Files:**
- Modify: `ide/src/modules/canvas/FileBrowserPanel.tsx`

- [ ] **Step 1: Add type definitions and state**

At the top of `FileBrowserPanel.tsx`, after the `IMAGE_EXTS` constant, add:

```typescript
type SortField = "name" | "size" | "type" | "date";
type SortDir   = "asc" | "desc";
type ViewMode  = "list" | "small" | "large";
```

Inside the `FileBrowserPanel` component, after the existing `useState` declarations, add:

```typescript
const [viewMode,   setViewMode]   = useState<ViewMode>(
  () => (panel.meta?.viewMode  as ViewMode  | undefined) ?? "list",
);
const [sortField,  setSortField]  = useState<SortField>(
  () => (panel.meta?.sortField as SortField | undefined) ?? "name",
);
const [sortDir,    setSortDir]    = useState<SortDir>(
  () => (panel.meta?.sortDir   as SortDir   | undefined) ?? "asc",
);
```

- [ ] **Step 2: Add sort logic and `sorted` memo**

After the `loadDir` useCallback and before the `useEffect` calls, add:

```typescript
const sorted = useMemo(() => {
  const arr = [...entries];
  arr.sort((a, b) => {
    // Dirs always first regardless of sort field
    if (a.kind === "dir" && b.kind !== "dir") return -1;
    if (b.kind === "dir" && a.kind !== "dir") return  1;

    let cmp = 0;
    switch (sortField) {
      case "name": cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" }); break;
      case "size": cmp = a.size - b.size; break;
      case "type": {
        const extA = a.name.split(".").pop()?.toLowerCase() ?? "";
        const extB = b.name.split(".").pop()?.toLowerCase() ?? "";
        cmp = extA.localeCompare(extB);
        break;
      }
      case "date": cmp = a.mtime - b.mtime; break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });
  return arr;
}, [entries, sortField, sortDir]);
```

Also add `useMemo` to the imports if not already there:
```typescript
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
```

- [ ] **Step 3: Persist view preferences to panel meta**

Add a `useEffect` that saves the three view-state values to `panel.meta` whenever they change:

```typescript
useEffect(() => {
  updatePanel(panel.id, {
    meta: { ...panel.meta, viewMode, sortField, sortDir },
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [viewMode, sortField, sortDir]);
```

- [ ] **Step 4: Add sort + view-mode toolbar**

Inside the JSX, **between** the breadcrumb bar `</div>` and the `{/* Body: sidebar + file list */}` comment, insert:

```tsx
{/* Toolbar: sort + view mode */}
<div
  className="flex shrink-0 items-center justify-between px-2 py-[3px]"
  style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
>
  {/* Sort buttons */}
  <div className="flex items-center gap-0.5">
    {(["name", "size", "type", "date"] as SortField[]).map(field => {
      const active = sortField === field;
      return (
        <button
          key={field}
          type="button"
          onClick={() => {
            if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
            else { setSortField(field); setSortDir("asc"); }
          }}
          className="flex items-center gap-0.5 rounded-[4px] px-1.5 py-0.5 transition-all duration-150"
          style={{
            fontSize: 8,
            fontFamily: "monospace",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            background: active ? "rgba(91,141,239,0.12)" : "transparent",
            color: active ? "#5b8def" : "rgba(255,255,255,0.28)",
            border: active ? "1px solid rgba(91,141,239,0.22)" : "1px solid transparent",
          }}
        >
          {field === "name" ? "Ad" : field === "size" ? "Boy" : field === "type" ? "Tür" : "Tarih"}
          {active && (
            <span style={{ fontSize: 7, lineHeight: 1 }}>
              {sortDir === "asc" ? "↑" : "↓"}
            </span>
          )}
        </button>
      );
    })}
  </div>

  {/* View mode buttons */}
  <div className="flex items-center gap-0.5">
    {([
      ["list",  "≡", "Liste"],
      ["small", "⊞", "Küçük simgeler"],
      ["large", "⊟", "Büyük simgeler"],
    ] as [ViewMode, string, string][]).map(([mode, icon, title]) => (
      <button
        key={mode}
        type="button"
        onClick={() => setViewMode(mode)}
        title={title}
        className="flex h-[18px] w-[18px] items-center justify-center rounded-[4px] transition-all duration-150"
        style={{
          fontSize: 10,
          background: viewMode === mode ? "rgba(255,255,255,0.10)" : "transparent",
          color: viewMode === mode ? "#c8c8d0" : "rgba(255,255,255,0.28)",
        }}
      >
        {icon}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 5: Replace file list with view-aware rendering**

Find the `{/* File list */}` section and replace the entire inner div (from `<div className="flex-1 overflow-y-auto p-1 no-scrollbar">` to its closing `</div>`) with:

```tsx
{/* File list — list / small-grid / large-grid */}
<div
  className={viewMode === "list"
    ? "flex-1 overflow-y-auto p-1 no-scrollbar"
    : "flex-1 overflow-y-auto p-1.5 no-scrollbar"}
  style={viewMode !== "list" ? {
    display: "grid",
    gridTemplateColumns: viewMode === "large" ? "1fr 1fr" : "1fr 1fr 1fr 1fr",
    gap: 4,
    alignContent: "start",
  } : undefined}
>
  {loading && (
    <div className="flex h-12 items-center justify-center font-mono text-[9px]"
      style={{ color: "rgba(255,255,255,0.18)", gridColumn: "1 / -1" }}>
      Loading…
    </div>
  )}
  {error && (
    <div className="px-2 py-1 text-[9px] text-red-400/70" style={{ gridColumn: "1 / -1" }}>{error}</div>
  )}
  {!loading && !error && sorted.length === 0 && (
    <div className="flex h-12 items-center justify-center font-mono text-[9px]"
      style={{ color: "rgba(255,255,255,0.18)", gridColumn: "1 / -1" }}>
      Empty
    </div>
  )}

  {/* LIST VIEW */}
  {!loading && viewMode === "list" && sorted.map((entry) => {
    const [glyph, color] = entryIcon(entry.name, entry.kind);
    const isSel = entry.name === selected;
    return (
      <button
        key={entry.name}
        onClick={() => handleClick(entry)}
        className="flex w-full items-center gap-1.5 rounded-[5px] px-2 py-[4px] text-left transition-all duration-150"
        style={{
          background: isSel ? "rgba(91,141,239,0.10)" : "transparent",
          color: isSel ? "#c8c8d0" : "rgba(255,255,255,0.45)",
        }}
        onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
        onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
      >
        <span className="w-[13px] shrink-0 text-center text-[10px] leading-none" style={{ color }}>
          {glyph}
        </span>
        <span className="min-w-0 flex-1 truncate text-[10.5px]">{entry.name}</span>
        {entry.kind === "file" && (
          <span className="shrink-0 font-mono text-[8px]" style={{ color: "rgba(255,255,255,0.18)" }}>
            {fmtSize(entry.size)}
          </span>
        )}
        {entry.kind === "dir" && (
          <span className="shrink-0 text-[9px]" style={{ color: "rgba(255,255,255,0.20)" }}>›</span>
        )}
      </button>
    );
  })}

  {/* GRID VIEW (small = 4 cols, large = 2 cols) */}
  {!loading && viewMode !== "list" && sorted.map((entry) => {
    const [glyph, color] = entryIcon(entry.name, entry.kind);
    const isSel = entry.name === selected;
    const iconSize = viewMode === "large" ? 28 : 18;
    return (
      <button
        key={entry.name}
        onClick={() => handleClick(entry)}
        className="flex flex-col items-center rounded-[6px] transition-all duration-150"
        style={{
          padding: viewMode === "large" ? "8px 4px 6px" : "5px 2px 4px",
          background: isSel ? "rgba(91,141,239,0.10)" : "transparent",
          gap: 3,
        }}
        onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
        onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
      >
        <span style={{ fontSize: iconSize, lineHeight: 1, color }}>{glyph}</span>
        <span
          className="w-full text-center leading-tight"
          style={{
            fontSize: viewMode === "large" ? 9 : 8,
            color: isSel ? "#c8c8d0" : "rgba(255,255,255,0.55)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" as const,
            overflow: "hidden",
            wordBreak: "break-all",
          }}
        >
          {entry.name}
        </span>
      </button>
    );
  })}
</div>
```

- [ ] **Step 6: Verify TypeScript**

```bash
cd ide && npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 7: Lint check**

```bash
cd ide && npm run lint 2>&1 | grep -v "warning"
```
Expected: no new errors (8 existing warnings are OK).

- [ ] **Step 8: Commit**

```bash
git add ide/src/modules/canvas/FileBrowserPanel.tsx
git commit -m "feat(filebrowser): sort toolbar + 3 view modes (list/small/large grid)"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Canvas picker ✓, height bug fix ✓, image preview (CanvasPreview + FileBrowser double-click) ✓, 3 view modes ✓, sort ✓
- [x] **Placeholder scan:** No TBDs, all code blocks complete
- [x] **Type consistency:** `SortField`/`SortDir`/`ViewMode` defined in Task 5 Step 1, used in Steps 2–5. `linkedCanvasId`/`canvasList`/`pickerOpen` defined in Task 2 Step 2, used throughout. `IMAGE_EXTS` defined in Task 3 and Task 4 independently (each file owns its own).
- [x] **Cross-window IPC:** `CanvasAppShell` handles `atlas:request-canvases` and `atlas:canvas-switch` (Task 1); `V3InputShell` emits both and listens for `atlas:canvas-list` (Task 2). Events match.
