import { convertFileSrc } from "@tauri-apps/api/core";

export function localToAsset(path: string): string {
  return convertFileSrc(path);
}

export function vaultPageAssetUrl(root: string, category: string, slug: string): string {
  const sep = root.includes("\\") ? "\\" : "/";
  return localToAsset(`${root}${sep}vault${sep}${category}${sep}${slug}${sep}index.html`);
}
