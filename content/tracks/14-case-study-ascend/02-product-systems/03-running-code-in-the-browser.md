---
slug: running-code-in-the-browser
title: "Running code in the browser: workers, Pyodide and trust"
description: How Ascend runs learner JavaScript, TypeScript and Python in Web Workers with time limits enforced by termination, one comparison rule shared by three harnesses, and an explicit trust model instead of a server-side judge.
minutes: 35
difficulty: hard
tags: [case-study, web-workers, webassembly, pyodide, sandboxing, trust-model, testing]
---
Every lesson exercise and every practice problem has a Run button, and learners will press it on code with infinite loops, exponential recursion and accidental `while True`. The textbook answer is a server-side judge: submit code, run it in a sandbox, return results. That answer comes with a sandbox to secure (containers plus gVisor or Firecracker), a queue, an image per language, capacity planning for bursts, and a cost per run, on a product that is free.

Ascend runs the code in the learner's own browser instead. That moves the cost to zero and the latency to milliseconds, and it moves the hard problems somewhere else: stopping code that will not stop, making Python run in a browser at all, keeping three copies of the comparison logic in agreement, and being honest about what a result reported by the client proves. This lesson reads `web/src/runner/*`, `web/src/components/Exercise.tsx`, `crates/core/src/services/submissions.rs` and ADR 0003.

## The decision and its consequences

ADR 0003 records the choice in three lines: run JavaScript/TypeScript and Python (Pyodide, CPython compiled to WebAssembly) in dedicated Web Workers; remove network APIs in the JS worker; enforce a wall-clock budget by terminating the worker; post results to the API, which validates test counts. The alternatives it rejects:

| Option | What you get | What it costs | Why rejected |
|---|---|---|---|
| Server-side sandbox (Judge0-style) | Authoritative results, any language, hidden tests stay secret | Sandbox security, queueing, per-language images, money per run | Not needed for practice; a faked result only cheats the learner |
| JavaScript only | Simplest runner | Excludes Python, the most common interview language | Hurts the core user |
| **Browser workers (chosen)** | Zero marginal cost, instant feedback, works offline after first load | Self-reported results, a ~10 MB Python download, limits enforced by the client | Accepted |

The consequence the ADR states plainly: "Submissions are self-reported. Leaderboards or competitive features would need server-side verification." Keep that sentence in mind; the last section returns to it.

## One protocol, two workers

Both runners speak the same message protocol, so the editor component does not care which language is executing:

```typescript
// web/src/runner/protocol.ts
export interface RunRequest {
  id: number;
  kind: "run";
  code: string;
  entry: string;
  tests: TestCase[];
  timeLimitMs: number;
}

export interface TestResult {
  index: number;
  passed: boolean;
  label?: string | null;
  hidden: boolean;
  args: unknown[];
  expected: unknown;
  actual?: unknown;
  error?: string;
  stdout?: string;
  ms: number;
}
```

Why workers at all? JavaScript in a page runs on one thread, the same thread that paints the UI and handles clicks. A `while (true) {}` on that thread freezes the tab, and nothing on the thread can interrupt it, because an interrupt would need the thread to yield. A dedicated worker is a second thread with no DOM: the learner's loop can spin there while the main thread stays responsive and keeps a clock.

```viz
{"type": "concurrency", "algorithm": "event-loop", "title": "One thread runs everything", "caption": "Callbacks only run when the call stack empties. A learner's infinite loop on the page's thread would never let the timer callback that is supposed to stop it run, which is why the code runs in a worker and the timer lives on the main thread."}
```

[Async and event loops](/learn/systems/concurrency/async-and-event-loops) covers the same constraint on the server side, where blocking a Tokio worker thread starves every other task scheduled on it.

## Time limits by termination

The main-thread façade in `web/src/runner/index.ts` wraps each worker in a `WorkerHandle`. Every request races a timer:

```typescript
// web/src/runner/index.ts — WorkerHandle.send
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
```

`reset()` calls `worker.terminate()` and drops the handle; the next run creates a fresh worker. Termination is the only reliable stop because neither runtime offers preemption from outside ([Processes and threads](/learn/systems/operating-systems/processes-and-threads) covers how the kernel preempts a thread, which neither runtime can do to the code it is running). A JavaScript loop never yields. Python under Pyodide runs synchronously inside WebAssembly on the worker's thread. There is no signal to send and no flag the learner's code will check.

