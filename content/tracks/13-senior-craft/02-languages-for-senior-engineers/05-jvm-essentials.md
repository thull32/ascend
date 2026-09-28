---
slug: jvm-essentials
title: "JVM essentials: JIT tiers, heap layout, G1 and ZGC, and concurrency in Java services"
description: How the JVM compiles code through its JIT tiers, lays out and collects memory with G1 and ZGC, what the Java Memory Model guarantees, what the collections really cost, and which concurrency utilities to reach for, all measured on JDK 21, with why it matters in Netflix-scale Java services.
minutes: 30
difficulty: hard
tags: [java, jvm, jit, garbage-collection, g1, zgc, java-memory-model, concurrency, virtual-threads, languages]
---
A Java service runs at a steady 2,000 requests per second with a p99 of 40 ms. Every few minutes the p99 jumps to 900 ms for a few seconds, while CPU and traffic stay flat. The GC log lines up exactly: a full collection of a 6 GB heap that a new in-memory cache has filled with long-lived objects. A week later the same service, moved to Kubernetes with a 4 GiB memory limit and `-Xmx4g`, is OOM-killed by the kernel with no Java exception anywhere.

Neither bug is in the business logic. Both come from not knowing what the runtime underneath is doing. The JVM runs a large share of the world's backend fleets, and Netflix in particular runs a large fleet of Java services. At the senior bar you are expected to reason about JIT warm-up after a deploy, which collector is running and why it pauses, how much memory the process really uses, and what the Java Memory Model promises about concurrent code. Every number below was measured on OpenJDK 21.0.12 on a 32-thread Ryzen 9 9950X3D under WSL2; treat them as orders of magnitude elsewhere.

## How the JVM runs your code: tiers, measured

`javac` compiles Java to bytecode. At run time the JVM loads classes lazily, interprets bytecode, and profiles it. Hot methods climb the **tiers**: tier 0 is the interpreter; tier 3 is C1, a fast compiler, emitting code that still collects profiles; tier 4 is C2, which recompiles using the profile (inlining, escape analysis that removes allocations, devirtualising calls that have only ever seen one class). Here is a method summing `area()` over 10,000 shapes, timed per call as the JVM warms up:

```java
static double work(Shape[] shapes) {
    double total = 0;
    for (Shape s : shapes) total += s.area();   // an interface call per element
    return total;
}
```

| Calls | Time per call | What the JVM is doing |
|---|---|---|
| 1 | 229 µs | Interpreting; loading and linking classes |
| 3–10 | 125 µs | Interpreting (with `-Xint`, every call stayed at 110–118 µs) |
| 11–100 | 11.8 µs | C1 code at tier 3, still profiling |
| 1,001–2,000 | 3.7 µs | C2 code at tier 4: `area()` inlined, one receiver class seen |
| A `Circle` class appears; call 2,001 | 441 µs | Deoptimised: C2's assumption broke, back to the interpreter |
| 2,011–3,000 | 4.6 µs | Recompiled for two receiver classes |

`-XX:+PrintCompilation` shows the same story in the runtime's words. Among its lines were `Warm2::work @ 11 (42 bytes)` at tier 3 and then 4 with a `%` flag (on-stack replacement: the running loop at bytecode 11 was swapped for compiled code mid-call), then `Warm2::work (42 bytes)` at tier 4, and after `Circle` loaded, `Warm2::work (42 bytes) made not entrant` (the compiled code was invalidated) followed by a fresh tier-4 compile. C1 alone (`-XX:TieredStopAtLevel=1`) plateaued at 4.9 µs, so C2's profile-driven work bought the last 25%, while interpreter to compiled was a factor of 30.

Two production consequences. **Warm-up**: a fresh instance is up to 30 times slower on its hot paths for its first seconds, and every rolling deploy shows a latency bump unless traffic ramps gradually (load-balancer slow start, canaries, synthetic warm-up requests before the instance is marked healthy). **Benchmarks lie by default**: a timing loop measures the interpreter, then C1, then C2, or a loop C2 deleted because its result was unused. Use JMH, which handles warm-up, dead-code elimination and forking ([benchmarking pitfalls](/learn/systems/performance-engineering/benchmarking-pitfalls)). Kotlin, Scala and Clojure compile to the same bytecode, so all of this applies to them.

