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
PROBLEM_WALK = ROOT / "content" / "problem-walkthroughs"
PROBLEMS = ROOT / "content" / "problems"
SPOKEN = ROOT / "content" / "spoken-quizzes"
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
    return problems + check_cues(body, int(meta.get("frames") or 0))


def check_cues(body: str, frames: int) -> list[str]:
    """`@N` / `@N-M` cues: from @0, rising without overlapping, below `frames`;
    and no markup or symbols in what is spoken."""
    problems = []
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


def check_problem_walkthrough(script: Path, fix: bool) -> list[str]:
    """A narrated walkthrough of a problem's solution, stepping through the
    trace that scripts/trace_solution.py recorded (<slug>.trace.json): each
    frame is one executed line. `source` is the hash of the traced code and
    example, so changing either flags the narration for review."""
    import json

    text = script.read_text()
    try:
        meta, body = parse(text)
    except ValueError as e:
        return [str(e)]
    slug = meta.get("problem", "")
    if script.stem != slug:
        return [f"problem: {slug!r} must match the file name"]
    problem = PROBLEMS / f"{slug}.md"
    if not problem.is_file():
        return [f"no problem at {problem.relative_to(ROOT)}"]
    trace_path = script.with_suffix(".trace.json")
    if not trace_path.is_file():
        return [f"no trace: run scripts/safe_py.sh scripts/trace_solution.py {script.relative_to(ROOT)}"]
    trace = json.loads(trace_path.read_text())
    sys.path.insert(0, str(ROOT / "scripts"))
    from trace_solution import default_block, solution_blocks, source_hash

    problems = []
    blocks = solution_blocks(problem)
    n = int(meta.get("block") or default_block(problem))
    if not 1 <= n <= len(blocks):
        return [f"block: {n} but the solution has {len(blocks)} Python blocks"]
    # Read raw: parse() would cut a JSON string at a "#".
    raw_args = re.search(r"^args:\s*(.*?)\s*$", text.split("\n---\n", 1)[0], re.M)
    args = json.loads(raw_args.group(1) if raw_args else "null")
    current = source_hash(blocks[n - 1], args)
    if trace.get("source") != current or trace.get("block") != n:
        problems.append("the trace is stale (the solution code or args changed): run scripts/trace_solution.py, then review the narration")
    elif meta.get("source") != current:
        if fix:
            script.write_text(re.sub(r"^source: \S+", f"source: {current}", text, count=1, flags=re.M))
        else:
            problems.append(f"stale: the traced code or example changed (source {meta.get('source')}, now {current})")
    frames = int(meta.get("frames") or 0)
    if frames != len(trace["frames"]):
        problems.append(f"frames: {frames} but the trace has {len(trace['frames'])}")
    return problems + check_cues(body, frames)


def quiz_questions(lesson: Path) -> tuple[str, list[int]]:
    """The lesson's quiz block (exact text) and each question's answer index."""
    m = re.search(r"^```quiz\n.*?^```", lesson.read_text(), re.S | re.M)
    if not m:
        return "", []
    return m.group(0), [int(a) for a in re.findall(r"^  answer: (\d+)", m.group(0), re.M)]


def check_spoken_quiz(script: Path, fix: bool) -> list[str]:
    """Spoken versions of one lesson's quiz questions, for the daily review.
    `## N` is the lesson's question N (1-based); each becomes a clip."""
    text = script.read_text()
    try:
        meta, body = parse(text)
    except ValueError as e:
        return [str(e)]
    lesson = TRACKS / script.relative_to(SPOKEN)
    if not lesson.is_file():
        return [f"no lesson at {lesson.relative_to(ROOT)}"]
    problems = []
    slug = re.search(r"^slug:\s*(\S+)", lesson.read_text(), re.M)
    if not slug or slug.group(1) != meta.get("lesson"):
        problems.append(f"lesson: {meta.get('lesson')!r} does not match the lesson's slug")
    block, answers = quiz_questions(lesson)
    current = hashlib.sha256(block.encode()).hexdigest()[:16]
    if meta.get("source") != current:
        if fix:
            script.write_text(re.sub(r"^source: \S+", f"source: {current}", text, count=1, flags=re.M))
        else:
            problems.append(f"stale: the lesson's quiz changed (source {meta.get('source')}, now {current})")
    sections = re.findall(r"^## ([^\n]*)\n(.*?)(?=^## |\Z)", body, re.S | re.M)
    if not sections:
        problems.append("no questions: one `## N` section per question")
    seen = []
    for head, part in sections:
        if not head.isdigit() or not 1 <= int(head) <= len(answers):
            problems.append(f"## {head}: must be a question number from 1 to {len(answers)}")
            continue
        n = int(head)
        seen.append(n)
        letter = "ABCDEFGH"[answers[n - 1]]
        said = re.search(r"^The answer is ([A-H])\b", part, re.M)
        if not said or said.group(1) != letter:
            problems.append(f"## {n}: must say \"The answer is {letter}\" (the quiz's answer)")
        if part.count("[think]") != 1:
            problems.append(f"## {n}: needs exactly one [think] before the answer")
        words = len(re.sub(r"\[(think|pause)\]", "", part).split())
        if not 40 <= words <= 260:
            problems.append(f"## {n}: {words} words; keep a question between 40 and 260")
        for line in part.splitlines():
            if line.strip() and (line.startswith(("#", "-", ">", "  ")) or FORBIDDEN.search(line)):
                problems.append(f"## {n}: markup or symbols: {line[:70]!r}")
    if seen != sorted(set(seen)):
        problems.append(f"questions {seen} must be in order, each once")
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
    def under(root):
        return sorted(p for p in root.rglob("*.md") if not paths or any(p == r or r in p.parents for r in paths))

    walks, problem_walks, spoken = under(WALK), under(PROBLEM_WALK), under(SPOKEN)
    for files, checker in ((walks, check_walkthrough), (problem_walks, check_problem_walkthrough), (spoken, check_spoken_quiz)):
        for f in files:
            for p in checker(f, fix):
                failed += 1
                print(f"{f.relative_to(ROOT)}: {p}")
    print(f"{len(scripts)} scripts, {len(walks)} walkthroughs, {len(problem_walks)} problem walkthroughs, "
          f"{len(spoken)} spoken quizzes, {failed} problems")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
