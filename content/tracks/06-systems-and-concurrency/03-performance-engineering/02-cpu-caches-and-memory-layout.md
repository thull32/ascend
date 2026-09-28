---
slug: cpu-caches-and-memory-layout
title: "CPU caches and memory layout: cache lines, false sharing and data-oriented design"
description: The memory hierarchy measured on a real machine, how a cache maps addresses to sets and ways, MESI and MOESI coherence traced step by step, false sharing, struct padding, AoS versus SoA, prefetching versus pointer chasing, and why a compiler's cmov can make branch prediction vanish from your benchmark.
minutes: 50
difficulty: hard
tags: [performance, cpu-cache, false-sharing, memory-layout, soa, branch-prediction, numa]
---
You parallelise a hot loop. Eight threads each increment their own slot in a shared array of eight 64-bit atomic counters, with relaxed ordering and no locks. There is no shared data in the program's sense: thread 3 only ever touches `counters[3]`. On a Ryzen 9 9950X3D, one thread alone manages about 277 million increments a second. The eight threads together manage 145 to 182 million across seven runs, *fewer* than one thread. Then you change one line, aligning each counter to 64 bytes, and the eight threads do 1,910 to 2,180 million: about twelve times more, from a change that adds no instructions.

Nothing in the source or the complexity analysis predicts either result. The hardware does not move bytes or variables; it moves 64-byte **cache lines**, and it keeps those lines coherent between cores by passing ownership back and forth. The eight counters occupy exactly one line, so every increment on any core steals the line from the others. Once you think in lines rather than variables, a family of mysteries (false sharing, struct padding, array-of-structs versus struct-of-arrays, pointer chasing, power-of-two strides) becomes one idea applied several ways. Every number in this lesson was measured on that machine (16 cores, 32 threads) running Linux under WSL2, with Rust 1.98, GCC 13 and CPython 3.14.

## The hierarchy on one machine, measured

