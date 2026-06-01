/**
 * ToolInvocations Primitive
 *
 * Displays all tool invocations for a message.
 */

import React, { memo, useState } from 'react';
import { cn } from '@/lib/utils';
import { ToolInvocation } from './tool-invocation';
import {
  ToolInvocationStatusAwaitingInput,
  ToolInvocationStatusAwaitingApproval,
  ToolInvocationStatusFailed,
  ToolInvocationStatusCompleted,
  type ChatMessageDTO,
  type ToolInvocationDTO,
} from '@inferencesh/sdk';
import { ChevronRight } from 'lucide-react';

const COLLAPSE_THRESHOLD = 3;

export function measureToolInvocations(invocations: ToolInvocationDTO[] | undefined): number {
  if (!invocations?.length) return 0;
  return invocations.length * 24;
}

function needsAttention(inv: ToolInvocationDTO): boolean {
  return inv.status === ToolInvocationStatusAwaitingInput ||
    inv.status === ToolInvocationStatusAwaitingApproval ||
    inv.status === ToolInvocationStatusFailed ||
    !!inv.widget;
}

interface ToolInvocationsProps {
  message: ChatMessageDTO;
  className?: string;
}

export const ToolInvocations = memo(function ToolInvocations({
  message,
  className,
}: ToolInvocationsProps) {
  const invocations = message.tool_invocations;
  const [expanded, setExpanded] = useState(false);

  if (!invocations || invocations.length === 0) return null;

  if (invocations.length < COLLAPSE_THRESHOLD) {
    return (
      <div className={cn('space-y-1', className)}>
        {invocations.map((inv, idx) => (
          <ToolInvocation key={inv.id || idx} invocation={inv} />
        ))}
      </div>
    );
  }

  const prominent: ToolInvocationDTO[] = [];
  const collapsible: ToolInvocationDTO[] = [];
  for (const inv of invocations) {
    (needsAttention(inv) ? prominent : collapsible).push(inv);
  }

  const completedCount = collapsible.filter(inv => inv.status === ToolInvocationStatusCompleted).length;
  const runningCount = collapsible.length - completedCount;
  const summary = runningCount > 0
    ? `${completedCount} completed, ${runningCount} running`
    : `${collapsible.length} tool calls`;

  return (
    <div className={cn('mt-2 space-y-1', className)}>
      {prominent.map((inv, idx) => (
        <ToolInvocation key={inv.id || idx} invocation={inv} />
      ))}
      {collapsible.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(prev => !prev)}
            className="flex items-center gap-1 px-0.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            <ChevronRight className={cn('h-3 w-3 transition-transform', expanded && 'rotate-90')} />
            <span>{summary}</span>
          </button>
          {expanded && (
            <div className="space-y-1">
              {collapsible.map((inv, idx) => (
                <ToolInvocation key={inv.id || idx} invocation={inv} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
});

ToolInvocations.displayName = 'ToolInvocations';
