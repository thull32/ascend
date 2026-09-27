---
slug: async-and-event-loops
title: "Async and event loops: one thread, ten thousand connections"
description: How Node, asyncio and Tokio run thousands of tasks on few threads, what await compiles to, why one slow callback stalls every request, and the async pitfalls that show up in code review.
minutes: 30
difficulty: medium
tags: [concurrency, async, event-loop, nodejs, asyncio, tokio, cooperative-scheduling, futures]
---
A Node.js API serves 5,000 requests per second with a p99 of 20 ms. Roughly once an hour, p99 jumps to 1.5 seconds on *every* endpoint for a couple of seconds, then recovers. The cause is an admin export endpoint that calls `JSON.stringify` on a 60 MB object. For over a second, the one thread that runs every callback in the process is busy serialising, and every other request, timer and health check waits in line behind it. Nothing is broken. The process is doing exactly what an event loop does.

Event loops are how most modern services handle large numbers of connections: Node.js, Python's asyncio, Rust's Tokio, Netty on the JVM, nginx, Redis. They are extremely efficient for I/O-bound work and unforgiving of anything else. To use them well you need to know what the loop does between your lines of code, what `await` actually compiles to, and exactly which mistakes stall it.

## Why event loops exist

A thread per connection works until you have 10,000 mostly idle connections (websockets, long polls, slow clients). That is 10,000 stacks and a context switch every time any of them becomes active. The "C10k problem" of the late 1990s was the observation that servers of the day fell over well before hardware limits because of exactly this.

An event loop inverts the model. One thread asks the kernel which sockets are ready (with `epoll` on Linux or `kqueue` on BSD and macOS, covered in [I/O and system calls](/learn/systems/operating-systems/io-and-syscalls)), runs a short piece of code for each ready event, and goes back to asking. Nothing ever blocks on a single socket. A connection costs a small state object instead of a stack, and switching between connections is a function call instead of a context switch.

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
2. **All your code runs on one thread.** There are no data races between callbacks, because only one runs at a time. There can still be race conditions, as you will see.

### Node's version

Node's loop (libuv) cycles through phases: **timers** (`setTimeout`, `setInterval`), pending callbacks, **poll** (I/O events), **check** (`setImmediate`) and close callbacks. Between every individual callback, Node drains two queues completely: first `process.nextTick` callbacks, then promise **microtasks**. That ordering determines what this prints:

```javascript
console.log("A");
setTimeout(() => console.log("timeout"), 0);
setImmediate(() => console.log("immediate"));
Promise.resolve().then(() => console.log("microtask"));
process.nextTick(() => console.log("nextTick"));
console.log("B");
// A, B, nextTick, microtask, then timeout and immediate.
// (From the main module, timeout-vs-immediate order is not guaranteed.)
```

```viz
{"type": "concurrency", "algorithm": "event-loop",
 "title": "One JavaScript thread, two queues",
 "caption": "Synchronous code runs first. The host tracks timers and network I/O outside the JavaScript thread and posts callbacks back. The microtask queue (promises) drains completely before the next macrotask (timer or I/O callback) runs."}
```

Because microtasks drain completely before the loop moves on, a promise chain that keeps scheduling more microtasks starves I/O as effectively as a busy loop.

Node also has a hidden thread pool. Network sockets go through `epoll`, but file system calls, `dns.lookup` (which calls the blocking `getaddrinfo`), some crypto (`pbkdf2`, `scrypt`) and `zlib` run on libuv's pool of **4 threads by default** (`UV_THREADPOOL_SIZE`). Four slow file reads or DNS lookups can make every other file read and DNS lookup in the process wait, which is a surprising source of latency in services that "only do async I/O".

## `await` is a state machine

`await` does not block the thread. The compiler (or the interpreter) turns an async function into a **state machine**: each `await` is a point where the function saves its local variables, returns control to the loop, and registers "resume me at state N" as the continuation for when the awaited operation completes.

In Python:

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

