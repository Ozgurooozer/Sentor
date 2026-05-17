import { useContext } from "react";
import { ThemeProviderContext, type ThemeProviderState } from "./ThemeProvider";

export function useTheme(): ThemeProviderState {
  const ctx = useContext(ThemeProviderContext);
  if (!ctx) throw new Error("useTheme must be used within a <ThemeProvider>");
  return ctx;
}
