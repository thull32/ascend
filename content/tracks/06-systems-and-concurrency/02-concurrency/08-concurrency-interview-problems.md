---
slug: concurrency-interview-problems
title: "Concurrency interview problems, solved"
description: Complete, discussable solutions to the concurrency problems interviewers actually ask (print in order, bounded blocking queue, readers-writers lock, dining philosophers and a thread-safe rate limiter) plus the follow-ups that separate senior answers.
minutes: 45
difficulty: hard
tags: [concurrency, interview, bounded-buffer, readers-writers, dining-philosophers, rate-limiter, token-bucket, print-in-order]
problems: [design-circular-queue, lru-cache]
---
The concurrency round is a different game from the algorithms round. Nobody asks for O(n log n). The interviewer asks for a thread-safe bounded blocking queue, watches you write it, and then asks what happens with two producers, what happens when the queue is shut down while a consumer is waiting, whether a writer can starve, and how you would test any of it. The code is short. The judgement is the interview.

Almost every problem in this family reduces to the same four moves, and saying them out loud is half the signal:

1. **Name the shared state and its invariant.** "The deque holds between 0 and `capacity` items." "Either one writer or any number of readers."
2. **Pick the primitive by what threads wait for.** Waiting on a predicate over state: mutex plus condition variable. Counting permits or signalling "done": semaphore or event. Handing values over: a channel. Read-mostly data: a readers-writers lock or a snapshot.
3. **Write every wait as a loop:** `while not predicate: cond.wait()`.
4. **Attack your own design:** walk the interleaving that would break it, then shutdown, fairness and testing.

This lesson applies those moves to the five problems that come up most, with complete solutions and the follow-ups a senior interviewer will push on.

## 1. Print in order

**Problem.** An object has methods `first()`, `second()` and `third()`, each of which prints a word. Three threads call them, one method each, in an unpredictable order. Make the output always come out as first, second, third.

**Insight.** Nothing is shared except *ordering*, so no mutex is needed. Each method must wait for a one-time signal from its predecessor. A one-shot signal is an event, a semaphore that starts at 0, or a closed channel.

```python
import threading

class Ordered:
    def __init__(self):
        self._first_done = threading.Event()
        self._second_done = threading.Event()

    def first(self, print_first):
        print_first()
        self._first_done.set()          # latched: works even if second() arrives later

    def second(self, print_second):
        self._first_done.wait()
        print_second()
        self._second_done.set()

    def third(self, print_third):
        self._second_done.wait()
        print_third()
```

In Go, closing a channel is a broadcast that every current and future receiver sees:

```go
type Ordered struct{ firstDone, secondDone chan struct{} }

func NewOrdered() *Ordered {
    return &Ordered{firstDone: make(chan struct{}), secondDone: make(chan struct{})}
}

func (o *Ordered) First(p func())  { p(); close(o.firstDone) }
func (o *Ordered) Second(p func()) { <-o.firstDone; p(); close(o.secondDone) }
func (o *Ordered) Third(p func())  { <-o.secondDone; p() }
```

**Follow-ups.** *Why not a lock?* A mutex should be unlocked by the thread that locked it; here the signal crosses threads, which is exactly what semaphores and events are for. *What about memory visibility?* `Event.set`/`wait` and channel close/receive create happens-before edges, so anything `first()` wrote is visible in `second()`. *Generalise to N steps* with a counter and one condition variable: `while turn != k: cond.wait()`, then `turn += 1; cond.notify_all()`. *Alternate "foo" and "bar" n times* with two semaphores passing a turn back and forth:

```python
foo_turn, bar_turn = threading.Semaphore(1), threading.Semaphore(0)

def foo(n):
    for _ in range(n):
        foo_turn.acquire(); print("foo", end=""); bar_turn.release()

def bar(n):
    for _ in range(n):
        bar_turn.acquire(); print("bar"); foo_turn.release()
```

## 2. Bounded blocking queue

**Problem.** Implement a fixed-capacity queue where `put` blocks while full and `take` blocks while empty, safe for any number of producers and consumers. The senior version adds timeouts and shutdown.

**Insight.** Two predicates ("not full" for producers, "not empty" for consumers), so two condition variables over one mutex, as derived in [condition variables and semaphores](/learn/systems/concurrency/condition-variables-and-semaphores).

