# v4 Canvas + Terminal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap `prototypes/v4/` as a standalone Vite+React app with Sentor 3D canvas and terminal — stripped of all IDE cruft, browser-ready.

**Architecture:** Copy v3-canvas + terminal modules from `ide/src/`, replace all Tauri plugin imports with thin browser-safe shims, add a two-pane split layout (canvas left, terminal right), and wire in v4-specific panel content components.

**Tech Stack:** Vite 6, React 18, TypeScript, Three.js, Zustand 5, @xterm/xterm 6, @tauri-apps/api 2 (canvas node for PTY, no-op in browser), Tailwind CSS 4

---

## File Map

### Created
| File | Responsibility |
|---|---|
| `prototypes/v4/index.html` | Entry HTML |
| `prototypes/v4/package.json` | Dependencies |
| `prototypes/v4/tsconfig.json` | TypeScript config |
| `prototypes/v4/vite.config.ts` | Vite config with `@` alias |
| `prototypes/v4/src/main.tsx` | React root mount |
| `prototypes/v4/src/App.tsx` | Split layout: canvas 65% + terminal 35% |
| `prototypes/v4/src/shims/tauri.ts` | Browser-safe no-op replacements for Tauri APIs |
| `prototypes/v4/src/shims/store.ts` | `LazyStore` shim using `localStorage` |
| `prototypes/v4/src/hooks/useTheme.ts` | Returns `"dark"` always (no theme switching in v4) |
| `prototypes/v4/src/canvas/` | Copied + patched v3-canvas module |
| `prototypes/v4/src/terminal/` | Copied + patched terminal module |
| `prototypes/v4/src/store/canvasStore.ts` | Copied + patched (shim imports) |
| `prototypes/v4/src/store/variableStore.ts` | Copied + patched (shim imports) |
| `prototypes/v4/src/store/types.ts` | v4 PanelType subset + Connection + CanvasPanelNode |
| `prototypes/v4/src/store/portDefs.ts` | Port definitions for v4 panel types |
| `prototypes/v4/src/store/useWireData.ts` | Incoming wire data hook |
| `prototypes/v4/src/panels/NotePanel.tsx` | Plain text note node content |
| `prototypes/v4/src/panels/VariablePanel.tsx` | Named variable node content |
| `prototypes/v4/src/panels/TerminalPanel.tsx` | xterm inside a canvas node |
| `prototypes/v4/src/panels/ChatPanel.tsx` | Placeholder for inference-sh agent component |
| `prototypes/v4/src/panels/ToolPanel.tsx` | Placeholder for inference-sh tools component |
| `prototypes/v4/src/panels/PanelContent.tsx` | Switch: PanelType → panel component |
| `prototypes/v4/src/styles/globals.css` | Sentor design tokens |

---

## Task 1: Project scaffold

**Files:**
- Create: `prototypes/v4/package.json`
- Create: `prototypes/v4/tsconfig.json`
- Create: `prototypes/v4/vite.config.ts`
- Create: `prototypes/v4/index.html`

- [ ] **Step 1: Create `prototypes/v4/package.json`**

```json
{
  "name": "sentor-v4",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-store": "^2",
    "@xterm/addon-fit": "^0.11.0",
    "@xterm/addon-webgl": "^0.19.0",
    "@xterm/xterm": "^6.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "three": "^0.184.0",
    "zustand": "^5.0.12"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.2.3",
    "@types/react": "^18.3.1",
    "@types/react-dom": "^18.3.1",
    "@types/three": "^0.184.1",
    "@vitejs/plugin-react": "^4.3.4",
    "tailwindcss": "^4.2.3",
    "typescript": "^5.7.2",
    "vite": "^6.3.5"
  }
}
```

- [ ] **Step 2: Create `prototypes/v4/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `prototypes/v4/vite.config.ts`**

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: { port: 5174 },
});
```

- [ ] **Step 4: Create `prototypes/v4/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sentor v4</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Install dependencies**

```bash
cd prototypes/v4
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Commit**

```bash
git add prototypes/v4/package.json prototypes/v4/tsconfig.json prototypes/v4/vite.config.ts prototypes/v4/index.html prototypes/v4/package-lock.json
git commit -m "feat(v4): project scaffold"
```

---

## Task 2: Tauri browser shims

Tauri APIs (`invoke`, `emitTo`, `listen`, `LazyStore`) crash in a plain browser. These shims make copied code run without modification.

