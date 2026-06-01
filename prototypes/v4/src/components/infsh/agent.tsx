/**
 * Agent - Pre-composed Chat Component
 *
 * Ready-to-use chat UI built from primitives.
 * Uses @inferencesh/sdk/agent for state management.
 */

import React, { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Inference,
  ChatMessageStatusReady,
  ChatMessageStatusFailed,
  ChatMessageStatusCancelled,
  ChatMessageRoleUser,
  ChatMessageRoleAssistant,
  ChatMessageContentTypeReasoning,
  ChatMessageContentTypeText,
  type ChatMessageDTO,
} from '@inferencesh/sdk';
import {
  AgentChatProvider,
  useAgentChat,
  useAgentActions,
  isAdHocConfig,
  type AgentOptions,
} from '@inferencesh/sdk/agent';
import { ChatContainer } from './chat-container';
import { ChatMessages } from './chat-messages';
import { ChatInput } from './chat-input';
import { MessageBubble } from './message-bubble';
import { MessageContent } from './message-content';
import { MessageReasoning } from './message-reasoning';
import { MessageStatusIndicator } from './message-status-indicator';
import { ToolInvocations } from './tool-invocations';

interface AgentProps {
  proxyUrl?: string;
  apiKey?: string;
  baseUrl?: string;
  config: AgentOptions;
  name?: string;
  chatId?: string;
  className?: string;
  compact?: boolean;
  allowFiles?: boolean;
  allowImages?: boolean;
  onChatCreated?: (chatId: string) => void;
  description?: string;
  examplePrompts?: string[];
}

function isTerminalStatus(status: string | undefined): boolean {
  return status === ChatMessageStatusReady ||
    status === ChatMessageStatusFailed ||
    status === ChatMessageStatusCancelled;
}

function getTextContent(message: ChatMessageDTO): string {
  const textContent = message.content.find((c) => c.type === ChatMessageContentTypeText);
  return textContent?.text ?? '';
}

function getReasoningContent(message: ChatMessageDTO): string | undefined {
  const reasoningContent = message.content.find((c) => c.type === ChatMessageContentTypeReasoning);
  return reasoningContent?.text;
}

function hasTextContent(message: ChatMessageDTO): boolean {
  return message.content.some((c) => c.type === ChatMessageContentTypeText && c.text?.trim());
}

const DefaultHeader = memo(function DefaultHeader() {
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b">
      <Bot className="h-4 w-4 text-primary" />
      <span className="font-medium text-sm">agent</span>
    </div>
  );
});

const ExamplePrompts = memo(function ExamplePrompts({
  prompts,
  onSelect,
}: {
  prompts: string[];
  onSelect: (prompt: string) => void;
}) {
  if (prompts.length === 0) return null;
  return (
    <div className="mt-4 space-y-2 w-full max-w-md">
      {prompts.map((prompt, idx) => (
        <Button
          key={idx}
          variant="outline"
          onClick={() => onSelect(prompt)}
          className="w-full text-left justify-start h-auto py-2 px-3 text-sm whitespace-normal"
        >
          {prompt}
        </Button>
      ))}
    </div>
  );
});

const EmptyState = memo(function EmptyState({
  description,
  examplePrompts = [],
}: {
  description?: string;
  examplePrompts?: string[];
}) {
  const { sendMessage } = useAgentActions();
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
      <Bot className="h-8 w-8 mb-3 opacity-50" />
      <p className="text-sm font-medium">how can I help?</p>
      <p className="text-xs mt-1 opacity-70">{description || 'ask me anything'}</p>
      {examplePrompts.length > 0 && (
        <ExamplePrompts prompts={examplePrompts} onSelect={sendMessage} />
      )}
    </div>
  );
});

const MessageRow = memo(function MessageRow({
  message,
}: {
  message: ChatMessageDTO;
  isLast: boolean;
}) {
  const isUser = message.role === ChatMessageRoleUser;
  const isAssistant = message.role === ChatMessageRoleAssistant;
  const reasoningContent = getReasoningContent(message);
  const isGenerating = !isTerminalStatus(message.status);
  const hasTools = message.tool_invocations && message.tool_invocations.length > 0;

  if (message.role === 'tool') return null;
  if (!hasTextContent(message) && !reasoningContent && !hasTools) return null;

  return (
    <MessageBubble message={message}>
      {isAssistant && reasoningContent && (
        <MessageReasoning
          reasoning={reasoningContent}
          isReasoning={isGenerating && !hasTextContent(message)}
        />
      )}
      {(isUser || hasTextContent(message)) && <MessageContent message={message} truncate={isUser} />}
      {isAssistant && <ToolInvocations message={message} />}
      {isAssistant && isGenerating && <MessageStatusIndicator />}
    </MessageBubble>
  );
});

const AgentContent = memo(function AgentContent({
  className,
  compact,
  allowFiles = true,
  allowImages = true,
  description,
  examplePrompts,
}: {
  className?: string;
  compact?: boolean;
  allowFiles?: boolean;
  allowImages?: boolean;
  description?: string;
  examplePrompts?: string[];
}) {
  const { chat, messages } = useAgentChat();
  const hasMessages = messages.length > 0;

  const isGenerating = chat?.status === 'busy';
  const lastMessage = messages[messages.length - 1];
  const lastHasContent = lastMessage?.content?.some(
    (c) => (c.type === ChatMessageContentTypeText && c.text?.trim()) ||
      (c.type === ChatMessageContentTypeReasoning && c.text?.trim())
  );
  const showTyping = isGenerating && (!lastMessage || lastMessage.role === 'user' || !lastHasContent);

  return (
    <ChatContainer className={cn('h-full p-2', className)}>
      {!compact && <DefaultHeader />}
      {hasMessages ? (
        <ChatMessages className="flex-1">
          {({ messages: msgs }) => (
            <div className="flex flex-col gap-2 px-4 py-3">
              {msgs.map((msg, i) => (
                <MessageRow key={msg.id} message={msg} isLast={i === msgs.length - 1} />
              ))}
              {showTyping && (
                <div className="px-0 py-1">
                  <MessageStatusIndicator label="thinking..." />
                </div>
              )}
            </div>
          )}
        </ChatMessages>
      ) : (
        <EmptyState description={description} examplePrompts={examplePrompts} />
      )}
      <ChatInput allowFiles={allowFiles} allowImages={allowImages} />
    </ChatContainer>
  );
});

export function Agent({
  proxyUrl,
  apiKey,
  baseUrl,
  config,
  name,
  chatId,
  className,
  compact = false,
  allowFiles = true,
  allowImages = true,
  onChatCreated,
  description,
  examplePrompts,
}: AgentProps) {
  const client = useMemo(() => {
    if (!proxyUrl && !apiKey) {
      console.error('[Agent] Either proxyUrl or apiKey is required');
      return null;
    }
    return new Inference({ proxyUrl, apiKey, baseUrl });
  }, [proxyUrl, apiKey, baseUrl]);

  if (!client) return null;

  const effectiveDescription = description ?? (isAdHocConfig(config) ? config.description : undefined);
  const effectiveExamplePrompts = examplePrompts ?? (isAdHocConfig(config) ? config.example_prompts : undefined);

  return (
    <AgentChatProvider
      client={client}
      agentConfig={config}
      chatId={chatId}
      onChatCreated={onChatCreated}
    >
      <AgentContent
        className={className}
        compact={compact}
        allowFiles={allowFiles}
        allowImages={allowImages}
        description={effectiveDescription}
        examplePrompts={effectiveExamplePrompts}
      />
    </AgentChatProvider>
  );
}

Agent.displayName = 'Agent';
