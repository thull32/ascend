---
slug: io-bound-vs-cpu-bound
title: "I/O-bound vs CPU-bound: find the bottleneck, then scale the right thing"
description: How to tell CPU-bound, I/O-bound and pool-bound services apart from vmstat, pidstat and pool metrics; how Little's law and queueing math size thread and connection pools; and when parallelism, concurrency, batching or backpressure is the right fix.
minutes: 30
difficulty: medium
tags: [performance, bottlenecks, littles-law, connection-pools, batching, backpressure, scaling]
---
Checkout latency climbs every evening. CPU on the service's pods sits at 25%. The on-call engineer doubles the pods from 8 to 16, the standard response to "slow", and latency gets *worse*. Twenty minutes later the database starts refusing connections. Each pod holds a pool of 25 database connections: doubling the pods took the database from 200 connections to 400, past its limit of 300, and the connections it did accept all competed for the same 16 database cores.

The service was never short of CPU. Its requests were spending most of their time waiting for a database connection, and adding pods added more waiters to the same bottleneck. "Is this CPU-bound or I/O-bound?" sounds like a textbook question, but getting it wrong in production turns a slow evening into an outage, because the right fix for one is often the wrong fix for the other. This lesson is about telling them apart quickly and then scaling the thing that is actually limiting you.

## Four kinds of slow