## Memory layout: the process is bigger than the heap

| Region | Holds | Sized by |
|---|---|---|
| Java heap | Objects and arrays | `-Xmx`, or `-XX:MaxRAMPercentage` of the container limit |
| Thread stacks | One per platform thread | `-Xss` (1 MiB reserved per thread by default on 64-bit Linux) |
| Metaspace, class space | Class metadata | Grows with loaded classes; `-XX:MaxMetaspaceSize` |
| Code cache | JIT-compiled machine code | `-XX:ReservedCodeCacheSize` |
| GC data structures | Remembered sets, card tables, mark bitmaps | Proportional to heap size and collector |
| Direct buffers | Off-heap I/O buffers (NIO, Netty) | `-XX:MaxDirectMemorySize` |

Native Memory Tracking makes it concrete. A JVM with a 1 GB heap, about 320 threads and 64 MB of direct buffers (`-XX:NativeMemoryTracking=summary`, then `jcmd <pid> VM.native_memory summary`) reported 1,248 MB committed: the 1,024 MB heap, 102 MB of G1's own data structures, 64 MB of direct buffers, 33 MB of thread stacks actually touched (347 MB reserved) and a few MB of code and class data. A real service loads far more classes and code than this toy, so the gap grows. A heap equal to the container limit is therefore an OOM kill waiting to happen, with no `OutOfMemoryError`, because the kernel kills the process from outside. Set the heap to roughly 50 to 75% of the limit. The JVM has been container-aware since JDK 10 (backported to 8u191), but its default maximum heap is 25% of the container's memory, so an untuned 4 GiB pod gets a 1 GiB heap: set `-XX:MaxRAMPercentage=70` or an explicit `-Xmx`.

## Object sizes and the collections' real costs

On 64-bit HotSpot with compressed pointers (the default below about 32 GB of heap), an object is a 12-byte header, its fields, then padding to a multiple of 8. A class histogram (`jcmd <pid> GC.class_histogram`) of a program holding a million-element `ArrayList<Integer>`, a million-entry `HashMap<Integer, Integer>`, an `int[1_000_000]` and a `long[1_000_000]` reported:

| Class | Instances | Bytes each | What it is |
|---|---|---|---|
| `java.lang.Integer` | 3,000,262 | 16 | Every boxed value outside the cache, keys and values both |
| `java.util.HashMap$Node` | 1,001,015 | 32 | Hash, key, value, next pointer, header |
| `HashMap$Node[]` (the table) | 1 large | 4 per slot | 2²¹ slots for a million entries at load factor 0.75: 8.4 MB |
| `int[]` | 1 | 4 per element | 4.0 MB |
| `long[]` | 1 | 8 per element | 8.0 MB |

Add it up: the `ArrayList<Integer>` costs about 5 MB of references (capacity grows by half each time, so some slots are empty) plus 16 MB of `Integer` objects, about 21 MB against 4 MB for the `int[]`. The `HashMap<Integer, Integer>` costs 32 MB of nodes, 8 MB of table and 32 MB of boxed keys and values, about 72 bytes per entry, strikingly close to the 74 bytes CPython's dict measured. Boxing is a memory and GC cost, not only syntax; primitive collections (fastutil, Eclipse Collections) or arrays remove it on hot paths.

**Compressed oops** store references as 32-bit offsets scaled by 8. Cross about 32 GB of heap and references double to 64 bits, so a 34 GB heap can hold *fewer* objects than a 31 GB one, which is why production heaps are often capped at 31 GB.

**The `Integer` cache** is the boxing bug every Java interviewer knows. `Integer.valueOf` caches −128 to 127, and `==` on boxed values compares references:

```java
Integer a = 127, b = 127, c = 128, d = 128;
System.out.println(a == b);       // true: same cached object
System.out.println(c == d);       // false: two different objects
System.out.println(c.equals(d));  // true

Map<Character, Integer> need = new HashMap<>(), have = new HashMap<>();
need.put('x', 1000); have.put('x', 1000);
if (need.get('x') == have.get('x')) { /* never runs: compares references */ }
```