A hundred requests are in flight concurrently on one thread. Each `fetch_user` is suspended at an `await` most of the time; the loop resumes whichever one has data ready.

Rust makes the state machine explicit. An `async fn` returns a value implementing `Future`, whose `poll` method either returns `Ready(value)` or returns `Pending` after arranging for a **waker** to be called when progress is possible. Futures are **lazy**: nothing happens until something polls them, so an async function that is called but never awaited or spawned does no work at all.

Tokio's default runtime is multi-threaded and work-stealing (as in the [thread pools lesson](/learn/systems/concurrency/thread-pools-and-work-stealing)), so a spawned task may be polled on one worker thread, suspend, and resume on another. That is why `tokio::spawn` requires the future to be `Send + 'static`, and it produces one of Rust's most useful compile errors:

```rust
use std::sync::{Arc, Mutex};

async fn record(counter: Arc<Mutex<u64>>, db: Arc<Db>) {
    let mut n = counter.lock().unwrap();
    db.write(*n).await; // the std MutexGuard is still alive across this .await
    *n += 1;
}

// tokio::spawn(record(counter, db));
// error: future cannot be sent between threads safely
//        ... `MutexGuard<'_, u64>` is not `Send`
```

The compiler has caught a lock held across a suspension point, which would otherwise block every other task needing that mutex for as long as the database write takes. Drop the guard before the `.await` (scope it in a block), or use `tokio::sync::Mutex`, whose guard is designed to be held across awaits, only when you genuinely need to.

Go takes the other road: there is no `async` keyword at all. Goroutines look like blocking code, but when one blocks on a socket the runtime parks it and registers the file descriptor with its internal netpoller (which uses `epoll`), then runs another goroutine on the same OS thread. Since Go 1.14 the scheduler can also preempt a goroutine in a tight loop. You get the event loop's efficiency with thread-style code and no "function colouring", at the cost of less explicit control over where switches happen. Java's virtual threads follow the same approach.

## Cooperative scheduling: the loop only switches at `await`

In Node, asyncio and Tokio, a task gives up the thread only at an `await` (or by returning). Between two awaits it runs uninterrupted, however long that takes. This is **cooperative scheduling**, and it has two failure modes.

**Blocking calls inside async code.** `time.sleep`, `requests.get`, a synchronous database driver, `fs.readFileSync`, `std::thread::sleep` or `std::fs::read` inside a Tokio task. The call blocks the loop's thread, so every task on it stops.

**CPU-heavy work.** Parsing or serialising a large JSON document, a regex with catastrophic backtracking, password hashing, image resizing, sorting a million records, a long pure-Python loop.

The cost is easy to estimate. A loop serving 5,000 requests per second that blocks for 100 ms delays roughly 500 requests' worth of work, and every one of them gets 100 ms added to its latency. Timers fire late; health checks may fail and get the instance killed, making things worse.

**Measure it.** Event-loop lag (how late a timer fires compared with when it was scheduled) is the single most useful health metric for an async service:

- Node: `perf_hooks.monitorEventLoopDelay()` gives a histogram; alert on its p99.
- Python: run with `asyncio.run(main(), debug=True)` (or `PYTHONASYNCIODEBUG=1`) and the loop logs every callback slower than `loop.slow_callback_duration`, 100 ms by default.
- Tokio: `tokio-console` shows tasks with long poll times. Tokio also gives each task an operation budget, so a task that keeps finding its sockets ready is forced to yield periodically; that protects against a busy stream, not against CPU work that never touches a Tokio resource.

**Fix it** by moving the work off the loop, or by chopping it up:

```python
async def export_handler(request):
    body = await request.read()
    # report = build_report(body)                        # 800 ms of CPU: stalls every request
    report = await asyncio.to_thread(build_report, body)  # runs on a worker thread
    return web.json_response(report)
