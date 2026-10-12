---
lesson: io-bound-vs-cpu-bound
source: 1b6cad9c350db751
---
## 1

A service runs at 30 percent CPU with a high 99th percentile latency. Its database pool metrics show requests waiting an average of 80 milliseconds to acquire a connection. What should you do first?

A, find out why each connection is held so long. B, double the pool size on every pod right away. C, profile the CPU to find the hottest functions. D, add more pods so the load spreads across them.

[think]

The answer is A: find out why each connection is held so long.

The time is going to pool waits, so the bottleneck is how long connections are held, through slow queries or work done while holding one, or the database behind them. Check the database's capacity before touching pool sizes. More pods or bigger pools multiply connections to a database that may already be saturated. And a CPU profile cannot see waiting.

## 2

A service handles 1,500 requests a second, and each request holds a downstream connection for 40 milliseconds. Using Little's law, and a target of about 70 percent utilisation, roughly how many connections does the fleet need in total?

A, about 86. B, about 60. C, about 40. D, about 1,500.

[think]

The answer is A: about 86.

On average, the busy connections are 1,500 times 0.04 seconds, which is 60. Running them at 70 percent utilisation needs about 60 divided by 0.7, about 86. Exactly 60 would be 100 percent utilisation, where the queue grows without bound.

## 3

The pidstat tool shows a process at 48 percent CPU with 52 percent in the wait column, zero voluntary context switches, and about 120 involuntary switches a second. The host is 75 percent idle. What is happening?

A, it is waiting on the disk and should show iowait. B, it is spinning on a lock held by another thread. C, it is runnable but denied a core by a limit or a CPU set. D, it is blocked on the network, which is counted as idle.

[think]

The answer is C: it is runnable but denied a core by a limit or a CPU set.

Involuntary switches plus a high wait column mean the thread wanted to keep running, was preempted, and then queued for a CPU. With the host mostly idle, the process must be confined to fewer CPUs than it wants: a cgroup quota, a CPU set, or pinning. A network or disk wait produces voluntary switches and little CPU, and a spin lock burns CPU without queueing for a core.

## 4

On CPython 3.14 with the GIL, each task burns 5 milliseconds of pure-Python CPU, then waits 45 milliseconds on a socket. With a large enough thread pool, what is the throughput ceiling?

A, unlimited, since waiting on a socket releases the GIL. B, about 200 tasks a second, with one core running the CPU parts. C, about 20 tasks a second per thread, times the thread count. D, about 1,600 tasks a second, one per core every 5 milliseconds.

[think]

The answer is B: about 200 tasks a second, with one core running the CPU parts.

The waits overlap freely, because blocking calls release the GIL, but the CPU parts run one at a time: one second divided by 5 milliseconds is 200 tasks a second. Measured, 200 such tasks never finished faster than about one second at any thread count, while the free-threaded build reached 0.21 seconds. Per-thread scaling holds only until the serial CPU part saturates.

## 5

Writing 20 thousand events to a store with a 1 millisecond round trip takes 20 seconds, one at a time. Batching a thousand events per request, with about 0.02 milliseconds per event on the server, takes roughly how long?

A, about 20 milliseconds. B, about 420 milliseconds. C, about 2,000 milliseconds. D, about 20 seconds.

[think]

The answer is B: about 420 milliseconds.

There are 20 batches, each costing 1 millisecond of round trip plus a thousand times 0.02 milliseconds of per-item work: 21 milliseconds a batch, so about 420 overall. Batching removes the repeated fixed cost, not the per-item cost, which is why 20 milliseconds is too optimistic.

## 6

Four pods each have a pool of 10 connections at 75 percent utilisation. The alternative is one shared pool of 40 behind a pooler, also at 75 percent. How do their tails compare?

A, the shared pool's 99th percentile wait is several times lower. B, the shared pool is worse, since the pooler adds a hop. C, they match, since utilisation is identical in both. D, the split pools are better, since pods never contend.

[think]

The answer is A: the shared pool's 99th percentile wait is several times lower.

With split pools, a request can wait on a busy pod while another pod's connections sit idle. Simulated at these numbers, the split pools made 31 percent of requests wait, with a 99th percentile wait of about 21 milliseconds. The shared pool made 5 percent wait, with a 99th percentile of about 2. Utilisation alone does not determine queueing; the number of servers sharing one queue does.
