import { appDataDir } from "@tauri-apps/api/path";
import { native } from "@/modules/ai/lib/native";

export type Bookmark = { url: string; title: string; added: string };

async function bookmarksPath(): Promise<string> {
  const dir = await appDataDir();
  const sep = dir.includes("\\") ? "\\" : "/";
  return `${dir}${sep}bookmarks.json`;
}

export async function loadBookmarks(): Promise<Bookmark[]> {
  try {
    const path = await bookmarksPath();
    const r = await native.readFile(path);
    if (r.kind === "text") return JSON.parse(r.content) as Bookmark[];
  } catch {
    // none yet
  }
  return [];
}

export async function saveBookmarks(bm: Bookmark[]): Promise<void> {
  const path = await bookmarksPath();
  await native.writeFile(path, JSON.stringify(bm, null, 2));
}

export async function toggleBookmark(url: string, title: string): Promise<boolean> {
  const bm = await loadBookmarks();
  const idx = bm.findIndex((b) => b.url === url);
  if (idx >= 0) {
    bm.splice(idx, 1);
    await saveBookmarks(bm);
    return false;
  }
  bm.unshift({ url, title, added: new Date().toISOString() });
  await saveBookmarks(bm);
  return true;
}
