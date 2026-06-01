/**
 * Widget types stub.
 */

export interface WidgetAction {
  type: string;
  payload?: Record<string, unknown>;
}

export type WidgetFormData = Record<string, unknown>;

export interface Widget {
  type: string;
  data?: unknown;
}

export function parseWidget(data: unknown): Widget | null {
  if (!data) return null;
  try {
    const obj = typeof data === 'string' ? JSON.parse(data) : data;
    if (obj && typeof obj === 'object' && 'type' in obj) {
      return obj as Widget;
    }
  } catch {
    // not a widget
  }
  return null;
}
