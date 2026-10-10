---
lesson: atomics-and-lock-free
source: abb27547e5fe2dfc
fit: partial
desk:
  - "The MESI trace of two cores contending on one line, and the counter contention table"
  - "The capped-increment compare-and-swap loop in Go and Rust"
  - "The message-passing code, the x86 instruction listing, and the x86 versus ARM table"
  - "The store-buffer litmus test and the memory ordering table"
  - "The Treiber stack ABA trace, step by step"
  - "The hazard pointer and epoch steps, and the Michael-Scott enqueue"
  - "Exercises: replay compare-and-swap increments, and reproduce ABA on a Treiber stack"
---
## Introduction

Your metrics library protects a request counter with a mutex. On a 64-core box the profiler shows a big slice of CPU inside lock and unlock, so someone replaces the mutex with an atomic increment. The lock vanishes from the profile, and throughput improves by a disappointing 20 percent.

A second engineer, encouraged, writes a lock-free queue. It passes every test for a year, then starts corrupting memory about twice a month, shortly after the fleet moves to ARM instances.

Both engineers treated atomics as a faster mutex. They are something else: a lower-level contract whose cost is set by the cache-coherence protocol, and whose correctness is set by the memory model. Four ideas: why an atomic counter does not scale, what acquire and release actually promise, the ABA problem, and the honest answer to "should I write lock-free code?", which is usually no.

## What an atomic costs

A CPU offers a handful of atomic read-modify-write instructions: fetch-and-add, exchange, and compare-and-swap. They are indivisible across cores because of the cache-coherence protocol. Each cache line in each core's cache has a state, and to modify a line, a core must own it exclusively, which invalidates every other core's copy.

So picture two cores incrementing one counter. Core zero takes ownership of the line and adds. Core one wants to add, so the line travels to core one, and core zero's copy is invalidated. Core zero adds again, and the line travels back. Every contended atomic operation is one of those transfers. The lesson measured about 35 nanoseconds per one-way transfer, against under 4 nanoseconds for an uncontended increment on a line the core already owns.

Here is what that does. Each thread did 5 million increments. One shared counter with fetch-and-add: 271 million a second on one thread, 145 million on sixteen. Sixteen cores did less total work than one, because they spent their time passing one line around single file. The serialisation did not go away when the mutex did; it moved into the hardware. That is the first engineer's 20 percent.

The fix is per-thread counters, summed on read, which is what Java's long adder and the kernel's per-CPU counters do. But only if each counter sits on its own cache line. Packed eight bytes apart, sixteen threads managed 92 million a second, worse than the shared counter. Padded to 128 bytes, they managed 3.7 billion a second, 25 times the shared counter. That gap has a name, false sharing, and it comes back at the end.

## Compare-and-swap

Compare-and-swap takes an address, an expected value and a new value. If the address still holds the expected value, it writes the new one and reports success. Otherwise it changes nothing. With it you can build any atomic update to one word: read, compute, try to swap, and if someone changed the value in between, retry with the fresh value. An increment that refuses to go past a cap is the lesson's example; no single instruction does that.

The interleaving that silently lost updates in the races lesson now produces a failed swap and a retry. Nothing is lost, but the retries cost. At sixteen threads, each successful swap was preceded by about two failures, and the loop ran 8 times slower than fetch-and-add, because every failure bounced the line again. So: if a single instruction exists for your update, use it. Keep compare-and-swap loops for conditional updates and pointer swaps.

And Python exposes no user-level atomics at all. In Python, use a lock.

## Memory ordering

Atomicity says one operation is indivisible. It says nothing about the order in which other memory operations become visible to other threads. Compilers reorder independent loads and stores. CPUs execute out of order and park stores in a per-core store buffer before they reach the cache. On one thread you can never observe this. Across threads you can.

The canonical example is publishing data through a flag. A producer writes 42 into a data variable, then sets a ready flag to true. A consumer checks the flag, and if it is true, reads the data. Can the consumer see the flag set and the data still zero?

[pause]

With relaxed ordering, yes. Relaxed gives atomicity and nothing else. Make the flag's store a release, and the consumer's load of it an acquire, and you get a happens-before edge: everything the producer wrote before the release is visible to the consumer after the acquire that reads it. That pairing is exactly what a mutex does on unlock and lock, and what a channel does on send and receive, which is why code using locks and channels never has to think about it.

Now why the second engineer's queue survived a year on x86. On x86, a relaxed store and a release store compile to the same instruction. x86's model, called total store order, already gives every plain store release semantics and every plain load acquire semantics. So a missing release annotation produces identical code and cannot fail on x86 hardware. ARM is weakly ordered: release and acquire are different instructions there, and plain stores to different addresses may become visible in almost any order. The relaxed version is allowed to fail, and it does. Missing annotations that x86 never needed surface on Graviton, Ampere or Apple silicon.

But x86 is not immune. The store-buffer test: thread one sets x to one, then reads y. Thread two sets y to one, then reads x. Can both read zero? Intuition says no. On the lesson's machine, with plain stores, both read zero in 95 percent of 2 million runs: each store sat in its core's store buffer while the following load read the old value. With sequentially consistent stores, which drain the buffer, it was zero runs. That is why the classic textbook mutual-exclusion algorithms, Peterson's and Dekker's, are broken on modern hardware without fences.

