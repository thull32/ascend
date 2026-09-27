---
slug: atomics-and-lock-free
title: "Atomics, memory ordering and lock-free code"
description: What atomic instructions really do in the cache-coherence protocol, compare-and-swap loops, acquire/release ordering and why x86 hides bugs that ARM exposes, the ABA problem, false sharing, and when lock-free code is the wrong answer.
minutes: 35
difficulty: hard
tags: [concurrency, atomics, cas, memory-ordering, lock-free, aba, false-sharing, memory-model]
---
Your metrics library protects a request counter with a mutex. On a 64-core box the profiler shows a large slice of CPU inside lock and unlock, so someone replaces the mutex with an atomic increment. The lock vanishes from the profile, and throughput improves by a disappointing 20%. A second engineer, encouraged, writes a lock-free queue. It passes every test for a year, then starts corrupting memory about twice a month, shortly after the fleet moves to ARM instances.

Both engineers treated atomics as a faster mutex. They are something else: a lower-level contract whose *cost* is set by the cache-coherence protocol and whose *correctness* is set by the memory model. This lesson covers both, then the classic lock-free structures and their classic bug, and ends with the honest answer to "should I write lock-free code?", which is usually no.

## What the hardware actually gives you

A CPU offers a handful of **atomic read-modify-write** instructions: fetch-and-add (`lock xadd` on x86), exchange (`xchg`), and compare-and-swap (`lock cmpxchg`). ARMv8.0 builds the same operations from a load-linked/store-conditional pair (`ldxr`/`stxr`) that fails if another core touched the line in between; ARMv8.1 added single-instruction versions (`ldadd`, `cas`).

How can an instruction be indivisible across 64 cores? Through the cache-coherence protocol (MESI and its variants). To perform the operation, the core obtains the cache line holding the variable in **exclusive** state, which invalidates every other core's copy, and keeps it until the read-modify-write finishes. No other core can read or write that line in the middle.

That mechanism explains the disappointing 20%. An uncontended atomic on a line already in your cache costs a few nanoseconds. A contended one costs a **cache-line transfer** between cores, on the order of 50–100 ns and more across sockets. Sixty-four cores hammering one counter are not running in parallel; they are passing one cache line around single file. You removed the mutex's sleeping and waking, but not the serialisation, because the serialisation lives in the hardware.

The fix is the same as for a hot lock: stop sharing. Give each thread or core its own counter and sum them on read (Java's `LongAdder`, the Linux kernel's per-CPU counters). Reads get slower and slightly stale; writes scale linearly.

## Compare-and-swap and the retry loop

`compare_and_swap(addr, expected, new)` atomically checks whether `*addr == expected`; if so it writes `new` and reports success, otherwise it changes nothing and reports the value it found. With it you can build any atomic update to a single word: read the current value, compute the new one, and CAS. If another thread changed the value in between, the CAS fails and you retry with the fresh value.

Here is an increment that refuses to exceed a cap, which no single hardware instruction provides. In Go:

```go
func addCapped(counter *atomic.Int64, delta, limit int64) bool {
    for {
        cur := counter.Load()
        if cur+delta > limit {
            return false // would exceed the limit: give up without writing
        }
        if counter.CompareAndSwap(cur, cur+delta) {
            return true
        }
        // another goroutine changed counter since our Load: retry
    }
}
```

And in Rust, where `compare_exchange_weak` may fail spuriously on LL/SC hardware, which is harmless inside a loop:

```rust
use std::sync::atomic::{AtomicU64, Ordering::SeqCst};

fn add_capped(counter: &AtomicU64, delta: u64, limit: u64) -> bool {
    let mut cur = counter.load(SeqCst);
    loop {
        if cur + delta > limit {
            return false;
        }
        match counter.compare_exchange_weak(cur, cur + delta, SeqCst, SeqCst) {
            Ok(_) => return true,
            Err(actual) => cur = actual, // lost the race: retry with the winner's value
        }
    }
}
```

Python exposes no user-level atomic integer or CAS. The free-threaded build uses atomic instructions internally (for reference counts and the per-object locks on built-in containers), but that machinery is not a public API. In Python, use a `Lock`.

