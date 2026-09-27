/// <reference lib="webworker" />
// Executes learner JavaScript/TypeScript inside a Web Worker. The worker has
// no DOM and no network (fetch/XMLHttpRequest are removed below); the main
// thread terminates it if a test exceeds the time limit, so infinite loops
// cannot hang the page.
import { transform } from "sucrase";
import { matches } from "./harness";
import type { RunnerRequest, RunnerResponse, TestResult } from "./protocol";
import type { TestCase } from "../lib/types";

declare const self: DedicatedWorkerGlobalScope;

// Deny network and dangerous globals inside the sandbox.
for (const k of ["fetch", "XMLHttpRequest", "WebSocket", "importScripts", "indexedDB", "caches"]) {
  try {
    Object.defineProperty(self, k, { value: undefined, configurable: false, writable: false });
  } catch {
    /* already locked */
  }
}

const HARNESS_PRELUDE = `
class ListNode { constructor(val = 0, next = null) { this.val = val; this.next = next; } }
class TreeNode { constructor(val = 0, left = null, right = null) { this.val = val; this.left = left; this.right = right; } }
class Node { constructor(val = 0, neighbors = null) { this.val = val; this.neighbors = neighbors || []; } }
const GraphNode = Node;
`;

function buildList(values: unknown[]): unknown {
  let head: unknown = null;
  for (let i = values.length - 1; i >= 0; i--) head = { val: values[i], next: head };
  return head;
}
function buildTree(values: unknown[]): unknown {
  if (values.length === 0 || values[0] === null) return null;
  const root: { val: unknown; left: unknown; right: unknown } = { val: values[0], left: null, right: null };
  const queue = [root];
  let i = 1;
  while (queue.length && i < values.length) {
    const n = queue.shift()!;
    if (i < values.length && values[i] !== null) {
      n.left = { val: values[i], left: null, right: null };
      queue.push(n.left as typeof root);
    }
    i++;
    if (i < values.length && values[i] !== null) {
      n.right = { val: values[i], left: null, right: null };
      queue.push(n.right as typeof root);
    }
    i++;
  }
  return root;
}
const inputGraphNodes = new Set<unknown>();
function buildGraph(adj: number[][]): unknown {
  if (adj.length === 0) return null;
  const nodes = adj.map((_, i) => ({ val: i + 1, neighbors: [] as unknown[] }));
  adj.forEach((nb, i) => {
    nodes[i]!.neighbors = nb.map((j) => nodes[j - 1]);
  });
  nodes.forEach((n) => inputGraphNodes.add(n));
  return nodes[0];
}
/** True when a returned graph reuses node objects from the input (not a deep copy). */
function sharesGraphNodes(v: unknown): boolean {
  if (inputGraphNodes.size === 0 || !v || typeof v !== "object" || !("neighbors" in v)) return false;
  const seen = new Set<unknown>();
  const stack: unknown[] = [v];
  while (stack.length) {
    const n = stack.pop() as { neighbors?: unknown[] };
    if (!n || seen.has(n)) continue;
    seen.add(n);
    if (inputGraphNodes.has(n)) return true;
    stack.push(...(n.neighbors ?? []));
  }
  return false;
}
function decode(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("$list" in o) return buildList(o.$list as unknown[]);
    if ("$tree" in o) return buildTree(o.$tree as unknown[]);
    if ("$graph" in o) return buildGraph(o.$graph as number[][]);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) out[k] = decode(o[k]);
    return out;
  }
  return v;
}
function isList(v: unknown): v is { val: unknown; next: unknown } {
  return !!v && typeof v === "object" && "val" in v && "next" in v && !("left" in v);
}
function isTree(v: unknown): v is { val: unknown; left: unknown; right: unknown } {
  return !!v && typeof v === "object" && "val" in v && "left" in v && "right" in v;
}
function isGraph(v: unknown): v is { val: number; neighbors: unknown[] } {
  return !!v && typeof v === "object" && "val" in v && "neighbors" in v;
}
function encode(v: unknown, depth = 0): unknown {
  if (depth > 50) return "[deep]";
  if (isList(v)) {
    const out: unknown[] = [];
    const seen = new Set<unknown>();
    let cur: unknown = v;
    while (cur && !seen.has(cur) && out.length < 10_000) {
      seen.add(cur);
      out.push((cur as { val: unknown }).val);
      cur = (cur as { next: unknown }).next;
    }
    return { $list: out };
  }
  if (isTree(v)) {
    const out: unknown[] = [];
    const queue: unknown[] = [v];
    while (queue.length && out.length < 10_000) {
      const n = queue.shift();
      if (!n) {
        out.push(null);
        continue;
      }
      const t = n as { val: unknown; left: unknown; right: unknown };
      out.push(t.val);
      queue.push(t.left, t.right);
    }
    while (out.length && out[out.length - 1] === null) out.pop();
    return { $tree: out };
  }
  if (isGraph(v)) {
    const seen = new Map<number, { val: number; neighbors: unknown[] }>();
    const stack: unknown[] = [v];
    while (stack.length && seen.size < 10_000) {
      const n = stack.pop() as { val: number; neighbors: unknown[] };
      if (seen.has(n.val)) continue;
      seen.set(n.val, n);
      stack.push(...n.neighbors);
    }
    const keys = [...seen.keys()].sort((a, b) => a - b);
    return { $graph: keys.map((k) => (seen.get(k)!.neighbors as { val: number }[]).map((x) => x.val).sort((a, b) => a - b)) };
  }
  if (Array.isArray(v)) return v.map((x) => encode(x, depth + 1));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) out[k] = encode((v as Record<string, unknown>)[k], depth + 1);
    return out;
  }
  if (v === undefined) return null;
  return v;
}