## Garbage collection: G1 and ZGC, measured

JVM collectors rely on the generational hypothesis: most objects die young. Allocation is a pointer bump inside a thread-local buffer; a young collection copies the few live objects out of Eden and discards the rest wholesale, so its cost is proportional to survivors, not to garbage. Survivors of several young collections are promoted to the old generation. A worked frequency: 500 MB/s of allocation into a 1 GB Eden means a young collection about every 2 seconds; double Eden and it runs every 4, each copying roughly the same live data, so total young-GC work halves. Allocation rate and young-generation size are the first two levers. The [memory management lesson](/learn/foundations/how-code-runs/memory-management) covers the tracing mechanics.

```viz
{"type": "memory", "algorithm": "gc-mark-sweep",
 "title": "Tracing from roots: what every JVM collector starts with",
 "caption": "Roots are thread stacks, static fields and JNI handles. Everything reachable is live and everything else is garbage, cycles included. JVM collectors then copy or compact live objects instead of only sweeping, which is what keeps allocation a pointer bump."}
```

**G1**, the default since JDK 9, splits the heap into equal regions (1 MB each for a 1 GB heap, as `-Xlog:gc+init` reported) and collects the regions with the most garbage first against a pause-time goal, 200 ms by default. **ZGC** marks *and* relocates concurrently using load barriers, so its pauses do not grow with the heap; it became generational in JDK 21 behind `-XX:+ZGenerational`, generational by default in JDK 23 and generational-only in JDK 24. The same program (512 MB of long-lived data, then 4.2 GB of short-lived 112-byte arrays, one thread, a 2 GB heap) under each collector with `-Xlog:gc`:

| Collector | Stop-the-world pauses | Median | Longest | Wall time, two runs |
|---|---|---|---|---|
| Parallel | 9 | 5.1 ms | 52 ms (promoting the live set) | 257, 253 ms |
| G1 | 12 | 3.7 ms | 15.8 ms | 1,082, 670 ms |
| Generational ZGC | 38 | 0.010 ms | 0.017 ms | 442, 474 ms |
| Serial | not logged | | | 236, 238 ms |

Read the table as a trade, not a ranking. ZGC's pauses were three orders of magnitude shorter; Parallel and Serial finished this single-threaded allocation loop fastest because they do no concurrent work and need no barriers on every reference; G1 sits between on pauses and paid the most here for its barriers and concurrent refinement. One synthetic loop is not your service, which is exactly why you measure with your own GC logs.

## When low-pause collectors still hurt

Two failure shapes, both measured. **Humongous objects in G1**: an object of half a region or more gets whole regions to itself. With a 1 GB heap, 1,048,576-byte arrays (a 1 MiB payload plus a 16-byte header) each needed two 1 MB regions, so only 511 fit (511 MB of data) before `OutOfMemoryError`, while 1,000,000-byte arrays fit 1,022 times and Parallel fit 995 of the 1 MiB arrays. **Allocation stalls in ZGC**: with the same 512 MB live set in a 700 MB heap, ZGC's pauses stayed sub-millisecond but the log showed 33 `Allocation Stall (main)` events totalling 22.5 ms, the longest 1.9 ms: the application thread waited because the concurrent collector could not free memory fast enough. G1 in the same squeeze ran 96 young pauses. Low-pause collectors trade CPU and headroom for latency; they do not make allocation free.

The diagnosis order a senior follows: turn on GC logging (`-Xlog:gc*:file=gc.log`), measure allocation rate and the live set (heap after a full or old collection), size the heap at a few times the live set, pick the collector for the goal (throughput or tail latency), and only then touch tuning flags.

## The Java Memory Model

Without synchronisation, one thread may never see another thread's write. The JIT may keep a field in a register, and CPUs buffer and reorder stores. This is not theoretical:

```java
static boolean running = true;             // BUG: must be volatile

// worker thread
while (running) spins++;

// main thread, 500 ms later
running = false;
```

