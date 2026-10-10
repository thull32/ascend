# /// script
# requires-python = ">=3.11"
# dependencies = ["faster-whisper>=1.1", "soundfile>=0.12", "numpy"]
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
    a = p.parse_args()
    from faster_whisper import WhisperModel

    model = WhisperModel(a.model, device="cpu", compute_type="int8")
    for script in a.scripts:
        report(model, script, a.out)


def report(model, script: Path, out: Path):
    body = re.match(r"---\n.*?\n---\n(.*)", script.read_text(), re.S).group(1)
    body = re.sub(r"^## .*$|^\[(pause|think)\]$", "", body, flags=re.M)
    meta = dict(re.findall(r"^(\w+):\s*(\S+)", script.read_text(), re.M))
    name = meta.get("lesson") or f"{meta['review']}-{script.stem}"
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
    print(f"{name}: {sm.ratio():.3f} word agreement, {len(issues)} differences")
    for w, g in issues:
        print(f"  script: {' '.join(w) or '-':40}  heard: {' '.join(g) or '-'}")


if __name__ == "__main__":
    sys.exit(main())
