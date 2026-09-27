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

It is not a lie, but it is a different kind of claim from the ones in the previous two lessons, and it has a precise meaning that you need to be able to state and defend. It also has a practical shadow: the expensive operation really does happen, and it happens at a moment you did not choose.

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

## Method 1: aggregate (just add it up)

Start with capacity 1 and double when full. Push $n$ elements. The copies happen at the pushes that find the array full, when its size is $1, 2, 4, 8, \ldots$, and each copies that many elements. If $n = 1{,}000$, the copies are

$$
1 + 2 + 4 + \cdots + 512 = 1{,}023 < 2n.
$$

In general the copy costs form a geometric series whose sum is less than $2n$ (the sum of powers of two below $n$ is at most $2n - 1$). Add the $n$ actual writes and the total for $n$ pushes is under $3n$. Divide by $n$: amortised cost per push is under 3, which is $O(1)$.

That is the whole aggregate argument: bound the total for the sequence, divide. It is the method to reach for first, and the one most interviewers expect.

## Method 2: accounting (charge each cheap operation extra)

Sometimes you cannot see the total directly, and a bookkeeping metaphor helps. Charge each push a fixed amount, say 3 coins. One coin pays for writing the element. The other two are saved with the element as credit.

When the array of size $k$ fills and must be copied to a new block of size $2k$, you need $k$ coins to pay for moving $k$ elements. Where do they come from? Since the last resize, $k/2$ new elements were pushed, and each brought 2 spare coins: $k/2 \times 2 = k$ coins, exactly enough. The credit never goes negative, so the total real cost is never more than the total charged, $3n$.

The accounting method turns "why is it cheap" into "who paid for it", and that often makes the reason obvious: every element pays for its own first copy and for one older element's copy.

## Method 3: potential (a function that stores the debt)

The most general method defines a potential function $\Phi$ on the state of the structure, a number that is large when expensive work is imminent and drops when that work is done. The amortised cost of an operation is its real cost plus the change in potential:

$$
\hat{c}_i = c_i + \Phi(S_i) - \Phi(S_{i-1}).
$$

Summing over a sequence, the potential differences telescope to $\Phi(\text{end}) - \Phi(\text{start})$, so if $\Phi$ starts at zero and is never negative, the total amortised cost bounds the total real cost.

For the dynamic array take $\Phi = 2 \cdot \text{size} - \text{capacity}$. Right after a resize size is half of capacity, so $\Phi = 0$; as the array fills, $\Phi$ climbs to size when full.

- A push with room: real cost 1, size goes up by 1 so $\Phi$ rises by 2. Amortised $1 + 2 = 3$.
- A push that resizes from size $k$ to capacity $2k$: real cost $k + 1$ (copy $k$, write 1). Before: $\Phi = 2k - k = k$. After: size $k+1$, capacity $2k$, $\Phi = 2$. Change $= 2 - k$. Amortised $(k + 1) + (2 - k) = 3$.

Every push costs amortised 3. The potential method is what you use when the structure is more complex than an array (splay trees, Fibonacci heaps, union-find) and neither of the first two methods is easy to make precise.

## Why the growth factor is not 1, and why it is not 10

If you grow by a *constant amount* instead of a constant *factor* (say, add 100 slots when full), the copies happen every 100 pushes and each copies everything so far: $100 + 200 + 300 + \cdots + n = \Theta(n^2/100)$. Still quadratic. Constant additive growth does not amortise; only multiplicative growth does. This is a real bug people write when they implement their own buffer.

Any factor above 1 gives amortised $O(1)$, so why 2? Trade-offs:

| Factor | Amortised copies per element | Wasted capacity (worst) | Note |
|---|---|---|---|
| 1.5 | up to 3 | 33% | Java `ArrayList`; freed old blocks can be reused by later allocations because their sizes add up |
| 2 | up to 2 | 50% | Rust `Vec`, .NET `List<T>`, Go slices while small (Go tapers toward 1.25× for large slices), most textbooks |
| ~1.125 | up to ~9 | ~11% | CPython `list` uses roughly $n + n/8 + 6$: tighter memory, more copies |

The smaller the factor, the less memory you waste but the more often you copy. Go's runtime doubles for small slices and shifts toward 1.25× for large ones for exactly this reason. It is a memory-versus-time dial, and "double" is just the most common setting.

## Shrinking, and the thrashing trap

If you also shrink when the array gets sparse, the naive rule (halve capacity when size drops to half) is wrong. Consider an array at capacity 8 with 4 elements: push, and it grows to 16 (copy 8); pop, and it drops to 4 elements at capacity 16, which halves to 8 (copy 4); push again and it grows; pop again and it shrinks. Every operation copies, and the amortised cost is $O(n)$.

The fix is hysteresis: grow at full, shrink only when the size falls to a *quarter* of capacity. Then after any resize the structure is between a quarter and a half full, and at least $n/4$ operations must happen before the next resize. The potential-method proof goes through with $\Phi = |2 \cdot \text{size} - \text{capacity}|$. The lesson generalises: whenever a threshold triggers expensive work in both directions, put a gap between the two thresholds.

## Other structures that rely on amortisation

The dynamic array is the canonical case, but the same argument appears everywhere.

**Hash table resizing.** Same doubling argument, plus the rehash cost; insert is amortised $O(1)$ on top of the expected $O(1)$ per probe sequence. Two different kinds of "on average" stacked on top of each other, which is worth saying out loud in an interview.

