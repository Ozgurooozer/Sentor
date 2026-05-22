import type { VaultTab } from "@/modules/tabs";
import { BacklinkPanel } from "@/modules/backlinks/BacklinkPanel";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState } from "react";
import { AddressBar } from "./AddressBar";
import { localToAsset } from "./assetUrl";
import { addUrl, getHistory } from "./browserHistory";
import { loadBookmarks, toggleBookmark } from "./bookmarks";

const isAssetUrl = (url: string) => /^asset:\/\//i.test(url);

/** Extract vault page ID from an asset:// URL, e.g. "home/atlas-os" */
function pageIdFromAssetUrl(url: string): string | null {
  const marker = "/vault/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  let rest = decodeURIComponent(url.slice(idx + marker.length));
  const qi = rest.indexOf("?");
  if (qi !== -1) rest = rest.slice(0, qi);
  if (rest.endsWith("/index.html")) rest = rest.slice(0, -"/index.html".length);
  if (rest.endsWith("/")) rest = rest.slice(0, -1);
  return rest || null;
}

/** Build asset URL for a page ID using the current tab URL as a base. */
function assetUrlForId(tabUrl: string, id: string): string {
  const marker = "/vault/";
  const idx = tabUrl.indexOf(marker);
  if (idx === -1) return tabUrl;
  return `${tabUrl.slice(0, idx + marker.length)}${id}/index.html`;
}

type Props = {
  tab: VaultTab;
  onNavigate: (url: string) => void;
  onNavigateExternal: (url: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onTitleChange: (title: string) => void;
};

function resolveInput(input: string): { kind: "asset" | "external"; value: string } {
  const s = input.trim();
  if (!s) return { kind: "asset", value: "" };
  if (/^https?:\/\//i.test(s)) return { kind: "external", value: s };
  if (/^asset:\/\//i.test(s)) return { kind: "asset", value: s };
  if (/^[a-zA-Z]:\\/.test(s) || s.startsWith("/")) return { kind: "asset", value: localToAsset(s) };
  if (/^[a-z0-9-]+\.[a-z]{2,}(\/.*)?$/i.test(s)) return { kind: "external", value: `https://${s}` };
  return { kind: "external", value: s };
}

export function VaultBrowserPane({ tab, onNavigate, onNavigateExternal, onGoBack, onGoForward, onTitleChange }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showBacklinks, setShowBacklinks] = useState(false);
  const [urlHistory, setUrlHistory] = useState(() => getHistory());

  const noteId = pageIdFromAssetUrl(tab.url);

  useEffect(() => {
    loadBookmarks().then((bm) => {
      setIsBookmarked(bm.some((b) => b.url === tab.url));
    });
    addUrl(tab.url);
    setUrlHistory(getHistory());
  }, [tab.url]);

  useEffect(() => {
    if (!tab.url) return;
    setIsLoading(true);
  }, [tab.url]);

  const handleNavigate = (input: string) => {
    const { kind, value } = resolveInput(input);
    if (kind === "external") {
      onNavigateExternal(value);
      return;
    }
    onNavigate(value);
  };

  const handleIframeLoad = () => {
    setIsLoading(false);
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc?.title) onTitleChange(doc.title);
      const href = iframeRef.current?.contentWindow?.location?.href;
      if (href && href !== "about:blank" && href !== tab.url) {
        onNavigate(href);
      }
    } catch {
      // asset:// pages are same-origin so this should always succeed.
    }
  };

  const handleToggleBookmark = async () => {
    const title = tab.title || tab.url;
    const nowBookmarked = await toggleBookmark(tab.url, title);
    setIsBookmarked(nowBookmarked);
  };

  const handleOpenExternal = () => {
    openUrl(tab.url);
  };

  const handleBacklinkNavigate = (id: string) => {
    onNavigate(assetUrlForId(tab.url, id));
  };

  const showIframe = tab.url && isAssetUrl(tab.url);
  const canGoBack = tab.historyIdx > 0;
  const canGoForward = tab.historyIdx < tab.history.length - 1;

  return (
    <div className="flex h-full flex-col">
      <AddressBar
        url={tab.url}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        isLoading={isLoading}
        isBookmarked={isBookmarked}
        onNavigate={handleNavigate}
        onGoBack={onGoBack}
        onGoForward={onGoForward}
        onReload={() => {
          if (iframeRef.current && tab.url) {
            setIsLoading(true);
            iframeRef.current.src = "";
            requestAnimationFrame(() => {
              if (iframeRef.current) iframeRef.current.src = tab.url;
            });
          }
        }}
        onToggleBookmark={handleToggleBookmark}
        onOpenExternal={handleOpenExternal}
        history={urlHistory}
        showBacklinksToggle={!!noteId}
        backlinksOpen={showBacklinks}
        onToggleBacklinks={() => setShowBacklinks((v) => !v)}
      />

      <div className="flex min-h-0 flex-1">
        {showIframe && (
          <iframe
            ref={iframeRef}
            src={tab.url}
            onLoad={handleIframeLoad}
            className="h-full min-w-0 flex-1 border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            title="vault"
          />
        )}

        {!showIframe && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">Type a path or vault URL above.</p>
          </div>
        )}

        {showBacklinks && noteId && (
          <div className="w-52 shrink-0">
            <BacklinkPanel noteId={noteId} onNavigate={handleBacklinkNavigate} />
          </div>
        )}
      </div>
    </div>
  );
}
