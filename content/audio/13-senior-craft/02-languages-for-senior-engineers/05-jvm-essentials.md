---
lesson: jvm-essentials
source: c9ed08d900872a86
fit: great
desk:
  - "The JIT warm-up table and the PrintCompilation lines"
  - "The memory-regions table and the Native Memory Tracking breakdown"
  - "The class histogram of boxed collections, and the Integer cache snippet"
  - "The four-collector comparison table"
  - "The happens-before edges listed in full"
  - "The thread-pool growth table and the explicit pool constructor"
  - "The Java interview idiom table and the subtraction comparator"
  - "Exercise: simulate how a ThreadPoolExecutor grows"
---
## Introduction

A Java service runs at a steady 2,000 requests a second with a 99th percentile of 40 milliseconds. Every few minutes the 99th percentile jumps to 900 milliseconds for a few seconds, while CPU and traffic stay flat. The GC log lines up exactly: a full collection of a 6 gigabyte heap that a new in-memory cache has filled with long-lived objects.

A week later, the same service moves to Kubernetes with a 4 gibibyte memory limit and a 4 gigabyte heap. The kernel kills it for running out of memory, with no Java exception anywhere.

Neither bug is in the business logic. Both come from not knowing what the runtime is doing. At the senior bar you are expected to reason about JIT warm-up after a deploy, which collector is running and why it pauses, how much memory the process really uses, and what the Java Memory Model promises. That is the plan, plus thread pools and virtual threads, and why Netflix cares.

## Warm-up: the JIT tiers

The Java compiler turns source into bytecode. At run time, the JVM interprets that bytecode and profiles it, and hot methods climb the tiers. The interpreter first. Then C1, a fast compiler whose code still collects profiles. Then C2, which recompiles using the profile: inlining, removing allocations, and turning interface calls that have only ever seen one class into direct calls.

The lesson timed a method summing areas over 10 thousand shapes as the JVM warmed up. Interpreted, about 125 microseconds a call. Under C1, about 12. Under C2, 3.7. Interpreter to fully compiled is a factor of 30, and C2's profile-driven work bought the last quarter.

Then a new shape class appears for the first time. The next call takes 441 microseconds. Before I explain: what happened?

[pause]

C2 had inlined the only receiver it had ever seen. Loading a second class broke that assumption, so the compiled code was invalidated and execution fell back to the interpreter: a deoptimisation. It was recompiled for two classes, at about 4.6 microseconds.

Two production consequences. Warm-up: a fresh instance can be up to 30 times slower on its hot paths for its first seconds, so every rolling deploy shows a latency bump unless traffic ramps gradually, with slow start on the load balancer, canaries, or synthetic warm-up requests before the instance is marked healthy. And benchmarks lie by default: a timing loop measures the interpreter, then C1, then C2, or a loop C2 deleted because its result was unused. Use JMH. Kotlin, Scala and Clojure run on the same bytecode, so all of this applies to them too.

## The process is bigger than the heap

The heap holds objects. But the process also holds thread stacks, class metadata, the compiled code cache, the collector's own data structures, and direct buffers for I/O.

The lesson measured a JVM with a 1 gigabyte heap, about 320 threads and 64 megabytes of direct buffers. Committed memory was 1,248 megabytes. The heap was 1,024 of it; G1's own structures were 102; direct buffers 64; thread stacks about 33. A real service loads far more classes and code, so the gap grows.

So a heap equal to the container limit is a kill waiting to happen, with no out-of-memory error, because the kernel kills the process from outside. Set the heap to roughly 50 to 75 percent of the limit. And the opposite trap: the JVM is container-aware, but its default maximum heap is 25 percent of the container's memory, so an untuned 4 gibibyte pod gets a 1 gibibyte heap. Set the max RAM percentage, around 70, or an explicit heap size.

## What objects really cost

With compressed pointers, the default below about 32 gigabytes of heap, an object is a 12-byte header, its fields, and padding to a multiple of 8. A boxed Integer is 16 bytes.

