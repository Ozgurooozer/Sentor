/**
 * ChatContainer Primitive
 *
 * A layout wrapper for the chat UI using CSS Grid.
 * Provides structure: [header] [messages] [input]
 */

import React, { forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ChatContainerProps {
  children: ReactNode;
  className?: string;
}

export const ChatContainer = forwardRef<HTMLDivElement, ChatContainerProps>(
  ({ children, className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'grid max-h-full w-full grid-rows-[auto_1fr_auto]',
          className
        )}
      >
        {children}
      </div>
    );
  }
);

ChatContainer.displayName = 'ChatContainer';
