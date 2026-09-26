#!/usr/bin/env python3
"""Validate practice problems: front matter parses, the Python reference
solution in `## Solution` passes every test case, and the JavaScript starter
declares the entry name.

Usage: python3 scripts/validate_problems.py [content/problems/*.md]
Exit code 1 on any failure. This is run in CI (see Makefile `check-content`).
"""
from __future__ import annotations

import json
import re
import resource
import signal
import sys
from pathlib import Path

# Hard safety limits: a buggy reference solution must never take the machine
# down. 2 GiB of address space and 10 s wall clock per test case.
resource.setrlimit(resource.RLIMIT_AS, (2 * 1024 ** 3, 2 * 1024 ** 3))
sys.setrecursionlimit(20_000)


class TestTimeout(Exception):
    pass


def _alarm(_signum, _frame):
    raise TestTimeout("test exceeded 10 s")


signal.signal(signal.SIGALRM, _alarm)

try:
    import yaml  # type: ignore
except ImportError:  # pragma: no cover
    print("pip install pyyaml (or: uv pip install pyyaml)", file=sys.stderr)
    sys.exit(2)

FM = re.compile(r"^---\n(.*?)\n---\n(.*)$", re.S)
PY_FENCE = re.compile(r"```python\n(.*?)```", re.S)


def normalise(v):
    if isinstance(v, dict) and len(v) == 1:
        for tag in ("$list", "$tree", "$graph"):
            if tag in v and v[tag] == []:
                return None
    if isinstance(v, tuple):
        return [normalise(x) for x in v]
    if isinstance(v, list):
        return [normalise(x) for x in v]
    if isinstance(v, dict):
        return {str(k): normalise(x) for k, x in v.items()}
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def canon(v):
    return json.dumps(normalise(v), sort_keys=True)


def matches(expected, actual, any_order: bool) -> bool:
    e, a = normalise(expected), normalise(actual)
    if any_order and isinstance(e, list) and isinstance(a, list):
        return sorted(map(canon, e)) == sorted(map(canon, a))
    return canon(e) == canon(a)


class ListNode:
    def __init__(self, val=0, next=None):
        self.val, self.next = val, next


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val, self.left, self.right = val, left, right


class GraphNode:
    def __init__(self, val=0, neighbors=None):
        self.val, self.neighbors = val, neighbors or []


def build_list(values):
    head = None
    for v in reversed(values):
        head = ListNode(v, head)
    return head


def build_tree(values):
    """Level-order with None gaps (LeetCode style)."""
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    queue, i = [root], 1
    while queue and i < len(values):
        node = queue.pop(0)
        if i < len(values) and values[i] is not None:
            node.left = TreeNode(values[i]); queue.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i]); queue.append(node.right)
        i += 1
    return root


def build_graph(adj):
    """adj[i] = list of 1-indexed neighbour values; node i+1 has val i+1."""
    if not adj:
        return None
    nodes = [GraphNode(i + 1) for i in range(len(adj))]
    for i, nb in enumerate(adj):
        nodes[i].neighbors = [nodes[j - 1] for j in nb]
    return nodes[0]


def decode(v):
    if isinstance(v, dict):
        if "$list" in v:
            return build_list(v["$list"])
        if "$tree" in v:
            return build_tree(v["$tree"])
        if "$graph" in v:
            return build_graph(v["$graph"])
        return {k: decode(x) for k, x in v.items()}
    if isinstance(v, list):
        return [decode(x) for x in v]
    return v


def encode(v):
    if isinstance(v, ListNode):
        out, seen = [], set()
        while v is not None and id(v) not in seen:
            seen.add(id(v)); out.append(v.val); v = v.next
        return {"$list": out}
    if isinstance(v, TreeNode):
        out, queue = [], [v]
        while queue:
            n = queue.pop(0)
            if n is None:
                out.append(None); continue
            out.append(n.val); queue.append(n.left); queue.append(n.right)
        while out and out[-1] is None:
            out.pop()
        return {"$tree": out}
    if isinstance(v, GraphNode):
        seen, order = {}, []
        stack = [v]
        while stack:
            n = stack.pop()
            if n.val in seen: continue
            seen[n.val] = n; order.append(n.val)
            stack.extend(n.neighbors)
        adj = [sorted(x.val for x in seen[k].neighbors) for k in sorted(seen)]
        return {"$graph": adj}
    if isinstance(v, (list, tuple)):
        return [encode(x) for x in v]
    if isinstance(v, dict):
        return {k: encode(x) for k, x in v.items()}
    return v


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
    ns: dict = {"ListNode": ListNode, "TreeNode": TreeNode, "Node": GraphNode, "GraphNode": GraphNode}
    try:
        exec("from typing import *\nimport collections, heapq, math, itertools, functools, bisect, string, re\n" + "\n\n".join(fences), ns)
    except Exception as e:  # noqa: BLE001
        return errors + [f"{path}: reference solution failed to exec: {e!r}"]
    entry = ns.get(sig["name"])
    if entry is None:
        return errors + [f"{path}: reference solution does not define '{sig['name']}'"]
    tests = fm["tests"]
    if len(tests) < 4:
        errors.append(f"{path}: only {len(tests)} tests (need >= 4)")
    if not any(t.get("hidden") for t in tests):
        errors.append(f"{path}: no hidden tests")
    for i, t in enumerate(tests):
        args = t.get("args", [])
        signal.alarm(10)
        try:
            if isinstance(entry, type):
                # Class replay: args is a list of [method, *params]
                inst = None
                outs = []
                for call in args:
                    name, *params = call
                    if inst is None and name == "__init__":
                        inst = entry(*params)
                        outs.append(None)
                        continue
                    if inst is None:
                        inst = entry()
                    outs.append(encode(getattr(inst, name)(*decode(params))))
                actual = outs
            else:
                actual = encode(entry(*decode(json.loads(json.dumps(args)))))
        except (Exception, MemoryError, RecursionError, TestTimeout) as e:  # noqa: BLE001
            errors.append(f"{path}: test {i} raised {e!r}")
            continue
        finally:
            signal.alarm(0)
        if not matches(t["expected"], actual, bool(t.get("any_order"))):
            errors.append(f"{path}: test {i} expected {t['expected']!r} got {actual!r}")
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
