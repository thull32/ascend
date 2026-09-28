---
slug: concurrency-interview-problems
title: "Concurrency interview problems, solved"
description: Complete, discussable solutions in Python and Go to the concurrency problems interviewers actually ask (print in order, bounded blocking queue, readers-writers lock, dining philosophers and a thread-safe rate limiter), each traced step by step and measured, plus the follow-ups that separate senior answers.
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

This lesson applies those moves to the five problems that come up most, each with a complete Python solution and a complete Go solution. Every Go solution below was run under `go run -race` with a stress harness (1,000 randomised print-in-order trials, 100,000 items through the queue with four producers and four consumers, 80,000 lock operations checking the readers-writers invariant, 100,000 meals) with no race reported. Timings are from a Ryzen 9 9950X3D under WSL2 with CPython 3.14 and Go 1.27.

## 1. Print in order

**Problem.** An object has methods `first()`, `second()` and `third()`, each of which prints a word. Three threads call them, one method each, in an unpredictable order. Make the output always come out as first, second, third.

**Insight.** Nothing is shared except *ordering*, so no mutex is needed. Each method waits for a one-time signal from its predecessor. A one-shot signal is an event, a semaphore that starts at 0, or a closed channel.

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

Trace the worst start order, third, second, first:

| Step | Thread | Action | `firstDone` | `secondDone` | Output |
|---|---|---|---|---|---|
| 1 | T3 | `third()` waits on `secondDone` | unset | unset | |
| 2 | T2 | `second()` waits on `firstDone` | unset | unset | |
| 3 | T1 | prints, sets `firstDone` | set | unset | first |
| 4 | T2 | wakes, prints, sets `secondDone` | set | set | first second |
| 5 | T3 | wakes, prints | set | set | first second third |

**Follow-ups.** *Why not a lock?* A mutex should be unlocked by the thread that locked it; here the signal crosses threads, which is what events and semaphores are for. *Memory visibility?* `Event.set`/`wait` and channel close/receive create happens-before edges, so anything `first()` wrote is visible in `second()`. *Generalise to N steps* with a counter and one condition variable: `while turn != k: cond.wait()`, then `turn += 1; cond.notify_all()`. *Alternate "foo" and "bar" n times* with two semaphores passing a turn:

```python
import threading

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

The Go version stores items in a ring buffer, the structure of [Design Circular Queue](/practice/design-circular-queue):

```go
package queue

import (
	"errors"
	"sync"
)

var ErrClosed = errors.New("queue closed")

type BoundedQueue[T any] struct {
	mu       sync.Mutex
	notEmpty *sync.Cond
	notFull  *sync.Cond
	items    []T // ring buffer
	head, n  int
	closed   bool
}

func NewBoundedQueue[T any](capacity int) *BoundedQueue[T] {
	q := &BoundedQueue[T]{items: make([]T, capacity)}
	q.notEmpty = sync.NewCond(&q.mu)
	q.notFull = sync.NewCond(&q.mu)
	return q
}

func (q *BoundedQueue[T]) Put(v T) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	for !q.closed && q.n == len(q.items) { // while, never if
		q.notFull.Wait()
	}
	if q.closed {
		return ErrClosed
	}
	q.items[(q.head+q.n)%len(q.items)] = v
	q.n++
	q.notEmpty.Signal()
	return nil
}

func (q *BoundedQueue[T]) Take() (T, error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	for !q.closed && q.n == 0 {
		q.notEmpty.Wait()
	}
	var zero T
	if q.n == 0 { // closed and drained
		return zero, ErrClosed
	}
	v := q.items[q.head]
	q.items[q.head] = zero // drop the reference so the GC can free it
	q.head = (q.head + 1) % len(q.items)
	q.n--
	q.notFull.Signal()
	return v, nil
}

