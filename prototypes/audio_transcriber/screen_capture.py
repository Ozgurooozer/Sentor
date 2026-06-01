"""
screen_capture.py — Seçilen pencereden frame üretir.

Giriş:  WindowSource (screen_selector.py'den)
Çıkış:  self.queue → queue.Queue[numpy.ndarray]  (BGR frame, her N ms'de bir)

Özellikler:
  - Pencere taşınırsa otomatik takip eder (xdotool ile konum güncellenir)
  - FPS ayarlanabilir
  - Pencere küçültülürse/kapanırsa düzgün durur
"""
import queue
import threading
import time
from typing import Optional

import numpy as np


class ScreenCapture:
    """
    Giriş  : WindowSource
    Çıkış  : self.queue — queue.Queue[np.ndarray]  (H×W×3 BGR)
    """

    def __init__(self, source, fps: int = 10):
        """
        source : WindowSource (screen_selector.py)
        fps    : saniyede kaç frame (kayıt için 10, analiz için 1-5 yeterli)
        """
        self.source   = source
        self.fps      = fps
        self.queue    = queue.Queue(maxsize=60)   # max 6 saniyelik buffer
        self._stop    = threading.Event()
        self._thread: Optional[threading.Thread] = None

    # ── public ──────────────────────────────────────────────────────────────

    def start(self):
        try:
            import mss
        except ImportError:
            raise ImportError("mss yüklü değil.  Kur: pip install mss")

        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        print(f"🎥  Ekran kaydı başladı — {self.source.label}  ({self.fps} fps)")

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=3)

    # ── private ─────────────────────────────────────────────────────────────

    def _current_region(self) -> dict:
        """
        Pencere ID varsa anlık konumu xdotool ile güncelle (pencere taşınmış olabilir).
        Yoksa sabit bölgeyi döndür.
        """
        if self.source.window_id:
            try:
                import subprocess
                r = subprocess.run(
                    ["xdotool", "getwindowgeometry", "--shell", self.source.window_id],
                    capture_output=True, text=True, timeout=2
                )
                vals = {}
                for line in r.stdout.splitlines():
                    if "=" in line:
                        k, v = line.split("=", 1)
                        vals[k.strip()] = v.strip()
                if vals:
                    return {
                        "left":   int(vals.get("X", self.source.x)),
                        "top":    int(vals.get("Y", self.source.y)),
                        "width":  int(vals.get("WIDTH",  self.source.width)),
                        "height": int(vals.get("HEIGHT", self.source.height)),
                    }
            except Exception:
                pass

        return {
            "left":   self.source.x,
            "top":    self.source.y,
            "width":  self.source.width,
            "height": self.source.height,
        }

    def _loop(self):
        import mss

        interval = 1.0 / self.fps

        with mss.mss() as sct:
            while not self._stop.is_set():
                t0 = time.monotonic()

                try:
                    region = self._current_region()

                    # Geçersiz boyut kontrolü
                    if region["width"] <= 0 or region["height"] <= 0:
                        time.sleep(interval)
                        continue

                    shot = sct.grab(region)

                    # BGRA → BGR (numpy)
                    frame = np.array(shot)[:, :, :3]

                    # Queue doluysa en eski frame'i at
                    if self.queue.full():
                        try:
                            self.queue.get_nowait()
                        except queue.Empty:
                            pass

                    self.queue.put(frame)

                except Exception as e:
                    print(f"⚠️  Frame hatası: {e}")

                # FPS'i sabit tut
                elapsed = time.monotonic() - t0
                wait    = interval - elapsed
                if wait > 0:
                    time.sleep(wait)
