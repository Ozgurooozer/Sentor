"""
capture.py — Seçilen ses kaynağından ham PCM bayt akışı üretir.

İki mod:
  1. sink_input_id varsa  →  PulseAudio null-sink (sanal yönlendirme)
     Uygulamanın sesi izole edilir, diğer sesler karışmaz.
  2. device_index varsa   →  Doğrudan PyAudio fiziksel cihaz (monitor/loopback)

Her iki durumda da dışarıya aynı arayüz: AudioCapture.start() / .stop()
Ses verisi bir queue.Queue'ya konur, her eleman BUFFER_SECS'lik ham PCM bytes.
"""
import queue
import subprocess
import threading
import time
import pyaudio

from config import AudioConfig


# ── PulseAudio null-sink yardımcıları ───────────────────────────────────────

SINK_NAME = "transcriber_capture"


def _pa(*args) -> str:
    r = subprocess.run(["pactl", *args], capture_output=True, text=True)
    return r.stdout.strip()


def _create_null_sink() -> int:
    """Sanal null-sink oluştur, module ID döndür (temizlik için)."""
    out = _pa("load-module", "module-null-sink",
              f"sink_name={SINK_NAME}",
              f"sink_properties=device.description=TranscriberCapture")
    return int(out)


def _remove_null_sink(module_id: int):
    _pa("unload-module", str(module_id))


def _move_sink_input(sink_input_id: int, sink_name: str):
    _pa("move-sink-input", str(sink_input_id), sink_name)


def _get_original_sink(sink_input_id: int) -> str:
    """Uygulama hangi sink'teydi, geri almak için sakla."""
    out = _pa("list", "sink-inputs")
    current_id = None
    for line in out.splitlines():
        import re
        m = re.match(r"^Sink Input #(\d+)", line)
        if m:
            current_id = int(m.group(1))
        if current_id == sink_input_id:
            m2 = re.search(r"Sink: (\d+)", line)
            if m2:
                return m2.group(1)
    return "@DEFAULT_SINK@"


def _find_monitor_device_index(sink_name: str) -> int:
    """null-sink'in monitor cihazını PyAudio indeksi olarak bul."""
    pa = pyaudio.PyAudio()
    target = f"{sink_name}.monitor"
    for i in range(pa.get_device_count()):
        info = pa.get_device_info_by_index(i)
        if info["maxInputChannels"] > 0 and target in info["name"]:
            pa.terminate()
            return i
    # Tam eşleşme yoksa 'monitor' içeren ilk cihazı al
    for i in range(pa.get_device_count()):
        info = pa.get_device_info_by_index(i)
        if info["maxInputChannels"] > 0 and "monitor" in info["name"].lower():
            pa.terminate()
            return i
    pa.terminate()
    raise RuntimeError("null-sink monitor cihazı bulunamadı.")


# ── Ana sınıf ────────────────────────────────────────────────────────────────

class AudioCapture:
    """
    Giriş:  AudioSource (selector.py'den)
    Çıkış:  self.queue — queue.Queue[bytes]  (BUFFER_SECS'lik PCM parçalar)
    """

    def __init__(self, source, cfg: AudioConfig = None):
        from selector import AudioSource
        self.source     = source
        self.cfg        = cfg or AudioConfig()
        self.queue      = queue.Queue()
        self._stop      = threading.Event()
        self._pa        = None
        self._stream    = None
        self._module_id = None          # null-sink module ID
        self._orig_sink = None          # uygulama orijinal sink
        self.actual_rate: int = self.cfg.sample_rate

    # ── public ──────────────────────────────────────────────────────────────

    def start(self):
        device_index = self._prepare_device()
        self._start_pyaudio(device_index)

    def stop(self):
        self._stop.set()
        if self._stream:
            try:
                self._stream.stop_stream()
                self._stream.close()
            except Exception:
                pass
        if self._pa:
            self._pa.terminate()
        self._restore_pulse()

    # ── private ─────────────────────────────────────────────────────────────

    def _prepare_device(self) -> int:
        """
        Kaynağa göre doğru PyAudio cihaz indeksini döndür.
        Uygulama seçildiyse PulseAudio sanal yönlendirme kur.
        """
        if self.source.sink_input_id is not None:
            print(f"🔀 '{self.source.label}' sanal sink'e yönlendiriliyor...")
            self._orig_sink = _get_original_sink(self.source.sink_input_id)
            self._module_id = _create_null_sink()
            time.sleep(0.3)   # PulseAudio'nun sink'i oluşturması için bekle
            _move_sink_input(self.source.sink_input_id, SINK_NAME)
            return _find_monitor_device_index(SINK_NAME)

        elif self.source.device_index is not None:
            return self.source.device_index

        else:
            raise ValueError("AudioSource ne sink_input_id ne device_index içeriyor.")

    def _start_pyaudio(self, device_index: int):
        self._pa = pyaudio.PyAudio()

        # Cihazın desteklediği rate'i kontrol et
        info = self._pa.get_device_info_by_index(device_index)
        native = int(info["defaultSampleRate"])
        try:
            self._pa.is_format_supported(
                self.cfg.sample_rate,
                input_device=device_index,
                input_channels=self.cfg.channels,
                input_format=pyaudio.paInt16,
            )
            self.actual_rate = self.cfg.sample_rate
        except Exception:
            self.actual_rate = native

        self._stream = self._pa.open(
            format=pyaudio.paInt16,
            channels=self.cfg.channels,
            rate=self.actual_rate,
            input=True,
            input_device_index=device_index,
            frames_per_buffer=self.cfg.chunk_size,
        )

        self._thread = threading.Thread(target=self._record_loop, daemon=True)
        self._thread.start()
        print(f"🎙️  Kayıt başladı — {self.source.label}  ({self.actual_rate} Hz)")

    def _record_loop(self):
        buf = []
        target = int(self.actual_rate * self.cfg.buffer_secs)

        while not self._stop.is_set():
            try:
                data = self._stream.read(self.cfg.chunk_size, exception_on_overflow=False)
            except Exception:
                break
            buf.append(data)
            if len(buf) * self.cfg.chunk_size >= target:
                self.queue.put(b"".join(buf))
                buf = []

    def _restore_pulse(self):
        """Uygulamayı orijinal sink'e geri taşı, null-sink'i sil."""
        if self.source.sink_input_id is not None and self._orig_sink:
            try:
                _move_sink_input(self.source.sink_input_id, self._orig_sink)
            except Exception:
                pass
        if self._module_id is not None:
            try:
                _remove_null_sink(self._module_id)
            except Exception:
                pass
