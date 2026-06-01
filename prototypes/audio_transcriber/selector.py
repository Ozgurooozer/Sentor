"""
selector.py — Kullanıcıya hangi uygulamanın sesini yakalayacağını seçtirir.

PulseAudio sink-input listesini okur:
  pactl list sink-inputs  →  uygulama adı + sink-input ID

Hiç uygulama yoksa fiziksel cihazları (monitor dahil) listeler.
"""
import re
import subprocess
from dataclasses import dataclass
from typing import Optional


@dataclass
class AudioSource:
    """Seçilebilir ses kaynağı."""
    label: str           # Kullanıcıya gösterilecek ad
    sink_input_id: Optional[int] = None   # PulseAudio sink-input (uygulama)
    device_index: Optional[int] = None    # PyAudio fiziksel cihaz indeksi
    device_name: Optional[str]  = None    # PyAudio cihaz adı


# ── PulseAudio helpers ──────────────────────────────────────────────────────

def _pactl(*args) -> str:
    """pactl komutunu çalıştır, stdout'u döndür."""
    try:
        r = subprocess.run(["pactl", *args], capture_output=True, text=True, timeout=5)
        return r.stdout
    except FileNotFoundError:
        return ""


def list_sink_inputs() -> list[AudioSource]:
    """
    Şu an ses çalan uygulamaları döndür.
    Her sink-input için uygulama adı + ID alınır.
    """
    out = _pactl("list", "sink-inputs")
    sources = []

    current_id   = None
    current_name = None

    for line in out.splitlines():
        m = re.match(r"^Sink Input #(\d+)", line)
        if m:
            if current_id is not None:
                sources.append(AudioSource(
                    label=current_name or f"Uygulama #{current_id}",
                    sink_input_id=int(current_id),
                ))
            current_id   = m.group(1)
            current_name = None

        # application.name veya media.name satırı
        for key in ("application.name", "application.process.binary", "media.name"):
            m2 = re.search(rf'{key} = "([^"]+)"', line)
            if m2 and current_name is None:
                current_name = m2.group(1)

    if current_id is not None:
        sources.append(AudioSource(
            label=current_name or f"Uygulama #{current_id}",
            sink_input_id=int(current_id),
        ))

    return sources


def list_monitor_devices() -> list[AudioSource]:
    """
    PyAudio üzerinden gözükén loopback / monitor cihazlarını döndür.
    Uygulama seçimi mümkün değilse fallback olarak kullanılır.
    """
    try:
        import pyaudio
    except ImportError:
        return []

    pa = pyaudio.PyAudio()
    sources = []

    for i in range(pa.get_device_count()):
        info = pa.get_device_info_by_index(i)
        if info["maxInputChannels"] < 1:
            continue
        name   = info["name"]
        name_l = name.lower()
        is_lb  = any(k in name_l for k in
                     ("monitor", "blackhole", "soundflower", "stereo mix", "loopback"))
        if is_lb:
            sources.append(AudioSource(
                label=name,
                device_index=i,
                device_name=name,
            ))

    pa.terminate()
    return sources


# ── Seçici ──────────────────────────────────────────────────────────────────

def pick_source() -> AudioSource:
    """
    Kullanıcıya ses kaynağı seçtirir.
    Döndürülen AudioSource nesnesini capture.py kullanır.
    """
    app_sources = list_sink_inputs()
    dev_sources = list_monitor_devices()
    all_sources = app_sources + dev_sources

    if not all_sources:
        raise RuntimeError(
            "Hiç ses kaynağı bulunamadı.\n"
            "• Bir uygulama ses çalıyor mu?\n"
            "• PulseAudio / PipeWire kurulu mu?  (pactl list sink-inputs)"
        )

    print("\n🎛️  Ses kaynağı seç:")
    print("─" * 40)

    for i, src in enumerate(all_sources):
        kind = "🔊 uygulama" if src.sink_input_id is not None else "🎚️  cihaz"
        print(f"  [{i}] {kind}  —  {src.label}")

    print("─" * 40)

    while True:
        try:
            choice = input("Numara > ").strip()
            idx = int(choice)
            if 0 <= idx < len(all_sources):
                return all_sources[idx]
        except (ValueError, KeyboardInterrupt):
            pass
        print("  Geçersiz seçim, tekrar dene.")
