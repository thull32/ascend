/// <reference lib="webworker" />
// Executes learner JavaScript/TypeScript inside a Web Worker. The worker has
// no DOM and no network (fetch/XMLHttpRequest are removed below); the main
// thread terminates it if a test exceeds the time limit, so infinite loops
// cannot hang the page.
//
// Running the code (node classes, argument decoding, result encoding) is the
// same file the server's grader runs in QuickJS: crates/grader/harness/runner.js.
// Comparison is the shared rule too (./harness re-exports compare.js). This
// worker only adds TypeScript stripping, console capture and the protocol.
import { transform } from "sucrase";
import { load, runCase, type Loaded } from "../../../crates/grader/harness/runner.js";
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

const logs: string[] = [];
const fakeConsole = {
  log: (...a: unknown[]) => logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")),
  error: (...a: unknown[]) => logs.push(a.map(String).join(" ")),
  warn: (...a: unknown[]) => logs.push(a.map(String).join(" ")),
  info: (...a: unknown[]) => logs.push(a.map(String).join(" ")),
  debug: (...a: unknown[]) => logs.push(a.map(String).join(" ")),
};

/** TypeScript to JavaScript, then load with the shared runner. */
function compile(code: string, entry: string | null): { loaded?: Loaded; error?: string; js?: string } {
  let js: string;
  try {
    js = transform(code, { transforms: ["typescript"], disableESTransforms: true }).code;
  } catch (e) {
    return { error: `Syntax error: ${e instanceof Error ? e.message : String(e)}` };
  }
  logs.length = 0;
  const result = load(js, entry, fakeConsole);
  if ("error" in result) return { error: result.error, js };
  return { loaded: result, js };
}

function runTests(code: string, entry: string, tests: TestCase[]): { results: TestResult[]; compileError?: string; compiled?: string } {
  const { loaded, error, js } = compile(code, entry);
  if (!loaded) return { results: [], compileError: error };
  const results: TestResult[] = tests.map((t, i) => {
    logs.length = 0;
    const start = performance.now();
    const { actual, error: err } = runCase(loaded, t.args);
    const ms = performance.now() - start;
    return {
      index: i,
      passed: err === null && matches(t.expected, actual, !!t.any_order),
      label: t.label,
      hidden: !!t.hidden,
      args: t.args,
      expected: t.expected,
      actual,
      error: err ?? undefined,
      stdout: logs.join("\n").slice(0, 4000) || undefined,
      ms,
    };
  });
  return { results, compiled: js };
}

self.onmessage = (ev: MessageEvent<RunnerRequest>) => {
  const req = ev.data;
  const start = performance.now();
  if (req.kind === "run") {
    const { results, compileError, compiled } = runTests(req.code, req.entry, req.tests);
    const res: RunnerResponse = { id: req.id, kind: "run", results, compileError, compiled, totalMs: performance.now() - start };
    self.postMessage(res);
  } else {
    const { error } = compile(req.code, null);
    const res: RunnerResponse = { id: req.id, kind: "eval", stdout: logs.join("\n"), error, ms: performance.now() - start };
    self.postMessage(res);
  }
};

self.postMessage({ id: -1, kind: "ready" } satisfies RunnerResponse);