`lscpu` and `/sys/devices/system/cpu/cpu0/cache/` report the shape; a pointer-chasing program measures the cost. It links one node per 64-byte line into a single random cycle (Sattolo's shuffle) and follows `i = nodes[i]`, so every load depends on the previous one and no prefetcher can guess the next address:

| Level | Size (sysfs) | Organisation | Random dependent load | Same chase, sequential order |
|---|---|---|---|---|
| L1d | 48 KiB per core | 12-way, 64 sets | 0.90 ns (16–48 KiB) | 0.90 ns |
| L2 | 1 MiB per core | 16-way, 1,024 sets | 2.8–3.2 ns (64–512 KiB) | 0.95 ns |
| L3 | 96 MiB reported, shared | 16-way | 9–16 ns (2–16 MiB) | 0.97 ns |
| DRAM | 30 GiB given to the VM | – | 75 ns at 32 MiB, 102 ns at 512 MiB | 1.46 ns |

At the 5.6 GHz this core measured single-threaded (the clock probe in [benchmarking pitfalls](/learn/systems/performance-engineering/benchmarking-pitfalls)), 0.9 ns is five cycles and 100 ns is about 560: one DRAM miss costs as much as hundreds of simple instructions.

Two honest caveats. The 9950X3D has two eight-core dies: one with 96 MiB of L3 (32 MiB plus 64 MiB of stacked V-Cache) and one with 32 MiB. WSL2's hypervisor presents a single 96 MiB L3 to Linux, yet on six different vCPUs the latency left the L3 plateau between 16 and 32 MiB, consistent with the Windows host running these threads on the 32 MiB die, and with the L3 being shared with other work. Past 16 MiB, 4 KiB pages also exceed the TLB's reach, so each hop adds a page-table walk ([virtual memory](/learn/systems/operating-systems/virtual-memory)). A topology report is a claim; a latency curve is a measurement.

The last column is the surprise: the same dependent chase in *sequential* address order costs 1.46 ns per hop at 512 MiB, 70 times less than random. Hardware prefetchers detect the stride of the misses and fetch lines before the load asks for them. [Space complexity and the memory hierarchy](/learn/foundations/complexity/space-complexity-and-memory-hierarchy) introduced these levels; the rest of this lesson is about staying on the left side of that table.

## Latency versus bandwidth: Little's law in the memory system

Streaming 10 million 64-byte records (640 MB) from DRAM on one core measured 54 GB/s. That is 0.84 lines per nanosecond. With about 90 ns of DRAM latency, Little's law ($L = \lambda W$, worked for server pools in [I/O-bound versus CPU-bound](/learn/systems/performance-engineering/io-bound-vs-cpu-bound)) says $0.84 \times 90 \approx 76$ lines must be in flight at once to sustain that rate. A core tracks only a limited number of outstanding demand misses, so the prefetchers generate most of those 76 requests.

A random pointer chase has exactly one request in flight: the next address is inside the line still on its way. At 102 ns per 64-byte hop, it moves 0.63 GB/s, 85 times less than the scan. Same memory, same number of misses; one access pattern pays **bandwidth** per line and the other pays **latency** per line.

That is the whole reason linked lists, pointer-based trees and object graphs are slow on large data even when their complexity is fine. A binary search tree lookup over 10 million nodes is 23 dependent loads, and past the L3 each one can be a DRAM round trip: up to about 2 µs per lookup. A sorted array searched with binary search is also 23 dependent loads, but its first levels stay hot in cache and the last few land in the same lines. A B-tree node holding 16 keys in one or two lines turns four levels of a binary tree, four dependent misses, into one ([B-trees](/learn/advanced-data-structures/balanced-trees/b-trees-and-b-plus-trees)).

## How a cache finds a line

A cache is a hash table in hardware. The address splits into the **offset** within the line, the **set index** that picks the bucket, and the **tag** that identifies the line within the set. Each set holds a fixed number of lines, the **ways**, and a line can live only in its own set.

This L1d is 48 KiB with 64-byte lines: 768 lines. At 12 ways that is 64 sets, so bits 0–5 are the offset, bits 6–11 the set and everything above is the tag. Address `0x12345` has offset `0x05`, set 13 and tag `0x12`:

```text
address 0x12345 = ...0001 0010 | 0011 01 | 00 0101
                      tag 0x12 | set 13  | offset 5
```

Misses come in three kinds, the "three Cs": **compulsory** (first touch), **capacity** (the working set is bigger than the cache) and **conflict** (too many hot lines map to one set while other sets sit empty). With 64 sets, addresses that differ by a multiple of 4,096 bytes share a set. Chasing $K$ lines spaced exactly 4,096 bytes apart, against the same lines spaced 4,160 bytes apart:

| Lines | Bytes of data | 4,096-byte stride | 4,160-byte stride |
|---|---|---|---|
| 8 | 512 | 0.89 ns | 0.92 ns |
| 12 | 768 | 0.92 ns | 0.89 ns |
| 16 | 1 KiB | 2.66 ns | 0.89 ns |
| 64 | 4 KiB | 2.66 ns | 0.89 ns |

Twelve lines fit in the twelve ways; the thirteenth evicts one, and from 16 lines, a single kilobyte, every access misses to L2 in a 48 KiB cache that is 98% empty. A 64-byte offset per row spreads the lines over all 64 sets. Walking down a column of a row-major `float` matrix with 1,024-column rows is exactly this pattern, and the L2 repeats it at a 64 KiB stride with its 1,024 sets. Power-of-two array widths are a classic trap.

Access order decides how much of each fetched line you use. An 8×8 matrix stored row by row, 8 elements per line, in a cache of 4 lines, traversed along rows:

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
 "caption": "Forty misses in forty accesses: each column touches eight lines, the cache holds four, and LRU evicts each line immediately before it would be reused."}
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

## Coherence: MESI and MOESI, traced

