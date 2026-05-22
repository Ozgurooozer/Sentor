import { usePreferencesStore } from "@/modules/settings/preferences";
import type { WebTab } from "@/modules/tabs";
import { invoke } from "@tauri-apps/api/core";
import { safeInvoke } from "@/lib/safeInvoke";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState } from "react";
import { AddressBar } from "./AddressBar";
import { addUrl, getHistory } from "./browserHistory";
import { loadBookmarks, toggleBookmark } from "./bookmarks";

type SearchResult = { url: string; title: string; snippet: string };

type Props = {
  tab: WebTab;
  isActive: boolean;
  onNavigate: (url: string) => void;
  onNavigateLocal: (url: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onTitleChange: (title: string) => void;
};

function resolveInput(input: string): { kind: "url" | "search" | "asset"; value: string } {
  const s = input.trim();
  if (!s) return { kind: "url", value: "" };
  if (/^https?:\/\//i.test(s)) return { kind: "url", value: s };
  if (/^asset:\/\//i.test(s)) return { kind: "asset", value: s };
  if (/^[a-z0-9-]+\.[a-z]{2,}(\/.*)?$/i.test(s)) return { kind: "url", value: `https://${s}` };
  return { kind: "search", value: s };
}

const webLabel = (id: number) => `atlas-web-${id}`;

export function WebBrowserPane({
  tab,
  isActive,
  onNavigate,
  onNavigateLocal,
  onGoBack,
  onGoForward,
  onTitleChange,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [urlHistory, setUrlHistory] = useState(() => getHistory());
  const searxngUrl = usePreferencesStore((s) => s.searxngUrl);
  // Tracks whether web_open has been called successfully.
  const openedRef = useRef(false);
  // The last URL we sent to the native webview, to avoid duplicate navigates.
  const lastNavUrlRef = useRef<string>("");
  // Tracks the URL currently loaded in the native webview (may differ from lastNavUrlRef
  // when a navigation fails and the webview lands on an error page).
  const liveUrlRef = useRef<string>("");
  // Mirror isActive prop so the async open callback can read current value.
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  const label = webLabel(tab.id);

  useEffect(() => {
    loadBookmarks().then((bm) => {
      setIsBookmarked(bm.some((b) => b.url === tab.url));
    });
    addUrl(tab.url);
    setUrlHistory(getHistory());
  }, [tab.url]);

  const readBounds = () => {
    const el = mountRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  };

  // Open the native child webview once on mount, always (with about:blank if no URL yet).
  useEffect(() => {
    const bounds = readBounds();
    const initialUrl = tab.url || "about:blank";
    lastNavUrlRef.current = tab.url; // track so URL-change effect skips the first nav

    const open = async () => {
      try {
        await invoke("web_open", {
          label,
          url: initialUrl,
          x: bounds?.x ?? 0,
          y: bounds?.y ?? 0,
          width: Math.max(bounds?.width ?? 400, 1),
          height: Math.max(bounds?.height ?? 300, 1),
        });
        openedRef.current = true;
        // Apply correct visibility now that the webview exists.
        if (!isActiveRef.current) {
          void safeInvoke("web_set_visible", { label, visible: false });
        }
      } catch (e) {
        console.error("web_open failed", e);
      }
    };
    void open();

    return () => {
      openedRef.current = false;
      invoke("web_close", { label }).catch(() => {/* already closed */});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigate when the tab URL changes (address bar input, back/forward, cross-scheme routing).
  useEffect(() => {
    if (!openedRef.current) return;
    if (!tab.url) return;
    if (tab.url === lastNavUrlRef.current) return;
    // Never navigate from inside a chrome-error page — it will be blocked by Chromium.
    // Wait for a real navigation (e.g. user types a new URL) to escape the error state.
    if (liveUrlRef.current.startsWith("chrome-error://")) return;
    lastNavUrlRef.current = tab.url;
    setIsLoading(true);
    void safeInvoke("web_navigate", { label, url: tab.url });
    const t = setTimeout(() => setIsLoading(false), 6000);
    return () => clearTimeout(t);
  }, [tab.url, label]);

  // Push bounds whenever the mount div resizes (sidebar toggle, window resize, pane split).
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let pending = 0;
    const push = () => {
      if (!openedRef.current) return;
      const b = readBounds();
      if (!b) return;
      void safeInvoke("web_set_bounds", { label, ...b });
    };
    const schedule = () => {
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        push();
      });
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      if (pending) cancelAnimationFrame(pending);
    };
  }, [label]);

  // Hide/show the native webview when the tab is active or not.
  // The native view sits above the DOM, so CSS alone can't cover it.
  useEffect(() => {
    if (!openedRef.current) return;
    void safeInvoke("web_set_visible", { label, visible: isActive });
    if (isActive) {
      const b = readBounds();
      if (b) void safeInvoke("web_set_bounds", { label, ...b });
    }
  }, [isActive, label]);

  // Sync address bar when the embedded page navigates itself (link clicks, redirects).
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<{ label: string; url: string }>("web://nav-changed", (e) => {
      if (e.payload.label !== label) return;
      setIsLoading(false);
      // Always track the live URL so we know when we're stuck on an error page.
      liveUrlRef.current = e.payload.url ?? "";
      // Ignore chrome-error pages: they mean the load failed (e.g. server not ready).
      // Keeping lastNavUrlRef as the intended URL lets the URL-change effect retry
      // once tab.url is updated again, rather than entering an infinite retry loop.
      if (e.payload.url?.startsWith("chrome-error://")) return;
      if (e.payload.url && e.payload.url !== lastNavUrlRef.current) {
        lastNavUrlRef.current = e.payload.url;
        onNavigate(e.payload.url);
      }
      try {
        const u = new URL(e.payload.url);
        onTitleChange(u.host || e.payload.url);
      } catch {
        /* keep current title */
      }
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [label, onNavigate, onTitleChange]);

  const handleNavigate = async (input: string) => {
    const { kind, value } = resolveInput(input);
    if (kind === "asset") {
      onNavigateLocal(value);
      return;
    }
    if (kind === "search") {
      setIsLoading(true);
      setSearchResults(null);
      try {
        const results = await invoke<SearchResult[]>("web_search", {
          query: value,
          limit: 8,
          searxngUrl,
        });
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setIsLoading(false);
      }
      return;
    }
    // URL — update tab state; the URL-change effect will call web_navigate.
    setSearchResults(null);
    if (value) onNavigate(value);
  };

  const handleToggleBookmark = async () => {
    const title = tab.title || tab.url;
    const nowBookmarked = await toggleBookmark(tab.url, title);
    setIsBookmarked(nowBookmarked);
  };

  const handleOpenExternal = () => {
    if (tab.url) openUrl(tab.url);
  };

  const canGoBack = tab.historyIdx > 0;
  const canGoForward = tab.historyIdx < tab.history.length - 1;
  const showSearchResults = searchResults !== null;

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
          if (tab.url) {
            setIsLoading(true);
            void safeInvoke("web_navigate", { label, url: tab.url });
          }
        }}
        onToggleBookmark={handleToggleBookmark}
        onOpenExternal={handleOpenExternal}
        history={urlHistory}
      />

      {/*
        Mount div always rendered so readBounds() works even before a URL is typed.
        The native webview is positioned over this rect by the Rust side.
        We hide it behind the search results overlay when showing them.
      */}
      <div
        ref={mountRef}
        className="flex-1"
        style={{ visibility: showSearchResults ? "hidden" : "visible" }}
      />

      {showSearchResults && (
        <div className="absolute inset-x-0 bottom-0 overflow-y-auto bg-background p-4" style={{ top: 36 }}>
          {searchResults!.length === 0 ? (
            <p className="text-sm text-muted-foreground">No results found.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {searchResults!.map((r) => (
                <button
                  key={r.url}
                  onClick={() => {
                    setSearchResults(null);
                    void handleNavigate(r.url);
                  }}
                  className="group rounded-lg border border-border/60 bg-card p-3 text-left transition-colors hover:border-border hover:bg-accent/10"
                >
                  <p className="truncate text-xs font-medium text-foreground group-hover:text-accent">
                    {r.title || r.url}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.url}</p>
                  {r.snippet && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/70">
                      {r.snippet}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!tab.url && !showSearchResults && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center" style={{ top: 36 }}>
          <p className="text-sm text-muted-foreground">Type a URL or search query above.</p>
        </div>
      )}
    </div>
  );
}
