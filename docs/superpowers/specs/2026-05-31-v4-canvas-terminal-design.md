# v4 Canvas + Terminal — Design Spec

**Date:** 2026-05-31  
**Status:** Approved  
**Location:** `prototypes/v4/`

---

## Goal

Standalone pure-web prototype that isolates the Sentor 3D canvas and terminal into a minimal IDE shell. The primary use: test "AI agent runtime UI" patterns — writing React projects via OpenCode in the terminal while the canvas serves as the visual workspace.

---

## Architecture

```
prototypes/v4/
  index.html
  vite.config.ts
  package.json
  tsconfig.json
  src/
    main.tsx
    App.tsx                  ← root: Canvas (left) + Terminal (right), resizable splitter
    canvas/                  ← copied from ide/src/modules/v3-canvas/
      V3InfiniteCanvas.tsx
      V3CanvasNode.tsx
      V3WireLayer.tsx
      V3MiniMap.tsx
      V3NodePalette.tsx
      V3CanvasTopBar.tsx
      V3CanvasBgPanel.tsx
    terminal/                ← copied from ide/src/modules/terminal/
      TerminalPane.tsx
      useTerminal.ts
    panels/                  ← canvas node content components (v4-specific subset)
      ChatPanel.tsx          ← wraps inference-sh agent component
      ToolPanel.tsx          ← wraps inference-sh tools component
      NotePanel.tsx
      VariablePanel.tsx
      TerminalPanel.tsx      ← xterm inside a canvas node
    store/
      canvasStore.ts         ← copied from ide/src/
      variableStore.ts       ← copied from ide/src/
    types.ts                 ← PanelType union + Connection + CanvasPanelNode
    styles/
      globals.css            ← Sentor design tokens
```

---

## Layout

Two-pane split, no other chrome:

```
┌─────────────────────────────────┬──────────────┐
│                                 │              │
│         3D Canvas               │   Terminal   │
│   (Three.js bg, nodes, wires)   │  (xterm.js)  │
│                                 │              │
└─────────────────────────────────┴──────────────┘
                                  ↑ draggable splitter (default: canvas 65%, terminal 35%)
```

No header, sidebar, tabs, settings, vault, editor, or browser panels.

---

## Canvas Node Types

| PanelType  | Description |
|------------|-------------|
| `terminal` | xterm.js — OpenCode runs here |
| `chat`     | inference-sh `agent` component — chat UI node |
| `tool`     | inference-sh `tools` component — tool call display |
| `note`     | Plain text note |
| `variable` | Named value, wire-passable |

---

## Wire System

Carried over from Sentor unchanged:

- `"data"` (blue) — explicit value wire
- `"context"` (purple) — silent context, prepended to prompts
- `"trigger"` (green) — execution signal only
- Per-wire `charLimit` (default 4000)
- Port definitions in `types.ts` (`PORT_DEFS` per PanelType)

Canvas run engine (ForEach, Gate, IfElse) is **not included** — manual node placement and wiring only.

---

## inference-sh Integration

Install agent UI components from the inference-sh shadcn registry:

```bash
npx shadcn add https://inference.sh/r/agent.json
```

`ChatPanel` and `ToolPanel` wrap these components. OpenCode output flows terminal → variable node → chat node via context wire.

---

## Stack

| Package | Purpose |
|---------|---------|
| `vite` + `react` + `typescript` | Build + framework |
| `three` + `@react-three/fiber` | 3D canvas background (Three.js grid + bloom) |
| `zustand` | Canvas + variable state |
| `xterm` + `xterm-addon-fit` | Terminal emulator |
| `@tauri-apps/api` | PTY invoke (no-op in browser, active in Tauri) |
| `tailwindcss` + `tw-animate-css` | Styling |

---

## Design System

Sentor tokens — no deviations:

- `bg-base` #0a0a0a, `bg-surface` #111111, `bg-elevated` #1a1a1a
- `accent` #5b8def, `text-primary` #f5f5f5, `text-secondary` #888888
- `border-subtle` #2a2a2a, `border-active` #404040
- `system-ui` font, 150ms ease-out transitions, border-only depth (no box-shadow)
- Glass node cards: `rgba(255,255,255,0.05)` bg / `rgba(255,255,255,0.07)` border

---

## Terminal PTY Behavior

- In **Tauri**: PTY bridge via `@tauri-apps/api` invoke — full shell, OpenCode runs here
- In **browser** (dev): xterm renders read-only / mock input; PTY calls are no-ops
- This is acceptable for a prototype

---

## What Is Explicitly Excluded

Agent system, vault, forum, editor, browser pane, settings window, MCP bridge, tab management, AI SDK, Sentor integration, canvas run engine (ForEach/Gate/IfElse), multi-canvas navigation.
