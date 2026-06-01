import { create } from "zustand";
import { LazyStore } from "@tauri-apps/plugin-store";
import { setWorkspaceRoot } from "@/modules/settings/store";

const store = new LazyStore("v3-projects.json");

export type Project = {
  id: string;
  name: string;
  path: string;         // proje kök dizini
  vaultPath: string;    // vault dizini (genellikle path + "/vault")
  color: string;        // UI rengi
  created: number;
  lastOpened: number;
};

// Sentor kendi standart vault'u
export const SENTOR_DEFAULT_PROJECT: Project = {
  id: "sentor-default",
  name: "Sentor",
  path: "C:/Sentor",
  vaultPath: "C:/Sentor/vault",
  color: "#5b8def",
  created: 0,
  lastOpened: Date.now(),
};

type ProjectState = {
  projects: Project[];
  activeId: string;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addProject: (p: Omit<Project, "id" | "created" | "lastOpened">) => Promise<Project>;
  removeProject: (id: string) => Promise<void>;
  setActive: (id: string) => Promise<void>;
  getActive: () => Project;
};

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [SENTOR_DEFAULT_PROJECT],
  activeId: SENTOR_DEFAULT_PROJECT.id,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const saved = await store.get<Project[]>("projects");
      const activeId = await store.get<string>("activeId");
      if (saved && saved.length > 0) {
        // Sentor default her zaman başta
        const withDefault = saved.find(p => p.id === SENTOR_DEFAULT_PROJECT.id)
          ? saved
          : [SENTOR_DEFAULT_PROJECT, ...saved];
        const resolvedId = activeId ?? SENTOR_DEFAULT_PROJECT.id;
        set({ projects: withDefault, activeId: resolvedId, hydrated: true });
        // Workspace root'u aktif projeye göre ayarla
        const active = withDefault.find(p => p.id === resolvedId);
        if (active) await setWorkspaceRoot(active.path);
      } else {
        set({ hydrated: true });
      }
    } catch {
      set({ hydrated: true });
    }
  },

  addProject: async (data) => {
    const p: Project = {
      ...data,
      id: `proj-${Date.now()}`,
      created: Date.now(),
      lastOpened: Date.now(),
    };
    const next = [...get().projects, p];
    set({ projects: next });
    await store.set("projects", next);
    await store.save();
    return p;
  },

  removeProject: async (id) => {
    if (id === SENTOR_DEFAULT_PROJECT.id) return;
    const next = get().projects.filter(p => p.id !== id);
    set({ projects: next });
    if (get().activeId === id) {
      set({ activeId: SENTOR_DEFAULT_PROJECT.id });
      await store.set("activeId", SENTOR_DEFAULT_PROJECT.id);
    }
    await store.set("projects", next);
    await store.save();
  },

  setActive: async (id) => {
    set({ activeId: id });
    const proj = get().projects.find(p => p.id === id);
    if (proj) {
      const updated = get().projects.map(p => p.id === id ? { ...p, lastOpened: Date.now() } : p);
      set({ projects: updated });
      await store.set("projects", updated);
      // Workspace root'u yeni projenin path'iyle güncelle — terminal, araçlar, AI hepsi buradan okuyor
      await setWorkspaceRoot(proj.path);
    }
    await store.set("activeId", id);
    await store.save();
  },

  getActive: () => {
    const { projects, activeId } = get();
    return projects.find(p => p.id === activeId) ?? SENTOR_DEFAULT_PROJECT;
  },
}));
