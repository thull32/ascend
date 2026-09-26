---
slug: space-complexity-and-memory-hierarchy
title: "Space complexity and the memory hierarchy"
description: How to count the memory an algorithm uses (auxiliary versus total, and the stack you forgot), and why the cache hierarchy makes two O(n) algorithms differ by 50× in practice, with arrays beating linked lists as the standing example.
minutes: 45
difficulty: easy
tags: [complexity, space-complexity, memory-hierarchy, cache, locality, arrays-vs-linked-lists]
problems: [reverse-linked-list, move-zeroes]
---
A candidate writes a clean recursive solution and announces "$O(n)$ time, $O(1)$ space". The interviewer asks how deep the recursion goes. It goes $n$ deep. Every frame is on the stack, the stack is memory, and the answer was $O(n)$ space all along. That exchange happens in a large fraction of senior interviews, and it is the mild version of the problem.

The stronger version comes from hardware. Two algorithms, both $O(n)$ time and $O(n)$ space, one walking an array and the other a linked list. On a million elements the array version is ten to fifty times faster, and nothing in the complexity analysis predicts it. The reason is that the RAM model's "all memory accesses cost one unit" is off by a factor of about a hundred between the fastest and slowest real accesses, and the two algorithms land on opposite ends.

This lesson gives you both halves: counting space correctly, and knowing when the count is not the cost.

## Counting space

**Total space** is everything the algorithm touches, including the input. **Auxiliary space** is the extra memory beyond the input. When someone asks for "the space complexity" they almost always mean auxiliary, and it is the number that distinguishes an in-place algorithm from one that copies.

Three things get counted, and the third is the one people miss.

1. **Explicit allocations**: arrays, hash maps, strings, objects you create. A frequency map over $n$ elements with $k$ distinct values is $O(k)$, which is $O(n)$ in the worst case and $O(1)$ if the values come from a fixed alphabet (26 letters, 256 bytes).
2. **Implicit copies**: slicing (`nums[1:]` in Python allocates a new list of $n - 1$ elements; in Go a slice of a slice shares memory and is $O(1)$), string concatenation, converting between structures, sorted copies (`sorted(x)` allocates; `x.sort()` does not, though Timsort uses up to $O(n)$ temporary space internally).
3. **The call stack**: every active function call holds a frame with its locals and return address. A recursion that goes $d$ deep uses $O(d)$ stack space. For a balanced tree that is $O(\log n)$; for a linked list or a degenerate tree it is $O(n)$; for naive `fib(n)` it is $O(n)$ even though the number of *calls* is exponential, because only one path from root to leaf is live at a time.

A worked example, three ways to compute the $n$-th Fibonacci number:

```python
def fib_rec(n):                  # time O(2^n), aux space O(n): recursion depth n
    return n if n < 2 else fib_rec(n - 1) + fib_rec(n - 2)

def fib_table(n):                # time O(n), aux space O(n): the table
    f = [0, 1] + [0] * n
    for i in range(2, n + 1):
        f[i] = f[i - 1] + f[i - 2]
    return f[n]

def fib_iter(n):                 # time O(n), aux space O(1): two variables
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
```

The third is the one to write. Notice that the table version keeps $n$ values and only ever reads the last two; the "sliding window over the DP table" transformation that takes you from `fib_table` to `fib_iter` is a standard space optimisation you will use throughout [dynamic programming](/learn/algorithms/dynamic-programming/the-dp-mindset).

```viz
{"type": "recursion", "algorithm": "fibonacci", "n": 5, "title": "Recursion tree versus live stack", "caption": "The tree has many nodes, but at any moment only one root-to-leaf path is on the call stack. The stack depth, not the node count, is the space cost."}
```

### Reporting it in an interview

Say "$O(n)$ time, $O(1)$ auxiliary space" or "$O(n)$ auxiliary space for the hash map plus $O(\log n)$ stack for the recursion". Then, if it is not obvious, say where the memory is. The habit that impresses is naming the stack without being asked.

