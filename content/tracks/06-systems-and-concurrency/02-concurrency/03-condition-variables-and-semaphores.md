---
slug: condition-variables-and-semaphores
title: "Condition variables and semaphores: waiting correctly"
description: How to make a thread sleep until state changes without burning CPU or missing the wake-up, how condition variables are built on futexes and per-waiter locks, why the wait goes in a while loop (measured), when notify_one is wrong, what a thundering herd costs, and what semaphores count.
minutes: 30
difficulty: medium
tags: [concurrency, condition-variable, semaphore, bounded-buffer, producer-consumer, spurious-wakeup, lost-wakeup]
problems: [design-circular-queue]
---
A background worker pulls jobs from an in-memory queue. The first version loops `while not queue: time.sleep(0.01)`. It works, but every idle worker wakes a hundred times a second, a job that arrives waits up to 10 ms for no reason, and when someone "fixes" the latency by removing the sleep, forty idle workers pin forty cores at 100%. The second version replaces the sleep with a flag and a lock, and once every few days a worker sleeps forever with a job sitting in the queue.

Waiting for a *lock* and waiting for a *condition* are different problems. A mutex lets you wait until nobody else is in the critical section. It cannot make you wait until "the queue is non-empty" or "fewer than ten requests are in flight". That needs a primitive that puts a thread to sleep until another thread changes shared state, without ever missing the change. The two classic answers are condition variables and semaphores, and their bugs are specific enough to be interview questions. Measurements below used CPython 3.14 on a 16-core Ryzen 9 9950X3D under WSL2.

## What polling costs

Measured with 40 idle worker threads for two seconds, then a producer handing items to one consumer every 0.5 ms:

| Waiting strategy | CPU while idle (40 workers) | Hand-off latency p50 | p99 |
|---|---|---|---|
| Poll, `sleep(0.01)` | 5.3% of a core | ≈5 ms (half the interval, derived) | ≈10 ms (derived) |
| Poll, `sleep(0.001)` | higher still | 549 µs | 1,071 µs |
| `threading.Condition` | 0.0% | 33 µs | 64 µs |

Polling trades CPU for latency and gets neither: halve the interval and you double the idle cost to halve the delay. A condition variable costs nothing while idle, and its 33 µs is the price of waking a thread on another CPU of this virtual machine.

## The lost wake-up

Here is the naive design, written with two primitive operations: `park()` puts the calling thread to sleep and `unpark_all()` wakes every thread currently parked. The consumer checks under the lock and parks if the queue is empty; the producer appends and wakes sleepers:

```python
def consume():
    while True:
        with lock:
            if queue:
                return queue.popleft()
        park()                   # sleep until a producer wakes us

def produce(item):
    with lock:
        queue.append(item)
    unpark_all()
```

The gap between releasing the lock and parking is fatal:

| Step | Consumer | Producer | Queue |
|---|---|---|---|
| 1 | lock, sees empty, unlock | | [] |
| 2 | | lock, append job, unlock | [job] |
| 3 | | wake sleepers: nobody is asleep yet | [job] |
| 4 | parks | | [job] |

The signal arrived before anyone was listening and vanished. The consumer sleeps until the next job, possibly forever. This is the **lost wake-up**, and the fix is to make "release the lock" and "go to sleep" a single atomic step with respect to notifications. That is the contract of a condition variable.

## The condition variable contract

A condition variable is a **wait queue attached to a mutex**, with three operations:

- `wait()`: atomically release the mutex and sleep on the queue. When woken, reacquire the mutex before returning.
- `notify()` (signal): wake one sleeping thread, if there is one.
- `notify_all()` (broadcast): wake every sleeping thread.

Notifications are not stored: a `notify()` with nobody waiting does nothing. That is fine, because the condition variable is not the condition. The condition is a **predicate over your shared data** ("the queue is non-empty"), protected by the mutex, and the thread always checks it itself. The condition variable only says "something may have changed; look again". One pattern follows, which you should be able to write without thinking:

