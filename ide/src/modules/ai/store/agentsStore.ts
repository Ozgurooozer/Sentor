import { emit, listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import {
  BUILTIN_AGENTS,
  loadAgents,
  newAgentId,
  saveActiveAgentId,
  saveAgentConfigs,
  saveCustomAgents,
  type Agent,
  type AgentConfig,
} from "../lib/agents";

const CHANGED_EVENT = "sentor://ai-agents-changed";

type AgentsState = {
  hydrated: boolean;
  customAgents: Agent[];
  activeId: string;
  agentConfigs: Record<string, AgentConfig>;
  /** All agents, builtin first. */
  all: () => Agent[];
  hydrate: () => Promise<void>;
  setActiveId: (id: string) => void;
  upsert: (agent: Agent) => void;
  remove: (id: string) => void;
  setAgentConfig: (agentId: string, config: AgentConfig) => void;
  getAgentConfig: (agentId: string) => AgentConfig;
};

let initialized = false;

function broadcast(): void {
  void emit(CHANGED_EVENT);
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
  hydrated: false,
  customAgents: [],
  activeId: BUILTIN_AGENTS[0].id,
  agentConfigs: {},
  all: () => [...BUILTIN_AGENTS, ...get().customAgents],
  hydrate: async () => {
    if (initialized) return;
    initialized = true;
    const { custom, activeId, agentConfigs } = await loadAgents();
    set({ customAgents: custom, activeId, agentConfigs, hydrated: true });

    void listen(CHANGED_EVENT, async () => {
      const fresh = await loadAgents();
      set({ customAgents: fresh.custom, activeId: fresh.activeId, agentConfigs: fresh.agentConfigs });
    });
  },
  setActiveId: (id) => {
    set({ activeId: id });
    void saveActiveAgentId(id).then(broadcast);
  },
  upsert: (agent) => {
    if (agent.builtIn) return;
    const list = get().customAgents;
    const idx = list.findIndex((a) => a.id === agent.id);
    const next =
      idx === -1 ? [...list, agent] : list.map((a) => (a.id === agent.id ? agent : a));
    set({ customAgents: next });
    void saveCustomAgents(next).then(broadcast);
  },
  remove: (id) => {
    const list = get().customAgents.filter((a) => a.id !== id);
    set({ customAgents: list });
    let active = get().activeId;
    if (active === id) {
      active = BUILTIN_AGENTS[0].id;
      set({ activeId: active });
      void saveActiveAgentId(active);
    }
    void saveCustomAgents(list).then(broadcast);
  },
  setAgentConfig: (agentId, config) => {
    const next = { ...get().agentConfigs, [agentId]: config };
    // Remove entry entirely if both fields are empty.
    if (!config.model && !config.thinking) delete next[agentId];
    set({ agentConfigs: next });
    void saveAgentConfigs(next).then(broadcast);
  },
  getAgentConfig: (agentId) => get().agentConfigs[agentId] ?? {},
}));

export { newAgentId };
