---
slug: deadlock
title: "Deadlock, livelock and starvation"
description: The four Coffman conditions, a deadlock traced step by step and measured, why a global lock order fixes most of them, how lockdep finds deadlocks before they happen, how databases detect cycles in a wait-for graph, and the retry loops that turn deadlock into livelock.
minutes: 45
difficulty: medium
tags: [concurrency, deadlock, lock-ordering, livelock, starvation, wait-for-graph, coffman-conditions]
---
Once a week, usually in the small hours, your order service stops responding. CPU drops to zero. Health checks time out, the orchestrator restarts the pod, and everything is fine for another week. When someone finally captures a thread dump before the restart, it shows two threads, each parked inside `lock()`, each holding the lock the other one wants. Nobody will ever release anything, because releasing is the next line of code after an acquisition that will never return.

That is a **deadlock**: a set of threads, each waiting for something only another member of the set can provide. It is the characteristic failure of lock-based code, and it has two siblings that look different on a dashboard but share a root cause: **livelock** (everyone is busy, nobody progresses) and **starvation** (somebody never gets a turn). This lesson covers how each arises, the conditions you can break to make deadlock impossible, the tools that find it before production does, and how databases detect it when prevention is not an option. Measurements were taken on a 16-core Ryzen 9 9950X3D under WSL2.

## The anatomy of a deadlock

The textbook version is also the production version. `transfer` locks the source account, then the destination:

```go
package bank

import "sync"

type Account struct {
	id      int
	mu      sync.Mutex
	balance int
}

func transfer(from, to *Account, amount int) {
	from.mu.Lock()
	defer from.mu.Unlock()
	to.mu.Lock() // G1 holds alice and wants bob; G2 holds bob and wants alice
	defer to.mu.Unlock()
	from.balance -= amount
	to.balance += amount
}

// G1: transfer(alice, bob, 10)
// G2: transfer(bob, alice, 5)
```

Trace the losing interleaving:

| Step | G1 | G2 | `alice.mu` held by | `bob.mu` held by | Wait-for edges |
|---|---|---|---|---|---|
| 1 | `alice.mu.Lock()` succeeds | | G1 | – | none |
| 2 | | `bob.mu.Lock()` succeeds | G1 | G2 | none |
| 3 | `bob.mu.Lock()` blocks | | G1 | G2 | G1 → G2 |
| 4 | | `alice.mu.Lock()` blocks | G1 | G2 | G1 → G2, G2 → G1 |

After step 4 the wait-for graph has a cycle and nothing in the program can break it: each goroutine's `Unlock` is a deferred call that runs only after the `Lock` that will never return. Step through the three-thread version:

```viz
{"type": "concurrency", "algorithm": "deadlock", "threads": 3,
 "title": "Circular wait with three threads",
 "caption": "Each thread holds one lock and requests the next thread's. The wait-for graph is a cycle, so no thread can proceed and none will release."}
```

### How small is the window?

Both goroutines must be between their first and second `Lock` at the same moment, a window of tens of nanoseconds per transfer. Measured with two goroutines doing nothing but opposite-direction transfers in a loop, Go deadlocked after 2,079 to 3,826 transfers in five trials. With Python threads (each second acquisition given a 0.5 s timeout as a watchdog), five trials deadlocked after between 0 and 161,093 transfers, never more than 31 ms in. The window is tiny, and a hot loop hits it in milliseconds. In production only a few transfers per second run in opposite directions at the same instant, which is why it takes a week, and the rate grows with traffic, core count and anything that widens the window (a log line between the locks, a page fault, a preemption). Deadlocks that "never happen in staging" are deadlocks whose window staging traffic has not hit yet.

## The four conditions

Coffman, Elphick and Shoshani showed in 1971 that a deadlock requires four conditions at once. Remove any one and deadlock is impossible:

