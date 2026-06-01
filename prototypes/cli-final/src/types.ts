export interface Tool {
  name: string;
  description: string;
  parameters: object;
  execute: (args: any) => Promise<string>;
}

export interface AgentResponse {
  thought: string;
  tool?: string;
  toolInput?: any;
  answer?: string;
}
