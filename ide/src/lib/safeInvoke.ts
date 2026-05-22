import { invoke, type InvokeArgs } from "@tauri-apps/api/core";

/**
 * Fire-and-forget Tauri invoke that swallows the rejection but logs it.
 * Use this when you don't want the promise rejection to bubble (UI updates,
 * cleanup handlers, periodic background sync), but you still want errors to
 * show up in the console + log store instead of disappearing silently.
 *
 * For user-initiated actions where the error should be surfaced to the UI
 * (banner, toast, agentMeta.error), use `invoke(...).then(...).catch(...)`
 * directly and route the error explicitly.
 */
export function safeInvoke<T = void>(
  command: string,
  args?: InvokeArgs,
): Promise<T | null> {
  return (invoke(command, args) as Promise<T>).catch((err) => {
    console.error(`[invoke] ${command} failed:`, err);
    return null;
  });
}
