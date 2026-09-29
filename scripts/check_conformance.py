#!/usr/bin/env python3
"""Checks the Python copies of the comparison rule against the shared corpus
(crates/grader/conformance.json): the problem validator's, and the Pyodide
harness embedded in web/src/runner/py.worker.ts. The JavaScript harness and
the server's Rust port are checked by their own tests (vitest, cargo test).

Usage: python3 scripts/check_conformance.py   (exit code 1 on any mismatch)
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import validate_problems  # noqa: E402  (sets its own resource limits)


def pyodide_harness() -> dict:
    source = (ROOT / "web/src/runner/py.worker.ts").read_text()
    m = re.search(r"const HARNESS = String\.raw`(.*?)`;", source, re.S)
    if not m:
        sys.exit("could not find the Python harness in py.worker.ts")
    ns: dict = {}
    exec(m.group(1), ns)
    return ns


def main() -> int:
    corpus = json.loads((ROOT / "crates/grader/conformance.json").read_text())["cases"]
    harness = pyodide_harness()
    implementations = {
        "scripts/validate_problems.py": validate_problems.matches,
        "web/src/runner/py.worker.ts (Pyodide)": harness["_matches"],
    }
    failures = 0
    for name, matches in implementations.items():
        for i, case in enumerate(corpus):
            got = matches(case["expected"], case["actual"], bool(case.get("any_order")))
            if got != case["match"]:
                failures += 1
                print(f"{name}: case {i} {case}: got {got}")
    print(f"{len(corpus)} cases x {len(implementations)} implementations, {failures} mismatches")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