| Condition | What it means | How to break it | Cost of breaking it |
|---|---|---|---|
| **Mutual exclusion** | A resource can be held by one thread only | Immutable data, per-thread copies, lock-free structures | Often impossible for mutable shared state |
| **Hold and wait** | A thread holds one resource while waiting for another | Acquire everything at once, or try-lock and release everything on failure | Retry loops, risk of livelock |
| **No preemption** | Nobody can take a resource from its holder | Timeouts; a supervisor aborts a victim and rolls it back | Needs rollback, which only transactions have |
| **Circular wait** | A cycle of threads each waiting on the next | A global order on lock acquisition | Discipline across the whole codebase |

Application code breaks **circular wait** with a lock order. Databases break **no preemption**: they let the deadlock happen, detect it and abort a victim. Retry designs break **hold and wait**. Knowing which condition a fix attacks is what lets you predict its failure mode.

A fifth approach, **avoidance**, keeps all four conditions possible but refuses any grant that could lead to deadlock. Dijkstra's banker's algorithm does this by checking, before each grant, that some order still lets every thread finish given its declared maximum needs. Operating systems and application code almost never use it, because nobody knows their maximum lock needs in advance and the check is expensive per grant.

## Lock ordering: the fix that scales

Give every lock a rank and always acquire locks in increasing rank. For the bank, the account ID is a natural rank:

```go
func transferOrdered(a, b *Account, amount int) {
	if a.id == b.id {
		return // self-transfer: locking the same mutex twice would deadlock
	}
	first, second := a, b
	if b.id < a.id {
		first, second = b, a
	}
	first.mu.Lock()
	defer first.mu.Unlock()
	second.mu.Lock()
	defer second.mu.Unlock()
	a.balance -= amount
	b.balance += amount
}
```

Why this cannot deadlock: suppose a cycle of waiting threads T1 → T2 → … → T1 existed. Each thread waits for a lock whose rank is higher than every lock it holds, including the one the previous thread in the cycle wants. Walk around the cycle and the ranks strictly increase at every step, yet you arrive back where you started. A strictly increasing sequence cannot return to its start, so no cycle exists.

Two details separate a correct implementation from a nearly correct one. **Equal ranks**: `transfer(x, x, 10)` locks one non-reentrant mutex twice and deadlocks the thread with itself. **Unstable ranks**: ordering by memory address works in C and Go (heap objects do not move) but not for objects a compacting collector relocates, and never by `hash()` when two objects can hash equally. Use a stable, unique ID.

In a large codebase a rank per lock becomes a **lock hierarchy**: "the session lock is level 1, the cache lock level 2; take level 2 while holding level 1, never the reverse." Write it next to the locks, and let a tool check it.

### Under the hood: finding deadlocks before they happen

- The Linux kernel's **lockdep** groups locks into *classes* (every lock initialised at the same source line is one class) and records a directed edge "class X was held when class Y was acquired" the first time it sees each pair. Adding an edge that closes a cycle in that graph triggers a report with both acquisition stacks, even if the two paths ran hours apart on different CPUs and never actually deadlocked. The exercise at the end implements this check.
- **ThreadSanitizer** in C and C++ (`-fsanitize=thread`) reports `lock-order-inversion (potential deadlock)` the same way. Go's `-race` uses the same runtime but reports only data races.
- Java's `jstack` prints `Found one Java-level deadlock` with the cycle; `ThreadMXBean.findDeadlockedThreads()` exposes the check programmatically.
- Go's runtime detects only *total* deadlock. Removing the ordering from the transfer and running it with nothing else alive printed `fatal error: all goroutines are asleep - deadlock!` followed by every goroutine's stack, two of them parked in `sync.(*Mutex).Lock` via `lockSlow`. A server with an idle HTTP listener never qualifies, so partial deadlocks are silent; send `SIGQUIT` or read the `pprof` goroutine endpoint to dump stacks and look for goroutines blocked on each other's mutexes.

### Self-deadlock and reentrancy

