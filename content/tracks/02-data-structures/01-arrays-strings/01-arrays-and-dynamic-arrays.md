---
slug: arrays-and-dynamic-arrays
title: Arrays and dynamic arrays
description: How an index becomes a memory address, why append is O(1) only on average, and what Python lists, JavaScript arrays and Rust Vecs actually allocate.
minutes: 35
difficulty: easy
tags: [arrays, dynamic-array, amortized, memory, cache]
problems: [remove-duplicates-sorted, move-zeroes]
---
You call `items.append(x)` a million times and it takes a few milliseconds. You call `items.insert(0, x)` a million times and it takes minutes. Both are "adding one element to a list". The difference is not the language or the library; it is what contiguous memory allows and what it forbids, and every list, vector, buffer and string you have ever used inherits those rules.

An array is a block of memory where element `i` lives at a computable address. That one property gives O(1) indexing and hardware-friendly scanning. It also means that anything that changes *where* elements live, such as inserting in the middle or growing past the block, has to move memory. Dynamic arrays are the engineering that hides most of that cost most of the time.

## Contiguous memory and O(1) indexing

A fixed-size array of `n` elements, each `s` bytes, is `n × s` consecutive bytes starting at some base address. Element `i` is at

$$\text{addr}(i) = \text{base} + i \times s$$

That is one multiply and one add, regardless of `n`. No search, no pointer chasing. It is the reason "array access is O(1)" is one of the few complexity claims that is also true in wall-clock terms: reading `a[500000]` costs the same as reading `a[0]` (one cache miss at most, ~100 ns from DRAM, ~1 ns if the line is already in L1).

Contiguity also gives you the second property that matters in practice: **spatial locality**. The CPU fetches memory in 64-byte cache lines, so reading `a[0]` pulls `a[1]` through `a[15]` (for 4-byte ints) into cache for free, and the hardware prefetcher notices sequential access and fetches ahead. Scanning an array of 10 million ints touches memory at close to bandwidth speed. Scanning 10 million linked-list nodes takes one cache miss per node. Same O(n); a 10–50× difference in time. [Space complexity and the memory hierarchy](/learn/foundations/complexity/space-complexity-and-memory-hierarchy) has the numbers.

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

## The growth strategy and why doubling works

The choice that makes or breaks a dynamic array is how much bigger the new block is.

**Grow by a constant** (say 10 slots). Appending `n` elements triggers `n/10` copies, of sizes `10, 20, 30, …, n`. Total copied elements: roughly `n²/20`. Appending a million elements copies 50 billion; the "O(1) append" is really O(n).

**Grow by a factor** (say 2×). Copies happen at sizes `1, 2, 4, 8, …` up to `n`. Total copied elements: `1 + 2 + 4 + … + n/2 < n`. Appending a million elements copies fewer than a million in total, so the *amortised* cost per append is under 2 element-moves: O(1). [Amortised analysis](/learn/foundations/complexity/amortized-analysis) proves this formally; the intuition is that each doubling "pays" for the appends that filled the previous block.

```viz
{"type": "memory", "scenario": "dynamic-array-growth", "title": "Doubling on overflow", "caption": "Each resize copies everything once; because capacity doubles, the copies total less than n across n appends."}
```

Why not 3× or 10×? Memory. A factor of 2 means that right after a resize the array is half empty, and on average about 25% of the block is unused. A larger factor wastes more. A smaller factor (1.5×) copies more often but has a second, subtler benefit: after a few resizes the freed blocks (sizes `c, 1.5c, 2.25c, …`) can add up to more than the next request, so the allocator can reuse them. With 2× they never can (`1 + 2 + 4 < 8`). Facebook's `folly::fbvector` documents this argument and uses 1.5×.

Real growth factors, as orders of magnitude rather than exact constants:

| Implementation | Growth | Notes |
|---|---|---|
| CPython `list` | ~1.125× plus a small constant | Capacity sequence starts 0, 4, 8, 16, 24, 32, 40, 52, 64, 76…; tighter memory, more frequent (but cheap `realloc`) copies |
| Rust `Vec` | 2× (minimum capacity 4 for small elements) | `realloc` may extend in place; `with_capacity(n)` avoids all growth |
| Java `ArrayList` | 1.5× | `new ArrayList<>(n)` pre-sizes |
| Go slices | 2× until 256 elements, then tapering toward 1.25× | `make([]T, 0, n)` pre-sizes; `append` may or may not alias the old backing array |
| V8 `Array` (JS) | 1.5× plus 16 | Also switches representation entirely when you misuse it (below) |

