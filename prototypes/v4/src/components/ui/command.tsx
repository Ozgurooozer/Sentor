/**
 * Command component stub.
 * Minimal implementation for file reference menu in ChatInput.
 */

import React, { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CommandProps { children?: ReactNode; className?: string; }
interface CommandInputProps { placeholder?: string; className?: string; }
interface CommandListProps { children?: ReactNode; }
interface CommandEmptyProps { children?: ReactNode; }
interface CommandGroupProps { children?: ReactNode; heading?: string; }
interface CommandItemProps {
  children?: ReactNode;
  className?: string;
  onSelect?: () => void;
  value?: string;
}

export function Command({ children, className }: CommandProps) {
  return <div className={cn('flex flex-col', className)}>{children}</div>;
}

export function CommandInput({ placeholder, className }: CommandInputProps) {
  return (
    <input
      type="text"
      placeholder={placeholder}
      className={cn(
        'w-full px-3 py-2 text-sm bg-transparent border-b border-border outline-none',
        'placeholder:text-muted-foreground',
        className
      )}
    />
  );
}

export function CommandList({ children }: CommandListProps) {
  return <div className="max-h-48 overflow-y-auto">{children}</div>;
}

export function CommandEmpty({ children }: CommandEmptyProps) {
  return (
    <div className="py-2 px-3 text-sm text-muted-foreground text-center">{children}</div>
  );
}

export function CommandGroup({ children, heading }: CommandGroupProps) {
  return (
    <div>
      {heading && (
        <div className="px-3 py-1 text-xs font-medium text-muted-foreground">{heading}</div>
      )}
      {children}
    </div>
  );
}

export function CommandItem({ children, className, onSelect }: CommandItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full flex items-center px-3 py-1.5 text-sm hover:bg-muted cursor-pointer',
        className
      )}
    >
      {children}
    </button>
  );
}
