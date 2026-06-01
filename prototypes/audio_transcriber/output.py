"""
output.py — Tanınan metni nereye/nasıl gönderileceğini belirler.

Kullanım:
    out = OutputHandler(to_file="transkript.txt", to_stdout=True)
    out.write("[10:32:01] Merhaba dünya")

İstersen kendi callback'ini ekleyebilirsin:
    out.add_callback(lambda text: my_function(text))
"""
import sys
from datetime import datetime
from typing import Callable, Optional


class OutputHandler:
    def __init__(
        self,
        to_stdout: bool = True,
        to_file: Optional[str] = None,
    ):
        self.to_stdout  = to_stdout
        self._callbacks: list[Callable[[str], None]] = []
        self._file      = None

        if to_file:
            self._file = open(to_file, "a", encoding="utf-8", buffering=1)
            print(f"📝 Dosyaya yazılıyor: {to_file}")

    def add_callback(self, fn: Callable[[str], None]):
        """Her yeni metin geldiğinde çağrılacak fonksiyon ekle."""
        self._callbacks.append(fn)

    def write(self, text: str):
        """Metni timestamp ile tüm çıkışlara gönder."""
        if not text:
            return
        ts   = datetime.now().strftime("%H:%M:%S")
        line = f"[{ts}] {text}"

        if self.to_stdout:
            print(line, flush=True)

        if self._file:
            self._file.write(line + "\n")

        for cb in self._callbacks:
            try:
                cb(line)
            except Exception as e:
                print(f"⚠️  Callback hatası: {e}", file=sys.stderr)

    def close(self):
        if self._file:
            self._file.close()
