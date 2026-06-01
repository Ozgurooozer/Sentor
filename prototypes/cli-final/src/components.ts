import { CircuitComponent, Signal } from './circuit.js';
import { generateOllamaResponse } from './utils/ollamaClient.js';
import chalk from 'chalk';

// Karar Kapısı (IF-GATE)
export class DecisionGate extends CircuitComponent {
  constructor(id: string, private criteria: string) {
    super(id, 'decision_gate');
  }

  async process(signal: Signal): Promise<void> {
    console.log(chalk.cyan(`[🤔 ${this.id}] Karar veriliyor: ${this.criteria}`));
    const prompt = `Girdi: ${JSON.stringify(signal.payload)}\nKriter: ${this.criteria}\nBu kriter sağlanıyor mu? Sadece 'EVET' veya 'HAYIR' cevabı ver.`;
    const response = await generateOllamaResponse(prompt);
    
    if (response.toUpperCase().includes('EVET')) {
      this.emitSignal(signal.payload, signal.voltage);
    } else {
      console.log(chalk.red(`[🚫 ${this.id}] Sinyal kesildi (Kriter sağlanmadı).`));
    }
  }
}

// Güçlendirici (AI-TRANSFORMER)
export class AITransformer extends CircuitComponent {
  constructor(id: string, private instruction: string) {
    super(id, 'ai_transformer');
  }

  async process(signal: Signal): Promise<void> {
    console.log(chalk.magenta(`[🌀 ${this.id}] Sinyal işleniyor: ${this.instruction}`));
    const prompt = `Girdi: ${JSON.stringify(signal.payload)}\nTalimat: ${this.instruction}\nLütfen girdiyi talimata göre dönüştür.`;
    const result = await generateOllamaResponse(prompt);
    this.emitSignal(result, signal.voltage * 1.1); // Zekayı güçlendir
  }
}

// Çıkış (OUTPUT-ACTUATOR)
export class OutputActuator extends CircuitComponent {
  constructor(id: string) {
    super(id, 'output_actuator');
  }

  async process(signal: Signal): Promise<void> {
    console.log(chalk.green(`[🏁 ${this.id}] Final Çıktı: `) + JSON.stringify(signal.payload));
  }
}
