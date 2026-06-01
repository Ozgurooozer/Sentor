/**
 * ChatInput Primitive
 *
 * Auto-resizing textarea with file upload support.
 */

import React, { useState, useRef, useEffect, useCallback, memo, forwardRef, useImperativeHandle } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ArrowUp, Square, ImagePlus, Paperclip, File as FileIcon, AlertCircle, X, HelpCircle } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useAgentChat, useAgentActions } from '@inferencesh/sdk/agent';
import { ChatStatusBusy } from '@inferencesh/sdk';
import {
  useFileUploadManager,
  FileUploadList,
  showFileUploadDialog,
  type FileUpload,
} from './file-upload';

export interface ChatInputHandle {
  setInput: (text: string) => void;
}

interface ChatInputProps {
  placeholder?: string;
  className?: string;
  allowAttachments?: boolean;
  allowFiles?: boolean;
  allowImages?: boolean;
  onFilesChange?: (files: File[]) => void;
  examplePrompts?: string[];
}

const DragOverlay = memo(function DragOverlay({ isDragging }: { isDragging: boolean }) {
  if (!isDragging) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm animate-in fade-in duration-100">
      <div className="flex flex-col items-center gap-2 text-primary">
        <div className="rounded-full bg-primary/20 p-3">
          <Paperclip className="h-6 w-6" />
        </div>
        <span className="text-sm font-medium">drop files to upload</span>
      </div>
    </div>
  );
});

export const ChatInput = memo(forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput({
  placeholder = 'ask a question...',
  className,
  allowAttachments,
  allowFiles = true,
  allowImages = true,
  examplePrompts,
}, ref) {
  const showFileButton = allowAttachments !== false && allowFiles;
  const showImageButton = allowAttachments !== false && allowImages;
  const enableAttachments = showFileButton || showImageButton;
  const { chat, error } = useAgentChat();
  const isBusy = chat?.status === ChatStatusBusy;
  const { sendMessage, stopGeneration, clearError } = useAgentActions();

  const [value, setValue] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);

  useImperativeHandle(ref, () => ({
    setInput(text: string) {
      setValue(text);
      textareaRef.current?.focus();
    },
  }));

  const { uploads, addFiles, removeUpload, clearAll, getFileRefs, hasPendingUploads, hasCompletedUploads } =
    useFileUploadManager();

  const completedUploads = uploads.filter(u => u.status === 'completed');

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [value]);

  const addFileReferenceToText = useCallback((upload: FileUpload) => {
    const text = `@${upload.file.name} `;
    setValue(prev => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${text}`);
    if (textareaRef.current) {
      textareaRef.current.focus();
      setTimeout(() => {
        if (textareaRef.current) {
          const length = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(length, length);
        }
      }, 0);
    }
  }, []);

  const handleSend = useCallback(async () => {
    const messageText = value.trim();
    if (!messageText && !hasCompletedUploads) return;
    if (hasPendingUploads || isBusy) return;
    const uploadedFiles = getFileRefs();
    setValue('');
    clearAll();
    await sendMessage(messageText, uploadedFiles.length > 0 ? uploadedFiles : undefined);
  }, [value, hasCompletedUploads, hasPendingUploads, isBusy, getFileRefs, clearAll, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === '@' && completedUploads.length > 0) {
      e.preventDefault();
      setShowCommandMenu(true);
    }
    if (e.key === 'Escape') setShowCommandMenu(false);
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend, completedUploads.length]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (!enableAttachments) return;
    const files: File[] = [];
    for (const item of (e.clipboardData?.items || [])) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
    if (files.length > 0) { e.preventDefault(); addFiles(files); }
  }, [enableAttachments, addFiles]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!enableAttachments) return;
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  }, [enableAttachments]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!enableAttachments) return;
    e.preventDefault(); e.stopPropagation();
    if (--dragCounterRef.current === 0) setIsDragging(false);
  }, [enableAttachments]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!enableAttachments) return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, [enableAttachments]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false); dragCounterRef.current = 0;
    if (!enableAttachments) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) addFiles(files);
  }, [enableAttachments, addFiles]);

  const canSend = (value.trim().length > 0 || hasCompletedUploads) && !isBusy && !hasPendingUploads;

  return (
    <div className="relative">
      {error && (
        <div className="absolute -top-10 left-0 right-0 flex items-center justify-center animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-destructive/10 border border-destructive/20 text-destructive text-xs">
            <AlertCircle className="h-3 w-3 shrink-0" />
            <span className="line-clamp-1">failed to send: {error}</span>
            <button type="button" onClick={clearError} aria-label="Dismiss error" className="shrink-0 rounded-full p-0.5 hover:bg-destructive/20 transition-colors">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className={cn(
          'relative flex w-full flex-col gap-2 rounded-2xl border bg-muted/30 p-3',
          isDragging && 'ring-2 ring-primary/50',
          className
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {uploads.length > 0 && (
          <FileUploadList uploads={uploads} onRemove={removeUpload} className="pb-2" />
        )}

        <div className="relative">
          <Popover open={showCommandMenu} onOpenChange={setShowCommandMenu}>
            <PopoverTrigger asChild>
              <div className="w-0 h-0 absolute" />
            </PopoverTrigger>
            <PopoverContent className="p-0 w-64" align="start" side="top" sideOffset={8}>
              <Command className="rounded-lg border-none">
                <CommandInput placeholder="search files..." />
                <CommandList>
                  <CommandEmpty>no files uploaded.</CommandEmpty>
                  {completedUploads.length > 0 && (
                    <CommandGroup heading="Files">
                      {completedUploads.map((upload) => (
                        <CommandItem
                          key={upload.id}
                          onSelect={() => { addFileReferenceToText(upload); setShowCommandMenu(false); }}
                          className="cursor-pointer"
                        >
                          <FileIcon className="mr-2 h-4 w-4" />
                          <span className="truncate">{upload.file.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            aria-label={placeholder}
            rows={1}
            className={cn(
              'w-full resize-none bg-transparent text-sm',
              'placeholder:text-muted-foreground/50 focus:outline-none',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'min-h-[24px] max-h-[200px]'
            )}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {showFileButton && (
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer" onClick={async () => { const f = await showFileUploadDialog(); if (f) addFiles(f); }} disabled={isBusy} aria-label="Attach file">
                <Paperclip className="h-4 w-4" />
              </Button>
            )}
            {showImageButton && (
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer" onClick={async () => { const f = await showFileUploadDialog('image/*'); if (f) addFiles(f); }} disabled={isBusy} aria-label="Attach image">
                <ImagePlus className="h-4 w-4" />
              </Button>
            )}
            {examplePrompts && examplePrompts.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer" disabled={isBusy} aria-label="Example prompts">
                    <HelpCircle className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-1 w-72" align="start" side="top" sideOffset={8}>
                  <div className="flex flex-col">
                    {examplePrompts.map((prompt, i) => (
                      <button key={i} type="button" onClick={() => { setValue(prompt); textareaRef.current?.focus(); }} className="text-left px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors">
                        {prompt}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isBusy ? (
              <Button type="button" size="icon" variant="default" onClick={stopGeneration} className="h-8 w-8 rounded-full cursor-pointer" aria-label="Stop generating">
                <Square className="h-3 w-3" fill="currentColor" />
              </Button>
            ) : (
              <Button type="button" size="icon" onClick={handleSend} disabled={!canSend} className="h-8 w-8 rounded-full cursor-pointer" aria-label="Send message">
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <DragOverlay isDragging={isDragging} />
      </div>
    </div>
  );
}));

ChatInput.displayName = 'ChatInput';
