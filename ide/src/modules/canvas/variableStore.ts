// ide/src/modules/canvas/variableStore.ts
import { create } from "zustand";
import { LazyStore } from "@tauri-apps/plugin-store";

export interface VariableRecord {
  id: string;
  name: string;           // unique key, e.g. "myVar"
  value: unknown;         // current value
  dataType: "text" | "json" | "number" | "any";
  updatedAt: number;      // Date.now() timestamp
}

interface VariableState {
  variables: VariableRecord[];
  hydrated: boolean;
}

interface VariableActions {
  setVariable(name: string, value: unknown, dataType?: VariableRecord["dataType"]): void;
  getVariable(name: string): VariableRecord | undefined;
  removeVariable(name: string): void;
  listVariables(): VariableRecord[];
  hydrate(): Promise<void>;
}

const _store = new LazyStore("sentor-variables.json", { defaults: {}, autoSave: 400 });

let _saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    _saveTimer = null;
    const currentVars = useVariableStore.getState().variables;
    await _store.set("variables", currentVars).catch(() => undefined);
    await _store.save().catch(() => undefined);
  }, 400);
}

export const useVariableStore = create<VariableState & VariableActions>((set, get) => ({
  variables: [],
  hydrated: false,

  setVariable(name, value, dataType = "any") {
    const existing = get().variables.find((v) => v.name === name);
    let updated: VariableRecord[];
    if (existing) {
      updated = get().variables.map((v) =>
        v.name === name ? { ...v, value, dataType, updatedAt: Date.now() } : v,
      );
    } else {
      const newVar: VariableRecord = {
        id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        value,
        dataType,
        updatedAt: Date.now(),
      };
      updated = [...get().variables, newVar];
    }
    set({ variables: updated });
    scheduleFlush();
  },

  getVariable(name) {
    return get().variables.find((v) => v.name === name);
  },

  removeVariable(name) {
    const updated = get().variables.filter((v) => v.name !== name);
    set({ variables: updated });
    scheduleFlush();
  },

  listVariables() {
    return get().variables;
  },

  async hydrate() {
    if (get().hydrated) return;
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    try {
      const saved = await _store.get<VariableRecord[]>("variables");
      if (Array.isArray(saved)) set({ variables: saved, hydrated: true });
      else set({ hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
}));
