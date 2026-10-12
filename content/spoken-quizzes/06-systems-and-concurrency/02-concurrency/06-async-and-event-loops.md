---
lesson: async-and-event-loops
source: be5ad2e98cb0d2c1
---
## 1

In a Node.js main module, the code logs start; then schedules a zero-delay set timeout that logs timer; then resolves a promise whose then-callback logs promise; then queues a process next tick that logs tick; and finally logs end. In what order do the lines print?

A, start, tick, promise, end, timer. B, start, end, timer, promise, tick. C, start, end, promise, tick, timer. D, start, end, tick, promise, timer.

[think]

The answer is D: start, end, tick, promise, timer.

Synchronous code runs first, so start and end. Before the loop moves on, Node drains the next-tick callbacks, then the promise microtasks. The timer callback runs afterwards, in the timers phase. A zero-delay timeout never runs before ticks and microtasks that are already queued.

## 2

An asyncio handler serialises a large object to JSON and stalls the event loop for 80 milliseconds. Moving the call into a worker thread with asyncio's to-thread leaves the stall unchanged. Why?

A, the JSON dump is one C call that holds the GIL until it returns. B, the thread pool has only one worker, and it is always busy. C, to-thread runs the function on the loop thread when it is idle. D, asyncio suspends timers while any worker thread is running.

[think]

The answer is A: the JSON dump is one C call that holds the GIL until it returns.

A pure-Python function in another thread gives up the GIL every 5 milliseconds, so the loop keeps running; the lesson measured a 10 millisecond worst lag. The JSON dump is implemented in C and does not release the GIL while it serialises, so the loop thread cannot run Python until it finishes: 85 milliseconds of lag. Use a process pool, a library that releases the GIL, or chunked output.

## 3

A Node service measures event-loop delay with the built-in delay monitor, and alerts when the 99th percentile goes above 50 milliseconds. A 219 millisecond stall from JSON stringify happens once a minute, and never alerts. Why?

A, the delay monitor cannot observe synchronous JavaScript work. B, the 99th percentile is computed only over samples taken since the last reset. C, the histogram's resolution is too coarse to record 219 milliseconds. D, the stall is one sample among hundreds, so it never reaches the 99th percentile.

[think]

The answer is D: the stall is one sample among hundreds, so it never reaches the 99th percentile.

The monitor records one delay per timer tick. A single blocked tick of 219 milliseconds among hundreds of 1 millisecond ticks leaves the 99th percentile at about 1 millisecond, exactly as measured. The maximum, or a count of samples above a threshold, catches it. The monitor does observe synchronous stalls; that is what the 219 millisecond maximum is.

## 4

In an asyncio program, task A awaits a sleep of zero, and task B awaits a sleep of 10 milliseconds. Each prints a line once its await returns. Why does A's line print before B's?

A, B's timer is checked only after every task has finished. B, a sleep of zero blocks the thread briefly, so B cannot run. C, tasks always resume in the order they were created. D, a sleep of zero puts A back on the ready queue for the next iteration.

[think]

The answer is D: a sleep of zero puts A back on the ready queue for the next iteration.

A sleep of zero yields, and the task schedules itself back onto the ready queue with call soon, so it resumes on the next iteration. B's resumption needs its 10 millisecond timer to expire, which happens only after the loop sleeps in epoll wait. Creation order does not decide resumption, a sleep of zero does not block, and timers are checked on every iteration.

## 5

A coroutine fetches 100 URLs in a loop, awaiting each fetch before starting the next. Each fetch takes 200 milliseconds. Rewriting it with asyncio gather, and a semaphore of 10, brings the total to roughly what?

A, about 200 milliseconds. B, about 10 seconds. C, about 2 seconds. D, about 20 seconds.

[think]

The answer is C: about 2 seconds.

Sequential awaits take 100 times 200 milliseconds, which is 20 seconds. With at most 10 in flight, the 100 fetches run in about 10 waves of 200 milliseconds, about 2 seconds. An unbounded gather might approach 200 milliseconds, but it risks exhausting connections and tripping rate limits.

## 6

A single-threaded asyncio program checks that the balance is at least the amount, then awaits an audit write, then subtracts. Can two concurrent withdrawals overdraw the account?

A, only if the audit write fails and the task retries it. B, yes: another task can run at the await, before the update. C, only on the free-threaded build, where tasks run in parallel. D, no, because one thread means there can be no races.

[think]

The answer is B: yes, another task can run at the await, before the update.

There is no data race, but there is a race condition. The await hands control to the loop, another withdrawal passes the same check, and both subtract. Keep the check and the act together with no await in between, or hold an asyncio lock across both.
