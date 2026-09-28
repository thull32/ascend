---
slug: atomics-and-lock-free
title: "Atomics, memory ordering and lock-free code"
description: What atomic instructions do in the cache-coherence protocol (MESI traced, contention measured), compare-and-swap loops, acquire/release ordering and why x86 hides bugs that ARM exposes (with a litmus test run on real hardware), the ABA problem traced, why hazard pointers and epochs exist, lock-free queues, false sharing, and when lock-free code is the wrong answer.
minutes: 35
difficulty: hard
tags: [concurrency, atomics, cas, memory-ordering, lock-free, aba, false-sharing, memory-model]
---
Your metrics library protects a request counter with a mutex. On a 64-core box the profiler shows a large slice of CPU inside lock and unlock, so someone replaces the mutex with an atomic increment. The lock vanishes from the profile, and throughput improves by a disappointing 20%. A second engineer, encouraged, writes a lock-free queue. It passes every test for a year, then starts corrupting memory about twice a month, shortly after the fleet moves to ARM instances.

Both engineers treated atomics as a faster mutex. They are something else: a lower-level contract whose *cost* is set by the cache-coherence protocol and whose *correctness* is set by the memory model. This lesson covers both, then the classic lock-free structures and their classic bug, and ends with the honest answer to "should I write lock-free code?", which is usually no. Measurements were taken with C on a 16-core Ryzen 9 9950X3D (x86-64) under WSL2; ARM behaviour is described from the architecture, since no ARM machine was available.

## What the hardware gives you

A CPU offers a handful of **atomic read-modify-write** instructions: fetch-and-add (`lock xadd` on x86), exchange (`xchg`) and compare-and-swap (`lock cmpxchg`). ARMv8.0 builds them from a load-exclusive/store-exclusive pair (`ldxr`/`stxr`) that fails if another core touched the line in between; ARMv8.1 added single instructions (`ldadd`, `cas`).

An instruction is indivisible across cores through the cache-coherence protocol. Each cache line in each core's cache is in one of the MESI states: **M**odified (only copy, dirty), **E**xclusive (only copy, clean), **S**hared (read-only copy, others may have it), **I**nvalid. Trace two cores each executing `lock xadd` on a counter in the same line:

| Step | Event | Core 0's line | Core 1's line |
|---|---|---|---|
| 1 | Core 0 reads the counter (miss; nobody else has it) | E | I |
| 2 | Core 1 reads the counter (miss; core 0 supplies it) | S | S |
| 3 | Core 0 `lock xadd`: requests ownership, core 1's copy is invalidated | M | I |
| 4 | Core 0's add completes while it holds the line; nobody can observe a half-done update | M | I |
| 5 | Core 1 `lock xadd`: requests ownership; core 0 sends the dirty line and invalidates | I | M |
| 6 | Core 0 increments again: the line must travel back | M | I |

Every contended atomic operation is a step-5 transfer. Measured with two threads bouncing a flag through one line, a one-way transfer took about 35 ns between any two vCPUs tested; an uncontended `fetch_add` on a line already in M state took 3.7 ns.

### Measured: what contention does

Each thread did 5 million relaxed increments:

| Design | 1 thread | 4 threads | 16 threads (aggregate) |
|---|---|---|---|
| One shared counter, `fetch_add` | 271 M/s | 182 M/s | 145 M/s |
| One shared counter, CAS loop | 271 M/s | 36 M/s, 0.91 failed CAS per op | 17 M/s, 2.21 failed CAS per op |
| Per-thread counters packed 8 bytes apart | 277 M/s | 112 M/s | 92 M/s |
| Per-thread counters padded to 128 bytes | 274 M/s | 1,063 M/s | 3,681 M/s |

That table is the first engineer's 20%. Sixteen cores on one atomic counter did *less* total work than one core, because they spent their time passing one line around single file; the serialisation lives in the hardware, not the mutex. Per-thread counters fix it only when they are on separate lines: packed eight to a line, they are worse than the shared counter (**false sharing**, below). Padded, they scale linearly, 25 times the shared counter at 16 threads. Java's `LongAdder` and the Linux kernel's per-CPU counters are this design; reads sum the shards and are slightly stale.

## Compare-and-swap and the retry loop

