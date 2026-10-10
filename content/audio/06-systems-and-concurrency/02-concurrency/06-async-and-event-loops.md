---
lesson: async-and-event-loops
source: 08d80fe2db98da7f
fit: partial
desk:
  - "The asyncio loop traced iteration by iteration for the two-task program"
  - "The Node callback-ordering program and its printed order, phase by phase"
  - "The Rust MutexGuard held across an await, and the compile error it produces"
  - "The loop-lag measurement table, including the to-thread rows"
  - "The runtimes comparison table: Node, asyncio, Tokio and Go"
  - "Exercises: finish times under cooperative scheduling, and predict Node's callback order"
---
## Introduction

A Node API serves 5 thousand requests a second with a 99th percentile of 20 milliseconds. Roughly once an hour, the 99th percentile jumps to one and a half seconds on every endpoint, for a couple of seconds, then recovers.

The cause is an admin export endpoint that serialises a 60 megabyte object to JSON. For over a second, the one thread that runs every callback in the process is busy serialising, and every other request, timer and health check waits in line behind it. Nothing is broken. The process is doing exactly what an event loop does.

Event loops are how most modern services handle large numbers of connections: Node, Python's asyncio, Rust's Tokio, Netty, nginx, Redis. They are extremely efficient for I/O-bound work and unforgiving of anything else. Four ideas: what the loop does, what await really is, what stalls the loop, and the race conditions you still get on one thread.

## Why one thread is enough

A thread per connection works until you have 10 thousand mostly idle connections: websockets, long polls, slow clients. That is 10 thousand stacks, and a context switch every time one becomes active.

An event loop inverts the model. One thread asks the kernel which sockets are ready, with epoll on Linux, runs a short piece of code for each ready event, and asks again. Nothing blocks on a single socket. A connection costs a small state object instead of a stack. The lesson measured a parked asyncio task at about a kilobyte, and a round trip through the loop at about one microsecond.

Stripped to its skeleton, every loop is the same. Run every callback that is ready right now. Work out how long until the next timer. Sleep in epoll until either a socket is ready or that timer is due, which is the only place the thread ever sleeps. Collect the new ready callbacks, and go round again.

Two properties follow, and everything else is a consequence. Callbacks run to completion: the loop cannot check for events, fire a timer, or run anyone else's code until your callback returns or your coroutine reaches an await. And all your code runs on one thread, so there are no data races between callbacks. There can still be race conditions.

## The loop, traced

The lesson traces a tiny asyncio program iteration by iteration. Two tasks. Task A prints a1, awaits a zero-second sleep, then prints a2. Task B prints b1, awaits a 10-millisecond sleep, then prints b2. Before I say it: in what order do the four lines print?

[pause]

a1, b1, a2, b2. A zero-second sleep yields without waiting for anything: the task just puts itself back on the ready queue, so it resumes on the very next iteration. B's sleep creates a timer, and B only resumes once the loop has slept in epoll for the remaining ten milliseconds or so and the timer has fired. That sleep is the only moment in the whole run the thread is idle, which is why an idle asyncio process uses no CPU.

Node's loop, from libuv, cycles through phases: timers, then the poll phase for I/O, then a check phase for set-immediate callbacks, among others. And between every single callback, Node drains two queues completely: first all process-next-tick callbacks, then all promise microtasks, repeating until both are empty. So from the main module, synchronous code runs first, then next-ticks, then promises, and a zero-millisecond timeout comes after all of them.

Because microtasks drain completely before the loop moves on, a promise chain that keeps scheduling more microtasks starves I/O as effectively as a busy loop.

Node also has a hidden thread pool. Sockets go through epoll, but file system calls, DNS lookups through the system resolver, some crypto and compression run on libuv's pool of 4 threads by default. Four slow file reads or DNS lookups make every other one wait.

## Await is a state machine

Await does not block the thread. The compiler turns an async function into a state machine: each await saves the function's live local variables, returns control to the loop, and registers "resume me at state N" as the continuation. When the awaited thing completes, a wake-up is scheduled on the ready queue, and the function resumes where it left off. A hundred HTTP requests can be in flight on one thread, each one suspended at an await most of the time.

Rust makes this explicit. An async function returns a future, which is lazy: nothing happens until something polls it. Polling either returns the value, or returns "pending" after arranging for a waker to be called when progress is possible.

Tokio's default runtime is multi-threaded and work-stealing, so a task may suspend on one worker and resume on another. That is why spawning a task requires it to be safe to send between threads, and it produces one of Rust's most useful compile errors. Hold a standard mutex guard across an await, and the future cannot be sent between threads. The compiler has just caught a lock held across a suspension point, which would otherwise block every task needing that mutex for as long as the await takes. Drop the guard before the await.

