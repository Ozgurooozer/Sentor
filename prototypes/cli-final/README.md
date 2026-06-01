# π Pi Coding Agent (TypeScript CLI)

Pi, minimalist bir yaklaşımla tasarlanmış, otonom bir kodlama asistanıdır. "Az konuş, çok iş yap" felsefesini benimser ve kendi yeteneklerini (skills) kullanarak geliştirme sürecinizi otomatikleştirir.

## Felsefe
- **Minimalizm:** Gereksiz süslemelerden kaçınır, doğrudan çözüme odaklanır.
- **Otonomi:** Dosya okuma, yazma ve terminal komutlarını kendi kararlarıyla yönetir.
- **Genişletilebilirlik:** 'Skills' sistemi sayesinde yeni yetenekler kolayca eklenebilir.
- **Self-Modification:** Kendi kod tabanını anlayabilir ve güncelleyebilir.

## Kurulum
```bash
npm install -g manus-cli
```
*Not: Yerel AI desteği için Ollama'nın çalışıyor olması gerekir.*

## Kullanım
```bash
manus chat
```
**Örnek Senaryolar:**
- "Projedeki tüm TypeScript dosyalarını listele ve eksik tipleri tamamla."
- "Yeni bir Express.js sunucusu oluştur ve `server.ts` olarak kaydet."
- "Mevcut agent mimarisini oku ve ona yeni bir 'Hava Durumu' becerisi ekle."

## Geliştirici Notları
Pi, `src/skills.ts` ve `src/tools.ts` üzerinden genişletilir. Her 'Skill', ajanın dünyayı manipüle etmek için kullandığı bir araçtır.