```python
import threading
from collections import deque

class Closed(Exception):
    pass

class BoundedBlockingQueue:
    def __init__(self, capacity):
        if capacity < 1:
            raise ValueError("capacity must be at least 1")
        self._items = deque()
        self._capacity = capacity
        self._closed = False
        self._lock = threading.Lock()
        self._not_empty = threading.Condition(self._lock)
        self._not_full = threading.Condition(self._lock)

    def put(self, item, timeout=None):
        with self._not_full:
            self._not_full.wait_for(
                lambda: self._closed or len(self._items) < self._capacity, timeout)
            if self._closed:
                raise Closed()
            if len(self._items) >= self._capacity:
                return False                    # timed out while still full
            self._items.append(item)
            self._not_empty.notify()
            return True

    def take(self, timeout=None):
        with self._not_empty:
            self._not_empty.wait_for(lambda: self._items or self._closed, timeout)
            if self._items:                     # drain what is left, even after close
                item = self._items.popleft()
                self._not_full.notify()
                return item
            if self._closed:
                raise Closed()
            raise TimeoutError("queue empty")

    def close(self):
        with self._lock:
            self._closed = True
            self._not_empty.notify_all()        # every waiter must see the new state
            self._not_full.notify_all()
```

```viz
{"type": "concurrency", "algorithm": "producer-consumer", "threads": 4, "capacity": 3,
 "title": "Two producers, two consumers, capacity 3",
 "caption": "Producers park on not_full when the buffer is full; consumers park on not_empty when it is empty. Each successful operation notifies the other side."}
```

**Follow-ups.**

- *Why `notify_all` in `close` but `notify` elsewhere?* A put makes exactly one item available, so one consumer suffices. Closing changes the predicate for *every* waiter.
- *What are the shutdown semantics?* Here producers fail immediately and consumers drain the remaining items before seeing `Closed`. State it; the interviewer mostly wants to see that you chose.
- *Can you get more throughput?* Java's `ArrayBlockingQueue` uses one lock, like this; `LinkedBlockingQueue` uses separate `putLock` and `takeLock`, so producers and consumers do not contend with each other except at the empty and full boundaries.
- *How would you do it in Go?* `make(chan T, capacity)` is the whole implementation; `close` gives the same drain semantics. *In production Python?* `queue.Queue(maxsize=n)`, and since 3.13 `Queue.shutdown()`.
- *The storage?* A ring buffer, which is [Design Circular Queue](/practice/design-circular-queue) without the threads.

## 3. Readers-writers lock

**Problem.** Many threads read a shared structure and a few update it. Allow any number of concurrent readers, give writers exclusive access, and make sure writers are not starved.

**Insight.** The naive version (readers wait only while a writer is *inside*) starves writers: with overlapping readers the reader count never reaches zero. The fix is to make a **waiting** writer block new readers.

```python
import threading
from contextlib import contextmanager

class RWLock:
    def __init__(self):
        self._cond = threading.Condition()
        self._readers = 0              # readers inside
        self._writer = False           # a writer inside
        self._writers_waiting = 0

    @contextmanager
    def read(self):
        with self._cond:
            while self._writer or self._writers_waiting:   # waiting writers block new readers
                self._cond.wait()
            self._readers += 1
        try:
            yield
        finally:
            with self._cond:
                self._readers -= 1
                if self._readers == 0:
                    self._cond.notify_all()                # a writer may be waiting

    @contextmanager
    def write(self):
        with self._cond:
            self._writers_waiting += 1
            while self._writer or self._readers:
                self._cond.wait()
            self._writers_waiting -= 1
            self._writer = True
        try:
            yield
        finally:
            with self._cond:
                self._writer = False
                self._cond.notify_all()                    # readers and writers both re-check
```

Usage is `with lock.read(): ...` and `with lock.write(): ...`. The invariant: `_writer` implies `_readers == 0`.

```viz
{"type": "concurrency", "algorithm": "readers-writers", "threads": 5,
 "title": "Readers share, writers exclude",
 "caption": "Readers overlap freely until a writer arrives. The waiting writer stops new readers from entering, waits for the current ones to leave, then runs alone."}
```

**Follow-ups.**