Go takes the other road. There is no async keyword. Goroutines look like blocking code, but when one blocks on a socket, the runtime parks it, registers the socket with its own epoll-based poller, and runs another goroutine on the same thread. Since Go 1.14, a goroutine in a tight loop can be preempted. You get the event loop's efficiency with thread-style code, at the cost of less explicit control over where switches happen. Java's virtual threads follow the same approach.

## What blocks the loop

In Node, asyncio and Tokio, a task gives up the thread only at an await, or by returning. Between two awaits it runs uninterrupted. So two things stall every task on the loop: blocking calls, like a synchronous sleep, a synchronous HTTP client or database driver, or a synchronous file read; and CPU-heavy work, like serialising a big document, catastrophic regex backtracking, password hashing, or long pure-Python loops.

The cost is easy to estimate. A loop serving 5 thousand requests a second that blocks for 100 milliseconds delays roughly 500 requests, each by up to 100 milliseconds. Timers fire late. Health checks may fail and get the instance killed, which makes things worse.

The lesson measured something counterintuitive in Python. A 68-millisecond pure-Python loop, run inline, stalled the event loop for 68 milliseconds. Moved to a worker thread with asyncio's to-thread, the worst stall dropped to 10 milliseconds, because a pure-Python thread gives up the GIL every 5 milliseconds. Now the same trick with a big JSON dump, which took about 83 milliseconds. Inline, an 82 millisecond stall. With to-thread?

[pause]

85 milliseconds. No better at all. JSON dumping is one C call that holds the GIL from start to finish, so the loop thread cannot run any Python until it returns. For that kind of work you need a process pool, a library that releases the GIL, or the free-threaded build.

And a measurement lesson. In Node, one 219-millisecond stall among hundreds of one-millisecond samples left the 99th percentile of loop delay at 1.1 milliseconds. Alert on the maximum, or on lag above a threshold, not on a percentile of samples.

To fix it: move the work off the loop, to a worker thread, a blocking-task pool in Tokio, or worker threads in Node. Or, for a long loop you control, chop it up and yield between chunks. Yielding barely changes the long task's own finish time, and it lets the short tasks behind it finish early. That is how a cooperative system keeps its tail latency down.

## Pitfalls in review

One thread is not race-free. Every await is a point where other tasks run and may change shared state. A withdraw function checks that the balance covers the amount, then awaits an audit-log write, then subtracts. Two withdrawals both pass the check before either subtracts, and the account is overdrawn. No data race, a real race condition. Keep the check and the update with no await between them, or hold an async lock across the sequence.

Sequential awaits that should be concurrent. Awaiting one call, then another, takes the sum of their latencies; gathering them takes the maximum. A hundred fetches of 200 milliseconds each, one after another, take 20 seconds.

Unbounded fan-out. Gathering 10 thousand URLs opens 10 thousand connections, exhausts file descriptors and trips the partner's rate limit. Bound it with a semaphore: with 10 at a time, those hundred fetches take about 2 seconds.

Lost tasks. In Python, a task created and not referenced is held only weakly by the loop and can be garbage-collected mid-flight; prefer a task group, which owns its tasks and propagates errors. In Node, an unawaited rejected promise crashes the process by default.

Cancellation. Python cancels a task by raising an exception at its current await, and a bare except swallows it. Rust cancels a future by dropping it wherever it is suspended, so a branch that had half-read a message loses it. And put timeouts on every external await, because a stuck await holds its memory, connection and semaphore permit forever.

## In the interview

A follow-up the lesson expects. What exactly happens when a coroutine hits await?

[pause]

If the awaited future is not done, the task registers a wake-up callback on it and returns to the loop. When the future completes, that callback is scheduled on the ready queue, and the task resumes at its saved state. The wrong answer is "the thread waits for the result".

And: why can one thread serve 10 thousand connections? Because connections are mostly idle, so the thread sleeps in epoll until the kernel reports ready sockets, then runs short callbacks. A connection costs a state object, about a kilobyte per asyncio task, rather than a thread and a stack, and switching is a function call. "Async makes the I/O faster" is the wrong answer.

## Recap

Four things to remember. An event loop is readiness notification plus callbacks that run to completion, and every await is a yield point and nothing else is. Await compiles to a state machine that registers a wake-up and returns to the loop. Anything blocking or CPU-heavy between awaits stalls every request, so measure the maximum loop lag, and remember that with the GIL, a worker thread helps pure-Python work but not one long C call. And one thread still has race conditions across awaits; bound your fan-out and put timeouts on external calls.

At your desk: the asyncio trace, the Node ordering program, the Rust guard-across-await error, the lag measurements, the runtimes table, and the two exercises.