function compile(code: string): { fn: (entry: string) => unknown; error?: string } {
  let js = code;
  try {
    js = transform(code, { transforms: ["typescript"], disableESTransforms: true }).code;
  } catch (e) {
    return { fn: () => undefined, error: `Syntax error: ${e instanceof Error ? e.message : String(e)}` };
  }
  // Learner code runs in a function scope; the entry symbol is returned by name.
  const src = `"use strict";\n${HARNESS_PRELUDE}\n${js}\n;return (name) => { try { return eval(name); } catch { return undefined; } };`;
  try {
    const factory = new Function("console", src) as (c: unknown) => (n: string) => unknown;
    const logs: string[] = [];
    const fakeConsole = {
      log: (...a: unknown[]) => logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")),
      error: (...a: unknown[]) => logs.push(a.map(String).join(" ")),
      warn: (...a: unknown[]) => logs.push(a.map(String).join(" ")),
    };
    const resolver = factory(fakeConsole);
    (self as unknown as { __logs: string[] }).__logs = logs;
    return { fn: (name) => resolver(name) };
  } catch (e) {
    return { fn: () => undefined, error: `${e instanceof Error ? e.name : "Error"}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

function runTests(code: string, entry: string, tests: TestCase[]) {
  const { fn, error } = compile(code);
  if (error) return { results: [], compileError: error };
  const target = fn(entry);
  if (target === undefined) return { results: [], compileError: `Could not find \`${entry}\`. Define a function or class with exactly that name.` };
  const results: TestResult[] = [];
  const logs = (self as unknown as { __logs: string[] }).__logs;
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i]!;
    const start = performance.now();
    logs.length = 0;
    inputGraphNodes.clear();
    let actual: unknown;
    let err: string | undefined;
    try {
      const args = decode(JSON.parse(JSON.stringify(t.args))) as unknown[];
      const isClass = typeof target === "function" && /^class\s/.test(Function.prototype.toString.call(target));
      if (isClass) {
        const Cls = target as new (...a: unknown[]) => Record<string, (...a: unknown[]) => unknown>;
        let inst: Record<string, (...a: unknown[]) => unknown> | null = null;
        const outs: unknown[] = [];
        for (const call of args as unknown[][]) {
          const [name, ...params] = call as [string, ...unknown[]];
          if (inst === null && name === "__init__") {
            inst = new Cls(...params);
            outs.push(null);
            continue;
          }
          if (inst === null) inst = new Cls();
          const m = inst[name];
          if (typeof m !== "function") throw new Error(`method ${name} not found`);
          outs.push(encode(m.apply(inst, params)));
        }
        actual = outs;
      } else {
        const raw = (target as (...a: unknown[]) => unknown)(...args);
        if (sharesGraphNodes(raw)) throw new Error("your clone shares nodes with the original graph; create new Node objects");
        actual = encode(raw);
      }
    } catch (e) {
      err = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
    const ms = performance.now() - start;
    results.push({
      index: i,
      passed: !err && matches(t.expected, actual, !!t.any_order),
      label: t.label,
      hidden: !!t.hidden,
      args: t.args,
      expected: t.expected,
      actual,
      error: err,
      stdout: logs.join("\n").slice(0, 4000) || undefined,
      ms,
    });
  }
  return { results };
}

self.onmessage = (ev: MessageEvent<RunnerRequest>) => {
  const req = ev.data;
  const start = performance.now();
  if (req.kind === "run") {
    const { results, compileError } = runTests(req.code, req.entry, req.tests);
    const res: RunnerResponse = { id: req.id, kind: "run", results, compileError, totalMs: performance.now() - start };
    self.postMessage(res);
  } else {
    const { fn, error } = compile(req.code);
    void fn;
    const logs = (self as unknown as { __logs?: string[] }).__logs ?? [];
    const res: RunnerResponse = { id: req.id, kind: "eval", stdout: logs.join("\n"), error, ms: performance.now() - start };
    self.postMessage(res);
  }
};

self.postMessage({ id: -1, kind: "ready" } satisfies RunnerResponse);
