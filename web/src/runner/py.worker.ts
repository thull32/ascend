/// <reference lib="webworker" />
// Runs learner Python with Pyodide (CPython compiled to WebAssembly) inside a
// Web Worker. Pyodide is ~10 MB and loads from the jsDelivr CDN on first use,
// then is cached by the browser. The harness is the same file the server's
// grader runs under CPython for WASI (crates/grader/harness/harness.py), and
// the comparison is the shared rule (./harness re-exports compare.js).
import HARNESS from "../../../crates/grader/harness/harness.py?raw";
import { matches } from "./harness";
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
      const run = py.globals.get("run_all") as (code: string, entry: string, cases: string) => string;
      const parsed = JSON.parse(run(req.code, req.entry, JSON.stringify(req.tests.map((t) => t.args)))) as {
        results?: { actual: unknown; error: string | null; ms: number }[];
        compileError?: string;
      };
      const stdout = stdoutBuf.join("").slice(0, 4000);
      const results: TestResult[] = (parsed.results ?? []).map((r, i) => {
        const t = req.tests[i]!;
        return {
          index: i,
          passed: r.error === null && matches(t.expected, r.actual, !!t.any_order),
          label: t.label,
          hidden: !!t.hidden,
          args: t.args,
          expected: t.expected,
          actual: r.actual,
          error: r.error ?? undefined,
          stdout: stdout || undefined,
          ms: r.ms,
        };
      });
      self.postMessage({ id: req.id, kind: "run", results, compileError: parsed.compileError, totalMs: performance.now() - start } satisfies RunnerResponse);
    } catch (e) {
      self.postMessage({ id: req.id, kind: "run", results: [], compileError: friendlyError(e), totalMs: performance.now() - start } satisfies RunnerResponse);
    }
  } else {
    let error: string | undefined;
    try {
      const load = py.globals.get("load") as (code: string, entry: null) => { toJs(): [unknown, string | null] };
      error = load(req.code, null).toJs()[1] ?? undefined;
    } catch (e) {
      error = friendlyError(e);
    }
    self.postMessage({ id: req.id, kind: "eval", stdout: stdoutBuf.join("").slice(0, 20_000), error, ms: performance.now() - start } satisfies RunnerResponse);
  }
};
