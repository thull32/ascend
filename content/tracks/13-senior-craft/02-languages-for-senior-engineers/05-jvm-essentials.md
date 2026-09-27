---
slug: jvm-essentials
title: "JVM essentials: memory, garbage collection and concurrency in Java services"
description: How the JVM compiles, lays out and collects memory, what the Java Memory Model guarantees, which concurrency utilities to reach for, and why it all matters in Netflix-scale Java services.
minutes: 30
difficulty: hard
tags: [java, jvm, garbage-collection, java-memory-model, concurrency, virtual-threads, languages]
---
A Java service runs at a steady 2,000 requests per second with a p99 of 40 ms. Every few minutes the p99 jumps to 900 ms for a few seconds, while CPU and traffic stay flat. The GC log lines up exactly: a full collection of a 6 GB heap that a new in-memory cache has filled with long-lived objects. A week later the same service, moved to Kubernetes with a 4 GiB memory limit and `-Xmx4g`, is OOM-killed by the kernel with no Java exception anywhere.

Neither bug is in the business logic. Both come from not knowing what the runtime underneath is doing. The JVM runs a large share of the world's backend fleets, and Netflix in particular runs a very large fleet of Java services. At the senior bar you are expected to reason about JIT warm-up after a deploy, which collector is running and why it pauses, how much memory the process really uses, and what the Java Memory Model promises about concurrent code. This lesson covers each by mechanism.

## How the JVM runs your code

`javac` compiles Java to platform-independent **bytecode**. At runtime the JVM loads classes lazily, starts executing bytecode in an interpreter, and profiles it. Hot methods are compiled by the **tiered JIT**: C1 compiles quickly with profiling instrumentation, and C2 later recompiles the hottest code aggressively using what the profile revealed (inlining, escape analysis that can eliminate allocations, devirtualising interface calls that only ever see one implementation). If a later event breaks an assumption, for example a second implementation of that interface gets loaded, the JVM *deoptimises* back to the interpreter and recompiles.

Two production consequences:

- **Warm-up.** A freshly started instance is interpreted and cold. For its first seconds to minutes it is slower and allocates more, so every rolling deploy shows a latency bump. Mitigations: ramp traffic to new instances gradually (load-balancer slow start, canaries), send synthetic warm-up requests before marking the instance healthy, and use class-data sharing to cut class-loading time.
- **Benchmarks lie by default.** A naive timing loop measures the interpreter, then the JIT, then possibly a loop the JIT deleted because its result was unused. Use JMH, which handles warm-up, dead-code elimination and forking. The [benchmarking pitfalls](/learn/systems/performance-engineering/benchmarking-pitfalls) lesson covers why.

Kotlin, Scala and Clojure compile to the same bytecode and run on the same runtime, so everything below applies to them too.

## Memory layout: the process is bigger than the heap

| Region | Holds | Sized by |
|---|---|---|
| Java heap | Objects and arrays | `-Xmx`, or `-XX:MaxRAMPercentage` of the container limit |
| Thread stacks | One per platform thread; frames with locals | `-Xss` (about 1 MiB reserved per thread by default on 64-bit Linux) |
| Metaspace | Class metadata | Grows with loaded classes; `-XX:MaxMetaspaceSize` |
| Code cache | JIT-compiled machine code | `-XX:ReservedCodeCacheSize` |
| Direct buffers | Off-heap I/O buffers (NIO, Netty) | `-XX:MaxDirectMemorySize` |

The heap is only part of the process. A service with `-Xmx4g`, 400 threads, 200 MB of metaspace and a Netty pool of direct buffers uses well over 4 GiB of resident memory, so in a 4 GiB container the kernel kills it without any `OutOfMemoryError`. The rule: set the heap to roughly 50 to 75% of the container limit. The JVM has been container-aware since JDK 10 (backported to 8u191), but its default maximum heap is only 25% of the container's memory, so an untuned 4 GiB pod gets a 1 GiB heap. Set `-XX:MaxRAMPercentage=70` or an explicit `-Xmx`.

