/**
 * MessageReasoning Primitive
 *
 * Collapsible block for displaying reasoning/thinking content.
 */

import React, { memo, useState } from 'react';
import { MessageCircleDashed } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { Markdown } from '@/lib/pretext-md/react';

const TRIGGER_HEIGHT = 20;

export function measureReasoning(reasoning: string | undefined, isOpen: boolean): number {
  if (!reasoning?.trim()) return 0;
  if (!isOpen) return TRIGGER_HEIGHT;
  return TRIGGER_HEIGHT + 4 + 2 + 12 + 200;
}

interface MessageReasoningProps {
  reasoning: string;
  isReasoning?: boolean;
  className?: string;
}

export const MessageReasoning = memo(function MessageReasoning({
  reasoning,
  isReasoning = false,
  className,
}: MessageReasoningProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!reasoning.trim()) return null;

  const getLastLine = () => {
    const lines = reasoning.trim().split('\n').filter((line) => line.trim().length > 0);
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.length > 50) {
        return line.length > 60 ? line.slice(0, 60) + '...' : line;
      }
    }
    return null;
  };

  const label = isReasoning ? 'thinking' : 'thought';
  const icon = isReasoning
    ? <Spinner className="size-3" />
    : <MessageCircleDashed className="h-3 w-3" />;
  const preview =
    isReasoning && getLastLine() ? (
      <span className="text-muted-foreground/40 truncate max-w-[300px] lowercase ml-1">
        - {getLastLine()}
      </span>
    ) : null;

  return (
    <CollapsibleSection
      icon={icon}
      label={label}
      open={isOpen}
      onOpenChange={setIsOpen}
      isActive={isReasoning}
      preview={preview}
      className={className}
    >
      <div className="px-2 py-1.5">
        <div className="whitespace-pre-wrap text-xs max-h-[200px] overflow-y-auto">
          <Markdown content={reasoning} />
        </div>
      </div>
    </CollapsibleSection>
  );
});

MessageReasoning.displayName = 'MessageReasoning';
