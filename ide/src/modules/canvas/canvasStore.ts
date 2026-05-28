import { create } from "zustand";
import { LazyStore } from "@tauri-apps/plugin-store";
import { emitTo } from "@tauri-apps/api/event";
import { webLayerManager } from "./webLayer/WebLayerManager";
import type { CanvasPanelNode, Connection, PortSide, PanelType, Viewport } from "./types";

const uid = () => crypto.randomUUID();

// ── Per-vault persistence ────────────────────────────────────────────────────
// Each vault root gets its own atlas-canvas-{hash}.json so canvas layouts are
// isolated between vaults. Webviews outside Tauri silently no-op.

function _simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

let _persistStore = new LazyStore("atlas-canvas.json", { defaults: {}, autoSave: 300 });
let _persistKey = "atlas-canvas.json";
const PERSIST_KEY = "state";

interface PersistedCanvas {
  panels: CanvasPanelNode[];
  connections: Connection[];
  viewport: Viewport;
  nextZ: number;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(snapshot: PersistedCanvas): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    _persistStore.set(PERSIST_KEY, snapshot).catch(() => undefined);
  }, 200);
}

export type CanvasKind = "workspace" | "image" | "audio" | "data";

export interface CanvasRecord {
  id: string;
  title: string;
  kind: CanvasKind;
  /** If set, this canvas is hidden (used as a Tool node sub-canvas). */
  hidden?: boolean;
  parentCanvasId?: string;
}

interface CanvasState {
  panels: CanvasPanelNode[];
  connections: Connection[];
  viewport: Viewport;
  nextZ: number;
  hydrated: boolean;
  /** Named canvas list. The active canvas's data lives in panels/connections/viewport. */
  canvases: CanvasRecord[];
  activeCanvasId: string;
  /** Navigation stack for breadcrumb (array of canvas ids). */
  canvasHistory: string[];
  /** Currently selected panel IDs (supports multi-select via Shift). */
  selectedPanelIds: string[];
  /** Split-view mode — two canvases side-by-side. */
  isSplit: boolean;
  secondaryTitle: string;
  secondaryPanels: CanvasPanelNode[];
  secondaryConnections: Connection[];
  secondaryViewport: Viewport;
  secondaryNextZ: number;
  secondarySelectedIds: string[];
}

interface CanvasActions {
  addPanel(type: PanelType, at?: { x: number; y: number }, initialMeta?: Record<string, unknown>): string;
  ensureSystemCanvas(workspaceRoot: string): void;
  /** Switch the active vault — saves current canvas, loads the vault`s own canvas. */
  switchVault(root: string): Promise<void>;
  /** Multi-canvas: add a new named canvas and switch to it. */
  addCanvas(title?: string, kind?: CanvasKind): string;
  /** Multi-canvas: remove a canvas (not the last one). */
  removeCanvas(id: string): void;
  /** Multi-canvas: switch to a canvas by id. */
  switchCanvas(id: string): Promise<void>;
  /** Multi-canvas: enter a sub-canvas (push to history). */
  enterCanvas(id: string): Promise<void>;
  /** Multi-canvas: navigate back in history. */
  exitCanvas(): Promise<void>;
  /** Rename a canvas record by id. */
  renameCanvas(id: string, title: string): void;
  /** Open split view (secondary canvas). */
  openSplit(): void;
  /** Close split view. */
  closeSplit(): void;
  /** Secondary canvas CRUD. */
  addSecondaryPanel(type: PanelType): string;
  updateSecondaryPanel(id: string, patch: Partial<CanvasPanelNode>): void;
  removeSecondaryPanel(id: string): void;
  bringSecondaryToFront(id: string): void;
  setSecondaryViewport(patch: Partial<Viewport>): void;
  selectSecondaryPanel(id: string, add?: boolean): void;
  deselectAllSecondary(): void;
  deleteSecondarySelected(): void;
  addSecondaryConnection(fromPanel: string, fromSide: PortSide, toPanel: string, toSide: PortSide, fromPort?: string, toPort?: string, kind?: "data" | "context" | "trigger"): string;
  removeSecondaryConnection(id: string): void;
  removePanel(id: string): void;
  updatePanel(id: string, patch: Partial<CanvasPanelNode>): void;
  bringToFront(id: string): void;
  setViewport(patch: Partial<Viewport>): void;
  togglePin(id: string): void;
  toggleMinimized(id: string): void;
  selectPanel(id: string, addToSelection?: boolean): void;
  deselectAll(): void;
  deleteSelected(): void;
  addConnection(fromPanel: string, fromSide: PortSide, toPanel: string, toSide: PortSide, fromPort?: string, toPort?: string, kind?: "data" | "context" | "trigger"): string;
  removeConnection(id: string): void;
  updateConnectionKind(id: string, kind: "data" | "context" | "trigger"): void;
  /** Per-wire character limit (default 4000, clamped to [100, 32000]). */
  updateConnectionCharLimit(id: string, charLimit: number): void;
  setOutputData(
    id: string,
    data: { kind: "text" | "image" | "json"; value: unknown } | null,
  ): void;
  loadBlueprint(blueprint: { panels: CanvasPanelNode[]; connections: Connection[]; offsetX?: number; offsetY?: number }): void;
  setSubViewport(parentId: string, patch: Partial<Viewport>): void;
  addChildPanel(parentId: string, type: PanelType, at?: { x: number; y: number }): string;
  updateChildPanel(parentId: string, childId: string, patch: Partial<CanvasPanelNode>): void;
  removeChildPanel(parentId: string, childId: string): void;
  bringChildToFront(parentId: string, childId: string): void;
  /** Send a command string to a terminal panel by id (same-window, no CustomEvent). */
  triggerTerminal(panelId: string, cmd: string): void;
}

