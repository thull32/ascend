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


UNITS = {w: i for i, w in enumerate("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split())}
TENS = {w: 10 * i for i, w in enumerate("_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()) if w != "_"}
SCALES = {"hundred": 100, "thousand": 1_000, "million": 1_000_000, "billion": 1_000_000_000}
SPELLING = {"defence": "defense", "defences": "defenses", "acknowledgement": "acknowledgment", "acknowledgements": "acknowledgments",
            "amortised": "amortized", "catalogue": "catalog", "behaviour": "behavior", "optimise": "optimize", "optimised": "optimized",
            "normalise": "normalize", "serialise": "serialize", "serialised": "serialized", "memoise": "memoize", "memoised": "memoized"}
# British spellings the scripts use and Whisper writes the American way;
# applied to both sides, so a rare false match costs nothing.
BRITISH = [(re.compile(r"(?<=\w{3})our(s?)$"), r"or\1"), (re.compile(r"(?<=[^aeiou])re(s?)$"), r"er\1"),
           (re.compile(r"is(e|es|ed|ing|ation|ations)$"), r"iz\1"), (re.compile(r"ys(e|es|ed|ing)$"), r"yz\1"),
           (re.compile(r"(?<=\w[aeiou][lt])l(ed|ing|er|ers)$"), r"\1"), (re.compile(r"ueing$"), "uing")]
# Bump when the comparison changes, so stored results are recomputed.
VERSION = 3


def number_value(tokens, i):
    """Reads a number written in words and/or digits starting at tokens[i]:
    "24", "twenty four", "20 4" (Whisper mixes them), "125 thousand",
    "1 hundred 20 5000" (one hundred twenty-five thousand), "5 point 6".
    Returns (value as text, next index), or None if no number starts here."""
    def atom(t):
        if t.isdigit():
            return int(t)
        return UNITS.get(t, TENS.get(t))

    if re.fullmatch(r"\d+\.\d+", tokens[i]):
        return tokens[i], i + 1
    if atom(tokens[i]) is None:
        return None
    total, current, prev, j = 0, 0, None, i
    while j < len(tokens):
        t, a = tokens[j], atom(tokens[j])
        if a is not None:
            tens = 20 <= a < 100 and a % 10 == 0
            if prev is None:
                current, prev = a, "tens" if tens else "atom"
            elif prev == "tens" and 0 < a < 10:
                current, prev = current + a, "atom"
            elif prev == "tens" and re.fullmatch(r"[1-9]0{3,}", t):
                # Whisper's "20 5000" for "twenty-five thousand".
                scale = 10 ** (len(t) - 1)
                total, current, prev = total + (current + int(t[0])) * scale, 0, "scale"
            elif prev == "scale" and a < 100:
                current, prev = current + a, "tens" if tens else "atom"
            else:
                break
        elif t in SCALES and (prev in ("atom", "tens") or (prev == "scale" and current and SCALES[t] > 100)):
            if SCALES[t] == 100:
                current, prev = current * 100, "scale"
            else:
                total, current, prev = total + current * SCALES[t], 0, "scale"
        else:
            break
        j += 1
    value = total + current
    if j + 1 < len(tokens) and tokens[j] == "point":
        digits, k = [], j + 1
        while k < len(tokens) and (tokens[k].isdigit() or tokens[k] in UNITS):
            digits.append(tokens[k] if tokens[k].isdigit() else str(UNITS[tokens[k]]))
            k += 1
        if digits:
            return f"{value}.{''.join(digits)}", k
    return str(value), j


def words(text):
    """Normalised words, so that "15 thousand", "fifteen thousand", "15,000"
    and Whisper's mixed "20 4" for twenty-four compare equal."""
    text = text.lower().replace("-", " ").replace("%", " percent").replace("\u2019", "'")
    # "a1" is heard as "a 1", and "promise dot then" written "promise.then".
    text = re.sub(r"(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])", " ", text)
    text = re.sub(r"(?<=[a-z])\.(?=[a-z])", " dot ", text)
    raw = [w.strip(".,'").replace(",", "") for w in re.findall(r"[a-z0-9.,'%]+", text)]
    raw = [w.removesuffix("'s").replace("'", "") for w in raw if w and w not in (".",)]
    out, i = [], 0
    while i < len(raw):
        n = number_value(raw, i)
        if n:
            out.append(n[0])
            i = n[1]
            continue
        w = SPELLING.get(raw[i], raw[i])
        for pattern, repl in BRITISH:
            w = pattern.sub(repl, w)
        out.append(w)
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
    body = re.sub(r"^## .*$|^\[(pause|think)\]$|^@\d+(-\d+)?$", "", body, flags=re.M)
    meta = dict(re.findall(r"^(\w+):\s*(\S+)", script.read_text(), re.M))
    walkthrough = "walkthroughs" in script.parts
    if walkthrough:
        module = re.sub(r"^\d+-", "", script.parent.parent.name)
        name = meta.get("episode") or f"walk-{module}-{meta['lesson']}-{script.stem}"
    else:
        name = meta.get("episode") or meta.get("lesson") or f"{meta['review']}-{script.stem}"
    sidecar_path = out / f"{name}.json"
    if not sidecar_path.is_file():
        return
    import json

    sidecar = json.loads(sidecar_path.read_text())
    if results:
        done = results / f"{name}.json"
        if done.is_file():
            prev = json.loads(done.read_text())
            if (prev.get("audio_id"), prev.get("version")) == (sidecar.get("audio_id"), VERSION) and prev.get("audio_id"):
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
    # The render opens with the title, which is not in the script's body.
    intro = f"{'Walkthrough' if walkthrough else 'Ascend'}. {sidecar.get('title', '')}."
    want, got = words(f"{intro}\n{body}"), words(heard)
    sm = difflib.SequenceMatcher(a=want, b=got, autojunk=False)
    matched, issues = 0, []
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        # "microtasks" heard as "micro tasks" is the same speech.
        if op == "equal" or "".join(want[i1:i2]) == "".join(got[j1:j2]):
            matched += (i2 - i1) + (j2 - j1)
        else:
            issues.append((want[i1:i2], got[j1:j2]))
    agreement = matched / max(1, len(want) + len(got))
    print(f"{name}: {agreement:.3f} word agreement, {len(issues)} differences", flush=True)
    if results:
        results.mkdir(parents=True, exist_ok=True)
        (results / f"{name}.json").write_text(json.dumps({
            "script": sidecar.get("script"),
            "render": sidecar.get("render"),
            "version": VERSION,
            "audio_id": sidecar.get("audio_id"),
            "agreement": round(agreement, 4),
            "differences": [[" ".join(w), " ".join(g)] for w, g in issues],
        }, indent=1) + "\n")
    else:
        for w, g in issues:
            print(f"  script: {' '.join(w) or '-':40}  heard: {' '.join(g) or '-'}")


if __name__ == "__main__":
    sys.exit(main())