Measured: with a plain field the worker was still spinning three seconds after `main` cleared the flag, because C2 had hoisted the read out of the loop. With `-Xint` (no JIT) the same code stopped. Declared `volatile`, it stopped at once, after 2.75 billion spins. `volatile` forbids caching the value and makes the write *happen-before* any read that observes it.

**Happens-before** is the contract: if A happens-before B, everything A's thread did before A is visible to B's thread after B. The edges that create it: program order within a thread; unlocking a monitor before any later lock of it; a `volatile` write before later reads of that field; `Thread.start()` before everything in the started thread; everything in a thread before another thread's `join()` on it returns; and `final` fields written in a constructor, visible to any thread that sees the object if `this` did not escape during construction. Two consequences come up constantly. Double-checked locking works only with a `volatile` instance field; without it another thread can see a partly constructed object. And `volatile` does not make compound actions atomic: `count++` is a read, an add and a write that two threads can interleave. The hardware side is in [atomics and lock-free programming](/learn/systems/concurrency/atomics-and-lock-free).

## Concurrency utilities, and how the pool really grows

`ThreadPoolExecutor` has four decisions: core size, maximum size, the queue and the rejection policy, and one rule that surprises most engineers: **it grows past the core size only when the queue is full.** Submitting seven blocking tasks to a pool with core 2, maximum 4 and an `ArrayBlockingQueue` of 2, the JDK reported:

| Task | Pool size after | Queue after | Why |
|---|---|---|---|
| 0, 1 | 1, 2 | 0 | Below core: start a thread |
| 2, 3 | 2 | 1, 2 | At core: queue it |
| 4, 5 | 3, 4 | 2 | Queue full: start a thread up to the maximum |
| 6 | 4 | 2 | Queue full and at maximum: `RejectedExecutionException` |

So `Executors.newFixedThreadPool(4)`, whose queue is an unbounded `LinkedBlockingQueue`, never grows and never rejects: after 100,000 submissions of blocking tasks it had 4 threads and 99,996 queued tasks, each holding memory while its caller's latency grows. Build pools explicitly:

```java
ThreadPoolExecutor pool = new ThreadPoolExecutor(
    16, 16,                                   // core and max threads
    60, TimeUnit.SECONDS,
    new ArrayBlockingQueue<>(500),            // bounded: overload becomes visible
    new ThreadPoolExecutor.CallerRunsPolicy() // backpressure: the submitter runs the task itself
);
```

Size CPU-bound pools near the core count and I/O-bound ones at about cores × (1 + wait time / compute time): a task waiting 90 ms and computing 10 ms on 8 cores suggests about 80 threads. A separate pool per downstream dependency is the **bulkhead** pattern, the thread-pool isolation Netflix's Hystrix library popularised: a slow dependency exhausts its own pool, not the service.

```viz
{"type": "concurrency", "algorithm": "thread-pool", "threads": 3,
 "title": "A bounded pool: reuse threads, queue the rest",
 "caption": "The pool bounds concurrency and the queue absorbs bursts. Give the queue a bound too, or overload turns into unbounded memory growth and latency instead of a visible rejection."}
```

**`CompletableFuture`** composes asynchronous work (`thenCompose`, `thenCombine`, `allOf`, `orTimeout`, `exceptionally`). Its hidden default is the shared `ForkJoinPool.commonPool()`, sized for CPU work, so blocking I/O in `supplyAsync(...)` without an executor starves every other user of that pool; pass your own executor for I/O.

**Counters and maps.** `ConcurrentHashMap.merge(key, 1, Integer::sum)` is an atomic per-key counter; keep slow work out of `computeIfAbsent`, which holds the bin's lock. With 8 threads incrementing one counter, `AtomicLong` took 47.6 ns per increment per thread and `LongAdder`, which stripes the count across cells and sums on read, 6.8 ns.

## Virtual threads and pinning

