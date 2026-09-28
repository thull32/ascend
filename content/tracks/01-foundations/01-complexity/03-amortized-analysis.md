---
slug: amortized-analysis
title: "Amortised analysis: paying for the expensive operation in advance"
description: Why a dynamic array's append is O(1) even though some appends copy everything, the three ways to prove it (aggregate, accounting, potential), and how amortised differs from average and worst case in ways that show up on latency graphs.
minutes: 45
difficulty: easy
tags: [complexity, amortized, dynamic-array, accounting-method, potential-method]
problems: [min-stack, design-circular-queue]
---
Appending to a Python list, a JavaScript array, a Go slice or a Rust `Vec` is "O(1)". Yet you know that these structures live in a contiguous block of memory, that the block has a fixed capacity, and that when it fills up the runtime has to allocate a bigger block and copy every element across. That copy is $O(n)$. So the 1,025th append onto a list with capacity 1,024 costs about a thousand element moves, and calling that "O(1)" looks like a lie.

It is not a lie, but it is a different kind of claim from the ones in the previous two lessons, and it has a precise meaning that you need to be able to state and defend. It also has a practical shadow: the expensive operation really does happen, it happens at a moment you did not choose, and on a hash table with a million entries it is a pause you can measure in tens of milliseconds.

## The claim, precisely

**Amortised cost** is a worst-case bound on the *total* cost of a sequence of operations, divided by the number of operations. If any sequence of $m$ operations on a structure costs at most $m \cdot c$ in total, each operation has amortised cost $c$, even if some individual operations cost far more than $c$.

Three things this is *not*:

- It is not **average case**. Average case is an expectation over a probability distribution of inputs. Amortised analysis has no probability in it; it is a worst-case guarantee over any sequence.
- It is not **worst case per operation**. The worst single append really is $O(n)$. Amortised $O(1)$ means the expensive ones are rare enough, in a provable way, that they cannot dominate.
- It is not a promise about **latency**. If your service handles one request per append, the request that triggers the copy is slow, and amortisation does nothing for that user.

Watch the growth happen before reading the proof.

```viz
{"type": "memory", "scenario": "dynamic-array-growth", "title": "Doubling a dynamic array", "caption": "Most appends write into spare capacity. When the block is full, a new block of twice the size is allocated and every element is copied."}
```

## Nine pushes, three proofs, one table

Start with an empty array of capacity 0. The first push allocates capacity 1; after that, a push into a full array of capacity $k$ allocates $2k$ and copies $k$ elements. Real cost is copies plus one write. The table also tracks the two bookkeeping devices the proofs below use: the **credit** left over if every push is charged 3 units, and the **potential** $\Phi = 2 \cdot \text{size} - \text{capacity}$.

| Push | Capacity | Copies | Real cost | Cumulative real | Credit (3 per push) | $\Phi$ after | $\Delta\Phi$ | Amortised = real + $\Delta\Phi$ |
|---|---|---|---|---|---|---|---|---|
| 1 | 0 → 1 | 0 | 1 | 1 | 2 | 1 | +1 | 2 |
| 2 | 1 → 2 | 1 | 2 | 3 | 3 | 2 | +1 | 3 |
| 3 | 2 → 4 | 2 | 3 | 6 | 3 | 2 | 0 | 3 |
| 4 | 4 | 0 | 1 | 7 | 5 | 4 | +2 | 3 |
| 5 | 4 → 8 | 4 | 5 | 12 | 3 | 2 | −2 | 3 |
| 6 | 8 | 0 | 1 | 13 | 5 | 4 | +2 | 3 |
| 7 | 8 | 0 | 1 | 14 | 7 | 6 | +2 | 3 |
| 8 | 8 | 0 | 1 | 15 | 9 | 8 | +2 | 3 |
| 9 | 8 → 16 | 8 | 9 | 24 | 3 | 2 | −6 | 3 |

Nine pushes cost 24 real units. Charged at 3 each they would cost 27, and the credit column never goes negative, so the charge always covers the work. The amortised column says 3 for every push after the first, whether or not that push copied. Each of the three methods is a way of reading this table.

