import { Node, NodeInput, NodeOutput } from './core.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';

const execAsync = promisify(exec);

export class CodeGraphSearchNode implements Node {
  public input: NodeInput = {};
  public output: NodeOutput = {};

  constructor(public id: string, public type: string = 'codegraph_search') {}

  async execute(input: NodeInput): Promise<NodeOutput> {
    const query = input.query as string;
    console.log(chalk.blue(`[CodeGraph Search] Sorgulanıyor: ${input.query}`));
    try {
      // CodeGraph CLI üzerinden arama yap
      const { stdout } = await execAsync(`codegraph search "${input.query}" --json`);
      return { results: JSON.parse(stdout) };
    } catch (e: any) {
      return { error: e.message };
    }
  }
}

export class CodeGraphRelationNode implements Node {
  public input: NodeInput = {};
  public output: NodeOutput = {};

  public type: string;
  constructor(public id: string, public relationType: 'callers' | 'callees' | 'impact') {
    this.type = `codegraph_${relationType}`;
  }

  async execute(input: NodeInput): Promise<NodeOutput> {
    const symbol = input.symbol as string;
    const path = input.path as string;
    console.log(chalk.magenta(`[CodeGraph ${this.relationType}] Analiz ediliyor: ${input.symbol}`));
    try {
      const { stdout } = await execAsync(`codegraph ${this.relationType} --path ${input.path} --json`);
      return { data: JSON.parse(stdout) };
    } catch (e: any) {
      return { error: e.message };
    }
  }
}
