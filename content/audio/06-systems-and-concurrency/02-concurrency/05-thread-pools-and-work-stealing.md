---
lesson: thread-pools-and-work-stealing
source: 0231286e2b3c9caa
fit: great
desk:
  - "The pool sizing formula and its Little's law cross-check"
  - "The simulated queueing table, one worker against eight, from 50 to 99 percent utilisation"
  - "The rejection policy table and the Java core-size gotcha"
  - "The two-worker Python pool that deadlocks itself"
  - "The Chase-Lev deque trace, and the errgroup and Rayon code"
  - "Exercises: simulate a pool with a bounded queue, and static versus dynamic scheduling"
---
## Introduction

A checkout service handles each request on a thread from a pool of 200, with an unbounded queue in front of it. One afternoon the payment provider slows from 50 milliseconds to 2 seconds per call. Within a minute all 200 threads are blocked on payment calls, the queue holds 90 thousand requests, the heap is climbing, and every request, including the ones that never touch payments, waits minutes for a thread. When the provider recovers, the service spends another ten minutes working through requests whose clients gave up long ago.

Nothing in that story is a bug in the thread pool. It is the pool's design: its size, its queue, what it does when the queue is full, and the fact that one dependency could consume every thread. Those decisions decide how your service behaves under overload, and overload is the only condition in which a pool's design is ever tested.

Four ideas, then. How many threads. Why the queue's bound matters more than the thread count. How a pool deadlocks itself. And how work stealing lets pools scale.

## Why pools exist, and what they cost

Creating an operating system thread costs tens of microseconds and reserves a stack. A thread per request is affordable at 100 requests a second and ruinous at 10 thousand. Worse, thread-per-request means unbounded concurrency: under overload you create more threads, which means more context switches, more memory and less throughput, exactly when you can least afford it.

A pool is a bounded set of long-lived workers and a queue of tasks. It amortises thread creation, it bounds concurrency, and it gives you one place to measure load and apply a policy when there is too much.

It is not free, though. In Python, submitting one task and waiting for it cost about 70 microseconds a task; submitting 20 thousand then collecting them cost about 4. A process pool with the default chunk size of one cost about 250 microseconds a task, because every chunk is pickled and sent through a pipe. Tasks must be much bigger than the dispatch overhead, or you must batch them.

## How many threads

CPU-bound work wants about one thread per core. More threads only add context switches and cache eviction. In Python with the GIL, CPU-bound threads do not run in parallel at all, so that work goes to a process pool.

I/O-bound work wants more threads than cores, because a thread blocked on a socket uses no CPU. The rule of thumb: threads equals cores, times one plus the ratio of waiting time to computing time. An 8-core service whose requests spend 5 milliseconds on CPU and 45 waiting on the database has a ratio of 9, so it wants 8 times 10, which is 80 threads. Little's law agrees: eight cores at 5 milliseconds each saturate at 1,600 requests a second, and at 50 milliseconds per request that is 80 in flight.

Now the part the formula leaves out. Suppose the database connection pool has 20 connections. What does that do to your 80 threads?

[pause]

At most 20 threads can talk to the database at once. The other 60 wait for a connection. Throughput is capped at 20 divided by 45 milliseconds, about 444 requests a second, whatever the thread count. The binding constraint is the tightest resource behind the pool.

Two more adjustments. In a container, "cores" means the CPU quota, not the host's count. And know your defaults: Python's thread pool defaulted to 32 workers on the lesson's machine, whatever the container quota.

## The bound is the feature

An unbounded queue turns overload into latency. Every task still gets done, eventually, after its client has timed out, so the pool spends its capacity on work nobody will read while memory grows.

Queueing theory says how fast waiting grows near saturation. For one server with random arrivals, the mean wait in the queue is utilisation divided by one minus utilisation, times the service time. At 50 percent utilisation, you wait one service time on average. At 80 percent, four. At 90 percent, nine, and the lesson's simulation put the 99th percentile at about 45 service times. More workers flatten the curve at moderate load: eight workers at 90 percent wait less than one service time on average. But every version still explodes as utilisation approaches one.

Two design rules follow. Run latency-sensitive pools well below full utilisation; 70 to 80 percent at peak is a common target. And bound the queue so the longest wait is shorter than the caller's timeout. Ten workers at 100 milliseconds per task drain 100 tasks a second. With a 2-second client timeout, a task at queue position 200 will time out before it starts. A queue bounded at about 100 turns the rest into immediate, cheap rejections the client can retry elsewhere.