const PANEL_DEFAULTS: Record<PanelType, { width: number; height: number; title: string }> = {
  terminal:    { width: 480, height: 320, title: "Terminal" },
  editor:      { width: 560, height: 400, title: "Editor" },
  preview:     { width: 520, height: 380, title: "Preview" },
  "vault-home":{ width: 480, height: 400, title: "Vault Home" },
  web:         { width: 560, height: 420, title: "Web" },
  chat:        { width: 420, height: 520, title: "Chat" },
  canvas:      { width: 640, height: 480, title: "Sub Canvas" },
  agent:       { width: 360, height: 520, title: "New Agent" },
  instance:    { width: 560, height: 500, title: "Atlas Instance" },
  codegraph:   { width: 700, height: 540, title: "Code Graph" },
  input:       { width: 260, height: 160, title: "Input" },
  pipeline:    { width: 400, height: 300, title: "Pipeline" },
  header:      { width: 280, height: 52,  title: "Header" },
  checklist:   { width: 260, height: 280, title: "Checklist" },
  gallery:     { width: 360, height: 300, title: "Gallery" },
  filebrowser: { width: 480, height: 520, title: "Files" },
  sketch:      { width: 480, height: 360, title: "Sketch" },
  note:        { width: 260, height: 200, title: "Note" },
  tool:        { width: 200, height: 160, title: "Tool" },
  pipe:        { width: 320, height: 260, title: "Auto-Pipe" },
  stickman:    { width: 460, height: 520, title: "AtlasBot" },
  "canvas-3d": { width: 640, height: 480, title: "3D Canvas" },
  logs:        { width: 560, height: 400, title: "Logs" },
  audio:       { width: 320, height: 380, title: "Audio" },
  variable:    { width: 220, height: 120, title: "Variable" },
  "if-else":   { width: 260, height: 160, title: "If / Else" },
  "for-each":  { width: 260, height: 160, title: "For Each" },
};

const DEFAULT_CANVAS_ID = "main";

