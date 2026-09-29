---
slug: races-mutexes-and-invariants
title: "Races, mutexes and invariants"
description: Why counter += 1 loses updates (traced register by register and measured), how a data race differs from a race condition, what a mutex does in hardware and in the kernel (the futex fast and slow paths), what contention really costs, and why a lock protects an invariant rather than a variable.
minutes: 45
difficulty: medium
tags: [concurrency, race-condition, data-race, mutex, invariants, gil, send-sync, lock-granularity]
---
Your service keeps an in-memory count of active sessions. Request threads increment it on login and decrement it on logout. After a day of traffic the dashboard shows −1,312 active sessions. No request failed, nothing was logged, and the code is two lines long. Every lost update came from the same place: `active += 1` is not one operation, and two threads executed it at the same time.

A race is not a rare event you can wait out. At a million increments a second, an interleaving with a one-in-a-million chance happens every second. The fix is also not "add a lock" as a reflex. The fix is knowing *what the lock protects*, which is almost never a single variable. This lesson builds that model from the instructions up: why the update is lost, what a mutex does to prevent it, what contention costs, and how Python, Go and Rust each decide how much of this is your problem. Numbers were measured on a 16-core Ryzen 9 9950X3D under WSL2 with CPython 3.14, Go 1.27 and GCC.

## Three instructions, not one

`counter += 1` reads like an atomic action. It compiles to three:

```text
load   r1, [counter]     ; read the current value into a register
add    r1, 1             ; increment the private copy
store  [counter], r1     ; write it back
```

CPython 3.14 does the same one level up:

```text
LOAD_GLOBAL      0 (counter)
LOAD_SMALL_INT   1
BINARY_OP       13 (+=)
STORE_GLOBAL     0 (counter)
```

Even when an x86 compiler emits a single `add qword ptr [counter], 1`, the CPU performs a read, a modify and a write; without a `lock` prefix, another core can read the same old value in between.

The register is private to each thread; memory is shared. Here is the lost update with the counter starting at 41, tracking both registers:

| Step | Thread A does | A's `r1` | Thread B does | B's `r1` | `counter` in memory |
|---|---|---|---|---|---|
| 1 | load | 41 | | – | 41 |
| 2 | | 41 | load | 41 | 41 |
| 3 | add | 42 | | 41 | 41 |
| 4 | | 42 | add | 42 | 41 |
| 5 | store | 42 | | 42 | 42 |
| 6 | | 42 | store | 42 | 42 |

Two increments ran and one survived: the **lost update**. The damage has no floor of "off by a little". If A loads 0 and stalls while B completes 999 increments, A's store of 1 erases all 999 at once; the exercise at the end makes you trace such a schedule.

```viz
{"type": "concurrency", "algorithm": "race-condition", "threads": 2,
 "title": "Two threads, one counter, one lost update",
 "caption": "Each increment is load, add, store. When both loads happen before either store, both threads write the same value and one increment vanishes."}
```

### Measured

Four C threads, each incrementing a shared `long` 10 million times:

| Version | Final value (of 40,000,000) | Time per increment |
|---|---|---|
| `volatile long`, plain `++` | 11,165,256 | 0.75 ns |
| Plain `long`, compiled with `-O2` | 40,000,000 | 0.01 ns |
| `atomic_fetch_add` (`lock xadd`) | 40,000,000 | 5.65 ns |
| `pthread_mutex_lock` around `++` | 40,000,000 | 25.7 ns |

The `volatile` version lost 72% of its updates. The plain version looks correct and is the most instructive row: the disassembly of the thread function is a single `addq $0x989680, plain(%rip)`. Because a data race is undefined behaviour in C, the compiler assumed no other thread touches `plain`, collapsed ten million increments into one addition of 10,000,000, and the four additions happened not to overlap. The race is still there, hidden by an optimisation that is only legal because the program is wrong.

## Data races versus race conditions