The senior habit that falls out of this table: **if you know `n`, pre-size**. `Vec::with_capacity`, `new ArrayList<>(n)`, `make([]T, 0, n)`, or `[None] * n` in Python. You skip ~20 reallocations and their copies for a million elements, and, more importantly, you skip 20 allocation pauses that would otherwise show up scattered across your latency histogram.

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

The shifts are done with `memmove`, which runs at memory bandwidth, so a single `insert(0, x)` on a 10,000-element list costs about the time of one cache-miss, and you will not notice it. Do it in a loop and you have written a quadratic algorithm without a nested loop in sight. That is the most common accidental O(n²) in production code: a queue implemented as `list.pop(0)` in Python or `array.shift()` in JavaScript. The fix is a deque or a head index, covered in [Stacks and queues](/learn/data-structures/stacks-queues/stacks-and-queues).

The array visualiser below shows the other side: removing duplicates from a sorted array *without* shifting, by overwriting with a write pointer. This read/write two-pointer idea is the foundation of every in-place array technique.

```viz
{"type": "array", "algorithm": "remove-duplicates", "values": [1, 1, 2, 3, 3, 3, 5, 7, 7], "title": "In-place removal with a write pointer"}
```

## What your language actually allocates

"Array" means three quite different things across languages, and the difference shows up as a 10× performance gap and as bugs.

### Python `list`: an array of pointers

A CPython list is a contiguous array of `PyObject*` pointers. The integers themselves are separate heap objects, 28 bytes each. `[1, 2, 3]` is therefore a 3-slot pointer array plus three boxed ints, and iterating it chases one pointer per element. The list gives you O(1) indexing, but the *locality* benefit is mostly lost: the pointed-to objects can be anywhere.

This is why `numpy` exists and why the standard library has `array.array` and `bytearray`: they store raw contiguous numbers, so a million `int32` values occupy 4 MB rather than ~36 MB, and vectorised operations run at memory speed.

`sys.getsizeof([])` is 56 bytes and each slot adds 8; the overallocation pattern means a list you built by appending 1,000 items has capacity for a few dozen more.

### JavaScript `Array`: several representations in a trench coat

V8 does not have one array. It picks an internal *elements kind* based on what you store, and transitions between them one-way:

- `PACKED_SMI_ELEMENTS`: all small integers, stored unboxed and contiguous. Fastest.
- `PACKED_DOUBLE_ELEMENTS`: all numbers, stored as raw doubles.
- `PACKED_ELEMENTS`: anything (tagged pointers).
- `HOLEY_*` variants once you create a gap (`a[5] = x` when `a.length === 3`, or `new Array(n)`), which forces a "does this slot exist?" check on every access.
- Dictionary mode if the array becomes very sparse (`a[1000000] = 1` on an empty array): now it is a hash table wearing an array's clothes, and indexing is a hash lookup.

Transitions are one-way. Push a single `1.5` into an integer array and it stays a double array forever; push an object and it stays generic. Practical rules that follow: build arrays with `push`, not by writing to `a[i]` past the end; do not mix types if you care about speed; `new Array(n).fill(0)` is fine (filled, so not holey), `new Array(n)` alone is holey.

Typed arrays (`Int32Array`, `Float64Array`) are the honest contiguous arrays: fixed size, one type, no holes, and what you use for numeric work.

### Rust `Vec<T>` and Go slices: the real thing

`Vec<T>` is exactly the `(ptr, len, capacity)` triple with `T` stored inline. `Vec<u32>` of a million elements is 4 MB, period. A `Vec<Box<T>>` reintroduces pointer chasing, deliberately.

A Go slice is `(ptr, len, cap)` too, but a slice is a *view* into a backing array, and several slices can share one. `b := a[2:5]` copies nothing; `append(b, x)` writes into `a`'s backing array if there is capacity, which is the classic aliasing surprise: appending to a sub-slice silently overwrites the parent. `s[i:j:k]` (the three-index slice) caps capacity to force a copy on the next append.

## Worked example: cost of building a list three ways

Build a list of the integers `0..n−1` for `n = 1,000,000`.

