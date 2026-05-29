"""
atlas-transcribe/server.py

Pipeline:
    POST /transcribe  (multipart, field: "audio")
    → ffmpeg: webm/opus → 16kHz mono WAV
    → faster-whisper transcribe
    → { "text": "..." }

Setup (one-time):
    pip install faster-whisper flask
    # ffmpeg must be on PATH — https://www.gyan.dev/ffmpeg/builds/

Start:
    python server.py [port]      default: 3001
    python server.py 4000

Model sizes (speed vs accuracy):
    tiny   → fastest, lowest accuracy
    base   → good balance for MVP  ← default
    small  → better accuracy, ~2x slower
    medium → near-OpenAI quality, needs GPU for realtime
"""

import os
import sys
import subprocess
import tempfile
import threading
from pathlib import Path

from flask import Flask, request, jsonify
from faster_whisper import WhisperModel

# ── config ────────────────────────────────────────────────────────────────────
PORT         = int(sys.argv[1]) if len(sys.argv) > 1 else 3001
MODEL_SIZE   = os.environ.get("WHISPER_MODEL", "base")
DEVICE       = os.environ.get("WHISPER_DEVICE", "cpu")   # "cuda" if GPU available
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE", "int8")  # int8 = fast CPU

# ── load model once at startup (downloads on first run) ──────────────────────
_model_lock = threading.Lock()

def _load_model() -> WhisperModel:
    try:
        print(f"Loading whisper model '{MODEL_SIZE}' on {DEVICE} ({COMPUTE_TYPE})…")
        m = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)
        print(f"Model ready ({DEVICE}).\n")
        return m
    except Exception as e:
        if DEVICE != "cpu":
            print(f"[warn] {DEVICE} failed ({e}), falling back to CPU int8…")
            m = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")
            print("Model ready (cpu).\n")
            return m
        raise

model = _load_model()
_active_device = DEVICE  # tracks current device after any fallback

# ── flask app ─────────────────────────────────────────────────────────────────
app = Flask(__name__)

@app.after_request
def cors(response):
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response

@app.route("/transcribe", methods=["OPTIONS"])
def preflight():
    return "", 204

@app.route("/health")
def health():
    return jsonify({"ok": True, "model": MODEL_SIZE, "device": DEVICE})

@app.route("/transcribe", methods=["POST"])
def transcribe():
    audio_file = request.files.get("audio")
    if not audio_file:
        return jsonify({"error": "No 'audio' field in request"}), 400

    language = request.form.get("language") or None  # None = auto-detect

    with tempfile.TemporaryDirectory() as tmp:
        webm_path = Path(tmp) / "input.webm"
        wav_path  = Path(tmp) / "audio.wav"

        audio_file.save(webm_path)

        # ── ffmpeg: normalize to 16kHz mono WAV (Whisper's sweet spot) ────────
        try:
            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-i", str(webm_path),
                    "-ar", "16000",
                    "-ac", "1",
                    "-f", "wav",
                    str(wav_path),
                ],
                check=True,
                capture_output=True,
            )
        except subprocess.CalledProcessError as e:
            return jsonify({"error": f"ffmpeg failed: {e.stderr.decode()[:200]}"}), 500
        except FileNotFoundError:
            return jsonify({"error": "ffmpeg not found — install it and add to PATH"}), 500

        # ── transcribe (with CPU fallback if CUDA fails at inference time) ───────
        with _model_lock:
            global model  # needed because we may reassign/del model in the except branch
            try:
                segments, _info = model.transcribe(
                    str(wav_path),
                    language=language,
                    beam_size=3,
                    vad_filter=True,
                    vad_parameters={"min_silence_duration_ms": 300},
                )
                text = " ".join(seg.text.strip() for seg in segments).strip()
            except RuntimeError as e:
                if "cublas" not in str(e).lower() and "cuda" not in str(e).lower():
                    raise
                # CUDA failed at inference — reload on CPU and retry
                print(f"[warn] CUDA inference failed, reloading on CPU… ({e})")
                import gc
                del model
                gc.collect()
                globals()["model"] = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")
                print("Model reloaded on CPU.")
                segments, _info = globals()["model"].transcribe(
                    str(wav_path),
                    language=language,
                    beam_size=3,
                    vad_filter=True,
                    vad_parameters={"min_silence_duration_ms": 300},
                )
                text = " ".join(seg.text.strip() for seg in segments).strip()

    return jsonify({"text": text})


if __name__ == "__main__":
    print(f"atlas-transcribe → http://localhost:{PORT}/transcribe")
    print(f"  WHISPER_MODEL={MODEL_SIZE}  WHISPER_DEVICE={DEVICE}\n")
    app.run(host="0.0.0.0", port=PORT, debug=False)