The budget is computed per run, not per test:

```typescript
// web/src/runner/index.ts — runTests
const budget = language === "python" && !h.ready ? Math.max(timeLimitMs, 90_000) + tests.length * timeLimitMs : timeLimitMs * Math.max(1, tests.length) + 2000;
```

Work a real case. A problem with `time_limit_ms: 4000` and 8 tests gets a JavaScript budget of 4,000 × 8 + 2,000 = 34,000 ms. The first Python run, while Pyodide is still loading, gets max(4,000, 90,000) + 8 × 4,000 = 122,000 ms. The UI says "8 tests · 4s limit", but an infinite loop in test 1 is reported after 34 seconds, and on timeout the results of tests that had already passed are lost with the worker.

Trace that timeout from the main thread's side, for JavaScript with the worker already warm:

| Time | Main thread (`WorkerHandle`) | Worker |
|---|---|---|
| 0 ms | `send` assigns id 7, sets a 34,000 ms timer, stores `{resolve, timer}` in `pending`, posts the request | Receives the run; test 1 enters `while (true)` |
| 1–33,999 ms | Paints, scrolls and handles clicks as normal | Spins; any message posted to it waits in its queue |
| 34,000 ms | Timer fires: `pending.delete(7)`, `reset()` calls `terminate()`, the promise resolves with "Time limit exceeded (34s)" and no results | Killed mid-loop; its heap is discarded |
| next Run | `ensure()` constructs a new worker; `reset()` also set `ready = false`, so a Python run gets the cold-start budget again | Starts empty: a JavaScript worker is ready in milliseconds; a Python one finds Pyodide in the browser cache but re-instantiates it for several seconds |

If the worker had answered at 33,999 ms instead, the message handler would have found id 7 in `pending`, cleared the timer and resolved with the results; the `pending` map is what makes "answer or timeout, whichever comes first" exactly-once.

That is a deliberate trade. The worker runs all tests in one synchronous call, so the main thread only gets an answer when all of them finish. Timing each test separately means one message per test; and because a timeout kills the worker, a Python timeout then costs a runtime re-instantiation of several seconds before the next test. Batching makes the common case (code that terminates) fast and the rare case slow.

**The rejected alternative** for Python is an interrupt buffer: Pyodide can poll a `SharedArrayBuffer` that the main thread writes to, which lets you raise `KeyboardInterrupt` without killing the runtime. `SharedArrayBuffer` requires the page to be cross-origin isolated (COOP and COEP headers), which constrains loading third-party resources, including the CDN this app loads Pyodide from. **Failure mode prevented:** a learner's infinite loop hanging the tab or, worse, the phone. **At 100x:** nothing about scale changes this design; what changes is expectations, and per-test timing with a warm spare worker is the upgrade.

## The JavaScript worker: a sandbox by subtraction

The JS worker removes the globals learner code has no business using, then compiles the code with `new Function`:

```typescript
// web/src/runner/js.worker.ts
// Deny network and dangerous globals inside the sandbox.
for (const k of ["fetch", "XMLHttpRequest", "WebSocket", "importScripts", "indexedDB", "caches"]) {
  try {
    Object.defineProperty(self, k, { value: undefined, configurable: false, writable: false });
  } catch {
    /* already locked */
  }
}
```

```typescript
// web/src/runner/js.worker.ts — compile
let js = code;
try {
  js = transform(code, { transforms: ["typescript"], disableESTransforms: true }).code;
} catch (e) {
  return { fn: () => undefined, error: `Syntax error: ${e instanceof Error ? e.message : String(e)}` };
}
// Learner code runs in a function scope; the entry symbol is returned by name.
const src = `"use strict";\n${HARNESS_PRELUDE}\n${js}\n;return (name) => { try { return eval(name); } catch { return undefined; } };`;
```

Sucrase strips TypeScript types without type-checking, which is exactly right for a runner: the learner wants to know whether the code works, and a type error is not a failing test. Each run compiles a fresh function scope, so state from a previous run cannot leak into this one. `console` is replaced with a collector so `console.log` output appears next to each test.

