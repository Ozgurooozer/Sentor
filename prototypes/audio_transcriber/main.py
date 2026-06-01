#!/usr/bin/env python3
"""
main.py — Giriş noktası

MOD SEÇİMİ (--mode):
  audio        → sadece ses → yazıya çevir
  screen       → sadece ekran kaydı
  both         → ses + ekran aynı anda (varsayılan)

KULLANIM:
  python main.py                            # interaktif, her şey seçilir
  python main.py --mode audio               # sadece ses
  python main.py --mode screen              # sadece ekran
  python main.py --mode both                # ikisi birden

  python main.py --model small --lang en    # Whisper ayarları
  python main.py --fps 15                   # ekran fps
  python main.py --video kayit.mp4          # video çıktısı
  python main.py --no-video                 # sadece callback (dosyaya yazma)
  python main.py --transcript cikti.txt     # transkript dosyası
  python main.py --buffer 3                 # 3 saniyelik ses parçası
  python main.py --no-stdout                # terminale yazma

MODÜL OLARAK:
  from main import run
  run(mode="both", model="small", fps=10, video_file="out.mp4")

  # Frame callback ekle:
  def my_frame_cb(frame):   # numpy BGR array
      ...
  run(mode="screen", frame_callbacks=[my_frame_cb])
"""
import argparse
import queue
import sys
import threading
from datetime import datetime
from typing import Callable, Optional

from config        import AppConfig, AudioConfig, WhisperConfig, ScreenConfig
from output        import OutputHandler


# ── Yardımcı ────────────────────────────────────────────────────────────────

def _ts() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def _print_banner(mode, cfg: AppConfig, transcript_file, video_file):
    w = 52
    print("\n" + "═" * w)
    print("  🎬  Ses & Ekran Kayıt Sistemi")
    print("═" * w)
    print(f"  Mod        : {mode}")
    if mode in ("audio", "both"):
        print(f"  Whisper    : {cfg.whisper.model}  |  Dil: {cfg.whisper.language or 'otomatik'}")
        print(f"  Ses parça  : {cfg.audio.buffer_secs}s")
        print(f"  Transkript : {transcript_file or '—'}")
    if mode in ("screen", "both"):
        print(f"  FPS        : {cfg.screen.fps}")
        print(f"  Video      : {video_file or '— (sadece callback)'}")
    print("═" * w)
    print("  Durdurmak için  Ctrl+C\n")


# ── Ana run() ────────────────────────────────────────────────────────────────

