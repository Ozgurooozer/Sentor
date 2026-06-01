import { Canvas, Node, NodeInput, NodeOutput } from './core.js';
import { CodeGraphSearchNode } from './codegraph_nodes.js';
import { AINode } from './agent_engine.js';

// Bir Canvas'ı bir Node olarak temsil eden yapı (Recursive Canvas)
export class CanvasNode implements Node {
  public input: NodeInput = {};
  public output: NodeOutput = {};

  constructor(public id: string, public type: string, private internalCanvas: Canvas) {}

  async execute(input: NodeInput): Promise<NodeOutput> {
    // İç kanvası başlat ve sonuçları bekle
    // Bu basitleştirilmiş bir örnektir
    console.log(`[CanvasNode ${this.id}] Alt kanvas tetikleniyor...`);
    // İlk düğümü (entry point) bul ve çalıştır
    const entryNodeId = Array.from(this.internalCanvas.nodes.keys())[0];
    if (entryNodeId) {
      await this.internalCanvas.run(entryNodeId, input);
    }
    return { status: 'completed' };
  }
}

// Hazır Blueprints (Şablonlar)
export const Blueprints = {
  AI_AGENT_FLOW: (id: string) => {
    const canvas = new Canvas(id);
    // 1. Input Node
    // 2. AI Processing Node
    // 3. Output/Action Node
    return canvas;
  },
  CODE_REFACTOR_FLOW: (id: string) => {
    const canvas = new Canvas(id);
    // Kod okuma -> Analiz -> Değiştirme akışı
    return canvas;
  },
  SEMANTIC_ANALYSIS_FLOW: (id: string) => {
    const canvas = new Canvas(id);
    const search = new CodeGraphSearchNode('search-1');
    const ai = new AINode('ai-analyst');
    
    canvas.addNode(search);
    canvas.addNode(ai);
    canvas.connect('search-1', 'ai-analyst', { 'results': 'context' });
    
    return canvas;
  }
};
