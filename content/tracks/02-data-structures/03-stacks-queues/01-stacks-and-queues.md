---
slug: stacks-and-queues
title: Stacks and queues
description: Array-backed stacks, why naive array queues are O(n) with the measured numbers, ring buffers traced through wrap-around and growth with the full/empty problem solved, the two-stack queue with its amortised proof, and what deque, ArrayDeque, VecDeque, Go channels and the Disruptor really are underneath.
minutes: 40
difficulty: easy
tags: [stack, queue, deque, ring-buffer, amortized, two-stacks, backpressure, channels]
problems: [valid-parentheses, min-stack, design-circular-queue]
---
A worker pulls jobs from the front of a list and producers append to the back. It runs fine in staging with a hundred jobs. In production, with a backlog of two million, each pull takes milliseconds and the worker falls further behind the harder it works. Nothing in the code looks quadratic; there is one `jobs.pop(0)` per job. But `pop(0)` on an array shifts every remaining element, so processing the backlog costs 2 million × 2 million / 2 element moves: 16 terabytes of memory traffic for a queue.

Stacks and queues are trivial to specify (add and remove at one end; add at one end and remove at the other) and easy to build wrongly, because the natural array operations only give you O(1) at *one* end. This lesson is about getting O(1) at both, with the numbers that show where the naive versions break and the layouts that real runtimes use.

## Stacks on arrays

A stack needs `push`, `pop` and `peek` at the same end. A dynamic array already provides all three at its end in O(1) amortised (`append`/`pop` in Python, `push`/`pop` in JavaScript, `Vec::push`/`pop` in Rust). There is nothing to build:

```python
stack = []
stack.append(3)      # push
stack.append(7)
top = stack[-1]      # peek → 7
x = stack.pop()      # pop  → 7
```

```viz
{"type": "stack-queue", "algorithm": "stack-ops", "operations": [["push", 3], ["push", 7], ["push", 1], ["pop"], ["push", 9], ["pop"], ["pop"], ["pop"]], "title": "Stack: last in, first out"}
```

The only decision is what happens on `pop` of an empty stack: Python raises `IndexError`, JavaScript returns `undefined`, Rust returns `None`. Interview code should check `if not stack` before popping and decide explicitly, because "pop on empty" is the boundary case in every bracket-matching and expression problem.

A linked-list stack (push and pop at the head) is also O(1) per operation with no amortisation and no resize pause, at the cost of a pointer per element and a cache miss per access (~100 ns from DRAM against ~1 ns for the next slot of an array already in L1). It is the right choice only when elements must not move (a pointer to a stack slot must stay valid across pushes) or when you cannot tolerate the occasional O(n) resize. Interpreters keep their value stack contiguous for exactly the cache reason: CPython's frame holds locals and the evaluation stack in one array, and the JVM computes each method's maximum operand-stack depth at compile time so the frame is one fixed block.

## Queues on arrays: the wrong way, measured

A queue needs `enqueue` at the back and `dequeue` from the front. Appending at the back is O(1). Removing from the front of an array is the problem: every remaining element shifts left by one, a `memmove` of `8 × (n − 1)` bytes on a 64-bit runtime.

```python
queue = []
queue.append(x)     # O(1)
queue.pop(0)        # O(n): shifts n-1 elements
```

Measured on this lesson's reference machine (CPython 3.14, Node 24; absolute figures depend on memory bandwidth, the ratios do not):

| Operation | n = 10,000 | n = 100,000 | n = 1,000,000 |
|---|---|---|---|
| Python `list.pop(0)`, one call | 0.5 µs | 8.5 µs | 55 µs |
| Python `deque.popleft()`, one call | 35 ns | 31 ns | 34 ns |
| Drain the whole queue, `list.pop(0)` | 2 ms | 212 ms | (extrapolated ~20 s) |
| Drain the whole queue, `deque.popleft()` | 0.2 ms | 1.3 ms | ~13 ms |
| Drain with JavaScript `shift()` | 0.3 ms | 212 ms | 28,757 ms |
| Drain with a head index in JavaScript | 0.08 ms | 0.55 ms | 2.3 ms |