```viz
{"type": "concurrency", "algorithm": "cas-loop", "threads": 3,
 "title": "Three threads increment with compare-and-swap",
 "caption": "All three read the same value; one CAS succeeds and the others fail because the value changed. The losers reread and retry. No update is lost, but failed attempts are wasted work."}
```

Compare this with the lost update from [the races lesson](/learn/systems/concurrency/races-mutexes-and-invariants). The same interleaving that silently lost increments now produces a failed CAS and a retry. Correctness is restored without a lock; the price is wasted work under contention.

If the hardware has a single instruction for your update (add, or, and, exchange), use it instead of a CAS loop. `fetch_add` on x86 always succeeds in one instruction; a CAS loop under heavy contention can fail over and over. Reserve CAS loops for transformations with no instruction of their own: capped adds, other conditional updates, swapping a pointer to a new version of a structure.

## Memory ordering: the part that bites

Atomicity says one operation is indivisible. It says nothing about the order in which *other* memory operations become visible to other threads. Compilers reorder independent loads and stores to optimise, and CPUs execute out of order and park stores in a per-core **store buffer** before they reach the cache. On a single thread you can never observe this. Across threads you can.

The canonical example is publishing data through a flag:

```rust
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering::{Acquire, Relaxed, Release}};

static DATA: AtomicU32 = AtomicU32::new(0);
static READY: AtomicBool = AtomicBool::new(false);

fn producer() {
    DATA.store(42, Relaxed);
    READY.store(true, Release); // publishes every write that came before it
}

fn consumer() {
    if READY.load(Acquire) {     // pairs with the Release store above
        assert_eq!(DATA.load(Relaxed), 42); // guaranteed to hold
    }
}
```

The **release** store and the **acquire** load that reads its value create a *happens-before* edge: everything the producer wrote before the release is visible to the consumer after the acquire. Change both to `Relaxed` and the assertion can fail: the consumer may see `READY == true` and still read `DATA == 0`. This release/acquire pairing is exactly what a mutex does on unlock and lock, and what a channel does on send and receive, which is why code that uses locks and channels never has to think about it.

Whether the relaxed version *actually* fails depends on the hardware:

- **x86 (TSO, total store order)** allows only one reordering: a later load may complete before an earlier store to a different address, because the store is still in the store buffer. Every ordinary store behaves like a release and every ordinary load like an acquire. The relaxed flag example happens to work on x86, unless the compiler reorders it, which it is allowed to do.
- **ARM and POWER** are weakly ordered: loads and stores to different addresses can become visible in almost any order. The relaxed flag example fails in practice.

That is the second engineer's bug. Missing acquire/release annotations are invisible on x86 test machines and surface on Graviton, Ampere or Apple silicon.

x86 is not immune, though. The store-buffer litmus test:

```text
Initially x = 0, y = 0.
Thread 1:  x = 1;  r1 = y
Thread 2:  y = 1;  r2 = x
Can the outcome be r1 == 0 and r2 == 0?
```

Intuition says no: one of the stores happened first, so one thread must see a 1. On x86 the answer is yes. Each store sits in its own core's store buffer while the following load reads the old value from cache. Only a full fence (`mfence`, or any `lock`-prefixed instruction) or sequentially consistent atomics on all four accesses forbid it. This is why textbook mutual-exclusion algorithms such as Peterson's and Dekker's, which rely on exactly this pattern, are broken on modern hardware without fences.

The orderings, as defined by the C++11 model that C, C++ and Rust share:

| Ordering | Guarantees | Typical use |
|---|---|---|
| `Relaxed` | Atomicity only; no ordering with other memory | Statistics counters, ID generators |
| `Release` (store) / `Acquire` (load) | Writes before the release are visible after an acquire that reads it | Publishing data, flags, locks, SPSC queues |
| `AcqRel` | Both, on a read-modify-write | CAS in lock-free structures |
| `SeqCst` | Acquire/release plus one global order of all `SeqCst` operations | The safe default; needed for "store my flag, then check yours" patterns |

