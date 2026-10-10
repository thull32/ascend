---
lesson: io-bound-vs-cpu-bound
source: 36fb0e2de9c0d8ca
fit: great
desk:
  - "The vmstat and pidstat output, read column by column"
  - "The Erlang C pool-size table and the threads, processes and free-threading table"
  - "The SQLite batching table and the errgroup overlap example"
  - "Exercise: simulate waiting for a connection pool"
---
## Introduction

Checkout latency climbs every evening. CPU on the service's pods sits at 25 percent. The on-call engineer doubles the pods from 8 to 16, the standard response to "slow", and latency gets worse. Twenty minutes later the database starts refusing connections.

Each pod held a pool of 25 database connections. Doubling the pods took the database from 200 connections to 400, past its limit of 300, and the connections it did accept all fought over the same 16 database cores.

The service was never short of CPU. Its requests spent their time waiting for a database connection, and adding pods added more waiters to the same bottleneck. "Is this CPU-bound or I/O-bound?" sounds like a textbook question, but getting it wrong in production turns a slow evening into an outage, because the right fix for one is often the wrong fix for the other. Four ideas: telling the kinds of slow apart, sizing a pool with Little's law, what threads and processes buy, and batching.

## Four kinds of slow

CPU-bound: cores busy, a run queue longer than the cores you're allowed. Less work or more cores helps; more threads than cores does not. I/O-bound, or bound on a downstream: cores mostly idle, threads blocked. More concurrency helps, up to the downstream's limit; faster code does not. Memory-bound: cores look busy but do little per cycle; layout helps. And contention: one hot thread, a lock, or a pool, with long waits to acquire while other cores idle.

The opening incident was the last kind dressed as the second: I/O-bound on the database, and contention-bound on the pool in front of it.

How do you tell from outside? The lesson ran three programs at once on a 32-thread machine. One slept in a loop, like a service waiting on a fast downstream. Four spun in pure Python, confined to 2 CPUs, like a container with a CPU limit. And one committed a database row per transaction.

The machine-wide view said 75 percent idle. Nothing looked wrong, because it averaged over all 32 CPUs. The per-process view told the truth. The sleeper made about 900 voluntary context switches a second at about 1 percent CPU: blocking constantly while using nothing is the signature of waiting. Each spinner wanted a whole CPU, got 48 percent, and spent 52 percent runnable but queued, with all its switches involuntary: the scheduler preempting a thread that wanted to keep running. That is CPU starvation, invisible in the host numbers. And the committer also blocked voluntarily, but on the disk, about 13 milliseconds per commit, waiting for fsync.

Voluntary switches with low CPU means waiting. Involuntary switches with high wait means runnable but denied a core. Linux's pressure stall files confirm saturation directly, scoped to the container.

From inside, the cheapest diagnostic is CPU time divided by wall-clock time: cores busy. Eight CPU-bound Python tasks on eight threads kept exactly 1 core busy. A serial bottleneck, here the GIL. And for I/O-bound services, the single most useful metric is the time spent waiting to acquire a pooled resource. If that's a large fraction of latency, the pool, or what's behind it, is the bottleneck, whatever the CPU graph says.

## Little's law and pool sizing

Little's law: the average number of things inside a system equals the arrival rate times the time each spends inside. No assumptions about distributions.

A service handling 2 thousand requests a second, each holding a connection for 15 milliseconds, keeps 30 connections busy on average. Before I go on: what happens with a pool of exactly 30?

[pause]

It's 100 percent utilised, and its queue grows without bound. So how much more than 30? The lesson modelled the pool as a queue with random arrivals and random hold times, and checked the model against a simulation. With 31 connections, 97 percent busy, 80 percent of requests wait, and the 99th percentile wait is 93 milliseconds. With 35 connections, 86 percent busy, the 99th percentile wait is under 10. Four extra connections cut the tail tenfold. With 43, 70 percent busy, almost nobody waits.

Latency is flat until utilisation is high, then goes vertical. For a single server it's stark: time in the system is the service time divided by one minus utilisation. Twice the service time at 50 percent busy, five times at 80, ten at 90, a hundred at 99.

And pooling matters as much as size. Four pods with a pool of 10 each, against one shared pool of 40, same 75 percent load. The split pools made 31 percent of requests wait, with a 99th percentile wait of about 21 milliseconds. The shared pool: 5 percent waited, 99th percentile about 2. Same connections, same load, nine times the tail, because a busy pod cannot borrow an idle pod's connection. A pooler like PgBouncer in front of the database is that shared pool.

The rule: size the bottleneck for about 70 percent utilisation at peak, so 43 here across the fleet. And the database sets the ceiling. Total connections are pods times pool size, so autoscaling pods silently multiplies them, exactly as in the opening. Derive pool sizes from the downstream's capacity divided by the fleet size, not from the client's own load.

## Threads, processes and the GIL

Three workloads on Python 3.14, with the GIL and on the free-threaded build.

