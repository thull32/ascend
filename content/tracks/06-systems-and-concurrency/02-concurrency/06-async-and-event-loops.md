---
slug: async-and-event-loops
title: "Async and event loops: one thread, ten thousand connections"
description: How Node, asyncio and Tokio run thousands of tasks on few threads, the asyncio loop and Node's libuv phases traced iteration by iteration, what await compiles to, what blocks the loop (measured, including why to_thread does not help with json.dumps), and the async pitfalls that show up in code review.
minutes: 45
difficulty: medium
tags: [concurrency, async, event-loop, nodejs, asyncio, tokio, cooperative-scheduling, futures]
---
A Node.js API serves 5,000 requests per second with a p99 of 20 ms. Roughly once an hour, p99 jumps to 1.5 seconds on *every* endpoint for a couple of seconds, then recovers. The cause is an admin export endpoint that calls `JSON.stringify` on a 60 MB object. For over a second, the one thread that runs every callback in the process is busy serialising, and every other request, timer and health check waits in line behind it. Nothing is broken. The process is doing exactly what an event loop does.

Event loops are how most modern services handle large numbers of connections: Node.js, Python's asyncio, Rust's Tokio, Netty on the JVM, nginx, Redis. They are extremely efficient for I/O-bound work and unforgiving of anything else. To use them well you need to know what the loop does between your lines of code, what `await` compiles to, and exactly which mistakes stall it. Measurements below used CPython 3.14 and Node 24 on a Ryzen 9 9950X3D under WSL2.

## Why event loops exist

A thread per connection works until you have 10,000 mostly idle connections (websockets, long polls, slow clients): 10,000 stacks and a context switch every time one becomes active. An event loop inverts the model. One thread asks the kernel which sockets are ready (with `epoll` or `kqueue`, traced in [I/O and system calls](/learn/systems/operating-systems/io-and-syscalls)), runs a short piece of code for each ready event, and asks again. Nothing blocks on a single socket. A connection costs a small state object instead of a stack: measured, a parked asyncio task holds about 1 KB, and a round trip through the loop (`await asyncio.sleep(0)`) costs 1.0 µs, against about 2 µs and an 8 MiB stack reservation for a kernel thread switch.

## The loop itself

Stripped to its skeleton, every event loop is this:

```python
while there_is_work():
    run_all(ready_callbacks)            # run everything that can run right now
    timeout = time_until_next_timer()   # 0 if something is already ready
    events = epoll_wait(timeout)        # the ONLY place this thread ever sleeps
    for fd, event in events:
        ready_callbacks.append(handler_for(fd, event))
    ready_callbacks.extend(expired_timer_callbacks())
```

Two properties follow, and everything else in this lesson is a consequence of them:

1. **Callbacks run to completion.** The loop cannot check for new events, fire a timer or run another request's code until your callback returns (or your coroutine reaches an `await`).
2. **All your code runs on one thread.** There are no data races between callbacks, because only one runs at a time. There can still be race conditions.

## Under the hood: the asyncio loop, traced

CPython's `BaseEventLoop._run_once` is that skeleton almost literally. It holds a deque of ready callbacks (`_ready`) and a heap of timers (`_scheduled`). Each iteration it (1) sets the poll timeout to 0 if anything is ready, otherwise to the time until the earliest timer; (2) calls `selector.select(timeout)` (epoll on Linux) and appends I/O callbacks to `_ready`; (3) moves expired timers to `_ready`; (4) runs exactly the callbacks that were in `_ready` at that moment, so anything they schedule waits for the next iteration. A `Task` is a callback that calls `coro.send(None)`: the coroutine runs until it awaits a future that is not done, the task attaches a "wake me" callback to that future, and it returns to the loop. `await asyncio.sleep(0)` is special: it yields without a future, and the task reschedules itself with `call_soon`.

Trace this program:

```python
import asyncio

async def a():
    print("a1"); await asyncio.sleep(0); print("a2")

async def b():
    print("b1"); await asyncio.sleep(0.01); print("b2")

async def main():
    await asyncio.gather(asyncio.create_task(a()), asyncio.create_task(b()))

asyncio.run(main())
```

