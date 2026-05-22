import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ErrorBoundary } from "./ErrorBoundary";
import { OnboardingWizard } from "@/modules/onboarding/OnboardingWizard";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  AgentRunBridge,
  AiInputBar,
  AiMiniWindow,
  hasAnyKey,
  SelectionAskAi,
  useChatStore,
} from "@/modules/ai";
import { AiInputBarConnect } from "@/modules/ai/components/AiInputBar";
import { AiComposerProvider } from "@/modules/ai/lib/composer";
import { useAgentsStore } from "@/modules/ai/store/agentsStore";
import { useSnippetsStore } from "@/modules/ai/store/snippetsStore";
import {
  AiDiffStack,
  EditorStack,
  NewEditorDialog,
  type EditorPaneHandle,
} from "@/modules/editor";
import { FileExplorer } from "@/modules/explorer";
import {
  Header,
  type SearchInlineHandle,
  type SearchTarget,
} from "@/modules/header";
import { PreviewStack, type PreviewPaneHandle } from "@/modules/preview";
import { openSettingsWindow } from "@/modules/settings/openSettingsWindow";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setBarCollapsed,
  setFocusedLeftOpen,
  setFocusedTopOpen,
  setLayoutMode,
} from "@/modules/settings/store";
import { installLogInterceptor, setLogVaultRoot } from "@/modules/logs/logStore";
import { startSentorIfNeeded, waitForSentor } from "@/modules/ai/tools/sentor";
import {
  ShortcutsDialog,
  useGlobalShortcuts,
  type ShortcutHandlers,
} from "@/modules/shortcuts";
import { BAR_HEIGHT } from "@/lib/constants";
import { FocusedBar } from "./FocusedChatCenter";
import { useApiKeys } from "./hooks/useApiKeys";
import { useDiffReloadTrigger } from "./hooks/useDiffReloadTrigger";
import { useLeafLifecycle } from "./hooks/useLeafLifecycle";
import { useMcpBridge } from "./hooks/useMcpBridge";
import { useVaultTrashCleanup } from "./hooks/useVaultTrashCleanup";
import { LauncherScreen } from "./LauncherScreen";
import { HitBitmapSync } from "@/modules/input";
import { InfiniteCanvas, PinnedPanelsPortal, useCanvasStore } from "@/modules/canvas";
import { BrowserStack } from "@/modules/browser/BrowserStack";
import { localToAsset } from "@/modules/browser/assetUrl";
import { VaultHomePane } from "@/modules/vault-home/VaultHomePane";
import { AgentsOfficePane } from "@/modules/agents-office/AgentsOfficePane";
import { GraphPane } from "@/modules/graph/GraphPane";
import { AgentSwitcherModal } from "@/modules/agents-office/AgentSwitcherModal";
import { StatusBar } from "@/modules/statusbar";
import { MAX_PANES_PER_TAB, useTabs, useWorkspaceCwd, type NavigableTab, type Tab } from "@/modules/tabs";
import {
  hasLeaf,
  leafIds,
  respawnSession,
  TerminalStack,
  type TerminalPaneHandle,
  type AtlasOpenInput,
} from "@/modules/terminal";
import { ThemeProvider } from "@/modules/theme";
import { UpdaterDialog } from "@/modules/updater";
import { listen } from "@tauri-apps/api/event";
import { homeDir } from "@tauri-apps/api/path";
import type { SearchAddon } from "@xterm/addon-search";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";

function sameOrigin(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.host === ub.host && ua.protocol === ub.protocol;
  } catch {
    return a === b;
  }
}

function isNavigableTab(t: Tab): t is NavigableTab {
  return t.kind === "vault" || t.kind === "web";
}

/** Tailwind class shared by all full-bleed workspace pane wrappers. */
const STACK_CLASS = "absolute inset-0 px-3 pt-2 pb-2";