Two more traps:

- **Output does not count** as auxiliary space if the problem requires you to produce it. Generating all $2^n$ subsets is $O(2^n \cdot n)$ space, and no algorithm can do better, so the interesting question is what you use *beyond* the output.
- **In-place with a mutable input** means $O(1)$ auxiliary, but say whether you are allowed to destroy the input. Sorting the caller's array to answer a query is a side effect that a code reviewer will reject even if the interviewer accepts it.

## The memory hierarchy

The RAM model says every access costs one unit. Real machines have a hierarchy, and the cost of a read depends on where the data currently lives.

| Level | Typical size | Approximate latency | In "add instruction" units |
|---|---|---|---|
| Register | a few hundred bytes | ~0.3 ns | 1 |
| L1 cache | 32–64 KB per core | ~1 ns | ~3 |
| L2 cache | 256 KB – 2 MB per core | ~3–5 ns | ~12 |
| L3 cache | tens of MB, shared | ~10–20 ns | ~40 |
| Main memory (DRAM) | GBs | ~80–100 ns | ~300 |
| NVMe SSD | TBs | ~20–100 µs | ~100,000 |
| Network round trip (same DC) | | ~100–500 µs | ~1,000,000 |

The exact numbers vary by machine and year; the ratios are what to remember. A cache miss to DRAM costs as much as a few hundred arithmetic instructions. An algorithm whose reads all hit L1 and one whose reads all miss to DRAM differ by roughly a hundred times per access, and both are "$O(n)$".

Data moves between levels in **cache lines**, 64 bytes at a time on nearly all current CPUs. When you read one byte, you get its 63 neighbours for free. If the next thing you need is one of those neighbours, it is already in L1: a hit. If it is at a random other address: a miss, and another 64-byte fetch. On top of that, the hardware **prefetcher** notices sequential access patterns and starts fetching the next lines before you ask, so a linear scan through an array rarely waits for memory at all.

```viz
{"type": "memory", "scenario": "cache-lines", "title": "Cache lines and locality", "caption": "Sequential access pulls each 64-byte line once and uses all of it. Scattered access pulls a whole line for every element and uses a fraction of it."}
```

This gives you the one principle that explains most performance surprises: **locality**. Code that accesses memory close to where it just accessed (spatial locality) or accesses the same memory repeatedly within a short window (temporal locality) runs near cache speed. Code that jumps around runs at DRAM speed.

## Arrays versus linked lists, honestly

The textbook comparison says a linked list has $O(1)$ insertion at a known position while an array has $O(n)$, so linked lists win when you insert a lot. In practice, on modern hardware, arrays win almost every benchmark, including many where the linked list has the better complexity.

Here is why, mechanically. An array of a million 8-byte integers is 8 MB of contiguous memory, 125,000 cache lines, and a scan touches each line once with the prefetcher running ahead: about a million reads at close to L1 speed. A linked list of a million nodes is a million separate heap allocations. Each node is at least 16 bytes (value plus pointer) and often 32 or more with allocator overhead, and they are wherever the allocator put them, which after any churn is effectively random. A traversal is a million *dependent* loads: you cannot fetch node $i+1$ until you have node $i$ and read its pointer, so the prefetcher cannot help, and each hop is a potential DRAM miss.

```viz
{"type": "linked-list", "algorithm": "traverse", "values": [12, 7, 33, 4, 19, 26], "title": "A traversal is a chain of dependent loads", "caption": "Each next pointer must be read before the following node's address is known. On a cold cache every hop can be a ~100 ns miss."}
```

Concrete numbers, roughly what you would measure on a laptop:

| Operation on $10^6$ integers | Array | Linked list |
|---|---|---|
| Sum all elements | ~0.5 ms | ~10–50 ms (depends on how fragmented the nodes are) |
| Memory used | 8 MB | 16–32 MB |
| Insert at front | ~0.5 ms (shift everything) | ~50 ns |
| Insert in the middle (position known) | ~0.25 ms | ~50 ns, but finding the position was already a traversal |
| Random access `xs[k]` | ~1 ns | $O(k)$ hops |

The "insert in the middle" row is the honest version of the textbook claim. Insertion *given a node reference* is $O(1)$ for a linked list, and that is exactly the situation in an LRU cache, where a hash map hands you the node directly. Insertion *at an index* requires a traversal first and the array's memmove of $n/2$ elements, which is a tight loop over contiguous memory, typically beats it until $n$ is very large.

When linked lists genuinely win:

- **You already hold a pointer to the node** and need $O(1)$ splice, unlink or move-to-front: LRU caches, intrusive lists in kernels and allocators, undo logs.
- **Elements are large** and copying them during array shifts is expensive, though a `Vec<Box<T>>` or array of pointers often serves better.
- **You need stable addresses**: a pointer to an element must stay valid after other insertions. Arrays invalidate pointers on resize.
- **Lock-free queues and allocators**, where linking a node with one atomic pointer swap is the whole point.

Everything else, including most "the queue could get long" cases, is better served by a dynamic array or a ring buffer. Go and Rust standard libraries make this explicit: Rust's `LinkedList` documentation says outright that a `Vec` or `VecDeque` is almost always the better choice.

## Layout matters within an array too

Locality is about bytes, not elements. Consider a million `Particle` records with position, velocity, mass and colour, and a loop that updates only positions.

```python
# Array of structs: each particle is one object; the loop touches every field's memory
for p in particles:
    p.x += p.vx * dt

# Struct of arrays: one array per field; the loop touches only x and vx
for i in range(n):
    xs[i] += vxs[i] * dt
```

In a language with real structs (Go, Rust, C), the first layout drags mass and colour through the cache for no reason: if each struct is 64 bytes and you use 16 of them, three quarters of every cache line is wasted. The second layout, struct-of-arrays, uses every byte fetched. This is why numerical libraries, game engines and columnar databases all store fields in separate arrays. In Python the cost is hidden behind the fact that every object is already a pointer to a heap allocation, which is part of why Python numeric code is slow and why NumPy, which uses contiguous typed arrays, is fast.

Two-dimensional arrays have the same issue: a matrix stored row by row should be iterated row by row. Iterating column by column touches a new cache line on every step, and for a large matrix each of those can be a miss. Swapping the loop order on a naive matrix multiply is worth a 5–10× speed-up on its own, with identical complexity. The [2D arrays lesson](/learn/data-structures/arrays-strings/two-dimensional-arrays) and the [CPU caches lesson](/learn/systems/performance-engineering/cpu-caches-and-memory-layout) go deeper.

## Space costs that are not in the model

A few more places where counting words underestimates what you actually use.

**Object overhead.** A Python `int` is 28 bytes; a list of a million of them is 8 MB of pointers plus 28 MB of integer objects (small ones are cached, large ones are not). A `dict` entry is on the order of 100 bytes once you count the key, value and table slot. A JavaScript object is similar. When a service that "only stores a million small records" uses 2 GB, this is why. Typed arrays (`array.array`, NumPy, `Int32Array`, `[]int32`) store the values inline and are 5–10× smaller.

**Allocator overhead and fragmentation.** Each heap allocation carries a header (often 8–16 bytes) and is rounded up to a size class. Millions of small allocations waste a meaningful fraction of memory and, worse, scatter your data across the heap so that later traversals miss cache. Arena allocators and object pools exist for precisely this reason.

**Virtual memory.** Your process sees a flat address space, but pages (usually 4 KB) are mapped lazily and can be swapped out. Touching a fresh page costs a page fault (microseconds), and if the working set exceeds physical memory, "memory access" becomes disk access at a million-to-one penalty. The [virtual memory lesson](/learn/systems/operating-systems/virtual-memory) covers paging; the practical rule is that your working set, not your address space, is what must fit in RAM.