The JavaScript row is the trap: at 10,000 elements `shift()` looks fine because V8 has a fast path that moves the array's start pointer instead of copying (left-trimming), and that path stops applying as the array grows and the heap state changes. A benchmark at 10⁴ says O(1); production at 10⁶ takes 29 seconds. Treat `shift()` and `pop(0)` as O(n).

Two O(1) fixes on a plain array:

1. **A head index.** Keep `head`; `dequeue` returns `a[head]` and increments `head` without touching the array. Memory is never reclaimed at the front, so periodically compact (copy `a[head:]` to a new array when `head` passes half the length). Amortised O(1), correct with no wrap-around arithmetic to get wrong, and a fine interview answer.
2. **A ring buffer.** Reuse the front slots by wrapping indices around. This is what every production queue does.

## Ring buffers, traced

A ring buffer (circular buffer) is a fixed-size array plus two indices: `head` (next slot to read) and `tail` (next slot to write). Both advance with `(i + 1) mod capacity`, so after reaching the end they wrap to slot 0 and reuse the space freed by earlier dequeues. Capacity 4, with `tail` derived as `(head + count) mod 4`:

| Step | Operation | Slots 0..3 | head | count | tail | Returns |
|---|---|---|---|---|---|---|
| 1 | enqueue 1 | `[1, ·, ·, ·]` | 0 | 1 | 1 | |
| 2 | enqueue 2 | `[1, 2, ·, ·]` | 0 | 2 | 2 | |
| 3 | enqueue 3 | `[1, 2, 3, ·]` | 0 | 3 | 3 | |
| 4 | dequeue | `[·, 2, 3, ·]` | 1 | 2 | 3 | 1 |
| 5 | dequeue | `[·, ·, 3, ·]` | 2 | 1 | 3 | 2 |
| 6 | enqueue 4 | `[·, ·, 3, 4]` | 2 | 2 | 0 (wrapped) | |
| 7 | enqueue 5 | `[5, ·, 3, 4]` | 2 | 3 | 1 | |
| 8 | enqueue 6 | `[5, 6, 3, 4]` | 2 | 4 | 2 | |
| 9 | enqueue 7 | full: rejected | 2 | 4 | 2 | `false` |
| 10 | dequeue | `[5, 6, ·, 4]` | 3 | 3 | 2 | 3 |

At step 8 the buffer is full and `tail == head == 2`; at step 10 the read wraps from slot 3 back to 0 on the next dequeue. Elements always come out in logical order (3, 4, 5, 6) even though they sit physically as `[5, 6, 3, 4]`.

## The full/empty problem

With only `head` and `tail`, the states "empty" and "full" both have `head == tail` (step 8 above, and the initial state). Three standard resolutions:

- **Keep a count.** Empty when `count == 0`, full when `count == capacity`. Simplest; one extra integer.
- **Leave one slot unused.** Full when `(tail + 1) mod capacity == head`. Costs one slot; used when the producer and consumer are different threads, because each side then writes only its own index and no shared `count` needs synchronisation.
- **Unbounded indices.** Let `head` and `tail` grow forever and take `mod capacity` on access; `tail − head` is the count. With a power-of-two capacity the modulo is a mask (`& (cap − 1)`, one cycle) instead of a division (20–40 cycles), which is why so many ring buffers have power-of-two sizes.

```python
class RingQueue:
    def __init__(self, capacity):
        self.buf = [None] * capacity
        self.cap = capacity
        self.head = 0
        self.count = 0

    def enqueue(self, x):
        if self.count == self.cap:
            return False                        # full: caller decides (block, drop, grow)
        tail = (self.head + self.count) % self.cap
        self.buf[tail] = x
        self.count += 1
        return True

    def dequeue(self):
        if self.count == 0:
            return None
        x = self.buf[self.head]
        self.buf[self.head] = None              # let the GC reclaim it
        self.head = (self.head + 1) % self.cap
        self.count -= 1
        return x
```

