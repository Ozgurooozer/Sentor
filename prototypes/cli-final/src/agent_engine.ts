import { Canvas, Node } from './core.js';
import { generateOllamaResponse } from './utils/ollamaClient.js';
import chalk from 'chalk';

export class AINode implements Node {
  public input: any = {};
  public output: any = {};
  
  constructor(public id: string, public type: string = 'ai_processor', private model: string = 'llama2') {}

  async execute(input: any): Promise<any> {
    console.log(chalk.blue(`[AI Node ${this.id}] İşleniyor...`));
    const prompt = `Girdi: ${JSON.stringify(input)}\n\nBu girdiyi analiz et ve bir sonuç döndür.`;
    const response = await generateOllamaResponse(prompt, this.model);
    return { result: response };
  }
}

export class ShellNode implements Node {
  public input: any = {};
  public output: any = {};
  
  constructor(public id: string, public type: string = 'shell_executor') {}

  async execute(input: any): Promise<any> {
    console.log(chalk.yellow(`[Shell Node ${this.id}] Komut çalıştırılıyor: ${input.command}`));
    // Gerçek exec implementasyonu buraya gelir
    return { stdout: `Simüle edilen çıktı: ${input.command} çalıştı.` };
  }
}

// Örnek bir sonsuz kanvas senaryosu başlat
export async function bootstrapInfiniteCanvas() {
  const mainCanvas = new Canvas('root');
  
  const aiNode = new AINode('ai-1');
  const shellNode = new ShellNode('shell-1');

  mainCanvas.addNode(aiNode);
  mainCanvas.addNode(shellNode);

  mainCanvas.connect('ai-1', 'shell-1', { 'result': 'command' });

  console.log(chalk.green('Sonsuz Kanvas Mimarisi Hazır.'));
  return mainCanvas;
}
