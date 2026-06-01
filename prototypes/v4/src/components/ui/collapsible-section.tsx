import React, { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';

interface CollapsibleSectionProps {
  icon?: ReactNode;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isActive?: boolean;
  preview?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function CollapsibleSection({
  icon,
  label,
  open,
  onOpenChange,
  isActive,
  preview,
  children,
  className,
}: CollapsibleSectionProps) {
  return (
    <div className={cn('text-xs', className)}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={cn(
          'flex items-center gap-1 text-muted-foreground/70 hover:text-muted-foreground transition-colors py-0.5',
          isActive && 'animate-pulse'
        )}
      >
        <ChevronRight
          className={cn('h-3 w-3 transition-transform', open && 'rotate-90')}
        />
        {icon}
        <span className="lowercase">{label}</span>
        {preview}
      </button>
      {open && (
        <div className="mt-1 border-l-2 border-border ml-1">
          {children}
        </div>
      )}
    </div>
  );
}