Other languages choose for you. Go's `sync/atomic` operations are sequentially consistent (the Go memory model states this explicitly since its 2022 revision). Java's `volatile` fields and `AtomicLong` get/set are too. Rust and C++ make you pick; use `SeqCst` unless you can write down the happens-before argument for something weaker, and weaken only when a profile says the fence matters.

## Lock-free, wait-free and what they promise

"Lock-free" is a **progress guarantee**, not a speed claim:

- **Blocking**: a thread that is preempted, page-faults or dies while holding a lock stops everyone waiting for it.
- **Lock-free**: some thread always completes its operation in a finite number of steps, whatever the others do. A failed CAS means *someone else's* CAS succeeded. An individual thread can still retry indefinitely.
- **Wait-free**: every thread completes in a bounded number of its own steps. `fetch_add` on x86 is wait-free; the CAS-loop counter is only lock-free.

The practical value is not throughput. It is that no thread can block others by being descheduled mid-operation. That matters in kernels, signal handlers, real-time audio callbacks and anywhere priority inversion is unacceptable.

## The Treiber stack and the ABA problem

The simplest lock-free structure is the Treiber stack: a singly linked list whose `head` pointer is updated with CAS.

```text
push(n):  loop { n.next = head;            if CAS(head, n.next, n) return }
pop():    loop { old = head; nxt = old.next; if CAS(head, old, nxt) return old }
```

It is short, it looks obviously correct, and it has a famous bug. Start with the stack A → B → C:

1. Thread 1 begins `pop`: reads `old = A`, `nxt = B`. It is preempted before its CAS.
2. Thread 2 pops A (head = B), pops B (head = C) and frees B. Then it pushes A back, reusing the node: head = A → C.
3. Thread 1 resumes: `CAS(head, A, B)` succeeds, because head is A again. Head now points at B, which has been freed, and C has fallen off the stack.

The CAS compared **addresses**, and the address matched even though the structure had changed underneath it. This is the **ABA problem**: the value went from A to B and back to A, and CAS cannot tell. The fixes:

- **Version tags.** Pack a counter next to the pointer and CAS both together, using a double-width CAS (`cmpxchg16b` on x86-64) or spare high bits of a 64-bit pointer. Every change bumps the counter, so "A at version 3" never equals "A at version 5".
- **Safe memory reclamation.** Never free or reuse a node while another thread might still dereference it. **Hazard pointers** make each thread publish the pointers it is about to use; **epoch-based reclamation** (Rust's `crossbeam-epoch`) frees garbage only after every thread has moved past the epoch in which it was retired; Linux's **RCU** waits for a grace period.
- **A garbage collector.** With a tracing GC and a fresh node per push, A cannot be reused while thread 1 still holds a reference to it, so the classic ABA disappears. This is a large part of why lock-free structures are routine on the JVM (`ConcurrentLinkedQueue` is the Michael–Scott lock-free queue) and rare in hand-written C++.

In languages without a GC, memory reclamation, not the CAS logic, is the hard part of lock-free programming.

## Lock-free queues in practice

- **Single-producer, single-consumer (SPSC) ring buffers** need no CAS at all. Each index has one writer, so plain release stores and acquire loads suffice. They are the workhorse of audio pipelines, network card rings and inter-thread logging; the [ring buffers lesson](/learn/advanced-data-structures/log-structured-and-disk-structures/merkle-trees-and-ring-buffers) builds one.
- **Multi-producer, multi-consumer (MPMC)** queues are much harder. The Michael–Scott queue (1996) uses CAS on both head and tail plus "helping", where a thread that notices a lagging tail pointer advances it for its owner. Use a library: crossbeam's `ArrayQueue` and `SegQueue`, Java's `ConcurrentLinkedQueue`. Note that Go channels are not lock-free; they are a mutex-protected ring buffer with wait queues, and that is fine.

## False sharing

Coherence is tracked per cache line (64 bytes on most x86 and ARM servers), not per variable. Two threads writing two *different* variables that happen to share a line fight over that line exactly as if they shared a variable.

```viz
{"type": "concurrency", "algorithm": "false-sharing",
 "title": "Two independent counters, one cache line",
 "caption": "Core 0 writes a and core 1 writes b. They never touch each other's data, but each write invalidates the other core's copy of the shared line. Padding each counter onto its own line removes the traffic."}
```

The trap is most common in exactly the code you wrote to avoid contention: an array of per-thread counters, `counts[thread_id] += 1`, where eight 8-byte counters share one line. Pad each to its own line: `#[repr(align(64))]` or crossbeam's `CachePadded` in Rust (which pads to 128 bytes on x86-64 and aarch64, because Intel's prefetcher fetches lines in adjacent pairs and some ARM cores use 128-byte lines), a `_ [56]byte` field after an `int64` in Go, `@Contended` in Java. On Linux, `perf c2c` finds the contended lines. The broader memory-layout story is in [CPU caches and memory layout](/learn/systems/performance-engineering/cpu-caches-and-memory-layout).