- *Now readers can starve.* Under a continuous stream of writers, readers never get in. Go's `sync.RWMutex` takes the middle road: a pending writer blocks new readers, and when a writer unlocks it admits the readers that queued behind it before the next writer. Batches alternate, and neither side starves. The second exercise below simulates that policy.
- *Recursive read locking.* In Go, a goroutine that calls `RLock` twice can deadlock if a writer arrives between the two calls: the writer waits for the first read lock, and the second `RLock` waits behind the writer. The documentation forbids recursive read locking for this reason.
- *Is it actually faster than a mutex?* Often not. Every reader still writes the shared reader count, so the lock's cache line bounces between cores ([atomics](/learn/systems/concurrency/atomics-and-lock-free)). An RW lock pays off when read sections are long; for short ones, a plain mutex or a lock-free snapshot usually wins. Alternatives: publish immutable snapshots and swap a pointer (RCU, `arc-swap`), or a **seqlock**, where readers never write shared memory and simply retry if a writer bumped a sequence number while they were reading (Linux uses seqlocks for timekeeping).
- *Language defaults.* Rust documents that `std::sync::RwLock`'s priority policy depends on the operating system, so do not assume writer preference.

## 4. Dining philosophers

**Problem.** Five philosophers sit around a table with one fork between each pair. Each needs both adjacent forks to eat. Design the protocol so nobody deadlocks, and discuss starvation.

**Insight.** Everyone picking up the left fork first creates a circular wait. Break one of the four [deadlock conditions](/learn/systems/concurrency/deadlock).

```viz
{"type": "concurrency", "algorithm": "dining-philosophers", "threads": 5,
 "title": "Left-then-right deadlocks; ordered forks do not",
 "caption": "With the naive rule every philosopher holds one fork and waits for the next: a cycle. Numbering the forks and always taking the lower number first means the last philosopher reaches for fork 1 first, and the cycle cannot close."}
```

**Solution 1, resource ordering** (breaks circular wait):

```python
import threading

N = 5
forks = [threading.Lock() for _ in range(N)]

def philosopher(i, meals):
    a, b = i, (i + 1) % N
    first, second = min(a, b), max(a, b)     # always the lower-numbered fork first
    for _ in range(meals):
        think()
        with forks[first]:
            with forks[second]:
                eat(i)
```

**Solution 2, the waiter** (limits how many can compete):

```python
seats = threading.Semaphore(N - 1)           # at most N-1 philosophers reach for forks

def philosopher(i, meals):
    left, right = forks[i], forks[(i + 1) % N]
    for _ in range(meals):
        think()
        with seats:
            with left:
                with right:
                    eat(i)
```

With at most four philosophers competing for five forks, the pigeonhole principle guarantees that at least one of them can get both forks, so the chain of waits cannot close.

**Follow-ups.** *Starvation:* neither solution is fair; a philosopher whose neighbours alternate eating can wait indefinitely, because `threading.Lock` makes no FIFO promise. Fair locks or a queue at the waiter fix it at a throughput cost. *Try-lock with backoff* breaks hold-and-wait but can livelock without jitter. *Chandy and Misra's* solution uses message passing: forks are "clean" or "dirty", and a philosopher must hand over a dirty fork when a neighbour asks, which gives fairness without a central waiter. *Why does anyone care?* Because "two resources, taken in different orders" is how real deadlocks happen, and this problem is where you show you would order them.

## 5. A thread-safe rate limiter

**Problem.** Implement `allow()` that returns whether a caller may proceed, permitting bursts of up to B requests and a sustained rate of R per second, safe to call from many threads.

**Insight.** A **token bucket**: the bucket holds up to B tokens, refills at R per second, and each request spends one. Refill lazily when a request arrives, from the elapsed time, so no background thread is needed and all state lives under one short lock.

```python
import threading
import time

class TokenBucket:
    def __init__(self, rate_per_sec, burst):
        self._rate = rate_per_sec
        self._capacity = burst
        self._tokens = float(burst)          # start full
        self._last = time.monotonic()        # monotonic: immune to wall-clock jumps
        self._lock = threading.Lock()

    def allow(self, cost=1.0):
        with self._lock:
            now = time.monotonic()
            self._tokens = min(self._capacity, self._tokens + (now - self._last) * self._rate)
            self._last = now
            if self._tokens >= cost:
                self._tokens -= cost
                return True
            return False
```

