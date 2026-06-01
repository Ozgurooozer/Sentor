import { Switch } from "@/components/ui/switch";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setAutocompleteEnabled,
  setAutostart,
  setRestoreWindowState,
  setVimMode,
} from "@/modules/settings/store";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useEffect } from "react";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

const FEATURE_GROUPS: {
  title: string;
  items: {
    key: string;
    title: string;
    description: string;
    getValue: (s: ReturnType<typeof usePreferencesStore.getState>) => boolean;
    toggle: (v: boolean) => void | Promise<void>;
  }[];
}[] = [
  {
    title: "Editor",
    items: [
      {
        key: "autocomplete",
        title: "Inline autocomplete",
        description: "Ghost-text code suggestions powered by a local LM Studio or Ollama server.",
        getValue: (s) => s.autocompleteEnabled,
        toggle: (v) => void setAutocompleteEnabled(v),
      },
      {
        key: "vim",
        title: "Vim mode",
        description: "Enable Vim keybindings in the code editor.",
        getValue: (s) => s.vimMode,
        toggle: (v) => void setVimMode(v),
      },
    ],
  },
  {
    title: "Startup",
    items: [
      {
        key: "autostart",
        title: "Launch at login",
        description: "Open Sentor automatically when you sign in.",
        getValue: (s) => s.autostart,
        toggle: async (next) => {
          try {
            if (next) await enable();
            else await disable();
            await setAutostart(next);
          } catch {
            // autostart not supported
          }
        },
      },
      {
        key: "restore",
        title: "Restore window position & size",
        description: "Reopen the main window where you left it. Applies on next launch.",
        getValue: (s) => s.restoreWindowState,
        toggle: (v) => void setRestoreWindowState(v),
      },
    ],
  },
];

export function FeaturesSection() {
  const prefs = usePreferencesStore();

  useEffect(() => {
    let alive = true;
    void isEnabled()
      .then((on) => {
        if (!alive) return;
        if (on !== usePreferencesStore.getState().autostart) void setAutostart(on);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Features"
        description="Toggle IDE capabilities on or off."
      />

      {FEATURE_GROUPS.map((group) => (
        <div key={group.title} className="flex flex-col gap-2">
          <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
            {group.title}
          </span>
          <div className="flex flex-col gap-2">
            {group.items.map((item) => (
              <SettingRow
                key={item.key}
                title={item.title}
                description={item.description}
              >
                <Switch
                  checked={item.getValue(prefs as ReturnType<typeof usePreferencesStore.getState>)}
                  onCheckedChange={(v) => void item.toggle(v)}
                />
              </SettingRow>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
