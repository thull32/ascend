#!/usr/bin/env python3
"""Recompute `minutes` in every lesson's front matter from its content.

Formula (from CONTENT_GUIDE.md): words of prose / 120 + 10 per exercise,
rounded to the nearest 5 and never below 10. Prose excludes fenced blocks
and tables. Idempotent; `--check` exits 1 if any file would change.

Usage: python3 scripts/recompute_minutes.py [--check] [paths...]
"""
from __future__ import annotations

import pathlib
import re
import sys

FRONT = re.compile(r"^---\n(.*?)\n---\n", re.S)
MINUTES = re.compile(r"^minutes:\s*\d+\s*$", re.M)


def minutes_for(body: str) -> int:
    exercises = len(re.findall(r"^```exercise", body, re.M))
    prose = re.sub(r"```.*?```", "", body, flags=re.S)
    prose = re.sub(r"^\|.*\|$", "", prose, flags=re.M)
    words = len(re.findall(r"\b\w+\b", prose))
    raw = words / 120 + 10 * exercises
    return max(10, int(round(raw / 5.0)) * 5)


def process(path: pathlib.Path, check: bool) -> bool:
    text = path.read_text()
    m = FRONT.match(text)
    if not m or not MINUTES.search(m.group(1)):
        return False
    body = text[m.end() :]
    new_front = MINUTES.sub(f"minutes: {minutes_for(body)}", m.group(1))
    new_text = f"---\n{new_front}\n---\n{body}"
    if new_text == text:
        return False
    if not check:
        path.write_text(new_text)
    return True


def main(argv: list[str]) -> int:
    check = "--check" in argv
    paths = [a for a in argv[1:] if a != "--check"] or ["content/tracks"]
    targets: list[pathlib.Path] = []
    for p in paths:
        pp = pathlib.Path(p)
        targets.extend(sorted(f for f in pp.rglob("*.md") if f.name not in ("module.md", "track.md")) if pp.is_dir() else [pp])
    n = sum(process(t, check) for t in targets)
    print(f"{n} files {'would change' if check else 'updated'}")
    return 1 if (check and n) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