`compare_and_swap(addr, expected, new)` atomically checks whether `*addr == expected`; if so it writes `new` and reports success, otherwise it changes nothing and reports the value it found. With it you can build any atomic update to one word: read, compute, CAS, and retry with the fresh value if someone changed it. Here is an increment that refuses to exceed a cap, which no single instruction provides:

```go
package limits

import "sync/atomic"

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

In Rust `compare_exchange_weak` may fail spuriously on load-exclusive/store-exclusive hardware, which is harmless inside a loop:

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

Python exposes no user-level atomic integer or CAS; the free-threaded build uses atomics internally for reference counts and per-object locks, not as a public API. In Python, use a `Lock`.

```viz
{"type": "concurrency", "algorithm": "cas-loop", "threads": 3,
 "title": "Three threads increment with compare-and-swap",
 "caption": "All three read the same value; one CAS succeeds and the others fail because the value changed. The losers reread and retry. No update is lost, but failed attempts are wasted work."}
```

The interleaving that silently lost increments in [the races lesson](/learn/systems/concurrency/races-mutexes-and-invariants) now produces a failed CAS and a retry. The table above prices it: at 16 threads each successful CAS was preceded by 2.21 failures, and the loop ran 8 times slower than `fetch_add`, because every failure bounced the line again. If a single instruction exists for your update (add, and, or, exchange), use it; reserve CAS loops for conditional updates and pointer swaps.

## Memory ordering: the part that bites

Atomicity says one operation is indivisible. It says nothing about the order in which *other* memory operations become visible to other threads. Compilers reorder independent loads and stores, and CPUs execute out of order and park stores in a per-core **store buffer** before they reach the cache. On one thread you can never observe this. Across threads you can.

The canonical example is publishing data through a flag (message passing):

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

The **release** store and the **acquire** load that reads its value create a *happens-before* edge: everything the producer wrote before the release is visible to the consumer after the acquire. Change both to `Relaxed` and the assertion may fail: the consumer can see `READY == true` and still read `DATA == 0`. This pairing is exactly what a mutex does on unlock and lock and what a channel does on send and receive, which is why code using locks and channels never thinks about it.

### x86 versus ARM, instruction by instruction

What GCC 13 emitted at `-O2` on this machine for C11 atomics:

```text
store relaxed  ->  movl   $1, ready(%rip)
store release  ->  movl   $1, ready(%rip)
store seq_cst  ->  xchgl  ready(%rip), %eax
load acquire   ->  movl   ready(%rip), %eax
fetch_add      ->  lock xaddq %rax, ctr(%rip)
CAS            ->  lock cmpxchgl %edx, data(%rip)
```

On x86 a relaxed store and a release store are the *same instruction*. x86's model, **total store order**, already gives every plain store release semantics and every plain load acquire semantics; the only reordering it allows is a later load completing before an earlier store to a different address, because that store is still in the store buffer. So a missing `Release`/`Acquire` compiles to identical x86 code and cannot fail on x86 hardware (only the compiler could reorder it). On **ARMv8**, which is weakly ordered, the same source compiles differently: relaxed is a plain `str`/`ldr`, release is `stlr`, acquire is `ldar` (or `ldapr`), and plain loads and stores to different addresses may become visible in almost any order. The relaxed message-passing code is then allowed to fail: the architecture permits the consumer to observe `READY` before `DATA`, and ARM cores do make independent stores visible out of order.

| Pattern | x86 (TSO) | ARMv8 (weak) |
|---|---|---|
| Relaxed flag publication (message passing) | Works by accident; only compiler reordering can break it | Fails: `DATA` may be seen after `READY` |
| Release store / acquire load | Plain `mov`s; free | `stlr` / `ldar`; cheap barriers |
| Store then load of a different location (store buffering) | Can reorder | Can reorder |
| Sequentially consistent store | `xchg` (or `mov` + `mfence`), tens of cycles | `stlr` paired with `ldar` |

That is the second engineer's bug: annotations missing where x86 did not need them, surfacing on Graviton, Ampere or Apple silicon.

### x86 is not immune: the store-buffer litmus test

```text
Initially x = 0, y = 0.
Thread 1:  x = 1;  r1 = y
Thread 2:  y = 1;  r2 = x
Can the outcome be r1 == 0 and r2 == 0?
```

Intuition says no: one store happened first, so one thread must see a 1. Run on this machine with the two threads released together 2 million times, plain stores and loads gave `r1 == 0 && r2 == 0` in 1,900,497 runs, 95% of them: each store sat in its core's store buffer while the following load read the old value from cache. With sequentially consistent stores (the `xchg` above, a locked instruction that drains the store buffer) the count was 0 of 2 million. This is why Peterson's and Dekker's mutual-exclusion algorithms, which rely on exactly this pattern, are broken on modern hardware without fences.

| Ordering | Guarantees | Typical use |
|---|---|---|
| `Relaxed` | Atomicity only | Statistics counters, ID generators |
| `Release` (store) / `Acquire` (load) | Writes before the release are visible after an acquire that reads it | Publishing data, locks, SPSC queues |
| `AcqRel` | Both, on a read-modify-write | CAS in lock-free structures |
| `SeqCst` | Acquire/release plus one global order of all `SeqCst` operations | The safe default; "store my flag, then check yours" patterns |

Other languages choose for you. Go's `sync/atomic` operations are sequentially consistent (stated in the Go memory model since its 2022 revision); Java's `volatile` fields and `AtomicLong` get/set are too. Rust and C++ make you pick: use `SeqCst` unless you can write down the happens-before argument for something weaker.

## Lock-free, wait-free and what they promise

"Lock-free" is a **progress guarantee**, not a speed claim. **Blocking**: a thread preempted, page-faulting or dead while holding a lock stops everyone waiting for it. **Lock-free**: some thread always completes in a finite number of steps; a failed CAS means *someone else's* succeeded, though one thread can retry indefinitely. **Wait-free**: every thread completes in a bounded number of its own steps; `fetch_add` on x86 is wait-free, the CAS loop only lock-free. The practical value is that no thread can block others by being descheduled mid-operation, which matters in kernels, signal handlers, real-time audio callbacks and wherever priority inversion is unacceptable.

## The Treiber stack and the ABA problem

The simplest lock-free structure is the Treiber stack, a linked list whose `head` is updated with CAS:

```text
push(n):  loop { n.next = head;            if CAS(head, n.next, n) return }
pop():    loop { old = head; nxt = old.next; if CAS(head, old, nxt) return old }
```

Start with A → B → C and trace thread 1's pop against thread 2's activity:

| Step | Thread 1 | Thread 2 | `head` | Links in memory |
|---|---|---|---|---|
| 1 | reads `old = A`, `nxt = B`; stalls | | A | A→B, B→C |
| 2 | | pops A | B | A→B, B→C |
| 3 | | pops B, frees it | C | B→C (stale) |
| 4 | | pushes A again (node reused) | A | A→C |
| 5 | `CAS(head, A, B)` **succeeds** | | B | B→C |

Head now points at B, which thread 2 freed (or still owns), and C is reachable only through freed memory. The CAS compared **addresses**, and the address matched although the structure had changed: the value went A, B, C, A, and CAS cannot tell. That is the **ABA problem**. If thread 2 then pushes B again, B's `next` becomes B itself, and a traversal loops forever; the second exercise reproduces it.

The fixes: **version tags** (pack a counter next to the pointer and CAS both with a double-width `cmpxchg16b`, or use spare high pointer bits; "A at version 3" never equals "A at version 5"), **safe memory reclamation** (never free or reuse a node another thread might still dereference), or **a garbage collector** (with a fresh node per push, A cannot be reused while thread 1 holds a reference, which is a large part of why lock-free structures are routine on the JVM and rare in hand-written C++).

## Why hazard pointers and epochs exist

Without a garbage collector, the hard part of lock-free programming is not the CAS; it is knowing when a removed node may be freed. Two schemes dominate.

**Hazard pointers** (Maged Michael, 2004). Each thread owns a few published "hazard" slots.

1. A reader loads `p = head`.
2. It stores `p` into its hazard slot (with a full fence, so the store is visible before it proceeds).
3. It re-reads `head`. If `head != p`, `p` may have been removed before the hazard became visible: retry.
4. It uses `*p` safely, then clears the slot.
5. A thread that removes a node puts it on a private *retired* list. When the list grows past a threshold (a small multiple of the number of hazard slots), it scans every thread's slots and frees the retired nodes nobody has published.

Memory held by garbage is bounded, but every protected load pays a fence, and each reader must re-validate.

**Epoch-based reclamation** (used by Rust's `crossbeam-epoch`). A global epoch counter E and a per-thread "pinned at epoch e" slot.

1. Before touching shared nodes, a thread *pins*: records the current global epoch in its slot.
2. A removed node goes into the garbage bag for the current epoch.
3. The global epoch may advance from E to E+1 only when every pinned thread is pinned at E.
4. Garbage retired in epoch E is freed once the global epoch reaches E+2: every thread that could have seen it has since unpinned.

Pinning is cheap (no per-load fence), which is why epochs are faster than hazard pointers. The cost is that one thread stalled while pinned stops the epoch from advancing, and garbage accumulates without bound. Linux's **RCU** is the kernel's version of the same idea: a writer waits for a *grace period* in which every CPU has passed a quiescent state (a context switch) before freeing.

## Lock-free queues you will meet

**Single-producer, single-consumer (SPSC) ring buffers** need no CAS: each index has one writer, so the producer publishes an item with a release store of `tail` and the consumer observes it with an acquire load, the message-passing pattern above. They are the workhorse of audio pipelines, network card rings and `io_uring`; the [ring buffers lesson](/learn/advanced-data-structures/log-structured-and-disk-structures/merkle-trees-and-ring-buffers) builds one.

**Multi-producer, multi-consumer (MPMC)** queues are much harder. The Michael–Scott queue (1996) keeps a dummy node, a `head` and a `tail`. Enqueue:

1. Allocate node `n` with `next = null`.
2. Read `t = tail` and `nx = t.next`.
3. If `nx` is null, `CAS(t.next, null, n)`. On success, try `CAS(tail, t, n)`; if that fails, another thread already advanced it. Done.
4. If `nx` is not null, the tail is lagging: *help* by `CAS(tail, t, nx)`, then retry from step 2.

Dequeue reads `head` (the dummy) and `head.next` (the first real item), takes the item's value and CASes `head` forward; the old dummy is retired, which is where hazard pointers or epochs come in. The helping in step 4 is what makes it lock-free: a thread stalled between its two CASes cannot block others. Use a library: crossbeam's `ArrayQueue` and `SegQueue`, Java's `ConcurrentLinkedQueue` (which is Michael–Scott). Go channels are not lock-free; they are a mutex-protected ring buffer with wait queues, and that is fine.

## False sharing

Coherence is tracked per cache line (64 bytes on x86 and most ARM servers), not per variable, so two threads writing *different* variables on one line fight as if they shared one. The measured row above is the proof: per-thread counters packed 8 bytes apart ran at 92 M/s on 16 threads against 3,681 M/s padded.

```viz
{"type": "concurrency", "algorithm": "false-sharing",
 "title": "Two independent counters, one cache line",
 "caption": "Core 0 writes a and core 1 writes b. They never touch each other's data, but each write invalidates the other core's copy of the shared line. Padding each counter onto its own line removes the traffic."}