Virtual threads (final in JDK 21) are scheduled by the JVM onto a small pool of carrier threads; a virtual thread that blocks on I/O unmounts and frees its carrier. 100,000 tasks each sleeping 100 ms finished in 832 ms on virtual threads; 10,000 of them on a 200-thread platform pool took 5,041 ms, as 10,000 / 200 × 100 ms predicts. The caveat is **pinning**: on JDK 21, a virtual thread that blocks while holding a `synchronized` monitor cannot unmount. With 4 carriers, 64 virtual threads each sleeping 100 ms inside `synchronized` took 1,615 ms (64 / 4 × 100 ms), and the same code with `ReentrantLock` took 101 ms. JDK 24 (JEP 491) removed pinning for `synchronized`; native calls still pin. Never pool virtual threads, since they are cheap to create; bound concurrency against a downstream with a `Semaphore`, and beware large `ThreadLocal` values multiplied by the number of threads.

## Why this matters at Netflix

Netflix runs a large fleet of Java services and writes publicly about its runtime choices, which is the right material to prepare with:

- **Tail latency is a GC question.** Netflix's tech blog described switching its default from G1 to generational ZGC on JDK 21, with more than half of its critical streaming video services running it at the time, because GC pauses were a significant source of tail latency in its gRPC and DGS services, and reported that timeouts during GC pauses went away. At 2,000 requests per second, a 200 ms pause stalls about 400 requests on that instance alone.
- **New runtime features have new failure modes.** The same blog published a post-mortem ("Java 21 Virtual Threads - Dude, Where's My Lock?") in which services on Spring Boot 3 and embedded Tomcat became unresponsive after enabling virtual threads: virtual threads pinned in `synchronized` code occupied every carrier, so the thread that would release the lock could not be scheduled.
- **Deploys are warm-up events.** With continuous delivery and canary analysis, cold JVMs join the fleet constantly; a canary compared against a warm production fleet looks worse for reasons that have nothing to do with the code, which is why canary analysis compares it with a freshly started baseline.
- **Isolation is thread pools.** Bulkheads and circuit breakers are, on the JVM, concrete pools, queue bounds and timeouts. The [Netflix microservices case study](/learn/system-design/case-studies/netflix-microservices-and-resilience) covers the architecture.

## Failure modes in production

**Symptom: p99 spikes to hundreds of milliseconds every few minutes; CPU and traffic flat.** Diagnosis: the GC log shows long old-generation or full pauses as the live set approaches the heap. Fix: measure the live set; give the heap headroom of a few times it, or move to generational ZGC if the goal is tail latency, then cut allocation.

**Symptom: the pod is OOM-killed; no `OutOfMemoryError` in the logs.** Diagnosis: native memory outside the heap; NMT shows GC structures, thread stacks, metaspace and direct buffers pushing committed memory past the limit. Fix: heap at 50 to 75% of the limit, bounded direct memory, fewer platform threads.

**Symptom: `OutOfMemoryError: Java heap space` while the heap looks half empty.** Diagnosis: G1 humongous allocations; objects of half a region or more waste the rest of their regions (511 of 1,022 possible arrays fitted in the measurement). Fix: raise `-XX:G1HeapRegionSize`, or allocate slightly smaller buffers.

**Symptom: latency grows without bound under overload and heap usage climbs; nothing is rejected.** Diagnosis: `newFixedThreadPool` with its unbounded queue. Fix: a bounded queue and an explicit rejection policy, with a metric on queue depth.

**Symptom: after enabling virtual threads on JDK 21, the service hangs intermittently; thread dumps show no lock owner.** Diagnosis: pinned carriers, virtual threads blocked inside `synchronized`. Fix: `-Djdk.tracePinnedThreads=short` to find the sites, replace `synchronized` around blocking calls with `ReentrantLock`, or move to JDK 24 or later.

**Symptom: a flag set by one thread is never seen by another, only in production builds.** Diagnosis: a missing happens-before edge; the JIT hoisted the read. Fix: `volatile`, an atomic, or a lock.

## Java in coding interviews