## When to avoid lock-free code

Be honest about the trade:

- **An uncontended mutex costs about the same as an atomic**, because its fast path *is* one atomic instruction. Lock-free code buys nothing without contention.
- **Under heavy contention, CAS loops can lose to a mutex.** Every failed CAS bounces the cache line again. A mutex puts losers to sleep and lets the winner run at full speed with the line in its cache.
- **It is extraordinarily hard to verify.** Correctness depends on orderings your x86 test machines cannot exhibit. Rust's `loom` explores interleavings and weak-memory outcomes exhaustively for small tests; Java has `jcstress`; ThreadSanitizer catches some misuse. Without a verification plan you are relying on luck.

Atomics are the right tool for a short list of jobs: counters and gauges (`Relaxed`), flags and one-time publication (release/acquire), reference counts (Rust's `Arc` increments with `Relaxed` and decrements with `Release` plus an acquire fence before dropping), ID generators, SPSC queues, and swapping a pointer to an immutable snapshot (RCU, `arc-swap`). For everything else, use a mutex or a battle-tested library. A hand-written MPMC lock-free queue in a design review is a red flag unless it comes with a proof and a model checker.

## Exercise: replay a CAS counter

This mirrors the lost-update exercise from the races lesson, with each increment implemented as a compare-and-swap loop instead of load-add-store.

```exercise
id: cas-counter-replay
title: Replay compare-and-swap increments
prompt: |
  Threads increment a shared counter (starting at 0) using a CAS loop.
  Thread `i` must complete `increments[i]` increments. Each attempt is two
  steps:

  1. **read**: remember the current counter value as `expected`
  2. **cas**: if the counter still equals `expected`, set it to
     `expected + 1` (the increment is complete); otherwise the CAS fails,
     a failure is counted, and the thread's next step is a fresh **read**
     for the same increment

  `schedule` is a list of thread indices; each entry executes the next step of
  that thread. Entries naming a finished thread are ignored. When the schedule
  runs out, run each unfinished thread to completion alone, in index order.

  Return `[final_counter, failed_cas_count]`.
languages: [python, javascript]
entry: cas_counter
starter:
  python: |
    def cas_counter(increments, schedule):
        counter = 0
        failures = 0
        # per thread: next step ('read' or 'cas'), expected value, completed increments
        return [counter, failures]
  javascript: |
    function cas_counter(increments, schedule) {
      let counter = 0;
      let failures = 0;
      // per thread: next step ('read' or 'cas'), expected value, completed increments
      return [counter, failures];
    }
tests:
  - args: [[1, 1], [0, 1, 0, 1]]
    expected: [2, 1]
    label: both read 0; the second CAS fails and retries
  - args: [[1, 1], [0, 0, 1, 1]]
    expected: [2, 0]
    label: no overlap, no failures
  - args: [[2, 2], []]
    expected: [4, 0]
    label: empty schedule
  - args: [[1, 1, 1], [0, 1, 2, 0, 1, 2]]
    expected: [3, 2]
  - args: [[2, 1], [0, 1, 1, 0, 0, 0]]
    expected: [3, 1]
    hidden: true
  - args: [[1, 3], [0, 1, 1, 0, 1, 1, 0, 1, 1, 0]]
    expected: [4, 2]
    hidden: true
    label: one thread keeps losing (lock-free, not wait-free)
hints:
  - "Keep per-thread state: which step is next, the expected value from the last read, and how many increments are done."
  - "A failed CAS does not complete an increment; it only increments the failure count and sends the thread back to read."
  - "Notice that the final counter always equals the total number of increments, whatever the schedule. Only the failure count changes."
```

## Senior signals

- You explain an atomic in terms of cache-line ownership, and you know a contended atomic still serialises; your fix for a hot counter is sharding, not a different instruction.
- You use `fetch_add` when an instruction exists and a CAS loop only for transformations that need one.
- You can explain release/acquire as a happens-before edge, give the flag-publication example, and say why it works on x86 and fails on ARM.
- You know the store-buffer litmus test and why Peterson's algorithm needs fences.
- You can walk through ABA on a Treiber stack and name version tags, hazard pointers and epoch-based reclamation as fixes.
- You default to mutexes and libraries, and you ask "how was this verified?" of any hand-written lock-free structure.

## Check yourself

```quiz
- q: >-
    A request counter is changed from a mutex to an atomic fetch_add. On 64 cores throughput improves only slightly. What is the most likely reason?
  options: ["fetch_add is implemented with a hidden mutex", "Every increment still needs exclusive ownership of the same cache line, so increments are serialised by cache-line transfers", "The atomic uses SeqCst ordering, which disables the cache", "The compiler turns fetch_add into a CAS loop"]
  answer: 1
  explanation: >-
    Atomic RMW works by holding the line exclusively, so 64 cores take turns with one line; each handoff costs tens to hundreds of nanoseconds. Per-core or per-thread counters summed on read remove the sharing. fetch_add is a single instruction, not a mutex or a loop.
- q: >-
    A producer writes DATA = 42 then stores READY = true, both with Relaxed ordering. A consumer loads READY with Relaxed and, if true, reads DATA. What can the consumer see?
  options: ["Always 42", "42 or 0, on weakly ordered hardware such as ARM or under compiler reordering", "42 or a torn value", "It deadlocks"]
  answer: 1
  explanation: >-
    Relaxed provides atomicity but no ordering between the two variables, so READY can become visible before DATA. A Release store paired with an Acquire load creates the happens-before edge that guarantees 42. It often works on x86 by accident, which is how the bug survives testing.
- q: >-
    Thread 1 runs `x = 1; r1 = y`. Thread 2 runs `y = 1; r2 = x`. Both variables start at 0 and use plain stores and loads on x86. Is r1 == 0 and r2 == 0 possible?
  options: ["No, x86 is sequentially consistent", "Yes: each store can wait in its core's store buffer while the following load reads the old value", "Only if the threads run on the same core", "Only with a compiler bug"]
  answer: 1
  explanation: >-
    x86's total store order still lets a later load pass an earlier store to a different address. Both loads can read 0. A full fence or SeqCst on all four operations forbids it. This is why Dekker's and Peterson's algorithms need fences on real hardware.
- q: >-
    In a Treiber stack, thread 1 reads head = A and next = B, then stalls. Meanwhile A and B are popped, B is freed, and A is pushed back. Thread 1's CAS(head, A, B) succeeds. What went wrong, and what fixes it?
  options: ["A data race; add a mutex around the CAS", "ABA: CAS compared only the address, which matched despite the change; fix with a version tag or safe reclamation such as hazard pointers or epochs", "Starvation; use a fair lock", "False sharing; pad the head pointer"]
  answer: 1
  explanation: >-
    CAS proves the value is equal, not that nothing happened. A version counter changes on every update so a recycled address no longer matches, and deferred reclamation prevents A from being reused while thread 1 holds it. A mutex would also work, but then the structure is no longer lock-free.
- q: >-
    Which statement about a lock-free CAS-loop counter is true?
  options: ["Every thread finishes each increment within a bounded number of steps", "Some thread always makes progress, but a particular thread can keep failing and retrying", "It is always faster than a mutex", "It is correct on x86 but can lose updates on ARM"]
  answer: 1
  explanation: >-
    A failed CAS means another thread's CAS succeeded, so the system progresses (lock-free), but an unlucky thread can lose repeatedly (not wait-free). Speed depends on contention: a mutex can win when many threads fight over one line. Correctness does not depend on the architecture.
```
