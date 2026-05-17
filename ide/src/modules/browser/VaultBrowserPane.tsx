import type { VaultTab } from "@/modules/tabs";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState } from "react";
import { AddressBar } from "./AddressBar";
import { localToAsset } from "./assetUrl";
import { loadBookmarks, toggleBookmark } from "./bookmarks";

const isAssetUrl = (url: string) => /^asset:\/\//i.test(url);

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
  // Treat free text as an external search; route to the Web tab.
  return { kind: "external", value: s };
}

export function VaultBrowserPane({ tab, onNavigate, onNavigateExternal, onGoBack, onGoForward, onTitleChange }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);

  useEffect(() => {
    loadBookmarks().then((bm) => {
      setIsBookmarked(bm.some((b) => b.url === tab.url));
    });
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
      />

      {showIframe && (
        <iframe
          ref={iframeRef}
          src={tab.url}
          onLoad={handleIframeLoad}
          className="h-full w-full flex-1 border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          title="vault"
        />
      )}

      {!showIframe && (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Type a path or vault URL above.</p>
        </div>
      )}
    </div>
  );
}
