/// <reference lib="webworker" />
// Runs learner Python with Pyodide (CPython compiled to WebAssembly) inside a
// Web Worker. Pyodide is ~10 MB and loads from the jsDelivr CDN on first use,
// then is cached by the browser. The harness below mirrors the JS one and the
// Python validator in scripts/validate_problems.py.
import type { RunnerRequest, RunnerResponse, TestResult } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

interface Pyodide {
  runPythonAsync(code: string): Promise<unknown>;
  runPython(code: string): unknown;
  globals: { get(name: string): unknown; set(name: string, v: unknown): void };
  setStdout(opts: { batched: (s: string) => void }): void;
  setStderr(opts: { batched: (s: string) => void }): void;
}

// Pyodide versions track CPython (314.x = Python 3.14).
const PYODIDE_VERSION = "314.0.7";
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

const HARNESS = String.raw`
import json, sys, time, math, collections, heapq, itertools, functools, bisect, string, re
from typing import *

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

def _round6(v):
    # JavaScript's Math.round(v * 1e6) / 1e6, bit for bit (halves towards
    # +infinity on the scaled binary value), then integral values collapse:
    # 0.9999999999999998 -> 1. Python's round() rounds halves to even on the
    # exact binary value, which disagreed with the JavaScript harness and the
    # server at half-way points. One rule everywhere; conformance.json pins it.
    import math
    if math.isnan(v) or math.isinf(v): return None
    if v.is_integer(): return int(v)
    x = v * 1e6
    f = math.floor(x)
    r = (f + 1 if x - f >= 0.5 else f) / 1e6
    return int(r) if r.is_integer() else r

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
        return _round6(v)
    if isinstance(v, (int, str, bool)) or v is None: return v
    return str(v)

def _norm(v):
    v = _encode(v)
    if isinstance(v, dict) and len(v) == 1:
        for tag in ("$list", "$tree", "$graph"):
            if tag in v and v[tag] == []: return None
    if isinstance(v, list): return [_norm(x) for x in v]
    if isinstance(v, dict): return {k: _norm(x) for k, x in sorted(v.items())}
    return v

def _canon(v):
    return json.dumps(_norm(v), sort_keys=True)

def _matches(expected, actual, any_order):
    if any_order and isinstance(expected, list) and isinstance(actual, list):
        return sorted(map(_canon, expected)) == sorted(map(_canon, actual))
    return _canon(expected) == _canon(actual)

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
    return (where + "".join(traceback.format_exception_only(type(e), e))).strip()

def _exec_solution(code):
    ns = _fresh_namespace()
    exec(compile(code, "<solution>", "exec"), ns)
    return ns

def _eval_fresh(code):
    try:
        _exec_solution(code)
        return ""
    except BaseException as e:
        return _format_error(e)

def _run_code_tests(code, entry_name, tests_json):
    try:
        ns = _exec_solution(code)
    except BaseException as e:
        return json.dumps({"compileError": _format_error(e)})
    return _run_tests(ns, entry_name, tests_json)

def _run_tests(ns, entry_name, tests_json):
    tests = json.loads(tests_json)
    target = ns.get(entry_name)
    if target is None:
        return json.dumps({"compileError": f"Could not find '{entry_name}'. Define a function or class with exactly that name."})
    results = []
    for i, t in enumerate(tests):
        start = time.time()
        actual, err = None, None
        _INPUT_GRAPH_NODES.clear()
        try:
            args = _decode(json.loads(json.dumps(t.get("args", []))))
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
        ms = (time.time() - start) * 1000
        results.append({
            "index": i,
            "passed": err is None and _matches(t.get("expected"), actual, bool(t.get("any_order"))),
            "label": t.get("label"), "hidden": bool(t.get("hidden")),
            "args": t.get("args", []), "expected": t.get("expected"), "actual": actual,
            "error": err, "ms": ms,
        })
    return json.dumps({"results": results})
`;

let pyodidePromise: Promise<Pyodide> | null = null;
let stdoutBuf: string[] = [];

async function getPyodide(): Promise<Pyodide> {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      self.postMessage({ id: -1, kind: "status", message: "Loading Python runtime (~10 MB, cached after first use)…" } satisfies RunnerResponse);
      // Module workers cannot use importScripts(); load the ES module build.
      const mod = (await import(/* @vite-ignore */ `${INDEX_URL}pyodide.mjs`)) as { loadPyodide: (opts: { indexURL: string }) => Promise<Pyodide> };
      const py = await mod.loadPyodide({ indexURL: INDEX_URL });
      py.setStdout({ batched: (s) => stdoutBuf.push(s) });
      py.setStderr({ batched: (s) => stdoutBuf.push(s) });
      await py.runPythonAsync(HARNESS);
      self.postMessage({ id: -1, kind: "ready" } satisfies RunnerResponse);
      return py;
    })();
  }
  return pyodidePromise;
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  // Pyodide wraps Python tracebacks; keep the last meaningful lines.
  const lines = msg.split("\n").filter((l) => l.trim() && !l.includes("pyodide") && !l.includes('File "<exec>"'));
  return lines.slice(-6).join("\n");
}

self.onmessage = async (ev: MessageEvent<RunnerRequest>) => {
  const req = ev.data;
  const start = performance.now();
  let py: Pyodide;
  try {
    py = await getPyodide();
  } catch (e) {
    pyodidePromise = null; // allow a retry on the next run
    const res: RunnerResponse =
      req.kind === "run"
        ? { id: req.id, kind: "run", results: [], compileError: `Python runtime failed to load: ${friendlyError(e)}`, totalMs: 0 }
        : { id: req.id, kind: "eval", stdout: "", error: `Python runtime failed to load: ${friendlyError(e)}`, ms: 0 };
    self.postMessage(res);
    return;
  }
  stdoutBuf = [];
  // Load any Pyodide packages the code imports (numpy etc.); stdlib is built in.
  try {
    await (py as unknown as { loadPackagesFromImports(code: string): Promise<void> }).loadPackagesFromImports(req.code);
  } catch {
    /* an unknown import will surface as a normal ImportError */
  }
  if (req.kind === "run") {
    try {
      const run = py.globals.get("_run_code_tests") as (code: string, entry: string, tests: string) => string;
      const parsed = JSON.parse(run(req.code, req.entry, JSON.stringify(req.tests))) as { results?: TestResult[]; compileError?: string };
      const stdout = stdoutBuf.join("").slice(0, 4000);
      const results = (parsed.results ?? []).map((r) => ({ ...r, stdout: stdout || undefined }));
      self.postMessage({ id: req.id, kind: "run", results, compileError: parsed.compileError, totalMs: performance.now() - start } satisfies RunnerResponse);
    } catch (e) {
      self.postMessage({ id: req.id, kind: "run", results: [], compileError: friendlyError(e), totalMs: performance.now() - start } satisfies RunnerResponse);
    }
  } else {
    let error: string | undefined;
    try {
      const evalFresh = py.globals.get("_eval_fresh") as (code: string) => string;
      error = evalFresh(req.code) || undefined;
    } catch (e) {
      error = friendlyError(e);
    }
    self.postMessage({ id: req.id, kind: "eval", stdout: stdoutBuf.join("").slice(0, 20_000), error, ms: performance.now() - start } satisfies RunnerResponse);
  }
};
