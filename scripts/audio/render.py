# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["kokoro-onnx>=0.4", "onnxruntime-gpu[cuda,cudnn]>=1.20", "soundfile>=0.12", "numpy", "lameenc>=1.7", "mutagen>=1.47"]
# [tool.uv]
# # The GPU build replaces the CPU one kokoro-onnx asks for (both are the
# # `onnxruntime` module). Without a CUDA device it runs on the CPU.
# override-dependencies = ["onnxruntime; sys_platform == 'never'"]
# ///
"""Renders an audio script (content/audio, see content/AUDIO_GUIDE.md) to MP3.

    uv run scripts/audio/render.py content/audio/<...>.md [--voice af_heart] [--out runtimes/audio/out]
    uv run scripts/audio/render.py content/audio[/<track>...]      # every script whose render is missing or stale
    uv run scripts/audio/render.py --samples "text" --voices af_heart,am_michael,bf_emma

Speech is synthesised locally with Kokoro (82M parameters, Apache-2.0; the
model is downloaded once into runtimes/audio/models), on the CPU with 16
threads: about 11 times realtime, and reproducible to the sample, so a
re-render of an unchanged script gives an identical file. --gpu is about 80
times realtime on an RTX 5090 but differs from run to run (onnxruntime's CUDA
kernels for this model, ScatterND among them, are not deterministic); its
output sounds the same, but published audio uses the CPU. The MP3 carries ID3
chapters, one per `## Chapter`, and a JSON sidecar lists the chapters and
duration for the feed and the web player. Nothing leaves the machine.
"""
import argparse
import hashlib
import json
import re
import sys
import urllib.request
from pathlib import Path

import lameenc
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / "runtimes" / "audio" / "models"
RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
FILES = ["kokoro-v1.0.onnx", "voices-v1.0.bin"]
RATE = 24_000
# Bumped whenever a change to rendering should redo existing episodes:
# 3 = CPU synthesis with 16 threads (reproducible) and 96 kbit/s MP3.
RENDER = 3
GAP = {"paragraph": 0.45, "pause": 2.0, "think": 6.0, "chapter": 1.1}


def models(gpu=False, threads=16):
    MODELS.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        path = MODELS / name
        if not path.is_file():
            print(f"downloading {name}…", file=sys.stderr)
            urllib.request.urlretrieve(RELEASE + name, path)
    import onnxruntime as ort
    from kokoro_onnx import Kokoro

    ort.preload_dlls()
    options = ort.SessionOptions()
    options.log_severity_level = 3
    # Fixed, so a re-render reproduces the same samples: the thread count
    # changes floating-point summation order and so the waveform (slightly,
    # inaudibly). 16 measured fastest on short paragraphs on 32 cores.
    options.intra_op_num_threads = threads
    providers = [("CUDAExecutionProvider", {"use_tf32": "0"}), "CPUExecutionProvider"] if gpu else ["CPUExecutionProvider"]
    session = ort.InferenceSession(str(MODELS / FILES[0]), options, providers=providers)
    print(f"synthesising on {session.get_providers()[0]}", file=sys.stderr)
    return Kokoro.from_session(session, str(MODELS / FILES[1]))


def lexicon():
    words = json.loads((ROOT / "scripts" / "audio" / "lexicon.json").read_text())
    words.pop("_comment", None)
    # Longest first, so "TTLs" wins over "TTL".
    return [(re.compile(rf"(?<![\w-]){re.escape(k)}(?![\w-])"), v) for k, v in sorted(words.items(), key=lambda kv: -len(kv[0]))]


def speakable(text, lex):
    for pattern, spoken in lex:
        text = pattern.sub(spoken, text)
    return text


def parse(path: Path):
    text = path.read_text()
    meta_text, body = re.match(r"---\n(.*?)\n---\n(.*)", text, re.S).groups()
    meta = dict(re.findall(r"^(\w+):\s*(.*?)\s*$", meta_text, re.M))
    chapters = []
    for block in re.split(r"\n\s*\n", body.strip()):
        block = block.strip()
        if block.startswith("## "):
            title, _, rest = block.partition("\n")
            chapters.append({"title": title[3:].strip(), "parts": []})
            block = rest.strip()
            if not block:
                continue
        if block in ("[pause]", "[think]"):
            chapters[-1]["parts"].append((block[1:-1], None))
        else:
            chapters[-1]["parts"].append(("say", " ".join(block.split())))
    return meta, chapters


def lesson_title(meta, script: Path):
    if "review" in meta:
        module = ROOT / "content" / "tracks" / script.parent.relative_to(ROOT / "content" / "audio") / "module.md"
        m = re.search(r'^title:\s*"?(.*?)"?\s*$', module.read_text(), re.M)
        n = re.search(r"review-(\d+)", script.name).group(1)
        return f"{m.group(1) if m else meta['review']}: review {n}"
    lesson = ROOT / "content" / "tracks" / script.relative_to(ROOT / "content" / "audio")
    m = re.search(r'^title:\s*"?(.*?)"?\s*$', lesson.read_text(), re.M)
    return m.group(1) if m else meta["lesson"]


def silence(seconds):
    return np.zeros(int(RATE * seconds), dtype=np.float32)


def synth(tts, text, voice, speed):
    samples, rate = tts.create(text, voice=voice, speed=speed, lang="en-us")
    assert rate == RATE, rate
    return samples.astype(np.float32)