Pure computation. Eight tasks took 2.1 seconds sequentially. On 8 threads with the GIL: still 2.2 seconds, one core busy. On 8 processes: 0.36 seconds. On 8 threads in the free-threaded build: 0.39.

Pure waiting. 64 sleeps of 50 milliseconds on 64 threads: 65 milliseconds total. Sleeping releases the GIL, so threads scale waits perfectly.

And the interesting one: a mixed task that burns 5 milliseconds of Python CPU, then waits 45, like a request handler that parses and then waits on a socket. 200 of them. One thread: about 10 seconds. 8 threads: 1.3. 16 threads: 1.0. 64 threads: still 1.0. Why the wall?

Amdahl's law. 200 times 5 milliseconds is one second of CPU that the GIL serialises. No thread count can get below it. The free-threaded build broke through to 0.21 seconds. A caveat: free-threading is supported but not the default in 3.14, and this loop ran about 9 percent slower single-threaded on it.

There's a classic sizing formula for a thread pool doing mixed work: the number of cores, times one plus the ratio of wait time to compute time. Here the ratio is 45 over 5, which is 9, and with the GIL there's effectively one core, so it says 10 threads. The measurements bend at exactly that point.

Each runtime has one rule to know. In CPython, threads parallelise waits and native code that releases the GIL; processes or the free-threaded build parallelise Python code. In Node, anything CPU-heavy on the main thread stalls every connection. In Tokio, blocking work inside an async task starves the executor. And Go since 1.25 sizes its thread count from the container's CPU limit; older versions used the host's cores and got throttled.

## Concurrency moves the queue

I/O-bound work needs concurrency, many requests in flight, not parallelism. But concurrency only moves the queue downstream. If the database serves 400 queries a second, 80 threads or 8 thousand coroutines all wait on it. The real levers are shorter waits, like an index, a cache or a smaller payload; fewer waits, like no N plus 1 queries; overlapping independent waits; and capping concurrency at what the downstream can serve.

Overlap is the cheapest latency win in most services. Fetch the user, 30 milliseconds, and the orders, 45 milliseconds, at the same time, and the request takes 45, the max, not 75, the sum.

## Batching and backpressure

Most I/O has a large fixed cost per operation, a round trip, a system call, a commit, and a small cost per item. Grouping n items into one operation divides the fixed cost by n.

Inserting rows into SQLite, one transaction per row: about 11 milliseconds a row, nearly all of it the commit's fsync. A thousand rows per transaction: about 10 microseconds a row. A hundred thousand in one transaction: about half a microsecond. That's about 20 thousand times faster than one commit per row. SQLite's write-ahead log mode with relaxed syncing, which skips the per-commit fsync, got single-row inserts to about 25 microseconds, by trading away durability of the last commits on power loss. Know which one you chose.

The pattern is everywhere: multi-row inserts, Redis pipelining, Kafka's batch settings, a database's group commit, GraphQL's DataLoader. The price is latency for the first item, which waits for the batch to fill. So every good batching policy flushes on size or time, whichever comes first.

And when producers outpace the bottleneck, the excess must go somewhere. An unbounded queue absorbs it silently. Memory grows, every item's wait grows with it, because by Little's law queue length is waiting time, and the service eventually dies of an out-of-memory kill after minutes spent serving clients who already gave up. A bounded queue forces a decision: block the producer, reject fast, or drop low-value work. Pair it with deadlines at every hop.

Finally, the bottleneck moves. Batch the inserts and the writer becomes CPU-bound building rows. Remove a database wait and the service becomes CPU-bound on JSON. Measure, relieve the single bottleneck, measure again, and stop when the target is met, not when the ideas run out.

## In the interview

A follow-up the lesson expects. How do you tell an I/O-bound service from a CPU-starved one, when both are slow at low average CPU?

[pause]

Look per process, not per host. Voluntary context switches with low CPU mean waiting. Involuntary switches with a high wait column mean runnable but denied a core, by a quota, a CPU set or a noisy neighbour. Confirm with pressure stall information and the cgroup's throttling counter. The wrong answer is "look at the host's CPU graph", which averages the starvation away.

And: batching made throughput 20 times better but median latency worse. Why? Items wait for their batch to fill. Flush on size or time, set the time bound from the latency budget, and batch only on the throughput path.

## Recap

Four things to remember. Tell the kinds of slow apart per process: voluntary switches at low CPU are waiting, involuntary switches with high wait are starvation, and pool acquisition time is the metric that catches the opening incident. Size pools with Little's law and aim near 70 percent utilisation, prefer one shared pool, and remember pods times pool size must fit the database. In CPython with the GIL, threads scale waiting but not Python computation; the serial CPU part is an Amdahl ceiling. And batch to divide fixed costs, flush on size or time, and bound every queue.

At your desk: the vmstat and pidstat output, the pool-size and threading tables, the batching measurements, and the connection-pool simulation exercise.
