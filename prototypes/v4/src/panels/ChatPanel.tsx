import { Agent } from "@/components/infsh/agent";
import type { AgentOptions } from "@inferencesh/sdk/agent";

// AdHocAgentConfig requires core_app.ref pointing to an OpenRouter-style model ref
const AGENT_CONFIG: AgentOptions = {
  core_app: { ref: "openai/gpt-4o-mini" },
  system_prompt: "You are a helpful AI assistant.",
  description: "Canvas AI Agent",
  example_prompts: ["What can you help me with?", "Explain this code"],
};

export function ChatPanel({ panelId }: { panelId: string }) {
  const apiKey = ((window as unknown) as Record<string, unknown>)["INFERENCE_API_KEY"] as string | undefined;

  if (!apiKey) {
    return (
      <div style={{ padding: 12, color: "var(--text-secondary)", fontSize: 13, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 20 }}>🔑</span>
        <span>Set INFERENCE_API_KEY</span>
        <code style={{ fontSize: 10, color: "var(--text-tertiary)", background: "var(--bg-elevated)", padding: "2px 6px", borderRadius: 4 }}>
          window.INFERENCE_API_KEY = "your-key"
        </code>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <Agent apiKey={apiKey} config={AGENT_CONFIG} compact />
    </div>
  );
}
