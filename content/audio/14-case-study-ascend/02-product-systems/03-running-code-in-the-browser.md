---
lesson: running-code-in-the-browser
source: c95c7c4f5c425015
fit: great
desk:
  - "The worker handle's timer race and the timeout trace"
  - "The comparison rule in compare.js, and the half-way rounding table"
  - "The server sandbox's resource table and the infinite-loop trace"
  - "Exercise: implement the runner's comparison rule"
---
## Introduction

Every exercise and practice problem in Ascend has a Run button, and learners will press it on infinite loops, exponential recursion and accidental while-true. The textbook answer is a server-side judge: submit the code, run it in a sandbox, return results. That answer comes with a sandbox to secure, a queue, an image per language, capacity planning for bursts, and a cost per run, on a product that is free.

Ascend runs the code in the learner's own browser instead. The cost goes to zero and the latency to milliseconds. And the hard problems move: stopping code that will not stop, making Python run in a browser at all, getting the browser and the server to agree on what passed, and a question the first design answered with "nobody": what does a result reported by the client prove?

## The decision, and why workers

The architecture decision record says it in three lines. Run JavaScript, TypeScript and Python in dedicated Web Workers, with Python as Pyodide, which is CPython compiled to WebAssembly. Remove network APIs in the JavaScript worker. Enforce a time limit by terminating the worker.

It rejected a server sandbox: authoritative results, but sandbox security, queues and money per run, and a faked result only cheats the learner. It rejected JavaScript only, because that excludes Python, the most common interview language. And it wrote down the consequence plainly: submissions are self-reported; a leaderboard would need server-side verification. Keep that sentence in mind.

Why a worker at all? JavaScript on a page runs on one thread, the same thread that paints and handles clicks. A while-true loop there freezes the tab, and nothing can interrupt it. A worker is a second thread with no DOM. The learner's loop can spin there while the main thread stays responsive and keeps a clock.

## Stopping code that will not stop

Every run races a timer on the main thread. If the worker answers first, the timer is cleared and the results come back. If the timer fires first, the worker is terminated and the next run builds a fresh one. A map of pending requests makes "answer or timeout, whichever comes first" happen exactly once.

Why terminate rather than ask the code to stop?

[pause]

Because synchronous code never yields. A JavaScript loop never returns to the event loop, so it cannot read a message. Python under Pyodide runs synchronously inside WebAssembly on the worker's thread. There is no signal to send and no flag the learner's code will check. Killing the thread is the only reliable stop. The rejected alternative for Python was an interrupt buffer, which needs a cross-origin isolated page, and that constrains loading Pyodide from a CDN.

The budget covers the whole batch, not each test. A problem with a 4-second limit and 8 tests gets 4 seconds times 8, plus 2 seconds: 34 seconds. So an infinite loop in the first test is reported after 34 seconds, and on timeout the results of tests that had passed are lost with the worker. That is a deliberate trade: one call for all tests makes code that terminates fast, and keeps a Python timeout from costing seconds of restart per test.

The JavaScript worker is a sandbox by subtraction: it deletes fetch, WebSocket and a few other globals before running the code. But that is hygiene, not a security boundary; dynamic import is syntax and cannot be deleted. The real boundaries are elsewhere: the worker has no DOM, it cannot read the session cookie, and the Content Security Policy only allows connections to the app's own origin and the CDNs Pyodide loads from.

## Two Python incidents

The first was a runtime that never started. Workers are created as module workers, which is how the bundler handles workers that use imports. Pyodide's classic loading recipe calls importScripts, and module workers do not have importScripts. The call threw, and Python never started. The fix loads Pyodide's ES module build with a dynamic import. The worker type is part of the runtime contract, and the error only shows in a real browser, which is why the end-to-end smoke suite runs Python with a 150-second budget for the first download.

The second was worse, because it passed. The JavaScript worker compiles each run in a fresh function scope. The Python worker used to run every submission in the same interpreter globals. Define two-sum, run it, rename the function, run again: the old two-sum was still defined, and the tests passed against code no longer in the editor. That is worse than a failure, because it teaches the wrong thing.

The fix runs each submission in a new namespace dictionary and looks the entry point up there. Why a fresh dictionary and not a fresh interpreter? A new interpreter costs seconds of Pyodide start-up on every run; a new namespace costs microseconds. What it does not isolate is the interpreter itself, so imported modules keep their state between runs. For practice, the right trade.

## From four copies of one rule to one file