Each core has private L1 and L2 caches, so two cores can hold copies of one line. A **coherence protocol** gives every cached copy a state: **M**odified (only copy, dirty), **E**xclusive (only copy, clean), **S**hared (read-only copies may exist elsewhere) or **I**nvalid. AMD's processors add **O**wned (MOESI): a dirty line that other cores may read without writing it back to DRAM first. Intel's variant adds **F**orward (MESIF), which designates one sharer to answer requests. To write, a core must hold the line in M or E, so it first sends a **read-for-ownership** that invalidates every other copy.

Trace line L holding counter `a` (offset 0, thread 0) and counter `b` (offset 8, thread 1), with each thread running `fetch_add`:

| Step | Event | Core 0's copy | Core 1's copy | Traffic |
|---|---|---|---|---|
| 0 | Start | I | I | L is in L3 or DRAM |
| 1 | Core 0 `lock xadd a` | M | I | Read-for-ownership, then write in L1 |
| 2 | Core 1 `lock xadd b` | I | M | Core 1 misses; the probe makes core 0 forward its dirty copy and invalidate |
| 3 | Core 0 `lock xadd a` | M | I | The same transfer, reversed |
| 4 | Core 1 only reads `b` | O | S | MOESI: core 0 keeps the dirty line as Owner and forwards a copy; MESI would write back and drop to S |
| 5 | Core 1 writes `b` | I | M | An upgrade: invalidate the Owner's copy |

Steps 2 and 3 repeat for every increment that follows a steal, and each costs a round trip between cores through the shared L3's coherence machinery instead of a one-cycle L1 hit. With `a` and `b` on different lines, step 1 puts line L0 in M on core 0, the equivalent step puts L1 in M on core 1, and neither line ever moves again: every later increment is a local hit.

Real sharing *should* bounce: one contended atomic counter is expected to move between cores ([atomics and lock-free](/learn/systems/concurrency/atomics-and-lock-free) covers the costs). **False sharing** is the same traffic for data that is never shared, only co-located.

## False sharing, measured

Threads pinned to separate cores, 50 million increments each, median of five runs:

| Threads | Operation | Counters in one line | Each on its own 64-byte line |
|---|---|---|---|
| 1 | `fetch_add` (`lock xadd`) | 3.86 ns per increment | – |
| 2 | `fetch_add` | 9.92 ns each, 202 M/s total | 3.85 ns each, 520 M/s total |
| 8 | `fetch_add` | 48.6 ns each, 165 M/s total | 4.14 ns each, 1,933 M/s total |
| 1 | load then store (plain `mov`) | 0.20 ns | – |
| 8 | load then store | 3.86 ns each | 0.21 ns each |

Eight threads on one line are 12 times slower than padded for atomics and 18 times slower for plain stores, which are what a non-atomic `counter++` compiles to. Two SMT siblings, which share one L1, still ran 2.9 times slower on a shared line (11.0 ns per increment), most likely because the core must flush speculatively executed loads when the sibling writes the same line. Padding to 128 bytes measured the same as 64 on this AMD part; `crossbeam_utils::CachePadded` uses 128 on x86-64 because Intel's spatial prefetcher pulls lines in adjacent pairs.

```viz
{"type": "concurrency", "algorithm": "false-sharing",
 "title": "Two counters, one cache line",
 "caption": "The threads never touch each other's variable, but coherence works per line, so every write invalidates the other core's copy. Padding puts each counter in its own line."}
```

The complete program behind the opening numbers (unpinned; `rustc -O`):

