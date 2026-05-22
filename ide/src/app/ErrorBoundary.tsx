import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error(`[ErrorBoundary:${this.props.name ?? "root"}]`, error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  private handleCopyLogs = () => {
    const { error } = this.state;
    if (!error) return;
    const text = `Error: ${error.message}\n\nStack:\n${error.stack ?? "(no stack)"}`;
    navigator.clipboard.writeText(text).catch(() => {});
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 12,
          padding: 24,
          background: "#0a0a0a",
          color: "#f5f5f5",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ fontSize: 14, color: "#888", marginBottom: 4 }}>
          {this.props.name ? `[${this.props.name}] ` : ""}Something went wrong
        </div>
        <div
          style={{
            fontSize: 12,
            color: "#f87171",
            background: "#1a0a0a",
            border: "1px solid #3a1a1a",
            borderRadius: 6,
            padding: "8px 12px",
            maxWidth: 480,
            wordBreak: "break-word",
          }}
        >
          {error.message}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button
            onClick={this.handleReset}
            style={{
              padding: "4px 12px",
              fontSize: 12,
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: 4,
              color: "#f5f5f5",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <button
            onClick={this.handleCopyLogs}
            style={{
              padding: "4px 12px",
              fontSize: 12,
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: 4,
              color: "#888",
              cursor: "pointer",
            }}
          >
            Copy error
          </button>
        </div>
      </div>
    );
  }
}