```python
# Waiting side
with cond:                      # cond = threading.Condition(lock)
    while not predicate():      # while, never if
        cond.wait()
    act_on_state()              # predicate is true and you hold the lock

# Changing side
with cond:
    change_state()              # make the predicate true
    cond.notify()
```

```viz
{"type": "concurrency", "algorithm": "condition-variable", "threads": 3,
 "title": "Two consumers sleep until a producer changes the predicate",
 "caption": "Each consumer checks the predicate under the mutex; wait() releases the mutex and sleeps in one atomic step. The producer changes the state under the mutex and notifies; a woken consumer reacquires the mutex and checks the predicate again."}
```

## Under the hood: how "atomic release and sleep" is built

No implementation literally releases and sleeps in one instruction. Each closes the gap by making the wake-up *stick* even if it arrives before the sleep.

**CPython's `threading.Condition`** builds it from locks, in pure Python. `wait()` allocates a fresh lock, acquires it once, appends it to the condition's `_waiters` deque, releases the outer lock, then calls `acquire()` on its private lock a second time, which blocks. `notify(n)` releases the first `n` private locks in the deque. Trace the dangerous interleaving from the table above:

1. Consumer, holding the outer lock, sees the queue empty: allocates private lock W, acquires it, appends W to `_waiters`.
2. Consumer releases the outer lock. It has not blocked yet.
3. Producer takes the outer lock, appends the job, calls `notify()`: releases W, removes it from `_waiters`.
4. Consumer calls `W.acquire()`. W is already unlocked, so it returns at once. The wake-up was not lost, because it was stored in W's state.
5. Consumer reacquires the outer lock and rechecks the predicate: one job.

The private lock is a one-shot binary semaphore, and registering it *before* releasing the outer lock is the whole trick. It also means Python wakes waiters in FIFO order.

**Rust's `Condvar` on Linux** uses a futex holding a sequence counter. `wait` reads the counter while still holding the mutex, unlocks the mutex, then calls `futex_wait(counter, value_read)`. `notify_one` increments the counter and calls `futex_wake`. If a notify slips in between the unlock and the syscall, the counter no longer equals the value read, and the kernel's check-then-sleep (the same check that made the mutex safe in the [races lesson](/learn/systems/concurrency/races-mutexes-and-invariants)) returns immediately. **glibc's `pthread_cond_t`** applies the same idea with more machinery (two groups of waiters and sequence numbers, rewritten in glibc 2.25) to keep wake-ups ordered. **Go's `sync.Cond`** hands each waiter a ticket number from a `notifyList`; `Signal` wakes the lowest outstanding ticket.

## Why the wait goes in a `while` loop

A thread returning from `wait()` knows only that it was woken, not that the predicate is true. Three separate reasons it might not be:

**Stolen wake-ups.** Almost every real condition variable uses *Mesa semantics* (named after the Xerox language that popularised them): `notify()` makes a waiter runnable, but it must still reacquire the mutex, and any thread can get there first. With two consumers and an empty queue:

1. C1 waits.
2. The producer appends item 1 and notifies. C1 becomes runnable but has not run.
3. C2 arrives, takes the mutex, sees item 1 without ever waiting, and removes it.
4. C1 reacquires the mutex. The queue is empty.

With `if not queue: cond.wait()`, C1 now calls `popleft()` on an empty deque. Measured: four consumers draining 200,000 items with `if` raised `IndexError` 4 times; with `while`, zero. Four in 200,000 is exactly the rate that passes every test and fails in production. The alternative, *Hoare semantics*, hands the mutex directly from notifier to waiter so the predicate is guaranteed, at the cost of an extra context switch per signal, which is why production systems do not use it.

**Spurious wake-ups.** POSIX allows `pthread_cond_wait` to return when nobody signalled, and Java, Rust and C++ document the same possibility; it lets implementations avoid expensive guarantees (for example when a signal interrupts the underlying futex wait).

**Shared condition variables.** If several predicates share one condition variable, or someone used `notify_all()`, you may have been woken for someone else's change.