## Method 1: aggregate (add it up)

The copies happen at the pushes that find the array full, when its size is $1, 2, 4, 8, \ldots$, and each copies that many elements. In the table: $1 + 2 + 4 + 8 = 15$ copies for nine pushes. For $n = 1{,}000$ pushes the copies are

$$
1 + 2 + 4 + \cdots + 512 = 1{,}023 < 2n.
$$

In general the copy costs form a geometric series whose sum is less than $2n$ (the sum of powers of two below $n$ is at most $2n - 1$). Add the $n$ actual writes and the total for $n$ pushes is under $3n$. Divide by $n$: amortised cost per push is under 3, which is $O(1)$.

That is the whole aggregate argument: bound the total for the sequence, divide. It is the method to reach for first, and the one most interviewers expect.

## Method 2: accounting (charge each cheap operation extra)

Sometimes you cannot see the total directly, and a bookkeeping metaphor helps. Charge each push a fixed amount, 3 coins. One coin pays for writing the element. The other two are saved with the element as credit.

When the array of size $k$ fills and must be copied to a new block of size $2k$, you need $k$ coins to pay for moving $k$ elements. Where do they come from? Since the last resize, $k/2$ new elements were pushed, and each brought 2 spare coins: $k/2 \times 2 = k$ coins, exactly enough. Read the credit column: it drops to 3 after every resize and climbs by 2 per cheap push, so it never goes negative and the total real cost is never more than the total charged, $3n$.

The accounting method turns "why is it cheap" into "who paid for it", and that often makes the reason obvious: every element pays for its own first copy and for one older element's copy.

## Method 3: potential (a function that stores the debt)

The most general method defines a potential function $\Phi$ on the state of the structure, a number that is large when expensive work is imminent and drops when that work is done. The amortised cost of an operation is its real cost plus the change in potential:

$$
\hat{c}_i = c_i + \Phi(S_i) - \Phi(S_{i-1}).
$$

Summing over a sequence, the potential differences telescope to $\Phi(\text{end}) - \Phi(\text{start})$, so if $\Phi$ starts at zero and is never negative, the total amortised cost bounds the total real cost.

For the dynamic array take $\Phi = 2 \cdot \text{size} - \text{capacity}$. Right after a resize the size is half the capacity, so $\Phi$ is small; as the array fills, $\Phi$ climbs to equal the size when full. Check the table:

- A push with room (push 4): real cost 1, size goes up by 1 so $\Phi$ rises by 2. Amortised $1 + 2 = 3$.
- A push that resizes from size $k$ to capacity $2k$ (push 9, $k = 8$): real cost $k + 1 = 9$. Before: $\Phi = 2 \cdot 8 - 8 = 8$. After: size 9, capacity 16, $\Phi = 2$. Change $= -6 = 2 - k$. Amortised $(k + 1) + (2 - k) = 3$.

Every push costs amortised 3. The potential method is what you use when the structure is more complex than an array (splay trees, Fibonacci heaps, union-find) and neither of the first two methods is easy to make precise.

| Method | You must find | Gives you | Hardest part | Reach for it when |
|---|---|---|---|---|
| Aggregate | a closed form for the total cost of any $m$ operations | one number: total / $m$ | seeing the series | one operation type dominates and its cost pattern is visible (doubling, two-stack queue) |
| Accounting | a charge per operation type whose credit never goes negative | a per-operation cost that can differ by operation type | choosing charges that cover every expensive case | several operation types share the work (stack with multipop, binary counter) |
| Potential | a function of the state, $\Phi \ge 0$, $\Phi(\text{start}) = 0$ | a per-operation cost from real cost + $\Delta\Phi$ | inventing $\Phi$ | the state is complex (splay trees, union-find, Fibonacci heaps) and you need a proof, not intuition |

## Why the growth factor is not 1, and why it is not 10

If you grow by a *constant amount* instead of a constant *factor* (say, add 100 slots when full), the copies happen every 100 pushes and each copies everything so far: $100 + 200 + 300 + \cdots + n = \Theta(n^2/100)$. Still quadratic. Constant additive growth does not amortise; only multiplicative growth does. This is a real bug people write when they implement their own buffer.

