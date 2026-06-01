import { useEffect, useState } from "react";
import { getAllKeys, type ProviderKeys } from "@/modules/ai";
import { onKeysChanged } from "@/modules/settings/store";

/**
 * Load provider API keys on mount and re-load whenever Settings emits the
 * `sentor:keys-changed` event. `keysLoaded` flips to true after the first load
 * so the UI can suppress the AI input bar until keys are actually available.
 */
export function useApiKeys(setApiKeys: (keys: ProviderKeys) => void) {
  const [keysLoaded, setKeysLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const reload = () => {
      void getAllKeys().then((keys) => {
        if (!alive) return;
        setApiKeys(keys);
        setKeysLoaded(true);
      });
    };
    reload();
    const unlistenP = onKeysChanged(reload);
    return () => {
      alive = false;
      void unlistenP.then((fn) => fn());
    };
  }, [setApiKeys]);

  return { keysLoaded };
}