The simplest deadlock needs one thread. Python's `threading.Lock`, Go's `sync.Mutex` and Rust's `std::sync::Mutex` are non-reentrant: a thread that holds the lock and calls `lock()` again waits for itself forever (Rust documents that the second call "might panic or deadlock"). It usually happens when a locking method calls another locking method. The conventions are to lock only in public methods and have private helpers assume the lock is held (Go code often names them `fooLocked`), or to use a reentrant lock (`threading.RLock`, Java's `ReentrantLock`). Reentrant locks hide the fact that a method is being called with the invariant possibly half-updated, which is why Go deliberately does not provide one.

Rust adds a twist: a guard lives as long as the temporary holding it, and temporaries in a `match` scrutinee live until the end of the `match`:

```rust
use std::collections::HashMap;
use std::sync::Mutex;

fn get_or_compute(cache: &Mutex<HashMap<String, String>>, key: String) -> String {
    match cache.lock().unwrap().get(&key) {
        Some(v) => v.clone(),
        None => {
            let v = key.to_uppercase();
            cache.lock().unwrap().insert(key, v.clone()); // scrutinee's guard still alive: self-deadlock
            v
        }
    }
}
```

The borrow checker is satisfied, because both are shared borrows of the `Mutex`. The fix is to bind the lookup first (`let hit = cache.lock().unwrap().get(&key).cloned();`) so the guard drops at the end of that statement. (The 2024 edition shortened temporary lifetimes in `if let` scrutinees, not in `match`.) Rust's guarantees stop at data races; lock discipline is still yours.

## Deadlock without mutexes

Anything that makes a thread wait for another can close a cycle:

- **Channels.** Two goroutines that each send on an unbuffered channel the other reads only after its own send completes; a pipeline whose consumer stops reading on error while the producer blocks on its next send ([Actors, channels and CSP](/learn/systems/concurrency/actors-channels-and-csp)).
- **Thread pools.** A task on a pool of 4 threads submits a subtask to the same pool and waits for it. With 4 such tasks running, all 4 workers wait for subtasks that sit in the queue with no worker to run them ([Thread pools](/learn/systems/concurrency/thread-pools-and-work-stealing)).
- **Databases.** Transaction 1 updates row 17 then row 42; transaction 2 updates 42 then 17.
- **Callbacks under a lock.** An object notifies listeners while holding its lock; a listener calls back into it, or takes a lock another thread holds while waiting for the object. The rule, **open calls**, is never to call code you do not control while holding a lock: copy what you need, release, then call.
- **Priority inversion.** A low-priority task holds a mutex a high-priority task needs, and medium-priority tasks keep the low one from running. The Mars Pathfinder lander hit this in 1997 and kept resetting until engineers enabled priority inheritance, which temporarily raises the holder to the waiter's priority.

## Detection: cycles in the wait-for graph

When you do not control the acquisition order (a database executing arbitrary transactions), let deadlocks happen and detect them. Build a **wait-for graph**: a node per thread or transaction and an edge T → U when T is blocked on a resource U holds. A deadlock exists exactly when the graph has a cycle. With plain mutexes each blocked thread waits on one lock with one holder, so every node has at most one outgoing edge, and following edges from any thread either reaches a running thread or loops.

```viz
{"type": "graph", "algorithm": "cycle-detect", "directed": true,
 "nodes": [{"id": "T1"}, {"id": "T2"}, {"id": "T3"}, {"id": "T4"}],
 "edges": [{"from": "T4", "to": "T1"}, {"from": "T1", "to": "T2"}, {"from": "T2", "to": "T3"}, {"from": "T3", "to": "T2"}],
 "title": "A wait-for graph with one cycle",
 "caption": "T2 and T3 wait for each other: that cycle is the deadlock. T1 and T4 are blocked behind it but are not part of it, so aborting either of them does not break the deadlock."}
```