**Files:**
- Create: `prototypes/v4/src/shims/tauri.ts`
- Create: `prototypes/v4/src/shims/store.ts`

- [ ] **Step 1: Create `prototypes/v4/src/shims/tauri.ts`**

```ts
// No-op shims for Tauri APIs when running in a browser.
export const invoke = async (_cmd: string, _args?: unknown): Promise<unknown> => null;
export const emitTo = async (_target: string, _event: string, _payload?: unknown): Promise<void> => {};
export const emit = async (_event: string, _payload?: unknown): Promise<void> => {};
export const listen = async (_event: string, _handler: unknown): Promise<() => void> => () => {};
```

- [ ] **Step 2: Create `prototypes/v4/src/shims/store.ts`**

```ts
// localStorage-backed shim matching the @tauri-apps/plugin-store LazyStore API.
export class LazyStore {
  private key: string;
  private data: Record<string, unknown> = {};

  constructor(filename: string) {
    this.key = `sentor-v4:${filename}`;
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) this.data = JSON.parse(raw);
    } catch {}
  }

  async get<T>(k: string): Promise<T | undefined> {
    return this.data[k] as T | undefined;
  }

  async set(k: string, v: unknown): Promise<void> {
    this.data[k] = v;
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch {}
  }

  async save(): Promise<void> {}
}
```

- [ ] **Step 3: Commit**

```bash
git add prototypes/v4/src/shims/
git commit -m "feat(v4): tauri browser shims"
```

---

## Task 3: Design tokens + useTheme

**Files:**
- Create: `prototypes/v4/src/styles/globals.css`
- Create: `prototypes/v4/src/hooks/useTheme.ts`

- [ ] **Step 1: Create `prototypes/v4/src/styles/globals.css`**

```css
@import "tailwindcss";

:root {
  --bg-base: #0a0a0a;
  --bg-surface: #111111;
  --bg-elevated: #1a1a1a;
  --bg-overlay: #222222;
  --border-subtle: #2a2a2a;
  --border-active: #404040;
  --text-primary: #f5f5f5;
  --text-secondary: #888888;
  --text-tertiary: #555555;
  --accent: #5b8def;
  --accent-hover: #4a7de0;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: system-ui, sans-serif;
  overflow: hidden;
  height: 100vh;
  width: 100vw;
}

#root { width: 100%; height: 100%; }
```

- [ ] **Step 2: Create `prototypes/v4/src/hooks/useTheme.ts`**

```ts
export function useTheme() {
  return { resolvedTheme: "dark" as const, theme: "dark" as const };
}
```

- [ ] **Step 3: Commit**

```bash
git add prototypes/v4/src/styles/ prototypes/v4/src/hooks/
git commit -m "feat(v4): design tokens and useTheme stub"
```

---

## Task 4: Copy and patch store files

Copy canvas types, portDefs, stores from `ide/src/modules/canvas/` and replace Tauri imports with shims.

**Files:**
- Create: `prototypes/v4/src/store/types.ts`
- Create: `prototypes/v4/src/store/portDefs.ts`
- Create: `prototypes/v4/src/store/useWireData.ts`
- Create: `prototypes/v4/src/store/canvasStore.ts`
- Create: `prototypes/v4/src/store/variableStore.ts`

- [ ] **Step 1: Copy `types.ts` — v4 subset**

Create `prototypes/v4/src/store/types.ts`:

```ts
export type PanelType = "terminal" | "chat" | "tool" | "note" | "variable";

export type PortSide = "top" | "right" | "bottom" | "left";
export type ConnectionKind = "data" | "context" | "trigger";
export type WireData = { kind: "text" | "image" | "json"; value: unknown };

export interface WireBlock {
  connectionId: string;
  fromPanelId: string;
  fromPortId: string | undefined;
  kind: ConnectionKind;
  data: WireData | null;
  charLimit: number;
}

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface CanvasPanelNode {
  id: string;
  type: PanelType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  title: string;
  meta: Record<string, unknown>;
  status?: "idle" | "running" | "error" | "done";
}

export interface Connection {
  id: string;
  fromPanel: string;
  fromSide: PortSide;
  fromPort?: string;
  toPanel: string;
  toSide: PortSide;
  toPort?: string;
  kind: ConnectionKind;
  charLimit?: number;
}
```

