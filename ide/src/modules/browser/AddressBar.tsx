import { Button } from "@/components/ui/button";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  BookmarkAdd01Icon,
  BookmarkCheck01Icon,
  Link01Icon,
  Refresh01Icon,
  Share04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";

type Props = {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  isBookmarked: boolean;
  onNavigate: (input: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onReload: () => void;
  onToggleBookmark: () => void;
  onOpenExternal: () => void;
  history?: string[];
  showBacklinksToggle?: boolean;
  backlinksOpen?: boolean;
  onToggleBacklinks?: () => void;
};

export function AddressBar({
  url,
  canGoBack,
  canGoForward,
  isLoading,
  isBookmarked,
  onNavigate,
  onGoBack,
  onGoForward,
  onReload,
  onToggleBookmark,
  onOpenExternal,
  history,
  showBacklinksToggle,
  backlinksOpen,
  onToggleBacklinks,
}: Props) {
  const [inputValue, setInputValue] = useState(url);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused) setInputValue(url);
  }, [url, focused]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onNavigate(inputValue);
      inputRef.current?.blur();
    }
    if (e.key === "Escape") {
      setInputValue(url);
      inputRef.current?.blur();
    }
  };

  const isExternalUrl = /^https?:\/\//i.test(url);

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border/60 bg-card px-2">
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
        onClick={onGoBack}
        disabled={!canGoBack}
        title="Back"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={13} strokeWidth={2} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
        onClick={onGoForward}
        disabled={!canGoForward}
        title="Forward"
      >
        <HugeiconsIcon icon={ArrowRight01Icon} size={13} strokeWidth={2} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={onReload}
        title="Reload"
      >
        <HugeiconsIcon
          icon={Refresh01Icon}
          size={13}
          strokeWidth={2}
          className={isLoading ? "animate-spin" : ""}
        />
      </Button>

      <div className="flex flex-1 items-center overflow-hidden rounded-md border border-border/60 bg-background px-2 focus-within:border-border focus-within:ring-1 focus-within:ring-accent/40">
        <input
          name="address-bar"
          ref={inputRef}
          type="text"
          list="sentor-url-history"
          value={focused ? inputValue : url}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => {
            setFocused(true);
            setInputValue(url);
            setTimeout(() => inputRef.current?.select(), 0);
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder="Search or enter URL…"
          className="h-7 w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          spellCheck={false}
          autoComplete="off"
        />
        {history && history.length > 0 && (
          <datalist id="sentor-url-history">
            {history.map((h) => <option key={h} value={h} />)}
          </datalist>
        )}
      </div>

      {url && (
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onToggleBookmark}
          title={isBookmarked ? "Remove bookmark" : "Add bookmark"}
        >
          <HugeiconsIcon
            icon={isBookmarked ? BookmarkCheck01Icon : BookmarkAdd01Icon}
            size={13}
            strokeWidth={2}
            className={isBookmarked ? "text-accent" : ""}
          />
        </Button>
      )}

      {isExternalUrl && (
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onOpenExternal}
          title="Open in system browser"
        >
          <HugeiconsIcon icon={Share04Icon} size={13} strokeWidth={2} />
        </Button>
      )}

      {showBacklinksToggle && (
        <Button
          variant="ghost"
          size="icon"
          className={`size-6 shrink-0 hover:text-foreground ${backlinksOpen ? "text-accent" : "text-muted-foreground"}`}
          onClick={onToggleBacklinks}
          title={backlinksOpen ? "Hide backlinks" : "Show backlinks & similar"}
        >
          <HugeiconsIcon icon={Link01Icon} size={13} strokeWidth={2} />
        </Button>
      )}
    </div>
  );
}