```

In Tokio the equivalent is `tokio::task::spawn_blocking` (or Rayon for parallel CPU work); in Node, `worker_threads`. For a long loop you control, yield periodically (`await asyncio.sleep(0)`, `tokio::task::yield_now().await`, or `setImmediate` between chunks) so other tasks get a turn. With CPython's GIL, `to_thread` keeps the loop *responsive* (the GIL is handed back every 5 ms) but does not make pure-Python CPU work any faster; for throughput you need processes or the free-threaded build.

## Async pitfalls that show up in review

**One thread is not race-free.** Every `await` is a point where other tasks run and may change shared state. A check-then-act that spans an await is a race condition exactly like the threaded version:

```python
async def withdraw(account, amount):
    if account.balance >= amount:           # check
        await audit_log.write(account.id)   # other tasks run here, and may withdraw too
        account.balance -= amount           # act on a stale check
```

There is no data race (one thread), and the account can still be overdrawn. Do the check and the update with no `await` between them, or hold an `asyncio.Lock` across the whole sequence.

**Sequential awaits that should be concurrent.** `a = await f(); b = await g()` takes the sum of the two latencies; `a, b = await asyncio.gather(f(), g())` takes the maximum. The JavaScript equivalent is `Promise.all`; in Rust, `tokio::join!`.

**Unbounded fan-out.** The opposite mistake: `gather` over 10,000 URLs opens 10,000 connections, exhausts file descriptors and trips the partner's rate limit. Bound concurrency with an `asyncio.Semaphore`, as in [the semaphores lesson](/learn/systems/concurrency/condition-variables-and-semaphores).

**Forgotten awaits and lost tasks.** In Python, calling an async function without awaiting it creates a coroutine that never runs (with a warning that the coroutine "was never awaited"); a Rust future that is never awaited or spawned also does nothing. In Node, a rejected promise nobody awaits becomes an unhandled rejection, which crashes the process by default in current versions. In Python, `asyncio.create_task()` returns a task the loop holds only weakly: if you do not keep a reference, it can be garbage-collected mid-flight. Prefer structured concurrency, `asyncio.TaskGroup` (Python 3.11+), which owns its tasks and propagates their errors.

**Cancellation.** Python cancels a task by raising `CancelledError` at its current `await`; since 3.8 it derives from `BaseException`, so `except Exception` no longer swallows it, but a bare `except:` still does. Rust cancels a future by *dropping* it, at whichever `.await` it is suspended on, and nothing after that point runs. `tokio::select!` drops the branches that lose, so a branch that had half-read a message loses it; Tokio documents which of its operations are "cancellation safe" for exactly this reason.

**No timeouts.** A stuck `await` holds its memory, its connection and its semaphore permit forever. Wrap external calls: `asyncio.timeout()` (3.11+), `tokio::time::timeout`, `AbortSignal.timeout()` with `fetch`.

**Function colouring.** Async code can call sync code, but sync code cannot `await`. Bridging the other way is awkward: `asyncio.run()` inside a running loop raises `RuntimeError`, and calling a Tokio runtime's `block_on` from inside a runtime panics. Decide early which parts of a codebase are async.

| | Node.js | Python asyncio | Rust (Tokio) | Go |
|---|---|---|---|---|
| Threads running your code | 1 (plus `worker_threads`) | 1 per loop | N workers, work stealing | `GOMAXPROCS` |
| Where tasks switch | `await` or callback return | `await` | `.await` | Anywhere (preemptive) |
| A blocking call | Stalls the process | Stalls the loop | Stalls one worker and the tasks queued on it | Runtime hands the thread's work to another |
| Parallel CPU work | `worker_threads` | Processes, or free-threaded build | `spawn_blocking`, Rayon | Built in |
| Data races between tasks | Impossible | Impossible within a loop | Prevented by `Send`/`Sync` | Possible; use `-race` |

## Exercise: simulate cooperative scheduling

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

The third and fourth tests are the whole lesson in two lines. Splitting a 5-unit task into five 1-unit segments costs it one extra unit, and lets the short task finish at time 2 instead of 6. Yielding is how a cooperative system keeps its tail latency down.

## Senior signals

- You describe an event loop as readiness notification plus run-to-completion callbacks, and you know every `await` is a yield point and nothing else is.
- You treat **event-loop lag** as a first-class SLI and know how to measure it in your runtime.
- You move blocking and CPU-heavy work off the loop (`to_thread`, `spawn_blocking`, `worker_threads`) and know that with the GIL this buys responsiveness, not throughput. You know Node's libuv pool defaults to 4 threads.
- You look for race conditions across `await` points even in single-threaded code.
- You bound fan-out, put timeouts on every external await, keep references to tasks (or use task groups) and understand cancellation semantics in your runtime.
- You can explain why `tokio::spawn` needs `Send` futures and what the compiler is telling you when a `MutexGuard` is held across `.await`; you can contrast all of this with Go's preemptive goroutines.

## Check yourself

```quiz
- q: >-
    In a Node.js main module, what does this print? console.log("A"); setTimeout(() => console.log("T"), 0); Promise.resolve().then(() => console.log("P")); process.nextTick(() => console.log("N")); console.log("B");
  options: ["A B T P N", "A B N P T", "A N P B T", "A B P N T"]
  answer: 1
  explanation: >-
    Synchronous code runs first (A, B). Before the loop moves to its next phase, Node drains process.nextTick callbacks (N) and then promise microtasks (P). The timer callback (T) runs in the timers phase afterwards. A setTimeout of 0 never runs before already-queued microtasks.
