const KEY = "sentor-browser-history";
const MAX = 50;

export function addUrl(url: string): void {
  if (!url || url === "about:blank") return;
  const prev = getHistory().filter((u) => u !== url);
  const next = [url, ...prev].slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full */ }
}

export function getHistory(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch { return []; }
}