```rust
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::Instant;

#[repr(align(64))] // the eight counters start at a line boundary: 8 x 8 B = exactly one line
struct OneLine([AtomicU64; 8]);

#[repr(align(64))] // each Padded value gets a 64-byte line to itself
struct Padded(AtomicU64);

const THREADS: usize = 8;
const ITERS: u64 = 50_000_000;

fn bench(counter_for: &(dyn Fn(usize) -> &'static AtomicU64 + Sync)) -> f64 {
    let start = Instant::now();
    thread::scope(|s| {
        for t in 0..THREADS {
            let c = counter_for(t);
            s.spawn(move || {
                for _ in 0..ITERS {
                    c.fetch_add(1, Ordering::Relaxed); // lock xadd on x86-64
                }
            });
        }
    });
    (THREADS as u64 * ITERS) as f64 / start.elapsed().as_secs_f64() / 1e6
}

fn main() {
    let packed: &'static OneLine =
        Box::leak(Box::new(OneLine(std::array::from_fn(|_| AtomicU64::new(0)))));
    let padded: &'static [Padded; THREADS] =
        Box::leak(Box::new(std::array::from_fn(|_| Padded(AtomicU64::new(0)))));
    println!("packed: {:5.0} M increments/s", bench(&|t| &packed.0[t]));   // measured 145-182
    println!("padded: {:5.0} M increments/s", bench(&|t| &padded[t].0));   // measured 1,913-2,183
}
```

In Go the same fix is an explicit filler field:

```go
type paddedCounter struct {
    n uint64
    _ [56]byte // unsafe.Sizeof(paddedCounter{}) == 64
}
```

False sharing hides in arrays of per-thread statistics, a lock word next to the hot field it protects, a queue's head and tail indices written by producer and consumer (the LMAX Disruptor pads them), and Java objects whose fields are written by different threads (`@Contended`, and `LongAdder`'s padded cells). `perf c2c` finds it: it reports lines with heavy cross-core "hit modified" traffic and which offsets each thread touched. The best fix is often not padding but not sharing: count in thread-local variables and merge at the end.

## Struct layout and padding

A field of size $k$ (1, 2, 4 or 8 bytes) must start at an offset that is a multiple of $k$, and the struct's size rounds up to a multiple of its largest field so arrays stay aligned:

```c
struct Bad  { char a; double b; char c; double d; };  /* 1+7 pad, 8, 1+7 pad, 8 = 32 bytes */
struct Good { double b; double d; char a; char c; };  /* 8, 8, 1, 1, 6 pad       = 24 bytes */
```

Measured with `size_of` and `unsafe.Sizeof`:

| Language and layout | `Bad` | `Good` |
|---|---|---|
| Rust `#[repr(C)]` (declaration order, as C) | 32 | 24 |
| Rust default representation | 24 (the compiler reordered it) | 24 |
| Go (declaration order) | 32 | 24 |

Rust's default layout may reorder fields to minimise padding, and `#[repr(C)]` pins declaration order for FFI. Go and C keep your order: Go's `fieldalignment` analyser reports structs that could be smaller, and `pahole` shows holes and cache-line boundaries in C, C++ and Rust binaries built with debug information. The JVM chooses its own field order.

Python has no inline fields at all. On CPython 3.14 a `float` object is 24 bytes and an `int` 28; a list of a million floats is an 8.4 MB array of pointers plus 24 MB of separate float objects, while `array('d')` stores the same values in 8 MB, contiguously. Layout, as much as the interpreter, is why numeric Python needs NumPy.

Beyond padding, **hot/cold splitting**: put the fields read on the hot path together at the front so they share the first line, and move rarely used fields (debug names, audit timestamps) behind a pointer. On a struct allocated 100 million times, 8 bytes of padding is 800 MB.

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

Ten million particles, each a 64-byte struct of sixteen 4-byte fields, and two loops that touch one or two fields. In **array-of-structs** (AoS) every particle's 64 bytes sit together, so a loop over one field drags whole lines through the cache and uses 4 bytes of each 64. In **struct-of-arrays** (SoA) each field is its own contiguous array. Measured (Rust, `rustc -O`, pinned to one core, median of 11):

| Loop | AoS | SoA | Speed-up |
|---|---|---|---|
| Sum the `u32` `id` field, 10M records | 11.98 ms (54 GB/s of lines) | 0.98 ms | 12.3× |
| `x += vx * dt`, 10M records | 23.8 ms | 1.61 ms | 14.7× |
| Same update, 40M records | 97.3 ms | 8.58 ms | 11.3× |

