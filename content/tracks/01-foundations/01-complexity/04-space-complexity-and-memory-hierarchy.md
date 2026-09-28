---
slug: space-complexity-and-memory-hierarchy
title: "Space complexity and the memory hierarchy"
description: How to count the memory an algorithm uses (auxiliary versus total, and the stack you forgot), and why the cache hierarchy makes two O(n) algorithms differ by 50× in practice, with arrays beating linked lists as the standing example.
minutes: 50
difficulty: easy
tags: [complexity, space-complexity, memory-hierarchy, cache, locality, arrays-vs-linked-lists]
problems: [reverse-linked-list, move-zeroes]
---
A candidate writes a clean recursive solution and announces "$O(n)$ time, $O(1)$ space". The interviewer asks how deep the recursion goes. It goes $n$ deep. Every frame is on the stack, the stack is memory, and the answer was $O(n)$ space all along. That exchange happens in a large fraction of senior interviews, and it is the mild version of the problem.

The stronger version comes from hardware. Two algorithms, both $O(n)$ time and $O(n)$ space, one walking an array and the other a linked list. On ten million elements, measured on one desktop machine, the array version takes 2 ms and the linked-list version takes 890 ms, and nothing in the complexity analysis predicts a factor of 460. The reason is that the RAM model's "all memory accesses cost one unit" is off by a factor of about five hundred between the fastest and slowest real accesses, and the two algorithms land on opposite ends.

This lesson gives you both halves: counting space correctly, including the bytes the model does not see, and knowing when the count is not the cost.

## Counting space

**Total space** is everything the algorithm touches, including the input. **Auxiliary space** is the extra memory beyond the input. When someone asks for "the space complexity" they almost always mean auxiliary, and it is the number that distinguishes an in-place algorithm from one that copies.

Three things get counted, and the third is the one people miss.

1. **Explicit allocations**: arrays, hash maps, strings, objects you create. A frequency map over $n$ elements with $k$ distinct values is $O(k)$, which is $O(n)$ in the worst case and $O(1)$ if the values come from a fixed alphabet (26 letters, 256 bytes).
2. **Implicit copies**: slicing (`nums[1:]` in Python allocates a new list of $n - 1$ elements; in Go a slice of a slice shares memory and is $O(1)$), string concatenation, converting between structures, sorted copies (`sorted(x)` allocates; `x.sort()` does not, though Timsort uses up to $n/2$ elements of temporary space internally).
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

Trace the stack for `fib_rec(4)`. Frames are pushed on the way down the leftmost path and popped before the right sibling is entered:

| Step | Call stack (bottom → top) | Depth |
|---|---|---|
| 1 | `fib(4)` | 1 |
| 2 | `fib(4)` → `fib(3)` | 2 |
| 3 | `fib(4)` → `fib(3)` → `fib(2)` | 3 |
| 4 | `fib(4)` → `fib(3)` → `fib(2)` → `fib(1)` | 4 |
| 5 | `fib(4)` → `fib(3)` → `fib(2)` (after `fib(1)` returned) | 3 |
| 6 | `fib(4)` → `fib(3)` → `fib(2)` → `fib(0)` | 4 |
| … | nine calls in total, but never more than four frames at once | ≤ 4 |

Nine calls, peak depth four. The number of calls ($\Theta(\phi^n)$) is the time; the peak depth ($n$) is the space. The third version is the one to write. Notice that the table version keeps $n$ values and only ever reads the last two; the "sliding window over the DP table" transformation that takes you from `fib_table` to `fib_iter` is a standard space optimisation you will use throughout [dynamic programming](/learn/algorithms/dynamic-programming/the-dp-mindset).

```viz
{"type": "recursion", "algorithm": "fibonacci", "n": 5, "title": "Recursion tree versus live stack", "caption": "The tree has many nodes, but at any moment only one root-to-leaf path is on the call stack. The stack depth, not the node count, is the space cost."}
```

### How deep can you go

The stack is finite and its size is a runtime decision, so "$O(n)$ stack" has a hard ceiling that differs by an order of magnitude between languages:

