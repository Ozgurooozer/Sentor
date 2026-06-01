/**
 * MessageBubble Primitive
 *
 * Styled container for a chat message.
 */

import React, { memo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  ChatMessageRoleUser,
  ChatMessageContentTypeText,
  type ChatMessageDTO,
} from '@inferencesh/sdk';
import { useChatWidth } from '@/hooks/use-chat-width';
import { useShrinkwrap } from '@/hooks/use-shrinkwrap';

const BUBBLE_MAX_RATIO = 0.7;
const BUBBLE_PADDING_X = 12;
const BUBBLE_PADDING_Y = 12;

export function measureBubbleChrome(role: string, containerWidth: number): {
  innerWidth: number;
  paddingY: number;
} {
  const isUser = role === ChatMessageRoleUser;
  if (isUser) {
    const maxBubble = Math.floor(containerWidth * BUBBLE_MAX_RATIO);
    return { innerWidth: maxBubble - BUBBLE_PADDING_X * 2, paddingY: BUBBLE_PADDING_Y * 2 };
  }
  return { innerWidth: containerWidth, paddingY: 0 };
}

function getUserText(message: ChatMessageDTO): string | undefined {
  if (message.role !== ChatMessageRoleUser) return undefined;
  const parts: string[] = [];
  for (const c of message.content) {
    if (c.type === ChatMessageContentTypeText && c.text) parts.push(c.text);
  }
  return parts.length > 0 ? parts.join('\n') : undefined;
}

interface MessageBubbleProps {
  message: ChatMessageDTO;
  children?: ReactNode;
  className?: string;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  children,
  className,
}: MessageBubbleProps) {
  const isUser = message.role === ChatMessageRoleUser;
  const chatWidth = useChatWidth();
  const maxBubbleWidth = Math.floor(chatWidth * BUBBLE_MAX_RATIO);
  const userText = getUserText(message);
  const shrinkWidth = useShrinkwrap(userText, maxBubbleWidth, { paddingX: BUBBLE_PADDING_X });

  return (
    <div
      className={cn(
        'group relative w-full',
        isUser ? 'flex justify-end' : 'flex justify-start',
        className
      )}
    >
      <div
        className={cn(
          'relative rounded-xl text-sm break-words [&_*]:max-w-full [&_*]:min-w-0 flex flex-col gap-1.5',
          isUser
            ? 'bg-muted/50 text-foreground max-w-[70%] min-w-0 p-3'
            : 'text-foreground max-w-full min-w-0 w-full',
        )}
        style={shrinkWidth !== undefined ? { width: shrinkWidth } : undefined}
      >
        {children}
      </div>
    </div>
  );
});

MessageBubble.displayName = 'MessageBubble';
