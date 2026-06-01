#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { Circuit } from './circuit.js';
import { DecisionGate, AITransformer, OutputActuator } from './components.js';
import inquirer from 'inquirer';

const program = new Command();

program
  .name('manus')
  .description(chalk.blue('TypeScript tabanlı, Yerel AI destekli akıllı CLI aracı'))
  .version('1.0.0');

program.command('hello')
  .description('Basit bir karşılama komutu')
  .action(() => {
    console.log(chalk.green('Merhaba! Manus CLI hoş geldiniz.'));
  });

program.command('circuit')
  .description('Agentic Elektrik Devresini başlat')
  .action(async () => {
    console.log(chalk.bold.yellow('\n⚡ Manus Agentic Circuit Engine Başlatıldı'));
    console.log(chalk.dim('Intelligence as a Signal\n'));

    const circuit = new Circuit();

    const gate = new DecisionGate('is-code-request', 'Bu bir kod yazma isteği mi?');
    const transformer = new AITransformer('code-generator', 'Verilen isteği temiz bir TypeScript koduna dönüştür.');
    const output = new OutputActuator('terminal-display');

    circuit.addComponent(gate);
    circuit.addComponent(transformer);
    circuit.addComponent(output);

    circuit.connect('is-code-request', 'code-generator');
    circuit.connect('code-generator', 'terminal-display');

    // İlk sinyali gönder
    console.log(chalk.blue('--- Devreye Enerji Veriliyor ---'));
    await gate.process({ payload: 'Bana bir toplama fonksiyonu yaz.', voltage: 1, sourceId: 'user' });
  });

program.parse(process.argv);
