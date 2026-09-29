# Running learner Python against test cases: the ONE implementation, shared by
# the browser's Pyodide worker (web/src/runner/py.worker.ts) and the server's
# grader (grade_main.py, CPython for WASI). It provides the node classes,
# decodes each case's arguments, calls the learner's function or class, and
# encodes what came back as plain JSON data. It never compares: compare.js
# does, and on the server that happens outside the learner's sandbox.
import json, time, math, collections

class ListNode:
    def __init__(self, val=0, next=None):
        self.val, self.next = val, next
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val, self.left, self.right = val, left, right
class Node:
    def __init__(self, val=0, neighbors=None):
        self.val, self.neighbors = val, (neighbors or [])
GraphNode = Node

def _build_list(values):
    head = None
    for v in reversed(values):
        head = ListNode(v, head)
    return head

def _build_tree(values):
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0]); q = collections.deque([root]); i = 1
    while q and i < len(values):
        n = q.popleft()
        if i < len(values) and values[i] is not None:
            n.left = TreeNode(values[i]); q.append(n.left)
        i += 1
        if i < len(values) and values[i] is not None:
            n.right = TreeNode(values[i]); q.append(n.right)
        i += 1
    return root

_INPUT_GRAPH_NODES = set()

def _build_graph(adj):
    if not adj:
        return None
    nodes = [Node(i + 1) for i in range(len(adj))]
    for i, nb in enumerate(adj):
        nodes[i].neighbors = [nodes[j - 1] for j in nb]
    _INPUT_GRAPH_NODES.update(id(n) for n in nodes)
    return nodes[0]

def _shares_graph_nodes(v):
    if not isinstance(v, Node) or not _INPUT_GRAPH_NODES:
        return False
    seen, stack = set(), [v]
    while stack:
        n = stack.pop()
        if id(n) in seen: continue
        seen.add(id(n))
        if id(n) in _INPUT_GRAPH_NODES: return True
        stack.extend(n.neighbors)
    return False

def _decode(v):
    if isinstance(v, dict):
        if "$list" in v: return _build_list(v["$list"])
        if "$tree" in v: return _build_tree(v["$tree"])
        if "$graph" in v: return _build_graph(v["$graph"])
        return {k: _decode(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_decode(x) for x in v]
    return v

def _encode(v, depth=0):
    if depth > 50: return "[deep]"
    if isinstance(v, ListNode):
        out, seen = [], set()
        while v is not None and id(v) not in seen and len(out) < 10000:
            seen.add(id(v)); out.append(v.val); v = v.next
        return {"$list": out}
    if isinstance(v, TreeNode):
        out, q = [], collections.deque([v])
        while q and len(out) < 10000:
            n = q.popleft()
            if n is None: out.append(None); continue
            out.append(n.val); q.append(n.left); q.append(n.right)
        while out and out[-1] is None: out.pop()
        return {"$tree": out}
    if isinstance(v, Node):
        seen, stack = {}, [v]
        while stack and len(seen) < 10000:
            n = stack.pop()
            if n.val in seen: continue
            seen[n.val] = n; stack.extend(n.neighbors)
        return {"$graph": [sorted(x.val for x in seen[k].neighbors) for k in sorted(seen)]}
    if isinstance(v, (list, tuple)): return [_encode(x, depth + 1) for x in v]
    if isinstance(v, (set, frozenset)): return [_encode(x, depth + 1) for x in v]
    if isinstance(v, dict): return {str(k): _encode(x, depth + 1) for k, x in v.items()}
    if isinstance(v, float):
        # Sent exactly (repr round-trips); compare.js rounds both sides once.
        # NaN and infinities become null, as JSON.stringify does.
        return None if math.isnan(v) or math.isinf(v) else v
    if isinstance(v, (int, str, bool)) or v is None: return v
    return str(v)

_INJECTED = {"ListNode": ListNode, "TreeNode": TreeNode, "Node": Node, "GraphNode": GraphNode}
_PRELUDE = "import json, sys, time, math, collections, heapq, itertools, functools, bisect, string, re\nfrom typing import *\n"

def _fresh_namespace():
    """Each run gets a clean module namespace: a function deleted or renamed
    since the previous run must not keep passing from stale globals."""
    ns = {"__name__": "__main__"}
    ns.update(_INJECTED)
    exec(_PRELUDE, ns)
    return ns

def _format_error(e):
    import traceback
    frames = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == "<solution>"]
    where = "".join(f"  line {f.lineno}: {f.line}\n" for f in frames[-3:] if f.line)
    return (where + "".join(traceback.format_exception_only(type(e), e))).strip()[:2000]

def load(code, entry):
    """(target, None), or (None, error) when the code does not load or the
    entry is missing. entry=None only runs the code (the playground)."""
    try:
        ns = _fresh_namespace()
        exec(compile(code, "<solution>", "exec"), ns)
    except BaseException as e:
        return None, _format_error(e)
    if entry is None:
        return None, None
    target = ns.get(entry)
    if target is None:
        return None, f"Could not find '{entry}'. Define a function or class with exactly that name."
    return target, None

def run_case(target, args):
    """Runs one case; returns (encoded actual, error or None, milliseconds)."""
    _INPUT_GRAPH_NODES.clear()
    start = time.perf_counter()
    actual, err = None, None
    try:
        args = _decode(json.loads(json.dumps(args)))
        if isinstance(target, type):
            inst, outs = None, []
            for call in args:
                name, *params = call
                if inst is None and name == "__init__":
                    inst = target(*params); outs.append(None); continue
                if inst is None:
                    inst = target()
                outs.append(_encode(getattr(inst, name)(*params)))
            actual = outs
        else:
            raw = target(*args)
            if _shares_graph_nodes(raw):
                raise AssertionError("your clone shares nodes with the original graph; build new Node objects")
            actual = _encode(raw)
    except BaseException as e:
        err = _format_error(e)
    return actual, err, (time.perf_counter() - start) * 1000

def run_all(code, entry, cases_json):
    """The browser's entry point: every case at once, as a JSON string."""
    target, err = load(code, entry)
    if err is not None:
        return json.dumps({"compileError": err})
    results = []
    for args in json.loads(cases_json):
        actual, error, ms = run_case(target, args)
        try:
            json.dumps(actual, allow_nan=False)
        except (TypeError, ValueError) as e:
            actual, error = None, f"the result could not be serialised: {e}"
        results.append({"actual": actual, "error": error, "ms": ms})
    return json.dumps({"results": results})
