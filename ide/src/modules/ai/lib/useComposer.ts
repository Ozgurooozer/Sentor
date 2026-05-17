import { useContext } from "react";
import { ComposerContext, type ComposerCtx } from "./composer";

export function useComposer(): ComposerCtx {
  const ctx = useContext(ComposerContext);
  if (!ctx) throw new Error("useComposer must be used inside <AiComposerProvider>");
  return ctx;
}