Any factor above 1 gives amortised $O(1)$, so why 2? Each runtime settles the memory-versus-copies dial differently:

| Runtime | Growth rule | Copies per element (amortised, worst) | Slack after a resize | Note |
|---|---|---|---|---|
| CPython `list` | new capacity $= n + \lfloor n/8 \rfloor + 6$, rounded down to a multiple of 4; measured on 3.14: 4, 8, 16, 24, 32, 40, 52, 64, 76, 92, 108, 128 | ~9 (factor ≈ 1.125) | ~11% | tight memory; relies on `realloc` growing in place or remapping (below) |
| Java `ArrayList` | $1.5\times$ (`old + (old >> 1)`), default initial 10 | 3 | 33% | freed blocks can be reused: $1 + 1.5 < 1.5^2 + \ldots$ |
| V8 (JavaScript arrays) | $1.5\times + 16$ | 3 | 33% | the $+16$ makes tiny arrays grow in useful steps |
| Go slices (1.18+) | $2\times$ below 256 elements, then blending toward $1.25\times$ (`newcap += (newcap + 3 \cdot 256) / 4`) | 2 → 5 | 50% → 20% | rounded up to the allocator's size class |
| Rust `Vec` | $2\times$, minimum non-zero capacity 4 (8 for 1-byte elements) | 2 | 50% | `with_capacity` and `reserve_exact` opt out |
| .NET `List<T>` | $2\times$, default 4 | 2 | 50% | |

The argument for a factor below 2 is about reusing freed memory. With doubling, the blocks you have freed so far have sizes $1, 2, 4, \ldots, 2^{k-1}$, which sum to $2^k - 1$: one less than the next block you need, so the next block can never fit in the space the old ones vacated and the allocator must always find fresh memory. With a factor $r < \phi \approx 1.618$, the sum of the two most recently freed blocks eventually exceeds the next request ($r^{k-2} + r^{k-1} > r^k$ when $1 + r > r^2$), so a moving allocator can recycle them. Java and V8 chose 1.5 for this reason; Rust and .NET chose 2 for fewer copies. Neither is wrong; they sit at different points on the same dial.

## Under the hood: what a resize costs in CPython

The model says "allocate a new block and copy $n$ elements". Two measurements on CPython 3.14 (Linux, glibc, one desktop machine) show where reality diverges, in both directions.

**List appends do not spike.** Timing each of $10^7$ individual appends, no append took longer than 120 µs, and the slow ones were scattered rather than sitting at the resize points. The reason is the allocator: CPython grows a list with `realloc`, and glibc's `realloc` on a block above its mmap threshold (128 KB by default, adjusting upward as the process uses larger blocks) calls the kernel's `mremap`, which moves *page-table entries* rather than bytes. An 80 MB list "copy" then costs a few thousand page-table updates, not ten million element moves. Below the threshold, `realloc` extends in place when the next heap chunk is free, and copies only when it is not. The amortised bound still holds; the constant is far smaller than the model charges, on this platform. (macOS and Windows allocators, and jemalloc or mimalloc if your process uses them, behave differently; the general lesson is that "copy everything" is the worst case, not the typical cost.)

**Dictionaries do spike, and the spikes double.** A `dict` cannot `mremap` its way out of a resize, because every entry has to be rehashed into the new index array. Inserting $5 \times 10^6$ integer keys one at a time, the inserts that took over 50 µs were exactly the resizes:

| Insert number | 2,730 | 5,461 | 10,922 | 21,845 | 43,690 | 87,381 | 174,762 | 349,525 | 699,050 | 1,398,101 |
|---|---|---|---|---|---|---|---|---|---|---|
| Pause | 0.1 ms | 0.2 ms | 0.4 ms | 1.0 ms | 1.9 ms | 3.7 ms | 7.3 ms | 14.9 ms | 29.8 ms | 59.3 ms |