In Go you would use `golang.org/x/time/rate`: `rate.NewLimiter(rate.Limit(100), 20)` gives 100 per second with a burst of 20, with `Allow()` to check and `Wait(ctx)` to block until a token is available.

```viz
{"type": "system", "scenario": "token-bucket",
 "title": "Bursts spend saved tokens; the refill rate sets the long-run limit",
 "caption": "Idle time fills the bucket up to its capacity, which is the burst allowance. Under sustained load, requests are admitted at exactly the refill rate."}
```

**Follow-ups.**

- *Why `time.monotonic()`?* Wall-clock time can jump backwards or forwards (NTP corrections, manual changes); a negative elapsed time would remove tokens, and a jump forward would grant a burst.
- *Per-user limits?* A map from key to bucket, which raises new problems: one global lock around the map (stripe it by key hash), and memory for idle keys (evict buckets that have been full and untouched for a while, since a full bucket is indistinguishable from a fresh one).
- *Blocking instead of rejecting?* Compute the wait, `(cost - tokens) / rate`, under the lock, reserve the tokens (allowing the balance to go negative), and sleep *outside* the lock.
- *Lock-free?* The generic cell rate algorithm (GCRA) stores a single timestamp, the "theoretical arrival time", which fits in one atomic and can be updated with a CAS loop.
- *Across many servers?* Either centralise the bucket (a Redis Lua script makes the read-modify-write atomic) or give each of N instances a local bucket at R/N and accept imprecision. The algorithms and their trade-offs are in [rate-limiting algorithms](/learn/networking/network-algorithms/rate-limiting-algorithms) and the [rate limiter case study](/learn/system-design/case-studies/rate-limiter).

## Exercises

The browser cannot run real threads, so both exercises replay a deterministic sequence of events. That is also how you should test the logic of a concurrent component: separate the policy (which request wins) from the threading, and test the policy exhaustively.

```exercise
id: token-bucket-replay
title: Replay a token bucket
prompt: |
  Implement a token-bucket limiter over integer timestamps (milliseconds).

  - The bucket holds at most `capacity` tokens and is **full at time 0**.
  - One token is added at every positive multiple of `refill_ms`
    (at `refill_ms`, `2 * refill_ms`, ...), never exceeding `capacity`.
  - `times` is a non-decreasing list of request timestamps. For each request
    at time `t`, first add every token due at or before `t`; then, if at least
    one token is available, allow the request and remove a token; otherwise
    reject it.

  Return a list of booleans, one per request.
languages: [python, javascript]
entry: token_bucket
starter:
  python: |
    def token_bucket(capacity, refill_ms, times):
        tokens = capacity
        last = 0
        result = []
        # your code here
        return result
  javascript: |
    function token_bucket(capacity, refill_ms, times) {
      let tokens = capacity;
      let last = 0;
      const result = [];
      // your code here
      return result;
    }
tests:
  - args: [2, 1000, [0, 0, 0, 999, 1000, 1500, 2000, 5000, 5000, 5000]]
    expected: [true, true, false, false, true, false, true, true, true, false]
  - args: [1, 100, [0, 50, 100, 150, 200, 200]]
    expected: [true, false, true, false, true, false]
  - args: [3, 10, []]
    expected: []
    label: no requests
  - args: [3, 10, [5, 5, 5, 5]]
    expected: [true, true, true, false]
    label: burst up to capacity
  - args: [2, 10, [0, 0, 1000, 1000, 1000, 1005, 1010]]
    expected: [true, true, true, true, false, false, true]
    hidden: true
    label: a long idle period refills only to capacity
  - args: [1, 10, [0, 9, 11, 19, 21]]
    expected: [true, false, true, false, true]
    hidden: true
hints:
  - "The number of tokens added between two request times a and b is floor(b / refill_ms) - floor(a / refill_ms)."
  - "Add them, then cap at capacity. Capping once is equivalent to capping at every tick, because nothing is spent between requests."
```