| Bound by | What the machine looks like | What helps | What does not |
|---|---|---|---|
| **CPU** | Cores busy in user time; run queue longer than core count; latency rises with load | Less work per request, more cores, better algorithms | More threads than cores |
| **I/O or a downstream** | Cores mostly idle; threads blocked; latency dominated by waits | More concurrency (up to the downstream's limit), fewer and faster waits, batching | Faster code, more CPU |
| **Memory bandwidth or latency** | Cores "busy" but IPC low; cache misses high | Layout, locality ([CPU caches](/learn/systems/performance-engineering/cpu-caches-and-memory-layout)) | More threads on the same socket |
| **Contention** (locks, pools, a single thread) | One hot thread or a long wait to acquire; other cores idle | Shorter critical sections, sharding the resource, bigger pools if the resource behind them has headroom | More pods, if they share the contended resource |

The opening incident was the last row wearing the second row's clothes: I/O-bound on the database, and contention-bound on the pool in front of it.

## Diagnosing from the outside

Start with the machine. `vmstat 1` on an 8-core host in three different situations:

```text
procs -----------memory---------- ---swap-- -----io---- -system-- -------cpu-------
 r  b   swpd   free   buff  cache   si   so    bi    bo   in    cs us sy id wa st
18  0      0 5210344 88120 6120332    0    0     0    24  9120  4210 93  6  1  0  0   <- CPU-bound
 2  0      0 5190112 88120 6120400    0    0     0    30 21040 38400 14  7 79  0  0   <- waiting on the network
 1 12      0 5188020 88120 6120400    0    0 96120   210  6100  9800  4  3 21 72  0   <- waiting on the disk
```

- **CPU-bound**: `r` (runnable threads) is 18 on 8 cores, so on average 10 threads are waiting for a core, and user time is 93%. Every request spends part of its latency in that run queue.
- **Waiting on the network**: 79% idle, few runnable threads, and a high context-switch rate (`cs`) as threads block and wake around every downstream call. Network waits appear as *idle*, not as `wa`.
- **Waiting on the disk**: 12 threads in uninterruptible sleep (`b`) and 72% `wa`. But `wa` (iowait) means "idle while some disk I/O was outstanding": run a CPU-heavy process on the same host and iowait drops to zero while the disk remains the bottleneck. Confirm with `iostat -x` ([filesystems and storage](/learn/systems/operating-systems/filesystems-and-storage)).

Then look at the process. `pidstat -w` splits context switches into **voluntary** (the thread blocked: I/O, a lock, a sleep) and **involuntary** (the scheduler preempted a thread that wanted to keep running):

```text
$ pidstat -w 1
UID       PID   cswch/s nvcswch/s  Command
1000     4212  18214.00     12.00  api          <- blocking constantly: waiting on something
1000     4388     35.00   2410.00  encoder      <- preempted constantly: wants more CPU than it gets
```

`top -H` shows per-thread CPU. One thread pinned at 100% while the other cores idle means a serial bottleneck: an event loop doing CPU work, Python's GIL, a single consumer, a global lock. In containers, also check CPU throttling (`nr_throttled` in `cpu.stat`), which makes a quota-limited service look idle and slow at once ([processes and threads](/learn/systems/operating-systems/processes-and-threads)).

Finally, instrument the waits you own. The single most useful metric for an I/O-bound service is **time spent waiting to acquire a pooled resource**: HikariCP exposes pending threads and acquisition time, Go's `sql.DBStats` has `WaitCount` and `WaitDuration`, and every client library with a pool has an equivalent. If acquisition time is a large fraction of request latency, the pool (or what is behind it) is your bottleneck, whatever the CPU graph says.

## Little's law: the equation behind every pool

For any stable system, the average number of items inside it equals the arrival rate times the average time each spends inside:

$$ L = \lambda W $$

It needs no assumptions about distributions, and it sizes everything. At 2,000 requests per second and 50 ms average latency, 100 requests are in flight at any moment. If each request holds a database connection for 20 ms of those 50, then on average $2{,}000 \times 0.020 = 40$ connections are busy. Four pods with pools of 10 is exactly 40: 100% utilisation.

At 100% utilisation queues grow without bound, and they start hurting well before that. For a simple single-server queue with random arrivals, average time in the system is the service time divided by $(1 - \rho)$, where $\rho$ is utilisation:

| Utilisation | Time in system relative to service time |
|---|---|
| 50% | 2× |
| 80% | 5× |
| 90% | 10× |
| 95% | 20× |

Real systems differ in the details but not the shape: latency is flat until utilisation is high, then goes vertical. Size the bottleneck resource for 60–70% utilisation at peak. For the example, that is $40 / 0.7 \approx 57$ connections in total, 15 per pod.

The database sets the ceiling, not the client. A database can usefully run only a small multiple of its core count of queries at once; beyond that, extra connections just queue *inside* it, and in PostgreSQL each connection is a whole process with its own memory. A long-standing PostgreSQL community rule of thumb starts from about twice the core count plus the number of disks for the number of *active* connections. Total client connections are pods × pool size, so autoscaling pods silently multiplies them, which is exactly what happened in the opening. The fix is a pooler such as PgBouncer between the fleet and the database, and pool sizes derived from the database's capacity divided by the fleet size ([connection management](/learn/databases/storage-and-scale/connection-management)).

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

## Scaling CPU-bound work

CPU-bound work parallelises up to the number of cores and no further. A pool for CPU-bound tasks should have about as many threads as cores; more threads only add context switches and cache thrash. Beyond that, the levers are doing less work (a better algorithm, caching computed results, not re-serialising the same payload) and adding machines, which for a stateless CPU-bound service is the one case where "add pods" scales linearly.

The language decides how you get parallelism at all:

```python
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor

def count_primes(limit: int) -> int:
    return sum(1 for n in range(2, limit)
               if all(n % d for d in range(2, int(n ** 0.5) + 1)))

with ThreadPoolExecutor(8) as ex:     # about 1x: the GIL serialises pure-Python bytecode
    list(ex.map(count_primes, [200_000] * 8))

with ProcessPoolExecutor(8) as ex:    # close to 8x on 8 cores, minus start-up and pickling
    list(ex.map(count_primes, [200_000] * 8))
```

In CPython, threads parallelise I/O and native code that releases the GIL (NumPy, compression, hashing of large buffers) but not pure-Python computation; processes, native extensions or the newer free-threaded builds do. Node needs `worker_threads` for CPU work, because anything CPU-heavy on the main thread stalls every connection. Tokio needs `spawn_blocking` or a separate pool such as rayon for the same reason. Go parallelises goroutines across `GOMAXPROCS` threads automatically; make sure that number matches the container's CPU quota rather than the host's core count (older Go versions needed a library for this; recent ones read the cgroup limit).

## Scaling I/O-bound work

I/O-bound work needs **concurrency** (many requests in flight) rather than parallelism (many instructions executing at once). With threads, a classic sizing formula is

$$ N_{threads} = N_{cores} \times \left(1 + \frac{W}{C}\right) $$

where $W$ is the time a task spends waiting and $C$ the time it computes. On 8 cores, with 5 ms of CPU and 45 ms of waiting per request, you need about $8 \times 10 = 80$ threads to keep the cores busy. Event loops and async runtimes get the same concurrency with one thread per core and thousands of cheap tasks ([I/O and system calls](/learn/systems/operating-systems/io-and-syscalls)).

```viz
{"type": "concurrency", "algorithm": "thread-pool", "threads": 3, "tasks": 6,
 "title": "A bounded pool of workers",
 "caption": "Size the pool to the bottleneck: about the core count for CPU-bound tasks, more for tasks that mostly wait, and never more than the downstream can serve."}
```

But concurrency only moves the queue downstream. If the database can serve 400 queries per second, 80 threads or 8,000 coroutines will all wait on it. The effective levers for an I/O-bound service are:

- **Make each wait shorter**: an index, a cache, a closer replica, a smaller payload.
- **Make fewer waits**: eliminate N+1 query patterns, fetch in bulk, batch (below).
- **Overlap independent waits**: call independent dependencies concurrently, so latency is the maximum of the calls rather than their sum.
- **Cap concurrency at what the downstream can serve**, with bounded pools and backpressure, so overload becomes a fast, visible rejection instead of a slow, invisible queue.

Overlapping independent calls is the cheapest latency win in most services:

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

## Batching: amortising the fixed cost

Most I/O has a large fixed cost per operation (a round trip, a syscall, an `fsync`, a transaction commit) and a small cost per item. The total is

$$ T(n) = \text{overhead} + n \times \text{per-item cost} $$

so grouping $n$ items into one operation divides the overhead by $n$. Inserting 10,000 rows one at a time over a 0.5 ms round trip costs 5 seconds. In batches of 500, with 0.01 ms per row on the server, it costs $20 \times (0.5 + 500 \times 0.01) = 110$ ms, 45 times faster.

```python
pipe = r.pipeline(transaction=False)   # redis-py
for key in keys:                       # 1,000 GETs...
    pipe.get(key)
values = pipe.execute()                # ...in one round trip instead of 1,000
```

The same idea appears everywhere: multi-row `INSERT` and `COPY`, Redis pipelining, Kafka's producer batching (`linger.ms` and `batch.size`), `writev`, a database's group commit, GPU inference batching and the DataLoader pattern that fixes N+1 queries in GraphQL servers. The cost is latency for the first item in a batch, which waits for the batch to fill. Every good batching policy therefore flushes on size *or* time, whichever comes first. Nagle's algorithm in TCP is a batching policy, and disabling it (`TCP_NODELAY`) is the same trade made the other way.

## Backpressure: when the bottleneck is full

When producers outpace the bottleneck, the excess has to go somewhere. An unbounded queue absorbs it silently: memory grows, every item's wait grows with it, and the service eventually fails with an out-of-memory kill after spending minutes serving requests whose clients have already given up. A bounded queue forces a decision at the point of overload: block the producer (propagating the slowdown upstream), reject fast (load shedding), or drop low-value work.

```viz
{"type": "system", "algorithm": "backpressure",
 "title": "Bounded buffers turn overload into a signal",
 "caption": "A full buffer slows or rejects the producer instead of growing without limit, so memory stays bounded and callers learn about overload immediately."}
```

Pair it with timeouts at every hop, so a request that has already exceeded its budget stops consuming a connection; the [resilience patterns lesson](/learn/system-design/building-blocks/resilience-patterns) covers the full set.

## The bottleneck moves

Every fix exposes the next limit. Remove the database wait and the service becomes CPU-bound on JSON serialisation. Add a cache and the network card or the cache's single hot key becomes the limit. Parallelise a job and the shared lock that was never contended becomes the serial fraction Amdahl's law warned you about ([profiling and measurement](/learn/systems/performance-engineering/profiling-and-measurement)). So the loop is always the same: measure, identify the single bottleneck, relieve it, and measure again, stopping when the target is met rather than when the ideas run out.

## Senior signals

- You separate CPU-bound, I/O-bound, memory-bound and contention-bound from `vmstat`, `pidstat -w` and `top -H` in minutes, and you know network waits show as idle and that iowait is unreliable.
- You instrument pool acquisition time and treat it as a first-class latency metric.
- You size pools with Little's law and keep bottleneck utilisation around 60–70%, knowing latency goes vertical as utilisation approaches 100%.
- You know autoscaling clients multiplies downstream connections, and you size pools from the downstream's capacity, with a pooler in between when the fleet is large.
- You parallelise CPU-bound work to the core count (and know the GIL, event-loop and quota caveats) and add concurrency, batching and overlap for I/O-bound work.
- You insist on bounded queues and explicit overload behaviour, because an unbounded queue is an outage with a delay.

## Check yourself

```quiz
- q: >-
    A service runs at 30% CPU with high p99 latency. Its database pool metrics show requests waiting an average of 80 ms to acquire a connection. What should you do first?
  options: ["Double the pool size on every pod right away", "Profile the CPU to find the hottest functions", "Find out why each connection is held so long", "Add more pods so the load spreads across them"]
  answer: 2
  explanation: >-
    The time is going to pool waits, so the bottleneck is the connection hold time (slow queries, work done while holding the connection) or the database behind it; check the database's capacity before touching pool sizes. More pods or bigger pools multiply connections to a database that may already be saturated. CPU profiling cannot see waiting.
- q: >-
    A service handles 1,500 requests per second, and each request holds a downstream connection for 40 ms. Using Little's law and a target of about 70% utilisation, roughly how many connections does the fleet need in total?
  options: ["About 1,500", "About 60", "About 40", "About 86"]
  answer: 3
  explanation: >-
    Busy connections on average are 1,500 times 0.04, which is 60. Running them at 70% utilisation needs about 60 divided by 0.7, about 86. Exactly 60 would be 100% utilisation, where queueing delay grows without bound.
- q: >-
    vmstat on an 8-core host shows r = 2, b = 0, id = 80, wa = 0, and a context-switch rate of 40,000 per second. What does this most likely indicate?
  options: ["A CPU-bound service that is short of cores", "A disk-bound service stuck waiting on reads", "A service waiting on a network downstream", "A host that is busy swapping memory to disk"]
  answer: 2
  explanation: >-
    Few runnable threads and mostly idle CPU rule out CPU-bound. No blocked threads and no iowait rule out disk. Threads blocking and waking constantly while the CPU idles is the signature of waiting on network I/O, which the kernel counts as idle.
- q: >-
    A CPU-heavy image-resizing function in a CPython web service is moved from the request thread to a ThreadPoolExecutor with 16 threads on an 8-core machine. Throughput barely changes. Why?
  options: ["16 threads is too many for 8 cores, so switching dominates", "The executor's unbounded queue delays every resize task", "The GIL lets only one thread run Python bytecode at any one time", "Thread pools add more overhead than the resize work saves"]
  answer: 2
  explanation: >-
    Threads in CPython parallelise waiting and GIL-releasing native code, not Python computation, so pure-Python resizing runs one thread at a time however many threads the pool has. A ProcessPoolExecutor, a native library that releases the GIL, or a free-threaded build is needed for CPU parallelism.
- q: >-
    Writing 20,000 events to a store with a 1 ms round trip takes 20 s one at a time. Batching 1,000 events per request, with about 0.02 ms per event on the server, takes roughly how long?
  options: ["About 20 ms", "About 20 s", "About 420 ms", "About 2,000 ms"]
  answer: 2
  explanation: >-
    There are 20 batches, each costing 1 ms of round trip plus 1,000 times 0.02 ms of per-item work, 21 ms in total per batch, so about 420 ms overall. Batching removes the repeated fixed cost, not the per-item cost.
```