The positions are two thirds of successive powers of two (a CPython dict resizes when it is two-thirds full; $2{,}730 \approx \tfrac{2}{3} \cdot 4{,}096$), and each pause is twice the previous one, about 42 ns per entry rehashed. Amortised over the 1.4 million inserts, the 59 ms is nothing. For the one request that triggered it, it is a 59 ms stall. This is the graph you should have in your head whenever someone says "amortised O(1)".

**Pre-sizing a list does not pay in CPython.** $10^7$ appends took 0.27 s; allocating `[None] * 10**7` and assigning by index took 0.44 s, because `append` runs through a specialised bytecode path while `ys[i] = x` is a general store with a bounds check, and the copies it would have saved were already nearly free. Pre-sizing pays where the copy is real and the API exists: `Vec::with_capacity`, `make([]T, 0, n)`, `new ArrayList<>(n)`, `new HashMap<>(n)`, `make(map[K]V, n)`. In CPython the equivalent win is on dicts and sets, which have no public pre-size API, so the fix there is to build them once and reuse them, or to shard.

## Shrinking, and the thrashing trap

If you also shrink when the array gets sparse, the naive rule (halve capacity when size drops to half) is wrong. Consider an array at capacity 8 with 4 elements: push, and it grows to 16 (copy 8); pop, and it drops to 4 elements at capacity 16, which halves to 8 (copy 4); push again and it grows; pop again and it shrinks. Every operation copies, and the amortised cost is $O(n)$.

The fix is hysteresis: grow at full, shrink only when the size falls to a *quarter* of capacity. Then after any resize the structure is between a quarter and a half full, and at least $n/4$ operations must happen before the next resize. The potential-method proof goes through with $\Phi = |2 \cdot \text{size} - \text{capacity}|$. The lesson generalises: whenever a threshold triggers expensive work in both directions, put a gap between the two thresholds. CPython never shrinks a list's allocation on `pop` unless the size falls below half the capacity, and a dict never shrinks at all until it is rebuilt.

## Other structures that rely on amortisation

The dynamic array is the canonical case, but the same argument appears everywhere.

**Hash table resizing.** Same doubling argument, plus the rehash cost; insert is amortised $O(1)$ on top of the expected $O(1)$ per probe sequence. Two different kinds of "on average" stacked on top of each other, which is worth saying out loud in an interview: the expected bound can be broken by adversarial keys, the amortised bound cannot, and neither bounds the latency of the insert that triggers the rehash.

**Queue from two stacks.** Push goes onto an input stack. Pop takes from an output stack, and if that is empty, moves everything from input to output first. That move is $O(n)$, but each element is moved at most once in its lifetime, so $m$ operations cost at most $2m$ moves plus $m$ pushes/pops: amortised $O(1)$.

```viz
{"type": "stack-queue", "algorithm": "queue-via-two-stacks", "operations": [["push", 1], ["push", 2], ["push", 3], ["pop"], ["push", 4], ["pop"], ["pop"], ["pop"]], "title": "Queue built from two stacks", "caption": "The first pop moves three elements; the next two pops are free. Each element crosses from the input stack to the output stack exactly once."}
```

**Binary counter increment.** Incrementing a $b$-bit counter flips $b$ bits in the worst case (from $0111\ldots1$ to $1000\ldots0$), but bit $i$ only flips once every $2^i$ increments, so $n$ increments flip at most $2n$ bits: amortised $O(1)$. Counting from 0 to 8 flips $1 + 2 + 1 + 3 + 1 + 2 + 1 + 4 = 15$ bits, under $2 \times 8$.

**Union-find with path compression.** Amortised nearly constant ($\alpha(n)$, the inverse Ackermann function, which is at most 4 for any $n$ you will ever see), via a potential argument that is genuinely difficult. You do not need the proof; you need to know that the bound is amortised, so a single `find` can still walk a long chain.

**Splay trees.** Every operation is amortised $O(\log n)$, but a single operation can take $O(n)$. That single slow operation is what rules them out of latency-sensitive code.

## De-amortising: removing the spike instead of hiding it