Be honest about what the deleted globals are. They are hygiene, not a security boundary ([Security fundamentals](/learn/senior-craft/software-craft/security-fundamentals) weighs these runners' `unsafe-eval` against its compensating controls): `import()` is syntax and cannot be deleted, and other APIs remain. The real boundaries are elsewhere. The worker has no DOM and cannot read the session cookie, which is `HttpOnly`. The server sends the same Content Security Policy on every response, the worker scripts included, and its `connect-src` allows only the app's own origin plus the CDNs that Pyodide and its packages load from (jsDelivr and PyPI). And the threat model says the code comes from the learner's own editor. The residual risk is social (someone persuades a learner to paste hostile code), and the CSP is what bounds the damage.

## Pyodide: CPython in WebAssembly, and a module-worker incident

The Python worker loads Pyodide lazily from jsDelivr, around 10 MB, cached by the browser after the first use:

```typescript
// web/src/runner/py.worker.ts — getPyodide
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
```

Three patterns are packed in here. The promise is memoised, so two runs that arrive during loading share one download. On failure the message handler sets `pyodidePromise = null`, so a flaky network does not poison the worker forever. And `status` messages flow through the same protocol, which is how the editor shows "Loading Python runtime" instead of a spinner with no explanation. `Exercise.tsx` also calls `warmRunner(language)` when the editor mounts, so the download usually starts before the learner presses Run.

The comment above the `import` is the scar from an incident. Workers are created as module workers, `new Worker(new URL("./py.worker.ts", import.meta.url), { type: "module" })`, which is how Vite bundles workers that use ES imports (the JS worker imports Sucrase and the harness), and both workers are created the same way. Pyodide's classic loading recipe is `importScripts(indexURL + "pyodide.js")`, and module workers do not support `importScripts`: the call throws, and Python never started. The fix was to load Pyodide's ES module build with a dynamic `import()`, with `/* @vite-ignore */` so the bundler leaves the CDN URL alone.

Two lessons generalise. The worker *type* is part of the runtime contract, and the error only shows in a real browser, which is why the Playwright smoke suite has "python runs in the browser via Pyodide" with a 150-second budget for the first download. And notice that the JS worker also deletes `importScripts` from its globals. In a module worker the call would throw anyway, so that line is belt and braces, not a boundary. Knowing which of your defences are load-bearing is part of documenting a sandbox honestly.

### Before and after: stale Python globals

There used to be one behavioural difference between the workers that the code did not advertise. The JS worker compiles each run into a fresh function scope. The Python worker ran every submission with `runPythonAsync(req.code)` in the *same* Pyodide globals, and the harness found the entry point with `globals().get(entry_name)`. Define `two_sum`, run it, rename the function to `twosum`, run again: the stale `two_sum` from the previous run was still defined, and the tests passed against code that was no longer in the editor. The same leak let a helper deleted from the editor keep working, and a module-level counter keep its value between runs. A test that passes against code the learner cannot see is worse than a failing one, because it teaches the wrong thing.

The fix, in `7154e9f`, moved execution into the Python harness itself:

```python
# web/src/runner/py.worker.ts — the Python harness
def _fresh_namespace():
    """Each run gets a clean module namespace: a function deleted or renamed
    since the previous run must not keep passing from stale globals."""
    ns = {"__name__": "__main__"}
    ns.update(_INJECTED)
    exec(_PRELUDE, ns)
    return ns

def _exec_solution(code):
    ns = _fresh_namespace()
    exec(compile(code, "<solution>", "exec"), ns)
    return ns
```

Each run gets a new dictionary pre-loaded with the injected node classes (`ListNode`, `TreeNode`, `Node`, `GraphNode`) and the same prelude of imports, and `_run_tests` looks the entry point up in that dictionary, never in the interpreter's globals. Compiling under the file name `<solution>` pays a second dividend: `_format_error` keeps only the traceback frames from that file, so an exception now points at the line of the learner's code instead of at harness internals.

Why a fresh dictionary rather than a fresh interpreter? Terminating and re-creating the worker would give perfect isolation and cost the several seconds of Pyodide start-up on every run. A new namespace costs microseconds. Be precise about what it does not isolate: the interpreter is still shared, so `sys.modules`, `sys.setrecursionlimit` and any mutation of an imported module (monkey-patching `math`, a cache inside an imported package) survive from one run to the next. For a practice runner that is the right trade; for a judge it would not be.

## The harness: one rule, three implementations

A test passes when the returned value equals the expected value, and "equals" needs a definition that survives two languages and floating point. The runner's rule lives in `web/src/runner/harness.ts`:

```typescript
// web/src/runner/harness.ts
export function normalise(v: unknown): unknown {
  if (v === undefined) return null;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    for (const tag of ["$list", "$tree", "$graph"]) if (tag in o && Array.isArray(o[tag]) && (o[tag] as unknown[]).length === 0) return null;
  }
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "number") return Math.round(v * 1e6) / 1e6;
  if (Array.isArray(v)) return v.map(normalise);
  if (v instanceof Map) return normalise(Object.fromEntries(v));
  if (v instanceof Set) return normalise([...v]);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) out[k] = normalise(o[k]);
    return out;
  }
  return v;
}
```

Integers stay integers, other numbers round to six decimal places so `0.1 + 0.2` equals `0.3`, object keys are sorted so key order does not matter, an empty linked list, tree or graph equals `null`, and `any_order` compares the top-level list as a multiset of canonical strings. The same rule is written a second time in Python inside `py.worker.ts`, where it has to add one thing JavaScript gets for free: `2.0` is a float in Python and must be turned into `2`, or `json.dumps` produces `"2.0"` and a correct answer fails. The harnesses also share structural checks, such as rejecting a "cloned" graph that reuses node objects from the input.

The rule exists a *third* time, in `scripts/validate_problems.py`, which runs every reference solution in CI. Three copies of one rule drift, and these did, in both directions. Until the code-review commit `008eee6`, the validator collapsed whole floats into integers but never rounded the others, so a reference solution returning `0.30000000000000004` against an expected `0.3` failed validation while the same answer passed in the browser. And the Pyodide harness collapsed *before* it rounded, so `0.9999999999999998` was not a whole float, rounded to the float `1.0`, serialised as `"1.0"`, and failed against an expected `1` that JavaScript accepted. Both Python copies now round to six places first and then collapse integral values (the comment says it directly: "0.9999999999999998 -> 1").

Run the three implementations on the same five floats (measured with the TypeScript rule in Node and the two Python rules in CPython):

| Value returned | `harness.ts` | Pyodide harness | `validate_problems.py` |
|---|---|---|---|
| `0.30000000000000004` | `0.3` | `0.3` | `0.3` |
| `2.0` | `2` | `2` | `2` |
| `0.9999999999999998` | `1` | `1` | `1` |
| `0.1234565` | `0.123457` | `0.123456` | `0.123456` |
| `5e-7` | `0.000001` | `0` | `0` |

The first three rows are the fixes working. The last two are the disagreement that remains.

They still disagree at exact half-way points, because the two languages round differently. JavaScript's `Math.round(v * 1e6)` rounds the scaled product half up; Python's `round(v, 6)` rounds the exact binary value of `v`, half to even. So `0.1234565` normalises to `0.123457` in the JavaScript harness and to `0.123456` in the Python harness and the validator, and the same computed answer can pass in one language and fail in the other. Nobody has hit it yet, and no test would notice if they did: the runner has no unit tests. The durable fix is a shared conformance corpus, one JSON file of `(expected, actual, any_order, result)` cases, including half-way values, that the TypeScript harness, the Pyodide harness and the validator all run in their test suites. Three implementations of one rule are acceptable only when a test proves they agree. You will implement the rule itself in the exercise.

## The trust model, stated precisely

When a signed-in learner runs code, `CodeRunner` posts the outcome to `/api/submissions`. The server checks what it can check cheaply:

```rust
// crates/core/src/services/submissions.rs — SubmissionService::record
let expected_total = match input.target_kind.as_str() {
    "problem" => self.curriculum.problem(&input.target_slug).map(|p| p.tests.len()),
    "exercise" => {
        // "lesson-slug#exercise-id"
        let (lesson, ex) = input.target_slug.split_once('#').ok_or(AppError::NotFound("exercise"))?;
        self.curriculum
            .lesson(lesson)
            .and_then(|l| l.exercises.iter().find(|e| e.id == ex).map(|e| e.tests.len()))
    }
    _ => return Err(AppError::validation("target_kind must be problem or exercise")),
}
.ok_or(AppError::NotFound("target"))?;
if input.total_count as usize != expected_total || input.passed_count > input.total_count {
    return Err(AppError::validation("test counts do not match the target"));
}
```

The target must exist, the counts must be consistent with it, and payloads are capped (64 KiB of code, 128 KiB of results). What the server cannot know is whether the tests really passed. It also cannot keep hidden tests secret: they are part of the lesson and problem payloads, expected values included, because the browser has to run them. "Hidden" is a teaching device that stops a learner from coding to the visible examples; it is not access control.

That validation also produced a small surprise. The interview room reuses `CodeRunner` with a target slug of the form `interview:<id>:<problem>`. No problem has that slug, so until commit `7154e9f` the server returned 404 and the editor showed "Could not save this attempt." after every run in an interview. The outcome (interview runs do not count as solved problems) was arguably right, reached by accident with a misleading message. The fix made the intent explicit: `CodeRunner` gained a `persist` prop, the interview room passes `persist={false}`, and the code is kept with the interview instead. Accidental correctness is a bug with good luck.

**What changes if results start to mean something.** The moment there is a leaderboard, a certificate or a streak that others can see, self-reported results become forgeable status. The design then needs a second path, not a replacement: keep client-side runs for instant feedback, and add a "submit for credit" path that re-runs the code server-side in a sandbox against tests that never leave the server, rate-limited per user. Only credited submissions pay the sandbox cost, which keeps the economics of ADR 0003 for everything else. The final module prices that path.

## At 100x

- **CDN dependency.** Python depends on jsDelivr being up and reachable from the learner's network. Self-hosting the Pyodide build under `/assets` with immutable caching removes a third party from the critical path (and from the CSP), at the cost of a larger image and bandwidth.
- **Low-end phones.** A Pyodide instance costs tens of megabytes of memory, and a terminated worker must re-instantiate. Keeping one warm spare worker would hide the restart after a timeout.
- **Conformance.** The shared harness corpus described above, run by all three implementations.
- **One rounding rule.** Pick a single half-way rule (for example, decimal half-even in both languages) and pin it in the conformance corpus, so a correct answer cannot pass in JavaScript and fail in Python.

## Failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| An infinite loop in test 1 | "Time limit exceeded (34s)" after half a minute, and no results for the tests that passed | One budget for the batch; the timeout discards the worker and every result in it | Per-test timing with a warm spare worker, if the wait starts to matter |
| jsDelivr unreachable from a school network | Python never leaves "Loading Python runtime"; JavaScript works | The `pyodide.mjs` request fails in DevTools; `pyodidePromise` resets so a retry can succeed | Self-host the Pyodide build under `/assets` |
| A worker created as a classic worker, or Pyodide loaded with `importScripts` in a module worker | Python fails to start in every browser | The error appears only in a real browser; the smoke test fails | Match the loader to the worker type (in place: the ES module build) |
| The three comparison rules drift | An answer passes in JavaScript and fails in Python, or the reference solution fails CI but passes in the browser | Run the value through each rule, as in the table above | One conformance corpus that all three test suites run |
| Stale interpreter state | Tests pass against a function no longer in the editor | Every run shared one set of globals | A fresh namespace per run (in place); a fresh worker if module state must reset too |

## Interviewer follow-ups

**"Why not run submissions on the server like a real judge?"** Model answer: for practice, the result only matters to the learner, so a server judge buys authority nobody needs and costs a sandbox to secure, a queue, an image per language and money per run on a free product. The browser gives zero marginal cost and millisecond feedback. ADR 0003 writes down the price, self-reported results and readable hidden tests, and the trigger to revisit it, any feature that confers status. Common wrong answer: "browsers are fast enough now", which is true and beside the point; the decision is about trust and cost.

**"How do you stop a learner's infinite loop?"** Model answer: you cannot ask synchronous code to stop, because it never yields to check a flag or read a message; you run it on a thread you can kill. The main thread keeps a timer per request and terminates the worker when it fires; Pyodide's interrupt buffer would avoid the restart but needs `SharedArrayBuffer`, which needs cross-origin isolation that the CDN loading rules out. Common wrong answer: "wrap it in a try/catch with a timeout", which never runs while the loop holds the thread.

**"Is deleting `fetch` from the worker a sandbox?"** Model answer: no, it is hygiene. `import()` is syntax and cannot be deleted, and other APIs remain. The boundaries are that the worker has no DOM, the session cookie is `HttpOnly`, and the CSP's `connect-src` limits where any request can go; the threat model is the learner's own code. Common wrong answer: "yes, it has no network access", which a single dynamic import disproves.

**"What changes if you add a public leaderboard?"** Model answer: self-reported results become forgeable status, so add a second path rather than replace the first: keep browser runs for feedback, and re-run only "submit for credit" submissions in a server sandbox against tests that never leave the server, rate-limited per user. Common wrong answer: "encrypt the hidden tests", which the browser must decrypt to run.

## What mid-level engineers get wrong

- **Running untrusted code on the page's own thread.** An infinite loop freezes the tab, and the timer meant to stop it never fires.
- **Trying to interrupt synchronous code cooperatively.** Only terminating its thread stops it.
- **Calling deleted globals a sandbox.** The real boundaries are the missing DOM, `HttpOnly` cookies and the CSP.
- **Reusing one interpreter's globals across runs.** Deleted and renamed functions keep passing.
- **Keeping several copies of one comparison rule without a shared test.** They drift at the edges: half-way rounding and tiny values here.
- **Treating "hidden" tests as secret.** They ship to the browser that runs them.

## Exercise

```exercise
id: runner-same-result
title: Implement the runner's comparison rule
prompt: |
  Implement `same_result(expected, actual, any_order)`, the rule the runner uses
  to decide whether a test passed. Two values are the same when their canonical
  forms are equal:

  - A number with no fractional part is an integer, so `2.0` and `2` are the same.
  - Any other number is rounded to 6 decimal places before comparing.
  - Object (dict) keys are compared regardless of order.
  - Booleans are not numbers: `true` is not the same as `1`.
  - Lists keep their order, unless `any_order` is true and both values are lists,
    in which case the two top-level lists must contain the same canonical
    elements with the same counts, in any order.

  Return `true` or `false`.
languages: [python, javascript]
entry: same_result
starter:
  python: |
    import json

    def same_result(expected, actual, any_order):
        # your code here
        return expected == actual
  javascript: |
    function same_result(expected, actual, any_order) {
      // your code here
      return expected === actual;
    }
tests:
  - args: [[0, 1], [1, 0], false]
    expected: false
    label: order matters by default
  - args: [[0, 1], [1, 0], true]
    expected: true
    label: any_order compares as a multiset
  - args: [0.3, 0.30000000000000004, false]
    expected: true
    label: floating-point noise
  - args: [{"a": 1, "b": [1, 2]}, {"b": [1, 2], "a": 1}, false]
    expected: true
    label: key order does not matter
  - args: [[[1, 2], [3]], [[3], [1, 2]], true]
    expected: true
    label: elements are compared by canonical form
  - args: [[1, 1, 2], [1, 2, 2], true]
    expected: false
    hidden: true
    label: a multiset, not a set
  - args: [2, 2.0, false]
    expected: true
    hidden: true
    label: whole floats are integers
  - args: [true, 1, false]
    expected: false
    hidden: true
    label: booleans are not numbers
hints:
  - "Write a normalise function first, then compare canonical strings: JSON with sorted keys."
  - "In Python, check for bool before int, because True is an instance of int; and turn floats with is_integer() into int."
  - "For any_order, map each element to its canonical string, sort both lists of strings, and compare."
```

## Senior signals

- You choose where code runs by **who bears the cost and who needs to trust the result**, and you write the trust model down (ADR 0003 does).
- You know that the only reliable way to stop synchronous code you do not control is to kill the thread or process it runs in, and you design the budget and restart cost around that.
- You treat multiple implementations of one rule as a drift risk, look for the exact inputs where they differ (half-way rounding), and demand a shared conformance test.
- You can say what "hidden tests" protect against (overfitting to examples) and what they do not (a curious learner reading the payload).
- You separate hygiene (deleting globals) from boundaries (no DOM, `HttpOnly` cookies, CSP `connect-src`) when describing a sandbox.
- You name the upgrade path for competitive features (server re-run for credit only) instead of either rebuilding everything or pretending it is not needed.

## Check yourself

```quiz
- q: >-
    Why does the runner enforce time limits by terminating the worker instead of asking the learner's code to stop?
  options: ["Browsers already stop every worker after ten seconds, so the limit is enforced anyway", "Synchronous code never yields, so it can neither check a flag nor receive a message", "Terminating a worker is faster than posting a stop message to it and waiting", "Workers cannot receive any messages at all once they have started running a learner's code"]
  answer: 1
  explanation: >-
    A worker can only process an incoming message when its current task returns to the event loop, which an infinite loop never does. Workers can receive messages in general, but only between tasks, never in the middle of a synchronous one. Pyodide's interrupt buffer is the exception, and it needs SharedArrayBuffer and a cross-origin isolated page, which this app does not have.
- q: >-
    A problem has time_limit_ms 4000 and 8 tests. A learner's JavaScript has an infinite loop in the first test. When is the timeout reported?
  options: ["Never, because the loop freezes the tab before any timer can fire", "After 8 seconds, because the budget scales with how many tests there are", "After 4 seconds, because each test gets its own four-second limit", "After 34 seconds, because one budget covers the whole batch of tests"]
  answer: 3
  explanation: >-
    The budget is timeLimitMs times the number of tests plus 2,000 ms, because all tests run in one call and the main thread only hears back when the batch ends. The timer lives on the main thread, so the tab never freezes. Per-test timing would report sooner but would cost a runtime restart per timeout, which is expensive for Python.
- q: >-
    Before a recent fix, a learner could define two_sum in Python, run it, rename it to twosum, and still pass. Why, and what changed?
  options: ["The browser cached earlier results; results are now keyed by a hash of the code", "localStorage restored the old code; the editor now clears it before each run", "Pyodide kept one global namespace; each run now executes in a fresh dict", "The harness matched entry names loosely; it now demands an exact name match"]
  answer: 2
  explanation: >-
    Every run used to execute in the same interpreter globals, so the old definition was still there when the harness looked up the entry name. Now _exec_solution runs the code in a new namespace, and the entry is looked up there. The interpreter itself is still shared, so sys.modules and module-level state in imported packages survive.
- q: >-
    Pyodide failed to load after the runner switched to Vite-bundled workers. What was the cause?
  options: ["The pinned Pyodide version did not yet support the Python 3.14 syntax", "Module workers have no importScripts, which the classic Pyodide loader calls", "The CSP forbade WebAssembly compilation inside the worker's own execution context", "jsDelivr rate-limited the request, so the runtime download timed out"]
  answer: 1
  explanation: >-
    Module workers have ES module semantics and no importScripts, so the classic loader threw. The fix was a dynamic import of Pyodide's ES module build. The CSP does allow wasm-unsafe-eval and jsDelivr, and the comment in py.worker.ts records the actual fix.
- q: >-
    A product manager proposes a public weekly leaderboard of problems solved. What is the minimum honest change to the execution design?
  options: ["None, since the server already validates each submission's test counts", "Move all code execution to the server so every run is judged centrally", "Encrypt the hidden tests in the lesson payload so learners cannot read them", "Re-run only credited submissions server-side, against tests that stay secret there"]
  answer: 3
  explanation: >-
    Count validation only checks consistency; any client can post passed_count equal to total_count. Moving everything server-side throws away the economics that justified ADR 0003, and encrypting tests the browser must decrypt to run protects nothing. Keeping browser runs for feedback and verifying only what confers status is the proportionate fix.
- q: >-
    A learner's function returns 0.1234565 for a test that expects 0.123457. In which runner does the test pass?
  options: ["In Python only, because round() keeps more precision than JavaScript does", "In both runners, because each rounds to six decimal places before comparing", "In neither runner, because a float is always compared bit for bit", "In JavaScript only, because Math.round rounds the scaled product half up"]
  answer: 3
  explanation: >-
    Both rules round to six places, but differently at a half-way point. JavaScript's Math.round(v * 1e6) rounds the scaled product half up, giving 0.123457; Python's round(v, 6) rounds the exact binary value half to even, giving 0.123456, and so does the validator. Nothing compares floats bit for bit; the fix is one rounding rule pinned by a shared conformance corpus.
```
