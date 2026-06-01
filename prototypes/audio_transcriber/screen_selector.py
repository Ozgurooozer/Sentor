"""
screen_selector.py — Kullanıcıya hangi pencereyi yakalayacağını seçtirir.

İki mod:
  1. Tıkla-seç  : xdotool selectwindow  (fareyle tıklarsın, pencere seçilir)
  2. Listeden seç: wmctrl -l             (tüm açık pencereler listelenir)
  3. Monitör seç : mss ekran listesi     (tüm ekranlar)

Çıktı: WindowSource nesnesi (geometri + pencere ID veya monitör index)
"""
import re
import subprocess
from dataclasses import dataclass
from typing import Optional


@dataclass
class WindowSource:
    label: str
    x: int = 0
    y: int = 0
    width: int = 1920
    height: int = 1080
    window_id: Optional[str] = None   # X11 window ID (hex)
    monitor_index: Optional[int] = None  # mss monitor index (1-based)


# ── xdotool / wmctrl yardımcıları ───────────────────────────────────────────

def _run(*args) -> str:
    try:
        r = subprocess.run(list(args), capture_output=True, text=True, timeout=10)
        return r.stdout.strip()
    except FileNotFoundError:
        return ""
    except subprocess.TimeoutExpired:
        return ""


def _xdotool_available() -> bool:
    return bool(_run("which", "xdotool"))


def _wmctrl_available() -> bool:
    return bool(_run("which", "wmctrl"))


def _get_geometry(window_id: str) -> tuple[int, int, int, int]:
    """xdotool ile pencere koordinat ve boyutunu al. (x, y, w, h)"""
    out = _run("xdotool", "getwindowgeometry", "--shell", window_id)
    vals = {}
    for line in out.splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            vals[k.strip()] = v.strip()
    return (
        int(vals.get("X", 0)),
        int(vals.get("Y", 0)),
        int(vals.get("WIDTH", 1920)),
        int(vals.get("HEIGHT", 1080)),
    )


def _list_windows() -> list[dict]:
    """wmctrl ile açık pencereleri listele."""
    out = _run("wmctrl", "-l")
    windows = []
    for line in out.splitlines():
        parts = line.split(None, 3)
        if len(parts) < 4:
            continue
        wid, desktop, host, title = parts[0], parts[1], parts[2], parts[3]
        if int(desktop) < 0:
            continue  # gizli pencereler
        windows.append({"id": wid, "title": title})
    return windows


def _list_monitors() -> list[dict]:
    """mss ile bağlı monitörleri listele."""
    try:
        import mss
        with mss.mss() as sct:
            # monitors[0] = tüm ekranlar, monitors[1..] = tek tek
            return [
                {
                    "index": i,
                    "label": f"Monitör {i}  ({m['width']}x{m['height']})",
                    "mon": m,
                }
                for i, m in enumerate(sct.monitors)
                if i > 0  # 0 = birleşik, atla
            ]
    except ImportError:
        return []


# ── Seçici ──────────────────────────────────────────────────────────────────

def pick_window() -> WindowSource:
    """
    Kullanıcıya pencere ya da monitör seçtirir.
    Döndürülen WindowSource nesnesi screen_capture.py tarafından kullanılır.
    """
    print("\n🖥️  Ekran kaynağı seç:")
    print("─" * 45)

    options: list[dict] = []

    # 1. Tıkla-seç (xdotool varsa)
    if _xdotool_available():
        options.append({"kind": "click", "label": "🖱️  Fareyle tıkla → pencere seç"})

    # 2. Açık pencere listesi (wmctrl varsa)
    if _wmctrl_available():
        for w in _list_windows():
            options.append({"kind": "window", "label": f"🪟  {w['title']}", "id": w["id"]})

    # 3. Monitörler
    for m in _list_monitors():
        options.append({"kind": "monitor", "label": f"🖥️  {m['label']}", "index": m["index"], "mon": m["mon"]})

    if not options:
        raise RuntimeError(
            "Pencere veya monitör bulunamadı.\n"
            "Kur: sudo apt install xdotool wmctrl\n"
            "     pip install mss"
        )

    for i, opt in enumerate(options):
        print(f"  [{i}] {opt['label']}")

    print("─" * 45)

    while True:
        try:
            idx = int(input("Numara > ").strip())
            if 0 <= idx < len(options):
                break
        except (ValueError, KeyboardInterrupt):
            pass
        print("  Geçersiz seçim.")

    chosen = options[idx]

    if chosen["kind"] == "click":
        print("  Yakalamak istediğin pencereye tıkla...")
        wid = _run("xdotool", "selectwindow").strip()
        title = _run("xdotool", "getwindowname", wid)
        x, y, w, h = _get_geometry(wid)
        return WindowSource(label=title, x=x, y=y, width=w, height=h, window_id=wid)

    elif chosen["kind"] == "window":
        wid = chosen["id"]
        title = chosen["label"].replace("🪟  ", "")
        x, y, w, h = _get_geometry(wid)
        return WindowSource(label=title, x=x, y=y, width=w, height=h, window_id=wid)

    else:  # monitor
        m = chosen["mon"]
        return WindowSource(
            label=chosen["label"],
            x=m["left"], y=m["top"],
            width=m["width"], height=m["height"],
            monitor_index=chosen["index"],
        )
