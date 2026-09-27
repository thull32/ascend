---
slug: cpu-caches-and-memory-layout
title: "CPU caches and memory layout: cache lines, false sharing and data-oriented design"
description: How a cache maps addresses to sets and ways, why threads that share nothing still fight over cache lines, how struct padding and AoS versus SoA decide memory traffic, why pointer chasing is slow, and what branch misprediction costs.
minutes: 40
difficulty: hard
tags: [performance, cpu-cache, false-sharing, memory-layout, soa, branch-prediction, numa]
---
You parallelise a hot loop. Eight threads each increment their own slot in a shared array of eight 64-bit atomic counters, with relaxed ordering and no locks. There is no shared data in the program's sense: thread 3 only ever touches `counters[3]`. You expect eight times the throughput of one thread. You measure *less* than one thread. Then you change one line, padding each counter to 64 bytes, and the eight threads scale almost linearly.

Nothing in the source code or the complexity analysis predicts either result. The explanation is that the hardware does not move bytes or variables; it moves 64-byte **cache lines**, and it keeps those lines coherent between cores by passing ownership back and forth. The eight counters occupy exactly one line, so every increment on any core steals the line from the other seven. Once you think in lines rather than variables, a large family of performance mysteries (false sharing, struct padding, array-of-structs versus struct-of-arrays, pointer chasing, power-of-two strides) become one idea applied several ways.

## The hierarchy, and the three numbers that matter

[Space complexity and the memory hierarchy](/learn/foundations/complexity/space-complexity-and-memory-hierarchy) introduced the hierarchy. For this lesson you need three numbers:

| Fact | Typical value | Why it matters |
|---|---|---|
| Cache line size | 64 bytes | The unit of transfer, of coherence and of waste |
| L1 hit versus DRAM miss | ~1 ns versus ~80–100 ns | A single miss costs as much as hundreds of instructions |
| Outstanding misses per core | ~10–20 | Independent misses overlap; dependent ones cannot |

The third number is the one most engineers miss. A core can have many cache misses in flight at once, so a loop that issues independent loads (summing an array, probing a batch of hash keys) pays roughly the DRAM *bandwidth* cost per line. A loop whose next address depends on the previous load (walking a linked list or a tree) pays the full *latency* on every step, one after another. Same number of misses; an order of magnitude apart in time.

## How a cache finds a line

A cache is a hash table in hardware. The address is split into three fields: the **offset** within the line, the **set index** that picks which bucket to look in, and the **tag** that identifies the line within the set. Each set holds a fixed number of lines, the **ways**, and a line can live only in its own set.

A typical L1 data cache is 32 KiB, 8-way, with 64-byte lines: 512 lines in 64 sets. So bits 0–5 are the offset, bits 6–11 the set index, and everything above is the tag. The address `0x12345` has offset `0x05`, set 13 and tag `0x12`:

```text
address 0x12345 = ...0001 0010 | 0011 01 | 00 0101
                      tag 0x12 | set 13  | offset 5
```

Misses come in three kinds, the "three Cs": **compulsory** (the first touch of a line), **capacity** (the working set is bigger than the cache) and **conflict** (too many hot lines map to the same set, so they evict each other while other sets sit empty). Conflict misses are the surprising ones. With 64 sets and 64-byte lines, addresses that differ by a multiple of 4,096 bytes have the same set index. Walk down a column of a row-major `float` matrix whose rows are 1,024 elements (4 KiB) wide and every element lands in the same set; only 8 fit, and the cache thrashes while 98% of it is unused. Padding each row by one line (1,040 floats instead of 1,024) spreads the column across sets. Power-of-two array sizes and strides are a classic trap for exactly this reason.

Access order decides how much of each fetched line you use. Here is an 8×8 matrix stored row by row, 8 elements per line, and a cache that holds 4 lines, traversed first along rows:

```viz
{"type": "memory", "algorithm": "cache-lines", "n": 64,
 "values": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39],
 "title": "Row-major traversal of a row-major matrix",
 "caption": "Five misses in forty accesses: each fetched line is used completely before moving on."}
```

and then down its columns:

```viz
{"type": "memory", "algorithm": "cache-lines", "n": 64,
 "values": [0, 8, 16, 24, 32, 40, 48, 56, 1, 9, 17, 25, 33, 41, 49, 57, 2, 10, 18, 26, 34, 42, 50, 58, 3, 11, 19, 27, 35, 43, 51, 59, 4, 12, 20, 28, 36, 44, 52, 60],
 "title": "Column-major traversal of the same matrix",
 "caption": "Forty misses in forty accesses: each column touches eight lines, the cache holds four, and LRU evicts each line just before it would be reused."}
```

```exercise
id: set-associative-cache
title: Simulate a set-associative LRU cache
prompt: |
  Simulate a cache that starts empty. For each byte address in `addresses`:
  line = address // line_size, set = line % num_sets. Each set holds at most
  `ways` lines. If the line is in its set, count a hit and mark it most
  recently used. Otherwise it is a miss: if the set is full, evict its least
  recently used line, then insert this line as most recently used.

  Return the number of hits. The tests show sequential access, conflict
  misses in a direct-mapped cache (ways = 1) and LRU's worst case, a loop one
  line bigger than the cache.
languages: [python, javascript]
entry: cache_hits
starter:
  python: |
    def cache_hits(addresses, line_size, num_sets, ways):
        # your code here
        return 0
  javascript: |
    function cache_hits(addresses, line_size, num_sets, ways) {
      // your code here
      return 0;
    }
tests:
  - args: [[0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80, 84, 88, 92, 96, 100, 104, 108, 112, 116, 120, 124], 64, 4, 2]
    expected: 30
    label: sequential 4-byte reads, two misses
  - args: [[0, 256, 0, 256, 0, 256], 64, 4, 1]
    expected: 0
    label: conflict misses in a direct-mapped cache
  - args: [[0, 256, 0, 256, 0, 256], 64, 4, 2]
    expected: 4
    label: two ways remove the conflict
  - args: [[0, 64, 128, 0, 64, 128], 64, 1, 2]
    expected: 0
    label: a loop over 3 lines in a 2-line LRU cache never hits
  - args: [[0, 8, 64, 72, 0, 128, 8], 64, 1, 2]
    expected: 4
  - args: [[0, 64, 128, 0, 64, 128], 64, 1, 3]
    expected: 3
    hidden: true
  - args: [[0, 64, 128, 192, 0, 64, 128, 192], 64, 2, 2]
    expected: 4
    hidden: true
  - args: [[], 64, 4, 2]
    expected: 0
    hidden: true
hints:
  - "Keep one list per set, ordered from least to most recently used."
  - "On a hit, move the line to the end. On a miss, drop the first element if the list already has `ways` entries, then append."
  - "Use Math.floor(address / line_size) in JavaScript."
```

## Coherence and false sharing

Each core has private L1 and L2 caches, so two cores can hold copies of the same line. A **coherence protocol** (MESI and its variants) keeps them consistent by giving each cached line a state: **M**odified (this core has the only copy and has written it), **E**xclusive (only copy, clean), **S**hared (several read-only copies) or **I**nvalid. To write, a core must hold the line in M or E, so it first invalidates every other copy. When another core next touches the line, the line migrates to it. Each migration costs tens of nanoseconds on one socket and more across sockets.

That is fine when the sharing is real: a single contended atomic counter *should* bounce. **False sharing** is when it is accidental. The eight counters in the opening are 8 bytes each, 64 bytes together, one line. Each increment by one thread invalidates the line in seven other caches; the next increment on each of those cores waits for the line to come back. The cores spend their time passing a line around instead of adding.

```viz
{"type": "concurrency", "algorithm": "false-sharing",
 "title": "Two counters, one cache line",
 "caption": "The threads never touch each other's variable, but coherence works per line, so every write invalidates the other core's copy. Padding puts each counter in its own line."}
```

The fix is to give each independently written variable its own line, or better, not to share at all: keep counters thread-local and combine them at the end.

```rust
use std::sync::atomic::AtomicU64;

#[repr(align(64))]                    // each value starts on its own cache line
struct Padded(AtomicU64);

let counters: Vec<Padded> = (0..8).map(|_| Padded(AtomicU64::new(0))).collect();
// crossbeam_utils::CachePadded does the same, and uses 128 bytes on x86-64
// because the adjacent-line prefetcher pulls lines in pairs.
```

```go
type paddedCounter struct {
    n uint64
    _ [56]byte // fill the rest of the 64-byte line
}

var counters [8]paddedCounter
```