The ideal is 16× less traffic for the sum. SoA falls short because its loop stops being memory-bound: at 41 GB/s over a 40 MB column it is limited by the vector instructions that widen and add each value. The update at 10M records (80 MB of `x` and `vx`) partly fits the L3 and reached 75 GB/s; at 40M it drops to DRAM speed. SoA also hands the compiler contiguous `f32` runs it can vectorise, which strided AoS loads defeat.

```rust
#[repr(C)]
struct P { x: f32, y: f32, z: f32, vx: f32, vy: f32, vz: f32, r: f32, g: f32,
           b: f32, a: f32, mass: f32, age: f32, charge: f32, spin: f32, id: u32, flags: u32 }

fn step_aos(ps: &mut [P], dt: f32) {
    for p in ps.iter_mut() { p.x += p.vx * dt; }          // 64 B per particle through the cache
}

fn step_soa(x: &mut [f32], vx: &[f32], dt: f32) {
    for (x, vx) in x.iter_mut().zip(vx) { *x += vx * dt; } // 8 B per particle, vectorised
}

fn main() {
    let n = 10_000_000;
    let mut aos: Vec<P> = (0..n).map(|i| P { x: i as f32, y: 0.0, z: 0.0, vx: 1.0, vy: 0.0,
        vz: 0.0, r: 0.0, g: 0.0, b: 0.0, a: 0.0, mass: 1.0, age: 0.0, charge: 0.0, spin: 0.0,
        id: i as u32, flags: 0 }).collect();
    let (mut x, vx): (Vec<f32>, Vec<f32>) = ((0..n).map(|i| i as f32).collect(), vec![1.0; n]);
    let t = std::time::Instant::now();
    step_aos(&mut aos, 0.01);
    println!("AoS {:?}", t.elapsed());
    let t = std::time::Instant::now();
    step_soa(&mut x, &vx, 0.01);
    println!("SoA {:?}  (checksum {})", t.elapsed(), aos[1].x + x[1]);
}
```

AoS wins when you touch most fields of one entity at a time, at random: fetch a user by ID and read the whole record. That is the row-store versus column-store debate. PostgreSQL and MySQL store rows because transactions read and write whole records; Parquet, ClickHouse and Apache Arrow store columns because analytics scan a few columns of billions of rows ([columnar formats](/learn/big-data/batch-processing/columnar-formats-and-lakehouses)). Game engines' entity-component systems are SoA for the same reason, and hybrids (blocks of 8 or 16 entities stored column-wise, "AoSoA") keep SIMD-friendly runs while keeping an entity's fields near each other.

## Prefetching and pointer chasing

Prefetchers watch the stream of misses, detect sequential and constant-stride patterns, and fetch ahead; the sequential column in the first table is them at work. They cannot predict an address stored in data you have not loaded yet, and they generally restart at 4 KiB page boundaries.

The effect survives an interpreter. In CPython 3.14, summing a list of 5 million floats created in order took 13.3 ms (2.7 ns per element); summing the *same objects* after `random.shuffle` on the list took 107.8 ms (21.6 ns per element), 8.1 times slower. The list holds pointers, the float objects were allocated consecutively, and shuffling turned a sequential walk through memory into a random one. Summing `array('d')` took 16.7 ms: contiguous, but each value must be boxed into a new float object for `sum`.

The mitigations all restore sequential access or independent loads:

- **Allocate nodes in arrays and link by index** (arena allocation), so neighbours in the structure tend to be neighbours in memory; a compacting garbage collector does this by accident.
- **Use wide nodes**: B-trees, and hash tables with open addressing rather than chained buckets ([hash tables](/learn/data-structures/hashing/hash-tables)).
- **Batch independent lookups.** Probing eight hash keys interleaved lets their misses overlap; database hash joins do this deliberately, with software prefetch instructions.
- **Use huge pages for large random-access heaps.** One 2 MiB page covers what 512 TLB entries would. In three alternating runs the 512 MiB chase took 103–104 ns per hop on 4 KiB pages and 92–94 ns after `madvise(MADV_HUGEPAGE)`, with `/proc/self/smaps_rollup` confirming all 512 MiB in huge pages.

