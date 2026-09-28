// Server-side grading harness for JavaScript (and TypeScript, which the
// browser strips to JavaScript first), run by QuickJS (WASI) inside the
// grader's WebAssembly sandbox. It mirrors web/src/runner/js.worker.ts: the
// same node classes, argument decoding and result encoding. It never sees
// expected values; the host compares (crates/grader/src/compare.rs).
//
// Input (stdin): {"code": str, "entry": str, "cases": [[arg, ...], ...]}
// Output (stdout): one line per event, each prefixed with RS (\x1e):
//   {"compile_error": str} | {"case": i, "actual": v, "error": str|null, "ms": f} | {"done": true}
"use strict";
const job = JSON.parse(std.in.readAsString());
const out = std.out;
const emit = (event) => {
  out.puts("\x1e" + JSON.stringify(event) + "\n");
  out.flush();
};
// Learner code gets no host modules (there is nothing behind them in the
// sandbox anyway) and no way to print except the captured console.
for (const name of ["std", "os", "bjson", "print"]) delete globalThis[name];

const PRELUDE = `
class ListNode { constructor(val = 0, next = null) { this.val = val; this.next = next; } }
class TreeNode { constructor(val = 0, left = null, right = null) { this.val = val; this.left = left; this.right = right; } }
class Node { constructor(val = 0, neighbors = null) { this.val = val; this.neighbors = neighbors || []; } }
const GraphNode = Node;
`;

function buildList(values) {
  let head = null;
  for (let i = values.length - 1; i >= 0; i--) head = { val: values[i], next: head };
  return head;
}
function buildTree(values) {
  if (values.length === 0 || values[0] === null) return null;
  const root = { val: values[0], left: null, right: null };
  const queue = [root];
  let i = 1;
  while (queue.length && i < values.length) {
    const n = queue.shift();
    if (i < values.length && values[i] !== null) {
      n.left = { val: values[i], left: null, right: null };
      queue.push(n.left);
    }
    i++;
    if (i < values.length && values[i] !== null) {
      n.right = { val: values[i], left: null, right: null };
      queue.push(n.right);
    }
    i++;
  }
  return root;
}
const inputGraphNodes = new Set();
function buildGraph(adj) {
  if (adj.length === 0) return null;
  const nodes = adj.map((_, i) => ({ val: i + 1, neighbors: [] }));
  adj.forEach((nb, i) => {
    nodes[i].neighbors = nb.map((j) => nodes[j - 1]);
  });
  nodes.forEach((n) => inputGraphNodes.add(n));
  return nodes[0];
}
function sharesGraphNodes(v) {
  if (inputGraphNodes.size === 0 || !v || typeof v !== "object" || !("neighbors" in v)) return false;
  const seen = new Set();
  const stack = [v];
  while (stack.length) {
    const n = stack.pop();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    if (inputGraphNodes.has(n)) return true;
    stack.push(...(n.neighbors ?? []));
  }
  return false;
}
function decode(v) {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === "object") {
    if ("$list" in v) return buildList(v.$list);
    if ("$tree" in v) return buildTree(v.$tree);
    if ("$graph" in v) return buildGraph(v.$graph);
    const o = {};
    for (const k of Object.keys(v)) o[k] = decode(v[k]);
    return o;
  }
  return v;
}
const isList = (v) => !!v && typeof v === "object" && "val" in v && "next" in v && !("left" in v);
const isTree = (v) => !!v && typeof v === "object" && "val" in v && "left" in v && "right" in v;
const isGraph = (v) => !!v && typeof v === "object" && "val" in v && "neighbors" in v;
function encode(v, depth = 0) {
  if (depth > 50) return "[deep]";
  if (isList(v)) {
    const o = [];
    const seen = new Set();
    let cur = v;
    while (cur && !seen.has(cur) && o.length < 10000) {
      seen.add(cur);
      o.push(cur.val);
      cur = cur.next;
    }
    return { $list: o };
  }
  if (isTree(v)) {
    const o = [];
    const queue = [v];
    while (queue.length && o.length < 10000) {
      const n = queue.shift();
      if (!n) {
        o.push(null);
        continue;
      }
      o.push(n.val);
      queue.push(n.left, n.right);
    }
    while (o.length && o[o.length - 1] === null) o.pop();
    return { $tree: o };
  }
  if (isGraph(v)) {
    const seen = new Map();
    const stack = [v];
    while (stack.length && seen.size < 10000) {
      const n = stack.pop();
      if (seen.has(n.val)) continue;
      seen.set(n.val, n);
      stack.push(...n.neighbors);
    }
    const keys = [...seen.keys()].sort((a, b) => a - b);
    return { $graph: keys.map((k) => seen.get(k).neighbors.map((x) => x.val).sort((a, b) => a - b)) };
  }
  if (v instanceof Map) return encode(Object.fromEntries(v), depth);
  if (v instanceof Set) return encode([...v], depth);
  if (Array.isArray(v)) return v.map((x) => encode(x, depth + 1));
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v)) o[k] = encode(v[k], depth + 1);
    return o;
  }
  if (v === undefined) return null;
  if (typeof v === "bigint") return Number(v);
  return v;
}

const logs = [];
const fakeConsole = {
  log: (...a) => logs.push(a.map(String).join(" ")),
  error: (...a) => logs.push(a.map(String).join(" ")),
  warn: (...a) => logs.push(a.map(String).join(" ")),
  info: (...a) => logs.push(a.map(String).join(" ")),
  debug: (...a) => logs.push(a.map(String).join(" ")),
};
globalThis.console = fakeConsole;

function errorText(e) {
  return (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 2000);
}

function main() {
  let resolve;
  try {
    const src = `"use strict";\n${PRELUDE}\n${job.code}\n;return (name) => { try { return eval(name); } catch { return undefined; } };`;
    resolve = new Function("console", src)(fakeConsole);
  } catch (e) {
    emit({ compile_error: errorText(e) });
    return;
  }
  const target = resolve(job.entry);
  if (target === undefined) {
    emit({ compile_error: `Could not find \`${job.entry}\`. Define a function or class with exactly that name.` });
    return;
  }
  const isClass = typeof target === "function" && /^class\s/.test(Function.prototype.toString.call(target));
  job.cases.forEach((rawArgs, i) => {
    inputGraphNodes.clear();
    logs.length = 0;
    const start = performance.now();
    let actual = null;
    let error = null;
    try {
      const args = decode(rawArgs);
      if (isClass) {
        let inst = null;
        const outs = [];
        for (const [name, ...params] of args) {
          if (inst === null && name === "__init__") {
            inst = new target(...params);
            outs.push(null);
            continue;
          }
          if (inst === null) inst = new target();
          const m = inst[name];
          if (typeof m !== "function") throw new Error(`method ${name} not found`);
          outs.push(encode(m.apply(inst, params)));
        }
        actual = outs;
      } else {
        const raw = target(...args);
        if (sharesGraphNodes(raw)) throw new Error("your clone shares nodes with the original graph; create new Node objects");
        actual = encode(raw);
      }
    } catch (e) {
      error = errorText(e);
    }
    const ms = performance.now() - start;
    try {
      emit({ case: i, actual, error, ms });
    } catch (e) {
      emit({ case: i, actual: null, error: `the result could not be serialised: ${errorText(e)}`, ms });
    }
  });
  emit({ done: true });
}

main();
