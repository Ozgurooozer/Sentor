import axios from 'axios';
import chalk from 'chalk';

const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434/api';

export async function generateOllamaResponse(prompt: string, model: string = 'llama2'): Promise<string> {
  try {
    const response = await axios.post(`${OLLAMA_API_URL}/generate`, {
      model: model,
      prompt: prompt,
      stream: false,
    });
    return response.data.response;
  } catch (error) {
        if (error instanceof Error) {
      console.error(chalk.red(`Ollama API ile iletişim hatası: ${error.message}`));
    } else {
      console.error(chalk.red(`Ollama API ile iletişim hatası: Bilinmeyen bir hata oluştu.`));
    }
    return `Hata: Ollama API'ye bağlanılamadı veya yanıt alınamadı. Lütfen Ollama sunucusunun çalıştığından ve '${OLLAMA_API_URL}' adresinden erişilebilir olduğundan emin olun.`;
  }
}

export async function listOllamaModels(): Promise<any[]> {
  try {
    const response = await axios.get(`${OLLAMA_API_URL}/tags`);
    return response.data.models;
  } catch (error) {
        if (error instanceof Error) {
      console.error(chalk.red(`Ollama modelleri listelenirken hata oluştu: ${error.message}`));
    } else {
      console.error(chalk.red(`Ollama modelleri listelenirken hata oluştu: Bilinmeyen bir hata oluştu.`));
    }
    return [];
  }
}