def run(
    mode:             str   = "both",       # "audio" | "screen" | "both"
    # audio ayarları
    model:            str   = "base",
    lang:             str   = "tr",
    buffer_secs:      float = 5.0,
    transcript_file:  Optional[str] = None,
    to_stdout:        bool  = True,
    # ekran ayarları
    fps:              int   = 10,
    video_file:       Optional[str] = None, # None = dosyaya yazma
    # callback'ler
    text_callbacks:   Optional[list[Callable[[str], None]]]          = None,
    frame_callbacks:  Optional[list[Callable[["np.ndarray"], None]]] = None,
):
    """
    Modül olarak kullanım için temiz arayüz.

    mode = "audio"   → sadece ses yakalama + transkript
    mode = "screen"  → sadece ekran kaydı
    mode = "both"    → ikisi birden paralel
    """
    if mode not in ("audio", "screen", "both"):
        raise ValueError(f"Geçersiz mod: {mode!r}  →  'audio' | 'screen' | 'both'")

    cfg = AppConfig(
        audio=AudioConfig(buffer_secs=buffer_secs),
        whisper=WhisperConfig(model=model, language=lang),
        screen=ScreenConfig(fps=fps),
    )

    # Varsayılan dosya adları
    ts = _ts()
    if mode in ("audio", "both") and transcript_file is None:
        transcript_file = f"transkript_{ts}.txt"
    if mode in ("screen", "both") and video_file is None:
        video_file = f"video_{ts}.mp4"

    _print_banner(mode, cfg, transcript_file, video_file)

    threads  = []
    stoppers = []   # stop() fonksiyonları

    # ── SES ─────────────────────────────────────────────────────────────────
    if mode in ("audio", "both"):
        from selector    import pick_source
        from capture     import AudioCapture
        from transcriber import Transcriber

        audio_source = pick_source()
        out = OutputHandler(to_stdout=to_stdout, to_file=transcript_file)
        if text_callbacks:
            for cb in text_callbacks:
                out.add_callback(cb)

        transcriber   = Transcriber(cfg.whisper)
        audio_capture = AudioCapture(audio_source, cfg.audio)
        audio_capture.start()
        stoppers.append(lambda: (audio_capture.stop(), out.close()))

        def _audio_loop():
            while not audio_capture._stop.is_set():
                try:
                    pcm  = audio_capture.queue.get(timeout=1)
                    text = transcriber.transcribe(pcm, audio_capture.actual_rate)
                    out.write(text)
                except Exception:
                    pass

        t = threading.Thread(target=_audio_loop, daemon=True, name="audio-loop")
        t.start()
        threads.append(t)

    # ── EKRAN ────────────────────────────────────────────────────────────────
    if mode in ("screen", "both"):
        from screen_selector import pick_window
        from screen_capture  import ScreenCapture
        from recorder        import Recorder

        win_source     = pick_window()
        screen_capture = ScreenCapture(win_source, fps=cfg.screen.fps)
        recorder       = Recorder(
            frame_queue = screen_capture.queue,
            fps         = cfg.screen.fps,
            out_file    = video_file,
            callbacks   = frame_callbacks or [],
        )

        screen_capture.start()
        recorder.start()
        stoppers.append(screen_capture.stop)
        stoppers.append(recorder.stop)

    # ── Ana bekleme döngüsü ──────────────────────────────────────────────────
    print("  ▶  Kayıt devam ediyor...\n")
    try:
        while True:
            threading.Event().wait(1)
    except KeyboardInterrupt:
        print("\n⏹️  Durduruluyor...")
    finally:
        for stop in stoppers:
            try:
                stop()
            except Exception:
                pass

    print(f"\n✅  Tamamlandı.")
    if transcript_file and mode in ("audio", "both"):
        print(f"   Transkript → {transcript_file}")
    if video_file and mode in ("screen", "both"):
        print(f"   Video      → {video_file}")


# ── CLI ──────────────────────────────────────────────────────────────────────

def _parse():
    p = argparse.ArgumentParser(
        description="Ses ve/veya ekranı yakalar, metne çevirir.",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    p.add_argument("--mode",       default="both",
                   choices=["audio", "screen", "both"],
                   help="Kayıt modu (varsayılan: both)")
    # Ses
    p.add_argument("--model",      default="base",
                   help="Whisper modeli: tiny|base|small|medium|large")
    p.add_argument("--lang",       default="tr",
                   help="Dil kodu: tr, en, None=otomatik")
    p.add_argument("--buffer",     default=5.0, type=float, metavar="SECS",
                   help="Ses parça süresi saniye (varsayılan: 5)")
    p.add_argument("--transcript", default=None,
                   help="Transkript çıktı dosyası")
    p.add_argument("--no-stdout",  action="store_true",
                   help="Terminale yazma")
    # Ekran
    p.add_argument("--fps",        default=10, type=int,
                   help="Ekran yakalama FPS (varsayılan: 10)")
    p.add_argument("--video",      default=None,
                   help="Video çıktı dosyası (MP4)")
    p.add_argument("--no-video",   action="store_true",
                   help="Video dosyasına yazma (sadece callback)")
    return p.parse_args()


if __name__ == "__main__":
    args = _parse()

    video_out = None if args.no_video else args.video

    run(
        mode            = args.mode,
        model           = args.model,
        lang            = None if args.lang == "None" else args.lang,
        buffer_secs     = args.buffer,
        transcript_file = args.transcript,
        to_stdout       = not args.no_stdout,
        fps             = args.fps,
        video_file      = video_out,
    )
