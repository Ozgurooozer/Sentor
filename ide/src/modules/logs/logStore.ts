import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export type LogLevel = "log" | "info" | "warn" | "error" | "debug" | "agent" | "system";

export interface LogEntry {
  id: number;
  ts: number;
  level: LogLevel;
  message: string;
}

const MAX_ENTRIES = 500;
let _seq = 0;

interface LogStore {
  entries: LogEntry[];
  add: (level: LogLevel, message: string) => void;
  clear: () => void;
}

export const useLogStore = create<LogStore>((set) => ({
  entries: [],
  add: (level, message) => {
    const entry: LogEntry = { id: ++_seq, ts: Date.now(), level, message };
    set((s) => ({
      entries:
        s.entries.length >= MAX_ENTRIES
          ? [...s.entries.slice(-MAX_ENTRIES + 1), entry]
          : [...s.entries, entry],
    }));
    scheduleFlush(entry);
  },
  clear: () => set({ entries: [] }),
}));

// ── Vault persistence ─────────────────────────────────────────────────────────

let _vaultRoot: string | null = null;

export function setLogVaultRoot(root: string) {
  _vaultRoot = root;
  if (_flushBuffer.length > 0) void doFlush();
}

let _flushBuffer: LogEntry[] = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(entry: LogEntry) {
  _flushBuffer.push(entry);
  // Flush errors immediately; batch everything else at 3s
  if (entry.level === "error") {
    if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
    void doFlush();
    return;
  }
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    void doFlush();
  }, 3000);
}

async function doFlush() {
  if (!_vaultRoot || _flushBuffer.length === 0) return;
  const batch = _flushBuffer;
  _flushBuffer = [];

  const date = new Date().toISOString().slice(0, 10);
  const dir = `${_vaultRoot}/vault/logs`;
  const path = `${dir}/${date}.json`;

  try {
    await invoke("fs_create_dir", { path: dir }).catch(() => undefined);
    const existing = await invoke<{ kind: string; content?: string }>(
      "fs_read_file",
      { path },
    ).catch(() => null);
    const prev: LogEntry[] =
      existing?.kind === "text" && existing.content
        ? (JSON.parse(existing.content) as LogEntry[])
        : [];
    const next = [...prev, ...batch].slice(-5000);
    await invoke("fs_write_file", { path, content: JSON.stringify(next, null, 2) });
  } catch {
    // Silently fail — don't create a log loop
  }
}

// ── Console interceptor ───────────────────────────────────────────────────────

let _intercepted = false;

function fmt(...args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

export function installLogInterceptor() {
  if (_intercepted) return;
  _intercepted = true;

  const { add } = useLogStore.getState();

  const origLog = console.log.bind(console);
  const origInfo = console.info.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  const origDebug = console.debug.bind(console);

  console.log = (...a: unknown[]) => {
    origLog(...a);
    add("log", fmt(...a));
  };
  console.info = (...a: unknown[]) => {
    origInfo(...a);
    add("info", fmt(...a));
  };
  console.warn = (...a: unknown[]) => {
    origWarn(...a);
    add("warn", fmt(...a));
  };
  console.error = (...a: unknown[]) => {
    origError(...a);
    add("error", fmt(...a));
  };
  console.debug = (...a: unknown[]) => {
    origDebug(...a);
    add("debug", fmt(...a));
  };

  window.addEventListener("error", (e) => {
    add("error", `[uncaught] ${e.message ?? String(e.error)}`);
  });
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const msg =
      e.reason instanceof Error ? e.reason.message : String(e.reason);
    add("error", `[promise] ${msg}`);
  });

  add("system", "Atlas OS — log stream started");
}

// ── Agent log helper (called from agent runner) ───────────────────────────────
export function logAgent(message: string) {
  useLogStore.getState().add("agent", message);
}
