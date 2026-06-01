/**
 * ChatMessages - Scrollable message container with render prop and auto-scroll.
 */

import React, { memo, useState, useLayoutEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useAutoScroll } from '@/hooks/use-auto-scroll';
import { ChatWidthContext } from '@/hooks/use-chat-width';
import { Button } from '@/components/ui/button';
import { ArrowDown } from 'lucide-react';
import { useAgentChat } from '@inferencesh/sdk/agent';
import { type ChatMessageDTO } from '@inferencesh/sdk';

interface ChatMessagesProps {
  children: (props: { messages: ChatMessageDTO[] }) => ReactNode;
  className?: string;
  scrollToTopPadding?: boolean;
}

export const ChatMessages = memo(function ChatMessages({
  children,
  className,
  scrollToTopPadding = false,
}: ChatMessagesProps) {
  const { messages } = useAgentChat();
  const [spacerHeight, setSpacerHeight] = useState(0);
  const [chatWidth, setChatWidth] = useState(0);

  const { containerRef, scrollToBottom, handleScroll, shouldAutoScroll, handleTouchStart } =
    useAutoScroll([messages]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      if (!containerRef.current) return;
      setChatWidth(containerRef.current.clientWidth);
      if (scrollToTopPadding) setSpacerHeight(containerRef.current.clientHeight * 0.9);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollToTopPadding, containerRef]);

  return (
    <ChatWidthContext.Provider value={chatWidth}>
      <div className={cn('flex flex-col min-h-0 min-w-0 relative', className)}>
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto min-w-0"
          onScroll={handleScroll}
          onTouchStart={handleTouchStart}
        >
          {children({ messages })}
          {scrollToTopPadding && messages.length > 0 && (
            <div aria-hidden="true" className="shrink-0" style={{ minHeight: spacerHeight }} />
          )}
        </div>
        {!shouldAutoScroll && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <Button
              onClick={scrollToBottom}
              size="sm"
              variant="default"
              className="bg-background hover:bg-muted text-foreground hover:text-foreground rounded-full shadow-md animate-in fade-in-0 slide-in-from-bottom-2 cursor-pointer"
            >
              <ArrowDown className="h-4 w-4" />
              <span className="text-xs font-normal text-muted-foreground">scroll to bottom</span>
            </Button>
          </div>
        )}
      </div>
    </ChatWidthContext.Provider>
  );
});

ChatMessages.displayName = 'ChatMessages';
