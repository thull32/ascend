---
slug: deadlock
title: "Deadlock, livelock and starvation"
description: The four conditions for deadlock, why a global lock order fixes most of them, how databases detect cycles in a wait-for graph, and the retry loops that turn deadlock into livelock.
minutes: 30
difficulty: medium
tags: [concurrency, deadlock, lock-ordering, livelock, starvation, wait-for-graph, coffman-conditions]
---
Once a week, usually in the small hours, your order service stops responding. CPU drops to zero. Health checks time out, the orchestrator restarts the pod, and everything is fine for another week. When someone finally captures a thread dump before the restart, it shows two threads, each parked inside `lock()`, each holding the lock the other one wants. Nobody will ever release anything, because releasing is the next line of code after the acquisition that will never return.

That is a **deadlock**: a set of threads, each waiting for something only another member of the set can provide. It is the characteristic failure of lock-based code, and it has two siblings that look different on a dashboard but share a root cause: **livelock** (everyone is busy, nobody progresses) and **starvation** (somebody never gets a turn). This lesson covers how each one arises, the conditions you can break to make deadlock impossible, and how databases detect it when prevention is not an option.

## The anatomy of a deadlock

Here is the textbook version, which is also the production version. `transfer` locks the source account, then the destination:

```go
type Account struct {
    id      int
    mu      sync.Mutex
    balance int
}

func transfer(from, to *Account, amount int) {
    from.mu.Lock()
    defer from.mu.Unlock()
    to.mu.Lock() // T1 holds A and wants B; T2 holds B and wants A
    defer to.mu.Unlock()
    from.balance -= amount
    to.balance += amount
}

// Goroutine 1: transfer(alice, bob, 10)
// Goroutine 2: transfer(bob, alice, 5)
```

If goroutine 1 locks Alice's account and goroutine 2 locks Bob's before either reaches its second `Lock`, each waits forever for the other. Step through it with three threads and three locks, each thread taking "its" lock and then its neighbour's:

```viz
{"type": "concurrency", "algorithm": "deadlock", "threads": 3,
 "title": "Circular wait with three threads",
 "caption": "Each thread holds one lock and requests the next thread's. The wait-for graph is a cycle, so no thread can proceed and none will release."}
```

Why does it happen only once a week? Because the window is tiny. Both threads must be between their first and second `Lock` at the same moment, a window of maybe 50 nanoseconds per transfer. At low traffic and with opposite-direction transfers being rare, the product of those probabilities is small. It is not zero, and it grows with traffic, core count and anything that lengthens the window (a log line between the two locks, a page fault, a preemption). Deadlocks that "never happen in staging" are deadlocks whose window staging traffic has not hit yet.

## The four conditions

Coffman and colleagues showed in 1971 that a deadlock requires four conditions to hold at once. Remove any one and deadlock is impossible. That turns a vague fear into a design checklist:

| Condition | What it means | How to break it | Cost of breaking it |
|---|---|---|---|
| **Mutual exclusion** | A resource can be held by only one thread | Avoid exclusive resources: immutable data, per-thread copies, lock-free structures | Often impossible for mutable shared state |
| **Hold and wait** | A thread holds one resource while waiting for another | Acquire everything at once, or try-lock and release everything on failure | Retry loops, risk of livelock |
| **No preemption** | Nobody can take a resource away from its holder | Timeouts; a supervisor aborts a victim and rolls it back | Needs rollback, which only transactions have |
| **Circular wait** | There is a cycle of threads each waiting on the next | Impose a global order on lock acquisition | Discipline across the whole codebase |

In application code, breaking **circular wait** with a lock order is the default. Databases break **no preemption**: they let the deadlock happen, detect it, and abort a victim. Retry-based designs break **hold and wait**. Knowing which condition a fix attacks is what lets you predict its failure mode.

## Lock ordering: the fix that scales

Give every lock a rank and always acquire locks in increasing rank. For the bank, the account ID is a natural rank:

```go
func transfer(a, b *Account, amount int) {
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

Why this cannot deadlock: suppose there were a cycle of waiting threads T1 → T2 → … → T1. Each thread waits for a lock whose rank is higher than every lock it already holds, including the one the previous thread in the cycle wants. Walk around the cycle and the ranks strictly increase at every step, yet you arrive back where you started. A strictly increasing sequence cannot return to its start, so no cycle exists.

Two details separate a correct implementation from a nearly correct one:

- **Equal ranks.** `transfer(x, x, 10)` locks the same non-reentrant mutex twice and deadlocks the thread with itself. Handle the equal case explicitly.
- **Unstable ranks.** Ordering by memory address works in C and Go (the address of a heap object does not move), but not for objects a compacting garbage collector may relocate, and never by `hash()` when two objects can hash equally. Use a stable, unique ID.

In a large codebase, a single rank per lock generalises into a **lock hierarchy**: "the session lock is level 1, the cache lock is level 2; you may take level 2 while holding level 1, never the reverse." Write the hierarchy down next to the locks. Better, let a tool check it:

- The Linux kernel's **lockdep** records every order in which it has seen locks taken and warns the first time an inversion becomes *possible*, without needing the deadlock to actually occur.
- **ThreadSanitizer** in C and C++ (`-fsanitize=thread`) reports `lock-order-inversion (potential deadlock)` the same way. Go's `-race` is built on the same runtime but reports only data races.
- Java's `jstack` prints `Found one Java-level deadlock` with the cycle; `ThreadMXBean.findDeadlockedThreads()` exposes the same check programmatically.
- Go's runtime detects a deadlock only when *every* goroutine is blocked (`fatal error: all goroutines are asleep - deadlock!`). A server with an idle HTTP listener goroutine never qualifies, so partial deadlocks are silent. Send `SIGQUIT` or hit the `pprof` goroutine endpoint to dump every goroutine's stack and look for them.

### Self-deadlock and reentrancy

The simplest deadlock needs one thread. Python's `threading.Lock`, Go's `sync.Mutex` and Rust's `std::sync::Mutex` are all non-reentrant: a thread that already holds the lock and calls `lock()` again waits for itself forever (Rust documents that the second call "might panic or deadlock"). It usually happens when one method that takes the lock calls another method that also takes it. The common conventions are to lock only in public methods and have private helpers assume the lock is held (Go code often names them `fooLocked`), or to use a reentrant lock (`threading.RLock`, Java's `ReentrantLock`). Reentrant locks are convenient but they hide the fact that a method is being called with the invariant possibly half-updated, which is why Go deliberately does not provide one.

Rust adds a twist: a lock guard lives as long as the temporary that holds it, and temporaries in a `match` scrutinee live until the end of the `match`:

```rust
match cache.lock().unwrap().get(&key) {
    Some(v) => v.clone(),
    None => {
        let v = compute(&key);
        cache.lock().unwrap().insert(key, v.clone()); // the scrutinee's guard is still alive: self-deadlock
        v
    }
}
```

The borrow checker is satisfied, because both borrows are shared borrows of the `Mutex`. The fix is to bind the lookup result first (`let hit = cache.lock().unwrap().get(&key).cloned();`) so the guard drops at the end of that statement. Rust's guarantees stop at data races; lock discipline is still yours.

## Deadlock without mutexes

Anything that can make a thread wait for another thread can close a cycle:

- **Channels.** Two goroutines that each send on an unbuffered channel the other one will only read after its own send completes. Or a pipeline where the consumer stops reading on error and the producer blocks forever on its next send (see [Actors, channels and CSP](/learn/systems/concurrency/actors-channels-and-csp)).
- **Thread pools.** A task running on a pool of 4 threads submits a subtask to the same pool and waits for its result. With 4 such tasks running, all 4 workers wait for subtasks that sit in the queue with no worker to run them. [Thread pools](/learn/systems/concurrency/thread-pools-and-work-stealing) covers this starvation deadlock.
- **Databases.** Transaction 1 updates row 17 then row 42; transaction 2 updates row 42 then row 17. Row locks form the same cycle as the bank accounts.
- **Callbacks under a lock.** An object notifies listeners while holding its lock; a listener calls back into the object, or takes a lock that another thread holds while waiting for the object. The rule, sometimes called making **open calls**, is never to call code you do not control while holding a lock: copy what you need, release, then call.
- **Priority inversion.** Not strictly a deadlock, but the same shape: a low-priority task holds a mutex that a high-priority task needs, and medium-priority tasks keep the low-priority one from running. The Mars Pathfinder lander hit this in 1997 and kept resetting until engineers enabled priority inheritance on the mutex, which temporarily raises the holder to the waiter's priority.

## Detection: cycles in the wait-for graph

Prevention requires discipline over code you control. When you do not control the order (a database executing arbitrary transactions), the alternative is to let deadlocks happen and detect them.

Build a **wait-for graph**: one node per thread (or transaction), and an edge T → U when T is blocked on a resource U holds. A deadlock exists exactly when the graph has a cycle. With plain mutexes, each blocked thread waits on one lock with one holder, so every node has at most one outgoing edge; following edges from any thread either reaches a running thread or loops. The loop is the deadlock.

```viz
{"type": "graph", "algorithm": "cycle-detect", "directed": true,
 "nodes": [{"id": "T1"}, {"id": "T2"}, {"id": "T3"}, {"id": "T4"}],
 "edges": [{"from": "T4", "to": "T1"}, {"from": "T1", "to": "T2"}, {"from": "T2", "to": "T3"}, {"from": "T3", "to": "T2"}],
 "title": "A wait-for graph with one cycle",
 "caption": "T2 and T3 wait for each other: that cycle is the deadlock. T1 and T4 are blocked behind it but are not part of it, so aborting either of them does not break the deadlock."}
