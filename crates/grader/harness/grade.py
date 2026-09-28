# Server-side grading harness for Python, run by CPython (WASI) inside the
# grader's WebAssembly sandbox. It mirrors the browser harness in
# web/src/runner/py.worker.ts: the same node classes, argument decoding and
# result encoding. It never sees expected values: it reports what the
# learner's code returned and the host compares (crates/grader/src/compare.rs),
# so learner code that tampers with this harness gains nothing it could not
# get by returning the values itself.
#
# Input (stdin): {"code": str, "entry": str, "cases": [[arg, ...], ...]}
# Output (stdout): one line per event, each prefixed with RS (\x1e):
#   {"compile_error": str} | {"case": i, "actual": v, "error": str|null, "ms": f} | {"done": true}
import io, json, sys, time, math, collections

_out = sys.stdout
RS = "\x1e"

def _emit(event):
    _out.write(RS + json.dumps(event, allow_nan=False) + "\n")
    _out.flush()

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
    if isinstance(v, (int, str, bool)) or v is None: return v
    if isinstance(v, float):
        if math.isnan(v) or math.isinf(v): return None  # as JSON.stringify does
        r = round(v, 6)
        return int(r) if r.is_integer() else r
    return str(v)

_INJECTED = {"ListNode": ListNode, "TreeNode": TreeNode, "Node": Node, "GraphNode": GraphNode}
_PRELUDE = "import json, sys, time, math, collections, heapq, itertools, functools, bisect, string, re\nfrom typing import *\n"

def _format_error(e):
    import traceback
    frames = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == "<solution>"]
    where = "".join(f"  line {f.lineno}: {f.line}\n" for f in frames[-3:] if f.line)
    return (where + "".join(traceback.format_exception_only(type(e), e))).strip()[:2000]

def _call(target, args):
    if isinstance(target, type):
        inst, outs = None, []
        for call in args:
            name, *params = call
            if inst is None and name == "__init__":
                inst = target(*params); outs.append(None); continue
            if inst is None:
                inst = target()
            outs.append(_encode(getattr(inst, name)(*params)))
        return outs
    raw = target(*args)
    if _shares_graph_nodes(raw):
        raise AssertionError("your clone shares nodes with the original graph; build new Node objects")
    return _encode(raw)

def _main():
    job = json.loads(sys.stdin.read())
    # The learner's prints go nowhere: only the harness writes to stdout.
    sys.stdout = io.StringIO()
    ns = {"__name__": "__main__"}
    ns.update(_INJECTED)
    try:
        exec(_PRELUDE, ns)
        exec(compile(job["code"], "<solution>", "exec"), ns)
    except BaseException as e:
        _emit({"compile_error": _format_error(e)})
        return
    target = ns.get(job["entry"])
    if target is None:
        _emit({"compile_error": f"Could not find '{job['entry']}'. Define a function or class with exactly that name."})
        return
    for i, args in enumerate(job["cases"]):
        _INPUT_GRAPH_NODES.clear()
        sys.stdout = io.StringIO()
        start = time.perf_counter()
        actual, err = None, None
        try:
            actual = _call(target, _decode(args))
        except BaseException as e:
            err = _format_error(e)
        ms = (time.perf_counter() - start) * 1000
        try:
            _emit({"case": i, "actual": actual, "error": err, "ms": ms})
        except (TypeError, ValueError) as e:
            _emit({"case": i, "actual": None, "error": f"the result could not be serialised: {e}", "ms": ms})
    _emit({"done": True})

_main()
