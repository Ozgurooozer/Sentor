import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { fmtShortcut, MOD_KEY } from "@/lib/platform";
import { MODELS, getModel, type ModelId } from "@/modules/ai/config";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setDefaultModel } from "@/modules/settings/store";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type Props = {
  aiOpen: boolean;
  canSubmit: boolean;
  onOpenAi: () => void;
  onSubmit: () => void;
};

export function AiTools({ aiOpen, canSubmit, onOpenAi, onSubmit }: Props) {
  return aiOpen ? (
    <div
      key="tools"
      className="flex items-center gap-0.5 duration-150 ease-out animate-in fade-in slide-in-from-top-0.5"
    >
      <ModelSelector />
      <Button
        size="sm"
        disabled={!canSubmit}
        onClick={onSubmit}
        className="ml-1 h-6 px-1.5"
      >
        <HugeiconsIcon icon={ArrowUp01Icon} size={13} strokeWidth={2} />
      </Button>
    </div>
  ) : (
    <button
      key="open"
      onClick={onOpenAi}
      className="flex h-7 items-center gap-2 rounded-md border border-border/60 bg-card px-2 text-xs text-muted-foreground hover:text-foreground duration-150 ease-out animate-in fade-in slide-in-from-top-0.5"
    >
      Open AI Agent
      <KbdGroup>
        <Kbd className="h-4.5 min-w-4.5 px-1 font-mono">
          {fmtShortcut(MOD_KEY, "I")}
        </Kbd>
      </KbdGroup>
    </button>
  );
}


function ModelSelector() {
  const defaultModelId = usePreferencesStore((s) => s.defaultModelId);
  const selected = getModel(defaultModelId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 rounded-md px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {selected.label}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={12}
            strokeWidth={2}
            className="opacity-70"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {MODELS.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onSelect={() => void setDefaultModel(m.id as ModelId)}
            className="text-xs"
          >
            {m.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
