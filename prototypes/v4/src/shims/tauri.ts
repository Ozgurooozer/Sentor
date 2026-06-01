// No-op shims for Tauri APIs when running in a browser.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const invoke = async <T = unknown>(_cmd: string, _args?: unknown): Promise<T> => null as unknown as T;
export const emitTo = async (_target: string, _event: string, _payload?: unknown): Promise<void> => {};
export const emit = async (_event: string, _payload?: unknown): Promise<void> => {};
export const listen = async (_event: string, _handler: unknown): Promise<() => void> => () => {};

/** Stub for @tauri-apps/api/core Channel — no-op in browser. */
export class Channel<T = unknown> {
  onmessage: ((msg: T) => void) | null = null;
}

/** Stub for @tauri-apps/plugin-opener openUrl — opens in a new tab in browser. */
export const openUrl = (url: string): Promise<void> => {
  window.open(url, "_blank", "noopener,noreferrer");
  return Promise.resolve();
};
