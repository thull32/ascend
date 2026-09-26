---
slug: design-circular-queue
title: Design Circular Queue
difficulty: medium
patterns: [design]
lists: [ascend-150]
companies: [amazon, meta, microsoft, cisco]
order: 2
lesson: interview-patterns/combinatorial-patterns/design-problems
hints:
  - "A fixed-size array with a `head` index and a `count`. The rear element lives at `(head + count - 1) % k`, and the next free slot at `(head + count) % k`."
  - "Storing `count` avoids the classic ambiguity where `head == tail` could mean either empty or full."
  - "`dequeue` advances `head` by one modulo `k` and decrements `count`; nothing needs to be cleared."
signatures:
  python:
    name: MyCircularQueue
    starter: |
      class MyCircularQueue:
          def __init__(self, k: int):
              pass

          def enqueue(self, value: int) -> bool:
              pass

          def dequeue(self) -> bool:
              pass

          def front(self) -> int:
              pass

          def rear(self) -> int:
              pass

          def is_empty(self) -> bool:
              pass

          def is_full(self) -> bool:
              pass
  javascript:
    name: MyCircularQueue
    starter: |
      class MyCircularQueue {
        constructor(k) {
        }
        enqueue(value) {
        }
        dequeue() {
        }
        front() {
        }
        rear() {
        }
        is_empty() {
        }
        is_full() {
        }
      }
tests:
  - args: [["__init__", 3], ["enqueue", 1], ["enqueue", 2], ["enqueue", 3], ["enqueue", 4], ["rear"], ["is_full"], ["dequeue"], ["enqueue", 4], ["rear"], ["front"]]
    expected: [null, true, true, true, false, 3, true, true, true, 4, 2]
  - args: [["__init__", 1], ["is_empty"], ["front"], ["rear"], ["dequeue"], ["enqueue", 7], ["is_full"], ["front"], ["rear"], ["enqueue", 8], ["dequeue"], ["is_empty"], ["front"]]
    expected: [null, true, -1, -1, false, true, true, 7, 7, false, true, true, -1]
    label: capacity one
  - args: [["__init__", 2], ["enqueue", 5], ["enqueue", 6], ["dequeue"], ["dequeue"], ["dequeue"], ["enqueue", 9], ["front"], ["rear"]]
    expected: [null, true, true, true, true, false, true, 9, 9]
    label: dequeue on empty fails
  - args: [["__init__", 4], ["is_full"], ["enqueue", 1], ["enqueue", 2], ["enqueue", 3], ["is_full"], ["enqueue", 4], ["is_full"]]
    expected: [null, false, true, true, true, false, true, true]
  - args: [["__init__", 2], ["enqueue", 1], ["enqueue", 2], ["dequeue"], ["enqueue", 3], ["dequeue"], ["enqueue", 4], ["dequeue"], ["enqueue", 5], ["front"], ["rear"], ["is_full"]]
    expected: [null, true, true, true, true, true, true, true, true, 4, 5, true]
    hidden: true
    label: indices wrap around several times
  - args: [["__init__", 3], ["enqueue", 10], ["enqueue", 20], ["front"], ["rear"], ["dequeue"], ["front"], ["rear"], ["is_empty"], ["dequeue"], ["is_empty"], ["rear"]]
    expected: [null, true, true, 10, 20, true, 20, 20, false, true, true, -1]
    hidden: true
  - args: [["__init__", 3], ["enqueue", 1], ["enqueue", 2], ["enqueue", 3], ["dequeue"], ["dequeue"], ["enqueue", 4], ["enqueue", 5], ["front"], ["rear"], ["dequeue"], ["front"]]
    expected: [null, true, true, true, true, true, true, true, 3, 5, true, 4]
    hidden: true
    label: rear wraps to index zero
time_limit_ms: 4000
---
Design a bounded first-in-first-out queue backed by a fixed-size buffer. Implement a class `MyCircularQueue` with:

- `__init__(k)` — create a queue that can hold at most `k` elements.
- `enqueue(value)` — add `value` at the rear; return `true` on success, `false` if the queue is full.
- `dequeue()` — remove the front element; return `true` on success, `false` if the queue is empty.
- `front()` — return the front element, or `-1` if empty.
- `rear()` — return the rear element, or `-1` if empty.
- `is_empty()` and `is_full()` — the obvious booleans.