```

The trap is most common in code written to *avoid* contention: `counts[thread_id] += 1`. Pad each slot: `#[repr(align(64))]` or crossbeam's `CachePadded` in Rust (128 bytes on x86-64 and aarch64, because Intel's prefetcher fetches adjacent line pairs and some ARM cores use 128-byte lines), a `_ [56]byte` field in Go, `@Contended` in Java. `perf c2c` finds contended lines on bare-metal Linux. The broader layout story is in [CPU caches and memory layout](/learn/systems/performance-engineering/cpu-caches-and-memory-layout).

## Choosing a synchronisation mechanism

| Mechanism | Uncontended cost (measured) | Under heavy contention | Progress | Verification burden |
|---|---|---|---|---|
| Mutex | 8.4 ns lock + unlock | Losers sleep; convoy risk | Blocking | Low |
| Atomic RMW (`fetch_add`) | 3.7 ns | Serialises on one line (145 M/s at 16 threads) | Wait-free on x86 | Low |
| CAS loop | 3.7 ns | Retries bounce the line (17 M/s at 16 threads) | Lock-free | Moderate |
| Sharded, padded counters | 3.6 ns | Scales linearly (3,681 M/s) | Wait-free | Low; reads are stale sums |
| Lock-free structure (Treiber, Michael–Scott) | A few atomics per op | Better than a lock only in narrow cases | Lock-free | High: ABA, reclamation, ordering |
| RCU / snapshot swap | Readers: one acquire load | Readers never block; writers copy | Readers wait-free | Moderate |