So boxing is a memory cost, not just syntax. An array list of a million Integers came to about 21 megabytes, against 4 for a plain int array. A hash map of a million Integer pairs was about 72 bytes an entry: the node, the table slot, and two boxed objects. That is strikingly close to the 74 bytes CPython's dict measured.

Compressed pointers store references as 32-bit offsets scaled by 8. Cross about 32 gigabytes and references double, so a 34 gigabyte heap can hold fewer objects than a 31 gigabyte one. That is why production heaps are often capped at 31.

And the boxing bug every Java interviewer knows. Integer value-of caches minus 128 to 127, and double equals on boxed values compares references. Two boxed 127s compare equal. Two boxed 128s do not. Compare two counts pulled out of two maps with double equals, and the check silently fails once the counts pass 127. Use equals.

## G1, ZGC, and where low pauses still hurt

JVM collectors rely on the generational hypothesis: most objects die young. Allocation is a pointer bump. A young collection copies the few live objects out and discards the rest wholesale, so its cost is proportional to survivors, not garbage. A worked example: 500 megabytes a second of allocation into a 1 gigabyte young generation means a young collection about every 2 seconds. Double the young generation and it runs every 4, each copying roughly the same live data, so total work halves. Allocation rate and young-generation size are the first two levers.

G1, the default, splits the heap into equal regions and collects the regions with the most garbage first, against a pause goal of 200 milliseconds by default. ZGC marks and relocates concurrently, so its pauses do not grow with the heap; it is generational on JDK 21 behind a flag, and by default from JDK 23.

The lesson ran one program under four collectors. ZGC's longest pause was 0.017 milliseconds. G1's was about 16. Parallel's was 52, but Parallel and Serial finished the single-threaded loop fastest, because they do no concurrent work and need no barriers on every reference. G1 paid the most here for its barriers. Read that as a trade, not a ranking, and measure with your own GC logs.

Low-pause collectors have their own failures. First, humongous objects in G1. An object of half a region or more gets whole regions to itself. With 1 megabyte regions, an array of exactly one mebibyte plus its 16-byte header needs two regions, so only 511 fitted in a 1 gigabyte heap before an out-of-memory error, while 1,022 arrays of a million bytes fitted. That is the "heap looks half empty" error. Raise the region size, or allocate slightly smaller buffers.

Second, allocation stalls in ZGC. With a 512 megabyte live set squeezed into a 700 megabyte heap, ZGC's pauses stayed tiny, but the log showed 33 allocation stalls: the application thread waited because the concurrent collector could not free memory fast enough. Low-pause collectors trade CPU and headroom for latency. They do not make allocation free.

The diagnosis order a senior follows: turn on GC logging, measure allocation rate and the live set, size the heap at a few times the live set, pick the collector for the goal, and only then touch tuning flags.

## The Java Memory Model

Without synchronisation, one thread may never see another thread's write. Here is the measured case. A worker loops while a plain boolean "running" is true. The main thread sets it false 500 milliseconds later. Three seconds after that, the worker was still spinning. With the JIT disabled, it stopped. Why?

[pause]

C2 hoisted the read out of the loop: it read the field once and kept it in a register, and nothing forbade that, because no happens-before edge connected the write to the reads. Declared volatile, the loop stopped at once, after 2.75 billion spins.

Happens-before is the contract. If A happens-before B, everything A's thread did before A is visible to B's thread after B. The edges include program order, unlocking a monitor before a later lock of it, a volatile write before later reads of that field, starting a thread, and joining one.

Two consequences come up constantly. Double-checked locking works only with a volatile instance field; otherwise another thread can see a partly constructed object. And volatile does not make compound actions atomic. Count plus-plus is a read, an add and a write, and two threads can interleave them. Use an atomic, or under contention a LongAdder, which stripes the count across cells: with 8 threads, 6.8 nanoseconds an increment against 47.6 for an AtomicLong.