def encode_mp3(audio, path: Path, title, chapters):
    enc = lameenc.Encoder()
    enc.set_bit_rate(96)
    enc.set_in_sample_rate(RATE)
    enc.set_channels(1)
    enc.set_quality(2)
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes()
    path.write_bytes(enc.encode(pcm) + enc.flush())
    from mutagen.id3 import CHAP, CTOC, ID3, TIT2, TALB, TPE1, CTOCFlags

    tags = ID3()
    tags.add(TIT2(encoding=3, text=title))
    tags.add(TALB(encoding=3, text="Ascend"))
    tags.add(TPE1(encoding=3, text="Ascend"))
    ids = []
    for i, ch in enumerate(chapters):
        cid = f"ch{i}"
        ids.append(cid)
        tags.add(CHAP(element_id=cid, start_time=int(ch["start"] * 1000), end_time=int(ch["end"] * 1000),
                      sub_frames=[TIT2(encoding=3, text=ch["title"])]))
    tags.add(CTOC(element_id="toc", flags=CTOCFlags.TOP_LEVEL | CTOCFlags.ORDERED, child_element_ids=ids,
                  sub_frames=[TIT2(encoding=3, text="Chapters")]))
    tags.save(path)


def spoken_hash(script: Path) -> str:
    """Hash of what is spoken: the body, without the front matter, so that
    recording a lesson's new hash (`source:`) does not force a re-render."""
    body = re.match(r"---\n.*?\n---\n(.*)", script.read_text(), re.S).group(1)
    return hashlib.sha256(body.encode()).hexdigest()[:16]


def episode_name(script: Path) -> str:
    meta, _ = parse(script)
    return meta.get("episode") or meta.get("lesson") or f"{meta['review']}-{script.stem}"


def up_to_date(script: Path, out: Path) -> bool:
    sidecar = out / f"{episode_name(script)}.json"
    if not sidecar.is_file():
        return False
    s = json.loads(sidecar.read_text())
    return s.get("render") == RENDER and s.get("script") == spoken_hash(script)


def render(script: Path, voice, speed, out: Path, tts=None, lex=None):
    meta, chapters = parse(script)
    title = lesson_title(meta, script)
    tts, lex = tts or models(), lex or lexicon()
    pieces, marks, t = [], [], 0.0

    def add(a):
        nonlocal t
        pieces.append(a)
        t += len(a) / RATE

    add(synth(tts, f"Ascend. {speakable(title, lex)}.", voice, speed))
    add(silence(GAP["chapter"]))
    for ch in chapters:
        start = t
        for kind, text in ch["parts"]:
            if kind in ("pause", "think"):
                add(silence(GAP[kind]))
            else:
                add(synth(tts, speakable(text, lex), voice, speed))
                add(silence(GAP["paragraph"]))
        add(silence(GAP["chapter"] - GAP["paragraph"]))
        marks.append({"title": ch["title"], "start": round(start, 2), "end": round(t, 2)})
        print(f"  {ch['title']}: {t - start:.0f}s", file=sys.stderr)
    audio = np.concatenate(pieces)
    out.mkdir(parents=True, exist_ok=True)
    name = meta.get("episode") or meta.get("lesson") or f"{meta['review']}-{script.stem}"
    mp3 = out / f"{name}.mp3"
    encode_mp3(audio, mp3, title, marks)
    sidecar = {
        "lesson": meta.get("lesson"),
        "review": meta.get("review"),
        "name": name,
        "title": title,
        "source": meta.get("source"),
        "script": spoken_hash(script),
        "voice": voice,
        "render": RENDER,
        "duration": round(t, 1),
        "bytes": mp3.stat().st_size,
        "chapters": marks,
    }
    (out / f"{name}.json").write_text(json.dumps(sidecar, indent=2) + "\n")
    print(f"{mp3.relative_to(ROOT)}: {t / 60:.1f} min, {mp3.stat().st_size / 1e6:.1f} MB", file=sys.stderr)
    return mp3


def samples(text, voices, speed, out: Path, gpu=False):
    tts, lex = models(gpu), lexicon()
    out.mkdir(parents=True, exist_ok=True)
    for voice in voices:
        audio = synth(tts, speakable(text, lex), voice, speed)
        path = out / f"sample-{voice}.mp3"
        encode_mp3(audio, path, f"Voice sample: {voice}", [])
        print(f"{path.relative_to(ROOT)}: {len(audio) / RATE:.1f}s", file=sys.stderr)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("script", nargs="?", type=Path)
    p.add_argument("--voice", default="af_heart")
    p.add_argument("--speed", type=float, default=1.0)
    p.add_argument("--out", type=Path, default=ROOT / "runtimes" / "audio" / "out")
    p.add_argument("--samples")
    p.add_argument("--voices", default="af_heart,am_michael,bf_emma,bm_george")
    # Splits a directory's work between processes: --shard 0/2 and 1/2.
    p.add_argument("--shard", default="0/1")
    p.add_argument("--gpu", action="store_true", help="faster, not deterministic; for drafts only")
    a = p.parse_args()
    a.out = a.out.resolve()
    if a.samples:
        samples(a.samples, a.voices.split(","), a.speed, a.out, a.gpu)
    elif a.script.is_dir():
        i, n = (int(x) for x in a.shard.split("/"))
        todo = [p for k, p in enumerate(sorted(a.script.resolve().rglob("*.md"))) if k % n == i and not up_to_date(p, a.out)]
        print(f"{len(todo)} to render", file=sys.stderr)
        tts, lex = models(a.gpu), lexicon()
        for p in todo:
            render(p, a.voice, a.speed, a.out, tts, lex)
    else:
        render(a.script.resolve(), a.voice, a.speed, a.out, models(a.gpu))


if __name__ == "__main__":
    main()
