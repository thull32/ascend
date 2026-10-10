#!/usr/bin/env python3
"""Checks audio scripts (content/audio) against content/AUDIO_GUIDE.md.

    python3 scripts/audio/check.py [PATH...]                # check every script, or those under PATH
    python3 scripts/audio/check.py --fix-source PATH...     # record the current lesson hash (after reviewing!)

A script is stale when its `source` no longer matches the first 16 hex of its
lesson file's SHA-256: the lesson changed and the script must be reviewed
against it. Standard library only.
"""
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIO = ROOT / "content" / "audio"
WALK = ROOT / "content" / "walkthroughs"
TRACKS = ROOT / "content" / "tracks"
FORBIDDEN = re.compile(r"[`|$*_]|https?:|\[(?!pause\]|think\])")
WORDS = {"great": (1300, 2200), "partial": (1300, 2200), "screen": (450, 800), "review": (1300, 2400)}


def lesson_for(script: Path) -> Path:
    return TRACKS / script.relative_to(AUDIO)


def module_quizzes(script: Path) -> bytes:
    """The quiz blocks of every lesson in a review script's module, in order."""
    module = TRACKS / script.parent.relative_to(AUDIO)
    blocks = []
    for lesson in sorted(module.glob("*.md")):
        blocks += re.findall(r"^```quiz\n.*?^```", lesson.read_text(), re.S | re.M)
    return "\n".join(blocks).encode()


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def parse(text: str):
    """Front matter as a dict (desk as a list) and the body."""
    m = re.match(r"---\n(.*?)\n---\n(.*)", text, re.S)
    if not m:
        raise ValueError("missing front matter")
    meta, desk, in_desk = {}, [], False
    for line in m.group(1).splitlines():
        if in_desk and line.startswith("  - "):
            desk.append(line[4:].strip().strip('"'))
            continue
        in_desk = False
        key, _, value = line.partition(":")
        value = value.split("#")[0].strip()
        if key == "desk":
            in_desk = True
        else:
            meta[key.strip()] = value
    meta["desk"] = desk
    return meta, m.group(2)


def check(script: Path, fix: bool) -> list[str]:
    problems = []
    text = script.read_text()
    try:
        meta, body = parse(text)
    except ValueError as e:
        return [str(e)]
    review = "review" in meta
    if review:
        module = re.sub(r"^\d+-", "", script.parent.name)
        if meta["review"] != module:
            problems.append(f"review: {meta['review']!r} should be {module!r}")
        current = hashlib.sha256(module_quizzes(script)).hexdigest()[:16]
    else:
        lesson = lesson_for(script)
        if not lesson.is_file():
            return [f"no lesson at {lesson.relative_to(ROOT)}"]
        slug = re.search(r"^slug:\s*(\S+)", lesson.read_text(), re.M)
        if not slug or slug.group(1) != meta.get("lesson"):
            problems.append(f"lesson: {meta.get('lesson')!r} does not match the lesson's slug")
        current = digest(lesson)
    if meta.get("source") != current:
        if fix:
            script.write_text(re.sub(r"^source: \S+", f"source: {current}", text, count=1, flags=re.M))
        else:
            problems.append(f"stale: the lesson changed (source {meta.get('source')}, lesson {current})")
    fit = "review" if review else meta.get("fit")
    if fit not in WORDS:
        problems.append(f"fit: {fit!r} is not great, partial or screen")
    chapters = re.findall(r"^## (.+)$", body, re.M)
    if not chapters or chapters[0] != "Introduction" or chapters[-1] != "Recap":
        problems.append("chapters must start with '## Introduction' and end with '## Recap'")
    for n, line in enumerate(body.splitlines(), 1):
        if line.startswith("## ") or line.strip() in ("[pause]", "[think]"):
            continue
        if line.startswith(("#", "-", ">", "  ")) or FORBIDDEN.search(line):
            problems.append(f"body line {n}: markup or symbols: {line[:70]!r}")
    spoken = re.sub(r"^## .*$|^\[(pause|think)\]$", "", body, flags=re.M)
    words = len(spoken.split())
    lo, hi = WORDS.get(fit, (0, 10**9))
    if not lo <= words <= hi:
        problems.append(f"{words} words; a {fit} script has {lo} to {hi}")
    return problems