## Thread pools and virtual threads

The thread pool executor has one rule that surprises most engineers: it grows past its core size only when the queue is full. Take core 2, maximum 4, and a queue of 2, and submit seven long tasks. Two threads start. The next two tasks queue. The queue is now full, so two more threads start, reaching the maximum. The seventh is rejected.

So the standard fixed thread pool, whose queue is unbounded, never grows and never rejects. After 100 thousand blocking submissions it had 4 threads and 99,996 queued tasks, each holding memory while its caller's latency grows. Build pools explicitly, with a bounded queue and a rejection policy, such as caller-runs, which makes the submitter run the task itself as backpressure. Size CPU-bound pools near the core count. Size I/O-bound ones at about cores times one plus wait over compute: 90 milliseconds waiting and 10 computing on 8 cores suggests about 80 threads. A separate pool per downstream dependency is the bulkhead pattern that Netflix's Hystrix popularised.

One hidden default: CompletableFuture without an executor runs on the shared common pool, sized for CPU work, so blocking I/O there starves every other user of it.

Virtual threads, final in JDK 21, unmount from their carrier thread when they block on I/O. 100 thousand tasks each sleeping 100 milliseconds finished in 832 milliseconds. 10 thousand of them on a 200-thread platform pool took about 5 seconds.

The caveat is pinning. On JDK 21, a virtual thread that blocks while holding a synchronized monitor cannot unmount. With 4 carriers, 64 virtual threads each sleeping 100 milliseconds inside synchronized ran 4 at a time and took about 1.6 seconds. With a reentrant lock instead: 101 milliseconds. JDK 24 removed pinning for synchronized. Never pool virtual threads, and bound downstream concurrency with a semaphore.

## Why this matters at Netflix

Netflix writes publicly about its runtime choices. In March 2024 its tech blog described switching its default from G1 to generational ZGC on JDK 21, because GC pauses were a significant source of tail latency, and showed timeout cancellations falling after the switch. At 2,000 requests a second, a 200 millisecond pause stalls about 400 requests on that instance alone.

In July 2024 it published a post-mortem in which services stopped serving traffic after enabling virtual threads. Virtual threads pinned in synchronized code, all waiting for one lock, occupied every carrier, so the thread signalled to take the lock next could never be mounted.

And deploys are warm-up events. A canary compared with a warm production fleet looks worse for reasons that have nothing to do with the code, which is why canary analysis compares it with a freshly started baseline.

## In the interview

A follow-up the lesson expects. When does a thread pool executor create threads beyond its core size?

[pause]

Only when the queue refuses the task. So with an unbounded queue, never, which is why a fixed pool queues forever. The wrong answer is "whenever all core threads are busy".

And: G1 or ZGC? ZGC when tail latency matters, since its pauses stayed around 10 microseconds against G1's milliseconds, at the cost of throughput and headroom, as the allocation stalls showed. G1 for general services with a pause goal. Parallel for batch throughput. Decide from GC logs and the live set. The wrong answer is "ZGC is strictly better now".

In a coding round, two Java traps: a comparator written as subtraction overflows near the integer maximum, so use Integer compare, and the integer maximum plus one wraps to a large negative number, so use long for sums and products.

## Recap

Five things to remember. A fresh JVM is up to 30 times slower until C2 compiles, and a new class can deoptimise hot code, so ramp traffic after deploys. The process is bigger than the heap, so keep the heap at 50 to 75 percent of the container limit. Pick a collector for a goal from GC logs and the live set, knowing G1's humongous objects and ZGC's allocation stalls. Volatile gives visibility, not atomicity, and correctness is stated in happens-before edges. And a pool grows past core only when its queue is full, while virtual threads pin inside synchronized on JDK 21.

At your desk: the warm-up table, the native memory breakdown, the class histogram, the collector comparison, the happens-before edges, the pool growth table, the idiom table, and the pool simulation exercise.