When the queue is full, something has to give, and the choice is a product decision disguised as a configuration flag. Reject, and the caller returns a 503 or retries elsewhere: right for serving requests. Caller runs, where the submitting thread runs the task itself: good for batch pipelines because it slows the producer, terrible for an event loop. Block the submitter: fine for internal pipelines, bad for request threads, where overload becomes hung requests. Or drop the oldest or newest: fine for telemetry, wrong for anything with side effects.

Two famous gotchas live here. Java's thread pool creates threads beyond its core size only when the queue rejects a task. So with an unbounded queue, which is what the standard fixed pool uses, the maximum is never reached: configure 10 core and 100 maximum, and you run 10 threads forever while the queue grows. And Python's thread pool has an unbounded internal queue, so submit never blocks; put a bounded semaphore around submit if the producer can outrun the pool.

## Bulkheads

The checkout service had a second problem. Payments and everything else shared one pool, so a slow provider held all 200 threads and the catalogue failed too.

A bulkhead, named after a ship's watertight compartments, gives each downstream dependency its own pool, or a cheaper semaphore. With 40 payment threads, a payment outage blocks at most 40, and the rest of the service keeps serving. Netflix's Hystrix library made this mainstream on the JVM. The cost is utilisation: idle catalogue threads cannot help a busy payments pool. That is the point.

## When a pool deadlocks itself

A task that blocks waiting for another task on the same bounded pool can deadlock it. Picture a pool of two workers. Two parent tasks arrive, and both workers pick one up. Each parent submits a child task to the same pool and waits for its result. Both children sit in the queue, and there is no free worker to run them. In the lesson, that hung five times out of five.

This thread-starvation deadlock is usually disguised: a request handler that fans out to "the shared executor" and waits, while running on a thread from that same executor. The fixes: never block a pool thread on work submitted to the same pool; use separate pools per stage; compose futures asynchronously instead of blocking; or use a fork-join pool, whose join runs other queued tasks while it waits.

## Work stealing

A single shared queue has two scaling problems. Every submit and take touches the same lock and cache lines, so with many workers and small tasks, the queue itself becomes the bottleneck. And a task's data is hot in the cache of the core that created it, but a shared queue hands it to whichever worker happens to be free.

Work stealing gives each worker its own double-ended queue. The owner pushes and pops at the bottom, newest first, so it works on the task whose data is hottest in its cache, with no contention. An idle worker steals from the top of a random victim's deque, oldest first. In divide-and-conquer work the oldest task is the biggest unsplit chunk, so one steal buys a lot of work.

The standard lock-free version is the Chase-Lev deque. The owner alone moves the bottom index; thieves advance the top index with compare-and-swap. The two ends only conflict over the very last element. So the owner's common path is plain loads and stores, and only a steal or a pop of the last element pays for a compare-and-swap. That is why work stealing scales where a shared queue does not.

It runs nearly everywhere. Java's fork-join pool, behind parallel streams. Go's scheduler, where each logical processor has a local queue of 256 goroutines, and an idle one steals half of a random victim's queue. Tokio's multi-threaded runtime. And Rayon in Rust.

The lesson measured why dynamic assignment matters. 800 CPU-bound tasks on 8 workers, with the first 100 tasks 20 times heavier. Static partitioning, where worker zero gets the first hundred tasks and so on, managed a speedup of only 1.3 times, because worker zero got all the heavy tasks, three quarters of the total work. A shared queue, or Go's work-stealing scheduler, got about 7.4 times, within 8 percent of ideal.

In Go you rarely build a pool, because goroutines are cheap enough per task. What you still need is a bound on concurrency, which an error group with a limit provides.

## In the interview

The lesson's follow-up. What happens at 90 percent utilisation?

[pause]

For one server, the mean wait is nine service times, and the 99th percentile around 45. Pools with more workers fare better, but the curve still explodes near full, so latency-sensitive pools run at 70 to 80 percent. The wrong answer is "90 percent means 10 percent headroom, so latency is fine".

And: why bound the queue, if it means rejecting requests? Because an unbounded queue converts overload into latency and memory growth, and the work gets done after its client has left. A bound sized from the client timeout makes overload visible and cheap to handle. "A bigger queue absorbs spikes, so unbounded is safest" is the answer the interviewer is waiting for you not to give.

## Recap

Four things to remember. Size I/O pools from cores times one plus wait over compute, then cap by the tightest resource behind them, like 20 database connections. The queue's bound and rejection policy matter more than the thread count: size the bound from the client timeout, and run latency-sensitive pools at 70 to 80 percent. Give each dependency its own bulkhead, and never block a worker on its own pool. And work stealing, owner newest-first and thieves oldest-first, is how fork-join, Go, Tokio and Rayon scale and balance uneven work.

At your desk: the sizing formula, the queueing table, the rejection policies and the Java gotcha, the self-deadlocking pool, the Chase-Lev trace and code, and the two scheduling exercises.