```python
# 1. append: ~1M O(1) writes, ~20 resizes, ~1M element copies total
out = []
for i in range(n):
    out.append(i)

# 2. insert at front: n shifts of growing size, ~n²/2 = 5×10^11 element moves
out = []
for i in range(n):
    out.insert(0, i)          # do not do this

# 3. pre-sized: zero resizes
out = [0] * n
for i in range(n):
    out[i] = i
```

On a laptop, 1 takes ~60 ms, 3 takes ~40 ms, and 2 takes minutes. The order of magnitude matters more than the exact figures: the first two are both "one loop, one operation per iteration" and differ by five orders of magnitude.

## When a plain array beats everything else

A senior engineer's reflex is often *not* to reach for a fancier structure:

- **Keys are small dense integers** (0–255 bytes, HTTP status codes, days of the week): an array indexed by the key is a perfect hash table with zero hashing cost.
- **`n` is small** (under ~50): a linear scan over a contiguous array beats a hash lookup because it is a few cache lines with no hashing, no probing and no allocation. Many production "sets" of a handful of items should be arrays.
- **You need to sort, binary search or scan**: all three want contiguity.
- **You need predictable memory**: an array of `n` fixed-size records is exactly `n × s` bytes, no per-node overhead, no fragmentation.

The cases where an array loses are equally specific: many insertions or deletions far from the end, elements that must keep a stable address while others move (an array's resize invalidates every pointer into it, which is why Rust's borrow checker refuses to let you hold a `&v[0]` across a `push`), and O(1) removal of an arbitrary element given only a handle to it. Those are the linked list's territory, covered in [Linked list fundamentals](/learn/data-structures/linked-lists/linked-list-fundamentals).

## Exercise

Build the mechanism yourself. The exercise fixes the growth rule so the tests can check capacity exactly.

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

## Senior signals

- You describe append as "O(1) amortised because of geometric growth", and you can say what goes wrong with additive growth.
- You pre-size arrays when `n` is known and you know it removes both copies and allocation pauses from the latency profile.
- You spot `insert(0, x)`, `pop(0)` and `shift()` in a loop as an O(n²) algorithm and reach for a deque or a head index.
- You know a Python list is an array of pointers to boxed objects, and that `numpy`/`array.array`/typed arrays are how you get real contiguous numbers.
- You know V8's elements kinds transition one way and that `new Array(n)` without `fill` makes a holey array.
- You choose a plain array over a hash map when keys are small dense integers or `n` is tiny, and you can explain the cache argument.

## Check yourself

```quiz
- q: >-
    A dynamic array grows by adding a fixed 100 slots whenever it is full. What is the total cost of appending n elements, for large n?
  options: ["O(n log n), because the number of resizes grows logarithmically", "O(100n), because each resize copies at most 100 elements", "O(n²), because n/100 resizes each copy up to n elements", "O(n), because each append is still O(1) amortised"]
  answer: 2
  explanation: >-
    With additive growth there are about n/100 resizes and the k-th copies about 100k elements, so the total is roughly n²/200. Geometric growth is what makes the number of resizes logarithmic and the total copying linear; a resize copies every existing element, not just the 100 new slots.
- q: >-
    Which of these is the strongest practical reason arrays outperform linked lists for sequential scans, given both are O(n)?
  options: ["Lists must be traversed recursively, which adds a stack frame per node", "Array indexing is O(1), while finding each next list node costs O(n)", "Contiguous elements share cache lines and get prefetched; list nodes are scattered", "Arrays live on the stack, which is faster to read than the heap holding nodes"]
  answer: 2
  explanation: >-
    The asymptotic cost is identical; the constant factor is dominated by memory access. A 64-byte cache line holds 16 ints and sequential access is prefetched, whereas each node dereference in a list is typically a cache miss (~100 ns). Stepping to the next node is O(1), not O(n), and a dynamic array lives on the heap just like list nodes.
- q: >-
    In Python, why is iterating a list of a million ints much slower than iterating a numpy int32 array of the same values?
  options: ["The list stores pointers to boxed int objects; numpy stores raw values contiguously", "The list bounds-checks every access; numpy validates the whole range once up front", "Python lists are linked lists internally, so each step follows a next pointer", "Lists grow by about 1.125×, so their elements end up spread across several memory blocks"]
  answer: 0
  explanation: >-
    A CPython list is a contiguous array of PyObject pointers; the integers live elsewhere on the heap, so each element costs a dereference and likely a cache miss. numpy stores unboxed values, so the scan is cache-friendly and can be vectorised. The list's pointer array itself is one block: a resize copies everything into the new block rather than fragmenting it.
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
