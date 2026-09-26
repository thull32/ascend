// Main-thread façade over the worker runners. Each run gets a hard wall-clock
// budget; on timeout the worker is terminated and recreated, which is the
// only reliable way to stop a runaway loop in JS or Python.
import type { TestCase } from "../lib/types";
import type { EvalRequest, EvalResponse, RunRequest, RunResponse, RunnerRequest, RunnerResponse } from "./protocol";
import type { Language } from "../components/CodeEditor";

type Listener = (msg: RunnerResponse) => void;

class WorkerHandle {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (r: RunnerResponse) => void; timer: ReturnType<typeof setTimeout> }>();
  private statusListeners = new Set<(message: string) => void>();
  ready = false;

  constructor(private readonly factory: () => Worker) {}

  onStatus(fn: (message: string) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = this.factory();
    w.onmessage = (ev: MessageEvent<RunnerResponse>) => {
      const msg = ev.data;
      if (msg.kind === "ready") {
        this.ready = true;
        this.statusListeners.forEach((l) => l("ready"));
        return;
      }
      if (msg.kind === "status") {
        this.statusListeners.forEach((l) => l(msg.message));
        return;
      }
      const p = this.pending.get(msg.id);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        p.resolve(msg);
      }
    };
    w.onerror = (e) => {
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.resolve({ id, kind: "run", results: [], compileError: `Worker crashed: ${e.message}`, totalMs: 0 });
      }
      this.pending.clear();
      this.reset();
    };
    this.worker = w;
    return w;
  }

  reset() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
  }

  /** Pre-load the runtime so the first "Run" is fast. */
  warm() {
    this.ensure();
  }

  send(req: Omit<RunRequest, "id"> | Omit<EvalRequest, "id">, timeoutMs: number): Promise<RunnerResponse> {
    const id = this.nextId++;
    const w = this.ensure();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.reset();
        resolve(
          req.kind === "run"
            ? { id, kind: "run", results: [], compileError: `Time limit exceeded (${Math.round(timeoutMs / 1000)}s). Check for an infinite loop or a slower-than-expected algorithm.`, totalMs: timeoutMs }
            : { id, kind: "eval", stdout: "", error: `Time limit exceeded (${Math.round(timeoutMs / 1000)}s).`, ms: timeoutMs },
        );
      }, timeoutMs);
      this.pending.set(id, { resolve, timer });
      w.postMessage({ ...req, id } as RunnerRequest);
    });
  }
}

const handles: Partial<Record<"js" | "py", WorkerHandle>> = {};
const listeners = new Set<Listener>();
void listeners;

function handle(language: Language): WorkerHandle {
  if (language === "python") {
    handles.py ??= new WorkerHandle(() => new Worker(new URL("./py.worker.ts", import.meta.url), { type: "module" }));
    return handles.py;
  }
  handles.js ??= new WorkerHandle(() => new Worker(new URL("./js.worker.ts", import.meta.url), { type: "module" }));
  return handles.js;
}

export function warmRunner(language: Language) {
  handle(language).warm();
}

export function onRunnerStatus(language: Language, fn: (message: string) => void) {
  return handle(language).onStatus(fn);
}

export async function runTests(language: Language, code: string, entry: string, tests: TestCase[], timeLimitMs: number): Promise<RunResponse> {
  // Python's first call includes runtime download; give it a generous budget.
  const h = handle(language);
  const budget = language === "python" && !h.ready ? Math.max(timeLimitMs, 90_000) + tests.length * timeLimitMs : timeLimitMs * Math.max(1, tests.length) + 2000;
  const res = await h.send({ kind: "run", code, entry, tests, timeLimitMs }, budget);
  return res as RunResponse;
}

export async function evalCode(language: Language, code: string, timeLimitMs = 10_000): Promise<EvalResponse> {
  const h = handle(language);
  const budget = language === "python" && !h.ready ? 90_000 + timeLimitMs : timeLimitMs;
  const res = await h.send({ kind: "eval", code, timeLimitMs }, budget);
  return res as EvalResponse;
}
