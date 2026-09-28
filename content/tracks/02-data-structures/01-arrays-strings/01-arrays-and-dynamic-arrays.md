---
slug: arrays-and-dynamic-arrays
title: Arrays and dynamic arrays
description: How an index becomes a memory address, why append is O(1) only on average, what CPython lists, V8 arrays, Rust Vecs, Go slices and Java ArrayLists actually allocate, and what one insert(0) costs in bytes.
minutes: 35
difficulty: easy
tags: [arrays, dynamic-array, amortized, memory, cache, cpython, v8]
problems: [remove-duplicates-sorted, move-zeroes]
---
You call `items.append(x)` a million times and it takes about 30 ms. You call `items.insert(0, x)` a million times and it takes tens of seconds to minutes. Both are "adding one element to a list". The difference is not the language or the library; it is what contiguous memory allows and what it forbids, and every list, vector, buffer and string you have ever used inherits those rules.

An array is a block of memory where element `i` lives at a computable address. That one property gives O(1) indexing and hardware-friendly scanning. It also means that anything that changes *where* elements live, such as inserting in the middle or growing past the block, has to move memory. Dynamic arrays are the engineering that hides most of that cost most of the time. This lesson traces that engineering on real numbers from real runtimes.

## Contiguous memory and O(1) indexing

A fixed-size array of `n` elements, each `s` bytes, is `n × s` consecutive bytes starting at some base address. Element `i` is at

$$\text{addr}(i) = \text{base} + i \times s$$

That is one multiply and one add, regardless of `n`. With `base = 0x10000` and 8-byte slots, element 500,000 is at `0x10000 + 4,000,000 = 0x3E0900`; no search, no pointer chasing, and reading it costs the same as reading element 0: at most one cache miss (~100 ns from DRAM, ~1 ns if the line is already in L1; both depend on the CPU).

Contiguity also gives you **spatial locality**. The CPU fetches memory in 64-byte cache lines, so reading `a[0]` pulls `a[1]` through `a[15]` (for 4-byte ints) into cache with it, and the hardware prefetcher notices sequential access and fetches ahead. Scanning an array of 10 million ints runs at close to memory bandwidth. Scanning 10 million linked-list nodes takes one cache miss per node. Same O(n); a 10–50× difference in time, depending on how scattered the nodes are. [Space complexity and the memory hierarchy](/learn/foundations/complexity/space-complexity-and-memory-hierarchy) has the latency table and [CPU caches and memory layout](/learn/systems/performance-engineering/cpu-caches-and-memory-layout) the mechanism.

## What a dynamic array is

A fixed block cannot grow, because the bytes after it belong to someone else. A dynamic array (`list`, `Vec`, `ArrayList`, `Array`) is three things: a pointer to a block, the number of elements in use (`len`), and the block's size (`capacity`).

```text
len = 5, capacity = 8
┌───┬───┬───┬───┬───┬───┬───┬───┐
│ 3 │ 1 │ 4 │ 1 │ 5 │ · │ · │ · │
└───┴───┴───┴───┴───┴───┴───┴───┘
  0   1   2   3   4   (spare)
```

`append(x)` writes to slot `len` and increments `len`, which is O(1), *unless* `len == capacity`. Then it allocates a bigger block, copies every element across, frees the old block, and only then appends. That copy is O(n).

## Hand trace: doubling through five appends

Start with capacity 0 and double on overflow (the rule the exercise below uses, with a starting capacity of 2).

| append | len after | capacity before | resize | elements copied | cumulative copies |
|---|---|---|---|---|---|
| 1 | 1 | 0 | 0 → 1 | 0 | 0 |
| 2 | 2 | 1 | 1 → 2 | 1 | 1 |
| 3 | 3 | 2 | 2 → 4 | 2 | 3 |
| 4 | 4 | 4 | none | 0 | 3 |
| 5 | 5 | 4 | 4 → 8 | 4 | 7 |

Continue the table to a million appends and you get 20 resizes (capacities `1, 2, 4, …, 1,048,576`) and 1,048,575 element copies in total: fewer than one copy per append, on top of the one write per append. That is what "O(1) amortised" means concretely: the average append costs under two element moves, even though the 524,289th append copies 524,288 elements on its own. [Amortised analysis](/learn/foundations/complexity/amortized-analysis) proves it; the intuition is that each doubling is paid for by the appends that filled the previous block.