## Branch prediction and the cmov surprise

A core fetches and executes well ahead of the instruction it retires, guessing every branch. A wrong guess throws away the speculative work. The classic demonstration, with 1 million random integers from 0 to 255, summed 50 times:

```c
__attribute__((noinline)) long long sum_big(const int *data, int n) {
    long long sum = 0;
    for (int i = 0; i < n; i++)
        if (data[i] >= 128)
            sum += data[i];
    return sum;
}
```

| GCC 13 flags | Code generated | Random data | Sorted data |
|---|---|---|---|
| `-O1` or `-O2` | `cmovg`, no branch | 0.358 ns per element | 0.358 ns |
| `-O3` | SSE compare and mask, vectorised | 0.180 ns | 0.180 ns |
| `-O2 -fno-if-conversion -fno-if-conversion2 -fno-tree-vectorize` | A real `jle` | 2.70 ns | 0.225 ns |

At `-O2`, GCC compiled the `if` to this, with no branch to mispredict:

```text
movsxd rax, DWORD PTR [rdi]   ; load data[i]
mov    rcx, rax
add    rax, rdx               ; candidate = sum + data[i]
cmp    ecx, 0x7f
cmovg  rdx, rax               ; sum = candidate if data[i] > 127
```

Only when if-conversion is disabled does the textbook result appear: 12 times slower on random data. With half of the branches mispredicted, the extra 2.48 ns per element is about 5 ns per misprediction, roughly 25–28 cycles at this core's 5.1–5.6 GHz. Note the last row's sorted case: a *predictable* branch (0.225 ns) beats `cmov` (0.358 ns), because `cmov` makes every iteration's sum depend on the compare, while a predicted branch lets the core run ahead. Branch-free code wins only when the branch is unpredictable.

So check the generated code (`objdump -d`, Compiler Explorer) or branch-miss counters before building a theory on a branch. The techniques that survive: partition or sort data so branches become predictable, keep rare paths (errors, slow cases) out of hot loops and mark them cold, and avoid unpredictable indirect calls (megamorphic virtual dispatch) in the tightest loops.

## NUMA and asymmetric caches

On multi-socket servers each socket has its own memory controller. Memory attached to the other socket costs roughly 1.5–2× the latency with less bandwidth, and Linux places a page on the node of the thread that *first touches* it. A buffer initialised by one thread on socket 0 and then read by 32 threads on socket 1 is remote for every access. `numactl --hardware` shows the topology (this machine has one node), `numastat` shows local versus remote allocations, and the usual fix is one process or shard per socket, bound with `numactl --cpunodebind=0 --membind=0`.

Chiplet desktops show a smaller version of the same effect. The 9950X3D's two dies have different L3 sizes, and a line owned by a core on the other die crosses the Infinity Fabric. Which die runs a thread is a scheduling decision (on this machine, the Windows host's), so a benchmark's cache-sensitive results can change with thread placement.

## Failure modes in production

| Symptom | Diagnosis | Fix |
|---|---|---|
| Throughput falls as threads are added to a stats or counter array | False sharing; `perf c2c` shows one line with high hit-modified counts from many cores | Pad to a line, or count thread-locally and merge |
| An image or matrix job is several times slower at 1,024 or 4,096 columns than at 1,000 | Conflict misses from a power-of-two stride | Pad each row by one cache line |
| Lookups slow down as the dataset grows, with an O(log n) structure | Working set passes L3 and TLB reach; each dependent miss is about 100 ns; IPC low | Wider nodes, arenas, smaller entries, huge pages, batched lookups |
| A service uses a third more memory than the data suggests | Struct padding across 100 million objects | Reorder fields; `pahole` or `fieldalignment` |
| A branch "optimisation" shows no effect, or a regression appears only at `-O3` or with PGO | The compiler changed branch versus `cmov` or vectorisation | Read the assembly; compare branch-miss counters |
| A job runs slower on a bigger two-socket server | Remote NUMA memory from first-touch placement | Bind threads and memory per socket, or interleave |