func (q *BoundedQueue[T]) Close() {
	q.mu.Lock()
	q.closed = true
	q.mu.Unlock()
	q.notEmpty.Broadcast() // every waiter's predicate changed
	q.notFull.Broadcast()
}
```

Trace a shutdown with capacity 1, producer P blocked and consumer C arriving after the close:

| Step | Event | Items | `closed` | Waiting on `not_full` | Result |
|---|---|---|---|---|---|
| 1 | P: `put(1)` | [1] | no | | returns |
| 2 | P: `put(2)`, full, waits | [1] | no | P | |
| 3 | Main: `close()`, broadcast both | [1] | yes | P woken | |
| 4 | P rechecks: `closed` | [1] | yes | | raises `Closed` |
| 5 | C: `take()`, items non-empty | [] | yes | | returns 1 (drained) |
| 6 | C: `take()`, empty and closed | [] | yes | | raises `Closed` |

The Go harness reproduced exactly this: the blocked `Put` returned `queue closed`, the next `Take` returned 1, the one after `queue closed`.

```viz
{"type": "concurrency", "algorithm": "producer-consumer", "threads": 4, "capacity": 3,
 "title": "Two producers, two consumers, capacity 3",
 "caption": "Producers park on not_full when the buffer is full; consumers park on not_empty when it is empty. Each successful operation notifies the other side."}
```

Capacity changes the cost more than language does. Four producers and four consumers moving 100,000 items took 210 ns per item in Go at capacity 1 and 68 ns at capacity 64; in Python, 61.8 µs and 3.6 µs. At capacity 1 every item forces a hand-off between a producer and a consumer; a larger buffer lets each side run a batch before sleeping.

**Follow-ups.** *Why `notify_all` in `close` but `notify` elsewhere?* A put makes exactly one item available, so one consumer suffices; closing changes the predicate for *every* waiter. *Shutdown semantics?* Here producers fail at once and consumers drain first; state that you chose. *More throughput?* Java's `ArrayBlockingQueue` uses one lock like this; `LinkedBlockingQueue` uses separate put and take locks so producers and consumers contend only at the empty and full boundaries. *In production?* A Go buffered channel is the whole implementation; in Python, `queue.Queue(maxsize=n)` and, since 3.13, `Queue.shutdown()`.

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

The same policy in Go, with one condition variable because every state change can matter to both kinds of waiter:

```go
package rw

import "sync"

type RWLock struct {
	mu             sync.Mutex
	cond           *sync.Cond
	readers        int
	writer         bool
	writersWaiting int
}

func New() *RWLock { l := &RWLock{}; l.cond = sync.NewCond(&l.mu); return l }

func (l *RWLock) RLock() {
	l.mu.Lock()
	for l.writer || l.writersWaiting > 0 { // a waiting writer blocks new readers
		l.cond.Wait()
	}
	l.readers++
	l.mu.Unlock()
}

func (l *RWLock) RUnlock() {
	l.mu.Lock()
	l.readers--
	if l.readers == 0 {
		l.cond.Broadcast()
	}
	l.mu.Unlock()
}

func (l *RWLock) Lock() {
	l.mu.Lock()
	l.writersWaiting++
	for l.writer || l.readers > 0 {
		l.cond.Wait()
	}
	l.writersWaiting--
	l.writer = true
	l.mu.Unlock()
}

func (l *RWLock) Unlock() {
	l.mu.Lock()
	l.writer = false
	l.cond.Broadcast()
	l.mu.Unlock()
}
```

The invariant is `writer` implies `readers == 0`. The Go stress harness had 16 goroutines each doing 5,000 operations (10% writes) and checked, inside every critical section, that no reader overlapped a writer: zero violations. Trace the writer-preference rule:

| Step | Request | Inside after | Waiting after | Why |
|---|---|---|---|---|
| 1 | R1 read | R1 | | No writer inside or waiting |
| 2 | W2 write | R1 | W2 | A reader is inside |
| 3 | R3 read | R1 | W2, R3 | A writer is waiting, so R3 may not overtake it |
| 4 | R1 done | W2 | R3 | Last reader out; the waiting writer goes first |
| 5 | W2 done | R3 | | Broadcast; R3's predicate is now true |

```viz
{"type": "concurrency", "algorithm": "readers-writers", "threads": 5,
 "title": "Readers share, writers exclude",
 "caption": "Readers overlap freely until a writer arrives. The waiting writer stops new readers from entering, waits for the current ones to leave, then runs alone."}
