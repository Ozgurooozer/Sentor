# 🎬 Ses & Ekran Kayıt Sistemi

Seçtiğin uygulamanın sesini yazıya çevirir ve/veya ekranını kaydeder.
Ses + video **ayrı dosyalara** kaydedilir.

---

## Kurulum

```bash
# Python paketleri
pip install -r requirements.txt

# Sistem araçları (Linux)
sudo apt install ffmpeg xdotool wmctrl
```

> **macOS:** BlackHole sanal ses cihazı + `brew install ffmpeg`
> **Windows:** Stereo Mix etkinleştir + ffmpeg PATH'e ekle

---

## Kullanım

### Mod seçimi

```bash
python main.py --mode audio     # sadece ses → transkript.txt
python main.py --mode screen    # sadece ekran → video.mp4
python main.py --mode both      # ikisi birden (varsayılan)
```

### Ses seçenekleri

```bash
python main.py --model small        # daha doğru Whisper modeli
python main.py --lang en            # İngilizce
python main.py --lang None          # dili otomatik algıla
python main.py --buffer 3           # 3 saniyelik parçalar
python main.py --transcript log.txt # transkript dosyası adı
python main.py --no-stdout          # terminale yazma
```

### Ekran seçenekleri

```bash
python main.py --fps 15             # daha akıcı video
python main.py --video cikti.mp4    # video dosya adı
python main.py --no-video           # sadece frame callback (dosyaya yazma)
```

---

## Modül olarak kullanma

```python
from main import run

# Basit — her şeyi interaktif seçtir
run(mode="both")

# Özelleştirilmiş
run(
    mode="both",
    model="small",
    lang="tr",
    buffer_secs=3,
    transcript_file="transkript.txt",
    fps=10,
    video_file="kayit.mp4",
)

# Frame callback — her frame için kendi fonksiyonun çağrılır
def kare_analiz(frame):   # numpy BGR array (H x W x 3)
    print("Frame boyutu:", frame.shape)

run(
    mode="screen",
    video_file=None,          # dosyaya yazma
    frame_callbacks=[kare_analiz],
)

# Metin callback — her transkript parçası gelince çağrılır
def metin_al(text: str):
    print("YENİ METİN:", text)

run(
    mode="audio",
    text_callbacks=[metin_al],
)
```

---

## Modüller

```
config.py          → Tüm ayarlar (AudioConfig, WhisperConfig, ScreenConfig)
selector.py        → Ses kaynağı seç (uygulama listesi)
capture.py         → PulseAudio sanal yönlendirme + PyAudio ses akışı
transcriber.py     → Whisper wrapper (PCM bytes → metin)
output.py          → Metin çıktısı (stdout / dosya / callback)

screen_selector.py → Pencere / monitör seç (xdotool fare ile tık, wmctrl liste)
screen_capture.py  → Seçilen bölgeden frame üret (mss)
recorder.py        → Frame'leri MP4'e yaz (ffmpeg pipe) + callback

main.py            → Hepsini birbirine bağlar, CLI + modül arayüzü
```

## Çıktılar

| Dosya | İçerik |
|---|---|
| `transkript_<zaman>.txt` | Zaman damgalı transkript |
| `video_<zaman>.mp4` | Ekran kaydı (H.264) |

Her ikisi de bağımsız dosyalardır, birleştirilmez.

---

## Whisper Model Karşılaştırması

| Model  | Hız   | Doğruluk | RAM  |
|--------|-------|----------|------|
| tiny   | ~32x  | Düşük    | ~1GB |
| base   | ~16x  | Orta     | ~1GB |
| small  | ~6x   | İyi      | ~2GB |
| medium | ~2x   | Çok iyi  | ~5GB |
| large  | ~1x   | En iyi   | ~10GB|

> GPU için `config.py`'de `device="cuda"` yap.