When the pause is unacceptable, you can spread the expensive operation across the cheap ones so that *every* operation has a worst-case bound. The trick for a dynamic array: when the array of capacity $k$ fills, allocate the $2k$ block but do not copy yet. On each subsequent push, write the new element into the new block and also copy two old elements across. After $k/2$ pushes all $k$ old elements have moved, before the new block is full. Reads check the new block first and fall back to the old. Every push now costs at most 3 element moves, worst case, not amortised.

Real systems do this for hash tables, where the rehash is the pause that hurts. Redis keeps two hash tables during a resize and migrates one bucket per operation (plus a little background work), so a 100-million-key resize never blocks a command. Go's map grows incrementally in the same way, evacuating two old buckets per insert. Java's `ConcurrentHashMap` lets every thread that notices a resize in progress help move a range of bins. The cost is a more complex read path and about 1.5× memory during the migration; the gain is that the worst case looks like the average.

## What amortisation hides

The guarantee is about totals, and production systems care about tails. A few consequences a senior engineer keeps in mind.

**Latency spikes.** The dictionary table above is the shape: pauses at sizes $\tfrac{2}{3} \cdot 2^k$, each twice the last, and the biggest one arrives at the moment the structure is biggest. The [benchmarking lesson](/learn/foundations/complexity/benchmarking-reality) shows the sawtooth this makes on a latency graph.

**Memory doubles at the worst moment.** During the copy, both the old and the new block are live: a 4 GB array needs 12 GB for a moment (4 old + 8 new). Processes get killed for this. Rust's `Vec::reserve_exact` and Go's `make` with an explicit capacity exist so that you can opt out of the doubling when you know better.

**Amortised is not concurrent-safe intuition.** In a structure shared by threads under one lock, the "cheap" operations of every other thread block on the one that is mid-resize. The amortised total is fine; the observed latency for everyone is the resize.

## Failure modes in production

**Periodic p99 spikes that get rarer and taller.** *Symptom:* a service's p99 shows spikes at intervals that double, and each spike is twice the height of the last; steady state is fine. *Diagnosis:* an in-memory map or list on the request path is growing; log its size at each spike and you will find sizes near $\tfrac{2}{3} \cdot 2^k$ (CPython dict), $0.75 \cdot 2^k$ (Java `HashMap`) or $2^k$ (most vectors). *Fix:* pre-size to the expected maximum where the API exists, move growth off the request path (warm the structure at startup), use a structure with incremental rehash, or cap and shard the map.

**OOM-killed at two thirds of the memory limit.** *Symptom:* a process with a 12 GB limit is killed while its live data is 4–5 GB. *Diagnosis:* the RSS graph is a sawtooth; the kill happens on a growth step, when old and new blocks are both live (4 GB + 8 GB). *Fix:* `reserve_exact` or an explicit capacity from a size estimate; a chunked structure (a list of 64 MB blocks) that never copies; streaming instead of materialising.

**A hand-rolled buffer that grows by a constant.** *Symptom:* throughput of a log writer or a serialiser collapses as the message gets large; 10× the size takes 100× the time. *Diagnosis:* the profile is dominated by `memcpy`; the buffer code adds a fixed 4 KB when full, so the copies form an arithmetic series, $\Theta(n^2)$. *Fix:* multiply the capacity (1.5× or 2×); or use the runtime's growable buffer (`bytearray`, `bytes.Buffer`, `Vec<u8>`) which already does.

**Resize thrash at a stable size.** *Symptom:* a cache that hovers around a fixed number of entries burns CPU in resize even though nothing much changes. *Diagnosis:* a shrink threshold equal to the grow threshold, or a map that is cleared and refilled every cycle so that it re-grows from empty each time (Java's `HashMap.clear()` keeps capacity; CPython's `dict.clear()` frees the table). *Fix:* hysteresis between shrink and grow thresholds; reuse the structure instead of clearing it, or size it once.

**One tenant's rehash stalls every tenant.** *Symptom:* under a shared lock, a large tenant's insert triggers a 50 ms rehash and every other request queues behind it. *Diagnosis:* the lock-hold time histogram has a mode at the rehash cost; the amortised analysis was done per operation, not per lock hold. *Fix:* per-tenant or striped maps so a resize affects one shard; incremental rehash; or copy-on-write for read-mostly maps.