```

### Is it faster than a mutex?

Less than people expect. Eight goroutines, 1% writes, Go's `sync.RWMutex` against `sync.Mutex`: with a one-element read section, 62 M against 38 M operations a second; with a 1,000-element read section, 3.8 M against 2.4 M. Both are 1.6× wins, and both are far from the 8× that "readers run in parallel" suggests, because every `RLock` is an atomic add on one shared counter (its cache line bounces between cores, see [atomics](/learn/systems/concurrency/atomics-and-lock-free)) and every write drains all readers. Measure before reaching for one; for read-mostly data, publishing immutable snapshots (RCU, `arc-swap`) or a **seqlock** (readers write nothing and retry if a sequence number changed; Linux uses it for timekeeping) scale further.

**Follow-ups.** *Now readers can starve* under a continuous stream of writers. Go's `sync.RWMutex` takes the middle road: a pending writer blocks new readers, and a writer's unlock admits the readers queued behind it before the next writer, so batches alternate; the second exercise simulates it. *Recursive read locking* deadlocks in Go if a writer arrives between the two `RLock` calls, which is why the documentation forbids it. *Language defaults:* Rust documents that `std::sync::RwLock`'s priority policy depends on the operating system.

## 4. Dining philosophers

**Problem.** Five philosophers sit around a table with one fork between each pair. Each needs both adjacent forks to eat. Design the protocol so nobody deadlocks, and discuss starvation.

**Insight.** Everyone picking up the left fork first creates a circular wait:

| Philosopher | Holds | Wants | Held by |
|---|---|---|---|
| P0 | F0 | F1 | P1 |
| P1 | F1 | F2 | P2 |
| P2 | F2 | F3 | P3 |
| P3 | F3 | F4 | P4 |
| P4 | F4 | F0 | P0 |

A cycle, so nobody eats again. Measured with five goroutines looping left-then-right with no thinking time, the table deadlocked after 677, 2,391 and 3,590 meals in three runs, each within 100 ms. Break one of the four [deadlock conditions](/learn/systems/concurrency/deadlock).

```viz
{"type": "concurrency", "algorithm": "dining-philosophers", "threads": 5,
 "title": "Left-then-right deadlocks; ordered forks do not",
 "caption": "With the naive rule every philosopher holds one fork and waits for the next: a cycle. Numbering the forks and always taking the lower number first means the last philosopher reaches for fork 0 first, and the cycle cannot close."}
```

**Solution 1, resource ordering** (breaks circular wait). P4's forks are F4 and F0, so it reaches for F0 first; if P0 holds F0, P4 waits *holding nothing*, F4 stays free, and P3 can eat.

```python
import threading

N = 5
forks = [threading.Lock() for _ in range(N)]

def philosopher(i, meals, eat):
    a, b = i, (i + 1) % N
    first, second = min(a, b), max(a, b)     # always the lower-numbered fork first
    for _ in range(meals):
        with forks[first]:
            with forks[second]:
                eat(i)
```

```go
package dining

import "sync"

func Dine(n, meals int, eat func(i int)) {
	forks := make([]sync.Mutex, n)
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			a, b := i, (i+1)%n
			if b < a {
				a, b = b, a // lower-numbered fork first: no cycle can close
			}
			for m := 0; m < meals; m++ {
				forks[a].Lock()
				forks[b].Lock()
				eat(i)
				forks[b].Unlock()
				forks[a].Unlock()
			}
		}(i)
	}
	wg.Wait()
}
```

The Go version served 100,000 meals (20,000 each) in 3 ms without the race detector.

**Solution 2, the waiter** (limits how many compete):

```python
seats = threading.Semaphore(N - 1)           # at most N-1 philosophers reach for forks

def philosopher_with_waiter(i, meals, eat):
    left, right = forks[i], forks[(i + 1) % N]
    for _ in range(meals):
        with seats:
            with left:
                with right:
                    eat(i)
