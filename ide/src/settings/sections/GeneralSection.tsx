import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { ThemePref } from "@/modules/settings/store";
import {
  EDITOR_THEME_LABELS,
  EDITOR_THEMES,
  setAutostart,
  setEditorTheme,
  setLayoutMode,
  setRestoreWindowState,
  setSentorPath,
  setVimMode,
  type EditorThemeId,
  type LayoutMode,
} from "@/modules/settings/store";
import { useTheme } from "@/modules/theme";
import {
  ArrowDown01Icon,
  ComputerIcon,
  Moon02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useEffect, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

const APPEARANCE: {
  id: ThemePref;
  label: string;
  icon: typeof ComputerIcon;
}[] = [
  { id: "system", label: "System", icon: ComputerIcon },
  { id: "light", label: "Light", icon: Sun03Icon },
  { id: "dark", label: "Dark", icon: Moon02Icon },
];

const LAYOUTS: { id: LayoutMode; label: string; description: string }[] = [
  {
    id: "classic",
    label: "Classic",
    description: "Tabbed IDE with file explorer and chat panel.",
  },
  {
    id: "focused",
    label: "Focused",
    description:
      "Terminal strip + dedicated chat center. Click-through is Windows-only — other platforms show the overlay without desktop pass-through.",
  },
];

export function GeneralSection() {
  const { theme, setTheme } = useTheme();
  const editorTheme = usePreferencesStore((s) => s.editorTheme);
  const autostart = usePreferencesStore((s) => s.autostart);
  const restoreWindowState = usePreferencesStore((s) => s.restoreWindowState);
  const vimMode = usePreferencesStore((s) => s.vimMode);
  const layoutMode = usePreferencesStore((s) => s.layoutMode);
  const sentorPathPref = usePreferencesStore((s) => s.sentorPath);
  const [sentorPathDraft, setSentorPathDraft] = useState(sentorPathPref);
  useEffect(() => { setSentorPathDraft(sentorPathPref); }, [sentorPathPref]);

  // Reconcile autostart pref with the actual OS state on mount — the user may
  // have toggled it from System Settings.
  useEffect(() => {
    let alive = true;
    void isEnabled()
      .then((on) => {
        if (!alive) return;
        if (on !== usePreferencesStore.getState().autostart) {
          void setAutostart(on);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const onToggleAutostart = async (next: boolean) => {
    try {
      if (next) await enable();
      else await disable();
      await setAutostart(next);
    } catch (e) {
      console.error("autostart toggle failed", e);
    }
  };

  const onPickEditor = (id: EditorThemeId) => void setEditorTheme(id);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="General"
        description="Appearance, editor, and startup."
      />

      <div className="flex flex-col gap-2">
        <Label>Appearance</Label>
        <div className="grid grid-cols-3 gap-2">
          {APPEARANCE.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setTheme(o.id)}
              className={cn(
                "group flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg border bg-card transition-all",
                theme === o.id
                  ? "border-foreground/60 ring-1 ring-foreground/20"
                  : "border-border/60 hover:border-border",
              )}
            >
              <HugeiconsIcon icon={o.icon} size={18} strokeWidth={1.5} />
              <span className="text-[11.5px]">{o.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Layout</Label>
        <div className="grid grid-cols-2 gap-2">
          {LAYOUTS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => void setLayoutMode(o.id)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg border bg-card px-3 py-2.5 text-left transition-all",
                layoutMode === o.id
                  ? "border-foreground/60 ring-1 ring-foreground/20"
                  : "border-border/60 hover:border-border",
              )}
            >
              <span className="text-[12px] font-medium">{o.label}</span>
              <span className="text-[10.5px] text-muted-foreground leading-relaxed">{o.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Editor theme</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-9 justify-between gap-2 px-2.5 text-[12px]"
            >
              <span>{EDITOR_THEME_LABELS[editorTheme]}</span>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={12}
                strokeWidth={2}
                className="opacity-70"
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[220px]">
            {EDITOR_THEMES.map((t) => (
              <DropdownMenuItem
                key={t}
                onSelect={() => onPickEditor(t)}
                className={cn(
                  "text-[12px]",
                  t === editorTheme && "bg-accent/50",
                )}
              >
                {EDITOR_THEME_LABELS[t]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <SettingRow
          title="Vim mode"
          description="Enable Vim keybindings in the code editor."
        >
          <Switch
            checked={vimMode}
            onCheckedChange={(v) => void setVimMode(v)}
          />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Sentor</Label>
        <SettingRow
          title="Sentor path"
          description="Absolute path to modules/Flowise-flowise-3.1.2. Required to auto-start Sentor from the IDE."
        >
          <Input
            value={sentorPathDraft}
            onChange={(e) => setSentorPathDraft(e.target.value)}
            onBlur={() => void setSentorPath(sentorPathDraft.trim())}
            placeholder="C:\Atlas OS\modules\Flowise-flowise-3.1.2"
            className="h-7 w-72 font-mono text-[11px]"
          />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Startup</Label>
        <div className="flex flex-col gap-2">
          <SettingRow
            title="Launch at login"
            description="Open Atlas automatically when you sign in."
          >
            <Switch
              checked={autostart}
              onCheckedChange={(v) => void onToggleAutostart(v)}
            />
          </SettingRow>
          <SettingRow
            title="Restore window position & size"
            description="Reopen the main window where you left it. Applies on next launch."
          >
            <Switch
              checked={restoreWindowState}
              onCheckedChange={(v) => void setRestoreWindowState(v)}
            />
          </SettingRow>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
      {children}
    </span>
  );
}
