import type { NavigableTab } from "@/modules/tabs";
import { VaultBrowserPane } from "./VaultBrowserPane";
import { WebBrowserPane } from "./WebBrowserPane";

type Props = {
  tabs: NavigableTab[];
  activeId: number;
  onNavigate: (tabId: number, url: string) => void;
  onGoBack: (tabId: number) => void;
  onGoForward: (tabId: number) => void;
  onTitleChange: (tabId: number, title: string) => void;
  /** Address-bar typed a URL whose scheme belongs in the other kind of tab. */
  onCrossScheme: (sourceTabId: number, url: string) => void;
};

export function BrowserStack({
  tabs,
  activeId,
  onNavigate,
  onGoBack,
  onGoForward,
  onTitleChange,
  onCrossScheme,
}: Props) {
  return (
    <>
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <div
            key={tab.id}
            className={`absolute inset-0 flex flex-col ${isActive ? "" : "invisible pointer-events-none"}`}
          >
            {tab.kind === "vault" ? (
              <VaultBrowserPane
                tab={tab}
                onNavigate={(url) => onNavigate(tab.id, url)}
                onNavigateExternal={(url) => onCrossScheme(tab.id, url)}
                onGoBack={() => onGoBack(tab.id)}
                onGoForward={() => onGoForward(tab.id)}
                onTitleChange={(title) => onTitleChange(tab.id, title)}
              />
            ) : (
              <WebBrowserPane
                tab={tab}
                isActive={isActive}
                onNavigate={(url) => onNavigate(tab.id, url)}
                onNavigateLocal={(url) => onCrossScheme(tab.id, url)}
                onGoBack={() => onGoBack(tab.id)}
                onGoForward={() => onGoForward(tab.id)}
                onTitleChange={(title) => onTitleChange(tab.id, title)}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