| Iteration | Poll timeout | Runs | Prints | `_ready` after | Timers after |
|---|---|---|---|---|---|
| 1 | 0 | `main` step: creates tasks A and B, awaits `gather` | | A.step, B.step | |
| 2 | 0 | A.step: yields at `sleep(0)` and reschedules; B.step: `sleep(0.01)` creates a future and a timer | a1, b1 | A.step | +10 ms: resolve B's future |
| 3 | 0 | A.step resumes and finishes; A's done-callback is scheduled | a2 | gather callback | +10 ms |
| 4 | 0 | gather callback: 1 of 2 done | | | +10 ms |
| 5 | about 9.9 ms: the thread sleeps in `epoll_wait` | Timer fires: B's future resolved, B's wake-up scheduled | | B.wakeup | |
| 6 | 0 | B resumes and finishes | b2 | gather callback | |
| 7 | 0 | gather callback: both done, resolves `main`'s future | | main.wakeup | |
| 8 | 0 | `main` returns; `run` stops the loop | | | |

Output: `a1 b1 a2 b2`. Iteration 5 is the only one where the thread sleeps, and it sleeps inside `epoll_wait` with a timeout computed from the timer heap, which is why an idle asyncio process uses no CPU.

## Node's version: libuv phases

Node's loop (libuv) cycles through phases: **timers** (`setTimeout`, `setInterval`), **pending callbacks** (some deferred I/O errors), idle/prepare (internal), **poll** (I/O events; it blocks here, up to the next timer, unless immediates are pending), **check** (`setImmediate`) and **close callbacks**. Between every individual callback Node drains two queues completely: first all `process.nextTick` callbacks, then all promise **microtasks**, repeating until both are empty.

This ran inside an `fs.readFile` callback (in the poll phase, where the order is deterministic):

```javascript
setTimeout(() => out.push("timeout"), 0);
setImmediate(() => {
  out.push("immediate");
  process.nextTick(() => out.push("tick-in-immediate"));
  Promise.resolve().then(() => out.push("micro-in-immediate"));
});
setImmediate(() => out.push("immediate2"));
Promise.resolve().then(() => { out.push("microtask"); process.nextTick(() => out.push("tick-from-micro")); });
process.nextTick(() => { out.push("nextTick"); Promise.resolve().then(() => out.push("micro-from-tick")); });
```

Node 24 printed `nextTick microtask micro-from-tick tick-from-micro immediate tick-in-immediate micro-in-immediate immediate2 timeout`. Step by step: when the I/O callback returns, the tick queue drains (`nextTick`, which queues a microtask); then the microtask queue drains completely (`microtask`, which queues a tick, then `micro-from-tick`); the drain loop sees a tick again (`tick-from-micro`). The loop moves from poll to **check**: `immediate` runs, and its tick and microtask drain before `immediate2`. Only then does the loop wrap around to **timers**. From the main module, by contrast, `timeout` versus `immediate` order depends on whether 1 ms elapsed before the first timers phase, so it is not guaranteed. The second exercise implements this model; its tests were checked against real Node.

```viz
{"type": "concurrency", "algorithm": "event-loop",
 "title": "One JavaScript thread, two queues",
 "caption": "Synchronous code runs first. The host tracks timers and network I/O outside the JavaScript thread and posts callbacks back. The microtask queue (promises) drains completely before the next macrotask (timer or I/O callback) runs."}
```

Because microtasks drain completely before the loop moves on, a promise chain that keeps scheduling microtasks starves I/O as effectively as a busy loop. Measured costs: a microtask hop (`await null`) is 33 ns; a `setImmediate` hop is 774 ns, because it goes around the loop.

Node also has a hidden thread pool. Sockets go through `epoll`, but file system calls, `dns.lookup` (the blocking `getaddrinfo`), some crypto (`pbkdf2`, `scrypt`) and `zlib` run on libuv's pool of **4 threads by default** (`UV_THREADPOOL_SIZE`). Four slow file reads or DNS lookups make every other one wait.

## `await` is a state machine

`await` does not block the thread. The compiler (or interpreter) turns an async function into a **state machine**: each `await` saves the function's live locals, returns control to the loop, and registers "resume me at state N" as the continuation.

```python
import asyncio
import aiohttp

async def fetch_user(session, uid):
    async with session.get(f"https://api.example.com/users/{uid}") as resp:  # suspends here
        return await resp.json()                                             # and here

async def main():
    async with aiohttp.ClientSession() as session:
        users = await asyncio.gather(*(fetch_user(session, u) for u in range(100)))
        print(len(users))

asyncio.run(main())
```

A hundred requests are in flight on one thread; each `fetch_user` is suspended at an `await` most of the time.