The loop is so universal that libraries offer it directly: Python's `cond.wait_for(lambda: queue)`, Rust's `Condvar::wait_while`, C++'s `cv.wait(lock, pred)`. Prefer them; they make the wrong version impossible to write.

## notify versus notify_all

`notify_all()` is always correct and sometimes slow. Measured with 64 waiting consumers and 20,000 items published one at a time: `notify()` took 96 µs per item with 20,064 wake-ups in total; `notify_all()` took 1,612 µs per item with 593,630 wake-ups, 573,566 of them futile (a thread woke, reacquired the mutex, found nothing and slept again). That is a **thundering herd**: about 29 wasted wake-ups and 17 times the latency per item.

`notify()` is safe only when every waiter waits for the same predicate and any single waiter can consume the change. The classic violation is a bounded buffer with one condition variable shared by producers ("not full") and consumers ("not empty"). Capacity 1, one producer P, two consumers:

1. C1 and C2 find the buffer empty and wait. Waiters: C1, C2.
2. P puts an item (full), notifies (wakes C1), tries to put again, finds it full, waits. Waiters: C2, P.
3. C1 takes the item and notifies, intending P. The condition variable wakes C2. C1 loops, finds it empty, waits. Waiters: P, C1.
4. C2 wakes, finds the buffer empty, waits. Waiters: P, C1, C2.

Everyone sleeps, the buffer has room, and the only thread that could fill it was never told. The fixes are two condition variables sharing one mutex (`not_full` for producers, `not_empty` for consumers, each notified only when its predicate may have become true) or `notify_all()`. Two condition variables is the standard answer.

### Notify inside or outside the lock?

Both are correct under Mesa semantics, as long as the *state change* happens under the lock. Notifying after unlocking can avoid a woken thread immediately blocking on the mutex the notifier still holds; some implementations optimise the in-lock case by moving the waiter straight onto the mutex's queue. Python raises `RuntimeError` if you notify without holding the lock; Go and Rust allow either. Default to notifying under the lock and move it only if a profile says so.

## A bounded buffer, three ways

The bounded buffer (producer-consumer queue) blocks producers when full, which is how a slow consumer pushes back on a fast producer instead of letting memory grow without limit.

```python
import threading
from collections import deque

class BoundedQueue:
    def __init__(self, capacity):
        self._items = deque()
        self._capacity = capacity
        lock = threading.Lock()
        self._not_empty = threading.Condition(lock)   # two conditions,
        self._not_full = threading.Condition(lock)    # one shared mutex

    def put(self, item):
        with self._not_full:
            while len(self._items) >= self._capacity:
                self._not_full.wait()
            self._items.append(item)
            self._not_empty.notify()                  # a consumer can proceed

    def get(self):
        with self._not_empty:
            while not self._items:
                self._not_empty.wait()
            item = self._items.popleft()
            self._not_full.notify()                   # a producer can proceed
            return item
```

This is essentially what `queue.Queue(maxsize=n)` does internally: one mutex and several conditions over it. In Rust the data lives inside the mutex and `wait_while` owns the loop:

```rust
use std::collections::VecDeque;
use std::sync::{Condvar, Mutex};

pub struct BoundedQueue<T> {
    items: Mutex<VecDeque<T>>,
    not_empty: Condvar,
    not_full: Condvar,
    capacity: usize,
}

impl<T> BoundedQueue<T> {
    pub fn new(capacity: usize) -> Self {
        Self { items: Mutex::new(VecDeque::new()), not_empty: Condvar::new(), not_full: Condvar::new(), capacity }
    }

    pub fn put(&self, item: T) {
        let guard = self.items.lock().unwrap();
        let mut items = self.not_full.wait_while(guard, |q| q.len() >= self.capacity).unwrap();
        items.push_back(item);
        self.not_empty.notify_one();
    }

    pub fn take(&self) -> T {
        let guard = self.items.lock().unwrap();
        let mut items = self.not_empty.wait_while(guard, |q| q.is_empty()).unwrap();
        let item = items.pop_front().unwrap(); // safe: the predicate guaranteed an item
        self.not_full.notify_one();
        item
    }
}
```