| Interview need | Java idiom | Trap |
|---|---|---|
| Stack and queue | `ArrayDeque` (`push`/`pop`, `offer`/`poll`) | Legacy `Stack` is synchronised; `LinkedList` allocates a node per element |
| Heap | `PriorityQueue` with `Comparator.comparingInt(...)` | A subtraction comparator overflows |
| Floor and ceiling | `TreeMap.floorKey`, `ceilingKey`, `headMap`, `tailMap` | Returns `null`, which unboxes to an NPE |
| Counting | `map.merge(k, 1, Integer::sum)`, `getOrDefault` | `==` on boxed counts fails above 127 |
| Sorting | `Arrays.sort(int[])` dual-pivot quicksort, not stable; objects use TimSort, stable | Sorting `Integer[]` boxes every value |
| Arithmetic | `long` for sums and products; `Math.addExact` to throw on overflow | `Integer.MAX_VALUE + 1` printed −2147483648 |
| Strings | `StringBuilder` in loops | `+` in a loop copies each time |

```java
// Comparator by subtraction overflows: MAX_VALUE - (-5) wraps negative.
PriorityQueue<int[]> bad = new PriorityQueue<>((x, y) -> x[0] - y[0]);
// Safe:
PriorityQueue<int[]> pq = new PriorityQueue<>((x, y) -> Integer.compare(x[0], y[0]));
```

With `Integer.MAX_VALUE` and −5 in the queue, the subtraction comparator's `peek()` returned 2147483647 as the minimum; `Integer.compare` returned −5.

## Interviewer follow-ups

**"Why is a freshly deployed instance slower?"** Model answer: it is interpreting and compiling: measured, a hot method went from about 125 µs a call interpreted to 3.7 µs after C2, and a new receiver class caused a deoptimisation back to 441 µs; ramp traffic and warm up before taking load. Common wrong answer: "caches are cold", which is part of it but misses the JIT.

**"G1 or ZGC?"** Model answer: ZGC when tail latency matters, since its pauses stayed around 10 µs against G1's milliseconds, at the cost of throughput and headroom (a tight heap produced allocation stalls); G1 for general services with a pause goal; Parallel for batch throughput. Decide from GC logs and the live set. Common wrong answer: "ZGC is strictly better now".

**"Is `volatile` enough to make a counter thread-safe?"** Model answer: no; it gives visibility and ordering, not atomicity; `count++` is three steps; use `AtomicLong`, or `LongAdder` under contention (6.8 against 47.6 ns measured with 8 threads). Common wrong answer: "yes, volatile makes it thread-safe".

**"When does a `ThreadPoolExecutor` create threads beyond the core size?"** Model answer: only when the queue rejects the task, so with an unbounded queue never, which is why a fixed pool queues forever. Common wrong answer: "whenever all core threads are busy".

**"What goes wrong with virtual threads?"** Model answer: pinning in `synchronized` blocks or native calls on JDK 21 can occupy every carrier (Netflix published exactly this post-mortem), `ThreadLocal` memory multiplies, and pooling them defeats the point; bound downstream concurrency with a semaphore. Common wrong answer: "nothing, they are cheaper threads and that is all".

## What mid-level engineers get wrong

- **Setting `-Xmx` equal to the container limit.** Consequence: kernel OOM kills with no Java error.
- **Benchmarking with a timing loop.** Consequence: numbers from the interpreter or a deleted loop, and a wrong decision.
- **Using `==` on boxed values and subtraction comparators.** Consequence: code that passes small tests and fails above 127 or near `MAX_VALUE`.
- **Assuming a thread pool grows under load.** Consequence: four threads and a hundred thousand queued tasks.
- **Treating `volatile` as a lock.** Consequence: lost updates in counters and check-then-act races.
- **Blocking in the common pool or inside `synchronized` on virtual threads.** Consequence: starvation of unrelated work, or a hung service.
- **Tuning GC flags before measuring the live set.** Consequence: pauses move around while the real cause, allocation rate or heap headroom, stays.

## Exercise

The pool's growth rule is easier to believe once you have simulated it. Every expected output below follows the rules `ThreadPoolExecutor.execute` applies, and the first test is the run from the table above.