Rust makes the state machine explicit. An `async fn` returns a value implementing `Future`, whose `poll` returns `Ready(value)` or returns `Pending` after arranging for a **waker** to be called when progress is possible. The compiler generates an enum with one variant per suspension point holding exactly the variables live across it, so a task's size is known at compile time (often a few hundred bytes). Futures are **lazy**: nothing happens until something polls them.

Tokio's default runtime is multi-threaded and work-stealing (see the [thread pools lesson](/learn/systems/concurrency/thread-pools-and-work-stealing)), so a task may suspend on one worker and resume on another. That is why `tokio::spawn` requires `Send + 'static`, and it produces one of Rust's most useful compile errors:

```rust
use std::sync::{Arc, Mutex};

async fn write_to_db(_n: u64) {}

async fn record(counter: Arc<Mutex<u64>>) {
    let mut n = counter.lock().unwrap();
    write_to_db(*n).await; // the std MutexGuard is still alive across this .await
    *n += 1;
}

// tokio::spawn(record(counter));
// error: future cannot be sent between threads safely
//        ... `MutexGuard<'_, u64>` is not `Send`
```

The compiler caught a lock held across a suspension point, which would otherwise block every task needing that mutex for as long as the write takes. Drop the guard before the `.await` (scope it in a block), or use `tokio::sync::Mutex` only when you genuinely must hold it.

Go takes the other road: no `async` keyword. Goroutines look like blocking code, but when one blocks on a socket the runtime parks it, registers the descriptor with its netpoller (epoll), and runs another goroutine on the same OS thread; since Go 1.14 a goroutine in a tight loop can be preempted. You get the event loop's efficiency with thread-style code and no "function colouring", at the cost of less explicit control over where switches happen. Java's virtual threads follow the same approach.

## Cooperative scheduling: what blocks the loop

In Node, asyncio and Tokio, a task gives up the thread only at an `await` (or by returning). Between two awaits it runs uninterrupted. Two things therefore stall every task on the loop: **blocking calls** (`time.sleep`, `requests.get`, a synchronous database driver, `fs.readFileSync`, `std::thread::sleep` or `std::fs::read` in a Tokio task) and **CPU-heavy work** (parsing or serialising large documents, catastrophic regex backtracking, password hashing, long pure-Python loops).

Measured, with a timer ticking every 5 ms to record loop lag:

| Work on the loop | Duration | Worst loop lag |
|---|---|---|
| Node: `JSON.stringify` of a 51 MB array | 218 ms | 219 ms (`monitorEventLoopDelay` max) |
| Python: `json.dumps` of a 20 MB list, inline | 83 ms | 82 ms |
| Python: same `json.dumps` via `asyncio.to_thread` | 84 ms | **85 ms** |
| Python: pure-Python loop, 68 ms, inline | 68 ms | 68 ms |
| Python: same loop via `asyncio.to_thread` | 68 ms | 10 ms |

The `to_thread` rows are the lesson inside the lesson. A pure-Python loop in another thread gives up the GIL every 5 ms (`sys.getswitchinterval()`), so the loop stays responsive. `json.dumps` is one C call that holds the GIL from start to finish, so moving it to a thread changes nothing: the loop thread cannot run Python until the call returns. For that kind of work you need a process pool, a library that releases the GIL, or the free-threaded build. And note what the Node histogram did: one 219 ms stall among hundreds of 1 ms samples left the p99 at 1.1 ms. Alert on the maximum, or on lag above a threshold, not on a percentile of samples.

The cost is easy to estimate. A loop serving 5,000 requests per second that blocks for 100 ms delays roughly 500 requests, each by up to 100 ms. Timers fire late; health checks may fail and get the instance killed, which makes things worse.

### Measuring and fixing it

**Measure it.** Node: `perf_hooks.monitorEventLoopDelay()`. Python: `asyncio.run(main(), debug=True)` (or `PYTHONASYNCIODEBUG=1`) makes `_run_once` time every callback and log those slower than `loop.slow_callback_duration` (100 ms by default). Tokio: `tokio-console` shows tasks with long poll times; Tokio also gives each task an operation budget (128 operations per poll by default), so a task whose sockets are always ready is forced to yield; that protects against a busy stream, not against CPU work that never touches a Tokio resource.

**Fix it** by moving the work off the loop, or by chopping it up:

```python
import asyncio
from aiohttp import web

