"""
Tüm ayarlar buradan yönetilir.
"""
from dataclasses import dataclass, field


@dataclass
class AudioConfig:
    sample_rate: int   = 16000   # Whisper 16kHz ister
    channels: int      = 1
    chunk_size: int    = 1024
    buffer_secs: float = 5.0     # Kaç saniyelik ses biriktirince tanıma yapılsın


@dataclass
class WhisperConfig:
    model: str      = "base"     # tiny | base | small | medium | large
    language: str   = "tr"       # "en", "tr", None = otomatik
    device: str     = "cpu"      # "cpu" | "cuda"
    compute: str    = "int8"     # "int8" | "float16" | "float32"
    beam_size: int  = 5


@dataclass
class ScreenConfig:
    fps: int             = 10       # saniyede kaç frame yakalanacak
    out_file: str        = None     # MP4 çıktı yolu (None = dosyaya yazma)
    use_callback: bool   = False    # frame callback aktif mi


@dataclass
class AppConfig:
    audio:   AudioConfig   = field(default_factory=AudioConfig)
    whisper: WhisperConfig = field(default_factory=WhisperConfig)
    screen:  ScreenConfig  = field(default_factory=ScreenConfig)


# Varsayılan config — main.py import edip override edebilir
DEFAULT = AppConfig()