**Object sizes** on a 64-bit HotSpot JVM with compressed pointers: a 12-byte header (mark word plus class pointer), fields, then padding to a multiple of 8. `new Object()` is 16 bytes, an `Integer` is 16 bytes, a `Long` is 24. An `ArrayList<Integer>` of a million elements is a 4 MB array of references plus a million 16-byte `Integer` objects, about 20 MB, against 4 MB for an `int[]`. Boxing is a memory and GC cost, not just syntax.

**Compressed oops.** Below about 32 GB of heap, the JVM stores references as 32-bit offsets scaled by 8, halving the size of every pointer. Cross that line and references become 64-bit, so a 34 GB heap can hold *fewer* objects than a 31 GB one. This is why you see heaps capped at 31 GB in production.

**The `Integer` cache** is the boxing bug every Java interviewer knows. `Integer.valueOf` caches -128 to 127:

```java
Integer a = 127, b = 127, c = 128, d = 128;
System.out.println(a == b);       // true: same cached object
System.out.println(c == d);       // false: two different objects
System.out.println(c.equals(d));  // true

Map<Character, Integer> need = new HashMap<>(), have = new HashMap<>();
need.put('x', 1000); have.put('x', 1000);
if (need.get('x') == have.get('x')) { /* never runs: compares references */ }
```

The map version is a classic failure in sliding-window solutions: the code passes every small test and fails once a count exceeds 127.

## Garbage collection

JVM collectors rely on the **generational hypothesis**: most objects die young. The young generation (Eden plus two survivor spaces) is collected by *copying* the few live objects out and discarding the rest wholesale, so its cost is proportional to what survives, not to what was allocated. Allocation itself is a pointer bump inside a thread-local buffer, a few nanoseconds. Objects that survive several young collections are promoted to the old generation, which is collected less often and more expensively.

```viz
{"type": "memory", "algorithm": "gc-mark-sweep",
 "title": "Tracing from roots: what every JVM collector starts with",
 "caption": "Roots are thread stacks, static fields and JNI handles. Everything reachable is live and everything else is garbage, cycles included. JVM collectors then copy or compact live objects instead of only sweeping, which is what keeps allocation a pointer bump."}
```

A worked frequency calculation: a service allocates 500 MB/s and has a 1 GB Eden, so a young collection runs about every 2 seconds. Double Eden to 2 GB and it runs every 4 seconds, while each collection copies roughly the same amount of surviving data (requests in flight). Total young-GC work halves. That is why reducing the **allocation rate** and giving the young generation room are the first two levers, long before exotic flags.

| Collector | Design | Choose it for |
|---|---|---|
| Serial | Single-threaded, stop-the-world | Tiny heaps, one-CPU containers |
| Parallel | Multi-threaded, stop-the-world, maximises throughput | Batch jobs where pauses do not matter |
| G1 (default since JDK 9) | Heap split into regions; collects the regions with most garbage first against a pause-time goal (200 ms by default) | General-purpose services with heaps up to tens of GB |
| ZGC | Concurrent marking *and* compaction using load barriers; pauses typically well under a millisecond regardless of heap size; generational since JDK 21 | Latency-sensitive services, large heaps |
| Shenandoah | Concurrent compaction with a different barrier design | Similar goals to ZGC |

Concurrent collectors still fail in one way: if the application allocates faster than the collector can reclaim, threads stall waiting for memory (ZGC calls this an allocation stall; G1 falls back to a full, stop-the-world collection). Low-pause collectors trade CPU and memory headroom for latency; they do not make allocation free.

The diagnosis order a senior engineer follows: turn on GC logging (`-Xlog:gc*:file=gc.log`), measure allocation rate and the live set (heap size right after a full or old collection), size the heap at a few times the live set, pick the collector for the goal (throughput or tail latency), and only then touch tuning flags.

## The Java Memory Model

Without synchronisation, one thread may never see another thread's write. The JIT can keep a field in a register, and CPUs buffer and reorder stores. This loop may spin forever:

```java
class Worker implements Runnable {
    private boolean running = true;          // BUG: must be volatile
    public void run() { while (running) { /* work with no synchronisation */ } }
    public void stop() { running = false; }  // called from another thread; may never be observed
}
```

