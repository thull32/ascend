#!/usr/bin/env python3
"""Validate practice problems' structure: front matter parses and has every
key, the slug matches the file, hints are strings, the JavaScript starter
declares the entry name, there are enough tests including a hidden one, and
the `## Solution` section has a Python reference.

It does not run the reference solutions: the server's grader does, with the
same harness and comparison rule learners are graded by
(`ascend-api --grade-solutions --problems`, which CI runs).

Usage: python3 scripts/validate_problems.py [content/problems/*.md]
Exit code 1 on any failure.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

try:
    import yaml  # type: ignore
except ImportError:  # pragma: no cover
    print("pip install pyyaml (or: uv pip install pyyaml)", file=sys.stderr)
    sys.exit(2)

FM = re.compile(r"^---\n(.*?)\n---\n(.*)$", re.S)
PY_FENCE = re.compile(r"```python\n(.*?)```", re.S)


def validate(path: Path) -> list[str]:
    errors: list[str] = []
    text = path.read_text()
    m = FM.match(text)
    if not m:
        return [f"{path}: missing front matter"]
    try:
        fm = yaml.safe_load(m.group(1))
    except yaml.YAMLError as e:
        return [f"{path}: front matter YAML error: {e}"]
    body = m.group(2)
    for key in ("slug", "title", "difficulty", "patterns", "signatures", "tests"):
        if key not in fm:
            errors.append(f"{path}: missing '{key}'")
    if errors:
        return errors
    if fm["slug"] != path.stem:
        errors.append(f"{path}: slug '{fm['slug']}' != filename")
    if fm["difficulty"] not in ("easy", "medium", "hard"):
        errors.append(f"{path}: difficulty must be easy|medium|hard")
    for i, h in enumerate(fm.get("hints", []) or []):
        if not isinstance(h, str):
            errors.append(f"{path}: hint {i} is not a string (a ': ' inside an unquoted YAML scalar makes a dict; wrap the hint in double quotes)")
    for key in ("patterns", "lists", "companies"):
        if any(not isinstance(x, str) for x in (fm.get(key) or [])):
            errors.append(f"{path}: {key} must be a list of strings")
    sig = fm["signatures"].get("python")
    if not sig:
        errors.append(f"{path}: no python signature")
        return errors
    js = fm["signatures"].get("javascript")
    if js and js["name"] not in js.get("starter", ""):
        errors.append(f"{path}: javascript starter does not mention entry '{js['name']}'")
    if "## Solution" not in body:
        errors.append(f"{path}: missing '## Solution' section")
        return errors
    solution_md = body.split("## Solution", 1)[1]
    fences = PY_FENCE.findall(solution_md)
    if not fences:
        errors.append(f"{path}: no ```python reference solution in Solution")
        return errors
    tests = fm["tests"]
    if len(tests) < 4:
        errors.append(f"{path}: only {len(tests)} tests (need >= 4)")
    if not any(t.get("hidden") for t in tests):
        errors.append(f"{path}: no hidden tests")
    return errors


def main(argv: list[str]) -> int:
    paths = [Path(p) for p in argv[1:]] or sorted(Path("content/problems").glob("*.md"))
    all_errors: list[str] = []
    for p in paths:
        all_errors.extend(validate(p))
    for e in all_errors:
        print(e)
    print(f"{len(paths)} problems, {len(all_errors)} errors")
    return 1 if all_errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