The practical rule. Go's atomics and Java's volatile fields are sequentially consistent, so they choose for you. Rust and C plus plus make you pick: use sequentially consistent unless you can write down the happens-before argument for something weaker.

## Lock-free is a progress guarantee

"Lock-free" is not a speed claim. With a lock, a thread that is preempted, page-faulting or dead while holding it stops everyone waiting. Lock-free means some thread always completes in a finite number of steps: a failed swap means someone else's succeeded, though one unlucky thread can retry forever. Wait-free is stronger: every thread finishes in a bounded number of its own steps. Fetch-and-add on x86 is wait-free; a compare-and-swap loop is only lock-free. The value is that no thread can block others by being descheduled mid-operation, which matters in kernels, signal handlers and real-time audio.

## The ABA problem

The simplest lock-free structure is the Treiber stack: a linked list whose head is updated with compare-and-swap. To pop, read the head, read its next node, and swap the head from the old node to the next one.

Here is the smallest version of the bug, with two threads and a stack of A, then B, then C. Thread one starts a pop: it reads head A, and next B. Then it stalls. Meanwhile thread two pops A, pops B and frees it, then pushes A back. The head is A again, now pointing at C. Thread one wakes up and swaps the head from A to B. What happens?

[pause]

The swap succeeds, because the head is still A. But B was freed. The head now points at freed memory, and C is reachable only through it. The swap compared addresses, and the address matched although the structure had changed: the value went A, B, C, A, and compare-and-swap cannot tell. That is the ABA problem. Push B again and its next pointer can end up pointing at itself, and a traversal loops forever.

The fixes. A version tag next to the pointer, swapped together, so "A at version 3" never equals "A at version 5". Or never free or reuse a node another thread might still be looking at. Or a garbage collector, which is a large part of why lock-free structures are routine on the JVM and rare in hand-written C plus plus.

## Reclaiming memory safely

Without a garbage collector, the hard part of lock-free code is not the swap. It is knowing when a removed node may be freed. Two schemes dominate.

Hazard pointers: each thread publishes the pointers it is about to use in a few hazard slots, then re-reads to check the node was not removed in the meantime. A thread that removes a node puts it on a retired list, and when that list grows, it scans everyone's hazard slots and frees only the nodes nobody has published. Memory held by garbage is bounded, but every protected load pays a fence.

Epochs: there is a global epoch counter, and a thread pins itself to the current epoch before touching shared nodes. Garbage retired in one epoch is freed once the global epoch has moved on twice, because by then every thread that could have seen it has unpinned. Pinning is cheap, so epochs are faster. The cost: one thread stalled while pinned stops the epoch from advancing, and garbage piles up without bound. Linux's read-copy-update is the kernel's version of the same idea.

As for queues: a single-producer, single-consumer ring buffer needs no compare-and-swap at all, just a release store of the tail and an acquire load of it, the same message-passing pattern. Multi-producer, multi-consumer queues are much harder. Use a library. And Go's channels are not lock-free; they are a mutex-protected ring buffer, and that is fine.

## False sharing, and when to avoid all this

Coherence is tracked per cache line, usually 64 bytes, not per variable. So two threads writing different variables on one line fight as if they shared one. The trap is most common in code written to avoid contention: an array of per-thread counters, packed. Pad each slot to its own line; some libraries pad to 128 bytes, because some prefetchers fetch pairs of lines.

Now the honest answer. An uncontended mutex costs about the same as an atomic, because its fast path is one atomic instruction, so lock-free code buys nothing without contention. Under heavy contention, compare-and-swap loops can lose to a mutex, since every failure bounces the line while a mutex lets the winner run with the line in its cache. And lock-free code is extraordinarily hard to verify, because correctness depends on orderings your x86 test machines cannot exhibit.

Atomics are right for a short list of jobs: counters, flags and one-time publication, reference counts, ID generators, single-producer queues, and swapping a pointer to an immutable snapshot. For everything else, a mutex or a battle-tested library.

## In the interview

A follow-up the lesson expects. Why doesn't an atomic counter scale across cores?

[pause]

Each read-modify-write needs the line in exclusive state, so cores take turns owning it, and every handoff is a coherence transfer, about 35 nanoseconds here. Throughput falls as cores are added: 271 million a second on one thread, 145 million on sixteen. The fix is to shard and pad. The wrong answer is "atomics are slow instructions".

And: hazard pointers or epochs? Epochs for throughput, when every thread's pinned sections are short. Hazard pointers when memory must stay bounded even if a thread stalls, at the cost of a fence per protected load. "They are the same thing" is the wrong answer.

## Recap

Four things to remember. An atomic is cache-line ownership, so a contended one serialises in hardware; shard and pad instead. Release and acquire create a happens-before edge, and code that forgets them passes on x86 and fails on ARM. Compare-and-swap compares values, so a recycled address passes: that is ABA, fixed with version tags or safe reclamation through hazard pointers or epochs. And lock-free is a progress guarantee, not a speed claim; default to mutexes and libraries.

At your desk: the coherence trace and contention table, the compare-and-swap code, the ordering examples and litmus test, the Treiber stack trace, the reclamation and queue steps, and the two exercises.