Deriving `tail` from `head + count` means only two fields are stored and they cannot disagree; that is a small robustness win worth mentioning. Clearing the slot on dequeue matters in garbage-collected languages: a ring of 1,024 slots that never clears keeps up to 1,023 dead objects reachable.

```viz
{"type": "stack-queue", "algorithm": "queue-ops", "operations": [["enqueue", 1], ["enqueue", 2], ["enqueue", 3], ["dequeue"], ["dequeue"], ["enqueue", 4], ["enqueue", 5], ["dequeue"], ["dequeue"], ["dequeue"]], "title": "Queue: first in, first out"}
```

## Growing a ring buffer

When a bounded ring is not acceptable, grow on full: allocate `2 × capacity`, copy the elements *in logical order* (from `head` around the wrap) into the new array starting at slot 0, reset `head = 0`. From step 8 above, physical slots `[5, 6, 3, 4]` with `head = 2` must become `[3, 4, 5, 6, ·, ·, ·, ·]` with `head = 0`. Copying the raw slots gives `[5, 6, 3, 4, ·, ·, ·, ·]` with `head = 2`, and the next dequeues return 3, 4, then an empty slot, then 5: the classic bug, a gap in the middle of the ring. The amortised cost is O(1) by the same doubling argument as [dynamic arrays](/learn/data-structures/arrays-strings/arrays-and-dynamic-arrays).

Bounded rings are a feature, not a limitation, in systems code: a fixed-size queue between a producer and a consumer is the simplest form of **backpressure**. When it is full the producer must block, drop or shed load, and each of those is a deliberate policy rather than an out-of-memory crash an hour later. Kernel network buffers, audio pipelines, the LMAX Disruptor and Go's buffered channels are all bounded rings. [Resilience patterns](/learn/system-design/building-blocks/resilience-patterns) covers the policy side.

## A queue from two stacks, traced

A classic interview question with a real lesson about amortisation. Keep an `inbox` stack and an `outbox` stack. `enqueue` pushes onto `inbox`. `dequeue` pops from `outbox`; if `outbox` is empty, first move every element from `inbox` to `outbox` (pop from one, push onto the other), which reverses them into FIFO order.

```python
class QueueViaStacks:
    def __init__(self):
        self.inbox, self.outbox = [], []

    def enqueue(self, x):
        self.inbox.append(x)

    def _shift(self):
        if not self.outbox:
            while self.inbox:
                self.outbox.append(self.inbox.pop())

    def dequeue(self):
        self._shift()
        return self.outbox.pop() if self.outbox else None

    def peek(self):
        self._shift()
        return self.outbox[-1] if self.outbox else None
```

| Step | Operation | inbox (bottom → top) | outbox (bottom → top) | Moves | Returns |
|---|---|---|---|---|---|
| 1 | enqueue 1 | `[1]` | `[]` | 0 | |
| 2 | enqueue 2 | `[1, 2]` | `[]` | 0 | |
| 3 | enqueue 3 | `[1, 2, 3]` | `[]` | 0 | |
| 4 | dequeue | `[]` | `[3, 2]` | 3 (transfer) | 1 |
| 5 | enqueue 4 | `[4]` | `[3, 2]` | 0 | |
| 6 | dequeue | `[4]` | `[3]` | 0 | 2 |
| 7 | dequeue | `[4]` | `[]` | 0 | 3 |
| 8 | dequeue | `[]` | `[]` | 1 (transfer) | 4 |

```viz
{"type": "stack-queue", "algorithm": "queue-via-two-stacks", "operations": [["enqueue", 1], ["enqueue", 2], ["enqueue", 3], ["dequeue"], ["enqueue", 4], ["dequeue"], ["dequeue"], ["dequeue"]], "title": "Two stacks: the transfer reverses order"}
```