## Trade-offs

| Layout | Scan one field | Whole entity by ID | Insert or delete | SIMD-friendly | Complexity |
|---|---|---|---|---|---|
| Array of structs | Wastes most of each line | One or two lines | Cheap at the end | Poor | Lowest |
| Struct of arrays | Streams only what it needs | One line per field touched | One write per array | Excellent | Moderate |
| AoSoA (blocks of 8–16) | Near SoA | A few lines | Moderate | Excellent | Highest |
| Pointer-linked nodes | One dependent miss per node | One miss per hop | O(1) splicing | None | Low, but slow at scale |

## Interviewer follow-ups

**"Two threads increment separate counters and it is slower than one thread. Why, and how do you fix it?"** Model answer: the counters share a 64-byte line, and coherence works per line, so each write needs the line in Modified state and steals it from the other core; measured here, 202 million increments a second from two threads against 259 million from one. Fix with 64-byte alignment (128 on Intel), or thread-local counters merged at the end. Common wrong answer: "it is a race condition; add a lock", which adds a second contended line.

**"Why is iterating a linked list slower than an array when both are O(n)?"** Model answer: each node's address is inside the previous node, so loads are dependent, the prefetcher is blind, and only one miss is in flight; past the L3 that is about 100 ns per node against about 1.5 ns for a sequential walk here. Common wrong answer: "the list has more pointer arithmetic", which costs a cycle, not a hundred nanoseconds.

**"Hash-map lookups got five times slower as the table grew from 1 million to 50 million entries. What happened?"** Model answer: the table left the L3 and outran TLB reach, so each probe became a DRAM miss plus a page walk; shrink the entries, keep metadata dense (SwissTable-style control bytes), use huge pages, and batch or prefetch independent lookups. Common wrong answer: "more collisions", when the load factor did not change.

**"When would you choose AoS over SoA?"** Model answer: when access is per entity at random and touches most fields, as in OLTP rows; SoA when loops scan a few fields over many entities, as in analytics and physics. Common wrong answer: "SoA is always faster", which ignores that reading one entity touches one line per field.

## What mid-level engineers get wrong

- **Thinking "no shared variable" means "no sharing".** Consequence: a per-thread stats array that scales negatively.
- **Trusting big-O for large data.** Consequence: a tree or list that is 70 times slower than a sequential scan with the same complexity.
- **Declaring structs in arbitrary field order in Go or C.** Consequence: 33% more memory and cache traffic on hot structs, invisible in review.
- **Sizing buffers and matrices at powers of two.** Consequence: conflict misses in a nearly empty cache.
- **Benchmarking a branch at one optimisation level and shipping at another.** Consequence: conclusions about prediction that the compiler has already made irrelevant.
- **Believing the topology report.** Consequence: a cache-sized benchmark that fits in 96 MiB on one machine and falls off a cliff on a 32 MiB die or a smaller cloud instance.

## Senior signals

- You reason in 64-byte lines, and you distinguish latency-bound pointer chasing from bandwidth-bound streaming, with Little's law as the bridge.
- You can split an address into tag, set and offset for a real cache and predict conflict misses from a power-of-two stride.
- You can trace MESI or MOESI through a false-sharing loop and explain why padding stops the traffic.
- You spot false sharing in per-thread arrays, lock-next-to-data layouts and queue indices, and confirm it with `perf c2c` before padding.
- You order struct fields by size, split hot from cold, and know which languages reorder for you (Rust, the JVM) and which do not (C, Go).
- You choose AoS or SoA from the access pattern and connect the choice to row stores versus column stores.
- You read the assembly or branch-miss counters before crediting a branch, because `cmov` and vectorisation can remove it.
- You measure the hierarchy on the machine you deploy to, because topology reports under virtualisation and on chiplet parts can mislead.

## Check yourself