**Queue from two stacks.** Push goes onto an input stack. Pop takes from an output stack, and if that is empty, moves everything from input to output first. That move is $O(n)$, but each element is moved at most once in its lifetime, so $m$ operations cost at most $2m$ moves plus $m$ pushes/pops: amortised $O(1)$.

```viz
{"type": "stack-queue", "algorithm": "queue-via-two-stacks", "operations": [["push", 1], ["push", 2], ["push", 3], ["pop"], ["push", 4], ["pop"], ["pop"], ["pop"]], "title": "Queue built from two stacks", "caption": "The first pop moves three elements; the next two pops are free. Each element crosses from the input stack to the output stack exactly once."}
```

**Binary counter increment.** Incrementing a $b$-bit counter flips $b$ bits in the worst case (from $0111\ldots1$ to $1000\ldots0$), but bit $i$ only flips once every $2^i$ increments, so $n$ increments flip at most $2n$ bits: amortised $O(1)$ per increment.

**Union-find with path compression.** Amortised nearly constant ($\alpha(n)$, the inverse Ackermann function, which is at most 4 for any $n$ you will ever see), via a potential argument that is genuinely difficult. You do not need the proof; you need to know that the bound is amortised, so a single `find` can still walk a long chain.

**Splay trees.** Every operation is amortised $O(\log n)$, but a single operation can take $O(n)$. That single slow operation is what rules them out of latency-sensitive code.

## What amortisation hides

The guarantee is about totals, and production systems care about tails. A few consequences a senior engineer keeps in mind.

**Latency spikes.** A list that reaches ten million elements has been copied about 24 times, and the last copy moved five million elements. If that happens on a request path, one user sees a pause the rest do not. The [benchmarking lesson](/learn/foundations/complexity/benchmarking-reality) shows the sawtooth this makes on a latency graph.

**Pre-sizing removes the spikes.** If you know $n$ in advance, allocate it: `[None] * n`, `new Array(n)`, `make([]T, 0, n)`, `Vec::with_capacity(n)`. This turns amortised $O(1)$ into actual $O(1)$ and removes all copies. It is the single most common performance fix that reviewers ask for and juniors forget.

**Memory doubles at the worst moment.** During the copy, both the old and the new block are live: a 4 GB array needs 12 GB for a moment (4 old + 8 new). Processes get killed for this. Rust's `Vec::reserve_exact` and Go's `make` with an explicit capacity exist so that you can opt out of the doubling when you know better.

**Amortised is not concurrent-safe intuition.** In a structure shared by threads, the "cheap" operations of other threads may all block on the one that is mid-resize. The amortised total is fine; the observed latency for everyone is not.

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

## Senior signals

- You define amortised cost as a worst-case bound over a *sequence* and can say in one sentence how it differs from average case (no probability) and from per-operation worst case (spikes still happen).
- You give the aggregate argument for doubling ($1 + 2 + 4 + \cdots < 2n$) from memory, and you know why additive growth stays quadratic.
- You pre-size arrays, maps and buffers when $n$ is known, and you can name the API in your language (`with_capacity`, `make([]T, 0, n)`, `reserve`).
- You know the shrink rule needs hysteresis (shrink at a quarter, not half) and can explain the thrashing sequence that breaks the naive rule.
- You point out that a hash table insert stacks two different "on average" claims (expected probe length, amortised resize) and that both can fail under adversarial keys or on the request that triggers the rehash.
- You connect amortised spikes to p99 latency and to transient memory doubling during a copy, and you have a story about a time one of those bit a real system.

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
    A service appends each incoming event to an in-memory list and its p99 latency shows periodic spikes that grow further apart over time. What is the most likely cause and the cheapest fix?
  options: ["Hash collisions piling up; change the hash function", "Events are growing in size; compress them on arrival", "Garbage collection pauses; give the process a bigger heap", "Array resizes copying the list; pre-size it or chunk it"]
  answer: 3
  explanation: >-
    Doubling produces spikes at sizes 2^k, so they get further apart as the list grows, and each one is bigger. Pre-sizing eliminates copies; a chunked deque bounds each allocation. GC would not have that exact spacing pattern.
- q: >-
    You implement shrink-on-pop by halving capacity whenever size drops to capacity/2. Why is this wrong?
  options: ["It frees memory too slowly, so peak usage stays doubled", "Halving capacity can drop elements that are still stored", "Push/pop at half full copies the whole array every time", "It is fine; it mirrors the doubling rule exactly"]
  answer: 2
  explanation: >-
    At exactly half full, a push doubles (copying everything) and the next pop halves (copying everything again), so amortised cost degrades to O(n). Mirroring the grow rule is exactly the trap. Shrinking at one quarter instead guarantees Θ(n) cheap operations between resizes.
- q: >-
    A queue is implemented with two stacks. A single pop can move n elements from the input stack to the output stack. What is the amortised cost of pop, and why?
  options: ["O(n), because one pop may move all n elements", "O(1), since each element crosses over at most once", "O(log n), because the input stack halves on each move", "O(1), but only when pushes and pops strictly alternate"]
  answer: 1
  explanation: >-
    Charge the future move to the push: each element is pushed once, moved once, and popped once. Any sequence of m operations does at most 3m stack operations, so the occasional O(n) pop is paid for in advance. The bound holds for every sequence, not just alternating ones.
```