| Runtime | Default limit | What happens past it |
|---|---|---|
| CPython | 1,000 frames (`sys.getrecursionlimit()`); frames live on a heap-allocated per-thread stack, not the C stack, since 3.11 | `RecursionError`, catchable |
| Node.js / V8 | about 1 MB of stack, roughly 10,000 frames for a small function | `RangeError: Maximum call stack size exceeded`, catchable |
| Java | 512 KB–1 MB per thread (`-Xss`), roughly 10,000–20,000 frames | `StackOverflowError` |
| C, C++, Rust | 8 MB main thread on Linux (`ulimit -s`), 2 MB for Rust spawned threads | guard page hit, `SIGSEGV`, process dies |
| Go | starts at 2 KB per goroutine, grows by copying, up to 1 GB on 64-bit | fatal `stack overflow`, not recoverable |

A recursive DFS over a linked list of 100,000 nodes, or over a path-shaped tree, works in Go and fails everywhere else. That is why the iterative version with an explicit stack is the production form of every deep recursion, and why saying "$O(n)$ stack, which exceeds CPython's limit at $n = 1{,}000$" is the answer that shows you know where the memory is. The [call stack lesson](/learn/foundations/how-code-runs/stack-heap-and-the-call-stack) has the frame layout.

### Reporting it in an interview

Say "$O(n)$ time, $O(1)$ auxiliary space" or "$O(n)$ auxiliary space for the hash map plus $O(\log n)$ stack for the recursion". Then, if it is not obvious, say where the memory is. The habit that impresses is naming the stack without being asked.

Two more traps:

- **Output does not count** as auxiliary space if the problem requires you to produce it. Generating all $2^n$ subsets is $O(2^n \cdot n)$ space, and no algorithm can do better, so the interesting question is what you use *beyond* the output.
- **In-place with a mutable input** means $O(1)$ auxiliary, but say whether you are allowed to destroy the input. Sorting the caller's array to answer a query is a side effect that a code reviewer will reject even if the interviewer accepts it.

## Under the hood: what a "word" of space costs in CPython

The model counts words. CPython counts objects, and every object carries a header. Measured with `sys.getsizeof` on CPython 3.14 (64-bit):

| Value | Bytes | Why |
|---|---|---|
| `0`, `1000` | 28 | 16-byte object header (refcount, type pointer) + size field + one 30-bit digit; $-5$ to $256$ are shared singletons |
| $2^{30}$ | 32 | a second 30-bit digit |
| `1.5` | 24 | header + one double |
| `""` / `"hello"` | 41 / 46 | header, length, hash, flags, then one byte per ASCII character |
| `[]` / `[1, 2, 3]` | 56 / 88 | header, length, capacity, pointer to a separate array of 8-byte pointers |
| `()` / `(1, 2, 3)` | 48 / 72 | pointers stored inline, no capacity field |
| `{}` / `{"a": 1, "b": 2, "c": 3}` | 64 / 184 | header + a separate table: index array plus 24-byte entries |
| `set()` | 216 | an 8-slot table allocated up front |
| instance with three attributes | ~104 total | 48-byte object with values stored inline (3.13+); `__slots__` brings it to 64 |

And at scale, measured with `tracemalloc` for one million elements:

