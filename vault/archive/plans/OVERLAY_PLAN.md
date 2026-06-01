# Sentor — v0.2 Focused Overlay Mode: Completion Plan

## What is "Focused" mode?

A transparent, always-on-top window that floats over the Windows desktop.
The desktop is visible through the empty space. Only a 148px bottom bar is
opaque: a mini terminal strip on the left and the Sentor chat input on the right.
When chatting, the AiMiniWindow balloon appears floating above the bar on the right.

## Current state (what is already done)

| Item | File | Status |
|------|------|--------|
| `layoutMode: "classic" \| "focused"` preference | `ide/src/modules/settings/store.ts` | ✅ Done |
| Layout selector in Settings → General | `ide/src/settings/sections/GeneralSection.tsx` | ✅ Done |
| `transparent: true` in Tauri window | `ide/src-tauri/tauri.conf.json` | ✅ Done |
| `setAlwaysOnTop` on mode change | `ide/src/app/App.tsx` | ✅ Done |
| Transparent root div in focused mode | `ide/src/app/App.tsx` | ✅ Done |
| Header + StatusBar hidden in focused mode | `ide/src/app/App.tsx` | ✅ Done |
| FocusedBar component (bottom bar) | `ide/src/app/FocusedChatCenter.tsx` | ✅ Done |
| Mini terminal strip inside bar | `ide/src/app/FocusedChatCenter.tsx` | ✅ Done |

---

## Gaps (blocking — must fix)

### G1 — No drag handle on the bar

**Problem:** `data-tauri-drag-region` is on the Header, which is hidden in focused mode.
The bottom bar has no draggable area — the user cannot reposition the window.

**Fix:** Add `data-tauri-drag-region` to the logo row `div` inside `FocusedBar`.

**File:** `ide/src/app/FocusedChatCenter.tsx`
```tsx
// Change this line in FocusedBar:
<div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/40 px-3">
// To:
<div data-tauri-drag-region className="flex h-8 shrink-0 items-center gap-2 border-b border-border/40 px-3">
```

---

### G2 — Settings are unreachable after an API key is configured

**Problem:** The only `onOpenSettings` call in `FocusedBar` goes to `AiInputBarConnect`,
which only renders when there is NO API key. Once a key is configured that component
is gone — the user is locked out of Settings.

**Fix:** Add a gear icon button to the logo row of `FocusedBar` that always calls
`onOpenSettings()`.

**File:** `ide/src/app/FocusedChatCenter.tsx`
- Import `Settings01Icon` from `@hugeicons/core-free-icons`
- Add a small ghost icon button next to `AgentSwitcher` in the logo row

---

### G3 — No way to open the AiMiniWindow chat balloon in focused mode

**Problem:** Two issues:
1. `AiMiniWindow` is conditionally suppressed when `layoutMode === "focused"` (App.tsx line ~1003)
2. `openMini` was only called from `StatusBar`, which is hidden in focused mode

**Fix A — Remove the layoutMode guard** so `AiMiniWindow` renders in both modes:
```tsx
// App.tsx — change:
{miniOpen && hasComposer && layoutMode === "classic" ? <AiMiniWindow key="ai-mini" /> : null}
// To:
{miniOpen && hasComposer ? <AiMiniWindow key="ai-mini" /> : null}
```

**Fix B — Adjust bottom offset** so the balloon appears above the bar, not behind it.
`AiMiniWindow` is positioned `fixed right-4 bottom-24` (96px). The bar is 148px.
The balloon needs `bottom-[160px]` in focused mode.

Add an optional `className` prop to `AiMiniWindow`:
```tsx
// AiMiniWindow.tsx — change signature:
export function AiMiniWindow({ className }: { className?: string } = {}) {
  ...
  <motion.div className={cn("... fixed right-4 bottom-24 ...", className)}>
```

Pass it from App.tsx:
```tsx
<AiMiniWindow
  key="ai-mini"
  className={layoutMode === "focused" ? "bottom-[160px]" : undefined}
/>
```

**Fix C — Add a chat icon button** to the `FocusedBar` logo row that calls `onOpenChat`.
Wire `onOpenChat={openMini}` from App.tsx through `FocusedBar` props.

---

### G4 — No keyboard shortcut to toggle focused mode

**Problem:** If the user is in focused mode with no gear button, they have no way out.
Even with a gear button, a keyboard shortcut is essential.