- [ ] **Step 2: Copy `portDefs.ts` — v4 subset**

Create `prototypes/v4/src/store/portDefs.ts`:

```ts
import type { PanelType, ConnectionKind, PortSide } from "./types";

export type PortDataType = "text" | "image" | "json" | "trigger" | "any";

export interface NamedPort {
  id: string;
  label: string;
  kind: ConnectionKind;
  dataType: PortDataType;
}

export interface PanelPorts {
  inputs: NamedPort[];
  outputs: NamedPort[];
}

const p = (id: string, label: string, kind: ConnectionKind, dataType: PortDataType): NamedPort =>
  ({ id, label, kind, dataType });

const text = (id: string, label: string, kind: ConnectionKind = "context") => p(id, label, kind, "text");
const trig = (id: string, label: string) => p(id, label, "trigger", "trigger");
const any  = (id: string, label: string, kind: ConnectionKind = "data") => p(id, label, kind, "any");

export const PORT_DEFS: Partial<Record<PanelType, PanelPorts>> = {
  terminal: { inputs: [text("cmd", "cmd", "data"), trig("trigger", "run")], outputs: [text("stdout", "stdout", "data")] },
  chat:     { inputs: [text("context", "context"), any("data", "data", "data"), trig("trigger", "trigger")], outputs: [text("response", "response", "data")] },
  tool:     { inputs: [any("input", "input")], outputs: [any("output", "output")] },
  note:     { inputs: [], outputs: [text("text", "text")] },
  variable: { inputs: [any("value", "value", "data")], outputs: [any("value", "value")] },
};

export function namedPortPoint(
  node: { x: number; y: number; width: number; height: number },
  side: PortSide,
  portId: string | undefined,
  ports: NamedPort[],
): { x: number; y: number } {
  const count = ports.length;
  const idx = portId ? ports.findIndex((p) => p.id === portId) : 0;
  const safeIdx = Math.max(0, idx);
  const frac = count <= 1 ? 0.5 : (safeIdx + 1) / (count + 1);

  if (side === "left")   return { x: node.x,              y: node.y + node.height * frac };
  if (side === "right")  return { x: node.x + node.width, y: node.y + node.height * frac };
  if (side === "top")    return { x: node.x + node.width * frac, y: node.y };
  return                        { x: node.x + node.width * frac, y: node.y + node.height };
}
```

- [ ] **Step 3: Copy `useWireData.ts`**

Create `prototypes/v4/src/store/useWireData.ts`:

```ts
import { useMemo } from "react";
import { useCanvasStore } from "./canvasStore";
import type { WireBlock, WireData } from "./types";

export type { WireBlock, WireData };

const DEFAULT_CHAR_LIMIT = 4000;

export function useAllIncomingWireData(panelId: string): WireBlock[] {
  const connections = useCanvasStore((s) => s.connections);
  const panels = useCanvasStore((s) => s.panels);

  const panelMap = useMemo(
    () => new Map(panels.map((p) => [p.id, p])),
    [panels],
  );

  return useMemo(
    () =>
      connections
        .filter((c) => c.toPanel === panelId && c.kind !== "trigger")
        .map((c) => {
          const src = panelMap.get(c.fromPanel);
          const rawData = src
            ? (c.fromPort
                ? (src.meta.portOutputData as Record<string, WireData> | undefined)?.[c.fromPort]
                : (src.meta.outputData as WireData | undefined))
            : null;

          let data: WireData | null = rawData ?? null;
          const lim = c.charLimit ?? DEFAULT_CHAR_LIMIT;

          if (data && typeof data.value === "string" && data.value.length > lim) {
            data = { ...data, value: data.value.slice(-lim) };
          } else if (data && typeof data.value !== "string") {
            const s = JSON.stringify(data.value) ?? "";
            if (s.length > lim) data = { kind: "text", value: s.slice(-lim) };
          }

          return {
            connectionId: c.id,
            fromPanelId: c.fromPanel,
            fromPortId: c.fromPort,
            kind: c.kind,
            data,
            charLimit: lim,
          } satisfies WireBlock;
        }),
    [connections, panelMap, panelId],
  );
}
```

- [ ] **Step 4: Create `canvasStore.ts` with shim imports**

Create `prototypes/v4/src/store/canvasStore.ts`:

