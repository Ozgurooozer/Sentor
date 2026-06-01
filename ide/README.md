# Sentor IDE

**Sentor**, Tauri 2, Rust ve React 19 ile geliştirilmiş, yerel öncelikli, açık kaynaklı ve hafif bir AI-native terminal ve geliştirme ortamıdır (ADE).

## Özellikler

- **Terminal**: xterm.js + WebGL işleyici, çoklu sekme desteği ve yerel PTY arka ucu.
- **Editör**: CodeMirror 6 entegrasyonu, AI destekli otomatik tamamlama ve fark (diff) görünümü.
- **Dosya Gezgini**: Hızlı dosya yönetimi ve bulanık arama.
- **AI Entegrasyonu**: Kendi API anahtarlarınızı kullanın (BYOK) veya LM Studio ile tamamen yerel modelleri çalıştırın.
- **Gizlilik**: API anahtarları işletim sistemi anahtarlığında saklanır, telemetri veya veri toplama yoktur.

## Kurulum ve Çalıştırma

### Gereksinimler
- Rust (stable)
- Node.js 20+ ve pnpm

### Geliştirme Modu
```bash
pnpm install
pnpm tauri dev
```

### Derleme
```bash
pnpm tauri build
```

## Lisans
Bu proje Apache-2.0 lisansı ile lisanslanmıştır.