def build_report(body: bytes) -> dict:
    return {"size": len(body)}                           # imagine 800 ms of pure-Python work

async def export_handler(request):
    body = await request.read()
    # report = build_report(body)                        # stalls every request for 800 ms
    report = await asyncio.to_thread(build_report, body)  # a worker thread; the loop stays responsive
    return web.json_response(report)
```

In Tokio the equivalent is `tokio::task::spawn_blocking` (or Rayon for parallel CPU work); in Node, `worker_threads`. For a long loop you control, yield periodically (`await asyncio.sleep(0)`, `tokio::task::yield_now().await`, `setImmediate` between chunks). The first exercise shows what yielding does to the other tasks' finish times.

## Async pitfalls that show up in review

**One thread is not race-free.** Every `await` is a point where other tasks run and may change shared state:

```python
async def withdraw(account, amount, audit_log):
    if account.balance >= amount:           # check
        await audit_log.write(account.id)   # other tasks run here, and may withdraw too
        account.balance -= amount           # act on a stale check
```

There is no data race, and the account can still be overdrawn. Keep check and update with no `await` between them, or hold an `asyncio.Lock` across the sequence.

**Sequential awaits that should be concurrent.** `a = await f(); b = await g()` takes the sum of the latencies; `asyncio.gather(f(), g())`, `Promise.all` or `tokio::join!` takes the maximum.

**Unbounded fan-out.** `gather` over 10,000 URLs opens 10,000 connections, exhausts descriptors and trips the partner's rate limit. Bound it with an `asyncio.Semaphore` ([the semaphores lesson](/learn/systems/concurrency/condition-variables-and-semaphores)).

**Forgotten awaits and lost tasks.** Calling an async function without awaiting creates a coroutine that never runs (Python warns "coroutine was never awaited"; a Rust future does nothing). In Node an unawaited rejected promise is an unhandled rejection, which crashes the process by default. `asyncio.create_task()` returns a task the loop holds only weakly, so without a reference it can be garbage-collected mid-flight; prefer `asyncio.TaskGroup` (3.11+), which owns its tasks and propagates errors.

**Cancellation.** Python cancels a task by raising `CancelledError` at its current `await`; it derives from `BaseException` since 3.8, so `except Exception` no longer swallows it, but a bare `except:` does. Rust cancels a future by *dropping* it at whichever `.await` it is suspended on; `tokio::select!` drops the losing branches, so a branch that had half-read a message loses it, which is why Tokio documents which operations are "cancellation safe".

**No timeouts.** A stuck `await` holds its memory, connection and semaphore permit forever. Wrap external calls: `asyncio.timeout()` (3.11+), `tokio::time::timeout`, `AbortSignal.timeout()`.

**Function colouring.** Async code can call sync code, but sync code cannot `await`; `asyncio.run()` inside a running loop raises `RuntimeError`, and Tokio's `block_on` inside a runtime panics. Decide early which parts of a codebase are async.

## Runtimes compared

| | Node.js | Python asyncio | Rust (Tokio) | Go |
|---|---|---|---|---|
| Threads running your code | 1 (plus `worker_threads`) | 1 per loop | N workers, work stealing | `GOMAXPROCS` |
| Where tasks switch | `await` or callback return | `await` | `.await` | Anywhere (preemptive) |
| Cost of a switch (measured where available) | 33 ns microtask, 774 ns `setImmediate` | 1.0 µs `sleep(0)` round trip | Hundreds of ns (not measured here) | 90–98 ns channel hop |
| A blocking call | Stalls the process | Stalls the loop | Stalls one worker and its queued tasks | Runtime hands the thread's work to another |
| Parallel CPU work | `worker_threads` | Processes, GIL-releasing libraries, free-threaded build | `spawn_blocking`, Rayon | Built in |
| Data races between tasks | Impossible | Impossible within a loop | Prevented by `Send`/`Sync` | Possible; use `-race` |

## Failure modes in production

**Symptom: p99 of every endpoint spikes together, briefly, while average CPU stays low.** Diagnosis: loop lag (Node's `monitorEventLoopDelay` maximum, asyncio debug mode's slow-callback warnings) coincides with one endpoint serialising or computing on the loop. Fix: offload to a worker thread or process (a process, if the work is one GIL-holding C call), or stream the response in chunks.

**Symptom: a Node service that "only does async I/O" has file and DNS latency that grows with load while CPU is idle.** Diagnosis: libuv's 4 pool threads are saturated by `fs` and `dns.lookup`. Fix: raise `UV_THREADPOOL_SIZE`, use `dns.resolve`, cache lookups.

**Symptom: a partner's API starts returning 429s and the service runs out of file descriptors during a batch job.** Diagnosis: unbounded `gather`/`Promise.all` fan-out. Fix: a semaphore or a bounded worker count around the fan-out.

**Symptom: background work silently stops happening, with no errors logged.** Diagnosis: tasks created with `create_task` and no reference were garbage-collected, or exceptions in them were never retrieved. Fix: `TaskGroup`, or keep references in a set and log failures in a done-callback.

**Symptom: data occasionally inconsistent in a single-threaded async service.** Diagnosis: a check-then-act spanning an `await`. Fix: no awaits inside the critical sequence, or an `asyncio.Lock`.

## Interviewer follow-ups

**"Why can one thread serve 10,000 connections?"** Model answer: connections are mostly idle, so the thread sleeps in `epoll_wait` until the kernel reports ready sockets, then runs short callbacks; a connection costs a state object (about 1 KB per asyncio task measured) rather than a thread and stack, and switching is a function call. Common wrong answer: "async makes the I/O faster".

**"What exactly happens when a coroutine hits `await`?"** Model answer: if the awaited future is not done, the task registers a wake-up callback on it and returns to the loop; when the future completes, the callback is scheduled on the ready queue and the task resumes at the saved state. Common wrong answer: "the thread waits for the result".

**"Will `asyncio.to_thread` fix a loop stalled by a big `json.dumps`?"** Model answer: no; `json.dumps` is one C call that holds the GIL, so the loop thread cannot run until it returns (85 ms of lag measured with `to_thread` against 82 ms inline); use a process pool, a GIL-releasing serializer or stream the output. Common wrong answer: "yes, threads run in parallel".

**"In what order do nextTick, promise, setImmediate and setTimeout callbacks run?"** Model answer: after the current callback, all nextTicks, then all microtasks, repeated until both are empty; immediates in the check phase; timeouts in the timers phase; from an I/O callback immediates precede timeouts, from the main module the timeout-versus-immediate order is not guaranteed. Common wrong answer: "setTimeout 0 runs first because its delay is zero".

## What mid-level engineers get wrong

- **CPU-heavy or blocking calls inside async handlers.** Consequence: every request on the loop stalls for the duration.
- **Assuming `to_thread` fixes any CPU work.** Consequence: no improvement for GIL-holding C calls.
- **Alerting on a percentile of loop-delay samples.** Consequence: a 219 ms stall hidden behind a 1.1 ms p99.
- **Sequential awaits for independent calls.** Consequence: latency is the sum instead of the maximum.
- **Unbounded fan-out.** Consequence: descriptor exhaustion and rate-limit bans.
- **Fire-and-forget tasks without references or error handling.** Consequence: silently lost work.

## Exercises

```exercise
id: cooperative-scheduler
title: Finish times under cooperative scheduling
prompt: |
  A single-threaded event loop runs several tasks. `tasks[i]` is a list of
  positive integers: the CPU time of each segment of task `i`. Between
  segments the task awaits something that is immediately ready (like
  `await asyncio.sleep(0)`), which puts it at the **back** of the ready queue.

  At time 0 all tasks are in the ready queue in index order. The loop
  repeatedly takes the task at the front of the queue and runs its next
  segment to completion without interruption. If the task has more segments,
  it goes to the back of the queue; otherwise it is finished.

  Return a list with the time at which each task finishes.
