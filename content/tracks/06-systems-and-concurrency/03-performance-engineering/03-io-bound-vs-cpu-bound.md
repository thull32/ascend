---
slug: io-bound-vs-cpu-bound
title: "I/O-bound vs CPU-bound: find the bottleneck, then scale the right thing"
description: How to tell CPU-bound, I/O-bound and pool-bound work apart from vmstat, pidstat and pressure stall information; Little's law and Erlang C for sizing pools; measured thread pools, process pools and free-threaded CPython 3.14; measured batching of commits and syscalls; and backpressure when the bottleneck is full.
minutes: 35
difficulty: medium
tags: [performance, bottlenecks, littles-law, connection-pools, batching, backpressure, scaling]
---
Checkout latency climbs every evening. CPU on the service's pods sits at 25%. The on-call engineer doubles the pods from 8 to 16, the standard response to "slow", and latency gets *worse*. Twenty minutes later the database starts refusing connections. Each pod holds a pool of 25 database connections: doubling the pods took the database from 200 connections to 400, past its limit of 300, and the connections it did accept all competed for the same 16 database cores.

The service was never short of CPU. Its requests spent most of their time waiting for a database connection, and adding pods added more waiters to the same bottleneck. "Is this CPU-bound or I/O-bound?" sounds like a textbook question, but getting it wrong in production turns a slow evening into an outage, because the right fix for one is often the wrong fix for the other. This lesson diagnoses each kind from real tool output, sizes pools with Little's law and a queueing model checked against simulation, and measures what threads, processes, free-threaded Python and batching actually buy. Measurements are from a Ryzen 9 9950X3D (32 hardware threads) under WSL2, with CPython 3.14.7 and SQLite 3.53.

## Four kinds of slow