A **data race** is a property of memory accesses: two threads access the same location, at least one writes, and nothing orders them (no lock, atomic or channel operation establishes that one *happens before* the other). A **race condition** is a property of logic: correctness depends on the relative timing of operations. You can have the second with none of the first:

```python
import threading

class Account:
    def __init__(self, balance):
        self._lock = threading.Lock()
        self._balance = balance

    def balance(self):
        with self._lock:
            return self._balance

    def set_balance(self, value):
        with self._lock:
            self._balance = value

def withdraw(account, amount):
    if account.balance() >= amount:                       # check (locked)
        account.set_balance(account.balance() - amount)   # act (locked)
```

Every access to `_balance` is locked, so a race detector stays silent. But two threads withdrawing 80 from 100 can both pass the check before either acts: both succeed, 160 is paid out and the balance ends at 20 (or −60 with a different interleaving). The lock protects each access; nothing protects the *decision*. This is **check-then-act**; `counter += 1` is its cousin **read-modify-write**.

| Language | What a data race means |
|---|---|
| C, C++ | Undefined behaviour; the compiler may transform the code as if races never happen (the `-O2` row above) |
| Rust (safe code) | A compile error: the type system rejects unsynchronised shared mutation |
| Go | Detectable at runtime with `-race`; races on multiword values (interfaces, slices, strings) can produce torn values no thread wrote |
| Java | Defined but weak: stale or reordered values, and a non-volatile `long` or `double` may tear into two 32-bit halves (JLS 17.7), but never values out of thin air |
| CPython with the GIL | A single bytecode or built-in C operation is atomic relative to others; sequences of bytecodes race |

Race detectors find data races. Race conditions need you to find them, by naming the invariant.

## A lock protects an invariant

An **invariant** is a statement about your data that must hold whenever another thread might look: "the session count equals the number of live sessions", "every key in the map has exactly one node in the LRU list", "the sum of all balances is constant". Invariants usually span several variables, and every update breaks them briefly.

A **critical section** is the stretch of code during which the invariant may be false. The rule that separates correct locking from decorative locking:

> Every access to the data an invariant covers, reads included, goes through the same lock, and the lock is held for the whole span in which the invariant is broken.

Take a transfer of 100 from A (500) to B (300); the invariant is `A + B == 800`.

```python
import threading

class Bank:
    def __init__(self):
        self._lock = threading.Lock()
        self._balances = {"A": 500, "B": 300}

    def transfer(self, src, dst, amount):
        with self._lock:                      # invariant may break inside
            if self._balances[src] < amount:
                raise ValueError("insufficient funds")
            self._balances[src] -= amount     # A = 400, B = 300: total 700
            self._balances[dst] += amount     # A = 400, B = 400: total 800

    def total(self):
        with self._lock:                      # reads need the lock too
            return sum(self._balances.values())
```

If `total()` skipped the lock "because it only reads", an auditor thread could run between the two updates and report 700. Nothing is corrupted, but your reconciliation job has now paged someone. The check (`< amount`) sits in the same critical section as the act, which is what fixes `withdraw`: decision and update are one atomic step from every other thread's point of view.

## Under the hood: what a mutex does

