import { create } from "zustand";
import { LazyStore } from "@/shims/store";

export interface VariableRecord {
  id: string;
  name: string;
  value: unknown;
  dataType: "text" | "json" | "number" | "any";
  updatedAt: number;
}

interface VariableState {
  variables: VariableRecord[];
  hydrated: boolean;
  setVariable(name: string, value: unknown, dataType?: VariableRecord["dataType"]): void;
  getVariable(name: string): VariableRecord | undefined;
  removeVariable(name: string): void;
  listVariables(): VariableRecord[];
  hydrate(): Promise<void>;
}

const _store = new LazyStore("sentor-v4-variables.json");
const uid = () => crypto.randomUUID();

export const useVariableStore = create<VariableState>((set, get) => ({
  variables: [],
  hydrated: false,

  async hydrate() {
    const saved = await _store.get<VariableRecord[]>("variables");
    if (saved) set({ variables: saved });
    set({ hydrated: true });
  },

  setVariable(name, value, dataType = "any") {
    const { variables } = get();
    const existing = variables.find((v) => v.name === name);
    let next: VariableRecord[];
    if (existing) {
      next = variables.map((v) => v.name === name ? { ...v, value, dataType, updatedAt: Date.now() } : v);
    } else {
      next = [...variables, { id: uid(), name, value, dataType, updatedAt: Date.now() }];
    }
    set({ variables: next });
    _store.set("variables", next).catch(() => {});
  },

  getVariable(name) { return get().variables.find((v) => v.name === name); },
  removeVariable(name) {
    const next = get().variables.filter((v) => v.name !== name);
    set({ variables: next });
    _store.set("variables", next).catch(() => {});
  },
  listVariables() { return get().variables; },
}));