Every operation must be `O(1)`. Tests are given as a sequence of method calls beginning with `__init__`; the expected output is the list of return values in order, with `null` for the constructor.

### Examples

| Calls | Returns | Why |
|---|---|---|
| `MyCircularQueue(3), enqueue(1), enqueue(2), enqueue(3), enqueue(4)` | `null, true, true, true, false` | Fourth insert fails, capacity is 3 |
| `rear(), is_full(), dequeue(), enqueue(4), rear(), front()` (continuing) | `3, true, true, true, 4, 2` | The freed slot at index 0 is reused; `2` is now at the front |
| `MyCircularQueue(1), dequeue(), front()` | `null, false, -1` | Empty queue |

### Constraints

- `1 ≤ k ≤ 1000`
- `0 ≤ value ≤ 1000`
- At most `3000` calls in total

### Follow-up

The interviewer asks: "Why not just use a list with `pop(0)`, or a deque?" Then: "This buffer is shared between one producer thread and one consumer thread. What can go wrong, and what is the minimum synchronisation?"

## Solution

### The naive approach

A Python list where `enqueue` appends and `dequeue` does `pop(0)`. `pop(0)` shifts every remaining element, so it is `O(n)`, and the list also has no notion of capacity. `collections.deque` fixes both (`maxlen` and `O(1)` at both ends), and in production you would use it; but the interview is asking you to build the thing `deque` is built from.

### The insight

A queue only ever grows at one end and shrinks at the other, so the live elements occupy a contiguous run of slots that drifts forward through the buffer. Let the run wrap around: slot `k - 1` is followed by slot `0`. With a `head` index and a `count`, the front is at `head`, the rear at `(head + count - 1) % k`, and the next free slot at `(head + count) % k`. `enqueue` writes to the free slot and increments `count`; `dequeue` advances `head` and decrements `count`. No element ever moves.

### The optimal approach

```python
class MyCircularQueue:
    def __init__(self, k: int):
        self.buf = [0] * k
        self.k = k
        self.head = 0
        self.count = 0

    def enqueue(self, value: int) -> bool:
        if self.count == self.k:
            return False
        self.buf[(self.head + self.count) % self.k] = value
        self.count += 1
        return True

    def dequeue(self) -> bool:
        if self.count == 0:
            return False
        self.head = (self.head + 1) % self.k
        self.count -= 1
        return True

    def front(self) -> int:
        return -1 if self.count == 0 else self.buf[self.head]

    def rear(self) -> int:
        return -1 if self.count == 0 else self.buf[(self.head + self.count - 1) % self.k]

    def is_empty(self) -> bool:
        return self.count == 0

    def is_full(self) -> bool:
        return self.count == self.k
```

Every operation is a constant number of arithmetic steps: `O(1)`. Space `O(k)`, fixed at construction.

The alternative is `head` and `tail` indices without a count. Then `head == tail` is ambiguous (empty or full), and the usual fix is to allocate `k + 1` slots and treat "tail one behind head" as full, wasting a slot. Storing the count is simpler and is what most textbook ring buffers do; lock-free ring buffers prefer the two-index form because each index is then written by only one side.

### Common mistakes

- Computing `rear` as `buf[tail - 1]` without the modulus, which reads index `-1` (silently the last slot in Python, and wrong when the queue has wrapped).
- Forgetting the wrap in `enqueue` so writes run off the end of the array.
- Treating `head == tail` as empty *and* letting the queue fill completely, which makes a full queue report empty.

### How to discuss it

Say "ring buffer: head plus count, modular indexing, nothing moves." Explain the `k + 1` slot trick when asked about the two-index variant. For the producer-consumer follow-up: the danger is that `count` is read and written by both threads, so `count += 1` and `count -= 1` race and can lose an update. The minimum fix is a lock around each operation, or, with the two-index form, a single-producer single-consumer design where the producer writes only `tail` and the consumer writes only `head`, each read by the other with acquire/release ordering, which needs no lock at all. Naming SPSC ring buffers as the reason two-index designs exist in the first place is the senior-level connection.
