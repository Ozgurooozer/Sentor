import fs from 'fs';
import path from 'path';
import { Tool } from './types.js';

export interface Skill extends Tool {
  category: string;
}

export class SkillManager {
  private skills: Map<string, Skill> = new Map();
  private skillsDir: string;

  constructor(baseDir: string) {
    this.skillsDir = path.join(baseDir, 'skills');
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
    }
  }

  registerSkill(skill: Skill) {
    this.skills.set(skill.name, skill);
  }

  getSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  async loadDynamicSkills() {
    // Gelecekte çalışma zamanında (runtime) dosyalardan beceri yüklemek için
  }
}
