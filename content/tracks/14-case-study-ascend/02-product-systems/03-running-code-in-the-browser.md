---
slug: running-code-in-the-browser
title: "Running code in the browser: workers, Pyodide and trust"
description: How Ascend runs learner JavaScript, TypeScript and Python in Web Workers with time limits enforced by termination, went from four copies of its comparison rule to one file run by V8 and QuickJS, and moved from self-reported results to a WebAssembly grader on the server.
minutes: 45
difficulty: hard
tags: [case-study, web-workers, webassembly, pyodide, sandboxing, trust-model, testing]
---
Every lesson exercise and every practice problem has a Run button, and learners will press it on code with infinite loops, exponential recursion and accidental `while True`. The textbook answer is a server-side judge: submit code, run it in a sandbox, return results. That answer comes with a sandbox to secure (containers plus gVisor or Firecracker), a queue, an image per language, capacity planning for bursts, and a cost per run, on a product that is free.

Ascend runs the code in the learner's own browser instead. That moves the cost to zero and the latency to milliseconds, and it moves the hard problems somewhere else: stopping code that will not stop, making Python run in a browser at all, and making the browser and the server agree on what passed. It also raises a question the first design answered with "nobody": what does a result reported by the client prove? Since ADR 0005 the answer is a second run, on the server, in a WebAssembly sandbox. This lesson reads `web/src/runner/*`, `crates/core/src/services/submissions.rs`, `crates/grader` (whose `harness/` the browser shares) and ADRs 0003 and 0005.

## The decision and its consequences

ADR 0003 records the choice in three lines: run JavaScript/TypeScript and Python (Pyodide, CPython compiled to WebAssembly) in dedicated Web Workers; remove network APIs in the JS worker; enforce a wall-clock budget by terminating the worker; post results to the API, which validates test counts. The alternatives it rejects:

| Option | What you get | What it costs | Why rejected |
|---|---|---|---|
| Server-side sandbox (Judge0-style) | Authoritative results, any language, hidden tests stay secret | Sandbox security, queueing, per-language images, money per run | Not needed for practice; a faked result only cheats the learner |
| JavaScript only | Simplest runner | Excludes Python, the most common interview language | Hurts the core user |
| **Browser workers (chosen)** | Zero marginal cost, instant feedback, works offline after first load | Self-reported results, a ~10 MB Python download, limits enforced by the client | Accepted |

The ADR's consequence: "Submissions are self-reported. Leaderboards or competitive features would need server-side verification." ADR 0003 is now "amended by 0005"; the trust-model section tells why.

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

Why workers at all? JavaScript in a page runs on one thread, the same thread that paints the UI and handles clicks. A `while (true) {}` there freezes the tab, and nothing can interrupt it without the thread yielding. A dedicated worker is a second thread with no DOM: the learner's loop can spin there while the main thread stays responsive and keeps a clock.

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
| next Run | `ensure()` constructs a new worker; `reset()` set `ready = false`, so Python gets the cold-start budget again | Starts empty: JavaScript is ready in milliseconds; Python re-instantiates Pyodide from the browser cache for several seconds |

If the worker had answered at 33,999 ms instead, the message handler would have found id 7 in `pending`, cleared the timer and resolved with the results; the `pending` map is what makes "answer or timeout, whichever comes first" exactly-once.

That is a deliberate trade. The worker runs all tests in one synchronous call; timing each test separately means one message per test, and because a timeout kills the worker, a Python timeout would then cost seconds of re-instantiation before the next test. Batching makes the common case (code that terminates) fast and the rare case slow.