Step 4 cost three moves for one dequeue; steps 6 and 7 cost none. Each element is pushed onto `inbox` once, moved to `outbox` once, and popped from `outbox` once: three O(1) operations over its lifetime, so `n` operations cost at most `3n` and the amortised cost per operation is O(1). Notice that element 4, enqueued at step 5, waited in `inbox` while `outbox` still had 2 and 3: the transfer must happen only when `outbox` runs dry. Transferring while `outbox` is non-empty would require moving its contents back to keep order, and elements would bounce on every call, which is O(n) each.

The pattern generalises: two stacks give you a queue, two queues give you a (slow) stack, and a stack plus an auxiliary stack of running minimums gives you a [min-stack](/practice/min-stack). It is also how purely functional languages implement queues with immutable lists (Okasaki's banker's queue).

## Under the hood: what your language's queue is

| Language | Type | Layout | Cost details |
|---|---|---|---|
| Python | `collections.deque` | Doubly linked list of blocks of 64 pointer slots | A block is 528 bytes (64 × 8 plus two links); an empty deque is 760 bytes on CPython 3.14 and grows by one block per 64 elements, so 100,000 elements is 825 KB against 800 KB for a list. O(1) at both ends; `dq[i]` walks `i / 64` blocks, so middle indexing is O(n); `maxlen` gives a bounded ring that drops from the far end |
| Java | `ArrayDeque` | Growable ring buffer with `head`/`tail` | Grows by about 50% (JDK 9+; earlier versions doubled to a power of two); rejects `null` because `null` marks an empty slot; the recommended stack and queue since `Stack` (synchronised, extends `Vector`) and `LinkedList` (one 24-byte node per element) are both slower |
| Rust | `VecDeque` | Growable ring buffer, `head` + `len` over a `Vec` allocation | Doubling growth; since Rust 1.67 (2023) any capacity is allowed (before that, power of two with one slot unused); `make_contiguous` rotates the ring so you can borrow a slice |
| C++ | `std::deque` | Chunks of 512 bytes (libstdc++) indexed by a map of chunk pointers | O(1) random access, unlike Python's; iterators survive push at either end but not insertion in the middle |
| Go | buffered `chan T` | `hchan`: a ring `buf` of `dataqsiz` slots with `sendx`, `recvx`, `qcount` and a mutex | A bounded ring plus wait queues of blocked goroutines; an unbuffered channel has no ring at all and hands the value directly from sender to receiver |
| Linux kernel | `kfifo` | Power-of-two ring with unbounded `in`/`out` indices masked on access | Lock-free for one producer and one consumer, because each side writes only its own index; used for driver and tracing buffers |
| JavaScript | none | `Array` (`shift` is O(n) at scale) | Implement a head-index queue or a ring; several npm packages do |

## Under the hood: why rings win on cache

Cache behaviour is the reason rings win: a 1,024-slot ring of 8-byte references is 8 KB, 128 cache lines, which fits in L1 on any current core, and a producer and consumer walk it sequentially so the hardware prefetcher stays ahead of them. A linked queue touches a new allocation per element. The LMAX Disruptor (the trading-system ring that popularised the design in 2011) adds one more idea: the producer's and consumer's sequence counters are padded to separate 64-byte cache lines so that the two cores do not invalidate each other's line on every update ("false sharing"), which is what took it from millions to tens of millions of messages per second on the hardware of the time. [CPU caches and memory layout](/learn/systems/performance-engineering/cpu-caches-and-memory-layout) covers the mechanism.

## FIFO is a policy, not a law