The JIT is allowed to read `running` once and hoist it out of the loop, because nothing in the loop tells it another thread is involved. Declaring the field `volatile` forbids that: every read sees the most recent write, and the write *happens-before* the read that observes it.

**Happens-before** is the contract. If action A happens-before B, everything A's thread did before A is visible to B's thread after B. The edges that create it:

- Program order within one thread.
- Unlocking a monitor (`synchronized` exit) happens-before every later lock of the same monitor.
- A `volatile` write happens-before every later read of that field.
- `Thread.start()` happens-before everything in the started thread; everything in a thread happens-before another thread's `join()` on it returning.
- Values written to `final` fields in a constructor are visible to any thread that sees the object, provided `this` did not escape during construction.

Two consequences come up constantly. Double-checked locking works only if the instance field is `volatile`; without it, another thread can see a non-null reference to a partially constructed object. And `volatile` does not make compound actions atomic: `count++` on a volatile field is still a read, an add and a write that two threads can interleave. Use `AtomicLong`, `LongAdder` or a lock. The hardware side of this story is in [atomics and lock-free programming](/learn/systems/concurrency/atomics-and-lock-free).

## Concurrency utilities you should reach for

**Thread pools.** `ThreadPoolExecutor` has four decisions: core size, maximum size, the queue, and the rejection policy. The trap is the convenience factory: `Executors.newFixedThreadPool(n)` uses an *unbounded* queue, so under overload tasks pile up in memory, every queued request's latency grows without limit, and the process eventually runs out of heap. Build pools explicitly:

```java
ThreadPoolExecutor pool = new ThreadPoolExecutor(
    16, 16,                                   // core and max threads
    60, TimeUnit.SECONDS,
    new ArrayBlockingQueue<>(500),            // bounded: overload becomes visible
    new ThreadPoolExecutor.CallerRunsPolicy() // backpressure: the submitter runs the task itself
);
```

Sizing follows the work: roughly the number of cores for CPU-bound tasks, and cores × (1 + wait time / compute time) for I/O-bound ones (a task that waits 90 ms and computes 10 ms on 8 cores suggests about 80 threads). A separate pool per downstream dependency is the **bulkhead** pattern: a slow dependency exhausts its own pool, not the whole service. That is exactly what Netflix's Hystrix library did with thread-pool isolation.

```viz
{"type": "concurrency", "algorithm": "thread-pool", "threads": 3,
 "title": "A bounded pool: reuse threads, queue the rest",
 "caption": "The pool bounds concurrency and the queue absorbs bursts. Give the queue a bound too, or overload turns into unbounded memory growth and latency instead of a visible rejection."}
```

**CompletableFuture** composes asynchronous work: `thenCompose` for sequencing, `thenCombine` and `allOf` for fan-in, `orTimeout` for deadlines, `exceptionally` for fallbacks. Its hidden default is the shared `ForkJoinPool.commonPool()`, sized for CPU work; blocking I/O in `supplyAsync(...)` without an executor starves every other user of that pool. Always pass your own executor for I/O:

```java
CompletableFuture<String> user = CompletableFuture.supplyAsync(() -> loadUser(id), ioPool);
CompletableFuture<Integer> score = CompletableFuture.supplyAsync(() -> loadScore(id), ioPool);
String summary = user.thenCombine(score, (u, s) -> u + ":" + s)
    .orTimeout(200, TimeUnit.MILLISECONDS)
    .exceptionally(e -> "fallback")
    .join();
```

**Concurrent collections and counters.** `ConcurrentHashMap.computeIfAbsent` and `merge` are atomic per key, so `counts.merge(key, 1, Integer::sum)` is a correct concurrent counter. Do not put slow work inside `computeIfAbsent`; it holds a lock on that bin. Under heavy contention, `LongAdder` beats `AtomicLong` by striping the count across cells and summing on read. Beyond those: `ReentrantLock` (with `tryLock(timeout)`), `ReadWriteLock`, `Semaphore` for limiting concurrency, and `CountDownLatch` for "wait until N things finish".