```ts
import { create } from "zustand";
import { LazyStore } from "@/shims/store";
import type { CanvasPanelNode, Connection, Viewport, PanelType, WireData } from "./types";

const uid = () => crypto.randomUUID();

const _persist = new LazyStore("sentor-v4-canvas.json");
const PERSIST_KEY = "state";

interface PersistedCanvas {
  panels: CanvasPanelNode[];
  connections: Connection[];
  viewport: Viewport;
  nextZ: number;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(s: PersistedCanvas) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { _persist.set(PERSIST_KEY, s).catch(() => {}); }, 200);
}

interface CanvasState {
  panels: CanvasPanelNode[];
  connections: Connection[];
  viewport: Viewport;
  nextZ: number;
  hydrated: boolean;
  selectedIds: string[];
}

interface CanvasActions {
  hydrate(): Promise<void>;
  addPanel(type: PanelType, overrides?: Partial<CanvasPanelNode>): string;
  removePanel(id: string): void;
  updatePanel(id: string, patch: Partial<CanvasPanelNode>): void;
  setMeta(id: string, patch: Record<string, unknown>): void;
  setOutputData(id: string, data: WireData): void;
  addConnection(c: Omit<Connection, "id">): void;
  removeConnection(id: string): void;
  setViewport(v: Viewport): void;
  setSelected(ids: string[]): void;
  clearCanvas(): void;
}

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 };

export const useCanvasStore = create<CanvasState & CanvasActions>((set, get) => ({
  panels: [],
  connections: [],
  viewport: DEFAULT_VIEWPORT,
  nextZ: 1,
  hydrated: false,
  selectedIds: [],

  async hydrate() {
    const saved = await _persist.get<PersistedCanvas>(PERSIST_KEY);
    if (saved) {
      set({ panels: saved.panels ?? [], connections: saved.connections ?? [], viewport: saved.viewport ?? DEFAULT_VIEWPORT, nextZ: saved.nextZ ?? 1 });
    }
    set({ hydrated: true });
  },

  addPanel(type, overrides = {}) {
    const id = uid();
    const { nextZ, panels, connections, viewport } = get();
    const panel: CanvasPanelNode = {
      id, type, x: 100, y: 100, width: 320, height: 240,
      zIndex: nextZ, title: type, meta: {}, ...overrides,
    };
    const next = { panels: [...panels, panel], nextZ: nextZ + 1 };
    set(next);
    schedulePersist({ ...next, connections, viewport, nextZ: nextZ + 1 });
    return id;
  },

  removePanel(id) {
    const { panels, connections, viewport, nextZ } = get();
    const next = { panels: panels.filter((p) => p.id !== id), connections: connections.filter((c) => c.fromPanel !== id && c.toPanel !== id) };
    set(next);
    schedulePersist({ ...next, viewport, nextZ });
  },

  updatePanel(id, patch) {
    const { panels, connections, viewport, nextZ } = get();
    const next = { panels: panels.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
    set(next);
    schedulePersist({ ...next, connections, viewport, nextZ });
  },

  setMeta(id, patch) {
    const { panels } = get();
    get().updatePanel(id, { meta: { ...(panels.find((p) => p.id === id)?.meta ?? {}), ...patch } });
  },

  setOutputData(id, data) {
    get().setMeta(id, { outputData: data });
  },

  addConnection(c) {
    const { connections, panels, viewport, nextZ } = get();
    const conn: Connection = { ...c, id: uid() };
    const next = { connections: [...connections, conn] };
    set(next);
    schedulePersist({ panels, ...next, viewport, nextZ });
  },

  removeConnection(id) {
    const { connections, panels, viewport, nextZ } = get();
    const next = { connections: connections.filter((c) => c.id !== id) };
    set(next);
    schedulePersist({ panels, ...next, viewport, nextZ });
  },

  setViewport(v) {
    set({ viewport: v });
    const { panels, connections, nextZ } = get();
    schedulePersist({ panels, connections, viewport: v, nextZ });
  },

  setSelected(ids) { set({ selectedIds: ids }); },

  clearCanvas() {
    const { viewport } = get();
    set({ panels: [], connections: [], nextZ: 1, selectedIds: [] });
    schedulePersist({ panels: [], connections: [], viewport, nextZ: 1 });
  },
}));
```

- [ ] **Step 5: Create `variableStore.ts` with shim imports**

Create `prototypes/v4/src/store/variableStore.ts`:

