import { EventEmitter } from 'events';
import chalk from 'chalk';

export interface Signal {
  payload: any;
  voltage: number; // 0-1 arası zeka yoğunluğu/önemi
  sourceId: string;
}

export abstract class CircuitComponent extends EventEmitter {
  public inputs: Map<string, Signal> = new Map();
  
  constructor(public id: string, public type: string) {
    super();
  }

  abstract process(signal: Signal): Promise<void>;

  protected emitSignal(payload: any, voltage: number = 1) {
    console.log(chalk.yellow(`[⚡ ${this.id}] Sinyal Yayılıyor (Voltaj: ${voltage.toFixed(2)})`));
    this.emit('signal', { payload, voltage, sourceId: this.id });
  }
}

export class Circuit extends EventEmitter {
  private components: Map<string, CircuitComponent> = new Map();

  addComponent(component: CircuitComponent) {
    this.components.set(component.id, component);
    component.on('signal', (signal: Signal) => {
      this.propagate(component.id, signal);
    });
  }

  connect(fromId: string, toId: string) {
    const from = this.components.get(fromId);
    const to = this.components.get(toId);
    if (from && to) {
      from.on('signal', (signal) => to.process(signal));
      console.log(chalk.dim(`[🔗] ${fromId} -> ${toId} bağlandı.`));
    }
  }

  private propagate(fromId: string, signal: Signal) {
    this.emit('propagation', { fromId, signal });
  }
}