Java's `LongAdder` is a striped counter whose cells are padded for the same reason. False sharing hides in predictable places: arrays of per-thread statistics, a lock word next to the hot field it protects, the head and tail indices of a queue written by producer and consumer (the LMAX Disruptor pads them famously), and any struct whose fields are written by different threads. `perf c2c` finds it: it reports cache lines with heavy cross-core "hit modified" traffic and which offsets within the line each thread touched. The [atomics lesson](/learn/systems/concurrency/atomics-and-lock-free) builds on this.

## Struct layout and padding

A field of size $k$ (1, 2, 4 or 8 bytes) must start at an offset that is a multiple of $k$, and the struct's size is rounded up to a multiple of its largest field so that arrays of it stay aligned. The compiler inserts padding to satisfy both rules:

```c
struct Bad  { char a; double b; char c; double d; };  /* 1+7 pad, 8, 1+7 pad, 8 = 32 bytes */
struct Good { double b; double d; char a; char c; };  /* 8, 8, 1, 1, 6 pad       = 24 bytes */
```

Reordering the same four fields from largest to smallest saves 25%, which means 25% more elements per cache line in every scan and 25% less memory. Languages treat this differently:

- **C and Go** lay fields out in declaration order. Go's `fieldalignment` analyser reports structs that could be smaller, and `pahole` shows the holes and cache-line boundaries in C, C++ and Rust binaries built with debug information.
- **Rust**'s default representation lets the compiler reorder fields to minimise padding; `#[repr(C)]` pins declaration order for FFI.
- **The JVM** chooses its own field layout.
- **Python** has no inline fields at all. An object's attributes are pointers to separate heap objects: a `float` is a 24-byte object and an `int` 28 bytes (`sys.getsizeof`). A list of a million floats is 8 MB of pointers plus 24 MB of scattered float objects; `array('d')` or a NumPy array is 8 MB, contiguous. That layout, as much as the interpreter, is why numeric Python needs NumPy.

Beyond padding, **hot/cold splitting** matters: put the fields read on the hot path together at the front of the struct so they share the first line, and move rarely used fields (debug names, audit timestamps) behind a pointer.

```exercise
id: struct-padding
title: Compute a struct's size with and without reordering
prompt: |
  Fields have sizes 1, 2, 4 or 8 bytes, and a field of size k must start at an
  offset that is a multiple of k. The struct's size is rounded up to a
  multiple of its largest field. `sizes` lists the fields in declaration order
  (at least one field).

  Return `[declared_size, best_size]`, where `best_size` is the size after
  reordering the fields from largest to smallest (which, for power-of-two
  sizes, is optimal).
languages: [python, javascript]
entry: struct_size
starter:
  python: |
    def struct_size(sizes):
        # your code here
        return [0, 0]
  javascript: |
    function struct_size(sizes) {
      // your code here
      return [0, 0];
    }
tests:
  - args: [[1, 8, 1, 8]]
    expected: [32, 24]
    label: the Bad struct from the lesson
  - args: [[8]]
    expected: [8, 8]
  - args: [[1, 2, 4, 8]]
    expected: [16, 16]
    label: already tight
  - args: [[1, 4, 1, 4, 1]]
    expected: [20, 12]
  - args: [[2, 1]]
    expected: [4, 4]
    label: tail padding
  - args: [[1, 1, 1]]
    expected: [3, 3]
    hidden: true
  - args: [[4, 8, 2, 8, 1]]
    expected: [40, 24]
    hidden: true
hints:
  - "Walk the fields with a running offset. Before placing a field of size k, round the offset up to a multiple of k."
  - "Rounding up: ((offset + k - 1) // k) * k."
  - "After the last field, round the total up to a multiple of the largest field size."
```

## Array of structs versus struct of arrays

Take 10 million particles, each a 64-byte struct of sixteen `f32` fields (position, velocity, colour, mass, age and so on), and a physics step that updates only `x` from `vx`. In **array-of-structs** (AoS) layout, every particle's 64 bytes sit together, so the loop streams 640 MB through the cache to use 80 MB of it: 12.5% utilisation. In **struct-of-arrays** (SoA) layout, each field is its own contiguous array, and the loop streams exactly the 80 MB it needs. At the 10–20 GB/s a single core can typically pull from DRAM, that is roughly 30–60 ms against 4–8 ms per step, before counting the second effect: contiguous arrays of `f32` let the compiler use SIMD instructions that process 8 or 16 floats at once, which strided AoS loads defeat.

