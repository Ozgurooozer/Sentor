# Canvas Node System — Technical Plan

This document details the node canvas system, inspired by Unreal Engine Blueprints and ComfyUI-style workflows. **Status: Completed (Phase N1-N3)**.

**Status: Completed (Phase N1-N3, Phase G canvas transition).**

---

## Overview

The infinite canvas contains data flow nodes. Each panel is a live node — Terminal outputs last 80 lines, Editor outputs file content, Chat aggregates upstream inputs. Wires carry data (text, image, JSON) between nodes. Chat context is built from all connected upstream nodes automatically.

```
┌─────────────────┐         ┌──────────────────┐
│  Terminal Node  │         │  Chat/Agent Node  │
│                 │         │                   │
│  ●━━━━━━━━━━━●  │  data   │  ctx: ■ Terminal  │
│  last 80 lines  │  wire   │   ■ Editor        │
│  $ npm build    │         │                   │
└─────────────────┘         └──────────────────┘
        ●                              ●
   output pin                     input pin (multi)
```

---

## Node Types

### Core Panel Types

- **Terminal** — PTY terminal, outputs last 80 lines every 3s
- **Editor** — CodeMirror, outputs file content (1.5s debounce)
- **Chat** — AI agent, aggregates all upstream input as context
- **Input** — User text/image/file, outputs raw content
- **Web** — Native WebView, outputs URL + title on navigation
- **Vault** — Vault page iframe, outputs page text
- **Gallery** — Image grid, outputs selected image as base64

### Organization Types

- **Header** — Titled section organizer, 6-color selector, no wires
- **Checklist** — Task list, outputs incomplete items as text

### Advanced Types

- **Agent** — Spawn named agent in sub-canvas, bidirectional tool calls
- **SubCanvas** — Nested canvas reference, input/output ports
- **Pipeline** — ComfyUI-style workflow node
- **Codegraph** — Code structure visualization

---

## Data Flow

### Terminal Node
```
Update: 3s polling interval
Output: {kind:"text", value: "last 80 lines (~4000 chars max)"}
```

### Editor Node
```
Update: 1.5s debounce on edit
Output: {kind:"text", value: "file content (4000 chars max)"}
```

### Chat Node
Aggregates all incoming wires:

```
<connected-context>
[⬛ Terminal · bash]
npm run build
> compiled 42 modules

---

[◈ Editor · server.py]
from http.server import HTTPServer...

</connected-context>

[user message here]
```

---

## Wire System

### Wire Types

| Type | Color | Use | Auto-inject |
|---|---|---|---|
| `data` | blue | Panel → Chat | Once per message |
| `context` | purple | Panel → Chat | Every message (silent) |
| `trigger` | green | Chat → Terminal | On send (execute command) |

### Per-Wire Settings

- **Char limit:** Default 4000, per-wire configurable (N3 feature)
- **Snapshot:** Freeze output at moment of creation (N3 feature)

---

## Import/Export

### Blueprint Format

```json
{
  "$schema": "atlas-blueprint-v1",
  "slug": "research-agent",
  "name": "Web Research Pipeline",
  "version": 1,
  "nodes": [
    {
      "id": "n1",
      "type": "input",
      "position": { "x": 100, "y": 50 },
      "data": { "type": "input" },
      "inputs": [],
      "outputs": [{"id": "out", "label": "text", "dataType": "text"}]
    },
    ...
  ],
  "edges": [
    {"from": "n1.out", "to": "n2.in", "kind": "data"}
  ],
  "created": "2026-05-19T...",
  "author": "user"
}
```

**Storage:** `vault/blueprints/{slug}/blueprint.json`

**Import:** Sağ tık → Blueprint İmport → vault tarama → seç → nodes + edges spawn at viewport center.

---

## Visual Design

### Colors (by node type)

```css
--node-terminal:  #4db89a  /* green */
--node-editor:    #9b72ef  /* purple */
--node-chat:      #5b8def  /* blue */
--node-input:     #d4a843  /* yellow */
--node-web:       #666666  /* gray */
--node-header:    custom   /* user selectable 6-color palette */
```

### Effects

- **Glow:** `box-shadow: 0 0 12px {color}20` (20% opacity)
- **Border:** `1.5px solid {color}`, seçiliyse `2px`
- **Wire:** `1.5px stroke`, bezier curve
- **Port dots:** `6px` circle, hub-and-spoke on panel edge

---

## Keyboard Shortcuts

- **Cmd+K:** Add panel palette (fuzzy search)
- **Del:** Remove selected node
- **D:** Duplicate selected node
- **Ctrl+S:** Save blueprint
- **Double-click wire midpoint:** Delete wire

---

## Performance Notes

- **Terminal polling:** 3s interval (not 1s; CPU waste otherwise)
- **Editor debounce:** 1.5s (balance responsiveness vs frequent updates)
- **Wire render:** Bezier curve cached, only re-render on connection change
- **Sub-canvas:** Lazy-load on first expansion, singleton per blueprintSlug
