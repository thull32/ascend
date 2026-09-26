---
slug: stacks-and-queues
title: Stacks and queues
description: Array-backed stacks, why naive array queues are O(n), ring buffers with the full/empty problem solved, the two-stack queue with its amortised proof, and what deque, ArrayDeque and VecDeque really are.
minutes: 40
difficulty: easy
tags: [stack, queue, deque, ring-buffer, amortized, two-stacks]
problems: [valid-parentheses, min-stack, design-circular-queue]
---
A worker pulls jobs from the front of a list and producers append to the back. It runs fine in staging with a hundred jobs. In production, with a backlog of two million, each pull takes milliseconds and the worker falls further behind the harder it works. Nothing in the code looks quadratic; there is one `jobs.pop(0)` per job. But `pop(0)` on an array shifts every remaining element, so processing the backlog costs 2 million × 2 million / 2 element moves.

Stacks and queues are trivial to specify (add and remove at one end; add at one end and remove at the other) and easy to build wrongly, because the natural array operations only give you O(1) at *one* end. This lesson is about getting O(1) at both.

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

A linked-list stack (push and pop at the head) is also O(1) per operation with no amortisation and no resize pause, at the cost of a pointer per element and a cache miss per access. It is the right choice only when elements must not move (a pointer to a stack slot must stay valid across pushes) or when you cannot tolerate the occasional O(n) resize. Interpreters and language runtimes use a contiguous array for the value stack for exactly the cache reason.

## Queues on arrays: the wrong way

A queue needs `enqueue` at the back and `dequeue` from the front. Appending at the back is O(1). Removing from the front of an array is the problem: every remaining element shifts left by one.

```python
queue = []
queue.append(x)     # O(1)
queue.pop(0)        # O(n): shifts n-1 elements
```

JavaScript's `shift()` has the same cost. V8 has a fast path that moves the array's start pointer for small arrays, and it is easy to convince yourself `shift` is fine by benchmarking with 1,000 elements; at 100,000 it is not. Treat both as O(n).

Two O(1) fixes on a plain array:

1. **A head index.** Keep `head`; `dequeue` returns `a[head]` and increments `head` without touching the array. Memory is never reclaimed at the front, so periodically compact (copy `a[head:]` to a new array when `head` passes half the length). Amortised O(1), trivially correct, and a fine interview answer.
2. **A ring buffer.** Reuse the front slots by wrapping indices around. This is what every production queue does.

## Ring buffers

A ring buffer (circular buffer) is a fixed-size array plus two indices: `head` (next slot to read) and `tail` (next slot to write). Both advance with `(i + 1) mod capacity`, so after reaching the end they wrap to slot 0 and reuse the space freed by earlier dequeues.

```text
capacity 4, after enqueue 1,2,3, dequeue, dequeue, enqueue 4, enqueue 5:

slot:   0    1    2    3
       [5]  [·]  [3]  [4]
        ^tail      ^head          count = 3
```

Elements are read in order `3, 4, 5`: head at slot 2, then 3, then wraps to 0.

### The full/empty problem

With only `head` and `tail`, the states "empty" and "full" both have `head == tail`. Three standard resolutions:

- **Keep a count.** Empty when `count == 0`, full when `count == capacity`. Simplest; one extra integer.
- **Leave one slot unused.** Full when `(tail + 1) mod capacity == head`. Costs one slot; used when the producer and consumer are different threads and a shared `count` would need synchronisation.
- **Unbounded indices.** Let `head` and `tail` grow forever and take `mod capacity` on access; `tail − head` is the count. Requires that capacity is a power of two if you want the modulo to be a mask, which is why so many ring buffers have power-of-two sizes.

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

Deriving `tail` from `head + count` means only two fields are stored and they cannot disagree; that is a small robustness win worth mentioning.

```viz
{"type": "stack-queue", "algorithm": "queue-ops", "operations": [["enqueue", 1], ["enqueue", 2], ["enqueue", 3], ["dequeue"], ["dequeue"], ["enqueue", 4], ["enqueue", 5], ["dequeue"], ["dequeue"], ["dequeue"]], "title": "Queue: first in, first out"}
```