All four threads are stuck, but only T2 and T3 are *deadlocked*. Aborting T1 releases T1's locks and lets T4 proceed, but T2 and T3 stay stuck. A detector has to break the cycle itself.

### Under the hood: what databases do

- **PostgreSQL** does not check on every lock wait, because a consistent snapshot of the shared lock table is expensive and most waits resolve quickly. A backend sets a timer when it starts waiting; after `deadlock_timeout` (1 second by default) it takes every partition lock of the lock table, walks the waits-for graph outward from itself, and if its own transaction is on a cycle it aborts itself with `ERROR: deadlock detected` (SQLSTATE `40P01`). The graph distinguishes *hard* edges (T waits for a lock U holds) from *soft* edges (T is queued behind U's request); a cycle made only possible by queue order can be fixed by reordering the queue instead of aborting anyone.
- **MySQL InnoDB** checks immediately when a transaction starts waiting and rolls back the transaction it judges cheapest to undo (fewest rows modified and locked). Under very high concurrency the check itself becomes a bottleneck, so it can be disabled with `innodb_deadlock_detect`, falling back to `innodb_lock_wait_timeout` (50 seconds by default).

Recovery requires rollback, which is why detection-and-abort is a database strategy and lock ordering an application strategy. Every transaction that can deadlock must be **retried** on `40P01` (a normal, expected error), and updating rows in a consistent order (sorted by primary key) keeps retries rare. The storage-layer view is in [MVCC and locking](/learn/databases/relational-fundamentals/mvcc-and-locking); the graph algorithm is from [connectivity and cycles](/learn/data-structures/graphs/connectivity-and-cycles) and [Course Schedule](/practice/course-schedule).

## Timeouts and try-lock: breaking hold-and-wait

Refuse to wait while holding something. Take the first lock, *try* the second, and if that fails release everything and start again:

```python
import random
import time

def transfer(a, b, amount):
    while True:
        with a.lock:
            if b.lock.acquire(timeout=0.01):      # bounded wait instead of forever
                try:
                    a.balance -= amount
                    b.balance += amount
                    return
                finally:
                    b.lock.release()
        # released a.lock; back off before retrying
        time.sleep(random.uniform(0, 0.005))      # the jitter is not optional
```

This cannot deadlock. It can **livelock**. Remove the random sleep and picture two threads transferring in opposite directions: both take their first lock, both fail on their second, both release, both retry at the same instant, forever. CPU is at 100%, every thread is running, and no transfer completes: two people in a corridor stepping aside in the same direction. Randomised backoff breaks the symmetry, and exponential backoff with jitter keeps retries from synchronising under load, as in [timeouts, retries and backoff](/learn/networking/networking-in-practice/timeouts-retries-and-backoff).

Go added `TryLock` to `sync.Mutex` in 1.18 with documentation that discourages it, and Rust has `try_lock`; both are right when you genuinely have a fallback, not as a routine replacement for ordering. The most valuable production use of timeouts is diagnostic: an acquisition with a 30-second timeout that raises with a stack trace turns a silent hang into an alert.

## Starvation and fairness

A thread **starves** when it could proceed but never gets the chance because others keep winning. The system makes progress and the averages look fine; only the tail is broken. The usual cause is an unfair lock: a thread that releases a mutex and immediately reacquires it (a loop that locks per item) is already running with a hot cache, while the waiter it woke still has to be scheduled, so the running thread wins almost every time. This **barging** is great for throughput and terrible for the waiter.

- Go's `sync.Mutex` allows barging until a waiter has waited more than 1 ms, then switches to **starvation mode** and hands ownership directly to waiters in FIFO order.
- Java's `ReentrantLock(true)` grants the lock to the longest-waiting thread and is noticeably slower under contention; the default is unfair.
- Readers-writers locks can starve writers if readers keep arriving; [the interview problems lesson](/learn/systems/concurrency/concurrency-interview-problems) builds one that does not.

| Failure | Threads | CPU | Typical cause | Standard fix |
|---|---|---|---|---|
| Deadlock | Blocked forever | ~0 | Circular wait | Global lock order; detection and abort in databases |
| Livelock | Running, retrying | High | Symmetric retry without randomness | Jittered backoff, a tie-breaking rule |
| Starvation | Some progress, some never | Normal | Unfair locks, reader preference, priority | Bounded waiting, FIFO handoff, aging |

## Prevention, avoidance, detection: choosing

| Strategy | Condition broken | Where it fits | Runtime cost | What goes wrong |
|---|---|---|---|---|
| Global lock order | Circular wait | Application code you own | None | One unordered call site reintroduces the cycle |
| Acquire all at once / try-lock and back off | Hold and wait | Few locks, a real fallback exists | Retries under contention | Livelock without jitter; wasted work |
| Timeout and abort | No preemption | Work that can be rolled back | A timer per wait | Aborts innocent slow work; needs retries |
| Wait-for-graph detection | No preemption | Databases and lock managers | Graph search per long wait or per wait | Detector cost at high concurrency; victims must retry |
| Avoidance (banker's algorithm) | None; refuses unsafe grants | Systems with declared maximum needs | A safety check per grant | Needs maximum claims nobody knows |
| No shared locks (ownership, messages) | Mutual exclusion | Actor or pipeline designs | Message passing | Channel cycles can still deadlock |

## Failure modes in production

**Symptom: the service hangs at near-zero CPU once a week and recovers only on restart.** Diagnosis: a thread dump before the restart (`jstack`, `py-spy dump`, `kill -QUIT` for Go) shows two or more threads blocked in `lock()`, each holding what the next wants. Fix: a documented lock order on a stable key, enforced by a checker (lockdep, TSan, a debug-build wrapper that asserts rank order).

**Symptom: bursts of `40P01 deadlock detected` errors from the database during peak traffic.** Diagnosis: the server log records both statements in the cycle; typically two code paths update the same tables in different row or table orders. Fix: retry on `40P01` and sort the rows each transaction touches by primary key.

**Symptom: a thread pool stops completing work while every worker is alive and CPU is idle.** Diagnosis: worker stacks all show a blocking `get()` on a future submitted to the same pool. Fix: never block a pool worker on work queued to the same pool; use a separate pool, or compose asynchronously.

**Symptom: CPU at 100% and throughput at zero after adding try-lock retries.** Diagnosis: livelock: logs show the same operations retrying in lock-step. Fix: randomised exponential backoff, or return to a lock order.

**Symptom: a Rust service hangs in a cache lookup that "only locks once".** Diagnosis: the guard from a `match` scrutinee is still alive when the arm locks again. Fix: bind the lookup result in its own statement.

## Interviewer follow-ups

**"What are the conditions for deadlock, and which would you break?"** Model answer: mutual exclusion, hold and wait, no preemption, circular wait; in application code break circular wait with a global order keyed on a stable ID, in databases rely on detection and abort because transactions can roll back. Common wrong answer: listing the conditions without saying which fix breaks which, or "use timeouts everywhere".

**"Prove that ordering locks by ID prevents deadlock."** Model answer: in any supposed cycle, each thread waits for a lock ranked higher than the one the previous thread wants, so ranks strictly increase around a closed loop, a contradiction. Common wrong answer: "because threads always take locks in the same order", which restates the rule.

**"Your Go server has a partial deadlock. Why didn't the runtime report it, and how do you find it?"** Model answer: the runtime reports only when every goroutine is blocked, and the listener is not; dump goroutines with `SIGQUIT` or `pprof` and look for goroutines blocked on mutexes held by each other. Common wrong answer: "Go detects all deadlocks".

**"How would you find potential deadlocks before they happen in production?"** Model answer: record lock-order edges at runtime (held class → acquired class) and fail on a cycle, as lockdep and TSan do; run it in CI and staging. Common wrong answer: "load-test until it deadlocks".

**"When is a reentrant lock the wrong choice?"** Model answer: when re-entry means a method runs while its own invariant is half-updated; it hides the design bug that one public method calls another under the lock. Common wrong answer: "reentrant locks prevent deadlock".

## What mid-level engineers get wrong

- **Ordering locks by `hash()` or by a relocatable address.** Consequence: equal or moving ranks that reintroduce the cycle.
- **Forgetting the equal-key case.** Consequence: a self-transfer that deadlocks a thread with itself.
- **Calling listeners, loggers with locks or remote services while holding a lock.** Consequence: cycles through code you never read.
- **Retrying without jitter.** Consequence: livelock that looks like a CPU incident.
- **Aborting a thread that is blocked behind a cycle rather than on it.** Consequence: the deadlock survives the "fix".
- **Treating `40P01` as an outage.** Consequence: failed user requests for a condition the database already resolved.

## Exercises

```exercise
id: wait-for-graph
title: Find the deadlocked threads
prompt: |
  You are given a snapshot of a lock table.

  - `holds` is a list of `[thread, lock]` pairs: `thread` (an integer) currently
    holds `lock` (a string). Each lock has at most one holder; a thread may
    hold several locks.
  - `waits` is a list of `[thread, lock]` pairs: `thread` is blocked trying to
    acquire `lock`. Each thread waits for at most one lock.

  Build the wait-for graph (an edge from each waiting thread to the holder of
  the lock it wants; a lock with no holder creates no edge) and return the
  threads that lie **on a cycle**, sorted ascending. Threads that are blocked
  behind a cycle but not part of it are not included. A thread waiting for a
  lock it already holds is a cycle of length one.
languages: [python, javascript]
entry: deadlocked_threads
starter:
  python: |
    def deadlocked_threads(holds, waits):
        # 1. map each lock to its holder
        # 2. map each waiting thread to the thread it waits for
        # 3. follow the edges to find cycles
        return []
  javascript: |
    function deadlocked_threads(holds, waits) {
      // 1. map each lock to its holder
      // 2. map each waiting thread to the thread it waits for
      // 3. follow the edges to find cycles
      return [];
    }
tests:
  - args: [[[1, "A"], [2, "B"]], [[1, "B"], [2, "A"]]]
    expected: [1, 2]
    label: two threads, opposite order
  - args: [[[1, "A"], [2, "B"]], [[1, "B"]]]
    expected: []
    label: waiting is not deadlock
  - args: [[[1, "A"], [2, "B"], [3, "C"]], [[1, "B"], [2, "C"], [3, "A"]]]
    expected: [1, 2, 3]
  - args: [[[1, "A"], [2, "B"], [3, "C"]], [[1, "B"], [2, "A"], [3, "A"]]]
    expected: [1, 2]
    label: blocked behind a cycle is not on it
  - args: [[[7, "M"]], [[7, "M"]]]
    expected: [7]
    label: self-deadlock
  - args: [[[1, "A"], [2, "B"], [3, "C"], [4, "D"], [5, "E"]], [[1, "B"], [2, "A"], [3, "D"], [4, "C"], [5, "Z"]]]
    expected: [1, 2, 3, 4]
    hidden: true
    label: two independent cycles and a free lock
  - args: [[], []]
    expected: []
    hidden: true
  - args: [[[10, "X"], [20, "Y"], [30, "Z"], [40, "W"]], [[40, "X"], [10, "Y"], [20, "Z"], [30, "Y"]]]
    expected: [20, 30]
    hidden: true
hints:
  - "Because each thread waits for at most one lock, every node has at most one outgoing edge. From any start, keep following `next[thread]` until you fall off the graph or revisit a node."
  - "If the walk revisits a node that appeared earlier in this same walk, the nodes from that first appearance onward form the cycle."
  - "A dictionary from thread to its position in the current walk tells you both whether you have looped and where the loop starts."
```

```exercise
id: lock-order-inversion
title: Find potential deadlocks like lockdep
prompt: |
  `traces` holds one list of events per thread; each event is `["lock", L]`
  or `["unlock", L]`. Replay each trace on its own (no interleaving) and
  record a directed edge X → Y whenever the thread acquires Y while holding
  X. Re-acquiring a lock the thread already holds records X → X.

  Return the locks that lie on a cycle of this lock-order graph, sorted
  alphabetically. Any such cycle means some interleaving of these threads
  can deadlock with non-reentrant locks, even if no run has deadlocked yet.
languages: [python, javascript]
entry: lock_order_cycles
starter:
  python: |
    def lock_order_cycles(traces):
        edges = {}
        # 1. replay each trace, tracking held locks, adding held -> acquired edges
        # 2. return the locks that can reach themselves
        return []
  javascript: |
    function lock_order_cycles(traces) {
      const edges = new Map();
      // 1. replay each trace, tracking held locks, adding held -> acquired edges
      // 2. return the locks that can reach themselves
      return [];
    }
tests:
  - args: [[[["lock", "A"], ["lock", "B"], ["unlock", "B"], ["unlock", "A"]], [["lock", "B"], ["lock", "A"], ["unlock", "A"], ["unlock", "B"]]]]
    expected: ["A", "B"]
    label: opposite orders in two threads
  - args: [[[["lock", "A"], ["lock", "B"], ["unlock", "B"], ["unlock", "A"]], [["lock", "A"], ["lock", "B"], ["unlock", "B"], ["unlock", "A"]]]]
    expected: []
    label: same order is safe
  - args: [[]]
    expected: []
    label: no threads
  - args: [[[["lock", "A"], ["lock", "B"]], [["lock", "B"], ["lock", "C"]], [["lock", "C"], ["lock", "A"]]]]
    expected: ["A", "B", "C"]
    label: a three-lock cycle spread over three threads
  - args: [[[["lock", "A"], ["lock", "A"]]]]
    expected: ["A"]
    label: re-acquiring a held lock
  - args: [[[["lock", "A"], ["lock", "B"]], [["lock", "B"], ["lock", "C"]], [["lock", "A"], ["lock", "C"]]]]
    expected: []
    hidden: true
    label: a consistent partial order
  - args: [[[["lock", "A"], ["lock", "B"], ["lock", "C"]], [["lock", "C"], ["lock", "A"]], [["lock", "D"], ["lock", "E"]]]]
    expected: ["A", "B", "C"]
    hidden: true
  - args: [[[["lock", "A"], ["unlock", "A"], ["lock", "B"], ["unlock", "B"]], [["lock", "B"], ["lock", "A"]]]]
    expected: []
    hidden: true
    label: released before the next acquire, so no edge
hints:
  - "Keep a list of locks currently held; on each lock event add an edge from every held lock to the new one, then push it."
  - "A lock is on a cycle if a depth-first search from its successors can reach it again."
```

## Senior signals

- You name the four Coffman conditions and say which one a proposed fix breaks, and therefore how it fails (ordering needs discipline, try-lock needs jitter, abort needs rollback).
- You can trace a two-thread deadlock step by step and explain why a hot loop hits a nanosecond window in milliseconds while production takes a week.
- You default to a documented global lock order keyed on a stable ID, handle the equal-key case, and enforce the order with lockdep, TSan or a debug-build assertion.
- You know Go reports only total deadlock, and how to dump goroutines to find a partial one.
- You treat database deadlock errors as normal and retryable, know PostgreSQL checks after `deadlock_timeout` while InnoDB checks at once, and still order row updates.
- You never call foreign code while holding a lock, recognise pool starvation and channel cycles as deadlocks, and can tell deadlock, livelock and starvation apart from a CPU graph and a thread dump.

## Check yourself

```quiz
- q: >-
    Thread 1 locks A then B. Thread 2 locks B then A. Which change removes the possibility of deadlock?
  options: ["Have both threads lock A first, then B", "Add a short sleep between the two locks", "Raise thread 1's scheduling priority", "Replace both locks with reentrant locks"]
  answer: 0
  explanation: >-
    A single global order makes circular wait impossible. Reentrant locks only let the same thread re-acquire a lock it already holds; they do nothing for a cycle between two threads. A sleep widens the deadlock window rather than closing it, and priority does not force anyone to release a lock.
- q: >-
    A Go HTTP service has two goroutines deadlocked on each other's mutexes, but the runtime never prints "all goroutines are asleep". Why?
  options: ["Go detects deadlocks on channels only, never on mutexes", "Deadlock detection is off unless GODEBUG enables it", "The check needs every goroutine blocked; the listener is not", "The race detector is disabled, and it reports deadlocks"]
  answer: 2
  explanation: >-
    The built-in check is global: it fires only when no goroutine can ever run again. Any healthy goroutine, such as the HTTP listener waiting for connections, means the process is not globally deadlocked, so partial deadlocks are silent whether they involve mutexes or channels. Dump goroutine stacks (SIGQUIT or pprof) to find them.
- q: >-
    Two threads use try-lock with a fixed 10 ms retry delay to acquire two locks in opposite orders. Monitoring shows 100% CPU and zero completed operations. What is this and what fixes it?
  options: ["A data race; guard the retry loop with a mutex", "Livelock; add random jitter to the retry delay", "Deadlock; impose a global lock acquisition order", "Starvation; switch to a fair FIFO-ordered lock"]
  answer: 1
  explanation: >-
    Nobody is blocked forever; they are all actively retrying in lock-step, which is livelock. Randomised backoff breaks the symmetry so one thread eventually gets both locks. A lock order would also fix it, but the symptom (busy, no progress) is livelock, not deadlock, which shows near-zero CPU.
- q: >-
    lockdep reports a possible deadlock between locks A and B on a kernel that has never actually hung. What did it observe?
  options: ["Lock A was released by a thread that never acquired it", "Two threads were blocked on A and B at the same instant", "Both locks were held for longer than the hung-task timeout", "One path took B while holding A, and another took A while holding B"]
  answer: 3
  explanation: >-
    lockdep records held-class to acquired-class edges the first time each pair is seen, and reports when a new edge closes a cycle in that graph. The two orders may have run hours apart on different CPUs; the report means some interleaving can deadlock, not that one happened. Long hold times, simultaneous blocking and wrong-owner releases are different checks.
- q: >-
    A payment transaction fails in production with PostgreSQL error 40P01 (deadlock detected). What is the right response in the application?
  options: ["Retry it, and always update rows in a consistent order", "Raise deadlock_timeout so the database waits longer first", "Switch the transaction to READ UNCOMMITTED isolation", "Report the payment as failed to the user and move on"]
  answer: 0
  explanation: >-
    PostgreSQL has already broken the cycle by aborting this transaction, and the other one proceeded. Retrying is correct and expected, and a consistent row order makes recurrences rare. A longer deadlock_timeout only delays detection, isolation level does not remove row-lock cycles, and failing the payment surfaces a transient condition as a user error.
- q: >-
    In a wait-for graph, T4 waits for T1, T1 waits for T2, T2 waits for T3 and T3 waits for T2. A detector must abort one thread. Which choices actually resolve the deadlock?
  options: ["None; the detector has to abort all four threads", "Only T2 or T3, the two members of the cycle", "T1 or T4, because they have waited the longest", "Any of the four, since all of them are stuck"]
  answer: 1
  explanation: >-
    The cycle is T2 and T3. Aborting T1 or T4 releases their locks but leaves the cycle intact, so T2 and T3 (and whoever waits behind them) stay stuck. Aborting either cycle member lets the other proceed, and the threads behind it follow.
```