```

With at most four philosophers competing for five forks, the pigeonhole principle guarantees one of them can take both, so the chain of waits cannot close.

**Follow-ups.** *Starvation:* neither solution is fair; a philosopher whose neighbours alternate can wait indefinitely, because mutexes make no FIFO promise. Fair locks or a queue at the waiter fix it at a throughput cost. *Try-lock with backoff* breaks hold-and-wait but can livelock without jitter. *Chandy and Misra's* solution uses message passing with "clean" and "dirty" forks for fairness without a central waiter. *Why does anyone care?* "Two resources, taken in different orders" is how real deadlocks happen.

## 5. A thread-safe rate limiter

**Problem.** Implement `allow()` that returns whether a caller may proceed, permitting bursts of up to B requests and a sustained rate of R per second, safe to call from many threads.

**Insight.** A **token bucket**: up to B tokens, refilled at R per second, one spent per request. Refill lazily from the elapsed time when a request arrives, so there is no background thread and all state lives under one short lock.

```python
import threading
import time

class TokenBucket:
    def __init__(self, rate_per_sec, burst, clock=time.monotonic):
        self._rate = rate_per_sec
        self._capacity = burst
        self._tokens = float(burst)          # start full
        self._clock = clock                  # injectable, so tests control time
        self._last = clock()                 # monotonic: immune to wall-clock jumps
        self._lock = threading.Lock()

    def allow(self, cost=1.0):
        with self._lock:
            now = self._clock()
            self._tokens = min(self._capacity, self._tokens + (now - self._last) * self._rate)
            self._last = now
            if self._tokens >= cost:
                self._tokens -= cost
                return True
            return False
```

```go
package ratelimit

import (
	"sync"
	"time"
)

type TokenBucket struct {
	mu       sync.Mutex
	rate     float64 // tokens per second
	capacity float64
	tokens   float64
	last     time.Time
	now      func() time.Time // injectable clock
}

func New(rate, burst float64) *TokenBucket {
	return &TokenBucket{rate: rate, capacity: burst, tokens: burst, last: time.Now(), now: time.Now}
}

func (b *TokenBucket) Allow() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	now := b.now()
	// time.Now carries a monotonic reading, and Sub uses it, so clock jumps cannot distort this
	b.tokens = min(b.capacity, b.tokens+now.Sub(b.last).Seconds()*b.rate)
	b.last = now
	if b.tokens >= 1 {
		b.tokens--
		return true
	}
	return false
}
```

Trace 10 tokens per second with a burst of 2, driven by a fake clock in the Go harness:

| Request at | Tokens before refill | Refill | Tokens after refill | Allowed | Tokens after |
|---|---|---|---|---|---|
| 0 ms | 2.0 | 0 | 2.0 | yes | 1.0 |
| 0 ms | 1.0 | 0 | 1.0 | yes | 0.0 |
| 0 ms | 0.0 | 0 | 0.0 | no | 0.0 |
| 50 ms | 0.0 | 0.5 | 0.5 | no | 0.5 |
| 100 ms | 0.5 | 0.5 | 1.0 | yes | 0.0 |
| 250 ms | 0.0 | 1.5 | 1.5 | yes | 0.5 |
| 1,000 ms | 0.5 | 7.5, capped | 2.0 | yes, yes, then no | 0.0 |

The idle 750 ms earned 7.5 tokens but the cap kept 2: the bucket's capacity is the burst allowance, its rate the long-run limit. In production Go, `golang.org/x/time/rate` implements this (`rate.NewLimiter(100, 20)`, with `Allow()` and `Wait(ctx)`).

```viz
{"type": "system", "scenario": "token-bucket",
 "title": "Bursts spend saved tokens; the refill rate sets the long-run limit",
 "caption": "Idle time fills the bucket up to its capacity, which is the burst allowance. Under sustained load, requests are admitted at exactly the refill rate."}