export const useCanvasStore = create<CanvasState & CanvasActions>((set, get) => ({
  panels: [],
  connections: [],
  viewport: { x: 0, y: 0, scale: 1 },
  nextZ: 1,
  hydrated: false,
  canvases: [{ id: DEFAULT_CANVAS_ID, title: "Main", kind: "workspace" }],
  activeCanvasId: DEFAULT_CANVAS_ID,
  canvasHistory: [DEFAULT_CANVAS_ID],
  selectedPanelIds: [],
  isSplit: false,
  secondaryTitle: "Canvas B",
  secondaryPanels: [],
  secondaryConnections: [],
  secondaryViewport: { x: 0, y: 0, scale: 1 },
  secondaryNextZ: 1,
  secondarySelectedIds: [],

  addPanel(type, at, initialMeta) {
    const id = uid();
    const { viewport, nextZ } = get();
    const defaults = PANEL_DEFAULTS[type];
    const cx = at?.x ?? (window.innerWidth / 2 - defaults.width / 2 - viewport.x) / viewport.scale;
    const cy = at?.y ?? (Math.max(window.innerHeight - 148, 200) / 2 - defaults.height / 2 - viewport.y) / viewport.scale;
    const panel: CanvasPanelNode = {
      id,
      type,
      x: cx,
      y: cy,
      width: defaults.width,
      height: defaults.height,
      zIndex: nextZ,
      title: defaults.title,
      meta: initialMeta ?? {},
      ...(type === "canvas" ? { viewport: { x: 0, y: 0, scale: 1 }, children: [] } : {}),
    };
    set((s) => ({ panels: [...s.panels, panel], nextZ: s.nextZ + 1 }));
    return id;
  },

  selectPanel(id, addToSelection = false) {
    set((s) => ({
      selectedPanelIds: addToSelection
        ? s.selectedPanelIds.includes(id)
          ? s.selectedPanelIds.filter((i) => i !== id)
          : [...s.selectedPanelIds, id]
        : [id],
    }));
  },

  deselectAll() {
    set({ selectedPanelIds: [] });
  },

  deleteSelected() {
    const ids = get().selectedPanelIds;
    if (ids.length === 0) return;
    set((s) => ({
      panels: s.panels.filter((p) => !ids.includes(p.id)),
      connections: s.connections.filter((c) => !ids.includes(c.fromPanel) && !ids.includes(c.toPanel)),
      selectedPanelIds: [],
    }));
  },

  removePanel(id) {
    set((s) => ({
      panels: s.panels.filter((p) => p.id !== id),
      connections: s.connections.filter((c) => c.fromPanel !== id && c.toPanel !== id),
      selectedPanelIds: s.selectedPanelIds.filter((i) => i !== id),
    }));
  },

  updatePanel(id, patch) {
    set((s) => ({
      panels: s.panels.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  },

  bringToFront(id) {
    const { nextZ } = get();
    set((s) => ({
      panels: s.panels.map((p) => (p.id === id ? { ...p, zIndex: nextZ } : p)),
      nextZ: nextZ + 1,
    }));
  },

  setViewport(patch) {
    const prevScale = get().viewport.scale;
    if (patch.scale !== undefined && patch.scale !== prevScale && webLayerManager.hasNodes) {
      webLayerManager.freezeForZoom();
    }
    set((s) => ({ viewport: { ...s.viewport, ...patch } }));
  },

  toggleMinimized(id) {
    set((s) => ({
      panels: s.panels.map((p) => (p.id === id ? { ...p, minimized: !p.minimized } : p)),
    }));
  },

  togglePin(id) {
    const { panels, viewport } = get();
    const panel = panels.find((p) => p.id === id);
    if (!panel) return;
    if (panel.pinned) {
      const canvasX = ((panel.screenX ?? 0) - viewport.x) / viewport.scale;
      const canvasY = ((panel.screenY ?? 0) - viewport.y) / viewport.scale;
      set((s) => ({
        panels: s.panels.map((p) =>
          p.id === id ? { ...p, pinned: false, x: canvasX, y: canvasY, screenX: undefined, screenY: undefined } : p,
        ),
      }));
    } else {
      const screenX = panel.x * viewport.scale + viewport.x;
      const screenY = panel.y * viewport.scale + viewport.y;
      set((s) => ({
        panels: s.panels.map((p) =>
          p.id === id ? { ...p, pinned: true, screenX, screenY } : p,
        ),
      }));
    }
  },

  addConnection(fromPanel, fromSide, toPanel, toSide, fromPort, toPort, kind) {
    const id = uid();
    const conn: import("./types").Connection = { id, fromPanel, fromSide, toPanel, toSide };
    if (fromPort) conn.fromPort = fromPort;
    if (toPort) conn.toPort = toPort;
    if (kind) conn.kind = kind;
    set((s) => ({ connections: [...s.connections, conn] }));
    return id;
  },

  removeConnection(id) {
    set((s) => ({ connections: s.connections.filter((c) => c.id !== id) }));
  },

  updateConnectionKind(id, kind) {
    set((s) => ({
      connections: s.connections.map((c) => (c.id === id ? { ...c, kind } : c)),
    }));
  },

  updateConnectionCharLimit(id, charLimit) {
    const clamped = Math.max(100, Math.min(charLimit, 32_000));
    set((s) => ({
      connections: s.connections.map((c) =>
        c.id === id ? { ...c, charLimit: clamped } : c,
      ),
    }));
  },

  setOutputData(id, data) {
    const panel = get().panels.find(p => p.id === id);
    set((s) => ({
      panels: s.panels.map((p) => {
        if (p.id !== id) return p;
        if (data === null) {
          const meta = { ...p.meta };
          delete (meta as Record<string, unknown>).outputData;
          return { ...p, meta };
        }
        return { ...p, meta: { ...p.meta, outputData: data } };
      }),
    }));
    // Forward to linked V3 window if configured
    if (panel?.windowLabel && data !== null) {
      const payload = typeof data.value === "string" ? data.value : JSON.stringify(data.value ?? "");
      void emitTo(panel.windowLabel, "atlas:wire-data", { panelId: id, data: payload });
    }
  },

  loadBlueprint({ panels: bpPanels, connections: bpConns, offsetX = 60, offsetY = 60 }) {
    const idMap = new Map<string, string>();
    const restamp = (p: CanvasPanelNode): CanvasPanelNode => {
      const newId = uid();
      idMap.set(p.id, newId);
      return { ...p, id: newId, x: p.x + offsetX, y: p.y + offsetY, children: p.children?.map(restamp) };
    };
    const newPanels = bpPanels.map(restamp);
    const newConns = bpConns
      .filter((c) => idMap.has(c.fromPanel) && idMap.has(c.toPanel))
      .map((c) => ({ ...c, id: uid(), fromPanel: idMap.get(c.fromPanel)!, toPanel: idMap.get(c.toPanel)! }));
    const { nextZ } = get();
    const maxZ = newPanels.reduce((m, p) => Math.max(m, p.zIndex), 0);
    const zOffset = nextZ - 1;
    const stamped = newPanels.map((p) => ({ ...p, zIndex: p.zIndex + zOffset }));
    set((s) => ({
      panels: [...s.panels, ...stamped],
      connections: [...s.connections, ...newConns],
      nextZ: nextZ + maxZ + 1,
    }));
  },

  setSubViewport(parentId, patch) {
    set((s) => ({
      panels: s.panels.map((p) =>
        p.id === parentId
          ? { ...p, viewport: { ...(p.viewport ?? { x: 0, y: 0, scale: 1 }), ...patch } }
          : p,
      ),
    }));
  },

  addChildPanel(parentId, type, at) {
    const id = uid();
    const defaults = PANEL_DEFAULTS[type];
    set((s) => ({
      panels: s.panels.map((p) => {
        if (p.id !== parentId) return p;
        const children = p.children ?? [];
        const maxZ = children.reduce((m, c) => Math.max(m, c.zIndex), 0);
        const vp = p.viewport ?? { x: 0, y: 0, scale: 1 };
        const cx = at?.x ?? (p.width / 2 - defaults.width / 2 - vp.x) / vp.scale;
        const cy = at?.y ?? (p.height / 2 - defaults.height / 2 - vp.y) / vp.scale;
        const child: CanvasPanelNode = {
          id,
          type,
          x: cx,
          y: cy,
          width: defaults.width,
          height: defaults.height,
          zIndex: maxZ + 1,
          title: defaults.title,
          meta: {},
          ...(type === "canvas" ? { viewport: { x: 0, y: 0, scale: 1 }, children: [] } : {}),
        };
        return { ...p, children: [...children, child] };
      }),
    }));
    return id;
  },

  updateChildPanel(parentId, childId, patch) {
    set((s) => ({
      panels: s.panels.map((p) =>
        p.id === parentId
          ? { ...p, children: (p.children ?? []).map((c) => (c.id === childId ? { ...c, ...patch } : c)) }
          : p,
      ),
    }));
  },

  removeChildPanel(parentId, childId) {
    set((s) => ({
      panels: s.panels.map((p) =>
        p.id === parentId
          ? { ...p, children: (p.children ?? []).filter((c) => c.id !== childId) }
          : p,
      ),
    }));
  },

  bringChildToFront(parentId, childId) {
    set((s) => ({
      panels: s.panels.map((p) => {
        if (p.id !== parentId) return p;
        const children = p.children ?? [];
        const maxZ = children.reduce((m, c) => Math.max(m, c.zIndex), 0);
        return { ...p, children: children.map((c) => (c.id === childId ? { ...c, zIndex: maxZ + 1 } : c)) };
      }),
    }));
  },

  triggerTerminal(panelId, cmd) {
    set((s) => ({
      panels: s.panels.map((p) =>
        p.id === panelId ? { ...p, meta: { ...p.meta, _termTrigger: { cmd, ts: Date.now() } } } : p,
      ),
    }));
  },

  async switchVault(root) {
    const key = root ? `atlas-canvas-${_simpleHash(root)}.json` : "atlas-canvas.json";
    if (key === _persistKey) return;

    // Flush current state before switching.
    const cur = get();
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    await _persistStore
      .set(PERSIST_KEY, { panels: cur.panels, connections: cur.connections, viewport: cur.viewport, nextZ: cur.nextZ })
      .catch(() => undefined);

    _persistKey = key;
    _persistStore = new LazyStore(key, { defaults: {}, autoSave: 300 });
    _hydrated = false;

    useCanvasStore.setState({ panels: [], connections: [], viewport: { x: 0, y: 0, scale: 1 }, nextZ: 1, hydrated: false });
    await hydrate();
  },

  ensureSystemCanvas(workspaceRoot) {
    const { panels } = get();
    if (panels.some((p) => p.type === "canvas" && p.meta?.systemCanvas === true)) return;
    const root = workspaceRoot || "c:\\Atlas OS";
    const systemCanvas: CanvasPanelNode = {
      id: uid(),
      type: "canvas",
      x: 40,
      y: 40,
      width: 960,
      height: 400,
      zIndex: 1,
      title: "Calisan Terminaller",
      meta: { systemCanvas: true },
      viewport: { x: 0, y: 0, scale: 1 },
      children: [
        {
          id: uid(),
          type: "terminal",
          x: 10,
          y: 10,
          width: 450,
          height: 340,
          zIndex: 1,
          title: "API Server",
          meta: { cwd: root, initCmd: "python api/server.py" },
        },
        {
          id: uid(),
          type: "terminal",
          x: 475,
          y: 10,
          width: 450,
          height: 340,
          zIndex: 2,
          title: "Atlas CLI",
          meta: { cwd: root },
        },
      ],
    };
    set((s) => ({ panels: [systemCanvas, ...s.panels], nextZ: s.nextZ + 1 }));
  },

  renameCanvas(id, title) {
    set((s) => ({
      canvases: s.canvases.map((c) => (c.id === id ? { ...c, title } : c)),
    }));
  },

  openSplit() {
    set({ isSplit: true, secondaryPanels: [], secondaryConnections: [], secondaryViewport: { x: 0, y: 0, scale: 1 }, secondaryNextZ: 1, secondarySelectedIds: [] });
  },

  closeSplit() {
    set({ isSplit: false });
  },

  addSecondaryPanel(type) {
    const id = uid();
    const { secondaryViewport: vp, secondaryNextZ: nextZ } = get();
    const defaults = PANEL_DEFAULTS[type];
    const cx = (window.innerWidth / 4 - defaults.width / 2 - vp.x) / vp.scale;
    const cy = (window.innerHeight / 2 - defaults.height / 2 - vp.y) / vp.scale;
    const panel: CanvasPanelNode = {
      id, type, x: cx, y: cy, width: defaults.width, height: defaults.height,
      zIndex: nextZ, title: defaults.title, meta: {},
      ...(type === "canvas" ? { viewport: { x: 0, y: 0, scale: 1 }, children: [] } : {}),
    };
    set((s) => ({ secondaryPanels: [...s.secondaryPanels, panel], secondaryNextZ: s.secondaryNextZ + 1 }));
    return id;
  },

  updateSecondaryPanel(id, patch) {
    set((s) => ({ secondaryPanels: s.secondaryPanels.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  },

  removeSecondaryPanel(id) {
    set((s) => ({
      secondaryPanels: s.secondaryPanels.filter((p) => p.id !== id),
      secondaryConnections: s.secondaryConnections.filter((c) => c.fromPanel !== id && c.toPanel !== id),
      secondarySelectedIds: s.secondarySelectedIds.filter((i) => i !== id),
    }));
  },

  bringSecondaryToFront(id) {
    const { secondaryNextZ: nextZ } = get();
    set((s) => ({
      secondaryPanels: s.secondaryPanels.map((p) => (p.id === id ? { ...p, zIndex: nextZ } : p)),
      secondaryNextZ: nextZ + 1,
    }));
  },

  setSecondaryViewport(patch) {
    set((s) => ({ secondaryViewport: { ...s.secondaryViewport, ...patch } }));
  },

  selectSecondaryPanel(id, add = false) {
    set((s) => ({
      secondarySelectedIds: add
        ? s.secondarySelectedIds.includes(id) ? s.secondarySelectedIds.filter((i) => i !== id) : [...s.secondarySelectedIds, id]
        : [id],
    }));
  },

  deselectAllSecondary() {
    set({ secondarySelectedIds: [] });
  },

  deleteSecondarySelected() {
    const ids = get().secondarySelectedIds;
    if (!ids.length) return;
    set((s) => ({
      secondaryPanels: s.secondaryPanels.filter((p) => !ids.includes(p.id)),
      secondaryConnections: s.secondaryConnections.filter((c) => !ids.includes(c.fromPanel) && !ids.includes(c.toPanel)),
      secondarySelectedIds: [],
    }));
  },

  addSecondaryConnection(fromPanel, fromSide, toPanel, toSide, fromPort, toPort, kind) {
    const id = uid();
    const conn: import("./types").Connection = { id, fromPanel, fromSide, toPanel, toSide };
    if (fromPort) conn.fromPort = fromPort;
    if (toPort) conn.toPort = toPort;
    if (kind) conn.kind = kind;
    set((s) => ({ secondaryConnections: [...s.secondaryConnections, conn] }));
    return id;
  },

  removeSecondaryConnection(id) {
    set((s) => ({ secondaryConnections: s.secondaryConnections.filter((c) => c.id !== id) }));
  },

  addCanvas(title = "Canvas", kind = "workspace") {
    const id = uid();
    set((s) => ({
      canvases: [...s.canvases, { id, title, kind }],
    }));
    return id;
  },

  removeCanvas(id) {
    const { canvases, activeCanvasId } = get();
    if (canvases.length <= 1) return;
    const remaining = canvases.filter((c) => c.id !== id);
    if (activeCanvasId === id) {
      void get().switchCanvas(remaining[0].id);
    } else {
      set({ canvases: remaining });
    }
  },

  async switchCanvas(id) {
    const { activeCanvasId, canvases } = get();
    if (id === activeCanvasId) return;
    if (!canvases.find((c) => c.id === id)) return;

    // Persist current canvas state
    const cur = get();
    const curKey = `atlas-canvas-multi-${activeCanvasId}`;
    const curStore = new LazyStore(`${curKey}.json`, { defaults: {}, autoSave: 0 });
    await curStore.set(PERSIST_KEY, {
      panels: cur.panels, connections: cur.connections,
      viewport: cur.viewport, nextZ: cur.nextZ,
    }).catch(() => undefined);

    // Load target canvas state
    const targetKey = `atlas-canvas-multi-${id}`;
    const targetStore = new LazyStore(`${targetKey}.json`, { defaults: {}, autoSave: 0 });
    const snap = await targetStore.get<PersistedCanvas>(PERSIST_KEY).catch(() => null);
    set({
      activeCanvasId: id,
      canvasHistory: [...get().canvasHistory.filter((h) => h !== id), id],
      panels: Array.isArray(snap?.panels) ? snap!.panels : [],
      connections: Array.isArray(snap?.connections) ? snap!.connections : [],
      viewport: snap?.viewport ?? { x: 0, y: 0, scale: 1 },
      nextZ: typeof snap?.nextZ === "number" ? snap!.nextZ : 1,
    });
  },

  async enterCanvas(id) {
    await get().switchCanvas(id);
    set((s) => ({ canvasHistory: [...s.canvasHistory, id] }));
  },

  async exitCanvas() {
    const { canvasHistory } = get();
    if (canvasHistory.length <= 1) return;
    const prev = canvasHistory[canvasHistory.length - 2];
    await get().switchCanvas(prev);
    set((s) => ({ canvasHistory: s.canvasHistory.slice(0, -1) }));
  },
}));

// ── Persistence wiring ──────────────────────────────────────────────────────

let _hydrated = false;
async function hydrate(): Promise<void> {
  if (_hydrated) return;
  _hydrated = true;
  try {
    const snap = await _persistStore.get<PersistedCanvas>(PERSIST_KEY);
    if (!snap || typeof snap !== "object") {
      useCanvasStore.setState({ hydrated: true });
      return;
    }
    useCanvasStore.setState({
      panels: Array.isArray(snap.panels) ? snap.panels : [],
      connections: Array.isArray(snap.connections) ? snap.connections : [],
      viewport: snap.viewport ?? { x: 0, y: 0, scale: 1 },
      nextZ: typeof snap.nextZ === "number" ? snap.nextZ : 1,
      hydrated: true,
    });
  } catch {
    useCanvasStore.setState({ hydrated: true });
  }
}
void hydrate();

useCanvasStore.subscribe((s) => {
  if (!_hydrated) return;
  schedulePersist({
    panels: s.panels,
    connections: s.connections,
    viewport: s.viewport,
    nextZ: s.nextZ,
  });
});
