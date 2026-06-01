import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import ora from 'ora';
import { generateOllamaResponse } from '../utils/ollamaClient.js';

export function registerAnalyzeCommand(program: Command) {
  program.command('analyze <filePath>')
    .description('Bir dosyayı analiz et ve AI ile açıkla')
    .option('-m, --model <modelName>', 'Kullanılacak Ollama modeli', 'llama2')
    .action(async (filePath, options) => {
      const absolutePath = path.resolve(filePath);
      
      if (!fs.existsSync(absolutePath)) {
        console.error(chalk.red(`Hata: Dosya bulunamadı: ${filePath}`));
        return;
      }

      const spinner = ora('Dosya okunuyor ve analiz ediliyor...').start();
      try {
        const content = fs.readFileSync(absolutePath, 'utf-8');
        const prompt = `Lütfen aşağıdaki kod/dosya içeriğini analiz et ve ne işe yaradığını kısaca açıkla:\n\n${content}`;
        
        spinner.text = 'AI analizi yapıyor...';
        const response = await generateOllamaResponse(prompt, options.model);
        
        spinner.stop();
        console.log(chalk.green('\n--- Analiz Sonucu ---'));
        console.log(response);
      } catch (error) {
        spinner.stop();
        console.error(chalk.red('Analiz sırasında bir hata oluştu.'));
      }
    });
}
