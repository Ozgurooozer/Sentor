/**
 * TaskOutputWrapper stub.
 */

import React from 'react';

interface TaskOutputWrapperProps {
  client: unknown;
  taskId: string;
  compact?: boolean;
}

export function TaskOutputWrapper({ taskId }: TaskOutputWrapperProps) {
  return (
    <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
      task: {taskId}
    </div>
  );
}
