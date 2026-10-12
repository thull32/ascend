---
lesson: stacks-and-queues
source: c72489c94cc3ba0c
---
## 1

A breadth-first search in JavaScript dequeues with the array's shift method, and visits 200 thousand nodes. What is its likely time complexity at that scale?

A, quadratic in the number of vertices, because each shift moves the remaining elements. B, vertices plus edges, because shift is constant time amortised, like pop. C, V log V, because V8 shifts arrays in logarithmic time. D, vertices times edges, because each shift rescans the edge list.

[think]

The answer is A: quadratic in the number of vertices, because each shift moves the remaining elements.

Shift removes the first element and moves the rest, so each dequeue costs the current length. Over all the dequeues that is quadratic: 212 milliseconds to drain 100 thousand elements, and 29 seconds for a million, on Node 24. V8's left-trimming fast path only helps small arrays. A head index or a ring buffer restores vertices plus edges.

## 2

A ring buffer keeps only a head index and a tail index. Why is "head equals tail" ambiguous?

A, it only means empty, since tail can never lap head. B, it holds both when the buffer is empty and when it is full. C, it only means full, since an empty buffer resets both to slot zero. D, it signals a wrap bug, since valid indexes never coincide.

[think]

The answer is B: it holds both when the buffer is empty and when it is full.

After you write exactly capacity elements, tail wraps around to equal head, which is the same state as an empty buffer. Tail can lap round to head, so the state does not only mean empty. Store a count, leave one slot unused, or use unbounded indexes to tell the two apart.

## 3

In the queue built from two stacks, an inbox and an outbox, what breaks the amortised constant-time guarantee?

A, interleaving enqueues and dequeues instead of batching them. B, transferring from inbox to outbox while the outbox is not empty. C, backing both stacks with arrays that sometimes resize. D, calling peek, since it can trigger a transfer with no pop.

[think]

The answer is B: transferring from inbox to outbox while the outbox is not empty.

Each element should move from inbox to outbox exactly once. Transferring while the outbox still holds elements would mean moving them back to keep the order, and elements would bounce on every operation, making each one linear. Interleaving is fine: every element is still pushed, moved and popped once.

## 4

You are growing a ring buffer of capacity 4 that is full: it holds 4 elements, and head and tail are both at slot 2, after wrapping. What is the correct way to copy into the new array?

A, copy slots 0 to 3 into new slots 0 to 3, and keep head at slot 2. B, double the capacity in place, and let the modulo re-wrap. C, copy slots 2, 3, 0, 1 into new slots 0 to 3, and set head to 0. D, copy slots 0 to 3 into new slots 4 to 7, and set head to 6.

[think]

The answer is C: copy slots 2, 3, 0, 1 into new slots 0 to 3, and set head to 0.

The logical sequence starts at head and wraps. Copying the physical slots as they are leaves the wrapped elements in the wrong place once the capacity, and therefore the modulus, changes, leaving a gap in the middle of the ring. Unwrap into the new array and reset head.

## 5

A producer thread enqueues into a bounded ring buffer that is full. Which of these is not a reasonable policy?

A, block the producer until space becomes available. B, return an error, so that the caller can shed load. C, drop the new item and increment a metric. D, silently grow the buffer with no upper bound.

[think]

The answer is D: silently grow the buffer with no upper bound.

Unbounded growth defeats the purpose of a bounded queue: memory grows until the process dies, later and less diagnosably. Blocking, dropping and returning an error are all forms of backpressure, each with an explicit trade-off.

## 6

Python's deque gives constant time at both ends, yet indexing into the middle of a deque of a million elements is slow. Why?

A, Python copies the deque to a list before indexing into it. B, indexing rotates the deque to the position, then rotates it back. C, the deque is a linked list of 64-slot blocks, so indexing walks block links. D, the deque stores elements in hash order, so positions need a scan.

[think]

The answer is C: the deque is a linked list of 64-slot blocks, so indexing walks block links.

Reaching position i means following about i over 64 block pointers from the nearer end, which is linear in the middle. C plus plus's deque keeps an array of chunk pointers and indexes in constant time. Nothing is rotated, copied or hashed. If you need random access with cheap ends, use a ring buffer.
