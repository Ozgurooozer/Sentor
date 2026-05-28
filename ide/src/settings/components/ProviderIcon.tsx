import type { ProviderId } from "@/modules/ai/config";
import type { AutocompleteProviderId } from "@/modules/ai/config";
import { AiCloud01Icon, ComputerIcon, CpuIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const ICON_BY_PROVIDER: Record<ProviderId, typeof AiCloud01Icon> = {
  opencode: AiCloud01Icon,
};

const ICON_BY_AUTOCOMPLETE: Record<AutocompleteProviderId, typeof ComputerIcon> = {
  lmstudio: ComputerIcon,
  ollama: CpuIcon,
};

type Props = {
  provider: ProviderId | AutocompleteProviderId;
  size?: number;
  className?: string;
};

export function ProviderIcon({ provider, size = 14, className }: Props) {
  const icon =
    ICON_BY_PROVIDER[provider as ProviderId] ??
    ICON_BY_AUTOCOMPLETE[provider as AutocompleteProviderId] ??
    AiCloud01Icon;
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={1.75}
      className={className}
    />
  );
}
