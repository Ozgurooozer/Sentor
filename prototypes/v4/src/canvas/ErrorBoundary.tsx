import { Component, type ReactNode } from "react";

interface Props { children: ReactNode; fallback?: ReactNode; name?: string; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  render() {
    if (this.state.error) return this.props.fallback ?? <div style={{ color: "red", padding: 8 }}>Error: {this.state.error.message}</div>;
    return this.props.children;
  }
}