languages: [python, javascript]
entry: cooperative_finish_times
starter:
  python: |
    from collections import deque

    def cooperative_finish_times(tasks):
        ready = deque(range(len(tasks)))
        clock = 0
        finish = [0] * len(tasks)
        # your code here
        return finish
  javascript: |
    function cooperative_finish_times(tasks) {
      const ready = tasks.map((_, i) => i);
      let clock = 0;
      const finish = new Array(tasks.length).fill(0);
      // your code here
      return finish;
    }
tests:
  - args: [[[3], [2], [1]]]
    expected: [3, 5, 6]
    label: no awaits means run to completion in order
  - args: [[[1, 1, 1], [5], [1]]]
    expected: [9, 6, 7]
  - args: [[[5], [1]]]
    expected: [5, 6]
    label: one long segment delays everyone behind it
  - args: [[[1, 1, 1, 1, 1], [1]]]
    expected: [6, 2]
    label: same work, split by awaits
  - args: [[]]
    expected: []
    hidden: true
  - args: [[[2, 2], [1, 3], [4]]]
    expected: [9, 12, 7]
    hidden: true
hints:
  - "Track, for each task, the index of its next segment. Pop from the front of the queue, add the segment's length to the clock, and either re-append the task or record its finish time."
  - "Compare the third and fourth tests: the long task's own finish time barely changes when it yields, but the short task finishes at 2 instead of 6."