```viz
{"type": "memory", "scenario": "virtual-memory-paging", "title": "Pages, not bytes", "caption": "The process addresses memory in pages. A page that is not resident costs a fault, and one that has been swapped out costs a disk read."}
```

## Choosing on purpose

When you pick a structure, you are choosing a memory layout, and the layout predicts the cost better than the complexity does for anything that fits in cache. The order of questions to ask:

1. What is $n$, and does the working set fit in L2 (a few hundred KB), L3 (tens of MB), or RAM? If it fits in L2, almost anything is fast and the complexity barely matters.
2. Is access sequential, random, or pointer-chasing? Sequential wins by a large constant. Pointer-chasing loses by a large constant.
3. Is the space auxiliary, or does it also include hidden stack and object overhead?
4. Only then: which growth class, and do the constants cross over at my $n$?

```exercise
id: fib-constant-space
title: Fibonacci in O(1) auxiliary space
prompt: |
  Implement `fib(n)` returning the n-th Fibonacci number with `fib(0) = 0`, `fib(1) = 1`, using O(n) time and O(1) auxiliary space: no table, no recursion. `n` is at most 70, which keeps the result within JavaScript's safe integer range (below 2⁵³).
languages: [python, javascript]
entry: fib
starter:
  python: |
    def fib(n):
        # two variables, one loop
        return 0
  javascript: |
    function fib(n) {
      // two variables, one loop
      return 0;
    }
tests:
  - args: [0]
    expected: 0
    label: base case 0
  - args: [1]
    expected: 1
    label: base case 1
  - args: [2]
    expected: 1
  - args: [10]
    expected: 55
  - args: [20]
    expected: 6765
  - args: [50]
    expected: 12586269025
    hidden: true
  - args: [70]
    expected: 190392490709135
    hidden: true
hints:
  - "Keep (a, b) = (fib(i), fib(i+1)) and step to (b, a + b) n times; return a."
  - "Use a temporary or tuple assignment so you do not overwrite a before you have used it."
```

```exercise
id: move-zeroes-in-place
title: Move zeroes to the end in place
prompt: |
  Given an array of integers `nums`, move every `0` to the end while keeping the relative order of the non-zero elements, using O(1) auxiliary space (modify the array in place; do not allocate a second array of size n). Return the modified array.

  A single pass with a write index is enough: every non-zero element is written once, and the tail is filled with zeroes.
languages: [python, javascript]
entry: move_zeroes
starter:
  python: |
    def move_zeroes(nums):
        # in place; return nums
        return nums
  javascript: |
    function move_zeroes(nums) {
      // in place; return nums
      return nums;
    }
tests:
  - args: [[0, 1, 0, 3, 12]]
    expected: [1, 3, 12, 0, 0]
  - args: [[0, 0, 0]]
    expected: [0, 0, 0]
    label: all zeroes
  - args: [[]]
    expected: []
    label: empty input
  - args: [[4, 2, 4]]
    expected: [4, 2, 4]
    label: no zeroes
  - args: [[0]]
    expected: [0]
  - args: [[1, 0, 2, 0, 0, 3]]
    expected: [1, 2, 3, 0, 0, 0]
    hidden: true
  - args: [[0, 0, 1]]
    expected: [1, 0, 0]
    hidden: true
hints:
  - "Keep a write index w. For each element, if it is non-zero, write it at position w and increment w."
  - "After the pass, fill positions w..n-1 with 0. Two loops, each touching every element at most once."
```

```viz
{"type": "array", "algorithm": "move-zeroes", "values": [0, 1, 0, 3, 12], "title": "In-place compaction", "caption": "The write pointer trails the read pointer; no second array is needed."}
```

## Senior signals