```

**Follow-ups.** *Why a monotonic clock?* Wall-clock time can jump either way (NTP, manual changes): backwards removes tokens, forwards grants an unearned burst. *Per-user limits?* A map from key to bucket: stripe the lock by key hash and evict buckets that have been full and idle, since a full bucket equals a fresh one. *Blocking instead of rejecting?* Compute the wait, `(cost - tokens) / rate`, reserve the tokens under the lock (letting the balance go negative) and sleep *outside* it. *Lock-free?* GCRA stores one "theoretical arrival time" that fits in an atomic and updates it with a CAS loop. *Across servers?* Centralise the bucket (a Redis Lua script makes the read-modify-write atomic) or give N instances R/N each and accept imprecision; see [rate-limiting algorithms](/learn/networking/network-algorithms/rate-limiting-algorithms) and the [rate limiter case study](/learn/system-design/case-studies/rate-limiter).

## Choosing the primitive

| Problem | Shared state | What threads wait for | Primitive | Go idiom | Classic bug |
|---|---|---|---|---|---|
| Print in order | None, only order | A one-time signal | Event or 0-semaphore | `close(ch)` | Using a mutex across threads |
| Bounded queue | Items and count | Not full, not empty | Mutex + two condition variables | Buffered channel | `notify` instead of `notify_all` on close |
| Readers-writers | The data | No writer (readers); nobody (writers) | Mutex + condition, or `RWMutex` | `sync.RWMutex` | Writer starvation |
| Dining philosophers | Forks | Two locks | Ordered mutexes, or a semaphore of N−1 | Ordered `sync.Mutex` | Circular wait |
| Rate limiter | Tokens and a timestamp | Nothing (rejects) or a computed delay | One short mutex, or CAS on GCRA | `x/time/rate` | Wall clock; sleeping under the lock |

## Failure modes in production

These interview problems are production components, and they fail in production in recognisable ways.

**Symptom: shutdown hangs, with some consumer threads blocked forever in `take()`.** Diagnosis: `close()` used `notify()` (one waiter woken) or never notified at all; a thread dump shows threads in `Condition.wait`. Fix: `notify_all()`/`Broadcast()` on any change that affects every waiter, and a test that closes while threads are blocked on both sides.

**Symptom: writes to a read-mostly cache stall for seconds under peak read traffic.** Diagnosis: a reader-preference RW lock; writers wait for a reader count that never reaches zero. Fix: writer preference or Go-style alternation, or replace the lock with snapshot publication.

**Symptom: a service hangs once a week with two threads each holding one of two locks.** Diagnosis: the dining philosophers in disguise: two code paths take the same pair of resources in different orders. Fix: a global order on a stable key, enforced by a checker ([deadlock](/learn/systems/concurrency/deadlock)).

**Symptom: a rate limiter lets through bursts far above its limit, or rejects everything, after a host clock change.** Diagnosis: elapsed time computed from the wall clock. Fix: a monotonic clock; in Go, keep `time.Time` values from `time.Now()` so `Sub` uses the monotonic reading, and never round-trip them through serialisation before subtracting.

**Symptom: a per-user limiter's memory grows without bound.** Diagnosis: one bucket per key ever seen. Fix: evict full, idle buckets, or store buckets in a bounded LRU keyed by user.

## Interviewer follow-ups

**"How would you test your bounded blocking queue?"** Model answer: separate policy from threading and test the policy deterministically; stress with many producers and consumers at capacity 1 (the most hostile), asserting invariants such as every item consumed exactly once and a sum check, as the Go harness did with 100,000 items; test close while threads are blocked in both `put` and `take`; run under a race detector. Common wrong answer: "run it in a loop and see if it hangs".

**"Your RW lock: can readers starve now?"** Model answer: yes, with writer preference a steady stream of writers keeps readers out; alternate batches as Go's `RWMutex` does (a finishing writer admits the readers that queued behind it). Common wrong answer: "no, readers can always share".

**"Is an RW lock always better than a mutex for read-heavy data?"** Model answer: no; readers still write a shared counter, and writes drain all readers; measured here it gave 1.6× over a mutex with eight goroutines, not 8×; snapshots or seqlocks scale further for read-mostly data. Common wrong answer: "yes, readers run in parallel".

**"Why does resource ordering prevent deadlock in dining philosophers?"** Model answer: a cycle of waits would need ranks to increase strictly all the way around and return to the start, which is impossible; concretely, P4 waits for F0 holding nothing, so F4 stays free. Common wrong answer: "philosophers take turns".

**"How do you make the token bucket blocking without holding the lock while sleeping?"** Model answer: compute the delay under the lock, reserve the tokens by letting the balance go negative, release the lock and sleep; later callers see the debt and wait longer. Common wrong answer: sleeping inside the lock until a token appears, which serialises every caller behind the sleeper.

## What mid-level engineers get wrong

- **Starting to code before naming the invariant and the waiting condition.** Consequence: a primitive chosen by habit, and an interviewer who cannot follow the reasoning.
- **`if` instead of `while` around a wait.** Consequence: a consumer that pops from an empty queue after a stolen wake-up.
- **Forgetting shutdown.** Consequence: threads blocked forever when the service stops.
- **Using a reader-preference RW lock.** Consequence: writer starvation under load.
- **Taking two locks in whatever order the code happens to need them.** Consequence: the dining philosophers in production.
- **Reading the wall clock for durations.** Consequence: rate limits that break when NTP adjusts the clock.

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
- Every wait is a `while` loop over a predicate; you use `notify_all` on state changes that affect every waiter, such as close, and you can trace a shutdown step by step.
- You define shutdown and timeout semantics without being asked, and you can say which side drains and which side fails.
- You discuss fairness explicitly: writer versus reader starvation, fork starvation, FIFO versus barging, and what each fix costs in throughput.
- You know when a fancier primitive loses: RW locks that give 1.6× rather than 8×, lock-free code without a verification plan.
- You can write each solution in a systems language as well as Python, and explain how you would test it: deterministic policy tests, invariant-checking stress tests at capacity 1, and race or interleaving tools.

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
  options: ["All three wake up, see closed, and raise Closed", "One wakes and raises Closed; the other two stay blocked", "All three wake and return None, since the queue is empty", "None wake, because notify() needs a state change first"]
  answer: 1
  explanation: >-
    notify() wakes at most one waiter, so one consumer raises Closed and the other two sleep forever. Closing changes the predicate for every waiter, so it must use notify_all(). This is the standard follow-up that separates a memorised solution from an understood one.
- q: >-
    A readers-writers lock lets readers in whenever no writer is inside. Reads are frequent and overlap. What goes wrong?
  options: ["Readers can see a write that is only partly done", "Nothing; this is the standard, fair readers-writers lock", "Overlapping readers can deadlock with each other", "Writers starve, because the reader count never hits zero"]
  answer: 3
  explanation: >-
    With overlapping readers there is always at least one inside, so a writer waits forever. Making a waiting writer block new readers fixes it; admitting queued readers when a writer finishes (as Go does) keeps readers from starving in turn.
- q: >-
    Eight goroutines share read-mostly data (1% writes). Switching from sync.Mutex to sync.RWMutex raised throughput about 1.6 times, not 8 times. Why so little?
  options: ["RWMutex serialises readers internally, exactly like a Mutex does", "The race detector was enabled, which serialises every lock call", "Every RLock updates one shared counter, and writes drain readers", "Go runs only one goroutine at a time unless GOMAXPROCS is raised"]
  answer: 2
  explanation: >-
    Readers do run in parallel, but each RLock and RUnlock is an atomic update of the same reader count, whose cache line bounces between cores, and each 1% write must wait for all readers and block new ones. GOMAXPROCS defaults to the CPU count, and the measurement ran without the race detector. Snapshots or seqlocks avoid the shared write.
- q: >-
    In dining philosophers with five philosophers, a Semaphore(4) waiter is acquired before picking up forks. Why can this not deadlock?
  options: ["It breaks the mutual exclusion condition on the forks", "The semaphore makes taking both forks one atomic step", "Four diners, five forks: someone can always get two", "It forces the philosophers to eat in a fixed rotation"]
  answer: 2
  explanation: >-
    Deadlock needs every competitor holding one fork and waiting for another held by a neighbour, which requires all five forks held by five philosophers. With at most four competitors holding at most one fork each, a free fork always sits next to someone, so the cycle cannot close. Each fork is still exclusive and taken separately; circular wait is what is broken.
- q: >-
    A token bucket uses the wall clock (time.time()) to compute refills. What can go wrong in production?
  options: ["Clock jumps remove tokens or grant an unearned burst", "The wall clock is not thread-safe, so refills can race", "Nothing, since the wall clock is accurate to microseconds", "The clock call makes the lock hold time far too long"]
  answer: 0
  explanation: >-
    Wall-clock time can jump in either direction: an NTP correction backwards produces a negative elapsed time and removes tokens, and a forward jump grants a burst nobody earned. Precision is not the issue. Durations should come from a monotonic clock (time.monotonic, Instant in Rust, the monotonic reading inside Go's time.Now), which only moves forward.
```