```

The figure makes a point people miss in incident reviews. T4 waits for T1 and T1 waits for T2, so all four threads are stuck, but only T2 and T3 are *deadlocked*. Aborting T1 releases T1's locks, which lets T4 proceed, but T2 and T3 stay stuck forever. A detector has to break the cycle itself.

This is exactly what databases do:

- **PostgreSQL** does not check on every lock wait, because building a consistent snapshot of the lock table is expensive and most waits resolve quickly. A backend that has waited longer than `deadlock_timeout` (1 second by default) searches the wait-for graph. If it finds a cycle, it aborts one transaction with `ERROR: deadlock detected` (SQLSTATE `40P01`) and the others proceed.
- **MySQL InnoDB** checks immediately when a transaction starts waiting and rolls back the transaction it judges cheapest to undo. Under very high concurrency the detection itself becomes a bottleneck, so it can be disabled (`innodb_deadlock_detect`), falling back to a lock-wait timeout.

Recovery requires rollback, which is why detection-and-abort is a database strategy and lock ordering is an application strategy. Two consequences for application code that talks to a database: every transaction that can deadlock must be **retried** on `40P01` (it is a normal, expected error, not an outage), and you should still update rows in a consistent order (for example, sorted by primary key) so the retries are rare. The same ideas at the storage layer are in [MVCC and locking](/learn/databases/relational-fundamentals/mvcc-and-locking), and the graph algorithm is the one from [connectivity and cycles](/learn/data-structures/graphs/connectivity-and-cycles) and [Course Schedule](/practice/course-schedule).

## Timeouts and try-lock: breaking hold-and-wait

The other practical fix is to refuse to wait while holding something. Take the first lock, *try* the second, and if that fails, release everything and start again:

```python
import random
import threading
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

This breaks hold-and-wait, so it cannot deadlock. It can **livelock**. Remove the random sleep and picture two threads transferring in opposite directions: both take their first lock, both fail on their second, both release, both retry at the same instant, and they repeat forever. CPU is at 100%, every thread is "running", and no transfer completes. It is two people in a corridor stepping aside in the same direction. Randomised backoff breaks the symmetry, and exponential backoff with jitter keeps retries from synchronising under load, the same technique covered for network calls in [timeouts, retries and backoff](/learn/networking/networking-in-practice/timeouts-retries-and-backoff).

Go added `TryLock` to `sync.Mutex` in 1.18 with documentation that discourages its use, and Rust has `try_lock`; both are the right tool when you genuinely have a fallback, not as a routine replacement for ordering. The most valuable production use of timeouts is diagnostic: `lock.acquire(timeout=30)` that raises with a stack trace turns a silent hang into an error you can alert on.

## Starvation and fairness

A thread **starves** when it could proceed but never gets the chance, because other threads keep winning. It is subtler than deadlock because the system as a whole makes progress and the averages look fine; only the tail is broken.

The usual cause is an unfair lock. When a thread releases a mutex and immediately tries to reacquire it (a loop that locks per item), it is already running on a core with a hot cache, while the waiter it woke still has to be scheduled. The running thread wins almost every time. This **barging** is great for throughput and terrible for the waiter's latency. Implementations take different positions:

- Go's `sync.Mutex` normally allows barging, but if a waiter has been waiting for more than 1 ms the mutex switches to **starvation mode** and hands ownership directly to waiters in FIFO order until the queue drains.
- Java's `ReentrantLock(true)` grants the lock to the longest-waiting thread, and is noticeably slower under contention; the default is unfair.
- Readers-writers locks can starve writers if readers keep arriving; [the interview problems lesson](/learn/systems/concurrency/concurrency-interview-problems) builds one that does not.