In Go you rarely write this at all: a buffered channel, `make(chan Job, 100)`, *is* a bounded blocking queue. `sync.Cond` cannot be combined with `select`, a timeout or a `context.Context`, so Go code uses channels for waiting and reserves `sync.Cond` for broadcast-to-many.

```viz
{"type": "concurrency", "algorithm": "producer-consumer", "threads": 4, "capacity": 2,
 "title": "Producers block when the buffer is full, consumers when it is empty",
 "caption": "Two producers and two consumers share a buffer of capacity 2. A full buffer parks producers on not_full; each take notifies one of them. This is backpressure: the slow side sets the pace."}
```

The array behind the queue is usually a ring buffer; [Design Circular Queue](/practice/design-circular-queue) is the single-threaded half of this problem.

## Semaphores

A semaphore (Dijkstra, 1960s) is an integer count with two atomic operations: `acquire()` (P, down) decrements if positive and otherwise blocks until it is; `release()` (V, up) increments and wakes one waiter. The crucial difference from a condition variable is that **a semaphore remembers**: a `release()` with nobody waiting raises the count, and the next `acquire()` goes straight through. A lost wake-up is impossible by construction, because the count *is* the state. (Python's `threading.Semaphore` is itself a `Condition` plus a counter, the pattern above applied to "count > 0".)

**Bounding concurrency.** N permits admit at most N threads: 10 database connections, 20 in-flight calls to a partner API, 4 parallel image resizes.

```viz
{"type": "concurrency", "algorithm": "semaphore", "threads": 5, "permits": 2,
 "title": "Five threads, two permits",
 "caption": "At most two threads hold a permit at any time. Each release hands a permit to the next waiter. This is how connection pools and concurrency limits work."}
```

**Signalling.** A semaphore starting at 0 lets one thread wait for another: B calls `acquire()` and blocks; A calls `release()` when its work is done. The releasing thread never acquired anything, and that is the point; the "print in order" problem in [the interview problems lesson](/learn/systems/concurrency/concurrency-interview-problems) is solved this way.

### A bounded buffer with semaphores, and the ordering trap

```python
import threading
from collections import deque

capacity = 8
buffer = deque()
empty_slots = threading.Semaphore(capacity)   # counts free slots
full_slots = threading.Semaphore(0)           # counts items
mutex = threading.Lock()                      # protects the deque itself

def put(item):
    empty_slots.acquire()        # wait for space BEFORE taking the mutex
    with mutex:
        buffer.append(item)
    full_slots.release()

def get():
    full_slots.acquire()
    with mutex:
        item = buffer.popleft()
    empty_slots.release()
    return item
```

Swap the first two lines of `put` and the buffer deadlocks the first time it fills: a producer sleeps on `empty_slots` while holding `mutex`, and the consumer that would free a slot needs `mutex` to take an item. The general rule: **never block waiting for another thread while holding a lock that thread needs.**

### A binary semaphore is not a mutex

A semaphore with one permit admits one thread at a time, which looks like a mutex. It is not, because it has no **owner**: any thread can release it. So there is no priority inheritance (the kernel does not know whom to boost), no detection of "unlocked by the wrong thread", and no protection against double release: a bug that releases twice raises the count to 2 and lets two threads into your "critical section". Python's `BoundedSemaphore` raises `ValueError` on an over-release for exactly this reason; the second exercise replays it.

## Choosing a waiting primitive

| Primitive | Remembers a signal sent before the wait? | Wakes | Holds state | Typical use | Classic bug |
|---|---|---|---|---|---|
| Polling with sleep | Yes (state is polled) | Itself, every interval | Your data | Nothing new; legacy code | Latency or CPU, never both good |
| Condition variable | No; the predicate does | One or all waiters | Your data plus predicate | Complex predicates over shared state | `if` instead of `while`; wrong waiter notified |
| Counting semaphore | Yes, in the count | One waiter per release | A count | Concurrency limits, slot counting | Permit leaked on an exception path |
| Event / latch | Yes, once set | All waiters | A flag | "It happened" (start-up, shutdown) | Reusing it as a repeating signal |
| Channel | Buffered: yes, up to capacity | One receiver | The messages | Handing work between threads | Unbounded channels hiding overload |

By language:

| Need | Python | Go | Rust |
|---|---|---|---|
| Wait for a predicate | `threading.Condition` + `wait_for` | `sync.Cond` (rare); usually a channel | `std::sync::Condvar` + `wait_while` |
| Bound concurrency | `threading.Semaphore`, `asyncio.Semaphore` | buffered channel; `golang.org/x/sync/semaphore` | `tokio::sync::Semaphore` (std has none) |
| Bounded blocking queue | `queue.Queue(maxsize=n)` | buffered channel | `std::sync::mpsc::sync_channel(n)`, crossbeam |
| One-off "it happened" | `threading.Event` | `close(done)` | a channel, or `tokio::sync::Notify` |

The Go semaphore idiom shows that a buffered channel's capacity *is* a permit count:

```go
package fetcher

import "sync"

func fetchAll(urls []string, fetch func(string)) {
	sem := make(chan struct{}, 10) // at most 10 concurrent fetches
	var wg sync.WaitGroup
	for _, url := range urls {
		sem <- struct{}{} // acquire: blocks while 10 are in flight
		wg.Add(1)
		go func(u string) {
			defer wg.Done()
			defer func() { <-sem }() // release, even if fetch panics
			fetch(u)
		}(url)
	}
	wg.Wait()
}
```

## Failure modes in production

**Symptom: idle workers consume measurable CPU and queue latency has a floor equal to a sleep interval.** Diagnosis: a polling loop (`while not q: sleep(...)`), visible in a profile as time in `sleep` and lock acquisition. Fix: a condition variable or a blocking queue.

**Symptom: a worker occasionally sleeps forever with work queued; restarting it "fixes" it.** Diagnosis: a hand-rolled flag-plus-wait with a lost wake-up, or a waiter blocked on one condition while the notifier signals another. Fix: the standard pattern with the predicate checked under the mutex, or `queue.Queue`.

**Symptom: rare `IndexError`, `NoSuchElementException` or a null dereference right after a wait.** Diagnosis: `if` around `wait()`: a stolen or spurious wake-up (4 per 200,000 items in the measurement above). Fix: `while`, or `wait_for`/`wait_while`.

**Symptom: a pool guarded by a semaphore gradually admits fewer concurrent requests until it stalls completely.** Diagnosis: permits leak on an error path (an exception between `acquire` and `release`); the semaphore's count drifts to 0. Fix: release in `finally` or use the context manager (`with sem:`), and export the available-permit count as a metric.

**Symptom: CPU spikes and latency jumps as the number of idle consumers grows.** Diagnosis: `notify_all` per item (a thundering herd), visible as a large ratio of wake-ups to items consumed. Fix: `notify()` with one condition variable per predicate.

## Interviewer follow-ups

**"Why does `wait()` need the mutex at all?"** Model answer: the predicate is shared state, so it must be checked under the mutex, and `wait()` must release that mutex and start sleeping without a gap in which a notify could be lost; implementations close the gap by registering the waiter (Python's private lock, Rust's sequence counter) before releasing. Common wrong answer: "to make notify thread-safe".

**"When is `notify()` safe instead of `notify_all()`?"** Model answer: when all waiters wait on the same predicate and any one of them can consume the change; otherwise use separate condition variables or broadcast. Common wrong answer: "`notify()` is always fine because the waiters loop".

**"Implement a semaphore with a mutex and a condition variable."** Model answer: a count under the mutex; `acquire` waits `while count == 0` then decrements; `release` increments and notifies one; that is how Python implements it. Common wrong answer: omitting the loop, or notifying without incrementing under the lock.

**"Why is a binary semaphore not a replacement for a mutex?"** Model answer: no owner, so no priority inheritance, no wrong-thread-unlock detection and silent double release that admits two threads. Common wrong answer: "it is slower".

## What mid-level engineers get wrong

- **Polling with a sleep.** Consequence: idle CPU and a latency floor, both measured above.
- **Using `if` around `wait()`.** Consequence: rare crashes after stolen or spurious wake-ups.
- **One condition variable for two predicates with `notify()`.** Consequence: hangs with every thread asleep and work possible.
- **`notify_all()` per item with many waiters.** Consequence: tens of futile wake-ups per item and 17 times the latency here.
- **Blocking on a semaphore while holding a mutex.** Consequence: the first full buffer deadlocks.
- **Releasing a permit outside `finally`.** Consequence: permits leak on errors until the pool stalls.

## Exercises

```exercise
id: bounded-buffer-trace
title: Replay a blocking bounded buffer
prompt: |
  Simulate a bounded blocking queue of the given `capacity` (at least 1).
  `ops` is processed in order; each op is either `[thread, "put", value]` or
  `[thread, "take"]`, where `thread` is a string name.

  - A **put** completes immediately if the buffer has room (the value is
    appended to the back); otherwise the thread blocks.
  - A **take** completes immediately if the buffer is non-empty (it removes
    the front value); otherwise the thread blocks.
  - Blocked threads are served in the order they blocked (FIFO), and a new
    operation never overtakes a thread already waiting of the same kind.
  - After every op, keep serving waiters until nothing changes: if the buffer
    is non-empty and a taker is waiting, the earliest taker takes the front
    value; otherwise, if the buffer has room and a putter is waiting, the
    earliest putter puts its value.

  A thread never issues a new op while its previous one is still blocked.
  Return a list of `[thread, value]` pairs, one per completed take, in the
  order the takes completed. Takes still blocked at the end are not included.
languages: [python, javascript]
entry: buffer_trace
starter:
  python: |
    from collections import deque

    def buffer_trace(capacity, ops):
        buf = deque()
        waiting_putters = deque()   # (thread, value)
        waiting_takers = deque()    # thread
        taken = []
        # your code here
        return taken
  javascript: |
    function buffer_trace(capacity, ops) {
      const buf = [];
      const waitingPutters = [];  // [thread, value]
      const waitingTakers = [];   // thread
      const taken = [];
      // your code here
      return taken;
    }
tests:
  - args: [2, [["P", "put", 1], ["P", "put", 2], ["C", "take"], ["C", "take"]]]
    expected: [["C", 1], ["C", 2]]
  - args: [1, [["C", "take"], ["P", "put", 7]]]
    expected: [["C", 7]]
    label: take on empty blocks until a put
  - args: [1, [["P1", "put", 1], ["P2", "put", 2], ["C", "take"], ["C", "take"]]]
    expected: [["C", 1], ["C", 2]]
    label: put on full blocks until a take
  - args: [1, [["C1", "take"], ["C2", "take"], ["P", "put", 1], ["P", "put", 2]]]
    expected: [["C1", 1], ["C2", 2]]
    label: waiting takers are served FIFO
  - args: [1, [["P1", "put", "a"], ["P2", "put", "b"], ["P3", "put", "c"], ["C", "take"], ["C", "take"], ["C", "take"], ["C", "take"]]]
    expected: [["C", "a"], ["C", "b"], ["C", "c"]]
    label: blocked producers keep their order; last take stays blocked
  - args: [2, [["C1", "take"], ["P1", "put", 10], ["P1", "put", 20], ["P1", "put", 30], ["P2", "put", 40], ["C2", "take"], ["C1", "take"], ["C3", "take"], ["C4", "take"], ["C5", "take"]]]
    expected: [["C1", 10], ["C2", 20], ["C1", 30], ["C3", 40]]
    hidden: true
  - args: [3, [["P", "put", 1]]]
    expected: []
    hidden: true
hints:
  - "Push every new op onto the matching waiting queue, then run the 'serve waiters until nothing changes' loop. Because the loop runs after every op, a new op is served immediately whenever it could have been."
  - "Serve a taker whenever the buffer is non-empty and a taker waits; otherwise serve a putter whenever there is room and a putter waits; stop when neither applies."
```

```exercise
id: semaphore-trace
title: Replay a counting semaphore
prompt: |
  Simulate a semaphore that starts with `permits` permits. `ops` is a list of
  `[thread, "acquire"]` or `[thread, "release"]`, applied in order.

  - `acquire`: if the count is positive, decrement it and the thread is
    granted immediately; otherwise the thread joins a FIFO wait queue.
  - `release`: if `bounded` is true and the count is already at least
    `permits`, this is an over-release: stop and report its index.
    Otherwise, if a thread is waiting, the earliest waiter is granted (the
    count does not change); if not, increment the count.

  Semaphores have no owner, so any thread may release. Return
  `{"granted": [...], "count": c, "error_at": i}`: the threads in the order
  they were granted, the final count, and the index of the over-release (or
  -1 if there was none).
languages: [python, javascript]
entry: semaphore_trace
starter:
  python: |
    from collections import deque

    def semaphore_trace(permits, ops, bounded):
        count = permits
        waiters = deque()
        granted = []
        # your code here
        return {"granted": granted, "count": count, "error_at": -1}
  javascript: |
    function semaphore_trace(permits, ops, bounded) {
      let count = permits;
      const waiters = [];
      const granted = [];
      // your code here
      return { granted, count, error_at: -1 };
    }
tests:
  - args: [2, [["A", "acquire"], ["B", "acquire"], ["C", "acquire"], ["A", "release"]], false]
    expected: {"granted": ["A", "B", "C"], "count": 0, "error_at": -1}
    label: the third thread waits for a release
  - args: [0, [["A", "release"], ["B", "acquire"]], false]
    expected: {"granted": ["B"], "count": 0, "error_at": -1}
    label: a semaphore remembers a release before the acquire
  - args: [3, [], true]
    expected: {"granted": [], "count": 3, "error_at": -1}
    label: no operations
  - args: [1, [["A", "acquire"], ["A", "release"], ["A", "release"], ["B", "acquire"], ["C", "acquire"]], false]
    expected: {"granted": ["A", "B", "C"], "count": 0, "error_at": -1}
    label: double release lets two threads into a binary semaphore
  - args: [1, [["A", "acquire"], ["A", "release"], ["A", "release"], ["B", "acquire"], ["C", "acquire"]], true]
    expected: {"granted": ["A"], "count": 1, "error_at": 2}
    label: a bounded semaphore catches the double release
  - args: [1, [["A", "acquire"], ["B", "acquire"], ["C", "acquire"], ["A", "release"], ["B", "release"], ["C", "release"]], true]
    expected: {"granted": ["A", "B", "C"], "count": 1, "error_at": -1}
    hidden: true
  - args: [1, [["A", "acquire"], ["B", "acquire"], ["A", "release"], ["B", "release"], ["B", "release"]], true]
    expected: {"granted": ["A", "B"], "count": 1, "error_at": 4}
    hidden: true
hints:
  - "A release that finds a waiter hands the permit straight to it; only a release with nobody waiting raises the count."
  - "Check for over-release before doing anything else in a bounded release."
```

## Senior signals

- You write `while not predicate: cond.wait()` under the mutex reflexively, or use `wait_for`/`wait_while`, and can give the three reasons the loop is needed, with the measured rate at which `if` fails.
- You explain the lost wake-up and how real implementations make the wake stick: Python's per-waiter lock registered before release, Rust's futex sequence counter.
- You use one condition variable per predicate, know exactly when `notify_one` is safe, and can quantify a thundering herd.
- You pick a semaphore to count (permits, slots, signals) and a mutex to exclude, and know a semaphore remembers releases while a condition variable does not.
- You acquire a slot before the mutex in a semaphore-based buffer, release permits in `finally`, and never block on another thread while holding a lock it needs.
- In Go you reach for a channel first and can say why `sync.Cond` is rarely the right tool.

## Check yourself

```quiz
- q: >-
    Why must a condition variable's wait() release the mutex and go to sleep as one atomic step?
  options: ["So the waiting thread keeps its cache warm while it sleeps", "A notify in that gap is lost, so it may sleep forever", "Because a sleeping thread has no way to release a held mutex", "So that woken threads are guaranteed to run in FIFO order"]
  answer: 1
  explanation: >-
    Notifications are not stored. If the state changes and notify() runs in the gap after the waiter unlocked but before it slept, nobody is on the wait queue to receive it, and the thread may sleep forever. Implementations close the gap by registering the waiter before releasing. It has nothing to do with caches or wake-up order.
- q: >-
    In CPython, wait() registers a private, already-acquired lock in the condition's waiter list, releases the outer lock, then acquires the private lock again. Why does a notify that runs before that second acquire not get lost?
  options: ["The outer lock is still held, so notify cannot run in that gap", "notify retries in a loop until the waiter is observed to be asleep", "notify unlocks the private lock, so the acquire returns at once", "The GIL prevents notify from running before the waiter blocks"]
  answer: 2
  explanation: >-
    The private lock stores the wake-up: notify releases it whether or not the waiter has blocked yet, and the waiter's second acquire then succeeds immediately. notify does not loop or check sleep state, the GIL can switch threads at the acquire call, and the outer lock has already been released at that point.
- q: >-
    A consumer does `with cond: if not queue: cond.wait()` and then `queue.popleft()`. Under load it occasionally raises IndexError. What is the cause?
  options: ["Another consumer took the item first, or the wake was spurious", "The producer appended the item to the wrong end of the deque", "The deque is not thread-safe, so popleft() races with append()", "notify() was called without holding the lock, so it misfired"]
  answer: 0
  explanation: >-
    Under Mesa semantics a woken thread must reacquire the mutex, and another consumer can get there first and empty the queue; spurious wake-ups have the same effect. Measured here, 4 of 200,000 items hit it. Rechecking the predicate in a while loop fixes both. Every deque access here is under the lock, and Python raises RuntimeError, not IndexError, for an unlocked notify.
- q: >-
    A bounded buffer uses one condition variable for both producers and consumers and calls notify() after every put and take. It occasionally hangs with every thread waiting and the buffer not full. Why?
  options: ["A spurious wake-up left one thread holding the mutex forever", "One condition variable cannot legally serve two predicates", "The capacity is too small for the number of waiting threads", "notify() can wake the wrong kind of waiter, which re-sleeps"]
  answer: 3
  explanation: >-
    A consumer's notify intended for a producer can wake another consumer, which finds the buffer empty and waits again, swallowing the only wake-up; the producer is never woken. Two condition variables (not_full, not_empty) or notify_all() fix it. Sharing one condition variable is legal, which is why this bug compiles and runs.
- q: >-
    64 consumers wait on one condition variable, and the producer calls notify_all() for every item. Compared with notify(), what did the measurement show?
  options: ["Identical cost, since only one consumer can win the mutex", "About 17 times the latency, with 29 futile wake-ups per item", "Lower latency, since the fastest consumer always wins the item", "A deadlock, since woken consumers block each other on the mutex"]
  answer: 1
  explanation: >-
    Every notify_all woke all waiters; each reacquired the mutex in turn, found the queue empty and slept again, 573,566 futile wake-ups for 20,000 items, and per-item latency rose from 96 µs to 1,612 µs. Only one can win, but all of them pay to find out. There is no deadlock, only wasted work.
- q: >-
    200 worker threads call a partner API that allows at most 20 concurrent requests. Which primitive fits best?
  options: ["A condition variable with notify_all", "A counting semaphore holding 20 permits", "A mutex held around each API call", "An Event set whenever the API is free"]
  answer: 1
  explanation: >-
    Bounding concurrency to N is what a counting semaphore does: 20 permits, acquire before the call, release after in a finally block. A mutex allows only 1 at a time, and building a counter from a condition variable reimplements a semaphore with more room for bugs; an Event cannot count.
```
