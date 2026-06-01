import { EventEmitter } from 'events';

export type NodeInput = Record<string, any>;
export type NodeOutput = Record<string, any>;

export interface Node {
  id: string;
  type: string;
  input: NodeInput;
  output: NodeOutput;
  execute: (input: NodeInput) => Promise<NodeOutput>;
}

export class Canvas extends EventEmitter {
  public nodes: Map<string, Node> = new Map();
  public connections: Array<{ from: string, to: string, portMap: Record<string, string> }> = [];

  constructor(public id: string, public parentCanvas?: Canvas) {
    super();
  }

  addNode(node: Node) {
    this.nodes.set(node.id, node);
    this.emit('nodeAdded', node);
  }

  connect(fromId: string, toId: string, portMap: Record<string, string>) {
    this.connections.push({ from: fromId, to: toId, portMap });
    this.emit('connected', { fromId, toId });
  }

  async run(startNodeId: string, initialInput: NodeInput) {
    const node = this.nodes.get(startNodeId);
    if (!node) return;

    const output = await node.execute(initialInput);
    this.emit('nodeExecuted', { nodeId: startNodeId, output });

    // Bağlı düğümleri tetikle
    const targets = this.connections.filter(c => c.from === startNodeId);
    for (const conn of targets) {
      const targetInput: NodeInput = {};
      for (const [outPort, inPort] of Object.entries(conn.portMap)) {
        targetInput[inPort] = output[outPort];
      }
      await this.run(conn.to, targetInput);
    }
  }
}