| Failure | Threads | CPU | Typical cause | Standard fix |
|---|---|---|---|---|
| Deadlock | Blocked forever | ~0 | Circular wait | Global lock order; detection and abort in databases |
| Livelock | Running, retrying | High | Symmetric retry without randomness | Jittered backoff, a tie-breaking rule |
| Starvation | Some progress, some never | Normal | Unfair locks, reader preference, priority | Bounded waiting, FIFO handoff, aging |

## Exercise: find the deadlock

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

## Senior signals

- You can name the four Coffman conditions and say which one a proposed fix breaks, and therefore how it fails (ordering needs discipline, try-lock needs jitter, abort needs rollback).
- You default to a documented global lock order keyed on a stable ID, and you handle the equal-ID case.
- You know which tools find potential deadlocks before they happen (lockdep, TSan's lock-order-inversion) and that Go's runtime only reports a deadlock when every goroutine is blocked.
- You treat database deadlock errors as normal and retryable, and still order row updates consistently to keep them rare.
- You never call foreign code while holding a lock, and you recognise pool starvation and channel cycles as deadlocks too.
- You can tell deadlock, livelock and starvation apart from a CPU graph and a thread dump.

## Check yourself

```quiz
- q: >-
    Thread 1 locks A then B. Thread 2 locks B then A. Which change removes the possibility of deadlock?
  options: ["Replace both locks with reentrant locks", "Make both threads lock A before B", "Add a short sleep between the two acquisitions", "Raise thread 1's priority"]
  answer: 1
  explanation: >-
    A single global order makes circular wait impossible. Reentrant locks only let the same thread re-acquire a lock it already holds; they do nothing for a cycle between two threads. A sleep widens the deadlock window rather than closing it, and priority does not force anyone to release a lock.
- q: >-
    A Go HTTP service has two goroutines deadlocked on each other's mutexes, but the runtime never prints "all goroutines are asleep". Why?
  options: ["Go cannot detect mutex deadlocks, only channel deadlocks", "The runtime reports a deadlock only when every goroutine is blocked, and the HTTP listener goroutine is not", "The race detector suppresses the message", "Deadlock detection requires GODEBUG to be set"]
  answer: 1
  explanation: >-
    The built-in check is global: it fires when no goroutine can ever run again. Any healthy goroutine, such as one waiting for new connections, means the process is not globally deadlocked, so partial deadlocks are silent. Dump goroutine stacks (SIGQUIT or pprof) to find them.
- q: >-
    Two threads use try-lock with a fixed 10 ms retry delay to acquire two locks in opposite orders. Monitoring shows 100% CPU and zero completed operations. What is this and what fixes it?
  options: ["Deadlock; add a lock order", "Livelock; add random jitter to the retry delay", "Starvation; use a fair lock", "A data race; add a mutex"]
  answer: 1
  explanation: >-
    Nobody is blocked forever, they are all actively retrying in lock-step: livelock. Randomised backoff breaks the symmetry so one thread eventually gets both locks. A lock order would also fix it, but the question's symptom (busy, no progress) is livelock, not deadlock, which shows near-zero CPU.
- q: >-
    A payment transaction fails in production with PostgreSQL error 40P01 (deadlock detected). What is the right response in the application?
  options: ["Increase deadlock_timeout so the database waits longer before giving up", "Retry the transaction, and update rows in a consistent order to make recurrences rare", "Switch the transaction to READ UNCOMMITTED", "Catch the error and report the payment as failed to the user"]
  answer: 1
  explanation: >-
    Postgres has already broken the cycle by aborting your transaction; the other one proceeded. Retrying is correct and expected. A longer deadlock_timeout only delays detection, isolation level does not remove row-lock cycles, and failing the payment surfaces a transient condition as a user error.
- q: >-
    In a wait-for graph, T4 waits for T1, T1 waits for T2, T2 waits for T3 and T3 waits for T2. A detector must abort one thread. Which choices actually resolve the deadlock?
  options: ["T1 or T4, because they are the oldest waiters", "Only T2 or T3", "Any of the four", "None; the detector must abort all four"]
  answer: 1
  explanation: >-
    The cycle is T2 and T3. Aborting T1 or T4 releases their locks but leaves the cycle intact, so T2 and T3 (and whoever waits behind them) stay stuck. Aborting either cycle member lets the other proceed, and the threads behind it follow.
```
