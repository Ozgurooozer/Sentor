/**
 * Popover component stub.
 * Minimal floating panel implementation for ChatInput.
 */

import React, { useState, useRef, useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PopoverProps {
  children?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface PopoverTriggerProps {
  children?: ReactNode;
  asChild?: boolean;
}

interface PopoverContentProps {
  children?: ReactNode;
  className?: string;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
  sideOffset?: number;
}

const PopoverContext = React.createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
}>({ open: false, setOpen: () => {} });

export function Popover({ children, open: controlledOpen, onOpenChange }: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  };

  return (
    <PopoverContext.Provider value={{ open, setOpen }}>
      <div className="relative inline-block">{children}</div>
    </PopoverContext.Provider>
  );
}

export function PopoverTrigger({ children, asChild }: PopoverTriggerProps) {
  const { setOpen, open } = React.useContext(PopoverContext);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
      onClick: () => setOpen(!open),
    });
  }

  return (
    <button type="button" onClick={() => setOpen(!open)}>
      {children}
    </button>
  );
}

export function PopoverContent({
  children,
  className,
  side = 'bottom',
  sideOffset = 4,
}: PopoverContentProps) {
  const { open, setOpen } = React.useContext(PopoverContext);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open, setOpen]);

  if (!open) return null;

  const positionStyle: React.CSSProperties =
    side === 'top'
      ? { bottom: `calc(100% + ${sideOffset}px)`, left: 0 }
      : { top: `calc(100% + ${sideOffset}px)`, left: 0 };

  return (
    <div
      ref={ref}
      style={{ ...positionStyle, position: 'absolute', zIndex: 50 }}
      className={cn(
        'rounded-md border border-border bg-popover text-popover-foreground shadow-md',
        'animate-in fade-in-0 zoom-in-95',
        className
      )}
    >
      {children}
    </div>
  );
}