```exercise
id: thread-pool-growth
title: Simulate how a ThreadPoolExecutor grows
prompt: |
  Simulate `ThreadPoolExecutor.execute` for a pool with `core` core
  threads, at most `max_threads` threads, and a queue holding at most
  `queue_capacity` waiting tasks (null means unbounded). Threads are never
  removed. `tasks` is a list of `[submit_time, duration]` in
  non-decreasing submit order; a task runs for `duration` once a thread
  starts it.

  Before each submission, process every completion with finish time at or
  before the submit time, in time order: a thread that finishes takes the
  oldest queued task at that moment (finishing duration later), or becomes
  idle if the queue is empty.

  Then apply the rules in order and record the outcome:
  1. fewer than `core` threads exist: start a new thread for the task ("thread"),
     even if another thread is idle;
  2. else, if the queue has room: "queued" (an idle thread, if any, takes it at once);
  3. else, if fewer than `max_threads` threads exist: start a new thread ("thread");
  4. else: "rejected".

  Return the list of outcomes. `core` is at least 1.
languages: [python, javascript]
entry: simulate_pool
starter:
  python: |
    def simulate_pool(core, max_threads, queue_capacity, tasks):
        # your code here
        return []
  javascript: |
    function simulate_pool(core, max_threads, queue_capacity, tasks) {
      // your code here
      return [];
    }
tests:
  - args: [2, 4, 2, [[0, 10], [0, 10], [0, 10], [0, 10], [0, 10], [0, 10], [0, 10]]]
    expected: ["thread", "thread", "queued", "queued", "thread", "thread", "rejected"]
    label: grows past core only when the queue is full
  - args: [2, 8, null, [[0, 10], [0, 10], [0, 10], [0, 10], [0, 10]]]
    expected: ["thread", "thread", "queued", "queued", "queued"]
    label: an unbounded queue never reaches max
  - args: [1, 1, 1, [[0, 5], [1, 5], [2, 5], [6, 5]]]
    expected: ["thread", "queued", "rejected", "queued"]
    label: a completion frees the queue
  - args: [3, 5, 2, []]
    expected: []
    label: no tasks
  - args: [1, 2, 1, [[0, 100]]]
    expected: ["thread"]
  - args: [2, 3, 1, [[0, 10], [0, 1], [5, 10], [5, 10], [5, 10]]]
    expected: ["thread", "thread", "queued", "queued", "thread"]
    hidden: true
    label: an idle thread takes a queued task at once
  - args: [1, 1, 1, [[0, 5], [5, 5], [5, 5], [5, 5]]]
    expected: ["thread", "queued", "queued", "rejected"]
    hidden: true
    label: completions at the submit time happen first
  - args: [1, 2, 1, [[0, 3], [1, 3], [2, 3], [3, 3], [4, 3]]]
    expected: ["thread", "queued", "thread", "queued", "rejected"]
    hidden: true
hints:
  - "Track the number of threads, the idle count, a FIFO of queued durations, and a min-heap (or sorted list) of finish times for running tasks."
  - "Before each submission, pop every finish time <= submit_time; each finishing thread either starts the next queued task at its finish time or becomes idle."
  - "The rule order matters: a pool at its core size queues before it grows, which is why an unbounded queue means the maximum is never used."
```

## Senior signals

- You explain warm-up with the JIT tiers and deoptimisation, and ramp traffic to new instances instead of blaming the code.
- You size JVM memory against the container limit from Native Memory Tracking, not from `-Xmx` alone.
- You read a GC log, measure the live set and allocation rate first, and pick G1, ZGC or Parallel for a stated goal, knowing each one's failure mode (humongous objects, allocation stalls, long pauses).
- You state concurrency correctness in happens-before terms and never treat `volatile` as atomicity.
- You build thread pools with bounded queues and explicit rejection, knowing they grow past core only when the queue is full.
- You know the virtual-thread caveats (pinning before JDK 24, `ThreadLocal`, no pooling) and can cite a public post-mortem of them.
- You avoid `==` on boxed values and subtraction comparators by reflex, and know what boxing costs in memory.

## Check yourself