### Growing a ring buffer

When a bounded ring is not acceptable, grow on full: allocate `2 × capacity`, copy the elements *in logical order* (from `head` around the wrap) into the new array starting at slot 0, reset `head = 0`. Copying the raw slots in physical order is the classic bug; it leaves a gap in the middle of the ring. The amortised cost is O(1) by the same doubling argument as [dynamic arrays](/learn/data-structures/arrays-strings/arrays-and-dynamic-arrays).

Bounded rings are a feature, not a limitation, in systems code: a fixed-size queue between a producer and a consumer is the simplest form of **backpressure**. When it is full the producer must block, drop or shed load, and each of those is a deliberate policy rather than an out-of-memory crash an hour later. Kernel network buffers, audio pipelines, disruptor-style trading systems and Go's buffered channels are all bounded rings. [Resilience patterns](/learn/system-design/building-blocks/resilience-patterns) covers the policy side.

## A queue from two stacks

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

```viz
{"type": "stack-queue", "algorithm": "queue-via-two-stacks", "operations": [["enqueue", 1], ["enqueue", 2], ["enqueue", 3], ["dequeue"], ["enqueue", 4], ["dequeue"], ["dequeue"], ["dequeue"]], "title": "Two stacks: the transfer reverses order"}
```

A single `dequeue` can cost O(n) when it triggers the transfer. But each element is pushed onto `inbox` once, moved to `outbox` once, and popped from `outbox` once: three O(1) operations over its lifetime. So `n` operations cost O(n) total, and the amortised cost per operation is O(1). The mistake that breaks the bound is transferring when `outbox` is *non-empty* (moving elements back and forth on every call); the transfer must happen only when `outbox` runs dry.

The pattern generalises: two stacks give you a queue, two queues give you a (slow) stack, and a stack plus an auxiliary stack of running minimums gives you a [min-stack](/practice/min-stack). It is also how functional languages implement queues with immutable lists (Okasaki's banker's queue).

## Deques

A deque (double-ended queue) supports push and pop at both ends. A ring buffer does it naturally: `push_front` decrements `head` (mod capacity), `push_back` increments `tail`. Every language's "real" queue is a deque:

| Language | Type | Implementation | Notes |
|---|---|---|---|
| Python | `collections.deque` | Doubly linked list of 64-slot blocks | O(1) at both ends; indexing into the middle is O(n); `maxlen` gives a bounded ring |
| Java | `ArrayDeque` | Growable ring buffer | Preferred over `Stack` and `LinkedList` for both stack and queue use; does not allow `null` |
| Rust | `VecDeque` | Growable ring buffer | `make_contiguous` when you need a slice |
| Go | none in std | Slice with head index, or `container/list` | Channels are bounded rings for concurrent use |
| C++ | `std::deque` | Array of fixed-size chunks with an index map | O(1) random access, unlike Python's |
| JavaScript | none | Array (`shift` is O(n)) | Implement a head-index queue or a ring; several npm packages do |

The interview implication for JavaScript: if a BFS is going to process 10⁵ nodes, `queue.shift()` makes it quadratic. Use a head index (`while (head < queue.length) { const x = queue[head++]; … }`); the array is never shrunk but the traversal is linear.

## FIFO is a policy, not a law

The queue discipline is a decision with production consequences. A plain FIFO request queue behaves badly under overload: when the server falls behind, the requests at the front are the *oldest*, and by the time they are served the client has often already timed out and retried, so the server spends its capacity producing responses nobody will read while the retries pile up behind them. Facebook's "Fail at Scale" write-up describes switching request queues to **adaptive LIFO** under overload (serve the newest request first, since it is the one most likely to still have a waiting client) combined with **CoDel**-style queue timeouts (drop requests that have already waited longer than a budget). Goodput went up because the queue stopped doing work that was already wasted.

The same reasoning applies to job queues (age-based priority to prevent starvation), to thread pools (bounded queues that reject rather than buffer forever), and to any system where a queued item has a deadline. When you design a queue, decide: what happens when it is full, what happens to items that have waited too long, and whether newest-first would serve users better than oldest-first when you are behind.

