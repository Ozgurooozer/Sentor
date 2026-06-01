/**
 * MessageContent Primitive
 *
 * Renders message text content with markdown support.
 */

import React, { memo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Markdown } from '@/lib/pretext-md/react';
import { Button } from '@/components/ui/button';
import { FileIcon, ExternalLink } from 'lucide-react';
import {
  ChatMessageRoleUser,
  ChatMessageContentTypeText,
  ChatMessageContentTypeImage,
  ChatMessageContentTypeFile,
} from '@inferencesh/sdk';
import type { ChatMessageDTO } from '@inferencesh/sdk';

interface MessageContentProps {
  message: ChatMessageDTO;
  className?: string;
  truncate?: boolean;
  renderMarkdown?: (content: string) => React.ReactNode;
}

function getTextContent(message: ChatMessageDTO): string | undefined {
  const textContent = message.content.find((c) => c.type === ChatMessageContentTypeText);
  return textContent?.text;
}

function getImageUrls(message: ChatMessageDTO): string[] {
  return message.content
    .filter((c) => c.type === ChatMessageContentTypeImage && c.image)
    .map((c) => c.image!);
}

function getFileUrls(message: ChatMessageDTO): string[] {
  return message.content
    .filter((c) => c.type === ChatMessageContentTypeFile && c.file)
    .map((c) => c.file!);
}

function getFileName(url: string): string {
  const parts = url.split('/');
  const lastPart = parts[parts.length - 1];
  return lastPart.split('?')[0] || 'file';
}

function getFileExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toUpperCase() || '';
  return ext.length <= 5 ? ext : ext.slice(0, 5);
}

function isImageUrl(url: string): boolean {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() || '';
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
}

function isVideoUrl(url: string): boolean {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() || '';
  return ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext);
}

interface FileAttachmentProps { url: string; className?: string; }

const FileAttachment = memo(function FileAttachment({ url, className }: FileAttachmentProps) {
  const fileName = getFileName(url);
  const extension = getFileExtension(fileName);
  const isImage = isImageUrl(url);
  const isVideo = isVideoUrl(url);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex items-center gap-2.5 rounded-lg border bg-muted/30 p-2 pr-3',
        'hover:bg-muted/50 transition-colors cursor-pointer max-w-[240px]',
        className
      )}
    >
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border bg-muted">
        {isImage ? (
          <img src={url} alt={fileName} className="h-full w-full object-cover" />
        ) : isVideo ? (
          <div className="relative h-full w-full bg-black/10">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="rounded-full bg-white/90 p-1">
                <svg className="h-3 w-3 text-black" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center">
            <FileIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-[7px] font-medium text-muted-foreground mt-0.5">{extension}</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate text-xs font-medium">{fileName}</p>
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <ExternalLink className="h-2.5 w-2.5" />
          open file
        </p>
      </div>
    </a>
  );
});

interface ImageAttachmentProps { url: string; className?: string; }

const ImageAttachment = memo(function ImageAttachment({ url, className }: ImageAttachmentProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('block overflow-hidden rounded-lg border cursor-pointer hover:opacity-90 transition-opacity', className)}
    >
      <img src={url} alt="Attached image" className="max-w-[300px] max-h-[300px] object-contain" />
    </a>
  );
});

export const MessageContent = memo(function MessageContent({
  message,
  className,
  truncate = false,
  renderMarkdown,
}: MessageContentProps) {
  const isUser = message.role === ChatMessageRoleUser;
  const textContent = getTextContent(message);
  const imageUrls = getImageUrls(message);
  const fileUrls = getFileUrls(message);
  const [isExpanded, setIsExpanded] = useState(false);
  const MAX_LENGTH = 500;
  const shouldTruncate = truncate && isUser && (textContent?.length || 0) > MAX_LENGTH;
  const displayContent = shouldTruncate && !isExpanded
    ? textContent?.slice(0, MAX_LENGTH) + '...'
    : textContent;

  if (!textContent && imageUrls.length === 0 && fileUrls.length === 0) return null;

  return (
    <div className={cn('w-full', className)}>
      {imageUrls.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {imageUrls.map((url, i) => <ImageAttachment key={i} url={url} />)}
        </div>
      )}
      {fileUrls.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {fileUrls.map((url, i) => <FileAttachment key={i} url={url} />)}
        </div>
      )}
      {textContent && textContent.length > 0 && (
        <div className="w-full">
          {isUser ? (
            <div className="flex flex-col gap-2">
              <div className="whitespace-pre-wrap">{displayContent}</div>
              {shouldTruncate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="self-end text-xs h-6 px-2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {isExpanded ? 'show less' : 'show more'}
                </Button>
              )}
            </div>
          ) : (
            renderMarkdown ? renderMarkdown(textContent) : <Markdown content={textContent} />
          )}
        </div>
      )}
    </div>
  );
});

MessageContent.displayName = 'MessageContent';