A mutex is a word of memory plus a promise from the kernel. Linux's design, the **futex** ("fast userspace mutex"), keeps the common case out of the kernel. This is the three-state lock glibc's low-level lock uses (from Ulrich Drepper's paper "Futexes Are Tricky"):

```python
# state: 0 = unlocked, 1 = locked, 2 = locked and someone may be waiting
def lock(m):
    if compare_and_swap(m.state, 0, 1):   # fast path: one atomic instruction
        return
    while exchange(m.state, 2) != 0:      # announce a waiter; 0 back means we got it
        futex_wait(m.state, 2)            # syscall: sleep only if state is still 2

def unlock(m):
    if exchange(m.state, 0) == 2:         # were there (maybe) waiters?
        futex_wake(m.state, 1)            # syscall: wake one
```

Trace two threads contending:

| Step | Event | `state` after | Syscalls so far |
|---|---|---|---|
| 1 | A: `lock`, CAS 0→1 succeeds | 1 | 0 |
| 2 | B: `lock`, CAS fails; `exchange(2)` returns 1, so B calls `futex_wait(state, 2)` and sleeps | 2 | 1 |
| 3 | A: `unlock`, `exchange(0)` returns 2, so A calls `futex_wake` | 0 | 2 |
| 4 | B wakes, loops: `exchange(2)` returns 0, so B owns the lock | 2 | 2 |
| 5 | B: `unlock`, `exchange(0)` returns 2, so B calls `futex_wake` with nobody waiting | 0 | 3 |

Step 4 is the subtle one: a woken thread cannot know whether others still sleep, so it conservatively sets 2, and step 5 pays a wasted wake syscall. That is the price of a lock that needs no waiter count. The kernel side makes step 2 safe: `futex_wait` hashes the address to a bucket, takes the bucket's lock, and re-checks that the word still equals 2 before sleeping. If A's unlock slipped in between B's exchange and B's syscall, the value is 0, the call returns immediately and B retries, so a wake-up can never be lost.

Three consequences:

1. **An uncontended lock never enters the kernel**: one CAS and one exchange. glibc's `pthread_mutex_t`, Rust's `std::sync::Mutex` (futex-based on Linux since Rust 1.62) and Go's `sync.Mutex` all have this shape.
2. **Contention is what costs**: a sleep and a wake are system calls, a context switch, and a wake-up that waits for a core. Most implementations spin briefly first. Go's `sync.Mutex` spins, then parks the goroutine, and switches to a FIFO *starvation mode* once a waiter has waited more than 1 ms, trading throughput for fairness.
3. **A mutex orders memory.** Acquiring is an *acquire* operation and releasing is a *release*: everything the previous holder wrote before `unlock` is visible to the next holder after `lock`. A hand-rolled boolean flag provides neither exclusion nor visibility; [Atomics and lock-free programming](/learn/systems/concurrency/atomics-and-lock-free) shows why.

```viz
{"type": "concurrency", "algorithm": "mutex", "threads": 3,
 "title": "The same increments, serialised by a mutex",
 "caption": "Load, add and store now run as one indivisible step from the other threads' point of view. Correctness is restored; the price is that the threads queue behind each other."}
```

## What locking costs, measured

| Operation | Measured |
|---|---|
| `pthread_mutex` lock + unlock, one thread | 8.4 ns |
| Go `sync.Mutex` lock + unlock, one goroutine | 7.6 ns |
| Atomic add, one thread (C or Go) | 3.6 ns |
| Python `with lock:` around nothing (an empty loop iteration is 8 ns) | 53 ns |

Uncontended locks are cheap. Contended ones are not, and adding threads can *reduce* throughput. Each C thread below takes the mutex, increments, spins about 50 ns inside and about 50 ns outside, 2 million times:

| Threads | Total throughput | Voluntary context switches per operation |
|---|---|---|
| 1 | 9.3 M ops/s | 0 |
| 4 | 5.9 M ops/s | 0.014 |
| 16 | 2.9 M ops/s | 0.095 |

Sixteen threads did a third of the work of one. Every handoff moves the lock's cache line (and the data it protects) between cores, and as waiters pile up more of them fall to the futex slow path and sleep; one operation in ten involved a context switch at 16 threads. This collapse under load is a **lock convoy**, and it is why "add more threads" makes a lock-bound service slower.

The arithmetic for design reviews: a lock held for 2 µs per request caps throughput at 1 / 2 µs = 500,000 requests per second, on any number of cores, and handoff costs push the real ceiling lower. Amdahl's law generalises it: with 5% of the work serialised, 64 cores give at most 1 / (0.05 + 0.95/64) ≈ 15× speedup.

## The same bug in Python, Go and Rust

### Python: the GIL is not a lock for your data

The default CPython build has a **global interpreter lock**: one thread executes bytecode at a time, and the running thread is asked to drop it every 5 ms (`sys.getswitchinterval()`). CPython 3.14 only acts on that request at particular points: calls and loop back-edges. Measured, four threads each running `counter += 1` a million times ended at exactly 4,000,000 in every run, even with the switch interval cut to 1 µs, because no check point falls between `LOAD_GLOBAL` and `STORE_GLOBAL`. Change the line to `counter += one()`, where `one()` returns 1, and the call inside the read-modify-write opens a window: 2.74 million of 4 million at the default interval, 1.61 million at 10 µs.

That is the worst possible outcome for learning: people run the simple experiment, see the right answer and conclude it is safe. It is not, and the **free-threaded** build (PEP 703; optional in 3.13, supported but still a separate build in 3.14) removes the illusion entirely: threads run bytecode in parallel and the plain loop loses updates. Built-in containers keep their per-operation guarantees through per-object locks, so a single `list.append` or `d[k] = v` is still safe; compound operations (`d[k] = d.get(k, 0) + 1`, `if k not in d: d[k] = v`) never were atomic. The fix is the same on both builds:

```python
import threading

lock = threading.Lock()
counter = 0

def work():
    global counter
    for _ in range(100_000):
        with lock:
            counter += 1
```

### Go: cheap goroutines and a race detector

Put the mutex next to the data it guards and keep both unexported:

```go
package counter

import "sync"

type Counter struct {
	mu sync.Mutex // guards n
	n  int
}

func (c *Counter) Inc() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.n++
}
```

`go test -race` (built on ThreadSanitizer) records, per memory access, which synchronisation events preceded it and reports two conflicting accesses not ordered by happens-before, with both stack traces. It slows execution roughly 2–20× and uses 5–10× the memory, and it only reports races that *actually execute*: a clean run over tests that never run things concurrently proves nothing. Concurrent writes to a built-in `map` are also checked without `-race`: since Go 1.6 the runtime has a lightweight, best-effort detector that stops the program with `fatal error: concurrent map writes`, which is not recoverable, but a clean run does not prove the map is safe.

### Rust: the mutex owns the data

```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let counter = Arc::new(Mutex::new(0u64));
    let handles: Vec<_> = (0..4)
        .map(|_| {
            let c = Arc::clone(&counter);
            thread::spawn(move || {
                for _ in 0..100_000 {
                    *c.lock().unwrap() += 1; // the guard unlocks at the end of the statement
                }
            })
        })
        .collect();
    for h in handles {
        h.join().unwrap();
    }
    println!("{}", *counter.lock().unwrap()); // always 400000
}
```

A type is **`Send`** if it is safe to move to another thread and **`Sync`** if several threads may hold `&T` at once. `thread::spawn` requires a `Send + 'static` closure. `Rc<T>` is neither (its count is not atomic); `RefCell<T>` is `Send` but not `Sync`; `Mutex<T>` is `Sync` whenever `T: Send`, which is how shared mutation is allowed at all. `lock()` returns a guard and the data is reachable only through it, so "this lock protects this data", a comment in Go and Python, is part of the type. A panic while holding the guard **poisons** the mutex, because the invariant may be half-broken. Rust does not prevent race conditions (the `withdraw` bug compiles if each step locks separately) or deadlock, the [next lesson](/learn/systems/concurrency/deadlock).

## Lock granularity: correctness first, then contention

A lock is correct when it covers the invariant and fast when it is rarely contended. The techniques, in the order to reach for them:

1. **Shrink the critical section.** Compute outside the lock; lock only to read or publish. Never hold a lock across network or disk I/O, a sleep, or a callback into code you do not control.
2. **Stripe the lock.** Keep N locks and pick one by `hash(key) % N`. Java's `ConcurrentHashMap` started with 16 segments and moved to per-bin locking with CAS for empty bins. Cross-shard operations then need several locks and an order.
3. **Shard the data per thread.** One counter per thread or core, summed on read: Java's `LongAdder`, the kernel's per-CPU counters.
4. **Publish immutable snapshots.** Readers take a reference to an immutable version; a writer builds a new one and swaps the reference (read-copy-update in the kernel, `arc-swap` in Rust).
5. **Do not share.** One owner thread, messages in; see [Actors, channels and CSP](/learn/systems/concurrency/actors-channels-and-csp).

| Strategy | Read cost | Write cost | Consistent multi-key view | Complexity |
|---|---|---|---|---|
| One global lock | Serialised | Serialised | Trivial | Lowest |
| Striped locks | Parallel across stripes | Parallel across stripes | Needs all stripes, in order | Moderate |
| Per-thread shards | Sum over shards (slow) | Uncontended | Approximate while writes continue | Low |
| Immutable snapshot swap | Lock-free, never blocks | Copy the structure | Yes, per snapshot | Moderate; memory churn |
| Single owner and messages | A round trip | A round trip | Yes, owner is serial | Moderate; queueing to reason about |

The most common granularity bug is a cache that holds its lock across a database call:

```python
# Wrong: every other request waits 20 ms for this one's database call.
def get(key):
    with lock:
        if key not in cache:
            cache[key] = fetch_from_db(key)
        return cache[key]

# Better: check under the lock, do the slow work outside it, publish under it.
def get(key):
    with lock:
        if key in cache:
            return cache[key]
    value = fetch_from_db(key)              # may run twice for the same key
    with lock:
        return cache.setdefault(key, value) # first writer wins; everyone returns the same value
```

If the duplicate database work matters (an expensive query, a thundering herd after a flush), use **single-flight**: the first caller for a key registers an in-flight future and later callers wait on it. Go ships it as `golang.org/x/sync/singleflight`.

## Failure modes in production

**Symptom: a gauge such as active sessions drifts negative or far too high, with no errors.** Diagnosis: a read-modify-write on shared state without a lock or atomic; in Go, `go test -race` on a concurrent test reproduces it. Fix: an atomic for a lone counter, a lock for anything with an invariant spanning fields.

**Symptom: latency of every endpoint rises together whenever one dependency slows, and CPU drops.** Diagnosis: thread dumps (`jstack`, `py-spy dump`, Go's `/debug/pprof/goroutine`) show most threads blocked on one lock whose holder is inside a network call. Fix: move the I/O out of the critical section, single-flight duplicate fetches.

**Symptom: throughput falls as you add threads or cores, with rising context switches.** Diagnosis: a contended lock convoy, as in the measurement above; mutex profiles (Go's `runtime.SetMutexProfileFraction`, JFR's lock events) point at one lock. Fix: shrink or stripe the section, shard the data, or make the hot path lock-free.

**Symptom: a Go service crashes with `fatal error: concurrent map writes`, or panics on a nil interface that was never nil.** Diagnosis: unsynchronised map access or a torn read of a two-word interface or slice header; `-race` finds both. Fix: guard with a mutex (or `sync.Map` for write-once, read-many keys).

**Symptom: code that "never lost updates" starts losing them after a Python upgrade or a move to the free-threaded build.** Diagnosis: correctness relied on the GIL's switch points. Fix: explicit locks around every compound operation on shared state.

## Interviewer follow-ups

**"Why does `counter += 1` lose updates, and what is the minimum possible final value for two threads doing n increments each?"** Model answer: it is load, add, store, and a store of a stale value erases every increment made since that load; with a schedule where one thread stalls after loading, the final value can be as low as 2. Common wrong answer: "at least n, since each thread's own increments survive".

**"What happens inside `lock()` when the mutex is held?"** Model answer: the fast-path CAS fails, the thread may spin briefly, then marks the word contended and calls `futex_wait`, which sleeps only if the word still has the contended value; `unlock` sees the contended value and calls `futex_wake`. Common wrong answer: "the thread busy-waits until the lock is free".

**"A lock is held for 10 µs per request. What is the maximum throughput, and how do you raise it?"** Model answer: 100,000 per second regardless of cores, and lower once handoff costs are counted; shrink the critical section, stripe it, shard the data or remove sharing. Common wrong answer: "add more threads or cores".

**"Is a Python dict thread-safe?"** Model answer: single operations such as `d[k] = v` or `d.get(k)` are atomic on both GIL and free-threaded builds; compound operations such as increment-in-place or check-then-insert are not and need a lock. Common wrong answer: "yes, because of the GIL".

## What mid-level engineers get wrong

- **Locking writes but not reads.** Consequence: readers observe half-applied updates and report states that never existed.
- **Checking under one lock acquisition and acting under another.** Consequence: check-then-act races that no race detector reports.
- **Holding a lock across I/O.** Consequence: one slow dependency serialises the whole service.
- **Trusting a GIL-build experiment.** Consequence: code that breaks on the next CPython version, the free-threaded build or the first added function call.
- **Adding threads to a lock-bound workload.** Consequence: lower throughput and more context switches, as measured above.
- **Treating a clean `-race` run as proof.** Consequence: races in paths the tests never ran concurrently.

## Exercises

Real threads are non-deterministic, which makes races hard to unit-test. The standard trick is to make the scheduler an input and replay it; Rust's `loom` does this exhaustively for small programs.

```exercise
id: replay-interleaving
title: Replay a schedule and count lost updates
prompt: |
  Several threads increment one shared counter (starting at 0). Thread `i`
  performs `increments[i]` increments, and every increment is three steps:

  1. **load**: copy the shared counter into the thread's private register
  2. **add**: add 1 to the register
  3. **store**: write the register back to the shared counter

  `schedule` is a list of thread indices. Each entry executes the *next* step
  of that thread. Entries naming a thread that has finished all its
  increments are ignored. If the schedule runs out before every thread has
  finished, run the remaining steps of thread 0 to completion, then thread 1,
  and so on.

  Return the final value of the shared counter.
languages: [python, javascript]
entry: final_counter
starter:
  python: |
    def final_counter(increments, schedule):
        # Track, per thread: which step comes next, its register, and how
        # many increments it has completed.
        return 0
  javascript: |
    function final_counter(increments, schedule) {
      // Track, per thread: which step comes next, its register, and how
      // many increments it has completed.
      return 0;
    }
tests:
  - args: [[1, 1], [0, 0, 0, 1, 1, 1]]
    expected: 2
    label: serial schedule loses nothing
  - args: [[1, 1], [0, 1, 0, 1, 0, 1]]
    expected: 1
    label: both load before either stores
  - args: [[3, 2], []]
    expected: 5
    label: empty schedule runs threads in order
  - args: [[1, 1, 1], [0, 1, 2, 0, 1, 2, 0, 1, 2]]
    expected: 1
  - args: [[1, 1], [0, 0, 0, 0, 0, 1, 1, 1]]
    expected: 2
    label: steps for a finished thread are ignored
  - args: [[2, 2], [0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 0, 0]]
    expected: 3
    hidden: true
  - args: [[3, 3], [0, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1]]
    expected: 2
    hidden: true
    label: six increments, final value 2
hints:
  - "Keep three arrays indexed by thread: next step (0, 1 or 2), register value, and increments completed."
  - "A thread is finished when its completed count equals increments[i]; skip schedule entries for it."
  - "Only the store step changes the shared counter, and only the store step completes an increment."
```

The last hidden test is worth tracing by hand. Thread 0 loads 0 and stalls. Thread 1 completes two full increments (counter = 2). Thread 0 adds and stores 1, wiping them out. Thread 1 loads 1 for its third increment and stalls. Thread 0 completes its last two increments (counter = 3). Thread 1 finally stores 2. Six increments, final value 2.

```exercise
id: futex-syscalls
title: Count a futex mutex's system calls
prompt: |
  Simulate the three-state futex mutex from the lesson (0 unlocked, 1
  locked, 2 locked with possible waiters) and count its system calls.

  `events` is a list of `["lock", thread]` or `["unlock", thread]`, applied in
  order; every unlock is by the current owner.

  - `lock` when state is 0: state becomes 1, no syscall.
  - `lock` otherwise: state becomes 2, the thread joins the back of the wait
    queue and makes one `futex_wait` call.
  - `unlock`: remember the old state and set state to 0. If the old state was
    2, make one `futex_wake` call; if the queue is non-empty, its first thread
    wakes immediately (before the next event), takes the lock and sets the
    state to 2.

  Return `{"wait": w, "wake": k}`, the number of each call.
languages: [python, javascript]
entry: futex_calls
starter:
  python: |
    def futex_calls(events):
        state = 0
        waiters = []
        wait = wake = 0
        # your code here
        return {"wait": wait, "wake": wake}
  javascript: |
    function futex_calls(events) {
      let state = 0;
      const waiters = [];
      let wait = 0, wake = 0;
      // your code here
      return { wait, wake };
    }
tests:
  - args: [[["lock", "A"], ["unlock", "A"], ["lock", "B"], ["unlock", "B"]]]
    expected: {"wait": 0, "wake": 0}
    label: uncontended, never enters the kernel
  - args: [[["lock", "A"], ["lock", "B"], ["unlock", "A"], ["unlock", "B"]]]
    expected: {"wait": 1, "wake": 2}
    label: the lesson's trace, including the wasted wake
  - args: [[]]
    expected: {"wait": 0, "wake": 0}
    label: no events
  - args: [[["lock", "A"], ["lock", "B"], ["lock", "C"], ["unlock", "A"], ["unlock", "B"], ["unlock", "C"]]]
    expected: {"wait": 2, "wake": 3}
  - args: [[["lock", "A"], ["lock", "B"], ["unlock", "A"], ["lock", "C"], ["unlock", "B"], ["unlock", "C"], ["lock", "A"], ["unlock", "A"]]]
    expected: {"wait": 2, "wake": 3}
    hidden: true
  - args: [[["lock", "A"], ["lock", "B"], ["unlock", "A"], ["unlock", "B"], ["lock", "C"], ["lock", "D"], ["lock", "E"], ["unlock", "C"], ["unlock", "D"], ["unlock", "E"]]]
    expected: {"wait": 3, "wake": 5}
    hidden: true
hints:
  - "Only a lock that finds a non-zero state waits; only an unlock that finds state 2 wakes."
  - "A woken waiter always leaves the state at 2, so the next unlock wakes even if nobody is left."
```

## Senior signals

- You distinguish a **data race** (unordered conflicting accesses, found by tools) from a **race condition** (timing-dependent logic, found by naming the invariant), and you know a program can have the second with none of the first.
- You describe a lock by the **invariant** it protects, insist that readers take it too, and keep checks and dependent acts in one critical section.
- You can trace the futex fast and slow paths, including why the kernel re-checks the word and why a woken waiter sets the contended state.
- You know an uncontended lock costs nanoseconds and **contention** costs microseconds, compute a lock's throughput ceiling from its hold time, and recognise a convoy when throughput falls with thread count.
- You never hold a lock across I/O or foreign callbacks, and you reach for striping, sharding, snapshots or single-flight when contention or duplicate work matters.
- You can explain why the GIL never made compound operations safe (and why CPython 3.14's switch points hide it), run Go tests with `-race` knowing its blind spot, and explain `Send` and `Sync` and what Rust does not prevent.

## Check yourself

```quiz
- q: >-
    Two threads each run `x += 1` 1,000 times on a free-threaded Python build, with x starting at 0 and no lock. Which range of final values is possible?
  options: ["Anywhere from 2 to 2000", "Exactly 2000 every time", "Anywhere from 0 to 2000", "Anywhere from 1000 to 2000"]
  answer: 0
  explanation: >-
    1000 is the tempting floor, but a single stale store can erase many increments. Thread A loads 0 and stalls; B completes 999 increments; A stores 1; B loads 1 and stalls; A completes its remaining 999 (x = 1000); B stores 2. The floor is 2: every store writes a loaded value plus one, and each thread's final load happens after its own earlier stores, so the last store overall writes at least 2.
- q: >-
    Four C threads each increment a plain, non-atomic global 10 million times. Compiled with -O2 the result is exactly 40,000,000. What does that show?
  options: ["The compiler collapsed each loop into one add, hiding the race", "The threads ran one after another because the loop was short", "x86 makes aligned 64-bit increments atomic, so no race exists", "glibc inserts a lock prefix on shared globals automatically"]
  answer: 0
  explanation: >-
    Because a data race is undefined behaviour, the compiler may assume no other thread touches the variable and turned ten million increments into a single add of 10,000,000; four such adds rarely overlap. The race still exists, as the volatile version shows by losing 72% of its updates. x86 increments without a lock prefix are not atomic read-modify-writes.
- q: >-
    In the futex mutex, thread B finds the lock held, sets the state to 2 and calls futex_wait(state, 2). Just before that syscall, the holder unlocks. Why does B not sleep forever?
  options: ["The holder's futex_wake is queued until B finishes sleeping", "futex_wait re-checks the word under the bucket lock and returns", "B spins for a millisecond before sleeping, so it sees the unlock", "The kernel wakes every sleeper on any futex whenever one unlocks"]
  answer: 1
  explanation: >-
    The kernel sleeps only if the word still equals the expected value, checking it atomically with queueing under the hash bucket's lock. After the unlock the word is 0, so futex_wait returns immediately and B retries the exchange. Wake-ups are not queued for future sleepers, spinning is optional and bounded, and wakes target one address.
- q: >-
    A lock-protected section takes about 50 ns. Measured throughput is 9.3 million operations per second with one thread and 2.9 million with 16. What is the main cause?
  options: ["The mutex switches to a slower algorithm above 8 threads", "Handoffs move the lock's cache line and more waiters sleep", "Each thread's stack no longer fits in the L1 data cache", "The scheduler time-slices the 16 threads onto one core"]
  answer: 1
  explanation: >-
    Every acquisition by a different core pulls the lock and the protected data across the interconnect, and as waiters pile up more fall to the futex slow path (0.095 context switches per operation at 16 threads here). That is a lock convoy. The threads run on different cores, the algorithm does not change, and stacks are irrelevant.
- q: >-
    A Bank class locks correctly inside transfer(). A new total() method reads all balances without the lock because it only reads. What can go wrong?
  options: ["It can deadlock with transfer() when both run together", "Nothing, because reads alone cannot corrupt shared data", "It can see a transfer halfway through and report a false total", "Balances can go negative when it races with transfer()"]
  answer: 2
  explanation: >-
    Between the debit and the credit the invariant (the sum is constant) is false. A reader outside the lock can see that intermediate state and report a sum that was never true. Nothing is corrupted, but locks exist to hide broken invariants from every observer, readers included. A reader that takes no lock cannot deadlock.
- q: >-
    Your Go service's tests pass with go test -race. What have you learned?
  options: ["The program has no data races or race conditions", "No data race occurred in the interleavings the tests ran", "The program has no data races on any possible code path", "The program has no data races and cannot deadlock"]
  answer: 1
  explanation: >-
    The race detector is dynamic: it tracks happens-before for accesses that really happen during the run, so a clean run only says no data race occurred on the paths and interleavings those tests executed. It says nothing about race conditions without a data race, or about deadlocks.
```
