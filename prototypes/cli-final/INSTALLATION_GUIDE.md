# Manus Agentic Circuit Engine CLI - Kurulum ve Kullanım Rehberi

## Genel Bakış

**Manus CLI**, TypeScript ile yazılmış, yerel AI (Ollama) desteğine sahip, sonsuz kanvas mimarisine dayanan agentic bir komut satırı uygulamasıdır. Elektrik devresi metaforunu kullanarak karmaşık iş akışlarını modüler, yeniden kullanılabilir bileşenlerle yönetir.

## Ön Gereksinimler

- **Node.js:** v16 veya daha yeni
- **npm:** v7 veya daha yeni
- **Ollama:** Yerel AI özellikleri için (opsiyonel, fakat önerilir)
  - İndir: https://ollama.ai
  - Kurulum sonrası: `ollama run llama2` (veya başka bir model)

## Kurulum Adımları

### 1. Projeyi Çıkart
```bash
tar -xzf manus-circuit-cli-final.tar.gz
cd manus-cli
```

### 2. Bağımlılıkları Yükle
```bash
npm install
```

### 3. Projeyi Derle
```bash
npm run build
```

### 4. Küresel Olarak Yükle (Opsiyonel)
```bash
npm install -g .
```

Bu adımdan sonra `manus` komutunu terminalin her yerinden çalıştırabilirsiniz.

## Kullanım

### Temel Komutlar

#### 1. Karşılama Mesajı
```bash
node dist/index.js hello
```
Çıkış:
```
Merhaba! Manus CLI hoş geldiniz.
```

#### 2. Circuit Engine'i Başlat
```bash
node dist/index.js circuit
```

Bu komut, agentic elektrik devresi mimarisini başlatır ve örnek bir sinyal akışını gösterir.

## Mimari Bileşenler

### Circuit (Devre)
Tüm bileşenleri bir araya getiren ana yapı. Düğümleri birbirine bağlar ve sinyalleri yayar.

### Components (Bileşenler)

#### DecisionGate (Karar Kapısı)
- AI tarafından desteklenen mantık kapısı
- Sinyali belirli koşullara göre yönlendirir
- Örnek: "Bu bir kod yazma isteği mi?"

#### AITransformer (AI Dönüştürücü)
- Gelen sinyali işler ve dönüştürür
- Yerel AI modelini kullanarak veri zenginleştirme yapar
- Örnek: "Bu isteği temiz TypeScript koduna dönüştür"

#### OutputActuator (Çıkış Aktüatörü)
- Işlenen sinyali son kullanıcıya iletir
- Terminal çıkışı, dosya yazma, API çağrısı vb. yapabilir

## Geliştirme

### Kaynak Dosyalar Yapısı
```
src/
├── index.ts           # Ana giriş noktası
├── circuit.ts         # Devre mimarisi
├── components.ts      # Bileşen tanımları
├── types.ts           # TypeScript tipleri
└── utils/             # Yardımcı fonksiyonlar
```

### Yeni Bileşen Ekleme

1. `src/components.ts` dosyasına yeni bir sınıf ekleyin:
```typescript
export class MyCustomComponent extends CircuitComponent {
  async process(signal: Signal): Promise<Signal> {
    // İşleme mantığınız
    return signal;
  }
}
```

2. `src/index.ts` dosyasında kullanın:
```typescript
const myComponent = new MyCustomComponent('my-id', 'My Description');
circuit.addComponent(myComponent);
```

### Yerel Derlemeler
```bash
npm run build      # TypeScript'i JavaScript'e derle
npm run dev        # Geliştirme modunda çalıştır (nodemon ile)
```

## Örnekler

### Örnek 1: Basit Devre Oluşturma
```bash
node dist/index.js circuit
```

### Örnek 2: Kendi Devrenizi Programlama
`src/index.ts` dosyasını düzenleyerek kendi devrelerinizi oluşturabilirsiniz.

## Sorun Giderme

### Hata: "Ollama bağlantısı kurulamadı"
- Ollama'nın çalıştığından emin olun: `ollama serve`
- Varsayılan port: `http://localhost:11434`

### Hata: "Module not found"
- Bağımlılıkları yeniden yükleyin: `npm install`
- Projeyi yeniden derleyin: `npm run build`

### Hata: "Permission denied"
- Dosyaya çalıştırma izni verin: `chmod +x dist/index.js`

## npm Üzerinden Yayınlama (Gelecek)

Projeyi npm registry'sine yayınlamak için:
```bash
npm login
npm publish
```

Bundan sonra herkes şu komutla yükleyebilir:
```bash
npm install -g manus-cli
```

## Lisans

MIT

## İletişim & Katkıda Bulunma

Sorular, öneriler veya katkılar için lütfen GitHub repository'sine bakın.

---

**Sürüm:** 1.0.0  
**Son Güncelleme:** 2026-05-27