| Structure holding $10^6$ values | Memory | Per element |
|---|---|---|
| `list` of distinct small ints | 40 MB | 8-byte pointer + 32-byte int object (28 rounded up to the allocator's size class) |
| `list` of floats | 32 MB | 8 + 24 |
| `array.array('q')` | 8 MB | 8, stored inline; NumPy is the same |
| `dict` int → int | 74 MB | ~42 bytes of table per entry + the int objects |
| 100,000 three-key dicts | 22 MB | 224 per record |
| 100,000 instances (three attributes) | 10 MB | 104 per record |
| 100,000 `__slots__` instances | 6.4 MB | 64 per record |

The 5× gap between the list of ints and the typed array is where "a million small records" becomes 2 GB. The number to carry around: a Python object costs 16 bytes of header before it holds anything, a pointer to it costs another 8, and the allocator rounds every request up to a multiple of 16. In Java the header is 12–16 bytes and a boxed `Integer` is 16; in JavaScript a heap number is 16 or more, though V8 stores small integers inline. Go and Rust have no per-value header: a `[]int64` of a million entries is 8 MB, and a struct is the sum of its fields plus alignment padding.

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

The exact numbers vary by machine and year; the ratios are what to remember. On the desktop used for this lesson's measurements (32 KB L1, 1 MB L2, 96 MB L3), a dependent pointer chase measured 0.9 ns per hop from L1, 2.5 ns from L2, 22 ns from L3 and 100 ns from DRAM. A cache miss to DRAM costs as much as a few hundred arithmetic instructions. An algorithm whose reads all hit L1 and one whose reads all miss to DRAM differ by roughly a hundred times per access, and both are "$O(n)$".

Data moves between levels in **cache lines**, 64 bytes at a time on nearly all current x86 and ARM CPUs (Apple's M-series uses 128). When you read one byte, you get its 63 neighbours for free. If the next thing you need is one of those neighbours, it is already in L1: a hit. If it is at a random other address: a miss, and another 64-byte fetch. On top of that, the hardware **prefetcher** notices sequential access patterns and starts fetching the next lines before you ask, so a linear scan through an array rarely waits for memory at all.

```viz
{"type": "memory", "scenario": "cache-lines", "title": "Cache lines and locality", "caption": "Sequential access pulls each 64-byte line once and uses all of it. Scattered access pulls a whole line for every element and uses a fraction of it."}
```

This gives you the one principle that explains most performance surprises: **locality**. Code that accesses memory close to where it just accessed (spatial locality) or accesses the same memory repeatedly within a short window (temporal locality) runs near cache speed. Code that jumps around runs at DRAM speed.

## Arrays versus linked lists, honestly

The textbook comparison says a linked list has $O(1)$ insertion at a known position while an array has $O(n)$, so linked lists win when you insert a lot. In practice, on modern hardware, arrays win almost every benchmark, including many where the linked list has the better complexity.

Here is why, mechanically. An array of ten million 8-byte integers is 80 MB of contiguous memory, 1.25 million cache lines, and a scan touches each line once with the prefetcher running ahead. A linked list of ten million nodes is ten million separate allocations. Each node is at least 16 bytes (value plus pointer), the allocator rounds it up to 32 with its own header, and the nodes are wherever the allocator put them. A traversal is ten million *dependent* loads: you cannot fetch node $i+1$ until you have node $i$ and read its pointer, so the prefetcher cannot help, and each hop is a potential DRAM miss.

```viz
{"type": "linked-list", "algorithm": "traverse", "values": [12, 7, 33, 4, 19, 26], "title": "A traversal is a chain of dependent loads", "caption": "Each next pointer must be read before the following node's address is known. On a cold cache every hop can be a ~100 ns miss."}
```

Measured in C (`gcc -O2`, best of five runs, one desktop machine), summing $n$ 64-bit integers three ways:

| $n$ | Array | Linked list, nodes allocated in order | Linked list, nodes in random order |
|---|---|---|---|
| $10^6$ (16 MB of nodes, fits L3) | 0.20 ms (0.20 ns/elem) | 0.73 ms (0.73 ns/elem) | 12 ms (12 ns/elem) |
| $10^7$ (160 MB of nodes, exceeds L3) | 1.9 ms (0.19 ns/elem) | 7.2 ms (0.71 ns/elem) | 888 ms (89 ns/elem) |

Three lessons in one table. The array streams at the same speed whether it fits in cache or not. A linked list whose nodes happen to be contiguous (a fresh process, allocations in order, no churn) is only 3.7× slower, because the prefetcher still recognises the pattern; this is the case a micro-benchmark measures and it is misleading. A linked list whose nodes are scattered, which is what any long-running process has after allocations and frees have interleaved, is 60× slower while it fits in L3 and 460× slower once it does not, because every hop is a full miss. The complexity of all six cells is $\Theta(n)$.

Memory follows the same pattern: 80 MB for the array against 320 MB for ten million 32-byte allocations, before counting fragmentation.

| Operation on $10^7$ integers | Array | Linked list |
|---|---|---|
| Sum all elements | 2 ms | 7 ms fresh, 900 ms fragmented |
| Memory used | 80 MB | 160 MB of nodes, ~320 MB with allocator headers |
| Insert at front | ~2 ms (memmove of 80 MB at ~40 GB/s) | ~50 ns, if you hold the head |
| Insert in the middle, position known | ~1 ms | ~50 ns, but finding the position was a traversal |
| Random access `xs[k]` | ~1 ns | $O(k)$ hops at up to 100 ns each |

The "insert in the middle" row is the honest version of the textbook claim. Insertion *given a node reference* is $O(1)$ for a linked list, and that is exactly the situation in an LRU cache, where a hash map hands you the node directly. Insertion *at an index* requires a traversal first, and the array's memmove of $n/2$ elements, a tight loop over contiguous memory at tens of gigabytes per second, beats it until $n$ is very large.

When linked lists genuinely win:

- **You already hold a pointer to the node** and need $O(1)$ splice, unlink or move-to-front: LRU caches, intrusive lists in kernels and allocators, undo logs.
- **Elements are large** and copying them during array shifts is expensive, though a `Vec<Box<T>>` or array of pointers often serves better.
- **You need stable addresses**: a pointer to an element must stay valid after other insertions. Arrays invalidate pointers on resize.
- **Lock-free queues and allocators**, where linking a node with one atomic pointer swap is the whole point.

Everything else, including most "the queue could get long" cases, is better served by a dynamic array or a ring buffer. Rust's `LinkedList` documentation says outright that a `Vec` or `VecDeque` is almost always the better choice, and Go's standard library keeps `container/list` largely for the LRU case.

## Layout matters within an array too

Locality is about bytes, not elements. Consider four million `Particle` records with position, velocity, mass and colour (64 bytes each), and a loop that updates only positions.

```python
# Array of structs: each particle is one object; the loop touches every field's memory
for p in particles:
    p.x += p.vx * dt

# Struct of arrays: one array per field; the loop touches only x and vx
for i in range(n):
    xs[i] += vxs[i] * dt
```

In a language with real structs (Go, Rust, C), the first layout drags mass and colour through the cache for no reason: each struct is 64 bytes and you use 16 of them, so three quarters of every cache line is wasted. Measured in C on four million particles (244 MB, well beyond L3): the array-of-structs update takes 9.9 ms (2.5 ns per particle), the struct-of-arrays update 1.7 ms (0.42 ns per particle), a 5.9× difference for identical arithmetic. This is why numerical libraries, game engines and columnar databases all store fields in separate arrays. In Python the cost is hidden behind the fact that every object is already a pointer to a heap allocation, which is part of why Python numeric code is slow and why NumPy, which uses contiguous typed arrays, is fast.

Two-dimensional arrays have the same issue: a matrix stored row by row should be iterated row by row. Iterating column by column touches a new cache line on every step, and for a large matrix each of those is a miss. Measured: summing an 8192 × 8192 `int32` matrix (256 MB) row by row takes 12 ms; column by column takes 271 ms, 23× slower, with identical complexity and identical arithmetic. Swapping the loop order on a naive matrix multiply is worth a similar factor on its own. The [2D arrays lesson](/learn/data-structures/arrays-strings/two-dimensional-arrays) and the [CPU caches lesson](/learn/systems/performance-engineering/cpu-caches-and-memory-layout) go deeper.

## Space costs that are not in the model

A few more places where counting words underestimates what you actually use.

**Object overhead.** The CPython table above: 28 bytes per int, about 100 per small object, 224 per three-key dict. When a service that "only stores a million small records" uses 2 GB, this is why. Typed arrays (`array.array`, NumPy, `Int32Array`, `[]int32`) store the values inline and are 5–10× smaller; `__slots__`, dataclasses with slots, or a columnar layout recover most of the gap for records.

**Allocator overhead and fragmentation.** Each heap allocation carries a header (often 8–16 bytes) and is rounded up to a size class. Millions of small allocations waste a meaningful fraction of memory and, worse, scatter your data across the heap so that later traversals miss cache: that is the difference between the 7 ms and the 888 ms columns above. Arena allocators and object pools exist for precisely this reason.

**Virtual memory.** Your process sees a flat address space, but pages (usually 4 KB) are mapped lazily and can be swapped out. Touching a fresh page costs a page fault (about a microsecond), and if the working set exceeds physical memory, "memory access" becomes disk access at a million-to-one penalty. The [virtual memory lesson](/learn/systems/operating-systems/virtual-memory) covers paging; the practical rule is that your working set, not your address space, is what must fit in RAM.

```viz
{"type": "memory", "scenario": "virtual-memory-paging", "title": "Pages, not bytes", "caption": "The process addresses memory in pages. A page that is not resident costs a fault, and one that has been swapped out costs a disk read."}
```

## Choosing on purpose

When you pick a structure, you are choosing a memory layout, and the layout predicts the cost better than the complexity does for anything that fits in cache.

| Question | If yes | If no |
|---|---|---|
| Does the working set fit in L2 (~1 MB)? | almost anything is fast; complexity barely matters | move to the next row |
| Does it fit in L3 (tens of MB)? | pointer-heavy structures cost ~20 ns per hop; arrays still stream | every dependent access is ~100 ns; layout dominates |
| Is access sequential or predictable? | prefetcher hides latency; arrays win by 5–500× | consider sorting, batching or blocking to make it sequential |
| Do you hold node references and need $O(1)$ splice? | a linked list (or index-linked array) is right | use a dynamic array or ring buffer |
| Do you touch a few fields of many records? | struct-of-arrays or columnar | array-of-structs is fine |
| Is the space auxiliary, or also hidden stack and object overhead? | report both | recount |

Only after those questions: which growth class, and do the constants cross over at my $n$?

## Failure modes in production

**Recursion that works in tests and dies on real data.** *Symptom:* a tree or list walker raises `RecursionError` (Python), `RangeError` (Node) or segfaults (C, Rust) on a specific customer's data. *Diagnosis:* the recursion depth equals the structure's height, and the failing input is a degenerate shape: a linked list of 50,000 nodes, a JSON document nested 2,000 deep, a directory tree from a malicious archive. *Fix:* rewrite with an explicit stack (an iterative DFS), or bound the depth at the boundary and reject deeper inputs; raising the recursion limit only moves the crash.

**"Small" data that does not fit.** *Symptom:* a Python worker that loads five million records as dicts is OOM-killed at 3 GB although the CSV is 200 MB. *Diagnosis:* `tracemalloc` or `sys.getsizeof` on one record shows 200–300 bytes per record of object headers, dict tables and boxed values, a 15× inflation over the raw bytes. *Fix:* a columnar layout (`array.array`, NumPy, Arrow), `__slots__` classes, or streaming the records instead of materialising them.

**Throughput collapses when the dataset grows past a cache.** *Symptom:* per-item cost is 12 ns at a million items and 90 ns at ten million; the growth class is linear and the graph is a step. *Diagnosis:* `perf stat -e cache-misses` shows misses per item going from a fraction to about one; the structure is pointer-linked (a map of objects, a tree, a linked list) and the working set has crossed the L3 boundary. *Fix:* contiguous storage (sorted arrays, flat hash maps with inline entries), processing in cache-sized batches, or sorting inputs so that accesses become sequential.

**The wrong loop order.** *Symptom:* a matrix or image routine is 10–25× slower than a colleague's with the same algorithm. *Diagnosis:* the inner loop walks down a column of a row-major array (or a row of a column-major one, as in Fortran and NumPy with `order='F'`), touching a new cache line per element. *Fix:* swap the loops, or transpose once and walk the transposed copy; for matrix multiply, block the loops so each tile fits in L1.

**Hidden copies doubling the footprint.** *Symptom:* a function that "works in place" doubles memory and occasionally OOMs on the largest inputs. *Diagnosis:* `sorted(x)`, `x[1:]`, `list(map(...))`, `df.copy()` inside a loop; each allocates a full copy, and slicing inside recursion (`nums[1:]`) makes an $O(n)$ algorithm $O(n^2)$ in both time and total allocation. *Fix:* index ranges (`lo`, `hi`) instead of slices, `x.sort()` instead of `sorted(x)`, views and iterators instead of materialised copies.

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

## Interviewer follow-ups

**"You said O(1) space. Where does the recursion live?"** *Model answer:* on the call stack, one frame per active call, so the auxiliary space is the maximum depth: $O(h)$ for a tree, which is $O(\log n)$ balanced and $O(n)$ degenerate; in CPython that fails at 1,000 frames, so for production I would use an explicit stack. *Common wrong answer:* "the recursion doesn't allocate anything", which forgets that frames are memory.

**"Both versions are O(n). Why is the linked list 100× slower?"** *Model answer:* the list traversal is a chain of dependent loads; each `next` pointer must arrive before the following address is known, so neither the prefetcher nor out-of-order execution can overlap the misses, and after allocator churn most hops are ~100 ns DRAM accesses. The array streams sequentially at under a nanosecond per element. *Common wrong answer:* "pointer dereferences are slower than indexing", which is true by a factor of one or two, not a hundred.

**"When would you still choose a linked list?"** *Model answer:* when I already hold a reference to the node and need $O(1)$ unlink or move-to-front, as in an LRU cache paired with a hash map; when addresses must stay stable across insertions; or in lock-free queues where linking is a single atomic operation. For "I might insert in the middle", a dynamic array's memmove usually wins. *Common wrong answer:* "whenever there are many insertions", which ignores the traversal needed to find the position.

**"A million records at about 100 bytes each should be 100 MB. Why is the process at 2 GB?"** *Model answer:* in Python each record is a dict (about 200 bytes of table for a few keys) whose values are boxed objects (28 bytes per int, 24 per float, 40+ per string) each with allocator rounding, so 5–15× inflation is normal; the fix is a columnar or typed layout, or `__slots__`. *Common wrong answer:* "a memory leak", diagnosed without measuring per-record size.

**"How would you make this loop cache-friendly without changing the algorithm?"** *Model answer:* make the access pattern sequential: iterate in storage order, store only the fields the loop touches contiguously (struct-of-arrays), block the computation so each tile fits in L1, and allocate nodes from an arena so that a traversal walks forward through memory. *Common wrong answer:* "add a cache", which adds a layer without fixing the access pattern.

## What mid-level engineers get wrong

- **Reporting O(1) space for a recursive solution**, then being unable to say how deep the stack goes or where it overflows.
- **Choosing a linked list from its Big-O row**, and shipping a structure that traverses at 100 ns per hop where an array would stream at 0.2 ns per element.
- **Trusting a linked-list micro-benchmark on fresh nodes**, which measures the contiguous case (4× slower than an array) and not the fragmented case (400× slower).
- **Counting values, not objects**, in a managed language, and being surprised when a million "small" records need gigabytes.
- **Iterating a matrix in the wrong order** and then optimising the arithmetic, which is not where the 20× went.
- **Slicing inside recursion** (`solve(nums[1:])`), turning a linear algorithm into a quadratic one in both time and allocation.

## Senior signals

- You count the call stack as space, unprompted, and can give the depth for a balanced tree ($\log n$), a list ($n$) and naive recursion, and the limit where your runtime fails (1,000 frames in CPython, about 10,000 in V8, 8 MB in C).
- You distinguish auxiliary from total space, exclude required output from auxiliary, and say when you are mutating the caller's input.
- You quote the memory hierarchy in ratios (L1 ~1 ns, L3 ~20 ns, DRAM ~100 ns, SSD ~50 µs) and use them to explain why two $O(n)$ algorithms differ by 50–500×.
- You explain the array-versus-linked-list result as dependent loads versus prefetchable sequential access, you know that fragmentation is what makes production lists slower than benchmarks, and you know the specific cases (LRU, intrusive lists, stable addresses, lock-free queues) where the list is still the right tool.
- You know that a Python object costs 16 bytes before it holds anything and that an object per element costs 5–10× the memory of a typed array, and that this, not Big-O, is usually why a "small" dataset does not fit.
- You mention loop order and struct-of-arrays layout as free performance wins when a colleague is about to optimise the algorithm, and you can put a number on each (about 20× and 5× respectively for data beyond L3).

## Check yourself

```quiz
- q: >-
    A recursive function computes the depth of a binary tree with n nodes by recursing into both children. What is its auxiliary space complexity?
  options: ["O(1), because it allocates no data structures", "O(log n) always, since each call halves the tree", "O(h): O(log n) if balanced, O(n) if degenerate", "O(n), because there are n calls in total"]
  answer: 2
  explanation: >-
    Only the frames on the current root-to-leaf path are live at once, so the stack holds at most h frames. The total number of calls is n, but they do not coexist. "O(1)" ignores the stack; "O(log n) always" assumes the tree is balanced, and a degenerate tree has height n.
- q: >-
    Summing 10⁷ integers took 2 ms from an array, 7 ms from a linked list whose nodes were allocated consecutively, and 890 ms from the same list after its nodes were scattered. What explains the gap between the two list figures?
  options: ["Consecutive nodes let the prefetcher follow the chain; scattered ones make every hop a DRAM miss", "Scattered nodes trigger page faults on every access, costing microseconds each", "Scattered nodes are larger because each carries an allocator header", "The consecutive list is really an array, so the compiler vectorised the loop"]
  answer: 0
  explanation: >-
    Both lists do the same dependent loads, but when nodes are consecutive the addresses advance predictably and the prefetcher (and cache lines) hide most of the latency. When nodes are scattered, each hop waits about 100 ns for DRAM, and nothing can overlap it. Node size is the same in both cases; the pages were resident, and a compiler cannot vectorise a pointer chase.
- q: >-
    Which situation is a genuine reason to prefer a linked list over a dynamic array?
  options: ["You want to minimise the memory used per element", "You need fast iteration over all elements in order", "You already hold the node and need O(1) move-to-front", "You frequently insert at index n/2 of a long sequence"]
  answer: 2
  explanation: >-
    With a node reference in hand (as in an LRU cache, where a hash map hands you the node), unlink and relink are constant-time pointer operations, and no array can do that without shifting. Insertion at an index still needs a traversal first, which usually loses to the array's memmove; iteration and memory both favour arrays.
- q: >-
    A Python service stores 5 million small records as dicts and uses about 3 GB. The record data itself would be about 200 MB as raw bytes. What best explains the gap?
  options: ["64-bit pointers double the size of every stored field", "The garbage collector holds on to memory it has freed", "Per-object overhead: headers, boxing, hash table slack", "The Python runtime leaks memory in long-running services"]
  answer: 2
  explanation: >-
    Every value is a boxed object (a small int alone is 28 bytes), every dict carries its own hash table with unused slots (a three-key dict measures 184 bytes before its values), and every allocation is rounded up to a size class. Pointer width alone would at most double a field, not inflate data 15×. Typed arrays, __slots__ classes or a columnar layout recover most of the gap. This is a layout cost, not a leak.
- q: >-
    A colleague speeds up a matrix routine 20× by swapping the order of two nested loops. The complexity is unchanged. What happened?
  options: ["The compiler removed one of the loops as dead code", "The inner loop can now run in parallel across cores", "Accesses now walk along rows, reusing each cache line", "The new order performs fewer floating-point operations"]
  answer: 2
  explanation: >-
    Row-major storage means neighbouring columns are adjacent in memory. Walking down a column touches a new cache line every step; walking along a row uses each fetched line fully and lets the prefetcher keep up. Same operations, radically different memory traffic; measured on a 256 MB matrix the difference was 23×.
- q: >-
    A recursive DFS over a user-supplied tree passes all tests and then crashes in production on one input. Which fix addresses the cause rather than moving it?
  options: ["Raise sys.setrecursionlimit to 100,000 so deeper inputs succeed", "Replace the recursion with an explicit stack so depth is bounded by heap, not the call stack", "Run the DFS in a thread with a larger stack size", "Catch RecursionError and return a partial result"]
  answer: 1
  explanation: >-
    The crash is the call stack reaching its limit on a degenerate (path-shaped) input; the depth equals the tree's height. An explicit stack on the heap makes the space O(h) of ordinary memory with no fixed ceiling. Raising the limit or the thread stack size moves the crash to a deeper input (and past a point the C stack overflows for real), and catching the error hides wrong results.
```