def viz_blocks(lesson: Path) -> dict[str, str]:
    """The lesson's ```viz blocks, by title, as their exact source text."""
    import json

    blocks = {}
    for raw in re.findall(r"^```viz\n(.*?)^```", lesson.read_text(), re.S | re.M):
        try:
            title = json.loads(raw).get("title")
        except ValueError:
            continue
        if title:
            blocks.setdefault(title, raw)
    return blocks


def check_walkthrough(script: Path, fix: bool) -> list[str]:
    """A narrated walkthrough of one visualisation: `@N` starts a cue that
    shows frame N while its text is spoken, and `@N-M` plays frames N to M
    across it (content/AUDIO_GUIDE.md). Frame
    bounds are checked against the generator by web/src/viz/walkthroughs.test.ts."""
    text = script.read_text()
    try:
        meta, body = parse(text)
    except ValueError as e:
        return [str(e)]
    # content/walkthroughs/<track>/<module>/<lesson file stem>/<n>.md
    lesson = TRACKS / script.parent.relative_to(WALK).with_suffix(".md")
    if not lesson.is_file():
        return [f"no lesson at {lesson.relative_to(ROOT)}"]
    problems = []
    slug = re.search(r"^slug:\s*(\S+)", lesson.read_text(), re.M)
    if not slug or slug.group(1) != meta.get("lesson"):
        problems.append(f"lesson: {meta.get('lesson')!r} does not match the lesson's slug")
    title = meta.get("viz", "").strip('"')
    block = viz_blocks(lesson).get(title)
    if block is None:
        return problems + [f"viz: the lesson has no visualisation titled {title!r}"]
    current = hashlib.sha256(block.encode()).hexdigest()[:16]
    if meta.get("source") != current:
        if fix:
            script.write_text(re.sub(r"^source: \S+", f"source: {current}", text, count=1, flags=re.M))
        else:
            problems.append(f"stale: the visualisation changed (source {meta.get('source')}, now {current})")
    frames = int(meta.get("frames") or 0)
    spans = [(int(a), int(b or a)) for a, b in re.findall(r"^@(\d+)(?:-(\d+))?$", body, re.M)]
    flat = [f for a, b in spans for f in (a, b)]
    if not spans or spans[0][0] != 0 or any(b < a for a, b in spans) or flat != sorted(flat) or len(set(a for a, _ in spans)) != len(spans) or flat[-1] >= frames:
        problems.append(f"cues {spans} must start at @0, rise without overlapping, and stay below frames: {frames}")
    for n, line in enumerate(body.splitlines(), 1):
        if re.fullmatch(r"@\d+(-\d+)?", line) or not line.strip():
            continue
        if line.startswith(("#", "-", ">", "  ")) or FORBIDDEN.search(line):
            problems.append(f"body line {n}: markup or symbols: {line[:70]!r}")
    return problems


def main() -> int:
    fix = "--fix-source" in sys.argv
    # Paths (files or directories) narrow the run; --fix-source only ever
    # touches the scripts named, so one author cannot mark another's current.
    paths = [Path(a).resolve() for a in sys.argv[1:] if not a.startswith("--")]
    if fix and not paths:
        print("--fix-source needs the scripts or directories you reviewed")
        return 2
    scripts = sorted(p for root in (paths or [AUDIO]) for p in (root.rglob("*.md") if root.is_dir() else [root]) if AUDIO in p.parents)
    failed = 0
    # Episode names are file names in the bucket and the feed, so they must
    # be unique across the curriculum; `episode:` overrides a clashing slug.
    names = {}
    for script in sorted(AUDIO.rglob("*.md")):
        try:
            meta, _ = parse(script.read_text())
        except ValueError:
            continue
        name = meta.get("episode") or meta.get("lesson") or f"{meta.get('review')}-{script.stem}"
        names.setdefault(name, []).append(script)
    for name, owners in names.items():
        if len(owners) > 1 and any(o in scripts for o in owners):
            failed += 1
            print(f"episode name {name!r} is used by {', '.join(str(o.relative_to(ROOT)) for o in owners)}: set `episode:` on one")
    for script in scripts:
        for p in check(script, fix):
            failed += 1
            print(f"{script.relative_to(ROOT)}: {p}")
    walks = sorted(p for p in WALK.rglob("*.md") if not paths or any(p == r or r in p.parents for r in paths))
    for walk in walks:
        for p in check_walkthrough(walk, fix):
            failed += 1
            print(f"{walk.relative_to(ROOT)}: {p}")
    print(f"{len(scripts)} scripts, {len(walks)} walkthroughs, {failed} problems")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
