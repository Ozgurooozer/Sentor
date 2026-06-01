import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Skill } from './skills.js';

const execAsync = promisify(exec);

export const defaultSkills: Skill[] = [
  {
    name: 'read_context',
    description: 'Proje dizinindeki dosyaları listeler ve içeriklerini anlamak için bağlam toplar.',
    category: 'context',
    parameters: { directory: 'string' },
    execute: async ({ directory = '.' }) => {
      try {
        const files = fs.readdirSync(path.resolve(directory))
          .filter(f => !f.startsWith('.') && f !== 'node_modules');
        return `Dizindeki dosyalar: ${files.join(', ')}`;
      } catch (e: any) {
        return `Hata: ${e.message}`;
      }
    }
  },
  {
    name: 'edit_code',
    description: 'Bir dosyadaki belirli bir metni yeni bir metinle değiştirir (Self-modification için temel).',
    category: 'coding',
    parameters: { path: 'string', find: 'string', replace: 'string' },
    execute: async ({ path: filePath, find, replace }) => {
      try {
        const fullPath = path.resolve(filePath);
        let content = fs.readFileSync(fullPath, 'utf-8');
        if (!content.includes(find)) return `Hata: '${find}' metni dosyada bulunamadı.`;
        content = content.replace(find, replace);
        fs.writeFileSync(fullPath, content);
        return `Dosya başarıyla güncellendi: ${filePath}`;
      } catch (e: any) {
        return `Hata: ${e.message}`;
      }
    }
  },
  {
    name: 'terminal',
    description: 'Sistem komutlarını çalıştırır ve çıktısını döner.',
    category: 'system',
    parameters: { command: 'string' },
    execute: async ({ command }) => {
      try {
        const { stdout, stderr } = await execAsync(command);
        return stdout || stderr || 'İşlem tamamlandı.';
      } catch (e: any) {
        return `Hata: ${e.message}`;
      }
    }
  }
];