- q: >-
    An asyncio service's p99 latency spikes on all endpoints whenever one report endpoint is called, but CPU usage stays under 20%. What is the most likely cause?
  options: ["The report endpoint exhausts the database connection pool", "The report endpoint runs CPU-heavy or blocking code on the event loop thread, stalling every other task", "asyncio has a global lock per endpoint", "The GIL prevents concurrent requests"]
  answer: 1
  explanation: >-
    One thread runs every coroutine, and it only switches at awaits. A long synchronous stretch holds it; average CPU stays low because it is one core out of many. Run with debug=True to find slow callbacks, then offload with asyncio.to_thread or a process pool.
- q: >-
    A coroutine fetches 100 URLs with `for u in urls: out.append(await fetch(u))`. Each fetch takes 200 ms. Rewriting it with asyncio.gather and a Semaphore(10) brings the total to roughly:
  options: ["20 seconds, unchanged", "2 seconds", "200 ms", "10 seconds"]
  answer: 1
  explanation: >-
    Sequential awaits take 100 × 200 ms = 20 s. With at most 10 in flight, the 100 fetches run in about 10 waves of 200 ms, so about 2 s. Unbounded gather might approach 200 ms but risks exhausting connections and tripping rate limits.
- q: >-
    tokio::spawn(task) fails with "future cannot be sent between threads safely", pointing at a std::sync::MutexGuard. What is the compiler telling you?
  options: ["std::sync::Mutex cannot be used with Tokio at all", "The guard is held across an .await; the task may resume on another worker thread, and the guard is not Send", "The future is too large to spawn", "Tokio requires every future to be Sync"]
  answer: 1
  explanation: >-
    Tokio's work-stealing runtime can move a suspended task between threads, so spawned futures must be Send. A std MutexGuard is not Send, and holding it across .await would also block other tasks for the duration. Drop the guard before awaiting, or use tokio::sync::Mutex if you truly must hold it. std::sync::Mutex is fine when the guard never crosses an await.
- q: >-
    A single-threaded asyncio program checks `if balance >= amount`, then awaits an audit write, then subtracts. Can two concurrent withdrawals overdraw the account?
  options: ["No: one thread means no races", "Yes: another task can run at the await between the check and the update", "Only on the free-threaded build", "Only if the audit write fails"]
  answer: 1
  explanation: >-
    There is no data race, but there is a race condition: the await hands control to the loop, another withdrawal passes the same check, and both subtract. Keep check and act together with no await in between, or hold an asyncio.Lock across both.
```