## Choosing between them

| Need | Structure | Why |
|---|---|---|
| Undo, backtracking, matching brackets, DFS, expression evaluation | Stack | Most-recent-first is the semantics |
| BFS, task scheduling, buffering between producer and consumer, rate limiting by arrival | Queue | Arrival order is the semantics |
| Sliding windows, work-stealing (steal from the far end), palindromes | Deque | Need both ends |
| Fixed memory, backpressure, lock-free single-producer/single-consumer | Ring buffer | Bounded and cache-friendly |
| Ordering by priority rather than arrival | Priority queue (heap) | Not a queue at all; see [Binary heap mechanics](/learn/data-structures/heaps/binary-heap-mechanics) |

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

- You spot `pop(0)` / `shift()` in a loop as O(n²) and replace it with a deque, a head index or a ring.
- You can implement a ring buffer from memory, choose a full/empty resolution deliberately, and grow it by copying in logical order.
- You explain the two-stack queue's amortised O(1) with the "each element moves three times" argument and know the mistake that breaks it.
- You know what `deque`, `ArrayDeque` and `VecDeque` are underneath and why Java's `Stack` and `LinkedList` are the wrong tools.
- You see a bounded queue as a backpressure mechanism and can name the policies when it is full.
- You know a priority queue is a heap, not a queue, and say so when the requirement is ordering by priority.

## Check yourself

```quiz
- q: >-
    A BFS in JavaScript uses `queue.shift()` to dequeue and visits 200,000 nodes. What is its likely time complexity in practice?
  options: ["O(V + E), the usual BFS cost", "O(V²) because each shift moves the remaining elements", "O(V log V) because shift is logarithmic", "O(E²)"]
  answer: 1
  explanation: >-
    `shift` removes the first element and moves the rest, so each dequeue is O(current length). Over V dequeues this is quadratic. A head index or a ring buffer restores O(V + E).
- q: >-
    In a ring buffer with only `head` and `tail` indices, why is `head == tail` ambiguous?
  options: ["It cannot occur", "It means both empty (nothing written since last read) and full (tail has wrapped around to head)", "It only means empty", "It only means full"]
  answer: 1
  explanation: >-
    After writing exactly `capacity` elements, tail wraps to equal head, the same state as an empty buffer. Store a count, leave one slot unused, or use unbounded indices to distinguish the two.
- q: >-
    In the two-stack queue, what breaks the amortised O(1) guarantee?
  options: ["Using arrays instead of linked lists", "Transferring elements from inbox to outbox even when the outbox is not empty", "Calling peek before pop", "Pushing more than n elements"]
  answer: 1
  explanation: >-
    Each element should move from inbox to outbox exactly once. Transferring while outbox still has elements would require moving them back to preserve order, and elements would bounce on every operation, making it O(n) each.
- q: >-
    You are growing a ring buffer that currently has head = 2, tail = 1 (wrapped) and 4 elements in a capacity-4 array. What is the correct way to copy into the new array?
  options: ["Copy slots 0..3 in physical order and keep head = 2", "Copy in logical order starting from head (slots 2, 3, 0, 1) into new slots 0..3 and set head = 0", "Copy only slots 0..1", "Double the capacity without copying; the modulo handles it"]
  answer: 1
  explanation: >-
    The logical sequence starts at head and wraps. Copying physical slots leaves the wrapped elements in the wrong place once the capacity (and therefore the modulus) changes. Un-wrap into the new array and reset head.
- q: >-
    A producer thread enqueues into a bounded ring buffer that is full. Which of these is NOT a reasonable policy?
  options: ["Block the producer until space is available", "Drop the new item and increment a metric", "Silently grow the buffer without limit", "Return an error so the caller can shed load"]
  answer: 2
  explanation: >-
    Unbounded growth defeats the purpose of a bounded queue: memory grows until the process dies, later and less diagnosably. Blocking, dropping and erroring are all forms of backpressure with explicit trade-offs.
```
