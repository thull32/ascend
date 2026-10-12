---
lesson: running-code-in-the-browser
source: a969ef2a51044e9d
---
## 1

Why does Ascend's code runner enforce time limits by terminating the worker, instead of asking the learner's code to stop?

A, browsers already stop every worker after ten seconds, so the limit is enforced anyway. B, synchronous code never yields, so it can neither check a flag nor receive a message. C, terminating a worker is faster than posting a stop message to it and waiting. D, workers cannot receive any messages at all once they start running a learner's code.

[think]

The answer is B: synchronous code never yields, so it can neither check a flag nor receive a message.

A worker can only process an incoming message when its current task returns to the event loop, which an infinite loop never does. Workers can receive messages in general, but only between tasks, never in the middle of a synchronous one. Pyodide's interrupt buffer is the exception, and it needs shared array buffers and a cross-origin isolated page, which this app does not have.

## 2

A problem has a time limit of 4 seconds and 8 tests. A learner's JavaScript has an infinite loop in the first test. When is the timeout reported?

A, never, because the loop freezes the tab before any timer can fire. B, after 8 seconds, because the budget scales with how many tests there are. C, after 4 seconds, because each test gets its own four-second limit. D, after 34 seconds, because one budget covers the whole batch of tests.

[think]

The answer is D: after 34 seconds, because one budget covers the whole batch of tests.

The budget is the time limit times the number of tests, plus 2 seconds, because all the tests run in one call, and the main thread only hears back when the batch ends. The timer lives on the main thread, so the tab never freezes. Timing each test would report sooner, but would cost a runtime restart per timeout, which is expensive for Python.

## 3

Before a recent fix, a learner could define a Python function named two sum, run it, rename it to something else, and still pass. Why, and what changed?

A, the browser cached earlier results; results are now keyed by a hash of the code. B, local storage restored the old code; the editor now clears it before each run. C, Pyodide kept one global namespace; each run now executes in a fresh dictionary. D, the harness matched entry names loosely; it now demands an exact name match.

[think]

The answer is C: Pyodide kept one global namespace, and each run now executes in a fresh dictionary.

Every run used to execute in the same interpreter globals, so the old definition was still there when the harness looked up the entry name. Now the shared harness runs the code in a new namespace, and looks the entry up there. The interpreter itself is still shared, so loaded modules, and module-level state in imported packages, survive between runs.

## 4

Pyodide failed to load after the runner switched to workers bundled by Vite. What was the cause?

A, the pinned Pyodide version did not yet support Python 3.14 syntax. B, module workers have no import scripts function, which the classic Pyodide loader calls. C, the Content Security Policy forbade WebAssembly compilation inside the worker. D, jsDelivr rate-limited the request, so the runtime download timed out.

[think]

The answer is B: module workers have no import scripts function, which the classic Pyodide loader calls.

Module workers have ES module semantics, and no import scripts, so the classic loader threw. The fix was a dynamic import of Pyodide's ES module build. The Content Security Policy does allow WebAssembly and jsDelivr, and a comment in the Python worker records the actual fix.

## 5

A script posts a submission claiming every test passed, with code that returns wrong answers. What does the server record today?

A, a 422, because the claimed counts disagree with the browser's signature. B, a solved problem at first, until a nightly job re-grades the code. C, a failed attempt, because it grades the code itself and ignores the counts. D, a solved problem, because the claimed counts match the target's tests.

[think]

The answer is C: a failed attempt, because it grades the code itself and ignores the counts.

Since ADR 5, the server runs the code in Ascend's grader, and stores only its own verdict. The claimed counts are ignored, and a test checks exactly that, by submitting an "add two" that subtracts, claiming two passes, and expecting zero of two. Matching counts were all the old design checked, which is why any client could mark a problem solved. A browser signature proves nothing, because anything the browser can sign, a learner can sign.

## 6

A learner's Python function returns 0.1234565, for a test that expects 0.123457. The server once recorded this as a fail. Where is the verdict decided today, and what is it?

A, in a Rust port of the browser's rule, on the host, and it is a pass. B, in the learner's own sandbox, after its last case, and it is a pass. C, in the learner's Python sandbox, with Python's round, and it is a fail. D, in a fresh QuickJS instance on the host, running the shared comparison script, and it is a pass.

[think]

The answer is D: in a fresh QuickJS instance on the host, running the shared comparison script, and it is a pass.

Python's round to six places rounds the binary value of 0.1234565 half to even, and gives 0.123456, while JavaScript's way rounds up, to 0.123457. When the sandbox rounded the Python way and the host rounded the expected value the JavaScript way, a correct answer failed. Now the harness sends the float unrounded, and the one comparison script the browser also runs compares both sides in a separate QuickJS instance, so expected values never enter the learner's sandbox. The Rust port was deleted, and a test pins this case.
