# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["faster-whisper>=1.1", "soundfile>=0.12", "numpy", "nvidia-cublas-cu12", "nvidia-cudnn-cu12>=9,<10"]
# ///
"""Listens to a rendered episode and reports where it differs from the script.

    uv run scripts/audio/verify.py content/audio/<...>.md [--out runtimes/audio/out]

Transcribes the MP3 with Whisper (locally) and aligns the transcript with the
script's words. A run of words the transcript gets wrong is usually a
mispronunciation: fix it in scripts/audio/lexicon.json and render again.
Transcription has its own small error rate, so read the report, do not gate
on zero.
"""
import argparse
import difflib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


SMALL = {w: i for i, w in enumerate("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split())}
SPELLING = {"defence": "defense", "defences": "defenses", "acknowledgement": "acknowledgment", "acknowledgements": "acknowledgments"}


def words(text):
    """Normalised words, so that "15 thousand", "fifteen thousand" and "15,000" compare equal."""
    text = text.lower().replace("-", " ").replace("%", " percent")
    raw = [w.strip(".,'").replace(",", "") for w in re.findall(r"[a-z0-9.,'%]+", text)]
    raw = [w for w in raw if w]
    out, i = [], 0
    while i < len(raw):
        w = raw[i]
        n = int(w) if w.isdigit() else SMALL.get(w)
        if n is not None and i + 1 < len(raw) and raw[i + 1] in ("thousand", "million"):
            out.append(str(n * (1000 if raw[i + 1] == "thousand" else 1_000_000)))
            i += 2
            continue
        out.append(str(n) if n is not None and n <= 20 else SPELLING.get(w, w))
        i += 1
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("scripts", type=Path, nargs="+")
    p.add_argument("--out", type=Path, default=ROOT / "runtimes" / "audio" / "out")
    p.add_argument("--model", default="small.en")
    # Transcription only checks the audio, so the GPU's nondeterminism does
    # not matter here; it is many times faster than the CPU.
    p.add_argument("--device", default="cpu", choices=["cpu", "cuda"])
    # Write one result per episode here, and skip episodes whose current
    # render already has a result.
    p.add_argument("--results", type=Path)
    a = p.parse_args()
    if a.device == "cuda":
        preload_cuda()
    from faster_whisper import WhisperModel

    model = WhisperModel(a.model, device=a.device, compute_type="float16" if a.device == "cuda" else "int8")
    scripts = [p for s in a.scripts for p in (sorted(s.rglob("*.md")) if s.is_dir() else [s])]
    for script in scripts:
        report(model, script, a.out, a.results)


def preload_cuda():
    """faster-whisper's CTranslate2 finds cuBLAS and cuDNN through the loader
    path; the pip wheels put them under site-packages/nvidia/*/lib."""
    import ctypes
    import glob
    import site

    for lib in ("cublas", "cudnn"):
        for path in sorted(glob.glob(f"{site.getsitepackages()[0]}/nvidia/{lib}/lib/*.so*")):
            try:
                ctypes.CDLL(path, mode=ctypes.RTLD_GLOBAL)
            except OSError:
                pass


def report(model, script: Path, out: Path, results: Path | None = None):
    body = re.match(r"---\n.*?\n---\n(.*)", script.read_text(), re.S).group(1)
    body = re.sub(r"^## .*$|^\[(pause|think)\]$", "", body, flags=re.M)
    meta = dict(re.findall(r"^(\w+):\s*(\S+)", script.read_text(), re.M))
    name = meta.get("lesson") or f"{meta['review']}-{script.stem}"
    sidecar_path = out / f"{name}.json"
    if not sidecar_path.is_file():
        return
    import json

    sidecar = json.loads(sidecar_path.read_text())
    if results:
        done = results / f"{name}.json"
        if done.is_file():
            prev = json.loads(done.read_text())
            if prev.get("script") == sidecar.get("script") and prev.get("render") == sidecar.get("render"):
                return
    import numpy as np
    import soundfile

    # Decoded here rather than by faster-whisper's PyAV, which has no wheel
    # for every Python; Whisper wants 16 kHz mono.
    audio, rate = soundfile.read(out / f"{name}.mp3", dtype="float32")
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    n = int(len(audio) * 16_000 / rate)
    audio = np.interp(np.linspace(0, len(audio) - 1, n), np.arange(len(audio)), audio).astype(np.float32)
    segments, _ = model.transcribe(audio, language="en", vad_filter=True)
    heard = " ".join(s.text for s in segments)
    want, got = words(body), words(heard)
    sm = difflib.SequenceMatcher(a=want, b=got, autojunk=False)
    issues = [(want[i1:i2], got[j1:j2]) for op, i1, i2, j1, j2 in sm.get_opcodes() if op != "equal"]
    print(f"{name}: {sm.ratio():.3f} word agreement, {len(issues)} differences", flush=True)
    if results:
        results.mkdir(parents=True, exist_ok=True)
        (results / f"{name}.json").write_text(json.dumps({
            "script": sidecar.get("script"),
            "render": sidecar.get("render"),
            "agreement": round(sm.ratio(), 4),
            "differences": [[" ".join(w), " ".join(g)] for w, g in issues],
        }, indent=1) + "\n")
    else:
        for w, g in issues:
            print(f"  script: {' '.join(w) or '-':40}  heard: {' '.join(g) or '-'}")


if __name__ == "__main__":
    sys.exit(main())