```ts
import { create } from "zustand";
import { LazyStore } from "@/shims/store";

export interface VariableRecord {
  id: string;
  name: string;
  value: unknown;
  dataType: "text" | "json" | "number" | "any";
  updatedAt: number;
}

interface VariableState {
  variables: VariableRecord[];
  hydrated: boolean;
  setVariable(name: string, value: unknown, dataType?: VariableRecord["dataType"]): void;
  getVariable(name: string): VariableRecord | undefined;
  removeVariable(name: string): void;
  listVariables(): VariableRecord[];
  hydrate(): Promise<void>;
}

const _store = new LazyStore("sentor-v4-variables.json");
const uid = () => crypto.randomUUID();

export const useVariableStore = create<VariableState>((set, get) => ({
  variables: [],
  hydrated: false,

  async hydrate() {
    const saved = await _store.get<VariableRecord[]>("variables");
    if (saved) set({ variables: saved });
    set({ hydrated: true });
  },

  setVariable(name, value, dataType = "any") {
    const { variables } = get();
    const existing = variables.find((v) => v.name === name);
    let next: VariableRecord[];
    if (existing) {
      next = variables.map((v) => v.name === name ? { ...v, value, dataType, updatedAt: Date.now() } : v);
    } else {
      next = [...variables, { id: uid(), name, value, dataType, updatedAt: Date.now() }];
    }
    set({ variables: next });
    _store.set("variables", next).catch(() => {});
  },

  getVariable(name) { return get().variables.find((v) => v.name === name); },
  removeVariable(name) {
    const next = get().variables.filter((v) => v.name !== name);
    set({ variables: next });
    _store.set("variables", next).catch(() => {});
  },
  listVariables() { return get().variables; },
}));
```

- [ ] **Step 6: Commit**

```bash
git add prototypes/v4/src/store/
git commit -m "feat(v4): canvas + variable stores with browser shims"
```

---

## Task 5: Copy and patch v3-canvas module

Copy files from `ide/src/modules/v3-canvas/` into `prototypes/v4/src/canvas/`. The only changes needed are import path rewrites (`@/modules/canvas/` → `@/store/`, `@/modules/v3-canvas/` → `./`, `@/lib/constants` → local constants, `@/app/ErrorBoundary` → inline).

**Files:**
- Create: `prototypes/v4/src/canvas/constants.ts`
- Create: `prototypes/v4/src/canvas/ErrorBoundary.tsx`
- Copy+patch: `V3InfiniteCanvas.tsx`, `V3CanvasNode.tsx`, `V3WireLayer.tsx`, `V3MiniMap.tsx`, `V3NodePalette.tsx`, `V3CanvasTopBar.tsx`, `V3CanvasBgPanel.tsx`, `V3CanvasBgAmbient.tsx`, `index.ts`

- [ ] **Step 1: Create `prototypes/v4/src/canvas/constants.ts`**

```ts
export const CANVAS_MIN_SCALE = 0.15;
export const CANVAS_MAX_SCALE = 3;
export const CANVAS_ZOOM_STEP = 0.1;
```

- [ ] **Step 2: Create `prototypes/v4/src/canvas/ErrorBoundary.tsx`**

```tsx
import { Component, type ReactNode } from "react";

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  render() {
    if (this.state.error) return this.props.fallback ?? <div style={{ color: "red", padding: 8 }}>Error: {this.state.error.message}</div>;
    return this.props.children;
  }
}
```

- [ ] **Step 3: Copy all v3-canvas files**

Run these copy commands from the repo root:

```bash
cp ide/src/modules/v3-canvas/V3InfiniteCanvas.tsx   prototypes/v4/src/canvas/V3InfiniteCanvas.tsx
cp ide/src/modules/v3-canvas/V3CanvasNode.tsx        prototypes/v4/src/canvas/V3CanvasNode.tsx
cp ide/src/modules/v3-canvas/V3WireLayer.tsx         prototypes/v4/src/canvas/V3WireLayer.tsx
cp ide/src/modules/v3-canvas/V3MiniMap.tsx           prototypes/v4/src/canvas/V3MiniMap.tsx
cp ide/src/modules/v3-canvas/V3NodePalette.tsx       prototypes/v4/src/canvas/V3NodePalette.tsx
cp ide/src/modules/v3-canvas/V3CanvasTopBar.tsx      prototypes/v4/src/canvas/V3CanvasTopBar.tsx
cp ide/src/modules/v3-canvas/V3CanvasBgPanel.tsx     prototypes/v4/src/canvas/V3CanvasBgPanel.tsx
cp ide/src/modules/v3-canvas/V3CanvasBgAmbient.tsx   prototypes/v4/src/canvas/V3CanvasBgAmbient.tsx
```

