import { defaultSkills } from './tools.js';
import { generateOllamaResponse } from './utils/ollamaClient.js';
import chalk from 'chalk';
import ora from 'ora';

const PI_SYSTEM_PROMPT = `Sen 'Pi' felsefesiyle çalışan minimal bir Coding Agent'sın.
Görevin: Az konuş, çok iş yap. Kendi kodunu bile değiştirebilirsin.

Yeteneklerin (Skills):
${defaultSkills.map(s => `[${s.category}] ${s.name}: ${s.description}`).join('\n')}

Format:
Düşünce: <aksiyon planın>
Aksiyon: <skill_name>({ "param": "value" })
Cevap: <kullanıcıya mesajın>

Her zaman geçerli bir JSON objesi döndür:
{ "thought": "...", "action": { "name": "...", "input": {...} }, "answer": "..." }`;

export async function runPiLoop(userInput: string, model: string = 'llama2') {
  let currentContext = userInput;
  const spinner = ora();

  for (let i = 0; i < 5; i++) {
    spinner.start('Pi düşünüyor...');
    const response = await generateOllamaResponse(`${PI_SYSTEM_PROMPT}\n\nKullanıcı: ${currentContext}`, model);
    spinner.stop();

    try {
      const data = JSON.parse(response);
      if (data.thought) console.log(chalk.dim(`> ${data.thought}`));
      
      if (data.action && data.action.name) {
        const skill = defaultSkills.find(s => s.name === data.action.name);
        if (skill) {
          console.log(chalk.cyan(`* Uygulanıyor: ${skill.name}`));
          const result = await skill.execute(data.action.input);
          console.log(chalk.gray(`* Sonuç: ${result}`));
          currentContext = `İşlem sonucu: ${result}. Sıradaki adım nedir?`;
          continue;
        }
      }

      if (data.answer) {
        console.log(chalk.green(`Pi: ${data.answer}`));
        break;
      }
    } catch (e) {
      console.log(chalk.red('Pi yanıtı işleyemedi.'));
      break;
    }
  }
}
