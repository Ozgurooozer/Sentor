import { ErrorBoundary } from "./ErrorBoundary";
import { CanvasAppShell } from "./CanvasAppShell";

export default function App() {
  return (
    <ErrorBoundary name="app">
      <CanvasAppShell />
    </ErrorBoundary>
  );
}