A test passes when the returned value equals the expected one, and "equals" needs a definition that survives two languages and floating point. Integers stay integers, other numbers round to six places so 0.1 plus 0.2 equals 0.3, and key order does not matter.

Before, that rule existed four times: TypeScript in the browser, Python in the Pyodide harness, Python again in a CI validator, and Rust on the server. Copies drift, and these did. The nastiest case was at exact half-way points. JavaScript's rounding rounds the scaled value half up; Python's round function rounds the exact binary value, half to even. So a learner's Python function returning exactly the expected 0.1234565 passed in the browser and failed on the server. The server rounded the learner's answer the Python way and the expected value the JavaScript way. A correct answer was recorded as a failure.

[pause]

The first fix kept the copies and made them agree, bit for bit, with a shared corpus of 34 test cases run against every copy. That is the textbook answer to duplicated logic, and its weakness is what it leaves: every change is four edits, and the corpus only catches inputs someone wrote down.

The second fix deleted three copies. The rule is now one JavaScript file. The browser runs it in V8. The server runs the same file in a fresh QuickJS instance after the learner's run ends, passing it the expected values and the reported values. Why JavaScript? Both ends already had an engine, and rounding, JSON and key order are specified by the language standard, so two conforming engines agree. The cost is one extra QuickJS start per graded submission, about 20 milliseconds.

One rule still does not prove two engines run a program the same way. So every one of the 535 exercises and 180 problems now has reference solutions, 1,430 language-and-target pairs, graded on the server in CI. Writing them found three classes of bug: a class name the harness declared that clashed with learners' own classes, browser APIs missing on the server, and browser APIs that should not be visible in graded code at all. A shared harness makes the rules identical; only real programs run through both engines find where the engines differ.

## The trust model, before and after

Before, a signed-in run ended with the browser posting its outcome: how many tests passed, out of how many. The server checked that the target existed and that the counts were consistent. What it could not know was whether the tests really passed. One request claiming all tests passed marked any problem solved, and XP and progress were built on that.

The decision record said a leaderboard would trigger verification. The trigger that came first was internal: "solved" feeds XP, the dashboard, the roadmap and the coach. As the later decision record put it, a number the server cannot vouch for is a liability, and the fix only gets harder as the number is used more widely. And containers under gVisor or Firecracker needed privileges the platform does not offer. WebAssembly needs neither.

So now the browser still runs the code for instant feedback, and the server also grades it and stores only its own verdict. The server sandbox is built the opposite way from the worker. Instead of deleting capabilities, it grants them: CPython and QuickJS compiled to WASI, under Wasmtime, can reach only what the host gives them, which is the job on standard input, capped output pipes, and a read-only standard library. Each run gets a fresh instance. Expected values never enter the sandbox, so code that tampers with the harness can only claim return values it could have returned anyway.

Stopping a loop on the server works differently too. A thread advances the engine's epoch every 10 milliseconds, and guest code traps at its next check once past the deadline. Because the harness reports one line per case, a timeout keeps the cases that finished, which the browser cannot.

One story from the first test run. Guest code runs on the calling thread's native stack, and the runtime's worker threads default to 2 megabytes. A deep recursion overflowed one and aborted the whole process. Each run now gets its own 16-megabyte thread, and a test recurses a million deep and checks the grader survives.

And the cost: Python starts in about a tenth of a second. Compiling both runtimes at boot cost about 250 megabytes of memory, until a later change shipped them precompiled and mapped from files. Idle memory fell from 342 megabytes to 97, against 92 with no grader at all.

## In the interview

Here is the follow-up the lesson expects. Why run the code twice, in the browser and on the server?

[pause]

Because the runs answer different questions. The browser gives instant feedback at zero marginal cost. The server gives a result the product can build on, because "solved" feeds XP, progress, the roadmap and the coach. It is affordable because a WebAssembly instance starts in about a tenth of a second, needs no privileges, and reaches only what the host grants. The common wrong answer is "sign the browser's result", but anything the browser can sign, a learner can sign.

And: what changes with a public leaderboard? The verdicts are already the server's. What it adds is secrecy, because hidden tests ship in the page and are not secret.

## Recap

Four things to remember. Choose where code runs by who bears the cost and who needs to trust the result, and write down when that answer changes. You stop synchronous code by killing its thread, or with an engine that checks a deadline, never by asking. Keep one definition of a rule that every runtime executes, then run real reference programs through every engine anyway. And build a server sandbox by granting capabilities, with expected values kept outside it.

At your desk: the timer race and timeout trace, the comparison rule and the rounding table, the sandbox's resource limits and loop trace, and the comparison exercise.
