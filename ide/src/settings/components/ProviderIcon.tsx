import type { ProviderId } from "@/modules/ai/config";
import { AiBrain01Icon, AiScanIcon, ApiIcon, ChipIcon, ComputerIcon, CpuIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const ICON_BY_PROVIDER: Record<ProviderId, typeof ComputerIcon> = {
  lmstudio: ComputerIcon,
  ollama: CpuIcon,
  openai: AiScanIcon,
  anthropic: AiBrain01Icon,
  groq: ChipIcon,
  custom: ApiIcon,
};

type Props = {
  provider: ProviderId;
  size?: number;
  className?: string;
};

export function ProviderIcon({ provider, size = 14, className }: Props) {
  return (
    <HugeiconsIcon
      icon={ICON_BY_PROVIDER[provider]}
      size={size}
      strokeWidth={1.75}
      className={className}
    />
  );
}