```quiz
- q: >-
    Eight threads each increment their own element of a shared, 64-byte-aligned array of eight 8-byte counters, with no locks. Adding threads makes total throughput drop below one thread's. What is the mechanism?
  options: ["All eight counters share a single bouncing cache line", "The scheduler keeps migrating threads between cores", "The array of counters is too large to fit in L1 cache", "The threads race and corrupt each other's counters"]
  answer: 0
  explanation: >-
    Each thread writes only its own counter, so there is no data race. Coherence operates on whole 64-byte lines and these eight counters fill one, so every write needs the line in Modified state and invalidates the other copies. Padding each counter to its own line, or using thread-local counters, removes the traffic.
- q: >-
    An L1 data cache is 48 KiB, 12-way set associative, with 64-byte lines. A loop repeatedly reads 16 values spaced exactly 4,096 bytes apart. What happens?
  options: ["Every access misses because the values straddle two lines", "All 16 lines fit in L1, so every pass after the first hits", "All 16 lines share one 12-way set, so the loop keeps missing", "The prefetcher hides the misses because the stride is constant"]
  answer: 2
  explanation: >-
    48 KiB of 64-byte lines in 12 ways is 64 sets, so the set index repeats every 4,096 bytes and all 16 lines compete for 12 ways: conflict misses in a cache that is almost empty. Measured on such a cache, 12 lines at this stride hit L1 at 0.9 ns and 16 lines miss to L2 at 2.7 ns. A 4,160-byte stride spreads them across sets.
- q: >-
    Under MOESI, core 0 holds a line in Modified state and core 1 issues a plain read of it. What are the two states afterwards?
  options: ["Core 0 Modified, core 1 Invalid, as the read is refused", "Core 0 Shared, core 1 Shared, after a DRAM write-back", "Core 0 Invalid, core 1 Modified, as ownership moves", "Core 0 Owned, core 1 Shared, with no write-back yet"]
  answer: 3
  explanation: >-
    The Owned state lets the dirty line be shared: core 0 forwards the data and remains responsible for writing it back later. Plain MESI would write the line back and leave both copies Shared. Ownership moves to core 1 only when it writes, which is a read-for-ownership, not a read.
- q: >-
    An analytics loop averages one 4-byte field across 50 million records of a 64-byte struct. Which change is likely to give the largest speed-up?
  options: ["Pad the struct so every field is 8-byte aligned", "Add a branch that skips records whose value is zero", "Link records in a list so inserts become cheap", "Store each field in its own contiguous array"]
  answer: 3
  explanation: >-
    The loop needs 4 bytes of each 64-byte record, but array-of-structs layout pulls whole lines through the cache. Struct-of-arrays streams only that column, measured at about 12 times faster for 10 million records, and lets the compiler vectorise. Padding adds bytes, a data-dependent branch may mispredict, and a list adds dependent misses.
- q: >-
    Chasing pointers through 512 MiB costs about 100 ns per hop in random order but about 1.5 ns per hop when the nodes are linked in address order. Each hop is a dependent load in both cases. What explains the gap?
  options: ["Random order executes more instructions per hop", "The branch predictor learns the sequential loop", "The prefetcher sees the stride and fetches ahead", "Sequential order fits the working set into the L3"]
  answer: 2
  explanation: >-
    The address stream is a constant stride, so hardware prefetchers issue the upcoming lines before the loads need them. The working set is the same 512 MiB either way, the loop's instructions are identical, and the loop branch is equally predictable in both orders. In random order no prefetcher can guess the next address, so every hop waits a full DRAM latency.
- q: >-
    Summing elements above a threshold is 12 times faster on sorted data than on random data in one build, but equally fast on both at -O2. What is the most likely explanation?
  options: ["Optimised builds turn off the CPU's branch predictor", "Sorting the data warms the cache for the summing loop", "The compiler replaced the branch with cmov or SIMD code", "The optimised build skips the loop as dead code"]
  answer: 2
  explanation: >-
    Sorting helps only by making the branch predictable. When the compiler if-converts the branch to a conditional move or vectorises it, there is nothing to mispredict and both inputs cost the same; the loop still runs, and the predictor is never switched off. Reading the assembly or branch-miss counters tells you which case you are in.
```
