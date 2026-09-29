---
slug: running-code-in-the-browser
title: "Running code in the browser: workers, Pyodide and trust"
description: How Ascend runs learner JavaScript, TypeScript and Python in Web Workers with time limits enforced by termination, keeps one comparison rule in four implementations, and moved from self-reported results to a WebAssembly grader on the server.
minutes: 35
difficulty: hard
tags: [case-study, web-workers, webassembly, pyodide, sandboxing, trust-model, testing]
---
Every lesson exercise and every practice problem has a Run button, and learners will press it on code with infinite loops, exponential recursion and accidental `while True`. The textbook answer is a server-side judge: submit code, run it in a sandbox, return results. That answer comes with a sandbox to secure (containers plus gVisor or Firecracker), a queue, an image per language, capacity planning for bursts, and a cost per run, on a product that is free.

Ascend runs the code in the learner's own browser instead. That moves the cost to zero and the latency to milliseconds, and it moves the hard problems somewhere else: stopping code that will not stop, making Python run in a browser at all, and keeping several copies of the comparison logic in agreement. It also raises a question the first design answered with "nobody": what does a result reported by the client prove? Since ADR 0005 the answer is a second run, on the server, in a WebAssembly sandbox. This lesson reads `web/src/runner/*`, `web/src/components/Exercise.tsx`, `crates/core/src/services/submissions.rs`, `crates/grader` and ADRs 0003 and 0005.

## The decision and its consequences

ADR 0003 records the choice in three lines: run JavaScript/TypeScript and Python (Pyodide, CPython compiled to WebAssembly) in dedicated Web Workers; remove network APIs in the JS worker; enforce a wall-clock budget by terminating the worker; post results to the API, which validates test counts. The alternatives it rejects:

| Option | What you get | What it costs | Why rejected |
|---|---|---|---|
| Server-side sandbox (Judge0-style) | Authoritative results, any language, hidden tests stay secret | Sandbox security, queueing, per-language images, money per run | Not needed for practice; a faked result only cheats the learner |
| JavaScript only | Simplest runner | Excludes Python, the most common interview language | Hurts the core user |
| **Browser workers (chosen)** | Zero marginal cost, instant feedback, works offline after first load | Self-reported results, a ~10 MB Python download, limits enforced by the client | Accepted |

The consequence the ADR states plainly: "Submissions are self-reported. Leaderboards or competitive features would need server-side verification." Keep that sentence in mind: ADR 0003 is now marked "amended by 0005", and the trust-model section tells why the trigger arrived before any leaderboard did.

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