```exercise
id: rwlock-grant-order
title: Grant order of a Go-style readers-writers lock
prompt: |
  Simulate a readers-writers lock with the policy Go's `sync.RWMutex` uses.
  `ops` is processed in order; each op is `[kind, id]` with `id` an integer:

  - `["read", id]`: thread `id` requests a read lock. It is granted at once if
    no writer holds the lock **and no writer is waiting**; otherwise the
    thread waits.
  - `["write", id]`: thread `id` requests the write lock. It is granted at once
    if nobody holds the lock (no readers, no writer); otherwise the thread
    joins the FIFO queue of waiting writers.
  - `["done", id]`: thread `id` releases whatever it holds (it is guaranteed to
    hold something).
    - When a **writer** releases: if any readers are waiting, all of them are
      granted (in the order they started waiting); otherwise, if a writer is
      waiting, the first one is granted.
    - When the **last reader** releases and a writer is waiting, the first
      waiting writer is granted.

  Return the list of thread ids in the order their locks were granted.
languages: [python, javascript]
entry: rw_grant_order
starter:
  python: |
    from collections import deque

    def rw_grant_order(ops):
        readers = 0          # readers holding the lock
        writer = None        # id of the writer holding the lock, or None
        waiting_readers = deque()
        waiting_writers = deque()
        granted = []
        # your code here
        return granted
  javascript: |
    function rw_grant_order(ops) {
      let readers = 0;       // readers holding the lock
      let writer = null;     // id of the writer holding the lock, or null
      const waitingReaders = [];
      const waitingWriters = [];
      const granted = [];
      // your code here
      return granted;
    }
tests:
  - args: [[["read", 1], ["read", 2], ["done", 1], ["done", 2]]]
    expected: [1, 2]
    label: readers share
  - args: [[["write", 1], ["read", 2], ["read", 3], ["done", 1]]]
    expected: [1, 2, 3]
  - args: [[["read", 1], ["write", 2], ["read", 3], ["done", 1], ["done", 2]]]
    expected: [1, 2, 3]
    label: a waiting writer blocks new readers
  - args: [[["write", 1], ["write", 2], ["read", 3], ["done", 1], ["done", 3], ["done", 2]]]
    expected: [1, 3, 2]
    label: a finishing writer admits waiting readers first
  - args: [[["read", 1], ["write", 2], ["write", 3], ["read", 4], ["done", 1], ["done", 2], ["done", 4], ["done", 3]]]
    expected: [1, 2, 4, 3]
    hidden: true
  - args: [[]]
    expected: []
    hidden: true
  - args: [[["write", 1], ["read", 2], ["write", 3], ["read", 4], ["done", 1], ["read", 5], ["done", 2], ["done", 4], ["done", 3], ["done", 5]]]
    expected: [1, 2, 4, 3, 5]
    hidden: true
hints:
  - "Keep a map from id to the mode it holds ('r' or 'w') so that 'done' knows what is being released."
  - "A read request must also wait when a writer is merely waiting; that is what stops writer starvation."
  - "When a writer finishes, grant every waiting reader in one go, even if writers are still waiting; that is what stops reader starvation."
```

## Testing concurrent code

Interviewers increasingly ask "how would you test this?", and "run it a lot" is not a senior answer.

- **Separate policy from threading**, as the exercises do. The rules for who gets the lock, which request is admitted and when a bucket refills can be tested deterministically with an injected clock and scripted events.
- **Stress-test the threading** with many threads, small capacities (1 is the most hostile) and random yields, and assert invariants rather than outputs: every item produced is consumed exactly once, the count never exceeds capacity, no reader overlaps a writer.
- **Use the tools.** Go's `-race`, ThreadSanitizer in C and C++, `loom` in Rust (which exhaustively explores interleavings of a small test), `jcstress` on the JVM.
- **Test shutdown and timeouts explicitly**, including a close while threads are blocked in both `put` and `take`.
- **Say what a pass means.** A passing stress test is evidence, not proof. A model checker or an exhaustive interleaving explorer is proof for the cases it covers.

## The rest of the family

Other problems you may meet, and the move that solves each:

