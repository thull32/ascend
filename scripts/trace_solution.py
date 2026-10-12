"""Traces a problem's Python solution on one example, for its narrated walkthrough.

    python3 scripts/trace_solution.py content/walkthroughs/problems/<slug>.md [--print]

Reads the walkthrough's front matter (`problem`, `args`, optional `block`),
takes that Python block from the problem's solution, runs it through the
grader's harness (crates/grader/harness/harness.py) on `args`, and records a
frame for every line the solution executes: the line, the call stack, and
the current function's variables, formatted for reading (a linked list as
"2 → 4 → 3"). Writes <slug>.trace.json next to the walkthrough, which the
problem page steps through in time with the narration. --print lists the
frames, to write the narration against.

Run it through scripts/safe_py.sh. The trace is deterministic (string hashing
is pinned), so re-running it on unchanged code gives the same file.
"""
import hashlib
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "crates" / "grader" / "harness"))
MAX_FRAMES = 300
# `max_frames:` may raise the limit this far, for a solution whose smallest
# honest example is long (a sudoku's setup scan); narrate it with ranges.
HARD_MAX_FRAMES = 1200
VALUE_CHARS = 160
# Bump when the frame format changes.
VERSION = 2


def front_matter(path: Path):
    text = path.read_text()
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    if not m:
        raise SystemExit(f"{path}: no front matter")
    meta = {}
    for k, v in re.findall(r"^(\w+):\s*(.*?)\s*$", m.group(1), re.M):
        meta[k] = v
    return meta


def solution_blocks(problem: Path):
    """The Python blocks of the problem's `## Solution`, in order."""
    text = problem.read_text()
    solution = text[text.index("\n## Solution"):]
    return [b for b in re.findall(r"^```python\n(.*?)^```", solution, re.S | re.M)]


def default_block(problem: Path) -> int:
    """The block under "### The optimal approach", else the last one."""
    text = problem.read_text()
    solution = text[text.index("\n## Solution"):]
    blocks = list(re.finditer(r"^```python\n", solution, re.M))
    at = solution.find("### The optimal approach")
    if at >= 0:
        for i, b in enumerate(blocks):
            if b.start() > at:
                return i + 1
    return len(blocks)


def source_hash(code: str, args) -> str:
    """What the narration describes: the code and the example."""
    return hashlib.sha256(f"{code}\n{json.dumps(args, sort_keys=True)}".encode()).hexdigest()[:16]


def fmt(v, harness, depth=0) -> str:
    def cut(s):
        return s if len(s) <= VALUE_CHARS else s[: VALUE_CHARS - 1] + "…"

    if v is None or isinstance(v, (bool, int)):
        return repr(v)
    if isinstance(v, float):
        return repr(round(v, 6)) if v == v else "nan"
    if isinstance(v, str):
        return cut(repr(v))
    if isinstance(v, harness.ListNode):
        out, seen, n = [], set(), v
        while n is not None and id(n) not in seen and len(out) < 12:
            seen.add(id(n))
            out.append(fmt(n.val, harness, depth + 1))
            n = n.next
        tail = " → (back to an earlier node)" if n is not None and id(n) in seen else " → …" if n is not None else ""
        return cut(" → ".join(out) + tail)
    if isinstance(v, harness.TreeNode):
        return f"TreeNode({fmt(v.val, harness, depth + 1)})"
    if isinstance(v, harness.Node):
        return f"Node({fmt(v.val, harness, depth + 1)})"
    if depth > 2:
        return "…"
    if isinstance(v, dict):
        return cut("{" + ", ".join(f"{fmt(k, harness, depth + 1)}: {fmt(x, harness, depth + 1)}" for k, x in list(v.items())[:30]) + "}")
    if type(v).__name__ == "deque":
        return cut("deque([" + ", ".join(fmt(x, harness, depth + 1) for x in list(v)[:30]) + "])")
    if isinstance(v, list):
        return cut("[" + ", ".join(fmt(x, harness, depth + 1) for x in v[:40]) + "]")
    if isinstance(v, tuple):
        return cut("(" + ", ".join(fmt(x, harness, depth + 1) for x in v) + ("," if len(v) == 1 else "") + ")")
    if isinstance(v, (set, frozenset)):
        items = sorted((fmt(x, harness, depth + 1) for x in v), key=lambda s: (len(s), s))
        return cut("{" + ", ".join(items[:30]) + "}" if items else "set()")
    fields = attributes(v)
    if fields is not None and not callable(v):
        scalars = {k: x for k, x in fields.items() if x is None or isinstance(x, (bool, int, float, str))}
        if depth > 0:
            # Nested objects (a node inside a map, a neighbour) show only their own values.
            return cut(f"{type(v).__name__}(" + ", ".join(f"{k}={fmt(x, harness, 9)}" for k, x in scalars.items()) + ")")
        if "next" in fields and (fields["next"] is None or isinstance(fields["next"], type(v))):
            # A hand-rolled linked list: follow next, one (values) per node;
            # another pointer to a node (random, child) shows its target's value.
            def label(node):
                parts = []
                for k, x in attributes(node).items():
                    if k in ("next", "prev"):
                        continue
                    if isinstance(x, type(node)):
                        first = next(iter(attributes(x).values()), None)
                        parts.append(f"{k}→{fmt(first, harness, 9)}")
                    elif x is None and k not in ("val", "key", "value"):
                        parts.append(f"{k}→None")
                    elif x is None or isinstance(x, (bool, int, float, str)):
                        parts.append(fmt(x, harness, 9))
                return "(" + ", ".join(parts) + ")"

            out, seen, n = [], set(), v
            while n is not None and id(n) not in seen and len(out) < 12:
                seen.add(id(n))
                out.append(label(n))
                n = getattr(n, "next", None)
            return cut(" → ".join(out) + (" → …" if n is not None else ""))
        return cut(f"{type(v).__name__}(" + ", ".join(f"{k}={fmt(x, harness, depth + 1)}" for k, x in fields.items()) + ")")
    text = repr(v)
    # A default repr carries a memory address, which differs on every run.
    return cut(type(v).__name__ if " at 0x" in text else text)