```exercise
id: copies-when-doubling
title: Count the copies a doubling array makes
prompt: |
  A dynamic array starts with capacity 1 and holds `size` elements. When you push and `size == capacity`, it allocates a block of `2 * capacity`, copies all `size` existing elements across, and then writes the new element.

  Implement `total_copies(n)`: the total number of element copies performed by pushing `n` elements onto an empty array, **not counting** the write of the pushed element itself. For example, pushing 5 elements copies 1 + 2 + 4 = 7 elements in total.

  The result should always be less than `2n`; that inequality is the amortised argument.
languages: [python, javascript]
entry: total_copies
starter:
  python: |
    def total_copies(n):
        # simulate or use the geometric series
        return 0
  javascript: |
    function total_copies(n) {
      // simulate or use the geometric series
      return 0;
    }
tests:
  - args: [0]
    expected: 0
    label: nothing pushed
  - args: [1]
    expected: 0
    label: first push fits in capacity 1
  - args: [2]
    expected: 1
  - args: [5]
    expected: 7
  - args: [8]
    expected: 7
    label: the eighth push fits without a resize
  - args: [9]
    expected: 15
  - args: [1000]
    expected: 1023
    hidden: true
  - args: [1025]
    expected: 2047
    hidden: true
hints:
  - "A copy happens on the push that finds the array full, i.e. when size is 1, 2, 4, 8, ... and that many elements are copied."
  - "Simulate with two variables, size and capacity: loop n times, and before each push, if size == capacity add size to the total and double capacity. Termination is guaranteed because the loop runs exactly n times."
```

```exercise
id: queue-from-two-stacks
title: A queue with amortised O(1) operations
prompt: |
  Implement a FIFO queue using only two stacks (arrays used with push/pop at the end). Support:

  - `push(x)`: enqueue `x`; returns nothing.
  - `pop()`: dequeue and return the oldest element, or `None`/`null` if empty.
  - `peek()`: return the oldest element without removing it, or `None`/`null` if empty.
  - `empty()`: return `true` if the queue is empty.

  Never move elements from the output stack back to the input stack; every element should cross between the stacks at most once, which is what makes the amortised cost O(1).
languages: [python, javascript]
entry: Queue
starter:
  python: |
    class Queue:
        def __init__(self):
            self.inbox = []
            self.outbox = []

        def push(self, x):
            pass

        def pop(self):
            return None

        def peek(self):
            return None

        def empty(self):
            return True
  javascript: |
    class Queue {
      constructor() {
        this.inbox = [];
        this.outbox = [];
      }
      push(x) {}
      pop() { return null; }
      peek() { return null; }
      empty() { return true; }
    }
tests:
  - args: [["push", 1], ["push", 2], ["peek"], ["pop"], ["push", 3], ["pop"], ["pop"], ["empty"]]
    expected: [null, null, 1, 1, null, 2, 3, true]
  - args: [["pop"], ["peek"], ["empty"]]
    expected: [null, null, true]
    label: operations on an empty queue
  - args: [["push", 9], ["empty"], ["pop"], ["empty"]]
    expected: [null, false, 9, true]
  - args: [["push", 5], ["push", 6], ["pop"], ["push", 7], ["peek"], ["pop"], ["pop"], ["empty"], ["pop"]]
    expected: [null, null, 5, null, 6, 6, 7, true, null]
    hidden: true
    label: interleaved pushes and pops
hints:
  - "Push always goes on `inbox`. Before a pop or peek, if `outbox` is empty, pop everything from `inbox` and push it onto `outbox`; that reverses the order so the oldest element is on top."
  - "Only refill `outbox` when it is empty. If it still has elements they are older than anything in `inbox`."
```

## Interviewer follow-ups

**"Append is amortised O(1). What is the worst single append, and how would you get rid of it?"** *Model answer:* the worst append copies all $n$ elements, $O(n)$, and for a hash table it rehashes them, which at a million entries is tens of milliseconds. To remove it I would pre-size when the maximum is known, or de-amortise: allocate the new block early and migrate a constant number of elements per operation, the way Redis and Go maps rehash incrementally. *Common wrong answer:* "there is no worst case, it's O(1)", which confuses amortised with per-operation cost.

