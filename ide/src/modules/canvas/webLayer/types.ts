/**
 * Web-layer types — describe a native child webview owned by a canvas panel.
 *
 * Each canvas panel of type "web" maps 1:1 to a Tauri child webview created via
 * `web_open` in `modules/webview.rs`. The child webview lives **inside** the
 * main window (Tauri 2 unstable multi-webview feature), so coordinates are
 * window-local CSS pixels — no screen offset math.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WebNode {
  /** Canvas panel id this webview belongs to. */
  id: string;
  /** Current URL last sent to the webview. */
  url: string;
  /** Stable Tauri webview label used across all `web_*` commands. */
  label: string;
  /** Tracks the last visibility we pushed to Rust — avoids redundant calls. */
  visible: boolean;
  /** Promise of the in-flight web_open call — awaited by destroy() to prevent leaks. */
  openPromise?: Promise<void>;
}