def attributes(v):
    """An object's fields, from its __dict__ or its __slots__; None for
    objects that have neither (built-ins)."""
    if hasattr(v, "__dict__"):
        return dict(vars(v))
    slots = [n for c in type(v).__mro__ for n in getattr(c, "__slots__", ()) if n != "__weakref__"]
    if slots and type(v).__module__ not in ("builtins", "collections"):
        return {n: getattr(v, n) for n in slots if hasattr(v, n)}
    return None


def visible(name, value) -> bool:
    # ".0" is a comprehension's or generator's hidden iterator.
    if name.startswith(("__", ".")) or name in ("self", "cls"):
        return False
    return not (callable(value) and not hasattr(value, "__self__") or type(value).__name__ == "module")


def trace(code: str, entry: str, args, harness, prelude: str | None = None, limit: int = MAX_FRAMES):
    frames = []

    def snapshot(frame, event, arg):
        stack = []
        f = frame
        while f is not None:
            if f.f_code.co_filename == "<solution>":
                stack.append(f)
            f = f.f_back
        stack.reverse()
        names = [s.f_code.co_name for s in stack]
        top_vars = {}
        local = frame.f_locals
        fields = attributes(local["self"]) if "self" in local else None
        if fields:
            for k, x in fields.items():
                if not callable(x):
                    top_vars[f"self.{k}"] = fmt(x, harness)
        for k, x in local.items():
            if visible(k, x):
                top_vars[k] = fmt(x, harness)
        f = {"line": frame.f_lineno, "stack": names, "vars": top_vars}
        if event == "return":
            f["ret"] = fmt(arg, harness)
        return f

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != "<solution>":
            return None
        if frame.f_code.co_name in ("<module>",):
            return None
        if event in ("line", "return"):
            frames.append(snapshot(frame, event, arg))
            if len(frames) > limit:
                raise RuntimeError(f"more than {limit} frames: trace a smaller example")
        return tracer

    if prelude:
        # Helpers the solution needs but does not define (a node class, the
        # entry point that builds the input): run first, and not traced.
        ns = harness._fresh_namespace()
        exec(compile(prelude, "<prelude>", "exec"), ns)
        exec(compile(code, "<solution>", "exec"), ns)
        target = ns.get(entry)
        if target is None:
            raise SystemExit(f"neither the prelude nor the solution defines {entry!r}")
    else:
        target, err = harness.load(code, entry)
        if err:
            raise SystemExit(err)
    sys.settrace(tracer)
    try:
        actual, error, _ = harness.run_case(target, args)
    finally:
        sys.settrace(None)
    if error:
        raise SystemExit(f"the solution failed on these args:\n{error}")
    return frames, actual


def main():
    if os.environ.get("PYTHONHASHSEED") != "0":
        os.environ["PYTHONHASHSEED"] = "0"
        os.execv(sys.executable, [sys.executable, *sys.argv])
    argv = sys.argv[1:]
    show = "--print" in argv
    paths = [Path(a).resolve() for a in argv if not a.startswith("--")]
    import harness

    for walk in paths:
        meta = front_matter(walk)
        slug = meta["problem"]
        problem = ROOT / "content" / "problems" / f"{slug}.md"
        args = json.loads(meta["args"])
        blocks = solution_blocks(problem)
        n = int(meta.get("block") or default_block(problem))
        code = blocks[n - 1]
        entry = re.search(r"^  python:\n    name: (\S+)", problem.read_text(), re.M).group(1)
        prelude = blocks[int(meta["prelude"]) - 1] if meta.get("prelude") else None
        limit = min(int(meta.get("max_frames") or MAX_FRAMES), HARD_MAX_FRAMES)
        frames, actual = trace(code, entry, args, harness, prelude, limit)
        out = walk.with_suffix(".trace.json")
        doc = {
            "problem": slug,
            "block": n,
            "version": VERSION,
            "source": source_hash(code, args),
            "code": code,
            "args": args,
            "result": json.dumps(actual),
            "frames": frames,
        }
        out.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
        print(f"{out.relative_to(ROOT)}: {len(frames)} frames, source {doc['source']}, result {doc['result']}")
        if show:
            lines = code.splitlines()
            for i, f in enumerate(frames):
                where = " > ".join(f["stack"])
                print(f"@{i}  line {f['line']}: {lines[f['line'] - 1].strip()}   [{where}]")
                print("     " + ", ".join(f"{k}={v}" for k, v in f["vars"].items()) + (f"   returns {f['ret']}" if "ret" in f else ""))


if __name__ == "__main__":
    main()
