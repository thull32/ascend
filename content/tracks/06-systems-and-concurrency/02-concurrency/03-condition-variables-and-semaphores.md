---
slug: condition-variables-and-semaphores
title: "Condition variables and semaphores: waiting correctly"
description: How to make a thread sleep until state changes without burning CPU or missing the wake-up, why the wait goes in a while loop, when notify_one is wrong, and what semaphores count.
minutes: 30
difficulty: medium
tags: [concurrency, condition-variable, semaphore, bounded-buffer, producer-consumer, spurious-wakeup, lost-wakeup]
problems: [design-circular-queue]
---
A background worker pulls jobs from an in-memory queue. The first version loops `while not queue: time.sleep(0.01)`. It works, but every idle worker wakes a hundred times a second, a job that arrives waits up to 10 ms for no reason, and when someone "fixes" the latency by removing the sleep, forty idle workers pin forty cores at 100%. The second version replaces the sleep with a flag and a lock, and once every few days a worker sleeps forever with a job sitting in the queue.

Waiting for a *lock* and waiting for a *condition* are different problems. A mutex lets you wait until nobody else is in the critical section. It cannot make you wait until "the queue is non-empty" or "fewer than ten requests are in flight". That needs a primitive that puts a thread to sleep until another thread changes some shared state, without ever missing the change. There are two classic answers, condition variables and semaphores, and the bugs in each are specific enough to be interview questions.

## The lost wake-up

Here is the naive design, written with two primitive operations: `park()` puts the calling thread to sleep, and `unpark_all()` wakes every thread that is currently parked. The consumer checks the queue under the lock and parks if it is empty; the producer appends and wakes sleepers:

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

The signal arrived before anyone was listening and vanished. The consumer sleeps until the next job arrives, possibly forever. This is the **lost wake-up**, and the only real fix is to make "release the lock" and "go to sleep" a single atomic step with respect to notifications. That is precisely the contract of a condition variable.

## The condition variable contract

A condition variable is a **wait queue attached to a mutex**. It has three operations:

- `wait()`: atomically release the mutex and put this thread to sleep on the queue. When woken, reacquire the mutex before returning. Because release-and-sleep is atomic, no notification can slip between them.
- `notify()` (also called signal): wake one sleeping thread, if there is one.
- `notify_all()` (broadcast): wake every sleeping thread.

Notifications are not stored. A `notify()` with nobody waiting does nothing at all. That is fine, because the condition variable is not the condition. The condition is a **predicate over your shared data** ("the queue is non-empty"), protected by the mutex, and the thread always checks the predicate itself. The condition variable only says "something may have changed; look again".

That gives one pattern, which you should be able to write without thinking:

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

## Why the wait goes in a `while` loop

A thread returning from `wait()` knows only that it was woken. It does not know the predicate is true. There are three separate reasons it might not be.

**Stolen wake-ups.** Almost every real condition variable uses *Mesa semantics* (named after the Xerox language that popularised them): `notify()` makes a waiter runnable, but the waiter must still reacquire the mutex, and any other thread can get there first. Concretely, with two consumers and an empty queue:

1. C1 waits.
2. The producer appends item 1 and notifies. C1 becomes runnable but has not run yet.
3. C2 arrives, takes the mutex, sees item 1 without ever waiting, and removes it.
4. C1 finally reacquires the mutex. The queue is empty.

With `if not queue: cond.wait()`, C1 now calls `popleft()` on an empty deque and raises `IndexError`, or in C reads garbage. With `while`, C1 simply goes back to sleep. The alternative, *Hoare semantics*, hands the mutex directly from the notifier to the waiter so the predicate is guaranteed, but it forces an extra context switch on every signal, which is why production systems do not use it.

**Spurious wake-ups.** POSIX explicitly allows `pthread_cond_wait` to return when nobody signalled, and Java, Rust and C++ document the same possibility. It lets implementations avoid expensive guarantees (for example when a signal interrupts the underlying futex wait). It is rare, and it does not matter if you use a loop.

**Shared condition variables.** If several predicates share one condition variable, or you used `notify_all()`, you may have been woken for someone else's change.

The loop is so universal that the libraries offer it directly: Python's `cond.wait_for(lambda: queue)`, Rust's `Condvar::wait_while`, C++'s `cv.wait(lock, pred)`. Prefer them; they make the wrong version impossible to write.

## notify versus notify_all

`notify_all()` is always correct and sometimes slow: wake 50 sleeping workers for one item and 49 of them reacquire the mutex, find nothing, and go back to sleep (a **thundering herd**). `notify()` is an optimisation, and it is only safe when every waiter is waiting for the same predicate and any single waiter can consume the change.

The classic violation is a bounded buffer with a single condition variable shared by producers (waiting for "not full") and consumers (waiting for "not empty"). Take capacity 1, one producer P and two consumers C1 and C2:

1. C1 and C2 find the buffer empty and wait. Waiters: C1, C2.
2. P puts an item (buffer full), notifies (wakes C1), tries to put again, finds it full and waits. Waiters: C2, P.
3. C1 takes the item and notifies, intending to wake P. The condition variable wakes C2. C1 loops, finds the buffer empty and waits. Waiters: P, C1.
4. C2 wakes, finds the buffer empty, waits. Waiters: P, C1, C2.