```

The third and fourth tests are the whole lesson in two lines. Splitting a 5-unit task into five 1-unit segments costs it one extra unit and lets the short task finish at time 2 instead of 6. Yielding is how a cooperative system keeps its tail latency down.

```exercise
id: node-callback-order
title: Predict Node's callback order
prompt: |
  Model Node's event loop for code running inside an I/O callback (where the
  order is deterministic). `ops` is a list of operations run by that callback,
  in order. Each op is `[kind, label]` or `[kind, label, children]`:

  - `"sync"`: log `label` immediately.
  - `"nextTick"`, `"microtask"`, `"immediate"`, `"timeout"`: schedule a
    callback. When it runs, it logs `label`, then schedules each of its
    `children` in order (children are only `"nextTick"` or `"microtask"` and
    may have children of their own).

  Rules: after the I/O callback and after every callback that runs later,
  drain: run all queued nextTicks (including ones added meanwhile), then all
  queued microtasks (likewise), and repeat until both queues are empty. Then
  the check phase runs each immediate in order, draining after each; then
  the timers phase runs each timeout in order, draining after each.

  Return the list of logged labels.
languages: [python, javascript]
entry: node_order
starter:
  python: |
    from collections import deque

    def node_order(ops):
        out = []
        ticks, micro = deque(), deque()
        immediates, timeouts = [], []
        # your code here
        return out
  javascript: |
    function node_order(ops) {
      const out = [];
      const ticks = [], micro = [], immediates = [], timeouts = [];
      // your code here
      return out;
    }
tests:
  - args: [[["sync", "A"], ["timeout", "T"], ["immediate", "I"], ["microtask", "P"], ["nextTick", "N"], ["sync", "B"]]]
    expected: ["A", "B", "N", "P", "I", "T"]
  - args: [[["microtask", "P1", [["nextTick", "N1"]]], ["nextTick", "N0", [["microtask", "P0"]]]]]
    expected: ["N0", "P1", "P0", "N1"]
    label: a tick queued by a microtask waits for the microtask queue to empty
  - args: [[]]
    expected: []
    label: nothing scheduled
  - args: [[["timeout", "T1", [["microtask", "T1p"], ["nextTick", "T1n"]]], ["timeout", "T2"], ["immediate", "I1", [["microtask", "I1p", [["microtask", "I1pp"]]]]]]]
    expected: ["I1", "I1p", "I1pp", "T1", "T1n", "T1p", "T2"]
    label: drain after each immediate and each timeout
  - args: [[["microtask", "P1", [["microtask", "P2", [["microtask", "P3"]]]]], ["nextTick", "N1"], ["sync", "S"]]]
    expected: ["S", "N1", "P1", "P2", "P3"]
    hidden: true
  - args: [[["immediate", "I1", [["nextTick", "I1n", [["nextTick", "I1nn"]]]]], ["immediate", "I2"], ["timeout", "T", [["microtask", "Tp"]]], ["nextTick", "N", [["microtask", "Np", [["nextTick", "Npn"]]]]]]]
    expected: ["N", "Np", "Npn", "I1", "I1n", "I1nn", "I2", "T", "Tp"]
    hidden: true
hints:
  - "Write three helpers: schedule(op) puts an op in the right queue (or logs a sync op), run(op) logs its label and schedules its children, drain() alternates emptying the tick and microtask queues until both are empty."
  - "Call drain() after the top-level ops, then after each immediate, then after each timeout."