- [ ] **Step 4: Patch import paths in all copied canvas files**

For each copied file, do a find-and-replace:

| Find | Replace |
|---|---|
| `from "@/modules/canvas/canvasStore"` | `from "@/store/canvasStore"` |
| `from "@/modules/canvas/portDefs"` | `from "@/store/portDefs"` |
| `from "@/modules/canvas/types"` | `from "@/store/types"` |
| `from "@/modules/canvas/useWireData"` | `from "@/store/useWireData"` |
| `from "@/modules/v3-canvas/` | `from "./` |
| `from "@/lib/constants"` | `from "./constants"` |
| `from "@/app/ErrorBoundary"` | `from "./ErrorBoundary"` |
| `from "@/modules/theme"` | `from "@/hooks/useTheme"` |

Also remove any imports of `V3OrkPanel`, `V3SecondaryCanvas` — these are not in v4. Remove their usages from `V3InfiniteCanvas.tsx` (delete the JSX elements that render them).

- [ ] **Step 5: Create `prototypes/v4/src/canvas/index.ts`**

```ts
export { V3InfiniteCanvas } from "./V3InfiniteCanvas";
export { V3CanvasNode } from "./V3CanvasNode";
export { V3WireLayer } from "./V3WireLayer";
export { V3MiniMap } from "./V3MiniMap";
export { V3NodePalette } from "./V3NodePalette";
export { V3CanvasTopBar } from "./V3CanvasTopBar";
export { V3CanvasBgPanel } from "./V3CanvasBgPanel";
```

- [ ] **Step 6: Commit**

```bash
git add prototypes/v4/src/canvas/
git commit -m "feat(v4): port v3-canvas module"
```

---

## Task 6: Copy and patch terminal module

**Files:**
- Copy+patch: `prototypes/v4/src/terminal/` (TerminalPane.tsx + lib/)

- [ ] **Step 1: Copy terminal files**

```bash
cp ide/src/modules/terminal/TerminalPane.tsx          prototypes/v4/src/terminal/TerminalPane.tsx
cp ide/src/modules/terminal/lib/useTerminalSession.ts prototypes/v4/src/terminal/lib/useTerminalSession.ts
cp ide/src/modules/terminal/lib/pty-bridge.ts         prototypes/v4/src/terminal/lib/pty-bridge.ts
cp ide/src/modules/terminal/lib/osc-handlers.ts       prototypes/v4/src/terminal/lib/osc-handlers.ts
cp ide/src/modules/terminal/lib/panes.ts              prototypes/v4/src/terminal/lib/panes.ts
```

- [ ] **Step 2: Patch import paths**

| Find | Replace |
|---|---|
| `from "@/modules/theme"` | `from "@/hooks/useTheme"` |
| `from "@tauri-apps/api/core"` (invoke) | `from "@/shims/tauri"` |
| `from "@tauri-apps/api/event"` | `from "@/shims/tauri"` |

- [ ] **Step 3: Commit**

```bash
git add prototypes/v4/src/terminal/
git commit -m "feat(v4): port terminal module"
```

---

## Task 7: Panel content components

**Files:**
- Create: `prototypes/v4/src/panels/NotePanel.tsx`
- Create: `prototypes/v4/src/panels/VariablePanel.tsx`
- Create: `prototypes/v4/src/panels/TerminalPanel.tsx`
- Create: `prototypes/v4/src/panels/ChatPanel.tsx`
- Create: `prototypes/v4/src/panels/ToolPanel.tsx`
- Create: `prototypes/v4/src/panels/PanelContent.tsx`

- [ ] **Step 1: Create `NotePanel.tsx`**