**Grow by a constant instead** (say 10 slots) and the table looks different: `n/10` resizes of sizes `10, 20, 30, …, n`, so about `n²/20` copies. Appending a million elements copies 50 billion; the "O(1) append" is O(n).

```viz
{"type": "memory", "scenario": "dynamic-array-growth", "title": "Doubling on overflow", "caption": "Each resize copies everything once; because capacity doubles, the copies total less than n across n appends."}
```

## Hand trace: CPython's over-allocation

CPython does not double. `list_resize` in `Objects/listobject.c` (this formula since 3.9; the trace below was measured on CPython 3.14.7) computes

```text
new_allocated = (newsize + (newsize >> 3) + 6) & ~3
```

that is, the new length plus one eighth of it plus 6, rounded *down* to a multiple of 4. Appending to an empty list one element at a time, the block is reallocated only when `newsize` exceeds `allocated`:

| newsize at resize | newsize >> 3 | newsize + (newsize >> 3) + 6 | & ~3 → allocated | `sys.getsizeof` (56 + 8 × allocated) |
|---|---|---|---|---|
| 1 | 0 | 7 | 4 | 88 |
| 5 | 0 | 11 | 8 | 120 |
| 9 | 1 | 16 | 16 | 184 |
| 17 | 2 | 25 | 24 | 248 |
| 25 | 3 | 34 | 32 | 312 |
| 33 | 4 | 43 | 40 | 376 |
| 41 | 5 | 52 | 52 | 472 |
| 53 | 6 | 65 | 64 | 568 |
| 65 | 8 | 79 | 76 | 664 |

Running `sys.getsizeof` after every append on 3.14.7 reproduces exactly this sequence (`4, 8, 16, 24, 32, 40, 52, 64, 76, 92, 108, …`). Three numbers fall out of it:

- **1,000 appends: 28 resizes**, final `allocated = 1100`, 100 spare slots (9%).
- **1,000,000 appends: 86 resizes**, final `allocated = 1,056,084`, 5.6% spare. Doubling would do 20 resizes but leave up to 50% spare immediately after each.
- The growth factor is roughly 1.125 for large lists, so CPython trades more `realloc` calls for tighter memory. It gets away with that because glibc's `realloc` on a block above its mmap threshold (128 KB by default, adaptive up to 32 MB) uses `mremap`, which moves page-table entries rather than bytes, so many of those 86 "copies" copy nothing.

The same function shrinks: when `newsize` drops below half of `allocated`, `list_resize` reallocates down, so a list you drained with `pop()` does not keep its peak block forever.

## The growth strategy and why doubling works

Why not 3× or 10×? Memory: right after a resize the array is `1 − 1/factor` empty. Why not 1.5×? A factor of 2 means the freed blocks (`c, 2c, 4c`) never add up to the next request (`8c`), so the allocator can never reuse them for it; with 1.5× they can (`1 + 1.5 + 2.25 > 3.375` after a few steps), which is the argument Facebook's `folly::fbvector` documents for choosing 1.5×. Between "copy rarely" and "waste little", every runtime picks a point; the table in the next section shows where.

The senior habit that falls out of this: **if you know `n`, pre-size** with `Vec::with_capacity(n)`, `new ArrayList<>(n)`, `make([]T, 0, n)` or a `[None] * n` list. In CPython the gain is invisible (86 cheap `realloc`s under a million interpreted iterations), but in Rust, Go and Java you skip every copy, and you skip the allocation pauses that would otherwise land at unpredictable points in your latency histogram.

## Insertion and deletion costs

Everything that is not at the end has to move memory.

| Operation | Cost | Why |
|---|---|---|
| `a[i]` read/write | O(1) | Address arithmetic |
| `append(x)` / `push(x)` | O(1) amortised | Occasional resize |
| `pop()` from the end | O(1) | Decrement `len` |
| `insert(i, x)` | O(n − i) | Shift `n − i` elements right by one |
| `insert(0, x)` | O(n) | Shift everything |
| `pop(0)` / `shift()` | O(n) | Shift everything left |
| `remove(x)` by value | O(n) | Linear search, then shift |
| `x in a` / `includes` | O(n) | Linear scan |
| Slice `a[i:j]` | O(j − i) | Copies (Python); Go/Rust slices are views and are O(1) |

### What `insert(0, x)` costs in bytes