The queue discipline is a decision with production consequences. A plain FIFO request queue behaves badly under overload: when the server falls behind, the requests at the front are the *oldest*, and by the time they are served the client has often already timed out and retried, so the server spends its capacity producing responses nobody will read while the retries pile up behind them. Facebook's "Fail at Scale" write-up describes switching request queues to **adaptive LIFO** under overload (serve the newest request first, since it is the one most likely to still have a waiting client) combined with **CoDel**-style queue timeouts (drop requests that have already waited longer than a budget, 5 ms target and 100 ms interval in the original network version). Goodput went up because the queue stopped doing work that was already wasted.

The same reasoning applies to job queues (age-based priority to prevent starvation), to thread pools (bounded queues that reject rather than buffer forever), and to any system where a queued item has a deadline. When you design a queue, decide: what happens when it is full, what happens to items that have waited too long, and whether newest-first would serve users better than oldest-first when you are behind.

## Choosing between them

| Need | Structure | Why |
|---|---|---|
| Undo, backtracking, matching brackets, DFS, expression evaluation | Stack | Most-recent-first is the semantics |
| BFS, task scheduling, buffering between producer and consumer, rate limiting by arrival | Queue | Arrival order is the semantics |
| Sliding windows, work-stealing (steal from the far end), palindromes | Deque | Need both ends |
| Fixed memory, backpressure, lock-free single-producer/single-consumer | Ring buffer | Bounded and cache-friendly |
| Ordering by priority rather than arrival | Priority queue (heap) | Not a queue at all; see [Binary heap mechanics](/learn/data-structures/heaps/binary-heap-mechanics) |

| Implementation | Enqueue / dequeue | Memory per element | Cache behaviour | Bounded | Two-thread use |
|---|---|---|---|---|---|
| Array + head index | O(1) / O(1), compaction amortised | 8 B, plus dead prefix until compaction | Sequential | No | Needs a lock |
| Ring buffer | O(1) / O(1) | 8 B, fixed | Sequential, prefetch-friendly | Yes (or grow with copy) | SPSC without a lock (one index per side) |
| Block deque (Python) | O(1) / O(1) | 8.25 B (block links amortised) | Sequential within a block | Optional (`maxlen`) | Needs a lock (the GIL makes single ops atomic) |
| Linked list | O(1) / O(1) | 8 B + 16–24 B node | One miss per element | No | Lock, or lock-free with CAS (Michael–Scott queue) |
| Two stacks | O(1) amortised, O(n) worst | 8 B | Sequential | No | Awkward: the transfer must be atomic |

## Production failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| Worker throughput falls as the backlog grows; profile shows `memmove` or `list.pop` | `pop(0)` / `shift()` on an array queue | `collections.deque`, a head index, or a ring; the fix is one line |
| Process memory grows for hours, then it is OOM-killed | Unbounded queue between a fast producer and a slow consumer | Bounded queue with an explicit full policy (block, drop, reject) and a metric on depth |
| A grown ring returns elements out of order or returns `None` mid-stream | Physical copy on growth left a gap at the wrap | Copy in logical order from `head`, reset `head = 0`; test growth from a wrapped state |
| Under load, every response is for a request the client already abandoned | FIFO serving stale requests past their deadline | Queue timeouts (CoDel-style) and LIFO under overload |
| A two-thread ring corrupts data without a lock | Both threads wrote a shared `count`, or one index was read torn | One index per side with atomic stores, or one unused slot; a lock otherwise |
| GC pauses grow with queue size although the queue is "empty" most of the time | Dequeued slots never cleared in a ring, keeping dead objects reachable | Clear the slot on dequeue |
| Java service with `LinkedList` as a queue shows high allocation rate | One node object per element | `ArrayDeque` |

## Interviewer follow-ups

**"Make the ring buffer safe for one producer thread and one consumer thread without a lock."** Model answer: each side owns one index; the producer writes the slot then publishes `tail` with a release store, the consumer reads `head`, checks `head != tail`, reads the slot, publishes `head`; leave one slot unused so full and empty differ; this is `kfifo` and the Disruptor's single-producer mode. Common wrong answer: a shared `count` incremented by both sides, which is a race.