Everyone is asleep, the buffer has room, and the only thread that could fill it was never told. The fixes are two condition variables sharing one mutex (`not_full` for producers, `not_empty` for consumers, each notified only when its predicate may have become true) or `notify_all()`. Two condition variables is the standard answer.

### Notify inside or outside the lock?

Both are correct under Mesa semantics, as long as the *state change* happens under the lock. Notifying after unlocking can avoid a woken thread immediately blocking on the mutex the notifier still holds; some implementations optimise the in-lock case anyway by moving the waiter straight onto the mutex's queue. Python raises `RuntimeError` if you call `notify()` without holding the lock; Go's `sync.Cond` and Rust's `Condvar` allow either. Default to notifying under the lock, which is easier to reason about, and move it only if a profile tells you to.

## A bounded buffer, three ways

The bounded buffer (producer-consumer queue) is the canonical use. It blocks producers when full, which is how a slow consumer pushes back on a fast producer instead of letting memory grow without limit.

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

This is essentially what the standard library's `queue.Queue(maxsize=n)` does internally: one mutex and several conditions over it. In Rust the shape is identical, with the data inside the mutex and `wait_while` owning the loop:

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
    pub fn put(&self, item: T) {
        let guard = self.items.lock().unwrap();
        let mut items = self
            .not_full
            .wait_while(guard, |q| q.len() >= self.capacity)
            .unwrap();
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

In Go you rarely write this at all: a buffered channel, `make(chan Job, 100)`, *is* a bounded blocking queue. Go has `sync.Cond`, but it cannot be combined with `select`, a timeout or a `context.Context`, so most Go code uses channels for waiting and reserves `sync.Cond` for the rare broadcast-to-many case.

```viz
{"type": "concurrency", "algorithm": "producer-consumer", "threads": 4, "capacity": 2,
 "title": "Producers block when the buffer is full, consumers when it is empty",
 "caption": "Two producers and two consumers share a buffer of capacity 2. A full buffer parks producers on not_full; each take notifies one of them. This is backpressure: the slow side sets the pace."}
```

The array behind the queue is usually a ring buffer; [Design Circular Queue](/practice/design-circular-queue) is the single-threaded half of this problem.

## Semaphores

A semaphore, introduced by Dijkstra in the 1960s, is an integer count with two atomic operations:

- `acquire()` (P, wait, down): if the count is positive, decrement it and continue; otherwise block until it is positive.
- `release()` (V, signal, up): increment the count and wake one waiter.

The crucial difference from a condition variable is that **a semaphore remembers**. A `release()` with nobody waiting raises the count, and the next `acquire()` goes straight through. A lost wake-up is impossible by construction, because the count *is* the state.

That makes semaphores natural for two jobs:

**Bounding concurrency.** A semaphore with N permits admits at most N threads at once: a pool of 10 database connections, at most 20 in-flight calls to a partner API, at most 4 parallel image resizes. Every waiter beyond N queues.

```viz
{"type": "concurrency", "algorithm": "semaphore", "threads": 5, "permits": 2,
 "title": "Five threads, two permits",
 "caption": "At most two threads hold a permit at any time. Each release hands a permit to the next waiter. This is how connection pools and concurrency limits work."}
```

**Signalling.** A semaphore that starts at 0 lets one thread wait for another: thread B calls `acquire()` and blocks; thread A calls `release()` when its work is done. The releasing thread never acquired anything, and that is the point. The "print in order" interview problem is solved exactly this way in [the interview problems lesson](/learn/systems/concurrency/concurrency-interview-problems).

### A bounded buffer with semaphores, and the ordering trap

```python
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

Swap the first two lines of `put` (take the mutex, then wait for a slot) and the buffer deadlocks the first time it fills: a producer sleeps on `empty_slots` while holding `mutex`, and the consumer that would release a slot needs `mutex` to take an item. The general rule, which also applies to condition variables with two different mutexes: **never block waiting for another thread while holding a lock that thread needs.**

### A binary semaphore is not a mutex

A semaphore with one permit admits one thread at a time, which looks like a mutex. It is not, because a semaphore has no **owner**. Any thread can release it. That means no priority inheritance (the kernel does not know whom to boost), no detection of "unlocked by the wrong thread", and no protection against double release: a bug that releases twice silently raises the count to 2 and lets two threads into your "critical section". Python's `BoundedSemaphore` raises `ValueError` on an over-release for exactly this reason. Use a mutex for mutual exclusion and a semaphore for counting.

## The toolbox by language

| Need | Python | Go | Rust |
|---|---|---|---|
| Wait for a predicate | `threading.Condition` + `wait_for` | `sync.Cond` (rare); usually a channel | `std::sync::Condvar` + `wait_while` |
| Bound concurrency | `threading.Semaphore`, `asyncio.Semaphore` | buffered channel `make(chan struct{}, n)`; `golang.org/x/sync/semaphore` | `tokio::sync::Semaphore` (std has no counting semaphore) |
| Bounded blocking queue | `queue.Queue(maxsize=n)` | buffered channel | `std::sync::mpsc::sync_channel(n)`, crossbeam's bounded channel |
| One-off "it happened" | `threading.Event` | `close(done)` on a channel | a channel, or `tokio::sync::Notify` |
| Wait for N tasks | `concurrent.futures.wait` | `sync.WaitGroup` | `JoinHandle::join` on each; `std::sync::Barrier` for phases |

The Go semaphore idiom is worth memorising, because it shows that a buffered channel's capacity *is* a permit count:

```go
sem := make(chan struct{}, 10) // at most 10 concurrent fetches
var wg sync.WaitGroup
for _, url := range urls {
    sem <- struct{}{} // acquire: blocks while 10 are in flight
    wg.Add(1)
    go func(u string) {
        defer wg.Done()
        defer func() { <-sem }() // release
        fetch(u)
    }(url)
}
wg.Wait()
```

## Exercise: replay a bounded buffer

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

## Senior signals

- You write `while not predicate: cond.wait()` under the mutex reflexively, or use `wait_for`/`wait_while`, and you can give all three reasons the loop is needed (stolen wake-ups under Mesa semantics, spurious wake-ups, shared condition variables).
- You explain the lost wake-up and why `wait()` must release the mutex and sleep atomically.
- You use one condition variable per predicate and know exactly when `notify_one` is safe; you treat `notify_all` as correct but expensive.
- You pick a semaphore to count (permits, slots, signals) and a mutex to exclude, and you know a semaphore remembers releases while a condition variable does not.
- You acquire a slot before the mutex in a semaphore-based buffer, and never block on another thread while holding a lock it needs.
- In Go you reach for a channel first and can say why `sync.Cond` is rarely the right tool.

## Check yourself

```quiz
- q: >-
    Why must a condition variable's wait() release the mutex and go to sleep as one atomic step?
  options: ["So that woken threads are guaranteed to run in FIFO order", "So the waiting thread keeps its cache warm while it sleeps", "A notify in that gap would be lost, so the thread could sleep forever", "Because a sleeping thread has no way to release a held mutex"]
  answer: 2
  explanation: >-
    Notifications are not stored. If the state changes and notify() runs in the gap after the waiter unlocked but before it slept, nobody is on the wait queue to receive it, and the thread may sleep forever. Making release-and-sleep atomic closes that gap. It has nothing to do with caches or wake-up ordering, and releasing before sleeping is exactly what wait() does.
- q: >-
    A consumer does `with cond: if not queue: cond.wait()` and then `queue.popleft()`. Under load it occasionally raises IndexError. What is the cause?
  options: ["The deque is not thread-safe, so popleft() races with append()", "notify() was called without holding the lock, so it misfired", "Another consumer took it first, or the wake was spurious", "The producer appended to the wrong end of the shared deque"]
  answer: 2
  explanation: >-
    Under Mesa semantics a woken thread must reacquire the mutex, and another consumer can get there first and empty the queue. Spurious wake-ups have the same effect. Rechecking the predicate in a while loop fixes both. Every deque access here is under the lock, and Python would raise RuntimeError, not IndexError, for an unlocked notify.
- q: >-
    A bounded buffer uses one condition variable for both producers and consumers and calls notify() after every put and take. It occasionally hangs with every thread waiting and the buffer not full. Why?
  options: ["notify() can wake the wrong waiter, which then re-sleeps", "The buffer's capacity is too small for the number of threads", "One condition variable cannot legally serve two predicates", "A spurious wake-up left a thread holding the mutex forever"]
  answer: 0
  explanation: >-
    A consumer's notify intended for a producer can wake another consumer, which finds the buffer empty and waits again, swallowing the only wake-up; the producer is never woken. Two condition variables (not_full, not_empty) or notify_all() fix it. Sharing one condition variable is legal, which is why this bug compiles and runs.
- q: >-
    A semaphore-based bounded buffer's put() does `with mutex: empty_slots.acquire(); buffer.append(x)`. What happens when the buffer fills?
  options: ["Producers wait until a consumer frees space, as intended", "empty_slots goes negative and the buffer overflows its capacity", "Consumers receive duplicate items when the buffer wraps around", "The producer sleeps holding the mutex, so all threads deadlock"]
  answer: 3
  explanation: >-
    Blocking on the semaphore while holding the mutex means the thread that would release a slot (a consumer, which needs the mutex to take an item) can never run its critical section, so nobody frees a slot. A semaphore never goes negative; it blocks. Acquire the semaphore first, then the mutex.
- q: >-
    200 worker threads call a partner API that allows at most 20 concurrent requests. Which primitive fits best?
  options: ["A mutex held around each API call", "A counting semaphore holding 20 permits", "A condition variable with notify_all", "An Event set whenever the API is free"]
  answer: 1
  explanation: >-
    Bounding concurrency to N is exactly what a counting semaphore does: 20 permits, acquire before the call, release after (in a finally block). A mutex allows only 1 at a time, and building a counter from a condition variable just reimplements a semaphore with more room for bugs.
```