Be honest about what the deleted globals are. They are hygiene, not a security boundary ([Security fundamentals](/learn/senior-craft/software-craft/security-fundamentals) weighs these runners' `unsafe-eval` against its compensating controls): `import()` is syntax and cannot be deleted, and other APIs remain. The real boundaries are elsewhere. The worker has no DOM and cannot read the session cookie, which is `HttpOnly`. The Content Security Policy on every response, worker scripts included, has a `connect-src` of only the app's own origin plus the CDNs Pyodide and its packages load from (jsDelivr and PyPI). And the threat model says the code comes from the learner's own editor. The residual risk is social (someone persuades a learner to paste hostile code), and the CSP is what bounds the damage.

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

There used to be one behavioural difference between the workers that the code did not advertise. The JS worker compiles each run into a fresh function scope. The Python worker ran every submission with `runPythonAsync(req.code)` in the *same* Pyodide globals, and the harness found the entry point with `globals().get(entry_name)`. Define `two_sum`, run it, rename the function to `twosum`, run again: the stale `two_sum` was still defined, and the tests passed against code no longer in the editor. The same leak kept deleted helpers working and module-level counters counting. A test that passes against code the learner cannot see is worse than a failing one, because it teaches the wrong thing.

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

Why a fresh dictionary rather than a fresh interpreter? Terminating and re-creating the worker would give perfect isolation and cost the several seconds of Pyodide start-up on every run. A new namespace costs microseconds. Be precise about what it does not isolate: the interpreter is still shared, so `sys.modules`, `sys.setrecursionlimit` and any mutation of an imported module (monkey-patching `math`, a cache inside an imported package) survive from one run to the next. For a practice runner that is the right trade; the server's grader, whose verdict counts, pays for a fresh WebAssembly instance per run instead.

## The harness: one rule, four implementations

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

Run the implementations on the same five floats, before and after the rounding fix described next (measured with the TypeScript rule in Node and the Python rules in CPython):

| Value returned | `harness.ts` and the server's `compare.rs` | Python copies, before | Every copy, after |
|---|---|---|---|
| `0.30000000000000004` | `0.3` | `0.3` | `0.3` |
| `2.0` | `2` | `2` | `2` |
| `0.9999999999999998` | `1` | `1` | `1` |
| `0.1234565` | `0.123457` | `0.123456` | `0.123457` |
| `5e-7` | `0.000001` | `0` | `0.000001` |

The first three rows are the earlier fixes working. The last two are a disagreement that survived them: at exact half-way points the two languages round differently. JavaScript's `Math.round(v * 1e6)` rounds the scaled product half up; Python's `round(v, 6)` rounds the exact binary value of `v`, half to even. So `0.1234565` normalised to `0.123457` in the JavaScript harness and to `0.123456` in the Python harness and the validator, and the same computed answer could pass in one language and fail in the other.

Server grading added a fourth copy, `crates/grader/src/compare.rs`, a Rust port of `harness.ts`, and made the split matter. The sandboxed `grade.py` rounded Python results with `round()` first, as the Pyodide harness did, but the host normalised *expected* values with the JavaScript rule, so a Python function returning exactly the expected `0.1234565` passed in Pyodide (both sides `0.123456`) and failed on the server (`0.123456` against `0.123457`): a correct answer recorded as wrong. A review of this lesson found it. No test could have, because nothing ran one set of cases through all four rules and `web/src/runner` had no unit tests.

The fix has three parts:

1. **One rule.** JavaScript's, because the browser's JavaScript harness and the server already used it. The Python copies now implement `Math.round` bit for bit: take `f = floor(x)` and add one when `x - f >= 0.5`. That subtraction is exact, whereas the tempting `floor(x + 0.5)` rounds `0.49999999999999994 + 0.5` up to `1.0` and returns 1 where `Math.round` returns 0; the Rust port switched to the same form.
2. **One place to round on the server.** `grade.py` now sends each float exactly as computed (Python's `repr` round-trips), and only the host rounds, once, for expected and actual alike.
3. **One corpus.** `crates/grader/conformance.json` holds 34 `(expected, actual, any_order, match)` cases, half-way values included, and every implementation's tests run it: `cargo test` for the Rust copy, a Vitest file for `harness.ts`, and `scripts/check_conformance.py` for both Python copies (it extracts the Pyodide harness from `py.worker.ts` and executes it). The old Python rule fails the corpus, which is the point.

Several implementations of one rule are acceptable only when a test proves they agree. You will implement the rule itself in the exercise.

## The trust model, before and after

### Before: results the server could not check

Until commit `25fd477`, a signed-in run ended with `CodeRunner` posting the browser's outcome (`passed_count`, `total_count`, per-test results) to `/api/submissions`, and the server checked what it could check cheaply:

```rust
// crates/core/src/services/submissions.rs — SubmissionService::record, before 25fd477
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

The target had to exist, the counts had to be consistent with it, and payloads were capped (64 KiB of code, 128 KiB of results). What the server could not know is whether the tests really passed: one `POST` with `passed_count` equal to `total_count` marked any problem solved, and XP and progress were built on that.

That validation also produced a small surprise. The interview room reuses `CodeRunner` with a target slug of the form `interview:<id>:<problem>`, which matches no problem, so until commit `7154e9f` every run in an interview ended with "Could not save this attempt." The outcome (interview runs do not count as solved problems) was arguably right, reached by accident with a misleading message. The fix made the intent explicit: `CodeRunner` gained a `persist` prop, and the interview room passes `persist={false}`. Accidental correctness is a bug with good luck.

### Why it changed before any leaderboard

The first version of this lesson named ADR 0003's trigger, a leaderboard, and proposed a "submit for credit" path for it. The trigger that arrived first was internal. "Solved" feeds XP, the dashboard, the roadmap and the coach's context, and ADR 0005 puts it plainly: "a number the server cannot vouch for is a liability, and the fix only gets harder as the numbers are used more widely." And the sandbox the review had priced, containers under gVisor or Firecracker, needs privileges or nested virtualisation the platform does not offer; WebAssembly needs neither.

### After: the server grades, in WebAssembly

The browser still runs the code for instant feedback. When a signed-in learner's browser run ends without a compile error or a timeout, `CodeRunner` also posts the code (for TypeScript, plus the Sucrase-stripped JavaScript as `compiled`) and the server grades it in `crates/grader` and stores only its own verdict. The response carries a verdict per test and any compile error, and the editor says when the two disagree: "Saved, but the server's check passed 7 / 8. Test 8 failed there: ...". Trusting `compiled` costs nothing: a learner who sends JavaScript unrelated to their TypeScript could have submitted it as JavaScript anyway.

This sandbox is built the opposite way from the worker's. CPython 3.14.7 and QuickJS-ng 0.17.0, both compiled to WASI, run under Wasmtime 49 with Cranelift, pinned by SHA-256 in `scripts/grader-runtimes.sh`. A WASI guest can reach only what the host grants, and the grader grants stdin (the job as JSON), capped stdout and stderr pipes (8 MiB and 64 KiB) and, for Python, a read-only standard library preopened at `/lib`; each run gets a fresh instance. `the_sandbox_has_no_files_network_environment_or_processes` probes `/etc/passwd`, a write to `/lib`, `os.environ`, a socket and `subprocess` from Python, and `fetch`, `std`, `os` and `require` from JavaScript, and expects each to be absent or blocked.

| Resource | Bound | Mechanism |
|---|---|---|
| CPU | Per-test limit × tests, plus 3 s (Python) or 1 s (JavaScript) of start-up | Epoch interruption: a thread advances the engine's epoch every 10 ms, and a store past its deadline traps at its next check |
| Memory | 256 MiB of linear memory | `StoreLimits` on the store |
| Stack | 8 MiB of wasm stack | `max_wasm_stack`, on a dedicated 16 MiB thread per run |
| Concurrency | Half the cores, 1 to 4 runs at once | A semaphore; no slot within 20 s answers 503 with `Retry-After: 5` |
| Volume | 20 graded submissions a minute per session | The shared rate limiter |

The stack row has a story. Guest code runs on the calling thread's native stack, and Wasmtime's documentation warns that `max_wasm_stack` "does not ensure that this much stack space is available on the calling thread stack". Tokio's worker threads default to 2 MiB; in the first test run a deep recursion overflowed one and aborted the whole process, every other request with it. Each run now gets its own 16 MiB thread, cheap next to a run, and `recursion_as_deep_as_the_tests_need_works` recurses 900 deep, then a million deep, and asserts the grader survives both.

**Comparison happens on the host.** The harness inside the sandbox (`crates/grader/harness/grade.py`, `grade.js`) calls the learner's function on each case and prints one line per case, prefixed with the ASCII record separator, saying what it returned; `crates/grader/src/compare.rs` compares that with the expected value outside. Expected values never enter the sandbox, so code that tampers with the harness can only claim return values it could have returned anyway. The host keeps the last report per case and the harness reports after each call returns, so a line forged during the call is overwritten (`forged_harness_lines_do_not_override_real_results`). And because results stream one line per case, a timeout keeps the cases that finished, which the browser, killing its worker, cannot.

Trace `an_infinite_loop_stops_at_the_budget_and_keeps_earlier_results` for Python: `def f(x): while x: pass; return 1`, cases `[0]`, `[1]`, `[0]`, a 200 ms per-test limit.

1. The budget is 200 ms × 3 + 3 s of start-up = 3.6 s, or 360 epoch ticks; `set_epoch_deadline(360)` and `epoch_deadline_trap()` arm the store.
2. Case 0 returns 1 at once, and the harness prints its line.
3. Case 1 spins. After the 360th tick, the guest's next epoch check traps with `Trap::Interrupt`, and the run stops as `Stop::TimeLimit`.
4. Case 2 never runs. Case 0 is compared with its expected value; cases 1 and 2 fail with "Time limit exceeded (3.6 s for all tests). Check for an infinite loop or a slower-than-expected algorithm."

`submissions_are_graded_on_the_server` posts `a - b` for the `add-two` problem with a claimed `passed_count` of 2 and gets back 0 of 2 with nothing solved, then the right code and 2 of 2; the end-to-end test "a solve is graded on the server, and a claimed result is not trusted" does the same in a real browser.

**What it costs**, measured on the development machine: Python start-up about 0.09 s with the standard library precompiled at image build (`ascend-api --prepare-grader`), 0.24 s without; QuickJS about 0.02 s; compiling both runtimes at boot about 0.4 s on 32 cores; all 180 reference solutions graded in about 9 s by `grading_parity`, which CI runs. The image grows by about 55 MB. ADR 0005 names the rest: QuickJS is an interpreter, so tight loops run several times slower than in V8; server Python has only the standard library; and hidden tests still ship in the page and the public repository, so they are still not secret.

## At 100x

- **CDN dependency.** Python depends on jsDelivr being reachable from the learner's network. Self-hosting the Pyodide build under `/assets` with immutable caching removes a third party from the critical path and the CSP, at the cost of image size and bandwidth.
- **Low-end phones.** A Pyodide instance costs tens of megabytes, and a terminated worker must re-instantiate; one warm spare worker would hide the restart.
- **Grading capacity.** Each replica grades at most four runs at once, and each slot holds a core for up to its budget. ADR 0005's trigger for revisiting is load beyond a few cores: move grading to its own service behind the same `Grader` interface.
- **Four copies of one rule.** The corpus proves the copies agree but does not remove them; every change to the rule is four edits. Generating the Python and Rust copies from one definition, or grading in the browser with the same WebAssembly harnesses the server runs, would leave one.

## Failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| An infinite loop in test 1 | "Time limit exceeded (34s)" after half a minute, and no browser results for the tests that passed | One budget for the batch; the timeout discards the worker and every result in it | Per-test timing with a warm spare worker, if the wait starts to matter |
| jsDelivr unreachable from a school network | Python never leaves "Loading Python runtime"; JavaScript works | The `pyodide.mjs` request fails in DevTools; `pyodidePromise` resets so a retry can succeed | Self-host the Pyodide build under `/assets` |
| Pyodide loaded with `importScripts` in a module worker | Python fails to start in every browser | Only a real browser shows it; the smoke test fails | Match the loader to the worker type (in place: the ES module build) |
| The comparison rules drift | An answer passes in one language, or in the browser, and fails elsewhere | Run the value through each rule, as in the table above | One conformance corpus that every implementation runs |
| Stale interpreter state | Tests pass against a function no longer in the editor | Every run shared one set of globals | A fresh namespace per run (in place); a fresh worker if module state must reset too |
| The server times out where the browser passed | "Saved, but the server's check passed ..." with a time limit | QuickJS interprets where V8 compiles | Small test inputs (CI grades every reference solution); a higher `time_limit_ms` |
| Every grading slot busy | "The server's check is busy ..." | 503 with `Retry-After: 5` after 20 s without a slot | More replicas, or a grading service |

## Interviewer follow-ups

**"Why run the code twice, in the browser and on the server?"** Model answer: the runs answer different questions. The browser gives instant feedback at zero marginal cost; the server gives a result the product can build on, because "solved" feeds XP, progress, the roadmap and the coach. Server execution is affordable because a WebAssembly instance starts in about a tenth of a second, needs no privileges and reaches only what the host grants, and the expected values stay outside it. Common wrong answer: "sign the browser's result", but anything the browser can sign, a learner can sign.

**"How do you stop a learner's infinite loop?"** Model answer: you cannot ask synchronous code to stop, because it never yields to check a flag or read a message; you run it on a thread you can kill. The main thread keeps a timer per request and terminates the worker when it fires; Pyodide's interrupt buffer would avoid the restart but needs `SharedArrayBuffer`, which needs cross-origin isolation that the CDN loading rules out. On the server the engine does the stopping: compiled code checks an epoch counter and traps past its deadline. Common wrong answer: "wrap it in a try/catch with a timeout", which never runs while the loop holds the thread.

**"Is deleting `fetch` from the worker a sandbox?"** Model answer: no, it is hygiene. `import()` is syntax and cannot be deleted, and other APIs remain. The boundaries are that the worker has no DOM, the session cookie is `HttpOnly`, and the CSP's `connect-src` limits where any request can go; the threat model is the learner's own code. The server's sandbox is built the other way round: a WASI guest starts with nothing and is granted stdin, two capped pipes and a read-only library. Common wrong answer: "yes, it has no network access", which a single dynamic import disproves.

**"What changes if you add a public leaderboard?"** Model answer: the verdicts are already the server's, so a leaderboard can count them. What it adds is secrecy: hidden tests ship in the page and live in the public repository, so contest problems need tests that never leave the server, graded by the same `Grader`. Common wrong answer: "encrypt the hidden tests", which the browser must decrypt to run.

## What mid-level engineers get wrong

- **Running untrusted code on the page's own thread.** An infinite loop freezes the tab, and the timer meant to stop it never fires.
- **Trying to interrupt synchronous code cooperatively.** Only terminating its thread, or an engine that checks a deadline, stops it.
- **Calling deleted globals a sandbox.** The real boundaries are the missing DOM, `HttpOnly` cookies and the CSP.
- **Recording a result the client reports.** Until the server graded the code, one `POST` with the right counts marked any problem solved.
- **Running guest code on a thread with a small stack.** A deep recursion overflows it and aborts the whole process.
- **Keeping several copies of one comparison rule without a shared test.** They drift at the edges: half-way rounding and tiny values here, until a server copy turned the drift into correct answers recorded as wrong.
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

- You choose where code runs by **who bears the cost and who needs to trust the result**, write the trust model down (ADR 0003 did), and record when the answer changes (ADR 0005).
- You know that the only reliable way to stop synchronous code you do not control is to kill the thread or process it runs in, and you design the budget and restart cost around that.
- You treat multiple implementations of one rule as a drift risk, look for the exact inputs where they differ (half-way rounding), and pin them with a shared conformance corpus that every copy's tests run.
- You can say what "hidden tests" protect against (overfitting to examples) and what they do not (a curious learner reading the payload).
- You separate hygiene (deleting globals) from boundaries (no DOM, `HttpOnly` cookies, CSP `connect-src`) when describing a sandbox.
- You build a server sandbox by granting capabilities, not deleting them, keep the expected values outside it, and bound CPU, memory, stack, concurrency and volume separately.

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
    A script posts to /api/submissions with passed_count equal to total_count and code that returns wrong answers. What does the server record today?
  options: ["A 422, because the claimed counts disagree with the browser's signature", "A solved problem at first, until a nightly job re-grades the code", "A failed attempt, because it grades the code itself and ignores the counts", "A solved problem, because the claimed counts match the target's tests"]
  answer: 2
  explanation: >-
    Since ADR 0005 the server runs the code in ascend-grader and stores only its own verdict; the claimed counts are ignored, which submissions_are_graded_on_the_server checks by posting a - b for add-two with passed_count 2 and expecting 0 of 2. Matching counts were all the old design checked, which is why any client could mark a problem solved. A browser signature proves nothing, because anything the browser can sign, a learner can sign.
- q: >-
    A learner's Python function returns 0.1234565 for a test that expects 0.123457. What did the server record before the rounding fix, and what does it record now?
  options: ["A pass before and a fail now, because the host now rounds halves to even as Python does", "A fail before and a fail now, because the server compares the two floats bit for bit", "A fail before and a pass now, because the sandbox's round() gave 0.123456 and only the host rounds now, as Math.round does", "A pass before and a pass now, because every copy of the rule already rounded to six decimal places"]
  answer: 2
  explanation: >-
    Python's round(v, 6) rounds the exact binary value of 0.1234565 half to even and gives 0.123456, while JavaScript's Math.round(v * 1e6) rounds the scaled product 123456.5 half up and gives 0.123457. Before the fix, grade.py rounded with round() in the sandbox, so the server compared 0.123456 with 0.123457 and recorded a fail, although the JavaScript runner passed the same answer. Now every copy uses Math.round's rule, grade.py sends the float unrounded, and the host rounds once, so it passes everywhere; conformance.json pins the case. Nothing compares floats bit for bit.
```