```

## Senior signals

- You describe an event loop as readiness notification plus run-to-completion callbacks, can trace asyncio's `_run_once` iteration by iteration, and know every `await` is a yield point and nothing else is.
- You can order nextTick, microtask, immediate and timeout callbacks in Node and say which orderings are not guaranteed.
- You treat **event-loop lag** as a first-class signal, measure its maximum rather than a percentile of samples, and know how to measure it in your runtime.
- You move blocking and CPU-heavy work off the loop, and you know that with the GIL `to_thread` helps pure-Python work but not a long GIL-holding C call.
- You look for race conditions across `await` points, bound fan-out, put timeouts on external awaits, use task groups and understand cancellation in your runtime.
- You can explain why `tokio::spawn` needs `Send` futures, what a `MutexGuard` across `.await` means, and contrast all of it with Go's preemptive goroutines.

## Check yourself

```quiz
- q: >-
    In a Node.js main module, what does this print? console.log("A"); setTimeout(() => console.log("T"), 0); Promise.resolve().then(() => console.log("P")); process.nextTick(() => console.log("N")); console.log("B");
  options: ["A N P B T", "A B T P N", "A B P N T", "A B N P T"]
  answer: 3
  explanation: >-
    Synchronous code runs first (A, B). Before the loop moves on, Node drains process.nextTick callbacks (N) and then promise microtasks (P). The timer callback (T) runs in the timers phase afterwards. A setTimeout of 0 never runs before already-queued ticks and microtasks.
- q: >-
    An asyncio handler calls json.dumps on a large object and stalls the loop for 80 ms. Moving the call into asyncio.to_thread leaves the stall unchanged. Why?
  options: ["json.dumps is one C call that holds the GIL until it returns", "The thread pool has only one worker and it is always busy", "to_thread runs the function on the loop thread when it is idle", "asyncio suspends timers while any worker thread is running"]
  answer: 0
  explanation: >-
    A pure-Python function in another thread yields the GIL every 5 ms, so the loop keeps running (10 ms worst lag measured). json.dumps is implemented in C and does not release the GIL during serialisation, so the loop thread cannot execute Python until it finishes (85 ms lag measured). Use a process pool, a GIL-releasing library or chunked output.
- q: >-
    A Node service logs event-loop delay with monitorEventLoopDelay and alerts on p99 above 50 ms. A 219 ms JSON.stringify stall happens once a minute and never alerts. Why?
  options: ["monitorEventLoopDelay cannot observe synchronous JavaScript work", "p99 is computed only over samples taken after the last reset", "The histogram's resolution is too coarse to record 219 ms", "The stall is one sample among hundreds, so it never reaches the p99"]
  answer: 3
  explanation: >-
    The monitor records one delay per timer tick; a single blocked tick of 219 ms among hundreds of 1 ms ticks leaves the 99th percentile at about 1 ms, exactly as measured. The maximum (or a count of samples above a threshold) catches it. The monitor does observe synchronous stalls; that is what the 219 ms maximum is.
- q: >-
    In the traced asyncio program, task A awaits asyncio.sleep(0) and task B awaits asyncio.sleep(0.01). Why does a2 print before b2?
  options: ["B's timer is checked only after every task has finished", "sleep(0) blocks the thread briefly, so B cannot run", "Tasks always resume in the order they were created", "sleep(0) reschedules A on the ready queue for the next iteration"]
  answer: 3
  explanation: >-
    sleep(0) yields and the task puts itself back on the ready queue with call_soon, so it resumes on the next iteration; B's resumption needs its 10 ms timer to expire, which happens only after the loop sleeps in epoll_wait. Creation order does not decide resumption, sleep(0) does not block, and timers are checked every iteration.
- q: >-
    A coroutine fetches 100 URLs with `for u in urls: out.append(await fetch(u))`. Each fetch takes 200 ms. Rewriting it with asyncio.gather and a Semaphore(10) brings the total to roughly:
  options: ["About 200 ms", "About 10 seconds", "About 2 seconds", "About 20 seconds"]
  answer: 2
  explanation: >-
    Sequential awaits take 100 × 200 ms = 20 s. With at most 10 in flight, the 100 fetches run in about 10 waves of 200 ms, about 2 s. Unbounded gather might approach 200 ms but risks exhausting connections and tripping rate limits.
- q: >-
    A single-threaded asyncio program checks `if balance >= amount`, then awaits an audit write, then subtracts. Can two concurrent withdrawals overdraw the account?
  options: ["Only if the audit write fails and the task retries it", "Yes: another task can run at the await before the update", "Only on the free-threaded build, where tasks run in parallel", "No, because one thread means there can be no races"]
  answer: 1
  explanation: >-
    There is no data race, but there is a race condition: the await hands control to the loop, another withdrawal passes the same check, and both subtract. Keep check and act together with no await in between, or hold an asyncio.Lock across both.
```