**"Design a bounded blocking queue."** Model answer: a ring plus a mutex and two condition variables (`not_full`, `not_empty`); `put` waits on `not_full` in a loop, writes, signals `not_empty`; `take` mirrors it; the loop guards against spurious wake-ups. [Condition variables and semaphores](/learn/systems/concurrency/condition-variables-and-semaphores) has the code. Common wrong answer: `if` instead of `while` around the wait.

**"Implement a stack with a single queue."** Model answer: on push, enqueue the element and then rotate the queue by dequeuing and re-enqueuing the previous `n − 1` elements, so the newest sits at the front; push is O(n), pop is O(1). Common wrong answer: claiming it needs two queues.

**"Why does Python index into a deque in O(n) when it is 'a list of arrays'?"** Model answer: the blocks are linked, not indexed, so reaching position `i` walks `i / 64` block pointers; C++'s `std::deque` keeps an array of chunk pointers and indexes in O(1). Common wrong answer: "deque indexing is O(1) like a list".

**"Your job worker's latency grows linearly with the backlog. What do you check first?"** Model answer: the dequeue operation's complexity, then whether the queue is unbounded, then whether the work per job depends on queue depth (a scan for duplicates, for example). Common wrong answer: adding workers, which multiplies the quadratic work.

## What mid-level engineers get wrong

- **Benchmarking `shift()` at 10,000 elements** and shipping it; V8's fast path stops at scale.
- **Using `list.pop(0)` for BFS** in Python and calling BFS "slow".
- **Growing a ring by copying physical slots**, which passes every test that never wraps.
- **Comparing `head` and `tail` to detect full**, which is the same state as empty.
- **Leaving an unbounded queue between services** and discovering backpressure as an OOM kill.
- **Reaching for `java.util.Stack` or `LinkedList`** because their names match the concept.
- **Assuming FIFO is always fair**: under overload it serves the requests least likely to still matter.

## Exercises

```exercise
id: ring-queue
title: Bounded ring-buffer queue
prompt: |
  Implement `RingQueue`, a FIFO queue with a fixed capacity of 3 backed by
  a fixed-size array and a head index plus a count. `enqueue(x)` returns
  `true` on success and `false` when full (do not grow). `dequeue()`
  removes and returns the front element or `None`/`null` when empty.
  `peek()` returns the front without removing it (or `None`/`null`).
  `size()` returns the number of elements. Indices must wrap around; do
  not shift elements and do not use built-in push/shift on the buffer.
languages: [python, javascript]
entry: RingQueue
starter:
  python: |
    class RingQueue:
        def __init__(self):
            self.cap = 3
            self.buf = [None] * self.cap
            self.head = 0
            self.count = 0

        def enqueue(self, x):
            # TODO
            return False

        def dequeue(self):
            # TODO
            return None

        def peek(self):
            # TODO
            return None

        def size(self):
            return self.count
  javascript: |
    class RingQueue {
      constructor() {
        this.cap = 3;
        this.buf = new Array(this.cap).fill(null);
        this.head = 0;
        this.count = 0;
      }
      enqueue(x) {
        // TODO
        return false;
      }
      dequeue() {
        // TODO
        return null;
      }
      peek() {
        // TODO
        return null;
      }
      size() { return this.count; }
    }
tests:
  - args: [["enqueue", 1], ["enqueue", 2], ["enqueue", 3], ["enqueue", 4], ["dequeue"], ["enqueue", 4], ["peek"], ["size"]]
    expected: [true, true, true, false, 1, true, 2, 3]
    label: full queue rejects, then accepts after a dequeue
  - args: [["dequeue"], ["peek"], ["size"]]
    expected: [null, null, 0]
    label: empty queue
  - args: [["enqueue", 5], ["dequeue"], ["enqueue", 6], ["dequeue"], ["enqueue", 7], ["dequeue"], ["enqueue", 8], ["enqueue", 9], ["enqueue", 10], ["dequeue"], ["dequeue"], ["dequeue"], ["dequeue"]]
    expected: [true, 5, true, 6, true, 7, true, true, true, 8, 9, 10, null]
    label: indices wrap around several times
  - args: [["enqueue", 1], ["enqueue", 2], ["dequeue"], ["enqueue", 3], ["enqueue", 4], ["size"], ["dequeue"], ["dequeue"], ["dequeue"], ["dequeue"]]
    expected: [true, true, 1, true, true, 3, 2, 3, 4, null]
    hidden: true
hints:
  - "The write slot is `(head + count) % cap`; after a dequeue, `head = (head + 1) % cap`."
  - "Full is `count == cap`, empty is `count == 0`; never compare head and tail to decide."
```