**Virtual threads** (final in JDK 21) are threads scheduled by the JVM onto a small pool of carrier threads. When a virtual thread blocks on I/O, it unmounts and the carrier runs another, so you can write simple thread-per-request code at 100,000 concurrent requests:

```java
try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
    List<Future<Response>> calls = backends.stream()
        .map(b -> executor.submit(() -> client.call(b)))   // one cheap thread per call
        .toList();
    // ...
}
```

Their caveats are the new senior-level questions. Until JDK 24, blocking inside a `synchronized` block *pinned* the carrier thread, so a few pinned threads could stall the whole scheduler; recent JDKs lift that restriction for `synchronized`, but native calls still pin. Never pool virtual threads, since they are cheap to create; limit concurrency against a downstream with a `Semaphore` instead. And code that stores large objects in `ThreadLocal` multiplies that memory by the number of virtual threads.

## Why this matters at Netflix

Netflix runs a large fleet of Java services, historically built on its own open-source JVM libraries (Hystrix for circuit breaking and bulkheads, Eureka for discovery, Zuul at the edge, RxJava for reactive composition) and more recently on Spring Boot. At that scale the runtime is part of the design:

- **Tail latency is a GC question.** At 2,000 requests per second, a 200 ms pause stalls about 400 requests on that instance alone. Choosing a collector, sizing the heap and cutting allocation are routine senior work there, not specialist tuning.
- **Deploys are warm-up events.** Continuous delivery with canary analysis means cold JVMs join the fleet constantly; a canary compared against the warm production fleet will look worse for reasons that have nothing to do with the code, which is why canary analysis usually compares it with a freshly started baseline of the old version.
- **Isolation is thread pools.** The bulkhead and circuit-breaker patterns Netflix popularised are, on the JVM, concrete thread pools, queue bounds and timeouts. The [Netflix microservices case study](/learn/system-design/case-studies/netflix-microservices-and-resilience) covers the architecture.
- **Containers change the arithmetic.** Heap percentage, thread stacks and direct memory decide whether a pod is OOM-killed.

## Java in coding interviews

Java is verbose but predictable, and its collections cover every interview need. The toolkit: `ArrayDeque` for stacks and queues (not the legacy `Stack` or `LinkedList`), `PriorityQueue` with a comparator, `TreeMap` with `floorKey`, `ceilingKey`, `headMap` and `tailMap` for ordered queries, `HashMap` with `getOrDefault` and `merge`, and `StringBuilder`. `Arrays.sort` on primitives uses a dual-pivot quicksort (not stable); on objects it uses TimSort (stable).

Two traps beyond the `Integer` cache:

```java
// Comparator by subtraction overflows: MAX_VALUE - (-5) wraps negative.
PriorityQueue<int[]> bad = new PriorityQueue<>((x, y) -> x[0] - y[0]);
// Safe:
PriorityQueue<int[]> pq = new PriorityQueue<>((x, y) -> Integer.compare(x[0], y[0]));
```

With the subtraction comparator, a heap containing `Integer.MAX_VALUE` and `-5` reports `MAX_VALUE` as the minimum. And `int` arithmetic overflows silently: sums of large arrays and products need `long`, or `Math.addExact` if you want an exception instead of a wrong answer.

## Senior signals

- You explain a latency spike with the GC log and a live-set measurement before proposing flags, and you know which collector suits which goal.
- You size JVM memory against the container limit, accounting for thread stacks, metaspace, code cache and direct buffers, not just `-Xmx`.
- You state concurrency correctness in happens-before terms: which `volatile`, lock, start/join or final-field edge makes a write visible.
- You build thread pools with bounded queues and explicit rejection, size them from the wait-to-compute ratio, and isolate dependencies with bulkheads.
- You never block in the common pool, and you know the virtual-thread caveats (pinning, pooling, `ThreadLocal`).
- You avoid `==` on boxed values and subtraction comparators by reflex.

## Check yourself

