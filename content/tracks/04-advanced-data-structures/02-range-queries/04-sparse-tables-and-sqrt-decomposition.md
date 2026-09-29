---
slug: sparse-tables-and-sqrt-decomposition
title: "Sparse tables and sqrt decomposition: O(1) queries and block summaries"
description: Why idempotent operations allow O(1) range queries on static data, with the two-window overlap proved and traced, the memory of a sparse table at a million elements, the disjoint sparse table for sums, square-root block arithmetic and Mo's query ordering traced move by move, and how block summaries run inside columnar stores.
minutes: 45
difficulty: medium
tags: [sparse-table, range-minimum-query, sqrt-decomposition, mo-algorithm, columnar, disjoint-sparse-table]
problems: [sliding-window-maximum]
---
A log-analytics service stores one day of p99 latency samples, ten million of them, and serves "what was the worst latency between these two timestamps" for arbitrary windows from a dashboard that fires thousands of such queries per redraw. The data never changes once the day is over. A segment tree answers each query in `O(log n)`, about 24 levels; at thousands of queries per second that is fine but not free. Because the data is static and the operation is `max`, there is a structure that answers every query with **two array reads**: measured on CPython 3.14 at a million elements, 0.28 µs per query against 2.2 µs for an iterative segment tree.

The same lesson covers the opposite corner: an operation with no nice algebraic property at all, or updates a segment tree cannot express, where a deliberately crude block decomposition wins by being simple and cache-friendly, and where sorting the queries (Mo's algorithm) beats every online structure.

## Idempotence is the key property

An operation `⊕` is idempotent when `x ⊕ x = x`. `min`, `max`, `gcd`, bitwise `and` and `or` all are; `+`, `×` and `xor` are not. Idempotence is what makes overlapping windows harmless.

**Claim.** If `⊕` is associative, commutative and idempotent, and `A ∪ B = [l, r]` (the windows may overlap), then `f(A) ⊕ f(B) = f([l, r])`, where `f(X)` folds `⊕` over the elements of `X`.

**Proof.** `f(A) ⊕ f(B)` is `⊕` folded over the multiset `A + B`, in which each element of `A ∩ B` appears twice and every other element of `[l, r]` once. Associativity and commutativity let you reorder the fold so the two copies of each duplicated `x` sit next to each other, and `x ⊕ x = x` collapses each pair. What remains is each element of `[l, r]` exactly once. Sum fails at the last step: `sum[2..6] + sum[5..9]` counts elements 5 and 6 twice.

**Why two windows always suffice.** Let `len = r − l + 1` and `k = ⌊log₂ len⌋`, so `2^k ≤ len < 2^(k+1)`. Take `[l, l + 2^k − 1]` and `[r − 2^k + 1, r]`. Both lie inside `[l, r]` because `2^k ≤ len`. Together they cover it because the first ends no earlier than the position immediately before the second starts: `l + 2^k − 1 ≥ r − 2^k` is equivalent to `2^(k+1) ≥ len`, which holds. Examples: `[2, 9]` (length 8) is one window of 8 used twice; `[2, 8]` (length 7) is `[2, 5]` and `[5, 8]`, overlapping at 5; `[3, 3]` is `[3, 3]` twice.

## The sparse table

Precompute `st[k][i]` = the min of the `2^k` elements starting at `i`. Row 0 is the array; row `k` combines two adjacent half-windows of row `k − 1`:

```python
def build_sparse_table(values):
    n = len(values)
    st = [values[:]]                          # row k = 0 .. floor(log2 n)
    k = 1
    while (1 << k) <= n:
        prev = st[k - 1]
        half = 1 << (k - 1)
        st.append([min(prev[i], prev[i + half]) for i in range(n - (1 << k) + 1)])
        k += 1
    return st

def range_min(st, l, r):
    k = (r - l + 1).bit_length() - 1        # floor(log2(length))
    return min(st[k][l], st[k][r - (1 << k) + 1])

st = build_sparse_table([5, 2, 4, 7, 1, 3, 6])
print(st, range_min(st, 3, 6), range_min(st, 0, 2), range_min(st, 2, 4))   # ... 1 2 1
```

Build is `O(n log n)` time and memory: `⌊log₂ n⌋ + 1` rows of at most `n` entries. Query is `O(1)`: one `bit_length`, two reads, one `min`. Trace on `values = [5, 2, 4, 7, 1, 3, 6]`:

| row | window | contents |
|---|---|---|
| `st[0]` | length 1 | `[5, 2, 4, 7, 1, 3, 6]` |
| `st[1]` | length 2 | `[2, 2, 4, 1, 1, 3]` |
| `st[2]` | length 4 | `[2, 1, 1, 1]` |

`st[1][3] = min(7, 1) = 1`. `st[2][0]` covers `[5, 2, 4, 7]` and is built as `min(st[1][0], st[1][2]) = min(2, 4) = 2`; `st[2][1]` covers `[1, 4]` and is `min(st[1][1], st[1][3]) = 1`. The second operand is `prev[i + half]`, not `prev[i + 1]`; writing `i + 1` is the most common build bug, and it produces a table that is right for `k ≤ 1` and wrong above, so test ranges of length 4 or more.

| query | length | `k` | windows | reads | answer |
|---|---|---|---|---|---|
| `min(3, 6)` | 4 | 2 | `[3, 6]` twice | `st[2][3] = 1`, `st[2][3] = 1` | 1 |
| `min(0, 2)` | 3 | 1 | `[0, 1]`, `[1, 2]` | `st[1][0] = 2`, `st[1][1] = 2` | 2 |
| `min(2, 4)` | 3 | 1 | `[2, 3]`, `[3, 4]` | `st[1][2] = 4`, `st[1][3] = 1` | 1 |

## What a sparse table costs at a million elements

For `n = 10⁶` there are `⌊log₂ 10⁶⌋ + 1 = 20` rows, and row `k` has `n − 2^k + 1` entries, so the table holds `20n − (2²⁰ − 1) + 20 = 18,951,445` entries: **75.8 MB** of 32-bit values or **151.6 MB** of 64-bit ones, against 8 MB for the data and 16 MB for a `2n` segment tree. The table is nineteen times the data.

Measured on one core of a Ryzen 9 9950X3D:

| | CPython 3.14 (lists) | Node 24 (`Float64Array` rows) |
|---|---|---|
| build | 2.16 s | 87 ms |
| memory | 159.9 MB of list pointers | 151.6 MB |
| query | 0.28 µs | 16 ns |
| iterative segment tree query, same data | 2.2 µs | |

In CPython the table costs pointers only: `min` returns one of its arguments, so every entry refers to an `int` object that already exists in the input, and no new integers are allocated. The layout matters for speed: `st[k][i]` stores each row contiguously, so the build streams through memory, and a query reads two cells of the same row. At `n = 10⁸` the same table would be 27 rows and about 10 GB of 32-bit entries, which is where the block hybrid below takes over.

The `bit_length` call is the `O(1)` query's hidden constant. In C++ or Rust use the leading-zero-count instruction (`31 − __builtin_clz(len)`), in JavaScript `31 − Math.clz32(len)`. The float route is exact for powers of two (checked for every `2^k` below `2^53` in V8 and CPython), but `math.log2(2**k − 1)` rounds up to `k` once `k ≥ 49`, which would pick a window longer than the range; integer bit operations cannot round at all.

## Beyond idempotence: the disjoint sparse table

A static array with *sum*, a product modulo a prime, or string concatenation needs the windows not to overlap. The disjoint sparse table still answers in `O(1)`. At level `h` it cuts the (padded) array into blocks of `2^h` and stores, for each position, the fold from that position to its block's middle: suffixes leftwards in the left half, prefixes rightwards in the right half. For `l < r`, the highest differing bit of `l` and `r` names the one level at which they sit in the same block on opposite sides of its middle.

```python
import operator

def build_disjoint(values, op, identity):
    levels = max(1, (len(values) - 1).bit_length())
    size = 1 << levels
    a = values + [identity] * (size - len(values))
    table = [a]                                    # table[0] keeps the padded values
    for h in range(1, levels + 1):
        half, row = 1 << (h - 1), [identity] * size
        for mid in range(half, size, 2 * half):
            acc = identity
            for i in range(mid - 1, mid - half - 1, -1):   # suffixes of the left half
                acc = op(a[i], acc); row[i] = acc
            acc = identity
            for i in range(mid, mid + half):               # prefixes of the right half
                acc = op(acc, a[i]); row[i] = acc
        table.append(row)
    return table

def disjoint_query(table, op, l, r):
    if l == r:
        return table[0][l]
    h = (l ^ r).bit_length()      # level whose block has l and r on opposite sides of its middle
    return op(table[h][l], table[h][r])

t = build_disjoint([5, 2, 4, 7, 1, 3, 6, 8], operator.add, 0)
print(disjoint_query(t, operator.add, 2, 5), disjoint_query(t, operator.add, 4, 6))   # 15 10
```

Trace `sum(2, 5)`: `2 ^ 5 = 010 ^ 101 = 111`, bit length 3, so level 3: one block `[0, 7]` with middle 4. `table[3][2]` is the suffix `a[2] + a[3] = 11`, `table[3][5]` the prefix `a[4] + a[5] = 4`: 15. For `sum(4, 6)`: `100 ^ 110 = 010`, level 2, block `[4, 7]` with middle 6: `a[4] + a[5] = 4` plus `a[6] = 6` gives 10. Memory is `levels × size`, 21 million entries at `n = 10⁶`, and the operation only needs associativity, so the left piece must stay on the left.

## What the sparse table cannot do, and the block hybrid

**Updates.** Change one value and every window containing it is stale: up to `2^k` windows in row `k`, `O(n)` in total. With updates you are back to a segment tree. A common hybrid on time series is to build a sparse table once per sealed chunk (an hour, a day) while a segment or Fenwick tree serves the live chunk, and to split each query across the two, which is how tiered time-series storage separates sealed from active data.

**Memory.** Nineteen times the data is too much at `10⁸` elements. The fix combines both halves of this lesson: cut the array into blocks of `b = 32`, keep one minimum per block, and build the sparse table over the block minima only. At `n = 10⁶` that is 31,250 block minima and 15 rows, 435,998 entries or 1.7 MB of 32-bit values instead of 75.8 MB. A query scans the two partial blocks at its ends (at most 62 elements, two cache lines each for 32-bit values) and answers the whole blocks in between with two table reads. Replacing the in-block scan with a precomputed 32-bit mask per position makes it `O(1)` again, in `O(n)` space: the same bounds that Fischer and Heun reach with a succinct structure of `2n + o(n)` bits (SIAM Journal on Computing, 2011).

Contrast the sliding-window maximum, where windows move in one direction: the [monotonic deque](/learn/data-structures/stacks-queues/monotonic-deque) does it in `O(n)` total with no precomputation because it exploits the *order* of the queries, not idempotence.

```viz
{"type": "stack-queue", "algorithm": "sliding-window-max", "values": [5, 2, 4, 7, 1, 3, 6, 8], "k": 3,
 "title": "Sliding window maximum: a monotonic deque beats every tree when windows only move right",
 "caption": "Each element enters and leaves the deque once. For arbitrary, out-of-order ranges you lose this and need a sparse table or a segment tree."}
```

## Offline versus online

The sparse table is *online*: build once, answer each query as it arrives. Some problems are easier *offline*: you receive all queries up front, reorder them, and answer them in whichever order is cheapest. Offline RMQ, for example, sorts queries by right endpoint and sweeps with a [monotonic stack](/learn/data-structures/stacks-queues/monotonic-stack) plus a union-find or a binary search on the stack, `O((n + q) log n)` with tiny constants. In an interview, "can I see all the queries first?" is the question that unlocks the simpler algorithm, and asking it shows you design around the actual access pattern.

## Square-root decomposition: the block arithmetic

Split the array into blocks of size `B` and store one summary per block. Element `i` lives in block `i // B`; block `b` spans `b·B` to `min(n, (b + 1)·B) − 1`. A query takes the partial block at each end element by element and the whole blocks in between by summary.

```python
class SqrtDecomposition:
    def __init__(self, values, B=None):
        self.a = values[:]
        self.B = B or max(1, int(len(values) ** 0.5))
        self.blocks = [0] * ((len(values) + self.B - 1) // self.B)
        for i, v in enumerate(values):
            self.blocks[i // self.B] += v

    def update(self, i, v):                   # O(1) for sum: adjust one block
        self.blocks[i // self.B] += v - self.a[i]
        self.a[i] = v

    def query(self, l, r):                    # inclusive
        s = 0
        while l <= r and l % self.B != 0:     # left partial block
            s += self.a[l]; l += 1
        while l + self.B - 1 <= r:            # whole blocks
            s += self.blocks[l // self.B]; l += self.B
        while l <= r:                         # right partial block
            s += self.a[l]; l += 1
        return s

sd = SqrtDecomposition([1, 2, 1, 3, 2, 2, 4, 1, 3, 3, 5, 1, 2, 4, 4, 5], B=4)
print(sd.blocks, sd.query(2, 13))            # [7, 9, 12, 15] 31
```

Trace `query(2, 13)` with `n = 16`, `B = 4`: the left loop reads `a[2] = 1` and `a[3] = 3` and stops at 4, a block boundary; the middle loop takes block 1 (`9`) and block 2 (`12`) and stops at 12 because `12 + 3 ≤ 13` is false; the right loop reads `a[12] = 2` and `a[13] = 4`. Six element reads plus two summaries replace twelve element reads: `4 + 21 + 6 = 31`.

**Choosing `B`.** A query costs at most `2B` element reads plus `n/B` summaries, minimised at `B = √(n/2)`: for `n = 10⁶`, `B ≈ 707` and about 2,828 steps, against 3,000 for the round `B = 1000`. When the per-block summary is richer the balance moves: with a sorted copy of each block (to count elements `≤ x` in a range), a query costs `(n/B)·log B + 2B` and an update `O(B)`, so `B` near `√(n log n)` is better.

**Range updates** take the lazy idea one level deep: a whole block gets a pending tag (`add[b] += d`, and its sum grows by `d·B`), partial blocks are updated element by element and their summary recomputed. Operations with no composition law ("replace each element of `[l, r]` by its integer square root") work too: apply them per element and recompute the touched blocks, and mark a block as done once it cannot change further.

## Why anyone uses the O(√n) structure

For `n = 10⁶` a sqrt query touches up to 2,000 elements where a segment tree touches about 40 nodes. Measured on one core:

| range sum, `n = 10⁶`, random ranges | time per query |
|---|---|
| CPython 3.14, the loop above | 42.9 µs |
| CPython 3.14, `sum(a[l:e]) + sum(blocks[bl+1:br]) + sum(a[s:r+1])` | 6.1 µs |
| CPython 3.14, iterative segment tree | 2.2 µs |
| Node 24, the loop above over `Float64Array` | 2.4 µs |

Three reasons to accept the gap:

- **The operation has no structure.** Distinct values in `[l, r]`, the mode of `[l, r]`, the k-th smallest in `[l, r]`: none composes from two halves in `O(1)`. Per-block frequency tables or sorted copies answer them in `O(√n)` or `O(√n log n)` with no cleverness.
- **Updates with odd semantics**, as above, where no tag composes.
- **The ends are sequential scans.** A block of 1,000 32-bit integers is 4 KB, one page, read front to back at memory bandwidth, and in Python the slice-and-`sum` form moves the scan into C. Blocks sized to an I/O unit are the production form, below.

## Mo's algorithm, traced

Mo's algorithm is sqrt decomposition applied to the *queries*. With all `q` queries known up front and an answer that can be maintained under "add one element to the window" and "remove one element", sort the queries by `(l // B, r)`, keep a current window `[cur_l, cur_r]`, and move its ends one step at a time to reach each query in turn.

Take `a = [1, 2, 1, 3, 2, 2, 4, 1, 3, 3, 5, 1, 2, 4, 4, 5]`, `B = 4`, and "number of distinct values" (a count per value plus a running total of non-zero counts). Seven queries, `Q0` to `Q6`: `[1, 12]`, `[9, 14]`, `[2, 5]`, `[6, 7]`, `[0, 3]`, `[13, 15]`, `[5, 10]`. Sorting by `(l // 4, r)` gives `Q4, Q2, Q0, Q3, Q6, Q1, Q5`:

| order | query | block of `l` | right end | left end | moves | distinct |
|---|---|---|---|---|---|---|
| 1 | `Q4 [0, 3]` | 0 | −1 → 3 | 0 | 4 | 3 |
| 2 | `Q2 [2, 5]` | 0 | 3 → 5 | 0 → 2 | 4 | 3 |
| 3 | `Q0 [1, 12]` | 0 | 5 → 12 | 2 → 1 | 8 | 5 |
| 4 | `Q3 [6, 7]` | 1 | 12 → 7 | 1 → 6 | 10 | 2 |
| 5 | `Q6 [5, 10]` | 1 | 7 → 10 | 6 → 5 | 4 | 5 |
| 6 | `Q1 [9, 14]` | 2 | 10 → 14 | 5 → 9 | 8 | 5 |
| 7 | `Q5 [13, 15]` | 3 | 14 → 15 | 9 → 13 | 5 | 2 |

## Why Mo's ordering is fast

The trace above makes 43 single-element moves, against 94 in the input order. Within a block of `l` the right end only moves forward, and it rewinds only when the block changes (row 4); the left end wanders by at most `B` per query. That is the complexity argument: the right end sweeps at most `n` per block of `l`, over `n/B` blocks, and the left end moves at most `B` per query, so the total is `O(n²/B + qB)`, which is `O((n + q)√n)` at `B = √n`.

The common refinement sorts odd-numbered blocks by *decreasing* `r`, so the right end sweeps back instead of rewinding: 41 moves here. Measured move counts on random data with `n = q` and `B = √n`:

| `n = q` | input order | Mo order | odd-even Mo |
|---|---|---|---|
| 10⁴ | 53.2 million | 1.31 million | 0.84 million |
| 10⁵ | about 5 × 10⁹ (same per-query average) | 42.0 million | 26.4 million |

Measured in CPython 3.14, the plain Mo order at `10⁵` (42 million moves, each a dictionary update) takes 2.8 s. Distinct counts in particular also have an `O((n + q) log n)` offline answer (sort queries by `r`, keep a Fenwick tree with a 1 at the last occurrence of each value) and an online one with a persistent segment tree; Mo's algorithm earns its place for statistics that only support add-one and remove-one, such as the mode or the number of equal pairs in a range.

## Blocks are how databases think

Per-block summaries are the most widely deployed range-query technique in existence, though nobody calls them sqrt decomposition:

- **Parquet and ORC** store min, max and null information per block: Parquet per column chunk in each row group (and per page with the optional page index), ORC per file, per stripe and per row group of 10,000 rows by default. `WHERE ts BETWEEN a AND b` compares against those summaries and skips whole row groups: the "whole blocks in the middle" step. The reader still decodes the partial groups at the edges.
- **ClickHouse** keeps a sparse primary index with one mark every `index_granularity` rows (8,192 by default) and per-granule `minmax` skip indexes. A query reads the matching granules and scans inside them.
- **Postgres BRIN** (Block Range INdex) stores a min/max per range of heap pages, [128 pages by default](https://www.postgresql.org/docs/current/brin.html), so a terabyte of 8 KiB heap pages needs about a million summaries of a few dozen bytes each: tens of megabytes of index for a terabyte of table; it works when the column correlates with physical order, such as an append-only timestamp, and degrades to a full scan when it does not.
- **Iceberg, Snowflake and BigQuery** prune the same way at coarser grain: Iceberg manifests carry per-file column lower and upper bounds, Snowflake keeps the range of every column per micro-partition, and BigQuery prunes the sorted storage blocks of clustered tables by block metadata.

None of these use `B = √n`: they choose `B` to match an I/O unit (a page, a row group, a file), because reading a block costs the same whether you need one row of it or all. When a design "needs a segment tree over the data lake", the honest answer is nearly always "block statistics and a scan", and knowing that is a senior-level judgement. The [segment-tree lesson](/learn/advanced-data-structures/range-queries/segment-trees) shows the multi-level version of the same idea in monitoring downsampling tiers.

## Choosing among the structures

| Need | Structure | Build | Query | Update | Memory at `n = 10⁶`, 4-byte values |
|---|---|---|---|---|---|
| Static, idempotent op (min, max, gcd, and, or) | Sparse table | `O(n log n)` | `O(1)`, 2 reads | none | 75.8 MB |
| Same, memory-bound | Block minima + sparse table | `O(n)` | `O(1)` + 2 block scans | none | 4 MB + 1.7 MB |
| Static, any associative op (sum, product, concat) | Disjoint sparse table | `O(n log n)` | `O(1)`, 2 reads | none | 84 MB |
| Dynamic, invertible op (sum, xor, count) | [Fenwick tree](/learn/advanced-data-structures/range-queries/fenwick-trees) | `O(n)` | `O(log n)` | `O(log n)` | 4 MB |
| Dynamic, any monoid | Segment tree | `O(n)` | `O(log n)` | `O(log n)` | 8–16 MB |
| Range updates and range queries | [Lazy segment tree](/learn/advanced-data-structures/range-queries/lazy-propagation) | `O(n)` | `O(log n)` | `O(log n)` | 32 MB |
| No algebra, odd updates, or I/O-bound | Sqrt / blocks | `O(n)` | `O(√n)` | `O(1)`–`O(√n)` | 4 MB + 4 KB |
| All queries known, add/remove only | Mo's algorithm | sort `O(q log q)` | `O((n + q)√n)` total | none | 4 MB + counters |

The interview move is two questions, "does the data change?" and "what is the operation?", plus a third when the answer is awkward: "can I see all the queries first?"

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| Range minimums correct for short ranges, wrong for ranges of length 4 or more | Build combined `prev[i]` with `prev[i + 1]` instead of `prev[i + half]` | Test every `(l, r)` against a scan for a small random array; the bug appears only from row 2 |
| A service OOMs when the dataset grows 10× | The sparse table is `n log n`: 76 MB at `10⁶`, about 10 GB at `10⁸` | Block minima plus a sparse table over them (1.7 MB at `10⁶`), or a segment tree |
| Minimums stale after a correction to historical data | Someone patched `values` in place; a sparse table has no update path | Rebuild the sealed chunk's table, or keep corrected chunks in a mutable structure |
| Sum queries on a sparse table are too large | Two overlapping windows double-count for a non-idempotent op | Disjoint sparse table, prefix sums, or a Fenwick tree |
| Mo's algorithm runs for minutes on `10⁵` queries | Queries processed in input order, or `B` chosen as a constant (`B = 100` at `n = 10⁶` makes the right end sweep `10⁴` times) | Sort by `(l // B, r)` with `B ≈ n / √q`; odd-even ordering for a further 30–40% |
| Sqrt decomposition in Python is 20× slower than the segment tree | The partial-block scans run in the interpreter, one element per bytecode loop | Slice and `sum` (6.1 µs against 42.9 µs measured), or larger blocks with numpy |

## Interviewer follow-ups

**"Range minimum on a static array of `10⁸` 32-bit values."** Model answer: a full sparse table is about 10 GB, so blocks of 32 or 64 with one minimum each, a sparse table over the block minima (a few hundred MB at most), and in-block scans or per-position bitmasks for the ends; or a segment tree at 800 MB with `O(log n)` queries. Common wrong answer: "a sparse table, because it is `O(1)`", without computing its size.

**"Range sum on static data in `O(1)`?"** Model answer: prefix sums, one subtraction, `n` extra values; a disjoint sparse table only when the operation has no inverse (products modulo a composite, matrix products, string concatenation). Common wrong answer: a sparse table of sums with two overlapping windows.

**"Why does Mo's algorithm sort by `(l // B, r)` and not by `l`?"** Model answer: sorting by `l` alone lets `r` jump anywhere between consecutive queries, `O(n)` each and `O(nq)` in total; blocking `l` bounds the left movement to `B` per query and makes `r` monotone within a block, which gives `O(n²/B + qB)`. Common wrong answer: "sorting by `l` is enough because the window only moves right".

**"Your queries arrive one at a time from users."** Model answer: then Mo's algorithm is out, because it needs every query in advance; use a structure that answers online (a sparse table for static RMQ, a persistent or merge-sort tree for order statistics, blocks with per-block tables for the rest). Common wrong answer: batching user requests for minutes to run Mo's algorithm, trading latency no product will accept.

## What mid-level engineers get wrong

- **Choosing the sparse table without computing its size**, then discovering at `10⁸` that it is 10 GB.
- **Using a sparse table for sum** with overlapping windows, which over-counts every element in the overlap.
- **Rejecting sqrt decomposition on complexity alone**, when it is the only reasonable answer for mode, distinct-in-range with updates, or odd update semantics, and the production form of every columnar index.
- **Forgetting to ask whether queries are offline**, and building an online structure for a batch job that could have sorted its queries.
- **Picking `B` as a constant** instead of from `n` and `q`, which turns Mo's `O((n + q)√n)` back into something close to `O(nq)`.

## Exercises

```exercise
id: sparse-table-rmq
title: Answer range-minimum queries with a sparse table
prompt: |
  Given `values` (non-empty) and a list of inclusive `[l, r]` queries,
  return a list with the minimum of `values[l..r]` for each query, in
  order. Build a sparse table in O(n log n) and answer each query in O(1)
  with two overlapping power-of-two windows. A solution that scans each
  range is O(q · n) and will pass the tests but is not the point.
languages: [python, javascript]
entry: range_min_queries
starter:
  python: |
    def range_min_queries(values, queries):
        # st[k][i] = min of values[i : i + 2**k]
        # query: k = floor(log2(r - l + 1)); min(st[k][l], st[k][r - 2**k + 1])
        return []
  javascript: |
    function range_min_queries(values, queries) {
      // st[k][i] = min of values[i .. i + 2**k - 1]
      // query: k = floor(log2(r - l + 1)); min(st[k][l], st[k][r - 2**k + 1])
      return [];
    }
tests:
  - args: [[5, 2, 4, 7, 1, 3, 6], [[0, 2], [3, 6], [2, 4], [1, 1], [0, 6]]]
    expected: [2, 1, 1, 2, 1]
  - args: [[3], [[0, 0]]]
    expected: [3]
    label: single element
  - args: [[1, 2, 3, 4, 5, 6, 7, 8], [[0, 7], [4, 7], [6, 7], [3, 5]]]
    expected: [1, 5, 7, 4]
    label: power-of-two length
  - args: [[9, 8, 7, 6, 5, 4, 3, 2, 1], [[0, 8], [0, 0], [8, 8], [2, 6]]]
    expected: [1, 9, 1, 3]
    label: decreasing
  - args: [[-3, 10, -3, 8, 0, -7, 2], [[0, 1], [1, 4], [5, 6], [0, 6], [3, 3]]]
    expected: [-3, -3, -7, -7, 8]
    hidden: true
  - args: [[4, 4, 4, 4], [[0, 3], [1, 2]]]
    expected: [4, 4]
    hidden: true
    label: duplicates
hints:
  - "Row k has n - 2**k + 1 entries; build it from row k-1 with st[k][i] = min(st[k-1][i], st[k-1][i + 2**(k-1)])."
  - "floor(log2(len)) is len.bit_length() - 1 in Python and 31 - Math.clz32(len) in JavaScript."
  - "Overlap is fine because min is idempotent; the two windows together cover exactly [l, r]."
```

```exercise
id: mo-distinct-counts
title: Distinct values in ranges with Mo's algorithm
prompt: |
  Given `nums` (non-empty) and a list of inclusive `[l, r]` queries, all
  known up front, return a list with the number of distinct values in
  `nums[l..r]` for each query, in the original query order.

  Use Mo's algorithm: choose `B = max(1, floor(sqrt(n)))`, process the
  queries sorted by `(l // B, r)`, and move a window's two ends one
  element at a time while maintaining a count per value and the number of
  values whose count is non-zero. Remember each answer under its original
  index. A solution that builds a set per query passes the tests but is
  O(n · q) and not the point.
languages: [python, javascript]
entry: distinct_in_ranges
starter:
  python: |
    def distinct_in_ranges(nums, queries):
        # 1. B = max(1, int(len(nums) ** 0.5)); order = query indices sorted by (l // B, r)
        # 2. window [cur_l, cur_r] starts empty (0, -1); counts dict; distinct = 0
        # 3. for each query in order: extend/shrink the ends one element at a time
        return []
  javascript: |
    function distinct_in_ranges(nums, queries) {
      // 1. B = max(1, floor(sqrt(n))); order = query indices sorted by (floor(l / B), r)
      // 2. window [curL, curR] starts empty (0, -1); counts Map; distinct = 0
      // 3. for each query in order: extend/shrink the ends one element at a time
      return [];
    }
tests:
  - args: [[1, 2, 1, 3, 2, 2, 4, 1, 3, 3, 5, 1, 2, 4, 4, 5], [[1, 12], [9, 14], [2, 5], [6, 7], [0, 3], [13, 15], [5, 10]]]
    expected: [5, 5, 3, 2, 3, 2, 5]
    label: the lesson's seven queries
  - args: [[7], [[0, 0]]]
    expected: [1]
    label: single element
  - args: [[4, 4, 4, 4, 4], [[0, 4], [1, 3], [2, 2]]]
    expected: [1, 1, 1]
    label: all values equal
  - args: [[1, 2, 3], []]
    expected: []
    label: no queries
  - args: [[-1, 0, -1, 2, 0, 3, -1], [[0, 6], [0, 2], [1, 4], [3, 6], [2, 2], [4, 5]]]
    expected: [4, 2, 3, 4, 1, 2]
    label: negative values
  - args: [[5, 1, 5, 2, 5, 3, 5, 4, 5, 1, 2, 3], [[0, 11], [1, 9], [2, 3], [6, 11], [0, 0], [3, 8], [9, 11], [0, 5]]]
    expected: [5, 5, 2, 5, 1, 4, 3, 4]
    hidden: true
  - args: [[3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3, 2, 3, 8, 4], [[0, 19], [5, 14], [10, 10], [2, 17], [0, 9], [12, 19], [7, 8], [4, 13]]]
    expected: [9, 7, 1, 9, 7, 6, 2, 7]
    hidden: true
    label: answers must come back in the original order
hints:
  - "Sort the query indices, not the queries, so each answer can be written back to its original position."
  - "Extend before you shrink: move cur_r right and cur_l left first, then cur_r left and cur_l right, so the window is never inverted."
  - "When a value's count goes from 0 to 1, distinct += 1; from 1 to 0, distinct -= 1."
```

## Senior signals

- You name idempotence as the property that permits overlapping windows, can prove the two-window cover from `2^k ≤ len < 2^(k+1)`, and know sum lacks it.
- You compute a sparse table's size before proposing it (76 MB of 32-bit entries at `10⁶`, about 10 GB at `10⁸`) and reach for block minima plus a sparse table when that is too much.
- You know the disjoint sparse table gives `O(1)` static queries for any associative operation, and that prefix sums beat it whenever the operation is invertible.
- You ask "can I see all queries first?" and can trace Mo's ordering, explain its `O((n + q)√n)` bound, and say which statistics need it and which have better offline answers.
- You recognise block summaries as the production form of sqrt decomposition (Parquet row groups, ClickHouse granules, Postgres BRIN) with `B` chosen to match an I/O unit.
- You can argue from measurements: sequential block scans are competitive at realistic sizes, and in Python the choice between an interpreted loop and a slice-and-`sum` is a 7× difference.

## Check yourself

```quiz
- q: >-
    Why can a sparse table answer range minimum in O(1) but not range sum?
  options: ["Sums of 2^k windows overflow unless you use 64-bit integers", "Sum has no inverse, so the two windows cannot be subtracted", "Min is idempotent, so two overlapping windows are harmless", "The table stores only minima, so sum needs a second table"]
  answer: 2
  explanation: >-
    Any range is covered by two windows of length 2^k that may overlap. min(a, a) = a makes the overlap harmless; sum counts the overlap twice, so sum needs a non-overlapping decomposition. A table of window sums would still double-count, and sum does have an inverse, which is what prefix sums and Fenwick trees rely on.
- q: >-
    For a range of length 11, which two windows does the sparse table use, and why do they cover it?
  options: ["Two windows of length 4, since 4 is the largest power below 11/2", "Windows of length 8 and 3, since those sum to exactly 11", "Two windows of length 8, since 8 ≤ 11 < 16 and 2·8 ≥ 11", "One window of length 16 that overhangs the range at one end"]
  answer: 2
  explanation: >-
    k = floor(log2 11) = 3, so both windows have length 8: one starting at l and one ending at r. Each fits inside the range because 8 ≤ 11, and together they cover it because 16 ≥ 11. A length-3 window is not stored, a length-16 window would include elements outside the range, and two windows of length 4 cover only 8 elements.
- q: >-
    Your latency samples are immutable once a day closes, but the current day receives writes every second. Queries span both. The pragmatic design is:
  options: ["One segment tree over all history, sealed days included", "Scan the raw samples for every query, sealed or not", "A sparse table per sealed day, a segment tree for today", "One sparse table over all history, rebuilt every second"]
  answer: 2
  explanation: >-
    Sealed data gets O(1) queries and no update cost; the live chunk gets O(log n) updates, and each query is split across the two. Rebuilding a sparse table per write is O(n log n) per second; a single segment tree pays log n on everything for data that never changes.
- q: >-
    A Parquet reader evaluates WHERE ts BETWEEN a AND b using per-row-group min/max statistics. Which range-query technique is this?
  options: ["Square-root decomposition: skip blocks by summary", "A segment tree query: descend by each node's min/max", "Lazy propagation: push pending bounds down to rows", "A sparse table lookup: two overlapping min/max windows"]
  answer: 0
  explanation: >-
    Block statistics are the per-block summaries of sqrt decomposition: whole blocks in the middle are skipped by summary and the partial blocks at the ends are scanned. The block size matches an I/O unit rather than √n, and there is one level of summaries, not a tree of them.
- q: >-
    Mo's algorithm sorts offline queries by (l // B, r). What does that ordering guarantee?
  options: ["The left end only moves forward across the whole run", "Within a block of l, the right end only moves forward", "The window never shrinks from either end between queries", "Every query is answered in O(1) after the sort completes"]
  answer: 1
  explanation: >-
    Queries whose l falls in the same block are sorted by r, so the right end sweeps forward at most n per block and the left end moves at most B per query, giving O(n²/B + qB). The window does shrink (the traced row [1,12] to [6,7] removes ten elements), individual moves still cost work, and the left end moves back and forth within a block.
- q: >-
    After building a sparse table over 10⁶ values, one value changes. What does it cost to make the table correct again?
  options: ["O(1): only the row-0 cell for that index changes", "O(log n): one window per row contains the index", "O(n): up to 2^k windows in row k contain the index", "O(n log n): the whole table must always be rebuilt"]
  answer: 2
  explanation: >-
    Row k has up to 2^k windows containing the index; summed over the rows that is O(n), not one window per row. A full rebuild is O(n log n), but a targeted fix is O(n); either way it is not a structure for mutable data.
```
