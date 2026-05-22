import { useEffect, useState, type JSX } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { SettingsTab } from "@/modules/settings/openSettingsWindow";
import { AboutSection } from "@/settings/sections/AboutSection";
import { AgentsSection } from "@/settings/sections/AgentsSection";
import { FeaturesSection } from "@/settings/sections/FeaturesSection";
import { GeneralSection } from "@/settings/sections/GeneralSection";
import { ModelsSection } from "@/settings/sections/ModelsSection";
import { ShortcutsSection } from "@/settings/sections/ShortcutsSection";
import { VaultSection } from "@/settings/sections/VaultSection";
import {
  AiScanIcon,
  DatabaseIcon,
  InformationCircleIcon,
  Settings01Icon,
  ToggleOffIcon,
  UserMultiple02Icon,
  KeyboardIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const TABS: { id: SettingsTab; label: string; icon: typeof Settings01Icon; component: () => JSX.Element }[] = [
  { id: "general",   label: "General",   icon: Settings01Icon,         component: GeneralSection },
  { id: "shortcuts", label: "Shortcuts", icon: KeyboardIcon,            component: ShortcutsSection },
  { id: "models",    label: "Models",    icon: AiScanIcon,              component: ModelsSection },
  { id: "vault",     label: "Vault",     icon: DatabaseIcon,            component: VaultSection },
  { id: "features",  label: "Features",  icon: ToggleOffIcon,           component: FeaturesSection },
  { id: "agents",    label: "Agents",    icon: UserMultiple02Icon,      component: AgentsSection },
  { id: "about",     label: "About",     icon: InformationCircleIcon,   component: AboutSection },
];

interface Props {
  initialTab?: SettingsTab;
  onClose: () => void;
}

export function CanvasSettingsOverlay({ initialTab = "general", onClose }: Props) {
  const [active, setActive] = useState<SettingsTab>(initialTab);
  const init = usePreferencesStore((s) => s.init);

  useEffect(() => { void init(); }, [init]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const ActiveSection = TABS.find((t) => t.id === active)?.component;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onPointerDown={onClose}
    >
      <div
        className="relative flex h-[82vh] w-[720px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[14px] border"
        style={{
          background: "#0a0a0a",
          borderColor: "#2a2a2a",
          animation: "panel-in 200ms cubic-bezier(.2,.7,.2,1)",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header / tab bar */}
        <div
          className="flex h-11 shrink-0 items-center justify-between border-b px-4"
          style={{ borderColor: "#1e1e1e", background: "#111111" }}
        >
          <div className="flex items-center gap-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActive(t.id)}
                className={[
                  "flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 font-mono text-[11px] transition-colors duration-150 ease-out",
                  active === t.id
                    ? "bg-[#1a1a1a] text-[#f5f5f5]"
                    : "text-[#555555] hover:text-[#888888]",
                ].join(" ")}
              >
                <HugeiconsIcon icon={t.icon} size={11} strokeWidth={1.75} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-[6px] text-[#555555] transition-colors duration-150 ease-out hover:bg-[#1a1a1a] hover:text-[#888888]"
            title="Close (Esc)"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-8 pt-6 pb-7 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="mx-auto w-full max-w-[560px]">
            {ActiveSection && <ActiveSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
