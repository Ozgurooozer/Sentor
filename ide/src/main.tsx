import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "@xterm/xterm/css/xterm.css";
import "./styles/globals.css";

import { installLogInterceptor } from "./modules/logs/logStore";
installLogInterceptor();

import { getCurrentWindow } from "@tauri-apps/api/window";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { USE_CUSTOM_WINDOW_CONTROLS } from "./lib/platform";
import { USE_V3 } from "./modules/v3/config";

if (USE_CUSTOM_WINDOW_CONTROLS) {
  document.documentElement.dataset.chrome = "borderless";
}

// V3 floating windows — set data-v3 synchronously so the body is transparent
// from the very first paint. Setting it inside useEffect causes a white flash
// because the Tauri window is transparent but body background is opaque by default.
if (window.location.hash.startsWith("#v3-")) {
  document.documentElement.setAttribute("data-v3", "true");
}

window.addEventListener("error", (e) => {
  console.error("[global:error]", e.error ?? e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[global:unhandledrejection]", e.reason);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ErrorBoundary name="root">
    <App />
  </ErrorBoundary>,
);

// V3 modunda pencereyi Rust setup hook açar (doğru boyutla).
// Normal modda burada açılır.
if (!USE_V3) {
  const showWindow = () => {
    getCurrentWindow()
      .show()
      .catch((e) => console.error("window.show failed:", e));
  };
  setTimeout(showWindow, 50);
  setTimeout(showWindow, 500);
}