| Bound by | What the machine looks like | What helps | What does not |
|---|---|---|---|
| **CPU** | Cores busy in user time; run queue longer than the cores you are allowed; latency rises with load | Less work per request, more cores, better algorithms | More threads than cores |
| **I/O or a downstream** | Cores mostly idle; threads blocked; latency dominated by waits | More concurrency (up to the downstream's limit), fewer and shorter waits, batching | Faster code, more CPU |
| **Memory bandwidth or latency** | Cores "busy" but instructions per cycle low; cache misses high | Layout and locality ([CPU caches](/learn/systems/performance-engineering/cpu-caches-and-memory-layout)) | More threads on the same socket |
| **Contention** (locks, pools, a single thread) | One hot thread, or long waits to acquire while other cores idle | Shorter critical sections, sharding the resource, larger pools if what is behind them has headroom | More pods sharing the contended resource |

The opening incident was the last row wearing the second row's clothes: I/O-bound on the database, and contention-bound on the pool in front of it.

## Diagnosing from the outside: vmstat, pidstat and pressure

Three small programs ran at once on the 32-thread machine: a loop of 1 ms sleeps (a service waiting on a fast downstream), four pure-Python spinners confined to 2 CPUs with `taskset` (a container with a CPU limit), and a SQLite writer committing one row per transaction. `vmstat 1` saw this:

```text
 r  b   swpd   free   buff  cache   si   so    bi    bo   in    cs us sy id wa st gu
 9  1 1133348 21970860 248400 7914164   0    0     0  7404 53250 91964 16  6 75  3  0  0
```

The machine is 75% idle with 3% iowait. Nothing looks wrong, because `vmstat` averages over all 32 CPUs and the starved processes are confined to two of them. `pidstat -w -u` over two seconds tells the truth, one process at a time (the `-u` and `-w` averages merged into one table, one spinner shown):

```text
   PID   %usr %system   %wait    %CPU   cswch/s nvcswch/s  Command
552279   0.50    0.75    0.00    1.25    916.50      0.00  python3   <- sleeper
552281  47.75    0.00   52.00   47.75      0.00    119.50  python3   <- spinner (1 of 4)
552285   0.75    2.00    0.00    2.75    457.75      0.00  python3   <- committer
```

- **The sleeper** makes 917 **voluntary** context switches a second (`cswch/s`), one per sleep, at 1.25% CPU. Blocking constantly while using no CPU is the signature of waiting on I/O or a downstream. Network waits count as *idle*, not iowait.
- **Each spinner** wants a whole CPU, gets 48%, and spends 52% in `%wait`: runnable but queued for a core. Its switches are all **involuntary** (`nvcswch/s`, 120 a second): the scheduler preempting a thread that wanted to keep running. That is CPU saturation, invisible in the machine-wide numbers.
- **The committer** also blocks (458 voluntary switches a second at 2.75% CPU), but on the disk: it managed 539 commits in 7 seconds, about 13 ms each, because every commit waits for `fsync`.

`/proc/pressure/cpu` and `/proc/pressure/io` confirm both at once: `cpu some avg10=11.40` (11% of the last 10 s had some task waiting for a CPU) and `io full avg10=2.83`. Pressure stall information measures saturation directly, and in a container it is scoped to the cgroup.

Two cautions. `wa` (iowait) means "idle while some disk I/O was outstanding"; run a CPU-heavy job on the same host and iowait drops to zero while the disk stays the bottleneck, so confirm with `iostat -x` ([filesystems and storage](/learn/systems/operating-systems/filesystems-and-storage)). And in containers, CPU throttling (`nr_throttled` in the cgroup's `cpu.stat`) makes a quota-limited service look idle and slow at once ([processes and threads](/learn/systems/operating-systems/processes-and-threads)).

## Diagnosing from the inside: cores busy and wait time

The cheapest in-process diagnostic is CPU time divided by wall-clock time: **cores busy**. Measured on eight CPU-bound Python tasks:

| Run | Wall | CPU | Cores busy |
|---|---|---|---|
| Sequential | 2.111 s | 2.111 s | 1.00 |
| `ThreadPoolExecutor(8)` | 2.164 s | 2.196 s | 1.01 |
| `ProcessPoolExecutor(8)` | 0.356 s | 2.308 s | 6.48 |

Eight threads, one core busy: a serial bottleneck, here the GIL. The same reading from `top -H` is one thread at 100% while the rest idle: an event loop doing CPU work, a single consumer, a global lock.

For I/O-bound services, the single most useful metric is **time spent waiting to acquire a pooled resource**. HikariCP exposes pending threads and acquisition time, Go's `sql.DBStats` has `WaitCount` and `WaitDuration`, and every pooled client library has an equivalent. If acquisition time is a large fraction of request latency, the pool, or what is behind it, is the bottleneck, whatever the CPU graph says. Distributed-tracing spans give the same answer per dependency, and an off-CPU or wall-clock profile ([profiling and measurement](/learn/systems/performance-engineering/profiling-and-measurement)) shows which stacks were waiting.

## Little's law: sizing a pool

For any stable system, the average number of items inside it equals the arrival rate times the average time each spends inside:

$$ L = \lambda W $$

It needs no assumptions about distributions. A service handling 2,000 requests a second, each holding a database connection for 15 ms, keeps $2{,}000 \times 0.015 = 30$ connections busy on average. A pool of exactly 30 is 100% utilised, and its queue grows without bound.

How much more than 30? Model the pool as $c$ servers with random arrivals and random hold times (the M/M/c queue). The **Erlang C** formula gives the probability that a request must wait, and a 200,000-request simulation of the same pool agrees:

| Pool size | Utilisation | P(wait), Erlang C | P(wait), simulated | Mean wait | p99 wait (simulated) |
|---|---|---|---|---|---|
| 31 | 97% | 0.80 | 0.78 | 12.0 ms | 93 ms |
| 33 | 91% | 0.49 | 0.48 | 2.5 ms | 32 ms |
| 35 | 86% | 0.29 | 0.28 | 0.85 ms | 9.7 ms |
| 38 | 79% | 0.11 | 0.11 | 0.21 ms | 4.1 ms |
| 43 | 70% | 0.017 | 0.015 | 0.02 ms | 0.4 ms |

Latency is flat until utilisation is high, then goes vertical: four extra connections (31 to 35) cut the p99 wait tenfold. A single server is much worse at the same utilisation: in an M/M/1 queue, time in the system is the service time divided by $(1 - \rho)$, so 2× at 50%, 5× at 80%, 10× at 90% and 100× at 99%.

**Pooling matters as much as size.** Four pods each with a pool of 10 (7.5 connections busy each, 75%) against one shared pool of 40 at the same 75%, simulated: the split pools wait on 31% of requests with a p99 wait of 20.8 ms; the shared pool waits on 5% with a p99 of 2.3 ms. Same connections, same load, nine times the tail, because a busy pod cannot borrow an idle pod's connection. A pooler such as PgBouncer in front of the database is the shared pool.

Size the bottleneck for about 70% utilisation at peak, and check the tail with the model for your pool size. For this example, $30 / 0.7 \approx 43$ connections across the fleet.

```exercise
id: connection-pool-waits
title: Simulate waiting for a connection pool
prompt: |
  A pool has `size` connections, all free at time 0. `requests` is a list of
  `[arrival_ms, service_ms]` sorted by arrival. Each request takes a connection
  as soon as one is free, in arrival order (first come, first served), holds
  it for `service_ms` and then returns it.

  Return the list of each request's waiting time (start minus arrival), in the
  same order as `requests`. The hidden tests include head-of-line blocking: one
  slow request making every fast one behind it wait.
languages: [python, javascript]
entry: simulate_pool
starter:
  python: |
    def simulate_pool(requests, size):
        # your code here
        return []
  javascript: |
    function simulate_pool(requests, size) {
      // your code here
      return [];
    }
tests:
  - args: [[[0, 10], [0, 10], [0, 10], [5, 10]], 2]
    expected: [0, 0, 10, 5]
  - args: [[[0, 5], [10, 5], [20, 5]], 1]
    expected: [0, 0, 0]
    label: arrivals slower than service, no queue
  - args: [[[0, 10], [1, 10], [2, 10], [3, 10]], 1]
    expected: [0, 9, 18, 27]
    label: arrivals faster than service, the queue grows
  - args: [[[0, 10], [1, 10], [2, 10], [3, 10]], 4]
    expected: [0, 0, 0, 0]
  - args: [[], 3]
    expected: []
    label: no requests
  - args: [[[0, 100], [10, 1], [20, 1], [30, 1]], 1]
    expected: [0, 90, 81, 72]
    hidden: true
    label: head-of-line blocking
  - args: [[[0, 100], [10, 1], [20, 1], [30, 1]], 2]
    expected: [0, 0, 0, 0]
    hidden: true
hints:
  - "Track the time at which each connection next becomes free, starting at 0."
  - "For each request in order, pick the connection that frees up earliest; start = max(arrival, that time)."
  - "Record start - arrival, then set that connection's free time to start + service."
```

## The database sets the ceiling

A database can usefully run only a small multiple of its core count of queries at once; beyond that, extra connections queue *inside* it, and in PostgreSQL each connection is a whole backend process with its own memory. A long-standing PostgreSQL community starting point for *active* connections is about twice the core count plus the number of disks. Total client connections are pods × pool size, so autoscaling pods silently multiplies them, which is what happened in the opening: 8 pods × 25 was 200, and 16 × 25 was 400 against a limit of 300.

Derive pool sizes from the downstream's capacity divided by the fleet size, not from the client's own load, and put a pooler between a large fleet and the database ([connection management](/learn/databases/storage-and-scale/connection-management)). The same arithmetic applies to HTTP client pools per host ([connection pooling and keep-alive](/learn/networking/networking-in-practice/connection-pooling-and-keep-alive)) and to any rate-limited third-party API.

## Threads, processes and the GIL, measured

Three workloads on CPython 3.14.7 (default build, with a GIL) and on the free-threaded 3.14t build of the same release. The mixed task burns about 5 ms of pure-Python CPU, then sleeps 45 ms, like a request handler that parses and then waits:

| Workload | Pool | GIL build | Free-threaded 3.14t |
|---|---|---|---|
| 8 × CPU-bound task | Sequential | 2.111 s | 2.305 s |
| 8 × CPU-bound task | 8 threads | 2.164 s (1.0 core busy) | 0.389 s (6.8 cores busy) |
| 8 × CPU-bound task | 8 processes | 0.356 s | 0.424 s |
| 64 × 50 ms sleep | 8 threads | 0.403 s | – |
| 64 × 50 ms sleep | 64 threads | 0.065 s | – |
| 200 × (5 ms CPU + 45 ms wait) | 1 thread | 9.95 s | 9.97 s |
| 200 × mixed | 8 threads | 1.30 s | 1.26 s |
| 200 × mixed | 16 threads | 1.00 s | 0.66 s |
| 200 × mixed | 64 threads | 1.03 s | 0.21 s |

Read it row by row. Sleeping releases the GIL, so threads scale I/O waits perfectly: 64 sleeps in 65 ms. Pure-Python computation does not scale on threads with a GIL; it does on processes, or on threads in the free-threaded build. The mixed rows are Amdahl's law in action: 200 × 5 ms is 1.0 s of CPU that the GIL serialises, so no thread count gets below 1.0 s, a 10× ceiling on a 10× serial fraction. The free-threaded build breaks through to 0.21 s.

Version-honest details. Free-threading was experimental in 3.13 (PEP 703) and is officially supported but not the default in 3.14; this CPU-bound loop ran 9% slower single-threaded on it (2.305 s against 2.111 s), and importing a C extension that has not declared free-threading support turns the GIL back on. On Linux, 3.14 changed the default `multiprocessing` start method from `fork` to `forkserver`; starting 8 workers and running 8 trivial tasks took 18–20 ms, and every argument and result is pickled across a pipe.

## Scaling CPU-bound work

CPU-bound work parallelises up to the number of cores you are allowed and no further. A pool for CPU-bound tasks should have about as many workers as cores; more only adds involuntary context switches, like the spinners above. Beyond that the levers are doing less work (a better algorithm, caching computed results, not re-serialising the same payload) and adding machines, which for a stateless CPU-bound service is the one case where "add pods" scales linearly.

Each runtime has one rule to know:

- **CPython**: threads parallelise waits and native code that releases the GIL (NumPy, `hashlib` on large buffers, compression); processes or the free-threaded build parallelise Python code.
- **Node**: anything CPU-heavy on the main thread stalls every connection on that process; use `worker_threads` ([async and event loops](/learn/systems/concurrency/async-and-event-loops)).
- **Tokio**: blocking or CPU-heavy work inside an async task starves the executor; move it to `spawn_blocking` or a rayon pool.
- **Go**: goroutines spread across `GOMAXPROCS` threads. Since Go 1.25 the default follows the container's CPU limit; older versions used the host's core count, so a pod limited to 2 CPUs on a 64-core node ran 64 threads into its quota and was throttled.

## Scaling I/O-bound work

I/O-bound work needs **concurrency** (many requests in flight) rather than parallelism (many instructions at once). For a thread pool, a classic sizing formula is

$$ N_{threads} = N_{cores} \times \left(1 + \frac{W}{C}\right) $$

where $W$ is the time a task waits and $C$ the time it computes. The mixed workload has $W/C = 45/5 = 9$; with the GIL there is effectively one core, so the formula says 10 threads, and the measurements bend at exactly that point (8 threads: 1.30 s; 16: 1.00 s; 64: no better). With 8 real cores it would say 80. Event loops get the same concurrency with one thread per core and thousands of cheap tasks ([I/O and system calls](/learn/systems/operating-systems/io-and-syscalls), [thread pools](/learn/systems/concurrency/thread-pools-and-work-stealing)).

```viz
{"type": "concurrency", "algorithm": "thread-pool", "threads": 3, "tasks": 6,
 "title": "A bounded pool of workers",
 "caption": "Size the pool to the bottleneck: about the core count for CPU-bound tasks, more for tasks that mostly wait, and never more than the downstream can serve."}
```

Concurrency only moves the queue downstream. If the database serves 400 queries a second, 80 threads or 8,000 coroutines all wait on it. The effective levers are shorter waits (an index, a cache, a closer replica, a smaller payload), fewer waits (no N+1 queries, bulk fetches, batching), overlapping independent waits, and capping concurrency at what the downstream can serve. Overlap is the cheapest latency win in most services:

```go
g, ctx := errgroup.WithContext(ctx)
var user User
var orders []Order
g.Go(func() (err error) { user, err = users.Get(ctx, id); return })         // 30 ms
g.Go(func() (err error) { orders, err = orderSvc.List(ctx, id); return })   // 45 ms
if err := g.Wait(); err != nil {
    return err
}
// latency is about 45 ms (the max), not 75 ms (the sum)
```

## Batching, measured

Most I/O has a large fixed cost per operation (a round trip, a syscall, an `fsync`, a commit) and a small cost per item:

$$ T(n) = \text{overhead} + n \times \text{per-item cost} $$

Grouping $n$ items into one operation divides the overhead by $n$. Inserting rows into SQLite on this machine's virtual disk, two runs each:

| Method | Cost per row | Write syscalls per row |
|---|---|---|
| One transaction per row, rollback journal (default) | 10.7–12.6 ms | 10 |
| One transaction per row, WAL with `synchronous=NORMAL` | 24–27 µs | 2 |
| `executemany`, 100 rows per transaction | 66–121 µs | 0.13 |
| `executemany`, 1,000 rows per transaction | 7.8–12.4 µs | 0.019 |
| `executemany`, 100,000 rows in one transaction | 0.5–0.6 µs | 0.005 |

The formula predicts it: about 11 ms of commit overhead (dominated by `fsync` on this WSL2 virtual disk; on a local NVMe drive it ranges from tens of microseconds to milliseconds, depending on whether the drive has power-loss protection) plus 0.5 µs per row. At 1,000 rows per transaction that is $11/1000 + 0.0005 \approx 11.5$ µs a row. WAL mode with `synchronous=NORMAL` skips the per-commit `fsync`, trading durability of the last commits on power loss for 400 times the speed: know which one you chose.

System calls behave the same way. Writing a million 16-byte records with `os.write` per record made 1,000,000 `write` calls and took 670 ms; a buffered file object made 123 calls and took 47–71 ms. CPython 3.14 raised the default buffer to 128 KiB (earlier versions used the file system's block size, typically 4–8 KiB).

The pattern is everywhere: multi-row `INSERT` and `COPY`, Redis pipelining, Kafka's `linger.ms` and `batch.size`, `writev`, a database's group commit, GPU inference batching and GraphQL's DataLoader. The price is latency for the first item, which waits for the batch to fill, so every good batching policy flushes on size *or* time, whichever comes first. Nagle's algorithm in TCP is a batching policy; `TCP_NODELAY` makes the opposite trade.

## Backpressure: when the bottleneck is full

When producers outpace the bottleneck, the excess has to go somewhere. An unbounded queue absorbs it silently: memory grows, every item's wait grows with it (Little's law: at a fixed service rate, queue length *is* waiting time), and the service eventually dies of an out-of-memory kill after minutes spent serving requests whose clients already gave up. A bounded queue forces a decision at the point of overload: block the producer (propagating the slowdown upstream), reject fast (load shedding), or drop low-value work.

```viz
{"type": "system", "algorithm": "backpressure",
 "title": "Bounded buffers turn overload into a signal",
 "caption": "A full buffer slows or rejects the producer instead of growing without limit, so memory stays bounded and callers learn about overload immediately."}
```

Pair it with deadlines at every hop, so a request that has already exceeded its budget stops holding a connection. Fixed limits go stale as hardware and traffic change; Netflix's open-source concurrency-limits library sets each service's limit adaptively from measured latency, in the style of TCP congestion control. The [resilience patterns lesson](/learn/system-design/building-blocks/resilience-patterns) covers bulkheads, load shedding and circuit breakers.

## The bottleneck moves

Every fix exposes the next limit. Batch the inserts and the writer becomes CPU-bound on building rows in Python: at 0.5 µs a row, serialisation is now the whole cost. Remove a database wait and the service becomes CPU-bound on JSON. Add a cache and the network card or one hot key becomes the limit. Parallelise a job and the lock that was never contended becomes the serial fraction Amdahl's law warned about. The loop is always the same: measure, identify the single bottleneck, relieve it, and measure again, stopping when the target is met rather than when the ideas run out.

## Failure modes in production

| Symptom | Diagnosis | Fix |
|---|---|---|
| Scaling out pods makes latency worse and the database refuses connections | Pods × pool size exceeded the database's limit; pool acquisition time was the latency | Size pools from database capacity ÷ fleet; add a pooler; scale on queue depth, not CPU |
| Service slow at 25% host CPU in a container | CPU quota throttling (`nr_throttled`), or a runtime sized to the host's cores | Raise the limit or match thread counts to it; check `cpu.stat` and PSI |
| Thread pool added for CPU work in Python, no speed-up | The GIL serialises pure-Python bytecode (1.0 core busy) | Processes, a GIL-releasing native library, or the free-threaded build |
| Bulk load takes hours | One commit (one `fsync`) per row: 11 ms each here | Batch rows per transaction; `COPY`; WAL where its durability is acceptable |
| Memory grows until an OOM kill during a traffic spike | Unbounded in-memory queue in front of a slower stage | Bound it; reject or block; propagate deadlines |
| Tail latency differs by pod under even load | Many small per-pod pools cannot share idle connections | One shared pool behind a pooler, or fewer, larger pools |
| New threads fail with "can't start new thread" with RAM free | Address-space or map limits: each glibc thread arena reserves 64 MiB | Cap arenas (`MALLOC_ARENA_MAX`), smaller stacks, fewer threads, async |

## Trade-offs: concurrency models for I/O and CPU

| Model | CPU parallelism | Memory per unit of concurrency | Switch cost | Failure isolation |
|---|---|---|---|---|
| OS threads (GIL runtime) | None for Python code | 8 MiB stack reserved, tens of KiB touched | Kernel switch, microseconds | Shared process |
| OS threads (Go, Java, Rust, free-threaded Python) | Full | Same | Kernel switch | Shared process |
| Processes | Full | A whole interpreter each, 10 MB or more | Kernel switch, plus pickling | Strong |
| Event loop or async tasks | One core per loop | Hundreds of bytes to a few KB | A function return | Shared; one blocking call stalls all |
| Goroutines | Full | 2 KiB starting stack | User-space, sub-microsecond | Shared process |

## Interviewer follow-ups

**"A service does 2,000 requests a second and each holds a database connection for 15 ms. How big should the pool be?"** Model answer: Little's law gives 30 busy on average; a pool of 30 is 100% utilised and queues without bound; aim near 70% (about 43 across the fleet), check the tail with an M/M/c model (a pool of 35 already cuts the p99 wait below 10 ms), and make sure pods × per-pod pool fits the database. Common wrong answer: "one connection per thread, so 200", which ignores the database.

**"Our Python service is CPU-bound. Will a thread pool help?"** Model answer: not on the default CPython build for pure-Python work (measured 1.0 core busy on 8 threads); use processes, native code that releases the GIL, or the free-threaded build if the dependencies support it, and measure the single-thread cost. Common wrong answer: "yes, threads run on different cores", true only when the GIL is released.

**"How do you tell an I/O-bound service from a CPU-starved one when both are slow at low average CPU?"** Model answer: per-process `pidstat -w -u`: voluntary switches with low CPU means waiting; involuntary switches with high `%wait` means runnable but denied a core (quota, cpuset, noisy neighbour); confirm with PSI and `cpu.stat`. Common wrong answer: "look at the host's CPU graph", which averages the starvation away.

**"Batching made throughput 20× better but p50 latency worse. Why, and what do you do?"** Model answer: items wait for their batch to fill; flush on size or time, set the time bound from the latency budget, and batch only on the throughput path. Common wrong answer: "batching reduces latency too", which is true only when the fixed cost dominated each item's latency.

## What mid-level engineers get wrong

- **Scaling on CPU for an I/O-bound service.** Consequence: more pods, more connections, a saturated database and an outage.
- **Sizing a pool to the average.** Consequence: 100% utilisation and a queue that never drains.
- **Giving every pod its own small pool.** Consequence: a tail several times worse than a shared pool of the same total size.
- **Adding threads to pure-Python CPU work.** Consequence: no speed-up, more memory, more context switches.
- **Committing per row in a bulk job.** Consequence: runtime dominated by `fsync`, 20,000 times slower than one transaction here.
- **Trusting `wa` and host-wide CPU.** Consequence: a network-bound or quota-throttled service that "looks idle".
- **Unbounded queues.** Consequence: an outage with a delay, and minutes of work for clients that already left.

## Senior signals

- You separate CPU-bound, I/O-bound, memory-bound and contention-bound from `pidstat -w -u`, `vmstat`, PSI and `cpu.stat` in minutes, and you know host-wide averages hide per-container starvation.
- You instrument pool acquisition time and treat it as a first-class latency metric.
- You size pools with Little's law, check the tail with a queueing model, keep bottlenecks near 70%, and prefer shared pools to fragmented ones.
- You know autoscaling clients multiplies downstream connections and size pools from the downstream's capacity.
- You know which runtime rule applies (GIL and free-threading in CPython 3.14, Node's main thread, Tokio's blocking pool, Go's `GOMAXPROCS` and quotas).
- You batch by size or time, know what durability you traded (WAL, group commit), and insist on bounded queues and deadlines.

## Check yourself

```quiz
- q: >-
    A service runs at 30% CPU with high p99 latency. Its database pool metrics show requests waiting an average of 80 ms to acquire a connection. What should you do first?
  options: ["Find out why each connection is held so long", "Double the pool size on every pod right away", "Profile the CPU to find the hottest functions", "Add more pods so the load spreads across them"]
  answer: 0
  explanation: >-
    The time is going to pool waits, so the bottleneck is connection hold time (slow queries, work done while holding the connection) or the database behind it; check the database's capacity before touching pool sizes. More pods or bigger pools multiply connections to a database that may already be saturated. A CPU profile cannot see waiting.
- q: >-
    A service handles 1,500 requests per second, and each request holds a downstream connection for 40 ms. Using Little's law and a target of about 70% utilisation, roughly how many connections does the fleet need in total?
  options: ["About 86", "About 60", "About 40", "About 1,500"]
  answer: 0
  explanation: >-
    Busy connections on average are 1,500 times 0.04, which is 60. Running them at 70% utilisation needs about 60 divided by 0.7, about 86. Exactly 60 would be 100% utilisation, where the queue grows without bound.
- q: >-
    pidstat shows a process at 48% CPU with 52% in the %wait column, zero voluntary context switches and about 120 involuntary switches per second. The host is 75% idle. What is happening?
  options: ["It is waiting on the disk and should show iowait", "It is spinning on a lock held by another thread", "It is runnable but denied a core by a limit or cpuset", "It is blocked on the network and counted as idle"]
  answer: 2
  explanation: >-
    Involuntary switches plus a high %wait mean the thread wanted to keep running and was preempted, then queued for a CPU. With the host mostly idle, the process is confined to fewer CPUs than it wants: a cgroup quota, a cpuset or pinning. A network or disk wait produces voluntary switches and little CPU, and a spin lock burns CPU without run-queue waiting.
- q: >-
    On CPython 3.14 with the GIL, each task burns 5 ms of pure-Python CPU and then waits 45 ms on a socket. With a large enough thread pool, what is the throughput ceiling?
  options: ["Unlimited, since waiting on a socket releases the GIL", "About 200 tasks a second, one core running the CPU parts", "About 20 tasks a second per thread, times the thread count", "About 1,600 tasks a second, one per core every 5 ms"]
  answer: 1
  explanation: >-
    Waits overlap freely because blocking calls release the GIL, but the CPU parts run one at a time: 1 second divided by 5 ms is 200 tasks a second. Measured, 200 such tasks never finished faster than about 1.0 s at any thread count, and the free-threaded build reached 0.21 s. Per-thread scaling holds only until the serial CPU part saturates.
- q: >-
    Writing 20,000 events to a store with a 1 ms round trip takes 20 s one at a time. Batching 1,000 events per request, with about 0.02 ms per event on the server, takes roughly how long?
  options: ["About 20 ms", "About 420 ms", "About 2,000 ms", "About 20 s"]
  answer: 1
  explanation: >-
    There are 20 batches, each costing 1 ms of round trip plus 1,000 times 0.02 ms of per-item work, 21 ms per batch, so about 420 ms overall. Batching removes the repeated fixed cost, not the per-item cost, which is why 20 ms is too optimistic.
- q: >-
    Four pods each have a pool of 10 connections at 75% utilisation. An alternative is one shared pool of 40 behind a pooler, also at 75%. How do their tails compare?
  options: ["The shared pool's p99 wait is several times lower", "The shared pool is worse, since the pooler adds a hop", "They match, since utilisation is identical in both", "The split pools are better, since pods never contend"]
  answer: 0
  explanation: >-
    With split pools, a request can wait on a busy pod while another pod's connections sit idle. Simulated at these numbers, the split pools made 31% of requests wait with a p99 wait of about 21 ms; the shared pool made 5% wait with a p99 of about 2 ms. Utilisation alone does not determine queueing; the number of servers sharing one queue does.
```