```rust
struct ParticleAoS { x: f32, y: f32, z: f32, vx: f32, vy: f32, vz: f32, /* 10 more fields */ }

fn step_aos(ps: &mut [ParticleAoS], dt: f32) {
    for p in ps { p.x += p.vx * dt; }                  // drags 64 B per particle through cache
}

struct ParticlesSoA { x: Vec<f32>, vx: Vec<f32>, /* one Vec per field */ }

fn step_soa(ps: &mut ParticlesSoA, dt: f32) {
    for (x, vx) in ps.x.iter_mut().zip(&ps.vx) {
        *x += vx * dt;                                 // 8 B per particle, auto-vectorised
    }
}
```

AoS wins when you touch most fields of one entity at a time, at random: look up a user by ID and read their whole record. That is the whole row-store versus column-store debate. PostgreSQL and MySQL store rows (AoS) because transactions read and write whole records; Parquet, ClickHouse and Apache Arrow store columns (SoA) because analytics scan a few columns of billions of rows ([columnar formats](/learn/big-data/batch-processing/columnar-formats-and-lakehouses)). Game engines' entity-component systems are SoA for the same reason. Hybrids exist, such as blocks of 8 or 16 entities stored column-wise, to get SIMD-friendly runs while keeping an entity's fields near each other.

## Prefetching and pointer chasing

Hardware **prefetchers** watch the stream of misses, detect sequential and constant-stride patterns, and fetch lines before you ask for them. A linear scan over an array therefore rarely waits for memory at all. Prefetchers generally do not cross 4 KiB page boundaries on their own, and they cannot predict an address that is stored in the data you have not loaded yet.

That is **pointer chasing**, and it is why linked lists and pointer-based trees are slow even when their complexity is good: every hop is a dependent load, the prefetcher is blind and memory-level parallelism is zero, so a traversal of 10 million heap-allocated nodes pays around 100 ns per node. The mitigations all restore either sequential access or independent loads:

- **Allocate nodes in arrays and link by index** (arena allocation), so neighbours in the structure tend to be neighbours in memory.
- **Use wide nodes.** A B-tree node holding 16 keys in one or two lines replaces four levels of a binary search tree, and four dependent misses, with one ([B-trees](/learn/advanced-data-structures/balanced-trees/b-trees-and-b-plus-trees)).
- **Batch independent lookups.** Probing eight hash keys interleaved rather than one after another lets their misses overlap; database hash joins and high-performance hash maps do this deliberately, sometimes with explicit software prefetch instructions.

## Branch prediction

A modern core fetches and executes instructions well ahead of the one it is retiring, guessing the direction of every branch. A correct guess costs nothing. A **misprediction** throws away the speculative work and restarts, costing roughly 15–20 cycles. The classic demonstration:

```c
long sum = 0;
for (size_t i = 0; i < n; i++)
    if (data[i] >= 128)          /* data holds random bytes 0..255 */
        sum += data[i];
```

With random data the `if` is a coin flip, and the predictor is wrong about half the time. For 32 million elements that is about 16 million mispredictions at ~17 cycles each, around 270 million wasted cycles, more than the rest of the loop costs. Sort the data first and the branch becomes perfectly predictable, and the loop runs several times faster. `perf stat` shows the difference directly:

```text
unsorted:   16,771,091      branch-misses    #   24.97% of all branches
sorted:         52,733      branch-misses    #    0.08% of all branches
```