```exercise
id: queue-via-stacks
title: Queue from two stacks
prompt: |
  Implement `QueueViaStacks` using two stacks (plain lists/arrays used only
  with push and pop at the end). `push(x)` enqueues; `pop()` dequeues and
  returns the front (or `None`/`null` if empty); `peek()` returns the
  front without removing it (or `None`/`null`); `empty()` returns a
  boolean. Transfer elements from the inbox to the outbox only when the
  outbox is empty, so that every operation is amortised O(1).
languages: [python, javascript]
entry: QueueViaStacks
starter:
  python: |
    class QueueViaStacks:
        def __init__(self):
            self.inbox = []
            self.outbox = []

        def push(self, x):
            # TODO
            pass

        def pop(self):
            # TODO
            return None

        def peek(self):
            # TODO
            return None

        def empty(self):
            return not self.inbox and not self.outbox
  javascript: |
    class QueueViaStacks {
      constructor() {
        this.inbox = [];
        this.outbox = [];
      }
      push(x) {
        // TODO
      }
      pop() {
        // TODO
        return null;
      }
      peek() {
        // TODO
        return null;
      }
      empty() { return this.inbox.length === 0 && this.outbox.length === 0; }
    }
tests:
  - args: [["push", 1], ["push", 2], ["peek"], ["pop"], ["empty"], ["pop"], ["empty"]]
    expected: [null, null, 1, 1, false, 2, true]
  - args: [["empty"], ["push", 3], ["pop"], ["push", 4], ["push", 5], ["pop"], ["peek"]]
    expected: [true, null, 3, null, null, 4, 5]
    label: pushes after a transfer keep FIFO order
  - args: [["pop"], ["peek"], ["empty"]]
    expected: [null, null, true]
    label: empty queue
  - args: [["push", 1], ["pop"], ["push", 2], ["push", 3], ["pop"], ["push", 4], ["pop"], ["pop"], ["pop"]]
    expected: [null, 1, null, null, 2, null, 3, 4, null]
    hidden: true
hints:
  - "Before `pop` or `peek`: if the outbox is empty, pop everything from the inbox and push it onto the outbox."
  - "If both stacks are empty after the transfer, return null."
```

## Senior signals

- You spot `pop(0)` / `shift()` in a loop as O(n²), can quote the scale at which it hurts (hundreds of milliseconds at 10⁵, tens of seconds at 10⁶), and replace it with a deque, a head index or a ring.
- You can implement a ring buffer from memory, trace it through wrap-around, choose a full/empty resolution deliberately, and grow it by copying in logical order.
- You explain the two-stack queue's amortised O(1) with the "each element moves three times" argument and know the mistake that breaks it.
- You know what `deque` (64-slot blocks), `ArrayDeque` and `VecDeque` (rings) and a Go channel (`hchan` ring plus wait queues) are underneath, and why Java's `Stack` and `LinkedList` are the wrong tools.
- You see a bounded queue as a backpressure mechanism, can name the policies when it is full, and can describe the single-producer/single-consumer lock-free ring.
- You know a priority queue is a heap, not a queue, and say so when the requirement is ordering by priority.