```quiz
- q: >-
    A JVM with -Xmx4g runs in a container with a 4 GiB memory limit and is killed by the kernel with no OutOfMemoryError logged. What is the most likely explanation?
  options: ["Compressed oops switch off at 4 GB, so every object reference doubles in size", "The heap is too small for the live set, so the GC thrashes until the kernel steps in", "Native memory outside the heap (stacks, metaspace, buffers) pushes RSS past 4 GiB", "The garbage collector is disabled in containers, so the heap never shrinks"]
  answer: 2
  explanation: >-
    -Xmx bounds only the Java heap. Thread stacks, metaspace, the code cache and direct buffers are native memory, so a heap equal to the container limit guarantees an OOM kill. A heap too small for the live set would throw OutOfMemoryError, which is logged. Size the heap at roughly 50 to 75% of the limit.
- q: >-
    Your service allocates 800 MB/s and runs a young collection every second with a 800 MB Eden. You double Eden. What happens to total young-GC work, assuming the amount of live data per collection stays similar?
  options: ["It doubles, because each collection scans twice as much memory", "It is unchanged, because the same bytes are allocated per second", "It drops to zero, because objects now die before Eden ever fills", "It roughly halves, because there are half as many collections"]
  answer: 3
  explanation: >-
    Copying collectors pay for survivors, not for garbage. A larger Eden means collections happen half as often, each copying about the same surviving data, so total work roughly halves. Allocation continues at the same rate, so Eden still fills and collections do not stop. That is why allocation rate and young-generation sizing are the first levers.
- q: >-
    A `running` flag is a plain boolean read in a worker loop and set to false by another thread. The worker never stops. Why, and what fixes it?
  options: ["The worker never yields the CPU; call Thread.yield() so the write propagates", "No happens-before edge lets the JIT hoist the read; declare the field volatile", "A primitive is copied per thread; make the flag a shared Boolean object", "The flag must be static to be shared; make it a static field of the class"]
  answer: 1
  explanation: >-
    The memory model only guarantees visibility across threads through happens-before edges; without one, the JIT may hoist the read out of the loop. A volatile write happens-before subsequent reads of that field, and it forbids caching the value in a register. yield() gives no visibility guarantee, and boxing or making the field static changes nothing about visibility.
- q: >-
    Why is Executors.newFixedThreadPool(32) a risky default for a request-handling service?
  options: ["Its queue is unbounded, so overload piles up tasks instead of rejecting them", "Its threads are daemon threads, so in-flight requests die on shutdown", "It cannot run Callable tasks, so errors from handlers are silently lost", "It creates all 32 threads eagerly, so idle services waste memory on their stacks"]
  answer: 0
  explanation: >-
    The fixed pool uses an unbounded LinkedBlockingQueue, so under overload tasks accumulate in memory and latency grows without limit. A bounded queue with an explicit rejection policy such as CallerRunsPolicy turns overload into visible backpressure. The pool creates threads lazily and runs Callables fine.
- q: >-
    In a sliding-window solution you compare counts with `need.get(c) == have.get(c)` on two HashMap<Character, Integer>. Small tests pass and a large test fails. Why?
  options: ["Character keys collide in the HashMap once the window holds many distinct letters", "The counts overflow Integer once the input is large enough to exceed its range", "== compares Integer references, and only values from -128 to 127 are cached", "HashMap iteration order changes as the map grows past its resize threshold"]
  answer: 2
  explanation: >-
    Autoboxing uses Integer.valueOf, which caches values from -128 to 127, so == happens to work until a count exceeds 127 and the two sides become different objects. Use equals() or compare unboxed ints. Key collisions affect performance, not correctness, and counts nowhere near 2^31 cannot overflow.
- q: >-
    You move a blocking-I/O service to virtual threads on JDK 21 and throughput collapses under load. Which cause is most plausible?
  options: ["Virtual threads cannot do blocking I/O, so each call falls back to a platform thread", "Blocking inside synchronized blocks pins the carrier threads, starving the carrier pool", "Virtual threads use more stack memory than platform threads, so the heap fills", "Virtual threads disable JIT compilation, so hot paths run in the interpreter"]
  answer: 1
  explanation: >-
    On JDK 21, a virtual thread that blocks while holding a monitor cannot unmount, tying up its carrier. With carriers roughly equal to cores, a handful of pinned threads stalls everything. Replace synchronized around blocking calls with ReentrantLock or upgrade to a JDK that removes this pinning.
```