**"Why do some runtimes grow by 1.5 and others by 2?"** *Model answer:* any factor above 1 is amortised $O(1)$; the choice trades copies against wasted memory and allocator reuse. Doubling copies each element at most twice but leaves up to 50% slack and can never reuse the freed blocks, whose sizes sum to one less than the next request. A factor below $\phi \approx 1.618$ lets the last two freed blocks cover the next one. Java and V8 use 1.5; Rust and .NET use 2; CPython uses about 1.125 and leans on `realloc`. *Common wrong answer:* "2 is optimal", with no reason.

**"Does pre-sizing the list help in Python?"** *Model answer:* measured, no: appending $10^7$ elements was faster than filling a pre-allocated list by index, because append is a specialised fast path and glibc grows big blocks by remapping pages rather than copying. Pre-sizing pays in Rust, Go and Java where the copy is real, and for hash maps in any language where the API exists. *Common wrong answer:* "always pre-size, it avoids the copies", repeated from a different runtime.

**"Hash table insert is O(1). Which kind of O(1)?"** *Model answer:* two kinds stacked: expected $O(1)$ for the probe sequence, which assumes a good hash and can be broken by adversarial keys, and amortised $O(1)$ for the resize, which holds for every sequence but not for the single insert that triggers a rehash. I would say both and name the assumption each depends on. *Common wrong answer:* "it's O(1)", full stop.

**"A hand-written buffer adds 4 KB whenever it is full. What is the cost of writing n bytes?"** *Model answer:* the copies are $4\text{K} + 8\text{K} + 12\text{K} + \cdots + n = \Theta(n^2 / 4\text{K})$, so quadratic; only multiplicative growth gives a geometric series. *Common wrong answer:* "$O(n)$, because each resize is a constant amount of new space", which is precisely the bug.

## What mid-level engineers get wrong

- **Reading "amortised O(1)" as "always fast"**, then putting a growing map on a latency-critical path and being surprised by a 60 ms p99 spike that arrives once an hour.
- **Growing a buffer additively** in hand-written code (a fixed chunk when full), which is quadratic and shows up only when a message is unusually large.
- **Mirroring the grow rule as a shrink rule**, so that a structure hovering at a threshold copies itself on every operation.
- **Budgeting memory for the steady state**, not for the moment of growth, and getting OOM-killed at two thirds of the limit.
- **Assuming pre-sizing is free and universal**; in CPython lists it does not help, and in every language it is only a win when you actually know the size.
- **Clearing and rebuilding a map every cycle**, paying the entire growth sequence again each time when reuse would have paid it once.

## Senior signals

- You define amortised cost as a worst-case bound over a *sequence* and can say in one sentence how it differs from average case (no probability) and from per-operation worst case (spikes still happen).
- You give the aggregate argument for doubling ($1 + 2 + 4 + \cdots < 2n$) from memory, can run the accounting or potential version on a small table, and you know why additive growth stays quadratic.
- You can quote the growth rule of your runtime (CPython's $n + n/8 + 6$, Java's 1.5×, Go's 2× tapering to 1.25×, Rust's 2×) and explain the memory-reuse argument for factors below $\phi$.
- You pre-size arrays, maps and buffers when $n$ is known and the runtime benefits, and you can name the API in your language (`with_capacity`, `make([]T, 0, n)`, `new HashMap<>(n)`).
- You know the shrink rule needs hysteresis (shrink at a quarter, not half) and can explain the thrashing sequence that breaks the naive rule.
- You point out that a hash table insert stacks two different "on average" claims (expected probe length, amortised resize) and that both can fail under adversarial keys or on the request that triggers the rehash.
- You connect amortised spikes to p99 latency and to transient memory doubling during a copy, you know that incremental rehashing (Redis, Go maps) is how production systems de-amortise, and you have a story about a time one of these bit a real system.

## Check yourself