**Fix:** Add `"layout.toggleFocused"` to the shortcut registry with default `Ctrl+Alt+F`.
(Note: `Ctrl+Shift+F` conflicts with `explorer.search` on Windows — `MOD_PROP` = `ctrl` there.)

**File:** `ide/src/modules/shortcuts/shortcuts.ts`
```ts
// Add to SHORTCUTS map:
"layout.toggleFocused": {
  defaultBinding: [{ key: "f", ctrl: true, alt: true }],
  label: "Toggle focused overlay mode",
}
```

**File:** `ide/src/app/App.tsx` — wire in `shortcutHandlers`:
```ts
"layout.toggleFocused": () =>
  void setLayoutMode(layoutMode === "focused" ? "classic" : "focused"),
```

Import `setLayoutMode` from `@/modules/settings/store` (already imported for `store.ts`).

---

## Nice-to-have improvements

### G5 — Window auto-resize when switching to focused mode

When the user switches to focused mode, resize the Tauri window to a thin bar
(full monitor width × ~180px) positioned at the bottom of the screen.
Restore a sensible size when switching back to classic.

Extend the existing `setAlwaysOnTop` useEffect in `App.tsx`:

```ts
useEffect(() => {
  import("@tauri-apps/api/window").then(async ({ getCurrentWindow, currentMonitor }) => {
    const win = getCurrentWindow();
    if (layoutMode === "focused") {
      await win.setAlwaysOnTop(true);
      const monitor = await currentMonitor();
      if (monitor) {
        const { width, height } = monitor.size;
        const sf = monitor.scaleFactor;
        const barH = Math.round(180 * sf);
        await win.setSize({ type: "Physical", width, height: barH });
        await win.setPosition({ type: "Physical", x: 0, y: height - barH });
      }
    } else {
      await win.setAlwaysOnTop(false);
      // Restore to IDE default size
      await win.setSize({ type: "Logical", width: 1280, height: 800 });
    }
  }).catch(() => undefined);
}, [layoutMode]);
```

### G6 — Auto-open chat balloon when first message is sent in focused mode

Watch the chat session message count. When in focused mode and a new outbound message
arrives, call `openMini()` automatically so the user sees the response.

```ts
// App.tsx — add near other useChatStore selectors:
const msgCount = useChatStore((s) => {
  const session = s.sessions.find((x) => x.id === s.activeSessionId);
  return session?.messageCount ?? 0;
});

useEffect(() => {
  if (layoutMode === "focused" && !miniOpen && msgCount > 0) {
    openMini();
  }
}, [msgCount, layoutMode]);
```

---

## Files to change

| File | Changes |
|------|---------|
| `ide/src/app/FocusedChatCenter.tsx` | Add `data-tauri-drag-region` (G1); add gear icon button (G2); add chat icon button + `onOpenChat` prop (G3) |
| `ide/src/modules/ai/components/AiMiniWindow.tsx` | Accept optional `className` prop for bottom offset (G3-B) |
| `ide/src/app/App.tsx` | Remove `layoutMode === "classic"` guard from AiMiniWindow (G3-A); pass `className` prop (G3-B); wire `onOpenChat`/`onOpenSettings` to FocusedBar (G2/G3); add shortcut handler (G4); extend resize effect (G5); auto-open balloon (G6) |
| `ide/src/modules/shortcuts/shortcuts.ts` | Add `"layout.toggleFocused"` shortcut ID (G4) |

---

## Execution order

```
G1 (drag) → G2 (settings icon) → G4 (shortcut) → G3 (chat balloon) → G5 (resize) → G6 (auto-open)
```

G1, G2, G4 are each a few lines. G3 is the most involved (3 sub-fixes across 2 files).
G5 and G6 are additive improvements that don't block the others.

---

## Acceptance checklist

- [ ] Switch to Focused mode → window transparent, always-on-top, bottom bar visible
- [ ] Drag the logo row → window repositions correctly (G1)
- [ ] Click gear icon → Settings window opens (G2)
- [ ] Press `Ctrl+Alt+F` → switches back to Classic mode (G4)
- [ ] Click chat icon in bar → AiMiniWindow appears above bar, not overlapping it (G3)
- [ ] Submit a message from the bar → balloon auto-opens with the response (G6)
- [ ] Switch to Focused → window resizes to thin bar at bottom of screen (G5)
- [ ] `npx tsc --noEmit` → zero errors