**The rejected alternative** for Python is an interrupt buffer: Pyodide can poll a `SharedArrayBuffer` that the main thread writes to, raising `KeyboardInterrupt` without killing the runtime. `SharedArrayBuffer` requires a cross-origin isolated page (COOP and COEP headers), which constrains loading third-party resources, including the CDN this app loads Pyodide from.

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
js = transform(code, { transforms: ["typescript"], disableESTransforms: true }).code;
const result = load(js, entry, fakeConsole); // crates/grader/harness/runner.js
```

```javascript
// crates/grader/harness/runner.js — load
const src = `"use strict";\n${PRELUDE}\nreturn (() => {\n${js}\n;return (name) => { try { return eval(name); } catch { return undefined; } };\n})();`;
resolve = new Function("console", src)(consoleObject);
```

Sucrase strips TypeScript types without type-checking, which is exactly right for a runner: the learner wants to know whether the code works, and a type error is not a failing test. Everything after that is `runner.js`, the same file the server's grader runs. Each run compiles a fresh function scope, so state from a previous run cannot leak into this one, and `console` is a parameter bound to a collector, so `console.log` output appears next to each test. The inner arrow function is a fix with its own story, told in the harness section.

The deleted globals are hygiene, not a security boundary ([Security fundamentals](/learn/senior-craft/software-craft/security-fundamentals) weighs these runners' `unsafe-eval` against its compensating controls): `import()` is syntax and cannot be deleted. The real boundaries are elsewhere. The worker has no DOM and cannot read the session cookie, which is `HttpOnly`. The Content Security Policy on every response, worker scripts included, has a `connect-src` of only the app's own origin plus the CDNs Pyodide and its packages load from (jsDelivr and PyPI). And the threat model says the code comes from the learner's own editor. The residual risk is social (someone persuades a learner to paste hostile code), and the CSP is what bounds the damage.

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

The worker *type* is part of the runtime contract, and the error only shows in a real browser, which is why the Playwright smoke suite has "python runs in the browser via Pyodide" with a 150-second budget for the first download. Notice too that the JS worker deletes `importScripts`, which in a module worker would throw anyway: belt and braces, not a boundary.

### Before and after: stale Python globals

The JS worker compiles each run into a fresh function scope. The Python worker used to run every submission with `runPythonAsync(req.code)` in the *same* Pyodide globals, and the harness found the entry point with `globals().get(entry_name)`. Define `two_sum`, run it, rename the function to `twosum`, run again: the stale `two_sum` was still defined, and the tests passed against code no longer in the editor, which is worse than a failure because it teaches the wrong thing.

The fix, in `7154e9f`, moved execution into the harness:

```python
# crates/grader/harness/harness.py (then inside py.worker.ts)
def _fresh_namespace():
    """Each run gets a clean module namespace: a function deleted or renamed
    since the previous run must not keep passing from stale globals."""
    ns = {"__name__": "__main__"}
    ns.update(_INJECTED)
    exec(_PRELUDE, ns)
    return ns

def load(code, entry):
    ns = _fresh_namespace()
    exec(compile(code, "<solution>", "exec"), ns)
    target = ns.get(entry)
