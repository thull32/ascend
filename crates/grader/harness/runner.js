// Running learner JavaScript against test cases: the ONE implementation,
// shared by the browser's JavaScript worker (web/src/runner/js.worker.ts,
// V8) and the server's grader (grade_main.js, QuickJS). It builds the node
// classes, decodes each case's arguments, calls the learner's function or
// class, and encodes what came back. It never compares: compare.js does,
// and on the server that happens outside the learner's sandbox. `export`
// keywords are stripped when the server embeds this file, so keep every
// export a plain `export function` or `export const`.

export const PRELUDE = `
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

/** True when a returned graph reuses node objects from the input (not a deep copy). */
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

/** Test arguments to live values: {$list}, {$tree} and {$graph} become nodes. */
export function decode(v) {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === "object") {
    if ("$list" in v) return buildList(v.$list);
    if ("$tree" in v) return buildTree(v.$tree);
    if ("$graph" in v) return buildGraph(v.$graph);
    const out = {};
    for (const k of Object.keys(v)) out[k] = decode(v[k]);
    return out;
  }
  return v;
}

const isList = (v) => !!v && typeof v === "object" && "val" in v && "next" in v && !("left" in v);
const isTree = (v) => !!v && typeof v === "object" && "val" in v && "left" in v && "right" in v;
const isGraph = (v) => !!v && typeof v === "object" && "val" in v && "neighbors" in v;

/** A returned value to plain JSON data: nodes become {$list}/{$tree}/{$graph}. */
export function encode(v, depth = 0) {
  if (depth > 50) return "[deep]";
  if (isList(v)) {
    const out = [];
    const seen = new Set();
    let cur = v;
    while (cur && !seen.has(cur) && out.length < 10000) {
      seen.add(cur);
      out.push(cur.val);
      cur = cur.next;
    }
    return { $list: out };
  }
  if (isTree(v)) {
    const out = [];
    const queue = [v];
    while (queue.length && out.length < 10000) {
      const n = queue.shift();
      if (!n) {
        out.push(null);
        continue;
      }
      out.push(n.val);
      queue.push(n.left, n.right);
    }
    while (out.length && out[out.length - 1] === null) out.pop();
    return { $tree: out };
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
    const out = {};
    for (const k of Object.keys(v)) out[k] = encode(v[k], depth + 1);
    return out;
  }
  if (v === undefined) return null;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number" && !Number.isFinite(v)) return null; // as JSON.stringify does
  return v;
}

export function errorText(e) {
  return (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 2000);
}

/**
 * Loads learner code (already plain JavaScript) with the node classes in
 * scope, and finds `entry` (skipped when null). Returns { target, isClass }
 * or { error } when the code does not load or the entry is missing.
 */
export function load(js, entry, consoleObject) {
  let resolve;
  try {
    // The learner's code runs in an inner scope, so its own `class Node` (an
    // AVL node, say) shadows the provided one instead of being a redefinition
    // error, while code that uses the provided classes still finds them.
    const src = `"use strict";\n${PRELUDE}\nreturn (() => {\n${js}\n;return (name) => { try { return eval(name); } catch { return undefined; } };\n})();`;
    resolve = new Function("console", src)(consoleObject);
  } catch (e) {
    return { error: errorText(e) };
  }
  if (entry == null) return { target: undefined, isClass: false };
  const target = resolve(entry);
  if (target === undefined) return { error: `Could not find \`${entry}\`. Define a function or class with exactly that name.` };
  const isClass = typeof target === "function" && /^class\s/.test(Function.prototype.toString.call(target));
  return { target, isClass };
}

/**
 * Runs one case: a function call with the decoded arguments, or for a class
 * a sequence of [method, ...args] calls ("__init__" constructs). Returns
 * { actual, error }; actual is encoded, error is null on success.
 */
export function runCase(loaded, rawArgs) {
  inputGraphNodes.clear();
  try {
    const args = decode(JSON.parse(JSON.stringify(rawArgs)));
    const { target, isClass } = loaded;
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
      return { actual: outs, error: null };
    }
    const raw = target(...args);
    if (sharesGraphNodes(raw)) throw new Error("your clone shares nodes with the original graph; create new Node objects");
    return { actual: encode(raw), error: null };
  } catch (e) {
    return { actual: null, error: errorText(e) };
  }
}
