"""
recorder.py — Frame akışını MP4'e yazar ve/veya callback'e gönderir.

Giriş:  queue.Queue[np.ndarray]  (screen_capture.py'den)
Çıkış:
  - Dosya modu    : ffmpeg pipe → video.mp4
  - Callback modu : her frame için fn(frame: np.ndarray) çağrılır
  - İkisi birden  : aynı anda

ffmpeg sistem PATH'inde olmalı.  Kur: sudo apt install ffmpeg
"""
import queue
import subprocess
import threading
import time
from typing import Callable, Optional

import numpy as np


class Recorder:
    """
    frame_queue  : ScreenCapture.queue
    fps          : kayıt fps (capture ile aynı olmalı)
    out_file     : MP4 çıktı yolu — None ise dosyaya yazılmaz
    callbacks    : frame gelince çağrılacak fn listesi
    """

    def __init__(
        self,
        frame_queue: queue.Queue,
        fps: int = 10,
        out_file: Optional[str] = None,
        callbacks: Optional[list[Callable[[np.ndarray], None]]] = None,
    ):
        if out_file is None and not callbacks:
            raise ValueError("out_file ya da en az bir callback verilmeli.")

        self.queue     = frame_queue
        self.fps       = fps
        self.out_file  = out_file
        self.callbacks = callbacks or []
        self._stop     = threading.Event()
        self._proc: Optional[subprocess.Popen] = None
        self._thread: Optional[threading.Thread] = None
        self._width  = 0
        self._height = 0

    # ── public ──────────────────────────────────────────────────────────────

    def add_callback(self, fn: Callable[[np.ndarray], None]):
        self.callbacks.append(fn)

    def start(self):
        # İlk frame gelmeden ffmpeg başlatamayız (boyutu bilmiyoruz)
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

        if self.out_file:
            print(f"🎬  Video kaydediliyor → {self.out_file}")
        if self.callbacks:
            print(f"📡  Frame callback aktif ({len(self.callbacks)} adet)")

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)
        self._close_ffmpeg()
        print("✅  Video kaydı tamamlandı.")

    # ── private ─────────────────────────────────────────────────────────────

    def _open_ffmpeg(self, width: int, height: int):
        """ffmpeg'i raw BGR pipe girişiyle başlat."""
        cmd = [
            "ffmpeg",
            "-y",                           # üstüne yaz
            "-f", "rawvideo",
            "-vcodec", "rawvideo",
            "-pix_fmt", "bgr24",
            "-s", f"{width}x{height}",
            "-r", str(self.fps),
            "-i", "pipe:0",                 # stdin'den oku
            "-vcodec", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "ultrafast",
            "-crf", "23",
            self.out_file,
        ]
        self._proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self._width  = width
        self._height = height

    def _close_ffmpeg(self):
        if self._proc:
            try:
                self._proc.stdin.close()
                self._proc.wait(timeout=10)
            except Exception:
                self._proc.kill()
            self._proc = None

    def _loop(self):
        while not self._stop.is_set():
            try:
                frame: np.ndarray = self.queue.get(timeout=0.5)
            except queue.Empty:
                continue

            h, w = frame.shape[:2]

            # ffmpeg'i ilk frame boyutuyla başlat
            if self.out_file and self._proc is None:
                # boyut çift olmalı (x264 gereği)
                w_even = w if w % 2 == 0 else w - 1
                h_even = h if h % 2 == 0 else h - 1
                self._open_ffmpeg(w_even, h_even)

            # Dosyaya yaz
            if self._proc and self._proc.stdin:
                try:
                    h_e = self._height
                    w_e = self._width
                    # Boyut uyuşmazlığı varsa kırp
                    out_frame = frame[:h_e, :w_e]
                    self._proc.stdin.write(out_frame.tobytes())
                except BrokenPipeError:
                    break

            # Callback'leri çağır
            for cb in self.callbacks:
                try:
                    cb(frame)
                except Exception as e:
                    print(f"⚠️  Frame callback hatası: {e}")
