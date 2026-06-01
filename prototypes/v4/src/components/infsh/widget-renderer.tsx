/**
 * WidgetRenderer stub.
 */

import React from 'react';
import type { Widget, WidgetAction, WidgetFormData } from './widget-types';

interface WidgetRendererProps {
  widget: Widget;
  onAction?: (action: WidgetAction, formData?: WidgetFormData) => void;
  disabled?: boolean;
  className?: string;
}

export function WidgetRenderer({ widget, className }: WidgetRendererProps) {
  return (
    <div className={className} style={{ fontSize: 11, color: 'var(--muted-foreground)', padding: '4px 8px' }}>
      widget: {widget.type}
    </div>
  );
}
