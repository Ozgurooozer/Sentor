"""
transcriber.py — Ham PCM bytes → metin

Giriş:  bytes  (paInt16, mono, herhangi bir sample rate)
Çıkış:  str    (tanınan metin, boşsa "")

WAV formatına çevirip faster-whisper'a gönderir.
"""
import os
import tempfile
import wave

from config import WhisperConfig


class Transcriber:
    def __init__(self, cfg: WhisperConfig = None):
        self.cfg   = cfg or WhisperConfig()
        self.model = self._load()

    def _load(self):
        try:
            from faster_whisper import WhisperModel
        except ImportError:
            raise ImportError(
                "faster-whisper yüklü değil.\n"
                "Kur:  pip install faster-whisper"
            )
        print(f"⏳ Whisper '{self.cfg.model}' yükleniyor...")
        model = WhisperModel(
            self.cfg.model,
            device=self.cfg.device,
            compute_type=self.cfg.compute,
        )
        print("✅ Model hazır.\n")
        return model

    def transcribe(self, pcm: bytes, sample_rate: int) -> str:
        """
        pcm        : paInt16 ham bayt
        sample_rate: gerçek kayıt hızı
        """
        if not pcm:
            return ""

        path = self._write_wav(pcm, sample_rate)
        try:
            lang = self.cfg.language or None
            segs, _ = self.model.transcribe(
                path,
                language=lang,
                beam_size=self.cfg.beam_size,
            )
            return " ".join(s.text.strip() for s in segs).strip()
        finally:
            os.unlink(path)

    @staticmethod
    def _write_wav(pcm: bytes, rate: int) -> str:
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        tmp.close()
        with wave.open(tmp.name, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)   # paInt16
            wf.setframerate(rate)
            wf.writeframes(pcm)
        return tmp.name