```tsx
import { useCanvasStore } from "@/store/canvasStore";

export function NotePanel({ panelId }: { panelId: string }) {
  const panel = useCanvasStore((s) => s.panels.find((p) => p.id === panelId));
  const setMeta = useCanvasStore((s) => s.setMeta);
  const text = (panel?.meta.text as string) ?? "";

  return (
    <textarea
      value={text}
      onChange={(e) => setMeta(panelId, { text: e.target.value })}
      placeholder="Note..."
      style={{
        width: "100%", height: "100%", background: "transparent",
        border: "none", outline: "none", resize: "none",
        color: "var(--text-primary)", fontFamily: "system-ui", fontSize: 13,
        padding: 8, lineHeight: 1.5,
      }}
    />
  );
}
```

- [ ] **Step 2: Create `VariablePanel.tsx`**

```tsx
import { useCanvasStore } from "@/store/canvasStore";
import { useVariableStore } from "@/store/variableStore";

export function VariablePanel({ panelId }: { panelId: string }) {
  const panel = useCanvasStore((s) => s.panels.find((p) => p.id === panelId));
  const setMeta = useCanvasStore((s) => s.setMeta);
  const setVariable = useVariableStore((s) => s.setVariable);

  const name = (panel?.meta.varName as string) ?? "";
  const value = (panel?.meta.value as string) ?? "";

  const commit = () => { if (name) setVariable(name, value); };

  return (
    <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6, height: "100%" }}>
      <input
        value={name}
        onChange={(e) => setMeta(panelId, { varName: e.target.value })}
        placeholder="variable name"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 4, padding: "4px 8px", color: "var(--text-primary)", fontSize: 12, outline: "none" }}
      />
      <textarea
        value={value}
        onChange={(e) => setMeta(panelId, { value: e.target.value })}
        onBlur={commit}
        placeholder="value"
        style={{ flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 4, padding: "4px 8px", color: "var(--text-primary)", fontSize: 12, outline: "none", resize: "none", fontFamily: "monospace" }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create `TerminalPanel.tsx`**

```tsx
import { useRef } from "react";
import { TerminalPane } from "@/terminal/TerminalPane";

let _leafId = 100;

export function TerminalPanel({ panelId }: { panelId: string }) {
  const leafIdRef = useRef(_leafId++);

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <TerminalPane leafId={leafIdRef.current} visible={true} focused={false} />
    </div>
  );
}
```

- [ ] **Step 4: Create `ChatPanel.tsx`**

```tsx
export function ChatPanel({ panelId }: { panelId: string }) {
  return (
    <div style={{ padding: 12, color: "var(--text-secondary)", fontSize: 13, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 24 }}>💬</span>
      <span>inference-sh agent component</span>
      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>npx shadcn add https://inference.sh/r/agent.json</span>
    </div>
  );
}
```

- [ ] **Step 5: Create `ToolPanel.tsx`**

```tsx
export function ToolPanel({ panelId }: { panelId: string }) {
  return (
    <div style={{ padding: 12, color: "var(--text-secondary)", fontSize: 13, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 24 }}>🔧</span>
      <span>inference-sh tools component</span>
      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>npx shadcn add https://inference.sh/r/tools.json</span>
    </div>
  );
}
```

- [ ] **Step 6: Create `PanelContent.tsx`**

```tsx
import type { PanelType } from "@/store/types";
import { NotePanel } from "./NotePanel";
import { VariablePanel } from "./VariablePanel";
import { TerminalPanel } from "./TerminalPanel";
import { ChatPanel } from "./ChatPanel";
import { ToolPanel } from "./ToolPanel";