- **FizzBuzz with four threads**: a shared counter and one condition variable; each thread waits for "the current number is mine", prints, increments and calls `notify_all`.
- **Building H2O**: hydrogen threads take one of two hydrogen permits and oxygen threads one oxygen permit (semaphores), then all three meet at a barrier before the next molecule starts.
- **Multithreaded web crawler**: a lock-protected visited set, a bounded pool, and termination detection by counting in-flight tasks (done when the queue is empty *and* nothing is in flight).
- **Delayed task scheduler**: a min-heap of deadlines plus a condition variable; the worker does a timed wait until the earliest deadline and re-waits whenever a new, earlier task is inserted.
- **Thread-safe LRU cache**: [LRU Cache](/practice/lru-cache) under a single lock (every `get` mutates recency, so even reads need exclusive access), then discuss striping by key and approximate LRU for concurrency.

## Senior signals

- You open with the invariant and the waiting condition, and choose the primitive from that, not from habit.
- Every wait is a `while` loop over a predicate; you use `notify_all` on state changes that affect every waiter, such as close.
- You define shutdown and timeout semantics without being asked, and you can say which side drains and which side fails.
- You discuss fairness explicitly: writer versus reader starvation, fork starvation, FIFO versus barging, and what each fix costs in throughput.
- You know when a fancier primitive loses: RW locks for short critical sections, lock-free code without a verification plan.
- You can explain how to test the component: deterministic policy tests, invariant-checking stress tests, and race or interleaving tools.

## Check yourself

```quiz
- q: >-
    In the print-in-order problem, why is a threading.Event (or a semaphore starting at 0) a better fit than a mutex?
  options: ["The signal crosses threads and is latched if set before the wait", "An event gives mutual exclusion as well as a signal to the waiter", "A mutex cannot coordinate more than two threads at the same time", "Events are faster, because waiting on one never enters the kernel"]
  answer: 0
  explanation: >-
    The problem is ordering across threads, not exclusion. An event is latched: set() before wait() still lets the waiter through, and the setter and waiter are different threads. A mutex is meant to be released by the thread that acquired it and provides no ordering by itself; an event provides no exclusion at all.
- q: >-
    A bounded blocking queue's close() sets closed = True and calls notify() once on each condition variable. Three consumers are blocked in take(). What happens?
  options: ["All three wake up, see closed, and raise Closed", "One wakes and raises Closed; the other two stay blocked forever", "All three wake and return None, since the queue is empty", "None wake, because notify() needs a state change first"]
  answer: 1
  explanation: >-
    notify() wakes at most one waiter, so one consumer raises Closed and the other two sleep forever. Closing changes the predicate for every waiter, so it must use notify_all(). This is the standard follow-up that separates a memorised solution from an understood one.
- q: >-
    A readers-writers lock lets readers in whenever no writer is inside. Reads are frequent and overlap. What goes wrong?
  options: ["Readers can see a write that is only partly done", "Nothing; this is the standard, fair readers-writers lock", "Overlapping readers can deadlock with each other", "Writers can starve, because the reader count never hits zero"]
  answer: 3
  explanation: >-
    With overlapping readers there is always at least one inside, so a writer waits forever. Making a waiting writer block new readers fixes it; admitting queued readers when a writer finishes (as Go does) keeps readers from starving in turn.
- q: >-
    In dining philosophers with five philosophers, a Semaphore(4) "waiter" is acquired before picking up forks. Why can this not deadlock?
  options: ["It breaks the mutual exclusion condition on the forks", "The semaphore makes picking up both forks one atomic step", "It forces the philosophers to eat in a fixed rotation", "Four diners, five forks: someone can always get two"]
  answer: 3
  explanation: >-
    Deadlock needs every competitor holding one fork and waiting for another held by a neighbour, which requires all five forks to be held by five philosophers. With at most four competitors holding at most one fork each, a free fork always exists next to someone, so the cycle cannot close. Each fork is still picked up separately and is still exclusive; it is circular wait that is broken.
- q: >-
    A token bucket uses time.time() (wall clock) to compute refills. What can go wrong in production?
  options: ["Nothing, since time.time() is accurate to microseconds", "time.time() is not thread-safe, so refills can race", "Clock jumps remove tokens or grant an unearned burst", "The wall-clock call makes the lock hold time too long"]
  answer: 2
  explanation: >-
    Wall-clock time can jump in either direction: an NTP correction backwards produces a negative elapsed time and removes tokens, and a forward jump grants a burst nobody earned. Precision is not the issue. Durations should always come from a monotonic clock (time.monotonic, Instant in Rust, Go's monotonic reading inside time.Now), which only moves forward.
```
