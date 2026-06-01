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
  // multi-canvas stubs (v4 single-canvas, kept for component compat)
  activeCanvasId: string;
  canvases: Array<{ id: string; title: string }>;
  isSplit: boolean;
  secondaryTitle: string;
  secondaryConnections: Connection[];
}

interface CanvasActions {
  hydrate(): Promise<void>;
  addPanel(type: PanelType, overrides?: Partial<CanvasPanelNode>): string;
  removePanel(id: string): void;
  updatePanel(id: string, patch: Partial<CanvasPanelNode>): void;
  setMeta(id: string, patch: Record<string, unknown>): void;
  setOutputData(id: string, data: WireData): void;
  addConnection(fromPanel: string, fromSide: import("./types").PortSide, toPanel: string, toSide: import("./types").PortSide, fromPort?: string, toPort?: string, kind?: import("./types").ConnectionKind): string;
  addConnectionObj(c: Omit<Connection, "id">): string;
  removeConnection(id: string): void;
  updateConnectionKind(id: string, kind: import("./types").ConnectionKind): void;
  setViewport(v: Viewport): void;
  setSelected(ids: string[]): void;
  clearCanvas(): void;
  // selection helpers
  selectedPanelIds: string[];
  deselectAll(): void;
  selectPanel(id: string, add?: boolean): void;
  selectAll(): void;
  selectMany(ids: string[]): void;
  deleteSelected(): void;
  pasteFromClipboard(panels: CanvasPanelNode[]): void;
  moveSelectedExcept(exceptId: string, dx: number, dy: number): void;
  // z / pin / minimize
  bringToFront(id: string): void;
  togglePin(id: string): void;
  toggleMinimized(id: string): void;
  // multi-canvas stubs
  renameCanvas(id: string, title: string): void;
  openSplit(): void;
  closeSplit(): void;
}

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 };

export const useCanvasStore = create<CanvasState & CanvasActions>((set, get) => ({
  panels: [],
  connections: [],
  viewport: DEFAULT_VIEWPORT,
  nextZ: 1,
  hydrated: false,
  selectedIds: [],
  selectedPanelIds: [],
  // multi-canvas stubs
  activeCanvasId: "default",
  canvases: [{ id: "default", title: "Canvas" }],
  isSplit: false,
  secondaryTitle: "Canvas B",
  secondaryConnections: [],

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

  addConnection(fromPanel, fromSide, toPanel, toSide, fromPort, toPort, kind = "data") {
    const { connections, panels, viewport, nextZ } = get();
    const id = uid();
    const conn: Connection = { id, fromPanel, fromSide, toPanel, toSide, fromPort, toPort, kind };
    const next = { connections: [...connections, conn] };
    set(next);
    schedulePersist({ panels, ...next, viewport, nextZ });
    return id;
  },

  addConnectionObj(c) {
    const { connections, panels, viewport, nextZ } = get();
    const conn: Connection = { ...c, id: uid() };
    const next = { connections: [...connections, conn] };
    set(next);
    schedulePersist({ panels, ...next, viewport, nextZ });
    return conn.id;
  },

  removeConnection(id) {
    const { connections, panels, viewport, nextZ } = get();
    const next = { connections: connections.filter((c) => c.id !== id) };
    set(next);
    schedulePersist({ panels, ...next, viewport, nextZ });
  },

  updateConnectionKind(id, kind) {
    const { connections, panels, viewport, nextZ } = get();
    const next = { connections: connections.map((c) => c.id === id ? { ...c, kind } : c) };
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
    set({ panels: [], connections: [], nextZ: 1, selectedIds: [], selectedPanelIds: [] });
    schedulePersist({ panels: [], connections: [], viewport, nextZ: 1 });
  },

  deselectAll() { set({ selectedIds: [], selectedPanelIds: [] }); },

  selectPanel(id, add = false) {
    const { selectedPanelIds } = get();
    if (add) {
      set({ selectedPanelIds: selectedPanelIds.includes(id) ? selectedPanelIds.filter((x) => x !== id) : [...selectedPanelIds, id] });
    } else {
      set({ selectedPanelIds: [id] });
    }
    set({ selectedIds: get().selectedPanelIds });
  },

  selectAll() {
    const ids = get().panels.map((p) => p.id);
    set({ selectedPanelIds: ids, selectedIds: ids });
  },

  selectMany(ids) {
    set({ selectedPanelIds: ids, selectedIds: ids });
  },

  deleteSelected() {
    const { selectedPanelIds } = get();
    selectedPanelIds.forEach((id) => get().removePanel(id));
    set({ selectedPanelIds: [], selectedIds: [] });
  },

  pasteFromClipboard(clipPanels) {
    clipPanels.forEach((p) => {
      get().addPanel(p.type, { ...p, id: undefined as unknown as string, x: p.x + 20, y: p.y + 20 });
    });
  },

  moveSelectedExcept(exceptId, dx, dy) {
    const { selectedPanelIds, panels } = get();
    const toMove = selectedPanelIds.filter((id) => id !== exceptId);
    if (toMove.length === 0) return;
    const next = panels.map((p) => toMove.includes(p.id) ? { ...p, x: p.x + dx, y: p.y + dy } : p);
    const { connections, viewport, nextZ } = get();
    set({ panels: next });
    schedulePersist({ panels: next, connections, viewport, nextZ });
  },

  bringToFront(id) {
    const { panels, nextZ, connections, viewport } = get();
    const next = panels.map((p) => p.id === id ? { ...p, zIndex: nextZ } : p);
    set({ panels: next, nextZ: nextZ + 1 });
    schedulePersist({ panels: next, connections, viewport, nextZ: nextZ + 1 });
  },

  togglePin(id) {
    const p = get().panels.find((p) => p.id === id);
    if (!p) return;
    get().updatePanel(id, { pinned: !p.pinned });
  },

  toggleMinimized(id) {
    const p = get().panels.find((p) => p.id === id);
    if (!p) return;
    get().updatePanel(id, { minimized: !p.minimized });
  },

  renameCanvas(_id, title) {
    set({ canvases: get().canvases.map((c) => c.id === _id ? { ...c, title } : c) });
  },

  openSplit() { set({ isSplit: true }); },
  closeSplit() { set({ isSplit: false }); },
}));