```

Each run gets a new dictionary pre-loaded with the injected node classes (`ListNode`, `TreeNode`, `Node`, `GraphNode`) and the same prelude of imports, and `load` looks the entry point up in that dictionary, never in the interpreter's globals. Compiling under the file name `<solution>` pays a second dividend: `_format_error` keeps only the traceback frames from that file, so an exception points at the learner's line, not at harness internals.

Why a fresh dictionary rather than a fresh interpreter? Re-creating the worker would give perfect isolation and cost seconds of Pyodide start-up on every run; a new namespace costs microseconds. What it does not isolate: the interpreter is still shared, so `sys.modules`, `sys.setrecursionlimit` and any mutation of an imported module survive from one run to the next. For practice that is the right trade; the server's grader, whose verdict counts, pays for a fresh WebAssembly instance per run.

## The harness: from four copies to one file

A test passes when the returned value equals the expected value, and "equals" needs a definition that survives two languages and floating point. Today that definition is one file:

```javascript
// crates/grader/harness/compare.js
export function normalise(v) {
  if (v === undefined) return null;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const tag of ["$list", "$tree", "$graph"]) if (tag in v && Array.isArray(v[tag]) && v[tag].length === 0) return null;
  }
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "number") return Math.round(v * 1e6) / 1e6;
  if (Array.isArray(v)) return v.map(normalise);
  if (v instanceof Map) return normalise(Object.fromEntries(v));
  if (v instanceof Set) return normalise([...v]);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = normalise(v[k]);
    return out;
  }
  return v;
}
```

Integers stay integers, other numbers round to six places so `0.1 + 0.2` equals `0.3`, keys are sorted so their order does not matter, an empty linked list, tree or graph equals `null`, and `matches` with `any_order` compares the top-level lists as multisets of canonical strings. Getting there took two rounds; the first is the instructive failure.

### Before: four copies that drifted

Until commit `e47282a` the rule existed four times: TypeScript in `web/src/runner/harness.ts`, Python in the Pyodide harness, Python again in `scripts/validate_problems.py` (which ran problems' reference solutions in CI), and Rust in `crates/grader/src/compare.rs`. The Python copies needed a step JavaScript gets for free: `2.0` is a float in Python and must become `2`, or `json.dumps` writes `"2.0"` and a correct answer fails.

Copies drift, and these did. Until `008eee6` the validator never rounded non-integral floats, so `0.30000000000000004` against `0.3` failed in CI and passed in the browser; the Pyodide harness collapsed *before* rounding, so `0.9999999999999998` became `"1.0"` and failed against `1`. One disagreement survived those fixes (measured with the TypeScript rule in Node and the Python rules in CPython):

| Value returned | JavaScript rule (`harness.ts`, `compare.rs`) | Python copies, before `e6f5cbc` |
|---|---|---|
| `0.1234565` | `0.123457` | `0.123456` |
| `5e-7` | `0.000001` | `0` |

At exact half-way points the languages round differently. `Math.round(v * 1e6)` rounds the scaled product half up; Python's `round(v, 6)` rounds the exact binary value of `v`, half to even. Server grading turned that into wrong verdicts: the sandboxed `grade.py` rounded a Python result with `round()`, the host rounded the *expected* value with the JavaScript rule, and a function returning exactly the expected `0.1234565` passed in Pyodide and failed on the server (`0.123456` against `0.123457`). A review of this lesson found it; no test ran one set of cases through all four rules.

The first fix, `e6f5cbc`, kept the copies and made them agree. Every copy implemented `Math.round` bit for bit (take `f = floor(x)` and add one when `x - f >= 0.5`, which is exact where the tempting `floor(x + 0.5)` rounds `0.49999999999999994` up to 1), `grade.py` sent floats unrounded so only the host rounded, and `crates/grader/conformance.json`, 34 `(expected, actual, any_order, match)` cases, ran against every copy through `cargo test`, Vitest and `scripts/check_conformance.py`. That is the textbook answer to duplicated logic, and its weakness is what it leaves: every change is four edits, and the corpus catches only inputs someone wrote down.

### After: one definition, two engines

`e47282a` deleted three of the copies. `compare.js` is the only definition. The browser imports it (`harness.ts` is now a one-line re-export) and runs it in V8. After the learner's run ends, `compare_blocking` in `crates/grader/src/sandbox.rs` starts a *fresh* QuickJS instance on the host side, passes it the expected values and the learner's reported values on stdin, and reads back one boolean per case. The learner's instance never sees an expected value; the comparing instance runs only trusted code on data, under its own 5-second budget. `compare.rs` and `check_conformance.py` are gone, and `validate_problems.py` now checks structure only.

The harnesses got the same treatment: `harness.py` and `runner.js` alone decode arguments, call the learner's function and encode what came back. Pyodide and the JS worker load them; the server prepends them to `grade_main.py` and `grade_main.js`, which read the job on stdin and print one line per case. The Pyodide harness no longer compares at all: it returns encoded values and the worker calls `matches`. The `2.0` step vanished with it, because `JSON.parse` in V8 or QuickJS reads `2.0` as the number `2`, and no Python rule is left to get it wrong.

Why JavaScript for the one rule? Both ends already had an engine (V8 in the browser, QuickJS in the grader), and `Math.round`, `JSON.stringify` and key order are specified by ECMAScript, so two conforming engines agree; a Rust or Python source of truth would have needed a code generator or a WebAssembly build in the browser. The cost is one extra QuickJS start per graded submission, about 0.02 s. The corpus still runs, now against two engines instead of four implementations: Vitest through `harness.ts`, and `the_conformance_corpus_holds_in_quickjs` through the grader; `half_way_floats_are_rounded_once_by_the_host` pins the case that started it.

### Reference solutions: what one harness still missed

One harness does not prove that V8 and QuickJS, or Pyodide and CPython for WASI, run a program the same way. Before `65f9063` only the 180 problems' Python references were graded on the server; an exercise that failed only under QuickJS would be found by a learner. `ascend-api --grade-solutions` (`crates/core/src/services/reference.rs`) now grades reference solutions exactly as submissions are graded. They live outside the binary: `solutions/exercises/<lesson-slug>/<id>.py` and `.js` for all 535 exercises, and `solutions/problems/<slug>.js` for the 180 problems (whose Python reference is their Solution section). That is 1,430 (target, language) pairs; all pass, and CI's `grading_parity` runs with `REQUIRE_ALL_SOLUTIONS=1`, so a target without a passing solution fails the build.

Writing them found three differences, each a class of bug:

- **Scope.** The JavaScript prelude declared `class Node` (the graph node) in the same function scope as the learner's code. The AVL, B+ tree and trie starters declare their own `class Node`, and two class declarations of one name in one scope are a SyntaxError, so those exercises failed to load in the browser *and* on the server. Learner code now runs in the inner arrow function shown earlier, where its `Node` shadows the provided one and `ListNode` is still found; `learner_classes_may_reuse_the_provided_names` pins both.
- **Missing APIs.** `TextEncoder`, `TextDecoder` and `structuredClone` exist in browsers and not in QuickJS, and one exercise's starter used `TextEncoder`. `grade_main.js` polyfills them on the server.
- **APIs that should not be there.** `URL`, `URLSearchParams`, `Intl`, `crypto`, `fetch` and the timers exist only in browsers. The prelude shadows each with a proxy that throws "is not available in graded code" in both places. `graded_javascript_sees_the_same_web_apis_as_the_browser` covers both lists.

A shared harness makes the *rules* identical; only real programs run through both engines find where the *engines* differ. You will implement the rule itself in the exercise.

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

### Why it changed before any leaderboard

ADR 0003 named a leaderboard as the trigger for verification. The trigger that arrived first was internal. "Solved" feeds XP, the dashboard, the roadmap and the coach, and ADR 0005 says: "a number the server cannot vouch for is a liability, and the fix only gets harder as the numbers are used more widely." And the sandbox the review had priced, containers under gVisor or Firecracker, needs privileges or nested virtualisation the platform does not offer; WebAssembly needs neither.

### After: the server grades, in WebAssembly

The browser still runs the code for instant feedback. When a signed-in learner's browser run ends without a compile error or a timeout, `CodeRunner` also posts the code (for TypeScript, plus the Sucrase-stripped JavaScript as `compiled`) and the server grades it in `crates/grader` and stores only its own verdict. The editor says when the two disagree: "Saved, but the server's check passed 7 / 8. Test 8 failed there: ...". Trusting `compiled` costs nothing: a learner could have submitted any JavaScript as JavaScript anyway.

This sandbox is built the opposite way from the worker's. CPython 3.14.7 and QuickJS-ng 0.17.0, both compiled to WASI, run under Wasmtime 49 with Cranelift, pinned by SHA-256 in `scripts/grader-runtimes.sh`. A WASI guest can reach only what the host grants, and the grader grants stdin (the job as JSON), capped stdout and stderr pipes (8 MiB and 64 KiB) and, for Python, a read-only standard library preopened at `/lib`; each run gets a fresh instance. `the_sandbox_has_no_files_network_environment_or_processes` probes files, the environment, sockets and subprocesses from Python and host modules from JavaScript, and expects each to be absent or blocked.

| Resource | Bound | Mechanism |
|---|---|---|
| CPU | Per-test limit × tests, plus 3 s (Python) or 1 s (JavaScript) of start-up | Epoch interruption: a thread advances the engine's epoch every 10 ms, and a store past its deadline traps at its next check |
| Memory | 256 MiB of linear memory | `StoreLimits` on the store |
| Stack | 8 MiB of wasm stack | `max_wasm_stack`, on a dedicated 16 MiB thread per run |
| Concurrency | `GRADER_SLOTS` runs at once (default half the cores, 1 to 4) | A semaphore; no slot within 20 s answers 503 with `Retry-After: 5` |
| Volume | 20 graded submissions a minute per session | The shared rate limiter |

The stack row has a story. Guest code runs on the calling thread's native stack, and Wasmtime's documentation warns that `max_wasm_stack` "does not ensure that this much stack space is available on the calling thread stack". Tokio's worker threads default to 2 MiB; in the first test run a deep recursion overflowed one and aborted the whole process. Each run now gets its own 16 MiB thread, and `recursion_as_deep_as_the_tests_need_works` recurses 900 deep, then a million deep, and asserts the grader survives both.

**Comparison happens on the host.** The harness inside the sandbox (`harness.py` or `runner.js`, with its `grade_main` file) calls the learner's function on each case and prints one line per case, prefixed with the ASCII record separator, saying what it returned; `compare.js`, in its own QuickJS instance, compares that with the expected value outside. Expected values never enter the sandbox, so code that tampers with the harness can only claim return values it could have returned anyway. The host keeps the last report per case and the harness reports after each call returns, so a line forged during the call is overwritten (`forged_harness_lines_do_not_override_real_results`). And because results stream one line per case, a timeout keeps the cases that finished, which the browser, killing its worker, cannot.

Trace `an_infinite_loop_stops_at_the_budget_and_keeps_earlier_results` for Python: `def f(x): while x: pass; return 1`, cases `[0]`, `[1]`, `[0]`, a 200 ms per-test limit.

1. The budget is 200 ms × 3 + 3 s of start-up = 3.6 s, or 360 epoch ticks; `set_epoch_deadline(360)` and `epoch_deadline_trap()` arm the store.
2. Case 0 returns 1 at once, and the harness prints its line.
3. Case 1 spins. After the 360th tick, the guest's next epoch check traps with `Trap::Interrupt`, and the run stops as `Stop::TimeLimit`.
4. Case 2 never runs. Case 0 is compared with its expected value; cases 1 and 2 fail with "Time limit exceeded (3.6 s for all tests). Check for an infinite loop or a slower-than-expected algorithm."

`submissions_are_graded_on_the_server` posts `a - b` for the `add-two` problem with a claimed `passed_count` of 2 and gets back 0 of 2 with nothing solved, then the right code and 2 of 2; the end-to-end test "a solve is graded on the server, and a claimed result is not trusted" does the same in a real browser.

**What it costs**, measured on the development machine: Python start-up about 0.09 s with the standard library precompiled at image build (`ascend-api --prepare-grader`), 0.24 s without; QuickJS about 0.02 s; compiling both runtimes at boot about 0.4 s on 32 cores, and about 250 MB of anonymous memory that a host bills for as long as the process lives. Since `04ab90f` the image build also writes them compiled ahead of time (`python.cwasm`, 18 MB, and `qjs.cwasm`, 3.3 MB), and `load_precompiled` maps them with `Module::deserialize_file`: file-backed pages, loaded on first use, with a fallback to compiling when Wasmtime rejects a file built by another version, configuration or CPU. Idle RSS fell from 342 MB to 97 MB, against 92 MB with no grader at all, and all 1,430 reference solutions pass on the precompiled modules. The image grows by about 55 MB, plus the two `.cwasm` files. QuickJS interprets, so tight loops run several times slower than in V8; server Python has only the standard library; and hidden tests still ship in the page, so they are not secret.

## At 100x

- **CDN dependency.** Self-hosting the Pyodide build under `/assets` removes jsDelivr from the critical path and the CSP, at the cost of image size and bandwidth.
- **Low-end phones.** Pyodide costs tens of megabytes and a killed worker must re-instantiate; a warm spare worker would hide that.
- **Grading capacity (built).** ADR 0005's answer to load was a separate service, and `c0b3151` built it: `ascend-api --serve-grader` runs the same image with the runtimes and a token but no database URL or AI key. The API uses it when `GRADER_URL` and `GRADER_TOKEN` are set (`GradingBackend::Remote`), with a new connection per request so any replica can answer, and one retry on any failure but a timeout (a 503, or since `2f1daaa` a replica that dies mid-request; grading has no side effects, so a retry is safe). `.railway/railway.ts` declares two grader replicas of two slots each, and its `PHASE_2` flag points the API at them; scaling is more replicas, not more slots. The flag was on from `eed6d46` until `04ab90f` turned it off while Ascend is invite-only: idle, the extra replicas cost more than the traffic justified, and with mapped runtimes grading in-process adds about 5 MB to the API.
- **Engine differences.** A learner's program can still behave differently in V8 and QuickJS, mostly in speed; grading in the browser with the server's WebAssembly runtimes would remove that, at the cost of a larger download.

## Failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| jsDelivr unreachable from a school network | Python never leaves "Loading Python runtime"; JavaScript works | The `pyodide.mjs` request fails in DevTools; `pyodidePromise` resets so a retry can succeed | Self-host the Pyodide build under `/assets` |
| Browser and server disagree on a correct answer | Passes in the browser, fails the server's check | Grade the reference solution with `--grade-solutions` | One `compare.js` in both engines; a passing reference solution for every target in CI |
| The server times out where the browser passed | "Saved, but the server's check passed ..." with a time limit | QuickJS interprets where V8 compiles | Small test inputs (CI grades every reference solution); a higher `time_limit_ms` |
| Every grading slot busy | "The server's check is busy ..." | 503 with `Retry-After: 5` after 20 s without a slot, on every replica tried | More grader replicas |

## Interviewer follow-ups

**"Why run the code twice, in the browser and on the server?"** Model answer: the runs answer different questions. The browser gives instant feedback at zero marginal cost; the server gives a result the product can build on, because "solved" feeds XP, progress, the roadmap and the coach. Server execution is affordable because a WebAssembly instance starts in about a tenth of a second, needs no privileges and reaches only what the host grants, and the expected values stay outside it. Common wrong answer: "sign the browser's result", but anything the browser can sign, a learner can sign.

**"How do you stop a learner's infinite loop?"** Model answer: synchronous code never yields to check a flag or read a message, so you run it on a thread you can kill: the main thread keeps a timer per request and terminates the worker. On the server the engine does the stopping: compiled code checks an epoch counter and traps past its deadline. Common wrong answer: "wrap it in a try/catch with a timeout", which never runs while the loop holds the thread.

**"The browser and the server both judge the same code. How do you stop them disagreeing?"** Model answer: give them one rule, not copies. Here `compare.js` runs in V8 and in QuickJS, and the harnesses are shared files; then grade a reference solution for every target on the server in CI, because shared code does not make two engines behave alike (`class` scoping, missing `TextEncoder`). Common wrong answer: "a shared test corpus", which Ascend had, and which pinned only the cases someone wrote down.

**"What changes if you add a public leaderboard?"** Model answer: the verdicts are already the server's, so a leaderboard can count them. What it adds is secrecy: hidden tests ship in the page and live in the public repository, so contest problems need tests that never leave the server, graded by the same `Grader`. Common wrong answer: "encrypt the hidden tests", which the browser must decrypt to run.

## What mid-level engineers get wrong

- **Running untrusted code on the page's own thread.** An infinite loop freezes the tab, and the timer meant to stop it never fires.
- **Trying to interrupt synchronous code cooperatively.** Only terminating its thread, or an engine that checks a deadline, stops it.
- **Calling deleted globals a sandbox.** The real boundaries are the missing DOM, `HttpOnly` cookies and the CSP.
- **Recording a result the client reports.** Until the server graded the code, one `POST` with the right counts marked any problem solved.
- **Running guest code on a thread with a small stack.** A deep recursion overflows it and aborts the whole process.
- **Keeping copies of one rule, even with a shared corpus.** They drift at edges nobody wrote down; here half-way rounding recorded correct answers as failures.
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
- You stop synchronous code you do not control by killing its thread or process, and design the budget and restart cost around that.
- You prefer one definition that every runtime executes over copies pinned by a corpus, and still run real reference programs through every engine, because shared rules do not make engines agree.
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
    Every run used to execute in the same interpreter globals, so the old definition was still there when the harness looked up the entry name. Now the shared harness's load runs the code in a new namespace, and the entry is looked up there. The interpreter itself is still shared, so sys.modules and module-level state in imported packages survive.
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
    A learner's Python function returns 0.1234565 for a test that expects 0.123457. The server once recorded this as a fail. Where is the verdict decided today, and what is it?
  options: ["In a Rust port of the browser's rule on the host, and it is a pass", "In the learner's own sandbox after its last case, and it is a pass", "In the learner's CPython sandbox, with Python's round(), and it is a fail", "In a fresh QuickJS instance on the host running compare.js, and it is a pass"]
  answer: 3
  explanation: >-
    Python's round(v, 6) rounds the binary value of 0.1234565 half to even and gives 0.123456; Math.round(v * 1e6) rounds 123456.5 up and gives 0.123457. When the sandboxed grade.py rounded with round() and the host rounded the expected value the JavaScript way, a correct answer failed. Now the harness sends the float unrounded, and compare.js, the one definition the browser also runs, compares both sides in a separate QuickJS instance, so expected values never enter the learner's sandbox. The Rust port, compare.rs, was deleted; half_way_floats_are_rounded_once_by_the_host pins the case.
```