CPython implements the shift with one `memmove` of `n` pointers. On a 1,000,000-element list that is 8,000,000 bytes, which is **125,000 cache lines** read and 125,000 written, about 16 MB of memory traffic for one call. Measured on the author's machine (CPython 3.14.7, a Ryzen 9 9950X3D with 96 MB of L3), one `insert(0, x)` on a 1M-element list takes ~70 µs, because the 8 MB block sits entirely in cache. On a 16M-slot list (128 MB of pointers, larger than any cache) the same call takes ~4.6 ms, an effective 28 GB/s, which is DRAM bandwidth doing the work. Your numbers depend on cache size and memory bandwidth; the shape does not.

Do it in a loop and the shifts sum to `n²/2` pointer moves: for `n = 1,000,000` that is 5 × 10¹¹ pointers, or 4 TB of `memmove`. Measured draining a list with `pop(0)`: 25,000 elements in 13 ms, 50,000 in 52 ms, 100,000 in 207 ms; the time quadruples when `n` doubles, which is the signature of O(n²). A `collections.deque` drains 100,000 elements with `popleft()` in 2.2 ms. This is the most common accidental O(n²) in production code: a queue implemented as `list.pop(0)` in Python or `array.shift()` in JavaScript. The fix is a deque or a head index, covered in [Stacks and queues](/learn/data-structures/stacks-queues/stacks-and-queues).

The array visualiser below shows the other side: removing duplicates from a sorted array *without* shifting, by overwriting with a write pointer. This read/write two-pointer idea is the foundation of every in-place array technique.

```viz
{"type": "array", "algorithm": "remove-duplicates", "values": [1, 1, 2, 3, 3, 3, 5, 7, 7], "title": "In-place removal with a write pointer"}
```

## Under the hood: what each runtime allocates

"Array" means five different things across five runtimes. The growth rules and the bytes per element are the facts that decide memory budgets and latency profiles.

| Runtime (version) | Growth rule | Capacities from empty | Header | Per element |
|---|---|---|---|---|
| CPython `list` (3.9+) | `n + n/8 + 6`, down to a multiple of 4 | 4, 8, 16, 24, 32, 40, 52, 64 | 56 B | 8 B pointer + the object (28 B for a small `int`) |
| V8 `Array` (Node 20–24) | `old + old/2 + 16` | 16, 40, 76, 130, 211 | ~32 B + FixedArray header | 8 B tagged value in Node (4 B in Chrome, which enables pointer compression) |
| Rust `Vec<T>` (1.x) | `max(2 × old, needed)`, minimum non-zero capacity 4 (8 for 1-byte `T`) | 4, 8, 16, 32 | 24 B (ptr, cap, len) | `size_of::<T>()`, inline |
| Go slice (1.18+) | 2× below 256 elements, then smoothly toward 1.25×, rounded up to a malloc size class | …, 256, 512, 848, 1280, 1792, 2560 for `[]int` | 24 B (ptr, len, cap) | `sizeof(T)`, inline |
| Java `ArrayList` (8+) | `old + old/2`, default 10 allocated on first add | 10, 15, 22, 33, 49 | ~24 B + array header | 4 B reference (compressed oops) + the boxed object |

## Under the hood: bytes per element

**CPython.** A `PyListObject` is 56 bytes (16 for the GC header, 16 for refcount and type, 8 each for `ob_size`, `ob_item` and `allocated`) and `ob_item` points at a separate block of `allocated` pointers. `[1000, 2000, 3000]` is therefore 56 + 3 × 8 bytes of list plus 3 × 28 bytes of `int` objects: 164 bytes for 12 bytes of payload, and iterating it dereferences a pointer per element into objects that may be anywhere on the heap. That is why `array.array('i')` and NumPy exist: a million `int32` values occupy 4 MB there against ~36 MB as a list, and a scan runs at memory speed.

**V8.** There is no single array. V8 picks an *elements kind* (`PACKED_SMI_ELEMENTS` for small integers, `PACKED_DOUBLE_ELEMENTS` for raw doubles, `PACKED_ELEMENTS` for anything, `HOLEY_*` once a gap exists, dictionary mode once the array is sparse enough) and transitions only toward the more general kind. `shift()` can be O(1) when V8 is able to left-trim the backing store in place, but the condition depends on heap layout; treat it as O(n). Typed arrays (`Int32Array`, `Float64Array`) are the honest contiguous arrays.