## Check yourself

```quiz
- q: >-
    A BFS in JavaScript uses `queue.shift()` to dequeue and visits 200,000 nodes. What is its likely time complexity at that scale?
  options: ["O(V²), because each shift moves the remaining elements", "O(V + E), because shift is O(1) amortised like pop", "O(V log V), because V8 shifts arrays in logarithmic time", "O(V·E), because each shift rescans the edge list"]
  answer: 0
  explanation: >-
    `shift` removes the first element and moves the rest, so each dequeue is O(current length). Over V dequeues this is quadratic: 212 ms to drain 100,000 elements and 29 s for a million on Node 24. V8's left-trimming fast path only helps small arrays, so shift is not O(1) like pop. A head index or a ring buffer restores O(V + E).
- q: >-
    In a ring buffer with only `head` and `tail` indices, why is `head == tail` ambiguous?
  options: ["It only means empty, since tail can never lap head", "It holds both when the buffer is empty and when it is full", "It only means full, since empty resets both to slot 0", "It signals a wrap bug, since valid indices never coincide"]
  answer: 1
  explanation: >-
    After writing exactly `capacity` elements, tail wraps to equal head, the same state as an empty buffer. Tail can lap around to head, so the state is not only "empty". Store a count, leave one slot unused, or use unbounded indices to distinguish the two.
- q: >-
    In the two-stack queue, what breaks the amortised O(1) guarantee?
  options: ["Interleaving enqueues and dequeues instead of batching", "Transferring inbox to outbox while outbox is non-empty", "Backing both stacks with arrays that sometimes resize", "Calling peek, since it can trigger a transfer with no pop"]
  answer: 1
  explanation: >-
    Each element should move from inbox to outbox exactly once. Transferring while outbox still has elements would require moving them back to preserve order, and elements would bounce on every operation, making it O(n) each. Interleaving is fine: every element is still pushed, moved and popped once.
- q: >-
    You are growing a ring buffer that currently has head = 2, tail = 2 (wrapped) and 4 elements in a capacity-4 array. What is the correct way to copy into the new array?
  options: ["Copy slots 0..3 into new slots 0..3 and keep head at slot 2", "Double the capacity in place and let the modulo re-wrap", "Copy slots 2, 3, 0, 1 into new slots 0..3 and set head = 0", "Copy slots 0..3 into new slots 4..7 and set head = 6"]
  answer: 2
  explanation: >-
    The logical sequence starts at head and wraps. Copying physical slots leaves the wrapped elements in the wrong place once the capacity (and therefore the modulus) changes, leaving a gap in the middle of the ring. Un-wrap into the new array and reset head.
- q: >-
    A producer thread enqueues into a bounded ring buffer that is full. Which of these is NOT a reasonable policy?
  options: ["Block the producer until space becomes available", "Return an error so that the caller can shed load", "Drop the new item and increment a metric", "Silently grow the buffer with no upper bound"]
  answer: 3
  explanation: >-
    Unbounded growth defeats the purpose of a bounded queue: memory grows until the process dies, later and less diagnosably. Blocking, dropping and erroring are all forms of backpressure with explicit trade-offs.
- q: >-
    `collections.deque` gives O(1) at both ends, yet `dq[len(dq) // 2]` on a deque of a million elements is slow. Why?
  options: ["Python copies the deque to a list before indexing into it", "Indexing rotates the deque to the position, then rotates it back", "The deque is a linked list of 64-slot blocks, so indexing walks block links", "The deque stores elements in hash order, so positions need a scan"]
  answer: 2
  explanation: >-
    Reaching position i means following about i / 64 block pointers from the nearer end, which is O(n) in the middle. C++'s std::deque keeps an array of chunk pointers and indexes in O(1). Nothing is rotated, copied or hashed; if you need random access with cheap ends, use a ring buffer.
```