```quiz
- q: >-
    A dynamic array grows by adding a fixed 64 slots whenever it is full. What is the amortised cost of an append?
  options: ["O(64), because 64 appends share each copy", "O(log n), because resizes get rarer as n grows", "O(n), since the copies sum to Θ(n²) overall", "O(1), because each resize adds a constant 64 slots"]
  answer: 2
  explanation: >-
    With additive growth a resize happens every 64 pushes and copies everything so far: 64 + 128 + 192 + ... ≈ n²/128 total, so Θ(n) per push. A constant increment is not what makes appends cheap: only multiplicative growth makes the copies a geometric series bounded by a constant times n, and only then do resizes get rarer.
- q: >-
    Which statement correctly distinguishes amortised from average-case analysis?
  options: ["Amortised assumes uniformly random inputs; average case assumes worst-case ones", "Average case bounds the total cost; amortised bounds each single operation", "Amortised holds for every sequence; average case assumes a distribution of inputs", "They are the same idea: the typical cost per operation over a long run"]
  answer: 2
  explanation: >-
    Amortised analysis says that for every possible sequence of m operations the total is at most m·c. There is no randomness, so it is not about "typical" inputs. Average case needs a distribution and can be broken by adversarial inputs; amortised cannot.
- q: >-
    A Python service inserts events into a dict on the request path. Its p99 shows pauses at roughly 2,730, 5,461, 10,922 and 21,845 inserts, each about twice as long as the last. What is happening and what is the cheapest fix?
  options: ["Dict resizes at two-thirds full; move growth off the request path or shard", "Hash collisions piling up; switch to a stronger hash function", "Garbage collection generations promoting; raise the gen0 threshold", "Key objects growing in size; intern the keys before insertion"]
  answer: 0
  explanation: >-
    CPython resizes a dict when it reaches two thirds of its slot count, so the pauses land at ⅔ × 4096, ⅔ × 8192 and so on, and each rehash touches twice as many entries as the last. Collisions would degrade every insert, not specific ones; GC pauses would not track powers of two. Pre-warming the dict, sharding it, or using an incrementally rehashing store removes the spikes.
- q: >-
    You implement shrink-on-pop by halving capacity whenever size drops to capacity/2. Why is this wrong?
  options: ["It frees memory too slowly, so peak usage stays doubled", "Halving capacity can drop elements that are still stored", "Push/pop at half full copies the whole array every time", "It is fine; it mirrors the doubling rule exactly"]
  answer: 2
  explanation: >-
    At exactly half full, a push doubles (copying everything) and the next pop halves (copying everything again), so amortised cost degrades to O(n). Mirroring the grow rule is exactly the trap. Shrinking at one quarter instead guarantees Θ(n) cheap operations between resizes.
- q: >-
    Why do Java's ArrayList and V8's arrays grow by 1.5× while Rust's Vec grows by 2×?
  options: ["1.5× is the largest factor that keeps the amortised copies under one per element", "1.5× keeps the amortised cost O(1) while 2× makes it O(log n)", "2× is required for SIMD alignment, which Java and V8 do not use", "Below the golden ratio, freed blocks can be reused for the next allocation; 2× trades that for fewer copies"]
  answer: 3
  explanation: >-
    Both factors give amortised O(1). With doubling, the freed blocks (1 + 2 + ... + 2^(k−1) = 2^k − 1) always fall one short of the next request, so they can never be reused for it; with a factor below φ ≈ 1.618 the two most recent freed blocks eventually cover the next request. 2× copies each element at most twice; 1.5× at most three times. Alignment has nothing to do with it.
- q: >-
    A queue is implemented with two stacks. A single pop can move n elements from the input stack to the output stack. What is the amortised cost of pop, and why?
  options: ["O(n), because one pop may move all n elements", "O(1), since each element crosses over at most once", "O(log n), because the input stack halves on each move", "O(1), but only when pushes and pops strictly alternate"]
  answer: 1
  explanation: >-
    Charge the future move to the push: each element is pushed once, moved once, and popped once. Any sequence of m operations does at most 3m stack operations, so the occasional O(n) pop is paid for in advance. The bound holds for every sequence, not only alternating ones.
```