## When to avoid lock-free code

An uncontended mutex costs about the same as an atomic, because its fast path *is* one atomic instruction; lock-free code buys nothing without contention. Under heavy contention CAS loops can lose to a mutex, since every failure bounces the line while a mutex lets the winner run with the line in its cache. And it is extraordinarily hard to verify: correctness depends on orderings your x86 test machines cannot exhibit. Rust's `loom` explores interleavings and weak-memory outcomes exhaustively for small tests; Java has `jcstress`; ThreadSanitizer catches some misuse.

Atomics are right for a short list of jobs: counters and gauges (`Relaxed`), flags and one-time publication (release/acquire), reference counts (Rust's `Arc` increments with `Relaxed` and decrements with `Release` plus an `Acquire` fence before dropping), ID generators, SPSC queues, and swapping a pointer to an immutable snapshot. For everything else use a mutex or a battle-tested library.

## Failure modes in production

**Symptom: a service that was fine on x86 corrupts data or reads stale flags after moving to ARM instances.** Diagnosis: `Relaxed` (or plain, non-atomic) accesses used to publish data; the code relied on x86's TSO. Fix: release stores and acquire loads (or `SeqCst`), then test with `loom` or a model checker; run CI on ARM.

**Symptom: CPU climbs and throughput falls as cores are added, with no lock in the profile.** Diagnosis: a hot atomic counter or reference count shared by every thread; on bare metal `perf c2c` shows the line with high HITM counts. Fix: shard per thread or per core with padding; avoid cloning an `Arc` or `shared_ptr` per request.

**Symptom: per-thread statistics scale worse than one global counter.** Diagnosis: false sharing of a packed array of slots. Fix: pad each slot to 64 or 128 bytes.

**Symptom: rare crashes, use-after-free or an infinite loop inside a hand-written lock-free list.** Diagnosis: ABA or premature reclamation, usually under a node pool or allocator that reuses addresses quickly. Fix: version-tagged pointers or hazard pointers/epochs; better, replace it with a library structure.

**Symptom: memory grows steadily in a service using epoch-based reclamation.** Diagnosis: one thread stays pinned (a long operation inside a pinned section, or a thread blocked while pinned), so the epoch cannot advance. Fix: keep pinned sections short and never block while pinned.

## Interviewer follow-ups

**"Why doesn't an atomic counter scale across cores?"** Model answer: each RMW needs the line in exclusive state, so cores take turns owning it and every handoff is a coherence transfer (about 35 ns here); throughput falls as cores are added (271 M/s on one thread, 145 M/s on 16 measured); shard and pad. Common wrong answer: "atomics are slow instructions".

**"Explain acquire/release with an example, and say why a bug might only show on ARM."** Model answer: message passing; release on the flag store and acquire on the flag load create happens-before, so data written before the release is visible after the acquire; on x86 plain stores and loads already behave this way, so the relaxed version compiles to the same `mov`s and passes, while ARM reorders. Common wrong answer: "acquire and release are about locking".

**"What is the ABA problem and how do you fix it?"** Model answer: a CAS compares values, so an address that was removed and reused looks unchanged; fix with a version tag in a double-width CAS or by preventing reuse while referenced (hazard pointers, epochs, RCU, a GC). Common wrong answer: "use a stronger memory ordering".

**"Hazard pointers or epochs: which would you choose?"** Model answer: epochs for throughput when every thread's pinned sections are short; hazard pointers when memory must stay bounded even if a thread stalls, at the cost of a fence per protected load. Common wrong answer: "they are the same thing".

## What mid-level engineers get wrong

- **Replacing a hot mutex with an atomic and expecting scaling.** Consequence: the same serialisation, now in hardware.
- **Using `Relaxed` to publish data.** Consequence: correct on x86 test machines, broken on ARM.
- **Writing a CAS loop where `fetch_add` exists.** Consequence: 8 times slower under contention in the measurement above.
- **Packing per-thread counters into one array.** Consequence: false sharing worse than a single shared counter.
- **Freeing a node the moment it is unlinked.** Consequence: ABA and use-after-free under load.
- **Shipping a hand-written MPMC queue without a model checker.** Consequence: corruption twice a month that no test reproduces.

## Exercises

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

```exercise
id: treiber-aba
title: Reproduce ABA on a Treiber stack
prompt: |
  Simulate a Treiber stack whose nodes are named by strings. `initial` lists
  the stack from the top (`["A", "B", "C"]` means head A, A.next B, B.next C).
  Each node has one `next` field that persists in memory even after the node
  is popped.

  `ops` are applied in order:
  - `[t, "pop"]`: an atomic, uninterrupted pop (head = head.next).
  - `[t, "push", n]`: an atomic push of node `n` (possibly one popped
    earlier): n.next = head, head = n.
  - `[t, "read"]`: thread t starts a pop and records head, head.next and the
    stack's version.
  - `[t, "cas"]`: thread t finishes that pop: if head still equals the
    recorded head (and, when `tagged` is true, the version is also
    unchanged), set head to the recorded next. Record whether it succeeded.

  Every successful pop, push or cas increments the version. Tests never
  `read` an empty stack. Return `{"stack": [...], "cas": [...]}`: the nodes
  reached by following next pointers from head (stop after 10 nodes, since a
  corrupted stack can contain a cycle) and the result of each cas in order.
languages: [python, javascript]
entry: treiber
starter:
  python: |
    def treiber(initial, ops, tagged):
        nxt = {}
        # build the links, then replay ops
        return {"stack": [], "cas": []}
  javascript: |
    function treiber(initial, ops, tagged) {
      const nxt = new Map();
      // build the links, then replay ops
      return { stack: [], cas: [] };
    }
tests:
  - args: [["A", "B", "C"], [["T1", "read"], ["T2", "pop"], ["T2", "pop"], ["T2", "push", "A"], ["T1", "cas"]], false]
    expected: {"stack": ["B", "C"], "cas": [true]}
    label: ABA, the CAS wrongly succeeds and a popped node returns
  - args: [["A", "B", "C"], [["T1", "read"], ["T2", "pop"], ["T2", "pop"], ["T2", "push", "A"], ["T1", "cas"]], true]
    expected: {"stack": ["A", "C"], "cas": [false]}
    label: a version tag makes the stale CAS fail
  - args: [["A", "B", "C"], [["T1", "read"], ["T1", "cas"]], false]
    expected: {"stack": ["B", "C"], "cas": [true]}
    label: no interference
  - args: [["A", "B"], [["T1", "read"], ["T2", "push", "X"], ["T1", "cas"]], false]
    expected: {"stack": ["X", "A", "B"], "cas": [false]}
    label: a changed head makes the CAS fail
  - args: [["A", "B", "C", "D"], [["T1", "read"], ["T2", "pop"], ["T2", "pop"], ["T2", "pop"], ["T2", "push", "A"], ["T1", "cas"], ["T2", "push", "B"]], false]
    expected: {"stack": ["B", "B", "B", "B", "B", "B", "B", "B", "B", "B"], "cas": [true]}
    hidden: true
    label: reusing the resurrected node creates a cycle
  - args: [["A", "B", "C", "D"], [["T1", "read"], ["T2", "pop"], ["T2", "pop"], ["T2", "pop"], ["T2", "push", "A"], ["T1", "cas"], ["T1", "read"], ["T1", "cas"]], true]
    expected: {"stack": ["D"], "cas": [false, true]}
    hidden: true
    label: the tagged retry pops correctly
hints:
  - "Keep a dictionary from node to next, a head and a version counter; a pop does not erase the popped node's next field."
  - "On read, save (head, next of head, version) for that thread; on cas, compare against the saved values."
```

## Senior signals

- You explain an atomic in terms of cache-line ownership (and can trace MESI states through two contending cores), know a contended atomic still serialises, and fix a hot counter by sharding with padding.
- You use `fetch_add` when an instruction exists and a CAS loop only for transformations that need one, and you can quote what failed CAS retries cost.
- You explain release/acquire as a happens-before edge, give the message-passing example, and say why it works on x86 (identical `mov`s) and fails on ARM.
- You know the store-buffer litmus test, that x86 exhibits it constantly, and why Peterson's algorithm needs fences.
- You can walk ABA on a Treiber stack, fix it with version tags, and explain why hazard pointers and epochs exist and what each costs.
- You default to mutexes and libraries, and ask "how was this verified?" of any hand-written lock-free structure.

## Check yourself

```quiz
- q: >-
    Sixteen threads increment one shared atomic counter with fetch_add. Measured aggregate throughput is lower than with one thread. Why?
  options: ["Each increment needs the line exclusively, so cores take turns", "SeqCst ordering on the atomic forces a trip to main memory", "fetch_add is implemented with a hidden mutex on x86 hardware", "The compiler turns fetch_add into a retrying CAS loop under load"]
  answer: 0
  explanation: >-
    An atomic RMW holds the cache line in Modified state, so every increment on another core first transfers the line; cores pass it around single file and each handoff costs tens of nanoseconds. fetch_add is one locked instruction, not a mutex or a loop, and no ordering bypasses the cache. Padded per-thread counters removed the sharing and scaled 25 times higher.
- q: >-
    A producer writes DATA = 42 then stores READY = true, both Relaxed. A consumer loads READY with Relaxed and, if true, reads DATA. What can the consumer see?
  options: ["42 or 0 on x86, but always 42 on ARM", "42 or 0, on ARM or after compiler reordering", "Always 42, because each store is atomic", "42 or a torn mix of the old and new bytes"]
  answer: 1
  explanation: >-
    Relaxed gives atomicity (no torn values) but no ordering between the two variables, so READY can become visible before DATA on weakly ordered hardware such as ARM, or when the compiler reorders. On x86 relaxed and release stores compile to the same mov, so it passes there by accident. A Release store paired with an Acquire load guarantees 42.
- q: >-
    Thread 1 runs `x = 1; r1 = y`. Thread 2 runs `y = 1; r2 = x`. Both start at 0 with plain stores and loads on x86. How often was r1 == 0 and r2 == 0 in the lesson's run?
  options: ["Only after compiler reordering, never from the hardware", "In most runs, until the stores were made seq_cst", "Only when both threads shared one physical core", "Never, because x86 stores are sequentially consistent"]
  answer: 1
  explanation: >-
    x86 lets a later load pass an earlier store to a different address, because the store waits in the store buffer; with the threads released together, 95% of 2 million runs read 0 in both. Making the stores seq_cst (a locked xchg that drains the store buffer) brought it to 0. The threads ran on different cores.
- q: >-
    In a Treiber stack, thread 1 reads head = A and next = B, then stalls. Meanwhile A and B are popped, B is freed and A is pushed back. Thread 1's CAS(head, A, B) succeeds. What went wrong, and what fixes it?
  options: ["False sharing; pad head onto its own line", "ABA; add a version tag or defer reclamation", "A data race; wrap the CAS in a mutex", "Starvation; replace the CAS with a fair lock"]
  answer: 1
  explanation: >-
    The CAS compared only the address, which matched although the structure had changed: the ABA problem. A version counter changes on every update so a recycled address no longer matches, and hazard pointers or epochs prevent A from being reused while thread 1 holds it. Every access is atomic, so it is not a data race, and padding does not change what CAS compares.
- q: >-
    A service uses epoch-based reclamation for a lock-free map, and its memory grows steadily while one worker thread is blocked on a slow downstream call. What is the likely cause?
  options: ["The hazard pointer scan threshold is set too low for this workload", "Blocked threads double every node's reference count while waiting", "The blocked thread is still pinned, so the global epoch cannot advance", "Epoch reclamation frees nodes only when the whole process is idle"]
  answer: 2
  explanation: >-
    Garbage retired in epoch E is freed only after the global epoch reaches E plus 2, and the epoch advances only when every pinned thread has observed the current one. A thread blocked while pinned freezes the epoch, so all retired nodes accumulate. Hazard pointers bound memory in this situation at the cost of a fence per protected load; epochs have no reference counts.
- q: >-
    Which statement about a lock-free CAS-loop counter is true?
  options: ["Some thread always progresses, but one may retry forever", "Every thread finishes an increment in a bounded number of steps", "It is correct on x86 but can lose updates on ARM hardware", "It is always faster than a mutex, whatever the contention"]
  answer: 0
  explanation: >-
    A failed CAS means another thread's CAS succeeded, so the system progresses (lock-free), but an unlucky thread can lose repeatedly (not wait-free). Speed depends on contention: measured here, the CAS loop at 16 threads was 8 times slower than fetch_add. Correctness does not depend on the architecture, because the CAS itself is atomic everywhere.
```
