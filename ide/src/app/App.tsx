import { ErrorBoundary } from "./ErrorBoundary";
import { CanvasAppShell } from "./CanvasAppShell";
import { V3InputShell } from "@/modules/v3/V3InputShell";
import { V3OutputShell } from "@/modules/v3/V3OutputShell";
import { V3LauncherShell } from "@/modules/v3/V3LauncherShell";

const hash = window.location.hash;

export default function App() {
  if (hash.startsWith("#v3-launcher")) return <ErrorBoundary name="v3-launcher"><V3LauncherShell /></ErrorBoundary>;
  if (hash.startsWith("#v3-output"))  return <ErrorBoundary name="v3-output"><V3OutputShell /></ErrorBoundary>;
  if (hash.startsWith("#v3-input"))   return <ErrorBoundary name="v3-input"><V3InputShell /></ErrorBoundary>;
  return <ErrorBoundary name="app"><CanvasAppShell /></ErrorBoundary>;
}
