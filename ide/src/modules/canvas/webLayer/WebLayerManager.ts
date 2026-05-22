/**
 * WebLayerManager — singleton bridging canvas panels to Tauri child webviews.
 *
 * Each managed node maps to one Tauri webview (label `web-panel-${id}`) created
 * with `web_open` in modules/webview.rs. The child webview lives **inside** the
 * main Tauri window (Tauri 2 unstable multi-webview feature), so positions are
 * window-local CSS pixels.
 *
 * Why DOM-measurement instead of canvas math:
 *   The web panel can sit at any depth — main canvas, sub-canvas, micro-canvas.
 *   Composing nested viewport transforms in TS is error-prone and duplicates
 *   work the browser already does on the placeholder element. The caller hands
 *   us a window-local rect (from `placeholder.getBoundingClientRect()`) and we
 *   forward it. One code path covers every nesting level.
 *
 * Zoom freeze:
 *   Native webviews don't scale with CSS transforms. During an active zoom we
 *   hide every node, then the caller's measure+sync effect repaints once the
 *   scale settles (200ms idle).
 */
import { invoke } from "@tauri-apps/api/core";
import type { Rect, WebNode } from "./types";

const labelFor = (id: string): string => `web-panel-${id}`;

function clampPositive(n: number): number {
  return Math.max(1, Math.round(n));
}

class WebLayerManager {
  private nodes = new Map<string, WebNode>();

  get hasNodes(): boolean {
    return this.nodes.size > 0;
  }

  get allIds(): string[] {
    return Array.from(this.nodes.keys());
  }

  /** Idempotent — creating an existing label re-syncs and re-navigates. */
  async create(id: string, url: string, windowRect: Rect): Promise<void> {
    const existing = this.nodes.get(id);
    if (existing) {
      // Wait for any in-flight open before pushing more state.
      if (existing.openPromise) await existing.openPromise.catch(() => undefined);
      await this.sync(id, windowRect);
      if (url && existing.url !== url) await this.navigate(id, url);
      return;
    }

    const label = labelFor(id);
    // Register the node IMMEDIATELY so a quick unmount can find it and await
    // the open promise before issuing close — otherwise web_open lands after
    // web_close and we leak an orphan webview.
    const openPromise = invoke<void>("web_open", {
      label,
      url,
      x: Math.round(windowRect.x),
      y: Math.round(windowRect.y),
      width: clampPositive(windowRect.w),
      height: clampPositive(windowRect.h),
    });
    openPromise.catch((e) => console.error("[WebLayer] web_open failed:", e));

    this.nodes.set(id, { id, url, label, visible: true, openPromise });
    await openPromise.catch(() => undefined);
    // Clear once settled so destroy() doesn't await unnecessarily later.
    const node = this.nodes.get(id);
    if (node) node.openPromise = undefined;
  }

  /** Push fresh window-local bounds. Hides the view when measured rect is degenerate. */
  async sync(id: string, windowRect: Rect): Promise<void> {
    const node = this.nodes.get(id);
    if (!node) return;

    const w = Math.round(windowRect.w);
    const h = Math.round(windowRect.h);
    const offscreen =
      w <= 1 || h <= 1 ||
      windowRect.x + w <= 0 ||
      windowRect.y + h <= 0 ||
      windowRect.x >= window.innerWidth ||
      windowRect.y >= window.innerHeight;

    if (offscreen) {
      if (node.visible) {
        node.visible = false;
        await invoke("web_set_visible", { label: node.label, visible: false }).catch(() => undefined);
      }
      return;
    }

    if (!node.visible) {
      node.visible = true;
      await invoke("web_set_visible", { label: node.label, visible: true }).catch(() => undefined);
    }

    await invoke("web_set_bounds", {
      label: node.label,
      x: Math.round(windowRect.x),
      y: Math.round(windowRect.y),
      width: clampPositive(w),
      height: clampPositive(h),
    }).catch(() => undefined);
  }

  async navigate(id: string, url: string): Promise<void> {
    const node = this.nodes.get(id);
    if (!node) return;
    node.url = url;
    if (!url) return;
    await invoke("web_navigate", { label: node.label, url }).catch((e) => {
      console.error("[WebLayer] web_navigate failed:", e);
    });
  }

  async setVisible(id: string, visible: boolean): Promise<void> {
    const node = this.nodes.get(id);
    if (!node || node.visible === visible) return;
    node.visible = visible;
    await invoke("web_set_visible", { label: node.label, visible }).catch(() => undefined);
  }

  async destroy(id: string): Promise<void> {
    const node = this.nodes.get(id);
    if (!node) return;
    this.nodes.delete(id);
    // Wait for the open to finish so the webview actually exists by the time
    // we ask Tauri to close it. Otherwise we leak an orphan window.
    if (node.openPromise) await node.openPromise.catch(() => undefined);
    await invoke("web_close", { label: node.label }).catch(() => undefined);
  }

  // ── Zoom freeze ────────────────────────────────────────────────────────────
  // Native webviews don't scale with CSS transforms. We hide them on the first
  // scale change and let the caller's sync effect re-measure + re-show after a
  // 200ms idle, giving the user a crisp final frame.

  private zoomTimer: ReturnType<typeof setTimeout> | null = null;
  private zoomFrozen = false;

  freezeForZoom(): void {
    if (!this.zoomFrozen && this.nodes.size > 0) {
      this.zoomFrozen = true;
      for (const node of this.nodes.values()) {
        if (node.visible) {
          invoke("web_set_visible", { label: node.label, visible: false }).catch(() => undefined);
          node.visible = false;
        }
      }
    }
    if (this.zoomTimer) clearTimeout(this.zoomTimer);
    this.zoomTimer = setTimeout(() => { this.zoomTimer = null; }, 200);
  }

  get isFrozen(): boolean {
    return this.zoomTimer !== null;
  }

  thawAfterZoom(): void {
    this.zoomFrozen = false;
  }

  /** Hide every managed webview — used when a full-screen overlay (launcher,
   *  modal) must appear above native child webviews that ignore z-index. */
  async hideAll(): Promise<void> {
    const tasks = Array.from(this.nodes.values())
      .filter((n) => n.visible)
      .map((n) => {
        n.visible = false;
        return invoke("web_set_visible", { label: n.label, visible: false }).catch(() => undefined);
      });
    await Promise.all(tasks);
  }
}

export const webLayerManager = new WebLayerManager();