export function PanelContent({ panelId, type }: { panelId: string; type: PanelType }) {
  switch (type) {
    case "note":     return <NotePanel panelId={panelId} />;
    case "variable": return <VariablePanel panelId={panelId} />;
    case "terminal": return <TerminalPanel panelId={panelId} />;
    case "chat":     return <ChatPanel panelId={panelId} />;
    case "tool":     return <ToolPanel panelId={panelId} />;
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add prototypes/v4/src/panels/
git commit -m "feat(v4): panel content components"
```

---

## Task 8: Wire PanelContent into V3CanvasNode

`V3CanvasNode` currently imports `CanvasPanelContent` from the IDE. Replace with `PanelContent`.

**Files:**
- Modify: `prototypes/v4/src/canvas/V3CanvasNode.tsx`

- [ ] **Step 1: Find and replace the content import**

In `V3CanvasNode.tsx`, find the import of the old panel content component (likely `CanvasPanelContent` or similar from `@/modules/canvas/CanvasPanelContent`). Replace it:

```tsx
import { PanelContent } from "@/panels/PanelContent";
```

Then find the JSX where it renders the panel body (look for `<CanvasPanelContent` or the panel's inner render call) and replace with:

```tsx
<PanelContent panelId={panel.id} type={panel.type} />
```

- [ ] **Step 2: Commit**

```bash
git add prototypes/v4/src/canvas/V3CanvasNode.tsx
git commit -m "feat(v4): wire PanelContent into V3CanvasNode"
```

---

## Task 9: App.tsx + main.tsx

**Files:**
- Create: `prototypes/v4/src/main.tsx`
- Create: `prototypes/v4/src/App.tsx`

- [ ] **Step 1: Create `main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/globals.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 2: Create `App.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { V3InfiniteCanvas } from "@/canvas/V3InfiniteCanvas";
import { TerminalPane } from "@/terminal/TerminalPane";
import { useCanvasStore } from "@/store/canvasStore";
import { useVariableStore } from "@/store/variableStore";

const TERMINAL_MIN = 200;
const TERMINAL_DEFAULT = 380;

export function App() {
  const hydrate = useCanvasStore((s) => s.hydrate);
  const hydrateVars = useVariableStore((s) => s.hydrate);
  const [termWidth, setTermWidth] = useState(TERMINAL_DEFAULT);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  useEffect(() => {
    hydrate();
    hydrateVars();
  }, [hydrate, hydrateVars]);

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = termWidth;
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startX.current - e.clientX;
      setTermWidth(Math.max(TERMINAL_MIN, startW.current + delta));
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh", overflow: "hidden", background: "var(--bg-base)" }}>
      {/* Canvas */}
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <V3InfiniteCanvas />
      </div>

      {/* Splitter */}
      <div
        onMouseDown={onMouseDown}
        style={{ width: 4, cursor: "col-resize", background: "var(--border-subtle)", flexShrink: 0, transition: "background 150ms ease-out" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "var(--border-subtle)")}
      />

      {/* Terminal */}
      <div style={{ width: termWidth, flexShrink: 0, borderLeft: "1px solid var(--border-subtle)", background: "var(--bg-base)" }}>
        <TerminalPane leafId={1} visible={true} focused={false} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add prototypes/v4/src/main.tsx prototypes/v4/src/App.tsx
git commit -m "feat(v4): App split layout + hydration"
```

---

## Task 10: First run + fix TypeScript errors

- [ ] **Step 1: Start dev server**

```bash
cd prototypes/v4
npm run dev
```

Open `http://localhost:5174`. Expected: 3D canvas visible on the left, terminal on the right.

- [ ] **Step 2: Check TypeScript**

```bash
cd prototypes/v4
npx tsc --noEmit
```

Fix any errors — they will mostly be missing types from removed Tauri plugin imports or renamed things. Common fixes:
- `@tauri-apps/plugin-store` LazyStore type mismatch → your shim already covers it
- Removed canvas panel types (e.g. `"editor"`) still referenced in switch statements → add `default: return null` cases

- [ ] **Step 3: Verify canvas renders**

In the browser: right-click on canvas → should see node palette or context menu. Try adding a `note` node and typing in it.

- [ ] **Step 4: Commit final fixes**

```bash
git add prototypes/v4/src/
git commit -m "fix(v4): TypeScript errors and runtime fixes"
```

---

## Self-Review

**Spec coverage:**
- ✅ Vite + React scaffold → Task 1
- ✅ 3D Canvas (Three.js) → Task 5
- ✅ Terminal (xterm.js + PTY) → Task 6, App.tsx
- ✅ Tauri shims for browser → Task 2
- ✅ Panel types: terminal, chat, tool, note, variable → Task 7
- ✅ Wire system (canvasStore + useWireData) → Task 4
- ✅ Split layout with draggable splitter → Task 9
- ✅ Design tokens → Task 3
- ✅ inference-sh placeholders (ChatPanel, ToolPanel) → Task 7
- ✅ Excluded: agent system, vault, forum, editor, run engine → not present

**Placeholder scan:** ChatPanel and ToolPanel are intentional stubs — the spec says these are placeholders for inference-sh registry components installed later.

**Type consistency:** `PanelType` defined in Task 4 Step 1 covers exactly `"terminal" | "chat" | "tool" | "note" | "variable"` — matches PanelContent switch in Task 7 Step 6 and PORT_DEFS in Task 4 Step 2.