- You count the call stack as space, unprompted, and can give the depth for a balanced tree ($\log n$), a list ($n$) and naive recursion.
- You distinguish auxiliary from total space, exclude required output from auxiliary, and say when you are mutating the caller's input.
- You quote the memory hierarchy in ratios (L1 ~1 ns, DRAM ~100 ns, SSD ~50 µs) and use them to explain why two $O(n)$ algorithms differ by 50×.
- You explain the array-versus-linked-list result as dependent loads versus prefetchable sequential access, and you know the specific cases (LRU, intrusive lists, stable addresses) where the list is still the right tool.
- You know that an object per element costs 5–10× the memory of a typed array and that this, not Big-O, is usually why a "small" dataset does not fit.
- You mention loop order and struct-of-arrays layout as free performance wins when a colleague is about to optimise the algorithm.

## Check yourself

```quiz
- q: >-
    A recursive function computes the depth of a binary tree with n nodes by recursing into both children. What is its auxiliary space complexity?
  options: ["O(1); it allocates nothing", "O(n) always, because there are n calls in total", "O(h) where h is the tree height: O(log n) if balanced, O(n) if degenerate", "O(n log n)"]
  answer: 2
  explanation: >-
    Only the frames on the current root-to-leaf path are live at once, so the stack holds at most h frames. The total number of calls is n, but they do not coexist. "O(1)" ignores the stack; "O(n) always" ignores that balanced trees are shallow.
- q: >-
    Two functions each sum 10⁷ integers: one from a contiguous array, one from a singly linked list whose nodes were allocated over the lifetime of a busy process. Both are O(n). Which is the most accurate prediction?
  options: ["Roughly equal, since both are O(n)", "The list is faster because it avoids bounds checks", "The array is faster by a large constant factor because sequential reads are prefetched while each list hop is a dependent, likely-missing load", "The array is faster only if it fits in L1 cache"]
  answer: 2
  explanation: >-
    The array benefits from spatial locality and hardware prefetching; the list requires reading each node's pointer before the next address is known, defeating prefetching, and fragmented nodes turn most hops into ~100 ns DRAM misses. The array wins even when it exceeds L1, because streaming access is what caches are optimised for.
- q: >-
    Which situation is a genuine reason to prefer a linked list over a dynamic array?
  options: ["You need to insert at index n/2 frequently", "A hash map gives you a direct reference to a node and you need to move it to the front in O(1), as in an LRU cache", "You need fast iteration over all elements", "You want to minimise memory usage"]
  answer: 1
  explanation: >-
    With a node reference in hand, unlink and relink are constant-time pointer operations, and no array can do that without shifting. Insertion at an index still needs a traversal; iteration and memory both favour arrays.
- q: >-
    A Python service stores 5 million small records as dicts and uses about 3 GB. The record data itself would be about 200 MB as raw bytes. What best explains the gap?
  options: ["Python leaks memory", "Per-object overhead: each dict, key, value and int is a separate heap object with headers, plus hash table slack", "The garbage collector holds onto freed memory", "5 million records need a 64-bit machine"]
  answer: 1
  explanation: >-
    Every value is a boxed object (a small int alone is 28 bytes), every dict carries its own hash table with unused slots, and every allocation has allocator overhead. Typed arrays, __slots__ classes or a columnar layout recover most of the gap. This is a layout cost, not a leak.
- q: >-
    A colleague speeds up a matrix routine 8× by swapping the order of two nested loops. The complexity is unchanged. What happened?
  options: ["The compiler removed a loop", "The new order iterates along rows, so consecutive accesses share cache lines and the prefetcher keeps up; the old order jumped a full row per access and missed cache each time", "Fewer floating-point operations are performed", "The inner loop now runs in parallel"]
  answer: 1
  explanation: >-
    Row-major storage means neighbouring columns are adjacent in memory. Walking down a column touches a new cache line every step; walking along a row uses each fetched line fully. Same operations, radically different memory traffic.
```
