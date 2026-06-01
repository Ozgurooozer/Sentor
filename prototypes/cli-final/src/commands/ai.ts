import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { generateOllamaResponse, listOllamaModels } from '../utils/ollamaClient.js';

export function registerAiCommand(program: Command) {
  program.command('ai')
    .description('Yerel AI (Ollama) ile sohbet et veya kod üret')
    .option("-m, --model <modelName>", "Kullanılacak Ollama modeli (varsayılan: llama2)", "llama2")
    .option("-l, --list-models", "Mevcut Ollama modellerini listele")
    .action(async (options) => {
      console.log(chalk.yellow('Ollama AI ile sohbet başlatılıyor... (Çıkmak için Ctrl+C)'));
      if (options.listModels) {
        const spinner = ora("Ollama modelleri listeleniyor...").start();
        try {
          const models = await listOllamaModels();
          spinner.stop();
          if (models.length > 0) {
            console.log(chalk.green("Mevcut Ollama Modelleri:"));
            models.forEach((model: any) => console.log(`- ${model.name}`));
          } else {
            console.log(chalk.yellow("Hiçbir Ollama modeli bulunamadı. Lütfen Ollama sunucusunun çalıştığından ve modellerin yüklü olduğundan emin olun."));
          }
        } catch (error) {
          spinner.stop();
          console.error(chalk.red("Modeller listelenirken bir hata oluştu."));
        }
        return;
      }

      console.log(chalk.gray(`Seçili model: ${options.model}`));

      const chatLoop = async () => {
        const { prompt } = await inquirer.prompt([
          {
            type: 'input',
            name: 'prompt',
            message: chalk.cyan('Sen:'),
          }
        ]);

        if (prompt.trim().toLowerCase() === 'exit' || prompt.trim().toLowerCase() === 'quit') {
          console.log(chalk.green('Görüşmek üzere!'));
          process.exit(0);
        }

        if (prompt.trim() === '') {
          return chatLoop();
        }

        const spinner = ora('AI düşünüyor...').start();
        try {
          const response = await generateOllamaResponse(prompt, options.model);
          spinner.stop();
          console.log(chalk.magenta('AI: ') + response);
        } catch (error) {
          spinner.stop();
          console.log(chalk.red('Bir hata oluştu.'));
        }

        await chatLoop();
      };

      await chatLoop();
    });
}
