#!/usr/bin/env python3
"""Report answer-position and answer-length bias in quiz blocks.

A good multiple-choice question cannot be answered by picking the longest or
most specific option, or by always picking the same position.

Usage: python3 scripts/quiz_stats.py [--max-longest 0.35] [paths...]
Paths default to content/tracks. Exits 1 if the share of questions whose
correct answer is the unique longest option exceeds --max-longest.
"""
from __future__ import annotations

import argparse
import collections
import pathlib
import re
import sys

import yaml

QUIZ = re.compile(r"```quiz\n(.*?)```", re.S)


def files(paths: list[str]) -> list[pathlib.Path]:
    out: list[pathlib.Path] = []
    for p in paths or ["content/tracks"]:
        path = pathlib.Path(p)
        out.extend(sorted(path.rglob("*.md")) if path.is_dir() else [path])
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-longest", type=float, default=1.0)
    ap.add_argument("--per-file", action="store_true")
    ap.add_argument("paths", nargs="*")
    args = ap.parse_args()
    total = longest = 0
    positions: collections.Counter[int] = collections.Counter()
    worst: list[tuple[float, str, int]] = []
    for f in files(args.paths):
        f_total = f_longest = 0
        for block in QUIZ.findall(f.read_text()):
            for q in yaml.safe_load(block) or []:
                opts = [str(o) for o in q["options"]]
                a = int(q["answer"])
                lens = [len(o) for o in opts]
                is_longest = lens[a] == max(lens) and lens.count(max(lens)) == 1
                total += 1
                f_total += 1
                positions[a] += 1
                longest += is_longest
                f_longest += is_longest
        if f_total:
            worst.append((f_longest / f_total, str(f), f_total))
    if not total:
        print("no quiz questions found")
        return 0
    rate = longest / total
    print(f"{total} questions; correct answer is the unique longest option in {longest} ({rate:.0%})")
    print("answer positions:", dict(sorted(positions.items())))
    if args.per_file:
        for r, f, n in sorted(worst, reverse=True):
            print(f"  {r:4.0%}  {n:2d}q  {f}")
    return 1 if rate > args.max_longest else 0


if __name__ == "__main__":
    sys.exit(main())
