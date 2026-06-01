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