**Rust and Go.** `Vec<u32>` of a million elements is 4 MB plus a 24-byte header, and `realloc` may extend in place. A Go slice is the same triple but is a *view*: `b := a[2:5]` copies nothing, and `append(b, x)` writes into `a`'s backing array if `cap` allows, the classic aliasing bug; `a[2:5:5]` (three-index slice) forces a copy on the next append.

**Java.** `ArrayList<Integer>` of a million values is ~4 MB of references plus ~16 MB of `Integer` objects (12-byte header plus the 4-byte value, padded), five times an `int[]`, with the values scattered across the heap. JVM shops keep primitive-specialised collections (fastutil, Eclipse Collections) for exactly this reason; [JVM essentials](/learn/senior-craft/languages-for-senior-engineers/jvm-essentials) covers the object layout.

## Worked example: building a list three ways

Build a list of the integers `0..n−1` for `n = 1,000,000`.

```python
# 1. append: 1M O(1) writes, 86 reallocs (CPython), most of them in place
out = []
for i in range(n):
    out.append(i)

# 2. insert at front: n shifts of growing size, n²/2 = 5×10^11 pointer moves
out = []
for i in range(n):
    out.insert(0, i)          # do not do this

# 3. pre-sized: zero resizes
out = [0] * n
for i in range(n):
    out[i] = i
```

Measured on CPython 3.14.7: version 1 takes 31 ms, version 3 takes 39 ms, and `list(range(n))` takes 23 ms. Pre-sizing did not win, because the 86 `realloc` calls are noise under a million interpreted loop iterations; the per-iteration bytecode cost dominates. Version 2 is not worth running to completion: extrapolating the measured `pop(0)` curve (207 ms for 100,000, quadrupling per doubling) gives at least 20 s for a million, and more once the 8 MB block no longer fits in cache. Two of the three are "one loop, one operation per iteration" and differ by three orders of magnitude.

## Production failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| A worker's p99 climbs with queue depth; CPU profile shows `list_ass_slice` / `memmove` (Python) or `Array.prototype.shift` (Node) | A queue is a list drained from the front: O(n) per pop, O(n²) per burst | `collections.deque`, a head index, or a ring buffer |
| A Node hot loop got 5–10× slower after a refactor; `--allow-natives-syntax` and `%DebugPrint(arr)` show `HOLEY_ELEMENTS` or `DICTIONARY_ELEMENTS` | Someone wrote `arr[i]` past `length`, used `new Array(n)` without `fill`, or stored a huge sparse index | Build with `push`, `new Array(n).fill(0)`, or a typed array |
| Go service corrupts data intermittently; a sub-slice was appended to inside a helper | `append` wrote into the shared backing array while `cap > len` | Three-index slice `s[i:j:j]`, or `copy` into a fresh slice before appending |
| Container OOM-killed while live data was at 60% of the limit | A resize needs the old and new blocks at once: growing a 1.2 GB `Vec` to 2.4 GB peaks at 3.6 GB | `with_capacity` from a known `n`, or a chunked structure (`VecDeque`, a list of blocks) |
| JVM heap five times the size of the data it holds; GC pauses scale with it | `ArrayList<Integer>`: 4-byte reference plus a 16-byte `Integer` per value | Primitive arrays or fastutil/Eclipse `IntArrayList` |

## Trade-offs: array against the alternatives

| Structure | Index | Append | Insert/delete at front | Delete in middle | Bytes per element (64-bit) | Cache behaviour |
|---|---|---|---|---|---|---|
| Fixed array (`array.array`, typed array, `[T; N]`) | O(1) | not possible | O(n) | O(n) | `s` | sequential |
| Dynamic array | O(1) | O(1) amortised | O(n) | O(n) | `s` × (1 + 0–100% spare) | sequential |
| Ring-buffer deque (`VecDeque`, `ArrayDeque`) | O(1) | O(1) amortised | O(1) amortised | O(n) | `s` + spare | two sequential runs |
| CPython `deque` (linked 64-slot blocks) | O(n) in the middle | O(1) | O(1) | O(n) | 8 + ~1/64 of a block header | good within a block |
| Doubly linked list | O(n) | O(1) | O(1) | O(1) with a node handle | `s` + 16 pointers + allocator overhead | one miss per node |
| Hash map keyed by index | O(1) average | O(1) average | not ordered | O(1) average | ~40 or more | random |

## When a plain array beats everything else

A senior engineer's reflex is often *not* to reach for a fancier structure:

- **Keys are small dense integers** (bytes 0–255, HTTP status codes, days of the week): an array indexed by the key is a perfect hash table with zero hashing cost.
- **`n` is small** (under ~50): a linear scan over a contiguous array beats a hash lookup because it is a few cache lines with no hashing, no probing and no allocation. Many production "sets" of a handful of items should be arrays.
- **You need to sort, binary search or scan**: all three want contiguity.
- **You need predictable memory**: an array of `n` fixed-size records is exactly `n × s` bytes, no per-node overhead, no fragmentation.

The cases where an array loses are equally specific: many insertions or deletions far from the end; elements that must keep a stable address while others move (a resize invalidates every pointer into the block, which is why Rust's borrow checker refuses to let you hold `&v[0]` across a `push` and why C++ documents iterator invalidation on `push_back`); and O(1) removal of an arbitrary element given only a handle to it. Those are the linked list's territory, covered in [Linked list fundamentals](/learn/data-structures/linked-lists/linked-list-fundamentals). Redis makes the same trade at scale: its lists are a linked list of small contiguous "listpack" blocks, contiguous where it helps the cache and linked where it makes both ends O(1).

## Interviewer follow-ups

**"Why do most runtimes grow by 1.5× or 2× rather than 4×?"** Model answer: the copy cost is geometric for any factor above 1, so the choice is about memory: right after a resize a 4× array is 75% empty, a 2× array 50%, a 1.5× array 33%. Smaller factors also let freed blocks be reused for later growth (the `fbvector` argument), and `realloc` can often extend in place, which makes the extra resizes cheap. Common wrong answer: "2× is optimal because powers of two align with memory pages", which confuses alignment with growth.

**"Is `append` O(1)?"** Model answer: O(1) amortised; an individual append can be O(n) when it triggers a resize, and in a latency-sensitive loop that one call is a visible spike. If the spike matters, pre-size, or use a structure that never copies (a chunked deque). Common wrong answer: "yes, always O(1)".

**"A list of 10 million Python ints uses about 360 MB. Why, and what would you do?"** Model answer: 8 bytes per pointer plus 28 bytes per `int` object (values outside the small-int cache of −5 to 256), so ~36 bytes per element; `array.array('q')` or a NumPy `int64` array stores them at 8 bytes each and scans 4–5× faster because there is no pointer to chase. Common wrong answer: "ints are 8 bytes, so 80 MB".

**"You hold a pointer or reference into an array and then push to it. What happens?"** Model answer: if the push resized, the old block was freed and the reference is dangling (undefined behaviour in C++, a compile error in Rust, silently stale indices in a language that hands you copies). Store indices, not pointers, into growable arrays. Common wrong answer: "it stays valid because `realloc` extends in place", which is true only sometimes.

## What mid-level engineers get wrong

- **Treating `pop(0)` / `shift()` as O(1)** because it is one line. Consequence: an O(n²) queue whose latency grows with load, discovered in production rather than in review.
- **Assuming a Python list of numbers is a block of numbers.** Consequence: memory estimates off by 4–5× and scans that are pointer chases.
- **Pre-sizing for the wrong reason.** Consequence: they cannot explain why it made no difference in CPython and made a large difference in Go, and an interviewer notices.
- **Mixing element types in a JavaScript hot array.** Consequence: a one-way transition to a generic elements kind and a silent slowdown that no profiler attributes to a line of code.
- **Appending to a Go sub-slice inside a helper.** Consequence: the caller's data changes without any visible write, the kind of bug that survives code review.

## Exercises

Build the mechanism yourself. The first exercise fixes the growth rule so the tests can check capacity exactly; the second reproduces CPython's rule.

```exercise
id: dynamic-array
title: Implement a dynamic array
prompt: |
  Implement `DynamicArray` with a fixed-size backing block that you grow by
  doubling. Start with capacity 2. On `push`, if `size == capacity`, allocate
  a new block of twice the capacity, copy the elements across, then append.
  Never shrink.

  Methods: `push(x)` (returns nothing), `pop()` (removes and returns the last
  element, or `None`/`null` when empty), `get(i)` (element at index `i`),
  `size()` and `capacity()`.

  Do not use the language's built-in append/push on the backing block: the
  backing block must be a fixed-length list/array that you replace on growth.
languages: [python, javascript]
entry: DynamicArray
starter:
  python: |
    class DynamicArray:
        def __init__(self):
            self._cap = 2
            self._len = 0
            self._data = [None] * self._cap   # fixed block; replace it to grow

        def push(self, x):
            # TODO: grow (double) when full, then write at index self._len
            pass

        def pop(self):
            # TODO: return None when empty
            return None

        def get(self, i):
            return self._data[i]

        def size(self):
            return self._len

        def capacity(self):
            return self._cap
  javascript: |
    class DynamicArray {
      constructor() {
        this._cap = 2;
        this._len = 0;
        this._data = new Array(this._cap).fill(null); // fixed block; replace it to grow
      }
      push(x) {
        // TODO: grow (double) when full, then write at index this._len
      }
      pop() {
        // TODO: return null when empty
        return null;
      }
      get(i) { return this._data[i]; }
      size() { return this._len; }
      capacity() { return this._cap; }
    }
tests:
  - args: [["push", 1], ["push", 2], ["push", 3], ["size"], ["capacity"], ["get", 2]]
    expected: [null, null, null, 3, 4, 3]
    label: third push triggers the first doubling
  - args: [["capacity"], ["push", 5], ["pop"], ["size"], ["capacity"], ["pop"]]
    expected: [2, null, 5, 0, 2, null]
    label: pop on empty returns null and never shrinks
  - args: [["push", 1], ["push", 2], ["push", 3], ["push", 4], ["push", 5], ["capacity"], ["pop"], ["pop"], ["size"], ["get", 0]]
    expected: [null, null, null, null, null, 8, 5, 4, 3, 1]
    label: two doublings
  - args: [["push", 7], ["push", 8], ["push", 9], ["push", 10], ["capacity"], ["get", 3], ["pop"], ["pop"], ["pop"], ["pop"], ["size"], ["capacity"]]
    expected: [null, null, null, null, 4, 10, 10, 9, 8, 7, 0, 4]
    hidden: true
    label: fourth push fits without growing
hints:
  - "Grow before writing: allocate `[None] * (2 * cap)`, copy indices `0..len-1`, then swap the block and double `cap`."
  - "`pop` must clear the slot (optional) and decrement `len`; it must not touch `cap`."
```

```exercise
id: cpython-capacities
title: Reproduce CPython's over-allocation
prompt: |
  Simulate appending `n` elements one at a time to an empty CPython list and
  return the list of `allocated` values after each reallocation, in order.
  Start with `allocated = 0`. Before writing element number `newsize`
  (1-based), if `newsize > allocated`, reallocate to
  `(newsize + (newsize >> 3) + 6) & ~3` and record that value.
  For `n = 9` the answer is `[4, 8, 16]`; for `n = 0` it is `[]`.
languages: [python, javascript]
entry: cpython_capacities
starter:
  python: |
    def cpython_capacities(n):
        # your code here
        return []
  javascript: |
    function cpython_capacities(n) {
      // your code here
      return [];
    }
tests:
  - args: [9]
    expected: [4, 8, 16]
  - args: [0]
    expected: []
    label: no appends, no allocation
  - args: [4]
    expected: [4]
    label: the first block holds four
  - args: [25]
    expected: [4, 8, 16, 24, 32]
  - args: [64]
    expected: [4, 8, 16, 24, 32, 40, 52, 64]
    hidden: true
    label: the 64th append fits exactly
  - args: [100]
    expected: [4, 8, 16, 24, 32, 40, 52, 64, 76, 92, 108]
    hidden: true
hints:
  - "Loop `newsize` from 1 to `n`; only when `newsize > allocated` do you compute and record a new capacity."
  - "`& ~3` clears the two low bits, which rounds down to a multiple of 4."
```

## Senior signals

- You describe append as "O(1) amortised because of geometric growth", you can trace five appends with the capacity after each, and you can say what goes wrong with additive growth.
- You know CPython grows by about 1.125× with the `n + n/8 + 6` rule (4, 8, 16, 24, 32, 40, 52, 64, …) and that `realloc` above the mmap threshold moves pages, not bytes.
- You can put a byte count on `insert(0, x)`: 8 MB and 125,000 cache lines for a million pointers, and `n²/2` moves in a loop.
- You pre-size arrays when `n` is known and you know in which languages that removes copies and allocation pauses, and in which it changes nothing measurable.
- You know a Python list is an array of pointers to boxed objects (~36 bytes per int), and that `numpy`/`array.array`/typed arrays are how you get real contiguous numbers.
- You know V8's elements kinds transition one way, that `new Array(n)` without `fill` makes a holey array, and that a resize needs old and new blocks live at once.
- You choose a plain array over a hash map when keys are small dense integers or `n` is tiny, and you can explain the cache argument.

## Check yourself

```quiz
- q: >-
    A dynamic array grows by adding a fixed 100 slots whenever it is full. What is the total cost of appending n elements, for large n?
  options: ["O(n log n), because the number of resizes grows logarithmically", "O(100n), because each resize copies at most 100 elements", "O(n²), because n/100 resizes each copy up to n elements", "O(n), because each append is still O(1) amortised"]
  answer: 2
  explanation: >-
    With additive growth there are about n/100 resizes and the k-th copies about 100k elements, so the total is roughly n²/200. Geometric growth is what makes the number of resizes logarithmic and the total copying linear; a resize copies every existing element, not only the 100 new slots.
- q: >-
    A CPython list has allocated 8 and holds 8 elements. You append a ninth. What does list_resize set allocated to?
  options: ["18, since capacity doubles from 9 on every overflow", "24, since 9 + (9 >> 3) + 6 is rounded up to a multiple of 8", "16, since 9 + (9 >> 3) + 6 is 16, already a multiple of 4", "12, since 9 + 3 is rounded up to the next multiple of 4"]
  answer: 2
  explanation: >-
    The rule is newsize + (newsize >> 3) + 6 with the two low bits cleared: 9 + 1 + 6 = 16, and 16 & ~3 is 16. Rounding goes down, not up, and the factor is about 1.125 for large lists, not 2. Measured with sys.getsizeof on 3.14.7 the sequence is 4, 8, 16, 24, 32, 40, 52, 64.
- q: >-
    Which of these is the strongest practical reason arrays outperform linked lists for sequential scans, given both are O(n)?
  options: ["Lists must be traversed recursively, which adds a stack frame per node", "Array indexing is O(1), while finding each next list node costs O(n)", "Contiguous elements share cache lines and get prefetched; list nodes are scattered", "Arrays live on the stack, which is faster to read than the heap holding nodes"]
  answer: 2
  explanation: >-
    The asymptotic cost is identical; the constant factor is dominated by memory access. A 64-byte cache line holds 16 ints and sequential access is prefetched, whereas each node dereference in a list is typically a cache miss (~100 ns). Stepping to the next node is O(1), not O(n), and a dynamic array lives on the heap like list nodes do.
- q: >-
    In Python, why is iterating a list of a million ints much slower than iterating a numpy int32 array of the same values?
  options: ["The list stores pointers to boxed int objects; numpy stores raw values contiguously", "The list bounds-checks every access; numpy validates the whole range once up front", "Python lists are linked lists internally, so each step follows a next pointer", "Lists grow by about 1.125×, so their elements end up spread across several memory blocks"]
  answer: 0
  explanation: >-
    A CPython list is a contiguous array of PyObject pointers; the integers live elsewhere on the heap, so each element costs a dereference and often a cache miss. numpy stores unboxed values, so the scan is cache-friendly and can be vectorised. The list's pointer array itself is one block: a resize copies everything into the new block rather than fragmenting it.
- q: >-
    You write `const a = []; a[10] = 1;` in JavaScript. What has V8 most likely done?
  options: ["Switched it to dictionary mode, turning indexing into a hash lookup", "Thrown a RangeError, since index 10 is past the array's length", "Made it a holey array whose accesses check for missing slots", "Allocated 11 packed integer slots, filling indices 0–9 with zeros"]
  answer: 2
  explanation: >-
    Writing past the end creates holes (indices 0–9 are missing), which moves the array to a HOLEY elements kind permanently, so every access checks whether the slot exists. Dictionary mode happens only for very sparse arrays, such as writing index 1,000,000 into an empty one. Building with push keeps arrays packed.
- q: >-
    A Go caller has s with len 4 and passes s[:2] to a function, which appends one element and returns nothing. Afterwards the caller finds s[2] changed. Why?
  options: ["The append exceeded capacity, so the new array replaced the caller's one too", "The garbage collector moved the backing array while both slices pointed at it", "Slices are passed by reference, so append always mutates the caller's slice", "The append had spare capacity, so it wrote into the shared backing array"]
  answer: 3
  explanation: >-
    A slice header is (ptr, len, cap) and is passed by value. If cap exceeds len, append writes into the existing backing array, which the caller's slice also points at. When cap is exhausted, append allocates a new array that only the callee's copy of the header sees, which is why the bug is intermittent.
```
