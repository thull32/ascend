#!/usr/bin/env python3
"""Deterministically shuffle quiz options so correct answers are spread
evenly across positions, then rewrite each quiz block in canonical form.

The permutation is seeded by the question text, so re-running is stable and
diffs stay small. Explanations never refer to options by position (the UI
shows no letters), so reordering is safe.

Usage: python3 scripts/shuffle_quiz_options.py [--check] [paths...]
"""
from __future__ import annotations

import hashlib
import json
import pathlib
import random
import re
import sys

import yaml

QUIZ = re.compile(r"(```quiz\n)(.*?)(```)", re.S)


def block_scalar(text: str, indent: str) -> str:
    text = str(text).strip()
    style = "|-" if "\n" in text else ">-"
    body = "\n".join((indent + line) if line.strip() else "" for line in text.split("\n"))
    return f"{style}\n{body}"


def render(questions: list[dict]) -> str:
    out = []
    for q in questions:
        out.append(f"- q: {block_scalar(q['q'], '    ')}")
        out.append("  options: [" + ", ".join(json.dumps(str(o), ensure_ascii=False) for o in q["options"]) + "]")
        out.append(f"  answer: {q['answer']}")
        if q.get("explanation"):
            out.append(f"  explanation: {block_scalar(q['explanation'], '    ')}")
    return "\n".join(out) + "\n"


def shuffle(q: dict) -> dict:
    opts = [str(o) for o in q["options"]]
    correct = opts[int(q["answer"])]
    rng = random.Random(int(hashlib.sha256(str(q["q"]).encode()).hexdigest(), 16))
    order = list(range(len(opts)))
    rng.shuffle(order)
    new_opts = [opts[i] for i in order]
    return {**q, "options": new_opts, "answer": new_opts.index(correct)}


def process(path: pathlib.Path, check: bool) -> bool:
    text = path.read_text()
    changed = False

    def repl(m: re.Match) -> str:
        nonlocal changed
        questions = yaml.safe_load(m.group(2)) or []
        new = [shuffle(q) for q in questions]
        rendered = render(new)
        # Round-trip guarantee: same questions, same correct answers.
        back = yaml.safe_load(rendered)
        for old, got in zip(questions, back):
            assert str(old["q"]).strip() == str(got["q"]).strip(), path
            assert str(old["options"][old["answer"]]) == got["options"][got["answer"]], path
            assert sorted(map(str, old["options"])) == sorted(got["options"]), path
            assert str(old.get("explanation", "")).strip() == str(got.get("explanation", "")).strip(), path
        if rendered != m.group(2):
            changed = True
        return m.group(1) + rendered + m.group(3)

    new_text = QUIZ.sub(repl, text)
    if changed and not check:
        path.write_text(new_text)
    return changed


def main(argv: list[str]) -> int:
    check = "--check" in argv
    paths = [a for a in argv[1:] if a != "--check"] or ["content/tracks"]
    targets: list[pathlib.Path] = []
    for p in paths:
        pp = pathlib.Path(p)
        targets.extend(sorted(pp.rglob("*.md")) if pp.is_dir() else [pp])
    n = sum(process(t, check) for t in targets)
    print(f"{n} files {'would change' if check else 'rewritten'}")
    return 1 if (check and n) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