(The loop's own condition is the other half of "all branches", which is why a coin-flip `if` shows as 25%.) Two senior caveats. First, at higher optimisation levels compilers often turn this loop into branch-free code (a conditional move or SIMD), and then sorted and unsorted run identically; check the counters or the assembly before building a theory on a branch. Second, branch-free code always does the work of both sides, so it wins only when the branch is unpredictable. The practical techniques: partition or sort data so branches become predictable, keep rare cases (errors, slow paths) out of hot loops and mark them cold, and avoid unpredictable indirect calls (megamorphic virtual dispatch) in the tightest loops.

## NUMA, briefly

On multi-socket servers, each socket has its own memory controller and local DRAM. Access to the other socket's memory crosses an interconnect and costs roughly 1.5–2× the latency with less bandwidth. Linux places a page on the node of the thread that *first touches* it, so a buffer initialised by one thread on socket 0 and then read by 32 threads on socket 1 is remote for every access. `numactl --hardware` shows the topology, `numastat` shows local versus remote allocations, and the usual fix is to run one process (or one shard) per socket, bound with `numactl --cpunodebind=0 --membind=0`.

## Senior signals

- You reason in 64-byte lines, not variables, and you distinguish latency-bound pointer chasing from bandwidth-bound streaming.
- You can split an address into tag, set and offset, and you recognise conflict misses from power-of-two strides.
- You spot false sharing in per-thread arrays, lock-next-to-data layouts and queue indices, fix it with padding or thread-local state, and confirm with `perf c2c`.
- You order struct fields by size, split hot from cold fields, and know which languages reorder fields for you (Rust, the JVM) and which do not (C, Go).
- You choose AoS or SoA from the access pattern and connect the choice to row stores versus column stores.
- You check branch-miss counters before blaming or crediting a branch, and you know the compiler may already have removed it.

## Check yourself

```quiz
- q: >-
    Eight threads each increment their own element of a shared array of eight 8-byte counters, with no locks. Adding threads makes total throughput drop. What is the mechanism?
  options: ["The array of counters is too large to fit in L1 cache", "All eight counters share a single bouncing cache line", "The threads race and corrupt each other's counters", "The scheduler keeps migrating threads between cores"]
  answer: 1
  explanation: >-
    Each thread writes only its own counter, so there is no data race. Coherence operates on whole 64-byte lines, and these eight counters fill one line, so every write invalidates the line in the other cores' caches and it migrates back and forth. Padding each counter to its own line, or using thread-local counters, removes the contention.
- q: >-
    An L1 cache is 32 KiB, 8-way set associative, with 64-byte lines. A loop reads one float from each row of a row-major matrix whose rows are exactly 4,096 bytes long, down 64 rows, repeatedly. What happens?
  options: ["The hardware prefetcher hides all of the misses", "Every access misses because the floats are misaligned", "All 64 lines fit, so after the first pass everything hits", "All 64 rows map to one 8-way set, so it keeps missing"]
  answer: 3
  explanation: >-
    With 64 sets and 64-byte lines, the set index is address bits 6 to 11, which repeat every 4,096 bytes. A 4 KiB stride puts every access in one set of 8 ways, so the loop keeps missing even though the cache is almost empty: conflict misses. The cache has room for 64 lines in total, just not in one set. Padding rows by one line spreads them across sets.
- q: >-
    A struct is declared as char, double, char, double in C. What are its size as declared and its size with fields ordered largest first?
  options: ["32 and 24", "18 and 18", "32 and 18", "24 and 18"]
  answer: 0
  explanation: >-
    As declared: char at 0, 7 bytes of padding, double at 8, char at 16, 7 bytes of padding, double at 24, total 32. Reordered: two doubles (16 bytes) then two chars (18 bytes), rounded up to a multiple of 8 gives 24. 18 is the sum of the fields but ignores tail padding.
- q: >-
    An analytics loop computes the average of one field across 50 million records of a 16-field struct. Which change is most likely to give the largest speed-up?
  options: ["Add a branch that skips records whose value is zero", "Use a linked list so records can be inserted cheaply", "Store each field in its own contiguous array (SoA)", "Pad the struct so every field is 8-byte aligned"]
  answer: 2
  explanation: >-
    The loop needs one field, but array-of-structs layout drags all 16 through the cache. Struct-of-arrays streams only the needed column, cutting memory traffic by about 16 times and enabling SIMD. That is the column-store argument.
- q: >-
    Summing elements above a threshold is 5 times faster on sorted data than on random data in a debug build, but equally fast on both in an optimised build. What is the most likely explanation?
  options: ["The optimised build skips the loop as dead code", "The optimiser replaced the branch with cmov or SIMD code", "Sorting the data warms the cache for the summing loop", "Optimised builds turn off the CPU's branch predictor"]
  answer: 1
  explanation: >-
    Sorting helps only by making the branch predictable. When the compiler turns the branch into branch-free code (a conditional move or SIMD), there is no misprediction to avoid and both inputs cost the same; the loop still runs, and the predictor is never switched off. Checking branch-miss counters or the assembly tells you which case you are in.
```