export default function App() {
  const {
    tabs,
    activeId,
    setActiveId,
    newTab,
    openFileTab,
    pinTab,
    newPreviewTab,
    openAiDiffTab,
    setAiDiffStatus,
    closeTab,
    updateTab,
    selectByIndex,
    setLeafCwd,
    focusPane,
    focusNextPaneInTab,
    splitActivePane,
    closeActivePane,
    closePaneByLeaf,
    openVaultTab,
    openWebTab,
    openVaultHomeTab,
    openGraphTab,
    openAgentsOfficeTab,
    updateNavTabUrl,
    navigateTabHistory,
  } = useTabs();

  // Mirror `tabs` into a ref so callbacks scheduled with `setTimeout`
  // (e.g. cdInNewTab) read the latest pane state instead of a stale closure.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const activeTerminalTab = useMemo(() => {
    const t = tabs.find((x) => x.id === activeId);
    return t && t.kind === "terminal" ? t : null;
  }, [tabs, activeId]);
  const activeLeafId = activeTerminalTab?.activeLeafId ?? null;

  const searchAddons = useRef<Map<number, SearchAddon>>(new Map());
  const [activeSearchAddon, setActiveSearchAddon] =
    useState<SearchAddon | null>(null);
  const searchInlineRef = useRef<SearchInlineHandle | null>(null);
  const terminalRefs = useRef<Map<number, TerminalPaneHandle>>(new Map());
  const editorRefs = useRef<Map<number, EditorPaneHandle>>(new Map());
  const previewRefs = useRef<Map<number, PreviewPaneHandle>>(new Map());
  const detectedUrls = useRef<Map<number, string>>(new Map());
  const [activeDetectedUrl, setActiveDetectedUrl] = useState<string | null>(
    null,
  );
  const [activeEditorHandle, setActiveEditorHandle] =
    useState<EditorPaneHandle | null>(null);
  const sidebarRef = useRef<PanelImperativeHandle | null>(null);
  const [sidebarMode, setSidebarMode] = useState<"workspace" | "vault">("workspace");
  const toggleSidebar = useCallback(() => {
    const p = sidebarRef.current;
    if (!p) return;
    if (p.getSize().asPercentage <= 0) p.expand();
    else p.collapse();
  }, []);

  const [home, setHome] = useState<string | null>(null);
  const [pendingCloseTab, setPendingCloseTab] = useState<number | null>(null);
  useEffect(() => {
    // Forward-slash form so explorerRoot stays equal across home → OSC 7.
    homeDir()
      .then((p) => setHome(p.replace(/\\/g, "/")))
      .catch(() => setHome(null));
  }, []);

  // Backslash-format fallback used when the user hasn't picked a workspace yet.
  // workspaceRoot from prefs is already backslash-form; home arrives as forward-slash.
  const fallbackWorkspace = useMemo(
    () => (home ? home.replace(/\//g, "\\") : ""),
    [home],
  );

  const [showLauncher, setShowLauncher] = useState(false);
  const [clickThrough, setClickThrough] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [newEditorOpen, setNewEditorOpen] = useState(false);
  const [agentSwitcherOpen, setAgentSwitcherOpen] = useState(false);
  const miniOpen = useChatStore((s) => s.mini.open);
  const openMini = useChatStore((s) => s.openMini);
  const focusInput = useChatStore((s) => s.focusInput);
  const openPanel = useChatStore((s) => s.openPanel);
  const panelOpen = useChatStore((s) => s.panelOpen);
  const apiKeys = useChatStore((s) => s.apiKeys);
  const setApiKeys = useChatStore((s) => s.setApiKeys);
  const setSelectedModelId = useChatStore((s) => s.setSelectedModelId);
  const setLive = useChatStore((s) => s.setLive);
  const respondToApproval = useChatStore((s) => s.respondToApproval);
  const hasComposer = hasAnyKey(apiKeys);
  const agentStatus = useChatStore((s) => s.agentMeta.status);

  const { keysLoaded } = useApiKeys(setApiKeys);

  // Hydrate the cross-window preference store and mirror the default model
  // into chatStore so the dropdown reflects what the user picked in Settings.
  const initPrefs = usePreferencesStore((s) => s.init);
  const prefDefaultModel = usePreferencesStore((s) => s.defaultModelId);
  const prefsHydrated = usePreferencesStore((s) => s.hydrated);
  const layoutMode = usePreferencesStore((s) => s.layoutMode);
  const sentorPath = usePreferencesStore((s) => s.sentorPath);
  const barCollapsed = usePreferencesStore((s) => s.barCollapsed);
  const focusedTopOpen = usePreferencesStore((s) => s.focusedTopOpen);
  const focusedLeftOpen = usePreferencesStore((s) => s.focusedLeftOpen);
  const onboarded = usePreferencesStore((s) => s.onboarded);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const activeAgentId = useAgentsStore((s) => s.activeId);
  const hasPinnedPanel = useCanvasStore((s) => s.panels.some((p) => p.pinned));
  const canvasHydrated = useCanvasStore((s) => s.hydrated);
  const ensureSystemCanvas = useCanvasStore((s) => s.ensureSystemCanvas);
  const switchVault = useCanvasStore((s) => s.switchVault);
  const workspaceRoot = usePreferencesStore((s) => s.workspaceRoot);

  // Switch per-vault canvas when the workspace root changes.
  useEffect(() => {
    if (workspaceRoot) void switchVault(workspaceRoot);
  }, [workspaceRoot, switchVault]);

  useEffect(() => {
    if (!canvasHydrated) return;
    ensureSystemCanvas(workspaceRoot ?? fallbackWorkspace);
  }, [canvasHydrated, ensureSystemCanvas, workspaceRoot]);

  // Show onboarding wizard on first launch (before prefs hydrated, keep hidden)
  useEffect(() => {
    if (prefsHydrated && !onboarded) {
      setShowOnboarding(true);
    }
  }, [prefsHydrated, onboarded]);

  useMcpBridge({
    canvasHydrated,
    workspaceRoot: workspaceRoot ?? fallbackWorkspace,
    openVaultTab,
    openWebTab,
    openPanel,
    focusInput,
  });

  useVaultTrashCleanup(workspaceRoot ?? fallbackWorkspace);
  useEffect(() => {
    void initPrefs();
    installLogInterceptor();
  }, [initPrefs]);

  // Keep log store's vault root in sync with workspace root
  useEffect(() => {
    if (workspaceRoot) setLogVaultRoot(workspaceRoot);
  }, [workspaceRoot]);
  useEffect(() => {
    if (!prefsHydrated) return;
    setSelectedModelId(prefDefaultModel);
  }, [prefsHydrated, prefDefaultModel, setSelectedModelId]);

  const hydrateSessions = useChatStore((s) => s.hydrateSessions);
  useEffect(() => {
    void hydrateSessions();
    void useAgentsStore.getState().hydrate();
    void useSnippetsStore.getState().hydrate();
  }, [hydrateSessions]);

  const activeTab = tabs.find((t) => t.id === activeId);
  const isTerminalTab = activeTab?.kind === "terminal";
  const isEditorTab = activeTab?.kind === "editor";
  const isPreviewTab = activeTab?.kind === "preview";
  const isAiDiffTab = activeTab?.kind === "ai-diff";
  const isBrowserTab = activeTab?.kind === "vault" || activeTab?.kind === "web";
  const isVaultHomeTab = activeTab?.kind === "vault-home";
  const isAgentsOfficeTab = activeTab?.kind === "agents-office";
  const isGraphTab = activeTab?.kind === "graph";

  useDiffReloadTrigger(tabs, editorRefs);

  const { explorerRoot, inheritedCwdForNewTab } = useWorkspaceCwd(
    activeTab,
    tabs,
    home,
  );

  useEffect(() => {
    setActiveSearchAddon(
      activeLeafId !== null ? (searchAddons.current.get(activeLeafId) ?? null) : null,
    );
    setActiveEditorHandle(editorRefs.current.get(activeId) ?? null);
    setActiveDetectedUrl(
      activeLeafId !== null ? (detectedUrls.current.get(activeLeafId) ?? null) : null,
    );
  }, [activeId, activeLeafId]);

  const handleDetectedLocalUrl = useCallback(
    (leafId: number, url: string) => {
      detectedUrls.current.set(leafId, url);
      if (leafId === activeLeafId) setActiveDetectedUrl(url);
    },
    [activeLeafId],
  );

  // Suppress the chip once a preview tab already targets the detected URL —
  // avoids prompting users to re-open a tab they already have.
  const detectedPreviewUrl = useMemo(() => {
    if (!isTerminalTab || !activeDetectedUrl) return null;
    const alreadyOpen = tabs.some(
      (t) => t.kind === "preview" && sameOrigin(t.url, activeDetectedUrl),
    );
    return alreadyOpen ? null : activeDetectedUrl;
  }, [isTerminalTab, activeDetectedUrl, tabs]);

  const handleSearchReady = useCallback(
    (leafId: number, addon: SearchAddon) => {
      searchAddons.current.set(leafId, addon);
      if (leafId === activeLeafId) setActiveSearchAddon(addon);
    },
    [activeLeafId],
  );

  const disposeTab = useCallback(
    (id: number) => {
      // Terminal-leaf-keyed maps (terminalRefs/searchAddons/detectedUrls)
      // are pruned by the effect below as the pane tree changes; only the
      // tab-id-keyed handles need explicit cleanup here.
      editorRefs.current.delete(id);
      previewRefs.current.delete(id);
      closeTab(id);
    },
    [closeTab],
  );

  useLeafLifecycle(tabs, { terminalRefs, searchAddons, detectedUrls });

  const handleClose = useCallback(
    (id: number) => {
      const t = tabs.find((x) => x.id === id);
      if (t?.kind === "editor" && t.dirty) {
        setPendingCloseTab(id);
        return;
      }
      disposeTab(id);
    },
    [tabs, disposeTab],
  );

  const confirmClose = useCallback(() => {
    if (pendingCloseTab !== null) {
      disposeTab(pendingCloseTab);
      setPendingCloseTab(null);
    }
  }, [pendingCloseTab, disposeTab]);

  const cancelClose = useCallback(() => {
    setPendingCloseTab(null);
  }, []);

  const cycleTab = useCallback(
    (delta: 1 | -1) => {
      if (tabs.length < 2) return;
      const idx = tabs.findIndex((t) => t.id === activeId);
      const nextIdx = (idx + delta + tabs.length) % tabs.length;
      setActiveId(tabs[nextIdx].id);
    },
    [tabs, activeId, setActiveId],
  );

  const captureActiveSelection = useCallback((): string | null => {
    const t = tabs.find((x) => x.id === activeId);
    if (!t) return null;
    if (t.kind === "terminal") {
      const lid = t.activeLeafId;
      return terminalRefs.current.get(lid)?.getSelection() ?? null;
    }
    if (t.kind === "editor") {
      return editorRefs.current.get(activeId)?.getSelection() ?? null;
    }
    return null;
  }, [tabs, activeId]);

  const togglePanelAndFocus = useCallback(() => {
    if (!hasComposer) {
      void openSettingsWindow("models");
      return;
    }
    if (panelOpen) {
      useChatStore.getState().closePanel();
    } else {
      openPanel();
      focusInput(null);
    }
  }, [hasComposer, panelOpen, openPanel, focusInput]);

  const attachSelection = useChatStore((s) => s.attachSelection);

  const handleAttachFileToAgent = useCallback(
    (path: string) => {
      if (!hasComposer) {
        void openSettingsWindow("models");
        return;
      }
      // Dispatch a window event the composer listens for. Same pattern as
      // selections — keeps file-explorer decoupled from the AI module.
      window.dispatchEvent(
        new CustomEvent<string>("atlas:ai-attach-file", { detail: path }),
      );
      openPanel();
      focusInput(null);
    },
    [hasComposer, openPanel, focusInput],
  );

  const askFromSelection = useCallback(() => {
    if (!hasComposer) {
      void openSettingsWindow("models");
      return;
    }
    const selection = captureActiveSelection();
    if (!selection || !selection.trim()) {
      focusInput(null);
      return;
    }
    const source: "terminal" | "editor" =
      activeTab?.kind === "editor" ? "editor" : "terminal";
    attachSelection(selection, source);
  }, [
    hasComposer,
    captureActiveSelection,
    focusInput,
    attachSelection,
    activeTab,
  ]);

  const [askPopup, setAskPopup] = useState<{ x: number; y: number } | null>(
    null,
  );

  useEffect(() => {
    const isInsideAi = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      return !!(
        el.closest("[data-selection-ask-ai]") ||
        el.closest("[data-ai-input-bar]") ||
        el.closest("[data-ai-mini-window]")
      );
    };

    const onDown = (e: MouseEvent) => {
      if (isInsideAi(e.target)) return;
      setAskPopup(null);
    };
    const onUp = (e: MouseEvent) => {
      if (isInsideAi(e.target)) return;
      // Defer one tick so xterm/CodeMirror finalize the selection.
      setTimeout(() => {
        const text = captureActiveSelection();
        if (text && text.trim().length > 0) {
          setAskPopup({ x: e.clientX, y: e.clientY });
        } else {
          setAskPopup(null);
        }
      }, 0);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup", onUp);
    };
  }, [captureActiveSelection]);

  const onAskFromSelection = useCallback(() => {
    askFromSelection();
    setAskPopup(null);
  }, [askFromSelection]);

  const openNewTab = useCallback(() => {
    newTab(inheritedCwdForNewTab());
  }, [newTab, inheritedCwdForNewTab]);

  const sendCd = useCallback(
    (path: string) => {
      if (activeLeafId === null) return;
      const term = terminalRefs.current.get(activeLeafId);
      if (!term) return;
      const quoted = path.includes(" ")
        ? `'${path.replace(/'/g, `'\\''`)}'`
        : path;
      term.write(`cd ${quoted}\r`);
      term.focus();
    },
    [activeLeafId],
  );

  const cdInNewTab = useCallback(
    (path: string) => {
      const tabId = newTab(path);
      setTimeout(() => {
        const tab = tabsRef.current.find((x) => x.id === tabId);
        if (!tab || tab.kind !== "terminal") return;
        const t = terminalRefs.current.get(tab.activeLeafId);
        if (!t) return;
        const quoted = path.includes(" ")
          ? `'${path.replace(/'/g, `'\\''`)}'`
          : path;
        t.write(`cd ${quoted}\r`);
        t.focus();
      }, 80);
    },
    [newTab],
  );

  const handleOpenFile = useCallback(
    (path: string, pin?: boolean) => {
      // Explorer defaults to preview (pin=false); explicit actions like
      // context-menu "Open" pass pin=true for a persistent tab.
      openFileTab(path, pin ?? false);
    },
    [openFileTab],
  );

  const handlePathRenamed = useCallback(
    (from: string, to: string) => {
      for (const t of tabs) {
        if (t.kind !== "editor") continue;
        if (t.path === from) {
          const i = to.lastIndexOf("/");
          updateTab(t.id, { path: to, title: i === -1 ? to : to.slice(i + 1) });
        } else if (t.path.startsWith(`${from}/`)) {
          const suffix = t.path.slice(from.length);
          const newPath = `${to}${suffix}`;
          const i = newPath.lastIndexOf("/");
          updateTab(t.id, {
            path: newPath,
            title: i === -1 ? newPath : newPath.slice(i + 1),
          });
        }
      }
    },
    [tabs, updateTab],
  );

  const handlePathDeleted = useCallback(
    (path: string) => {
      for (const t of tabs) {
        if (t.kind !== "editor") continue;
        if (t.path === path || t.path.startsWith(`${path}/`)) {
          disposeTab(t.id);
        }
      }
    },
    [tabs, disposeTab],
  );

  const activeFilePath = activeTab?.kind === "editor" ? activeTab.path : null;

  const openPreviewTab = useCallback(
    (url: string) => {
      const id = newPreviewTab(url);
      // Focus the address bar if the URL is empty so the user can type.
      if (!url) {
        setTimeout(() => previewRefs.current.get(id)?.focusAddressBar(), 0);
      }
      return id;
    },
    [newPreviewTab],
  );

  // Auto-open a browser tab when Atlas-Maker writes a vault page.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<{ path: string; category: string; slug: string }>(
      "atlas://vault-page-written",
      (e) => {
        const assetUrl = localToAsset(e.payload.path);
        openVaultTab(assetUrl);
      },
    ).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [openVaultTab]);

  const splitActivePaneInActiveTab = useCallback(
    (dir: "row" | "col") => {
      const t = tabsRef.current.find((x) => x.id === activeId);
      if (!t || t.kind !== "terminal") return;
      splitActivePane(activeId, dir);
    },
    [activeId, splitActivePane],
  );

  const handleCloseTabOrPane = useCallback(() => {
    const t = tabsRef.current.find((x) => x.id === activeId);
    if (t?.kind === "terminal" && leafIds(t.paneTree).length > 1) {
      closeActivePane(activeId);
      return;
    }
    handleClose(activeId);
  }, [activeId, closeActivePane, handleClose]);

  // Gathers all interactive screen regions (chat + pinned panels) and pushes them to the
  // OS hit-bitmap so those areas stay visible AND receive mouse events when click-through
  // is active. SetWindowRgn clips everything outside the region — panels MUST be included.
  const applyClickThrough = useCallback((enabled: boolean) => {
    const dpr = window.devicePixelRatio || 1;
    const sw = Math.round(window.screen.width * dpr);
    const sh = Math.round(window.screen.height * dpr);
    const bh = Math.round(BAR_HEIGHT * dpr);

    const regions: number[][] = [];

    if (enabled) {
      // Chat balloon — read from DOM so we get the live rect after drag/resize
      const chatEl = document.querySelector("[data-ai-mini-window]");
      if (chatEl) {
        const r = chatEl.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          regions.push([
            Math.round(r.left * dpr),
            Math.round(r.top * dpr),
            Math.round(r.width * dpr),
            Math.round(r.height * dpr),
          ]);
        }
      }
      // Every pinned canvas panel — use store screen-space positions
      for (const panel of useCanvasStore.getState().panels) {
        if (!panel.pinned) continue;
        const sx = panel.screenX ?? 0;
        const sy = panel.screenY ?? 0;
        regions.push([
          Math.round(sx * dpr),
          Math.round(sy * dpr),
          Math.round(panel.width * dpr),
          Math.round(panel.height * dpr),
        ]);
      }
    }

    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke("set_click_through", { enabled, screenW: sw, screenH: sh, barH: bh, regions })
        .catch((e) => console.error("[invoke] set_click_through failed:", e));
    }).catch(() => undefined);
  }, []);

  const toggleClickThrough = useCallback(() => {
    if (layoutMode !== "focused") return;
    const next = !clickThrough;
    setClickThrough(next);
    applyClickThrough(next);
  }, [layoutMode, clickThrough, applyClickThrough]);

  // Tray menu wiring — Rust emits these events when the user picks a tray item.
  useEffect(() => {
    let unsubA: (() => void) | undefined;
    let unsubB: (() => void) | undefined;
    let unsubC: (() => void) | undefined;
    import("@tauri-apps/api/event").then(async ({ listen }) => {
      unsubA = await listen("atlas://tray-toggle-focused", () => {
        void setLayoutMode(layoutMode === "focused" ? "classic" : "focused");
      });
      unsubB = await listen("atlas://tray-toggle-click-through", () => {
        toggleClickThrough();
      });
      unsubC = await listen("atlas://open-launcher", () => {
        setShowLauncher(true);
      });
    }).catch(() => undefined);
    return () => { unsubA?.(); unsubB?.(); unsubC?.(); };
  }, [layoutMode, toggleClickThrough]);

  const shortcutHandlers = useMemo<ShortcutHandlers>(
    () => ({
      "tab.new": openNewTab,
      "tab.newPreview": () => openPreviewTab(""),
      "tab.newEditor": () => setNewEditorOpen(true),
      "tab.close": handleCloseTabOrPane,
      "tab.next": () => cycleTab(1),
      "tab.prev": () => cycleTab(-1),
      "tab.selectByIndex": (e) => selectByIndex(parseInt(e.key, 10) - 1),
      "pane.splitRight": () => splitActivePaneInActiveTab("row"),
      "pane.splitDown": () => splitActivePaneInActiveTab("col"),
      "pane.focusNext": () => focusNextPaneInTab(activeId, 1),
      "pane.focusPrev": () => focusNextPaneInTab(activeId, -1),
      "search.focus": () => searchInlineRef.current?.focus(),
      "ai.toggle": togglePanelAndFocus,
      "ai.askSelection": askFromSelection,
      "shortcuts.open": () => setShortcutsOpen((v) => !v),
      "settings.open": () => void openSettingsWindow(),
      "sidebar.toggle": toggleSidebar,
      "tab.vaultHome": () => openVaultHomeTab(),
      "ai.switchAgent": () => setAgentSwitcherOpen((v) => !v),
      "layout.toggleFocused": () =>
        void setLayoutMode(layoutMode === "focused" ? "classic" : "focused"),
      "layout.toggleClickThrough": toggleClickThrough,
      "graph.open": () => openGraphTab(),
    }),
    [
      activeId,
      cycleTab,
      handleCloseTabOrPane,
      layoutMode,
      openNewTab,
      openPreviewTab,
      selectByIndex,
      splitActivePaneInActiveTab,
      focusNextPaneInTab,
      togglePanelAndFocus,
      askFromSelection,
      toggleSidebar,
      openVaultHomeTab,
      openGraphTab,
      toggleClickThrough,
    ],
  );

  useGlobalShortcuts(shortcutHandlers);

  const registerTerminalHandle = useCallback(
    (leafId: number, h: TerminalPaneHandle | null) => {
      if (h) terminalRefs.current.set(leafId, h);
      else terminalRefs.current.delete(leafId);
    },
    [],
  );

  const registerEditorHandle = useCallback(
    (id: number, h: EditorPaneHandle | null) => {
      if (h) editorRefs.current.set(id, h);
      else editorRefs.current.delete(id);
      if (id === activeId) setActiveEditorHandle(h);
    },
    [activeId],
  );

  const registerPreviewHandle = useCallback(
    (id: number, h: PreviewPaneHandle | null) => {
      if (h) previewRefs.current.set(id, h);
      else previewRefs.current.delete(id);
    },
    [],
  );

  const handlePreviewUrl = useCallback(
    (id: number, url: string) => updateTab(id, { url }),
    [updateTab],
  );

  const handleTerminalCwd = useCallback(
    (leafId: number, cwd: string) => setLeafCwd(leafId, cwd),
    [setLeafCwd],
  );

  const handleFocusLeaf = useCallback(
    (tabId: number, leafId: number) => focusPane(tabId, leafId),
    [focusPane],
  );

  const handleLeafExit = useCallback(
    (leafId: number, _code: number) => {
      const all = tabsRef.current;
      const tab = all.find(
        (t) => t.kind === "terminal" && hasLeaf(t.paneTree, leafId),
      );
      if (!tab || tab.kind !== "terminal") return;
      const isLast =
        leafIds(tab.paneTree).length === 1 &&
        all.filter((t) => t.kind === "terminal").length === 1;
      if (isLast) {
        void respawnSession(leafId, tab.cwd);
      } else {
        closePaneByLeaf(leafId);
      }
    },
    [closePaneByLeaf],
  );

  const handleAtlasOpen = useCallback(
    (_tabId: number, input: AtlasOpenInput) => {
      // Always open in a new tab
      openFileTab(input.file);
    },
    [openFileTab],
  );

  const handleEditorDirty = useCallback(
    (id: number, dirty: boolean) => updateTab(id, { dirty }),
    [updateTab],
  );

  const searchTarget = useMemo<SearchTarget>(() => {
    if (isTerminalTab && activeSearchAddon)
      return {
        kind: "terminal",
        addon: activeSearchAddon,
        focus: () => terminalRefs.current.get(activeId)?.focus(),
      };
    if (isEditorTab && activeEditorHandle)
      return {
        kind: "editor",
        handle: activeEditorHandle,
        focus: () => activeEditorHandle.focus(),
      };
    return null;
  }, [isTerminalTab, isEditorTab, activeId, activeSearchAddon, activeEditorHandle]);

  const activeCwd =
    activeTab?.kind === "terminal" ? (activeTab.cwd ?? null) : null;

  useEffect(() => {
    const findCwd = () => {
      const active = tabs.find((x) => x.id === activeId);
      if (active?.kind === "terminal" && active.cwd) return active.cwd;
      for (let i = tabs.length - 1; i >= 0; i--) {
        const t = tabs[i];
        if (t.kind === "terminal" && t.cwd) return t.cwd;
      }
      return explorerRoot ?? home ?? null;
    };

    setLive({
      getCwd: findCwd,
      getTerminalContext: () => {
        if (activeTab?.kind !== "terminal") return null;
        return terminalRefs.current.get(activeTab.activeLeafId)?.getBuffer(300) ?? null;
      },
      injectIntoActivePty: (text) => {
        if (activeTab?.kind !== "terminal") return false;
        const term = terminalRefs.current.get(activeTab.activeLeafId);
        if (!term) return false;
        term.write(text);
        term.focus();
        return true;
      },
      getWorkspaceRoot: () => explorerRoot ?? home ?? null,
      getActiveFile: () => {
        return activeTab?.kind === "editor" ? activeTab.path : null;
      },
      openPreview: (url: string) => {
        openPreviewTab(url);
        return true;
      },
    });
  }, [setLive, activeId, tabs, explorerRoot, home, openPreviewTab]);

  // Toggle always-on-top + fill the screen when entering focused mode.
  // Also stay on top in classic mode when the user has pinned floating panels,
  // so those panels remain visible above other application windows.
  useEffect(() => {
    import("@tauri-apps/api/window").then(async ({ getCurrentWindow, LogicalSize, LogicalPosition }) => {
      const win = getCurrentWindow();
      if (layoutMode === "focused") {
        await win.setAlwaysOnTop(true);
        const w = window.screen.width;
        const h = window.screen.height;
        await win.setSize(new LogicalSize(w, h));
        await win.setPosition(new LogicalPosition(0, 0));
      } else {
        // Keep always-on-top if user has pinned panels floating above desktop
        await win.setAlwaysOnTop(hasPinnedPanel);
        await win.setSize(new LogicalSize(1280, 800));
      }
    }).catch(() => undefined);
  }, [layoutMode, hasPinnedPanel]);

  // Sync layoutMode to <html data-layout="..."> so CSS can make body transparent.
  useEffect(() => {
    document.documentElement.dataset.layout = layoutMode;
    return () => { delete document.documentElement.dataset.layout; };
  }, [layoutMode]);

  // Disable click-through when leaving focused mode.
  useEffect(() => {
    if (layoutMode !== "focused" && clickThrough) {
      setClickThrough(false);
      applyClickThrough(false);
    }
  }, [layoutMode, clickThrough, applyClickThrough]);

  // Re-sync the OS hit region whenever the chat opens/closes while click-through is ON
  useEffect(() => {
    if (!clickThrough) return;
    applyClickThrough(true);
  }, [miniOpen, clickThrough, applyClickThrough]);

  // Re-sync when pinned panels are added, moved, or resized while click-through is ON.
  // SetWindowRgn must include every panel rect or those areas become invisible.
  const pinnedPanelsSig = useCanvasStore((s) =>
    s.panels
      .filter((p) => p.pinned)
      .map((p) => `${p.id}:${p.screenX ?? 0}:${p.screenY ?? 0}:${p.width}:${p.height}`)
      .join("|"),
  );
  useEffect(() => {
    if (!clickThrough || layoutMode !== "focused") return;
    applyClickThrough(true);
  }, [pinnedPanelsSig, clickThrough, layoutMode, applyClickThrough]);

  // Auto-open chat balloon when the agent starts responding in focused mode.
  useEffect(() => {
    if (layoutMode === "focused" && !miniOpen && agentStatus === "thinking") {
      openMini();
    }
  }, [agentStatus, layoutMode, miniOpen, openMini]);

  // When the Sentor agent is selected: auto-start the server and open its UI in a Web tab.
  // We use a ref to fire only once per agent-selection, not on every tabs change.
  const sentorInitRef = useRef(false);
  useEffect(() => {
    if (activeAgentId !== "builtin:sentor") {
      sentorInitRef.current = false;
      return;
    }
    if (sentorInitRef.current) return;
    sentorInitRef.current = true;
    const tabId = openWebTab("");
    void (async () => {
      await startSentorIfNeeded(sentorPath);
      const ready = await waitForSentor();
      if (ready) updateNavTabUrl(tabId, "http://localhost:3000");
    })();
  }, [activeAgentId, sentorPath, openWebTab, updateNavTabUrl]);

  // Focused = transparent overlay window with full IDE features.
  // Top header (collapsible) + left panel (collapsible) + content stacks + log bar.
  const focusedMain = (
    <main className="flex min-h-0 flex-1 flex-col">
      {/* Collapsible top header with tab bar */}
      {focusedTopOpen && (
        <div className="shrink-0 border-b border-border/40">
          <Header
            tabs={tabs}
            activeId={activeId}
            onSelect={setActiveId}
            onNew={openNewTab}
            onNewPreview={() => openPreviewTab("")}
            onNewEditor={() => setNewEditorOpen(true)}
            onNewBrowser={() => openWebTab("")}
            onNewVaultHome={() => openVaultHomeTab()}
            onNewSentor={() => {
              const tabId = openWebTab("");
              void (async () => {
                await startSentorIfNeeded(sentorPath);
                const ready = await waitForSentor();
                if (ready) updateNavTabUrl(tabId, "http://localhost:3000");
              })();
            }}
            onClose={handleClose}
            onPin={pinTab}
            onToggleSidebar={() => void setFocusedLeftOpen(!focusedLeftOpen)}
            onSplit={splitActivePaneInActiveTab}
            canSplit={
              activeTerminalTab !== null &&
              leafIds(activeTerminalTab.paneTree).length < MAX_PANES_PER_TAB
            }
            onOpenShortcuts={() => setShortcutsOpen(true)}
            onOpenSettings={() => void openSettingsWindow()}
            onEnterFocusedMode={() => void setLayoutMode("classic")}
            onOpenAgentSwitcher={() => setAgentSwitcherOpen(true)}
            onOpenGraph={() => openGraphTab()}
            onOpenLauncher={() => setShowLauncher(true)}
            searchTarget={searchTarget}
            searchRef={searchInlineRef}
          />
        </div>
      )}

      {/* Body: left panel + content */}
      <div className="flex min-h-0 flex-1">
        {/* Collapsible left panel — file explorer */}
        {focusedLeftOpen && (
          <div className="flex w-[220px] shrink-0 flex-col overflow-hidden border-r border-border/40 bg-[#111111]/95">
            <div className="flex h-7 shrink-0 items-center gap-1 border-b border-border/40 px-1.5">
              {(["workspace", "vault"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSidebarMode(mode)}
                  className={cn(
                    "flex-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                    sidebarMode === mode
                      ? "bg-accent/60 text-foreground"
                      : "text-muted-foreground hover:bg-accent/30 hover:text-foreground",
                  )}
                >
                  {mode === "workspace" ? "Files" : "Vault"}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              <FileExplorer
                rootPath={
                  sidebarMode === "vault"
                    ? ((workspaceRoot ?? explorerRoot ?? "").replace(/\\/g, "/") + "/vault")
                    : explorerRoot
                }
                onOpenFile={handleOpenFile}
                onOpenBrowserTab={(url) => openVaultTab(url)}
                onPathRenamed={handlePathRenamed}
                onPathDeleted={handlePathDeleted}
                onRevealInTerminal={cdInNewTab}
                onAttachToAgent={handleAttachFileToAgent}
              />
            </div>
          </div>
        )}

        {/* Center: canvas + tab content stacks */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Infinite canvas — background layer */}
          <InfiniteCanvas />

          {/* Tab content stacks overlay the canvas when a tab is active */}
          <div
            className={cn(STACK_CLASS, !isTerminalTab && "invisible pointer-events-none")}
            aria-hidden={!isTerminalTab}
          >
            <TerminalStack
              tabs={tabs}
              activeId={activeId}
              registerHandle={registerTerminalHandle}
              onSearchReady={handleSearchReady}
              onCwd={handleTerminalCwd}
              onDetectedLocalUrl={handleDetectedLocalUrl}
              onExit={handleLeafExit}
              onAtlasOpen={handleAtlasOpen}
              onFocusLeaf={handleFocusLeaf}
            />
          </div>
          <div
            className={cn(STACK_CLASS, !isEditorTab && "invisible pointer-events-none")}
            aria-hidden={!isEditorTab}
          >
            <EditorStack
              tabs={tabs}
              activeId={activeId}
              registerHandle={registerEditorHandle}
              onDirtyChange={handleEditorDirty}
              onCloseTab={disposeTab}
            />
          </div>
          <div
            className={cn(STACK_CLASS, !isPreviewTab && "invisible pointer-events-none")}
            aria-hidden={!isPreviewTab}
          >
            <PreviewStack
              tabs={tabs}
              activeId={activeId}
              registerHandle={registerPreviewHandle}
              onUrlChange={handlePreviewUrl}
            />
          </div>
          <div
            className={cn(STACK_CLASS, !isAiDiffTab && "invisible pointer-events-none")}
            aria-hidden={!isAiDiffTab}
          >
            <AiDiffStack
              tabs={tabs}
              activeId={activeId}
              onAccept={(id) => respondToApproval(id, true)}
              onReject={(id) => respondToApproval(id, false)}
            />
          </div>
          <div
            className={cn("absolute inset-0", !isBrowserTab && "invisible pointer-events-none")}
            aria-hidden={!isBrowserTab}
          >
            <BrowserStack
              tabs={tabs.filter(isNavigableTab)}
              activeId={activeId}
              onNavigate={(tabId, url) => updateNavTabUrl(tabId, url)}
              onGoBack={(tabId) => navigateTabHistory(tabId, -1)}
              onGoForward={(tabId) => navigateTabHistory(tabId, 1)}
              onTitleChange={(tabId, title) => updateTab(tabId, { title })}
              onCrossScheme={(_src, url) => {
                if (/^https?:\/\//i.test(url)) openWebTab(url);
                else openVaultTab(url);
              }}
            />
          </div>
          <div
            className={cn("absolute inset-0", !isVaultHomeTab && "invisible pointer-events-none")}
            aria-hidden={!isVaultHomeTab}
          >
            <VaultHomePane
              workspaceRoot={explorerRoot}
              onOpenBrowserTab={openVaultTab}
            />
          </div>
          <div
            className={cn("absolute inset-0", !isAgentsOfficeTab && "invisible pointer-events-none")}
            aria-hidden={!isAgentsOfficeTab}
          >
            {isAgentsOfficeTab && activeTab?.kind === "agents-office" && (
              <AgentsOfficePane agentSlug={activeTab.agentSlug} />
            )}
          </div>
          <div
            className={cn("absolute inset-0", !isGraphTab && "invisible pointer-events-none")}
            aria-hidden={!isGraphTab}
          >
            {isGraphTab && (
              <GraphPane workspaceRoot={explorerRoot} onOpenVaultTab={openVaultTab} />
            )}
          </div>

        </div>
      </div>

      {/* Bottom bar: log pane + AI header */}
      <FocusedBar
        keysLoaded={keysLoaded}
        hasComposer={hasComposer}
        onOpenSettings={() => void openSettingsWindow("models")}
        onOpenChat={openMini}
        clickThrough={clickThrough}
        onToggleClickThrough={toggleClickThrough}
        onExitFocusedMode={() => void setLayoutMode("classic")}
        collapsed={barCollapsed}
        onToggleCollapsed={() => void setBarCollapsed(!barCollapsed)}
        topOpen={focusedTopOpen}
        onToggleTop={() => void setFocusedTopOpen(!focusedTopOpen)}
        leftOpen={focusedLeftOpen}
        onToggleLeft={() => void setFocusedLeftOpen(!focusedLeftOpen)}
      />
    </main>
  );

  const shell = (
    <ThemeProvider>
      <TooltipProvider>
        <div className={cn(
          "relative flex h-screen flex-col overflow-hidden text-foreground",
          layoutMode === "focused" ? "bg-transparent" : "bg-background",
        )}>
          {layoutMode !== "focused" && (
            <Header
              tabs={tabs}
              activeId={activeId}
              onSelect={setActiveId}
              onNew={openNewTab}
              onNewPreview={() => openPreviewTab("")}
              onNewEditor={() => setNewEditorOpen(true)}
              onNewBrowser={() => openWebTab("")}
              onNewVaultHome={() => openVaultHomeTab()}
              onNewSentor={() => {
                const tabId = openWebTab("");
                void (async () => {
                  await startSentorIfNeeded(sentorPath);
                  const ready = await waitForSentor();
                  if (ready) updateNavTabUrl(tabId, "http://localhost:3000");
                })();
              }}
              onClose={handleClose}
              onPin={pinTab}
              onToggleSidebar={toggleSidebar}
              onSplit={splitActivePaneInActiveTab}
              canSplit={
                activeTerminalTab !== null &&
                leafIds(activeTerminalTab.paneTree).length < MAX_PANES_PER_TAB
              }
              onOpenShortcuts={() => setShortcutsOpen(true)}
              onOpenSettings={() => void openSettingsWindow()}
              onEnterFocusedMode={() => void setLayoutMode("focused")}
              onOpenAgentSwitcher={() => setAgentSwitcherOpen(true)}
              onOpenGraph={() => openGraphTab()}
              onOpenLauncher={() => setShowLauncher(true)}
              searchTarget={searchTarget}
              searchRef={searchInlineRef}
            />
          )}

          {layoutMode === "focused" ? focusedMain : <main className="flex min-h-0 flex-1 flex-col">
            <ResizablePanelGroup
              orientation="horizontal"
              className="min-h-0 flex-1"
            >
              <ResizablePanel
                id="sidebar"
                panelRef={sidebarRef}
                defaultSize="225px"
                minSize="130px"
                maxSize="450px"
                collapsible
                collapsedSize={0}
              >
                <div className="flex h-full flex-col border-r border-border/60 bg-card">
                  <div className="flex shrink-0 items-center gap-1 border-b border-border/40 px-1.5 py-1">
                    {(["workspace", "vault"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setSidebarMode(mode)}
                        className={cn(
                          "flex-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                          sidebarMode === mode
                            ? "bg-accent/60 text-foreground"
                            : "text-muted-foreground hover:bg-accent/30 hover:text-foreground",
                        )}
                      >
                        {mode === "workspace" ? "Files" : "Vault"}
                      </button>
                    ))}
                  </div>
                  <div className="min-h-0 flex-1">
                    <FileExplorer
                      rootPath={
                        sidebarMode === "vault"
                          ? ((workspaceRoot ?? explorerRoot ?? "").replace(/\\/g, "/") + "/vault")
                          : explorerRoot
                      }
                      onOpenFile={handleOpenFile}
                      onOpenBrowserTab={(url) => openVaultTab(url)}
                      onPathRenamed={handlePathRenamed}
                      onPathDeleted={handlePathDeleted}
                      onRevealInTerminal={cdInNewTab}
                      onAttachToAgent={handleAttachFileToAgent}
                    />
                  </div>
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel id="workspace" defaultSize="78%" minSize="30%">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="relative min-h-0 flex-1">
                    <div
                      className={cn(
                        STACK_CLASS,
                        !isTerminalTab && "invisible pointer-events-none",
                      )}
                      aria-hidden={!isTerminalTab}
                    >
                      <TerminalStack
                        tabs={tabs}
                        activeId={activeId}
                        registerHandle={registerTerminalHandle}
                        onSearchReady={handleSearchReady}
                        onCwd={handleTerminalCwd}
                        onDetectedLocalUrl={handleDetectedLocalUrl}
                        onExit={handleLeafExit}
                        onAtlasOpen={handleAtlasOpen}
                        onFocusLeaf={handleFocusLeaf}
                      />
                    </div>
                    <div
                      className={cn(
                        STACK_CLASS,
                        !isEditorTab && "invisible pointer-events-none",
                      )}
                      aria-hidden={!isEditorTab}
                    >
                      <EditorStack
                        tabs={tabs}
                        activeId={activeId}
                        registerHandle={registerEditorHandle}
                        onDirtyChange={handleEditorDirty}
                        onCloseTab={disposeTab}
                      />
                    </div>
                    <div
                      className={cn(
                        STACK_CLASS,
                        !isPreviewTab && "invisible pointer-events-none",
                      )}
                      aria-hidden={!isPreviewTab}
                    >
                      <PreviewStack
                        tabs={tabs}
                        activeId={activeId}
                        registerHandle={registerPreviewHandle}
                        onUrlChange={handlePreviewUrl}
                      />
                    </div>
                    <div
                      className={cn(
                        STACK_CLASS,
                        !isAiDiffTab && "invisible pointer-events-none",
                      )}
                      aria-hidden={!isAiDiffTab}
                    >
                      <AiDiffStack
                        tabs={tabs}
                        activeId={activeId}
                        onAccept={(id) => respondToApproval(id, true)}
                        onReject={(id) => respondToApproval(id, false)}
                      />
                    </div>
                    <div
                      className={cn(
                        "absolute inset-0",
                        !isBrowserTab && "invisible pointer-events-none",
                      )}
                      aria-hidden={!isBrowserTab}
                    >
                      <BrowserStack
                        tabs={tabs.filter(isNavigableTab)}
                        activeId={activeId}
                        onNavigate={(tabId, url) => updateNavTabUrl(tabId, url)}
                        onGoBack={(tabId) => navigateTabHistory(tabId, -1)}
                        onGoForward={(tabId) => navigateTabHistory(tabId, 1)}
                        onTitleChange={(tabId, title) => updateTab(tabId, { title })}
                        onCrossScheme={(_src, url) => {
                          // Address bar gave us a URL whose scheme belongs in the
                          // other kind of tab. Open a fresh tab there.
                          if (/^https?:\/\//i.test(url)) openWebTab(url);
                          else openVaultTab(url);
                        }}
                      />
                    </div>
                    <div
                      className={cn(
                        "absolute inset-0",
                        !isVaultHomeTab && "invisible pointer-events-none",
                      )}
                      aria-hidden={!isVaultHomeTab}
                    >
                      <VaultHomePane
                        workspaceRoot={explorerRoot}
                        onOpenBrowserTab={openVaultTab}
                      />
                    </div>

                    <div
                      className={cn(
                        "absolute inset-0",
                        !isAgentsOfficeTab && "invisible pointer-events-none",
                      )}
                      aria-hidden={!isAgentsOfficeTab}
                    >
                      {isAgentsOfficeTab && activeTab?.kind === "agents-office" && (
                        <AgentsOfficePane agentSlug={activeTab.agentSlug} />
                      )}
                    </div>

                    <div
                      className={cn(
                        "absolute inset-0",
                        !isGraphTab && "invisible pointer-events-none",
                      )}
                      aria-hidden={!isGraphTab}
                    >
                      {isGraphTab && (
                        <GraphPane
                          workspaceRoot={explorerRoot}
                          onOpenVaultTab={openVaultTab}
                        />
                      )}
                    </div>
                  </div>

                  {keysLoaded ? (
                    <div
                      data-ai-input-bar
                      data-state={panelOpen ? "open" : "closed"}
                      className="overflow-hidden transition-all duration-200 ease-out data-[state=closed]:max-h-0 data-[state=closed]:opacity-0 data-[state=open]:max-h-[600px] data-[state=open]:opacity-100"
                      aria-hidden={!panelOpen}
                    >
                      {hasComposer ? (
                        <AiInputBar />
                      ) : (
                        <AiInputBarConnect
                          onAdd={() => void openSettingsWindow("models")}
                        />
                      )}
                    </div>
                  ) : null}
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </main>}

          {layoutMode !== "focused" && (
            <StatusBar
              cwd={activeCwd}
              filePath={activeFilePath}
              home={home}
              onCd={sendCd}
              onOpenMini={openMini}
              hasComposer={hasComposer}
              detectedPreviewUrl={detectedPreviewUrl}
              onOpenPreview={() => {
                if (detectedPreviewUrl) openPreviewTab(detectedPreviewUrl);
              }}
              onOpenAgentSwitcher={() => setAgentSwitcherOpen(true)}
              onOpenAgentOffice={(slug) => openAgentsOfficeTab(slug)}
            />
          )}

          {hasComposer ? (
            <AgentRunBridge
              openAiDiffTab={openAiDiffTab}
              setAiDiffStatus={setAiDiffStatus}
            />
          ) : null}

          {/* Native Input Core: paints the zone registry into the OS-level
              hit-bitmap so transparent areas pass clicks to the desktop. Only
              active in focused overlay mode. */}
          {layoutMode === "focused" ? <HitBitmapSync /> : null}

          {/* Startup launcher — pick Studio or a packaged build */}
          {showLauncher && (
            <LauncherScreen
              workspaceRoot={workspaceRoot ?? fallbackWorkspace}
              onRootChange={(_r) => {
                // workspaceRoot preference was already written; store will re-hydrate.
              }}
              onStudio={() => {
                setShowLauncher(false);
                // Force a viewport tick so CanvasWeb sync restores hidden native WebViews.
                requestAnimationFrame(() => {
                  const { viewport } = useCanvasStore.getState();
                  useCanvasStore.getState().setViewport({ ...viewport });
                });
              }}
              onBuild={(exePath, name) => {
                // Derive vault root: exe lives at build\vX.Y.Z\atlas.exe → go up 3 levels.
                const parts = exePath.replace(/\//g, "\\").split("\\");
                const vaultRoot = parts.slice(0, -3).join("\\") || (workspaceRoot ?? fallbackWorkspace);
                const { addPanel, updatePanel } = useCanvasStore.getState();
                const id = addPanel("instance");
                updatePanel(id, { title: name, meta: { vaultRoot } });
                setShowLauncher(false);
                requestAnimationFrame(() => {
                  const { viewport } = useCanvasStore.getState();
                  useCanvasStore.getState().setViewport({ ...viewport });
                });
              }}
            />
          )}

          {/* Pinned canvas panels — rendered via portal so they float above
              everything in both focused and classic mode. */}
          <PinnedPanelsPortal />

          {miniOpen && hasComposer ? (
            <AiMiniWindow
              key="ai-mini"
              isFocused={layoutMode === "focused"}
              onBoundsChange={clickThrough ? () => applyClickThrough(true) : undefined}
            />
          ) : null}
          {askPopup ? (
            <SelectionAskAi
              key="ask-ai-popup"
              x={askPopup.x}
              y={askPopup.y}
              onAsk={onAskFromSelection}
              onDismiss={() => setAskPopup(null)}
            />
          ) : null}

          <ShortcutsDialog
            open={shortcutsOpen}
            onOpenChange={setShortcutsOpen}
          />

          <AgentSwitcherModal
            open={agentSwitcherOpen}
            onClose={() => setAgentSwitcherOpen(false)}
            onOpenOffice={(slug) => openAgentsOfficeTab(slug)}
          />

          <NewEditorDialog
            open={newEditorOpen}
            onOpenChange={setNewEditorOpen}
            rootPath={explorerRoot ?? home}
            onCreated={(path) => openFileTab(path)}
          />

          <UpdaterDialog />

          <AlertDialog
            open={pendingCloseTab !== null}
            onOpenChange={(open) => !open && cancelClose()}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
                <AlertDialogDescription>
                  {tabs.find((t) => t.id === pendingCloseTab)?.title
                    ? `"${
                        tabs.find((t) => t.id === pendingCloseTab)?.title
                      }" has unsaved changes. Close anyway?`
                    : "This file has unsaved changes. Close anyway?"}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={cancelClose}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction onClick={confirmClose}>
                  Close Anyway
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );

  return (
    <ErrorBoundary name="app">
      <AiComposerProvider>
        {shell}
        {showOnboarding && (
          <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
        )}
      </AiComposerProvider>
    </ErrorBoundary>
  );
}