```quiz
- q: >-
    A hot method ran at 3.7 µs per call after warm-up. A new implementation of the interface it calls is loaded, and the next call takes 441 µs. What happened?
  options: ["C2's single-receiver assumption broke, so the code was deoptimised", "A full garbage collection ran to unload the classes no longer used", "The code cache filled up, so the JIT stopped compiling for a while", "The new class was compiled by C2 before the method could continue"]
  answer: 0
  explanation: >-
    C2 had inlined the only receiver it had seen; loading a second class invalidated that code ("made not entrant"), so execution fell back to the interpreter until the method was recompiled for two receivers at about 4.6 µs. Class loading does not trigger a full GC, and compilation happens in the background rather than blocking the call.
- q: >-
    With a 1 GB G1 heap (1 MB regions), only 511 byte arrays of exactly 1,048,576 bytes fit before OutOfMemoryError, but 1,022 arrays of 1,000,000 bytes fit. Why?
  options: ["G1 compresses arrays below one megabyte, doubling their capacity", "The larger arrays trigger the default 200 ms pause goal sooner", "Each 1 MiB array plus its header needs two humongous regions", "Arrays larger than 1 MiB are stored twice for concurrent copying"]
  answer: 2
  explanation: >-
    Objects of half a region or more are humongous and get whole contiguous regions; a 1 MiB payload plus the 16-byte header is slightly more than one region, so each takes two and wastes almost half. Nothing is compressed or stored twice. Raising the region size or allocating slightly smaller buffers fixes it.
- q: >-
    Generational ZGC kept every pause under 0.02 ms, yet with a 512 MB live set in a 700 MB heap the log showed 33 allocation stalls. What does that mean?
  options: ["ZGC fell back to a stop-the-world full collection on every stall", "Application threads waited because reclamation fell behind allocation", "The heap is fragmented, because ZGC does not compact the old generation", "The stalls are pauses of the collector that ZGC does not report as pauses"]
  answer: 1
  explanation: >-
    ZGC's pauses are tiny because marking and relocation are concurrent, but if the application allocates faster than the collector frees memory, the allocating thread must wait. The fix is headroom or lower allocation, not a different pause setting. ZGC relocates (compacts) concurrently and did not fall back to full collections here.
- q: >-
    A worker loops on a plain boolean field that another thread sets to false. Measured, it was still spinning three seconds later, but stopped at once under -Xint. What explains the difference?
  options: ["The write stays in the other thread's cache until that thread terminates", "Compiled loops run too fast for the operating system to deliver the update", "The interpreter flushes CPU caches on every bytecode, which compiled code skips", "The JIT hoisted the read out of the loop; no happens-before edge forbade it"]
  answer: 3
  explanation: >-
    Without volatile, a lock or another happens-before edge, C2 may read the field once and keep it in a register, so the loop never sees the write; the interpreter happens to re-read the field each iteration. Hardware cache coherence would deliver the write; the problem is the compiled code never loads it again. Declaring the field volatile fixed it.
- q: >-
    A pool has core 2, max 4 and an ArrayBlockingQueue of capacity 2. Seven long tasks arrive at once. How does it respond?
  options: ["Four threads at once, two queued, then one rejection", "Four threads, three queued, since the maximum is reached first", "Two threads, two queued, two more threads, then one rejection", "Two threads, then five tasks queued, with no rejection"]
  answer: 2
  explanation: >-
    execute starts threads up to the core size, then queues, and only starts threads beyond the core when the queue refuses the task; at the maximum with a full queue it rejects. The JDK reported exactly this sequence. With an unbounded queue the pool would never grow past two threads, which is the fixed-pool trap.
- q: >-
    On JDK 21, 64 virtual threads each sleep 100 ms inside a synchronized block, with 4 carrier threads. It took 1,615 ms; with ReentrantLock, 101 ms. Why?
  options: ["synchronized uses a slower lock that adds 25 ms to each acquisition", "Blocking inside synchronized pins the carrier, so only 4 run at once", "ReentrantLock creates new carriers on demand, up to one per thread", "Virtual threads cannot sleep, so each call falls back to a platform thread"]
  answer: 1
  explanation: >-
    A virtual thread blocked while holding a monitor cannot unmount on JDK 21, so it occupies its carrier and the 64 sleeps run 4 at a time: 16 rounds of 100 ms. With ReentrantLock the sleeping threads unmount and all 64 overlap. JDK 24 removed this pinning for synchronized; the carrier pool does not grow per thread.
```
