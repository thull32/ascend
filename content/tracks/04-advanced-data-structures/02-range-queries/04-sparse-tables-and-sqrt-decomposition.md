---
slug: sparse-tables-and-sqrt-decomposition
title: "Sparse tables and sqrt decomposition: O(1) queries and block summaries"
description: Why idempotent operations allow O(1) range queries on static data, how the sparse table precomputes power-of-two windows, and how block decomposition trades logarithms for simplicity and shows up inside columnar stores.
minutes: 30
difficulty: medium
tags: [sparse-table, range-minimum-query, sqrt-decomposition, mo-algorithm, columnar]
problems: [sliding-window-maximum]
---
A log-analytics service stores one day of p99 latency samples, ten million of them, and serves "what was the worst latency between these two timestamps" for arbitrary windows from a dashboard that fires thousands of such queries per redraw. The data never changes once the day is over. A segment tree answers each query in `O(log n)`, about 24 steps; at thousands of queries per second that is fine but not free, and the tree's `2n` integers roughly double the memory. Because the data is static and the operation is `max`, there is a structure that answers every query with **two array reads**.

The same lesson covers the opposite corner: an operation with no nice algebraic property at all, or updates that a segment tree cannot express, where a deliberately crude block decomposition wins by being simple and cache-friendly.

## Idempotence is the key property

`max(a, a) = a`. That is idempotence, and it means overlapping windows are harmless: `max` of `[2, 9]` equals `max(max[2..6], max[5..9])` even though 5 and 6 are counted twice. Sum does not have this property (`sum[2..6] + sum[5..9]` double-counts), which is why sum needs the non-overlapping decomposition a segment tree performs.

With an idempotent operation you can cover *any* range `[l, r]` with exactly two power-of-two windows: one starting at `l` and one ending at `r`, both of length `2^k` where `k = ⌊log₂(r − l + 1)⌋`. They overlap in the middle and that is fine.

For `[2, 9]` (length 8): `k = 3`, and the two windows are `[2, 9]` and `[2, 9]` themselves. For `[2, 8]` (length 7): `k = 2`, windows `[2, 5]` and `[5, 8]`. For `[3, 3]`: `k = 0`, two copies of `[3, 3]`.

## The sparse table

Precompute `st[k][i]` = the min (or max) of the `2^k` elements starting at `i`. Row 0 is the array. Row `k` is built from row `k−1` by combining two adjacent half-windows:

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
```

Build is `O(n log n)` time and memory: each of `⌊log₂ n⌋ + 1` rows has at most `n` entries. Query is `O(1)`: compute `k`, read two cells, combine.

Trace on `values = [5, 2, 4, 7, 1, 3, 6]`, `n = 7`:

| row | window | contents |
|---|---|---|
| `st[0]` | length 1 | `[5, 2, 4, 7, 1, 3, 6]` |
| `st[1]` | length 2 | `[2, 2, 4, 1, 1, 3]` |
| `st[2]` | length 4 | `[2, 1, 1, 1]` |

Check a few cells. `st[1][3] = min(values[3], values[4]) = min(7, 1) = 1`. `st[2][0]` covers `[0, 3] = [5, 2, 4, 7]` and is built as `min(st[1][0], st[1][2]) = min(2, 4) = 2`; `st[2][1]` covers `[1, 4]` and is `min(st[1][1], st[1][3]) = min(2, 1) = 1`. The second operand is `prev[i + half]`, not `prev[i + 1]`; writing `i + 1` is the most common build bug and it produces a table that is right for `k ≤ 1` and silently wrong above, so test with a range of length 4 or more.

Query `min(3, 6)`: length 4, `k = 2`, `min(st[2][3], st[2][6 − 4 + 1]) = min(st[2][3], st[2][3]) = 1`. Query `min(0, 2)`: length 3, `k = 1`, `min(st[1][0], st[1][1]) = min(2, 2) = 2`. Query `min(2, 4)`: `k = 1`, `min(st[1][2], st[1][3]) = min(4, 1) = 1`.

The `bit_length` call is where `O(1)` hides a constant. Precompute a `log2` table for lengths `1..n` if the query loop is hot; in C++ or Rust use the leading-zero-count instruction, which is a single cycle.

## What the sparse table cannot do

**Updates.** Change one value and every window containing it is stale: up to `log n` rows times up to `2^k` windows per row, `O(n)` in total. If updates exist, you are back to a segment tree. A common hybrid is to rebuild the sparse table once per hour on immutable data while a segment tree serves the mutable current hour, which is exactly how tiered time-series storage separates "sealed" from "active" chunks.

**Non-idempotent operations.** For sum, gcd is idempotent (`gcd(a, a) = a`) but sum is not, so the two-window trick over-counts. You can still use a sparse table for sum with `O(log n)` queries by decomposing the range into non-overlapping power-of-two windows (the binary representation of the length), but at that point the segment tree is better because it also supports updates.

Contrast with the sliding-window maximum, where the windows move in one direction: the monotonic deque does it in `O(n)` total with no precomputation because it exploits *order* of queries, not idempotence.

```viz
{"type": "stack-queue", "algorithm": "sliding-window-max", "values": [5, 2, 4, 7, 1, 3, 6, 8], "k": 3,
 "title": "Sliding window maximum: a monotonic deque beats every tree when windows only move right",
 "caption": "Each element enters and leaves the deque once. For arbitrary, out-of-order ranges you lose this and need a sparse table or a segment tree."}
```

## Offline versus online

The sparse table is *online*: you build once and answer any query as it arrives. Some problems are easier *offline*: you receive all queries up front, reorder them, and answer them in whichever order is cheapest. The classic offline RMQ is to sort queries by right endpoint and sweep with a monotonic stack, which is `O((n + q) log n)` with tiny constants. For interviews, the distinction matters because "can I see all the queries first" is a question that unlocks simpler algorithms, and asking it marks you as someone who designs around the actual access pattern.

## Square-root decomposition

Now the crude tool. Split the array into blocks of size `B ≈ √n` and store a summary (sum, min, whatever) per block. A range query takes whole blocks in the middle in `O(n / B)` and scans the partial blocks at each end in `O(B)`; with `B = √n` both are `O(√n)`. A point update recomputes one block summary in `O(B)`, or `O(1)` for sum.

```python
class SqrtDecomposition:
    def __init__(self, values):
        self.a = values[:]
        self.B = max(1, int(len(values) ** 0.5))
        self.blocks = [0] * ((len(values) + self.B - 1) // self.B)
        for i, v in enumerate(values):
            self.blocks[i // self.B] += v

    def update(self, i, v):
        self.blocks[i // self.B] += v - self.a[i]
        self.a[i] = v

    def query(self, l, r):             # inclusive
        s = 0
        while l <= r and l % self.B != 0:      # left partial block
            s += self.a[l]; l += 1
        while l + self.B - 1 <= r:              # whole blocks
            s += self.blocks[l // self.B]; l += self.B
        while l <= r:                           # right partial block
            s += self.a[l]; l += 1
        return s
```

For `n = 10⁶`, `B = 1000`, a query touches at most 1000 elements plus 1000 block summaries, versus 20 nodes for a segment tree. So why would anyone use this?

- **The operation has no structure.** "How many distinct values in `[l, r]`", "the mode of `[l, r]`", "the k-th smallest in `[l, r]`". None of these compose from two halves in `O(1)`, so a segment tree either does not apply or needs a heavyweight merge. Per-block summaries (a frequency map per block, a sorted copy per block) handle them with `O(√n)` or `O(√n log n)` queries and no cleverness.
- **Range updates with weird semantics.** "Set every element in `[l, r]` to its square root, rounded down" has no lazy-composition law. With blocks, mark whole blocks as "pending" and recompute partials directly.
- **Cache behaviour.** A block of 1000 integers is 4 KB, one page, streamed sequentially. A segment tree query's 20 nodes are 20 dependent loads across a tree that does not fit in L1. On real hardware the `√n` approach is frequently within 2–3× of the `log n` approach for `n` up to a few million, and simpler to get right.

### Mo's algorithm

Offline sqrt decomposition applied to the *queries* rather than the array. Sort the `q` queries by `(l // B, r)`, so that consecutive queries have nearby left endpoints and non-decreasing right endpoints within a block. Then maintain a current window `[cur_l, cur_r]` and an incrementally maintained answer, and move the window's endpoints one step at a time to reach each query in turn. Each step adds or removes one element in `O(1)` (or `O(log n)`).

The total pointer movement is `O((n + q) √n)`: the right pointer moves at most `n` per left-block, and there are `√n` left-blocks; the left pointer moves at most `B` per query. For "count of distinct values in `[l, r]`" with `n = q = 10⁵` this is about 3 × 10⁷ increments of a frequency counter, comfortably fast, and there is no known `O(polylog)` online alternative for that problem.

## Blocks are how databases think

Square-root decomposition's block summaries are the single most widely deployed range-query technique in existence, though nobody calls them that:

- **Parquet and ORC** store min/max (and null count) per row group and per page. A predicate `WHERE ts BETWEEN a AND b` compares against those summaries and skips whole row groups. That is the "whole blocks in the middle" step of the sqrt query, and the reader still has to scan the partial blocks at the edges.
- **ClickHouse** keeps a sparse primary index with one mark every `index_granularity` rows (8,192 by default) and per-column min/max "skip indexes" over granules. Queries touch `O(matching granules)` data and scan inside them.
- **Postgres BRIN indexes** (Block Range INdexes) are literally per-block-range min/max summaries, chosen precisely because they are tiny (a few kilobytes for a terabyte table) and good enough when the column correlates with physical order, such as an append-only timestamp.
- **Snowflake, BigQuery, Iceberg metadata** all carry per-file column statistics for the same pruning.

None of these use `B = √n`; they choose `B` so a block matches a storage or I/O unit (a page, a row group, a file). The principle is identical: a summary per block makes the middle of a range cheap, and the ends are scanned. When you design a system that "needs a segment tree over the data lake", the honest answer is nearly always "we need block statistics and a scan", and knowing that is a senior-level judgement.

## Choosing among the four structures

| Need | Structure | Build | Query | Update | Memory |
|---|---|---|---|---|---|
| Static, idempotent op (min/max/gcd/or/and) | Sparse table | `O(n log n)` | `O(1)` | none | `O(n log n)` |
| Static or dynamic, invertible op (sum/xor/count) | Fenwick tree | `O(n)` | `O(log n)` | `O(log n)` | `n + 1` |
| Dynamic, any associative op | Segment tree | `O(n)` | `O(log n)` | `O(log n)` | `2n`–`4n` |
| Range updates + range queries | Lazy segment tree | `O(n)` | `O(log n)` | `O(log n)` | `4n` × 2 |
| Weird op, weird updates, or I/O-bound | Sqrt / blocks | `O(n)` | `O(√n)` | `O(√n)` or `O(1)` | `n + √n` |

The interview move is to ask two questions: "does the data change?" and "what is the operation?", then read the row.

## Exercise

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

## Senior signals

- You name idempotence as the property that permits overlapping windows and therefore `O(1)` queries, and you know sum lacks it.
- You state that a sparse table is for static data and explain the tiered pattern (sparse table for sealed chunks, segment tree for the live chunk).
- You ask "can I see all queries first" and know that offline processing (sorting queries, Mo's algorithm) can beat any online structure.
- You recognise block summaries as the production form of sqrt decomposition and can point to Parquet row-group statistics, ClickHouse granules and Postgres BRIN.
- You can argue from cache behaviour that `O(√n)` sequential is often competitive with `O(log n)` pointer-chasing at realistic sizes.
- You choose the structure from two questions, whether the data changes and what the operation is, and you can defend the table above.

## Check yourself

```quiz
- q: >-
    Why can a sparse table answer range-minimum in O(1) but not range-sum?
  options: ["Sum needs 64-bit integers", "Min is idempotent, so two overlapping power-of-two windows give the right answer; overlapping windows double-count for sum", "The table only stores minima", "Sum requires the data to be sorted"]
  answer: 1
  explanation: >-
    Any range is covered by two windows of length 2^k that may overlap. min(a, a) = a makes the overlap harmless; sum counts the overlap twice, so sum needs non-overlapping decomposition (log n windows or a segment tree).
- q: >-
    Your latency samples are immutable once a day closes, but the current day receives writes every second. Queries span both. The pragmatic design is:
  options: ["One giant sparse table rebuilt every second", "A segment tree over all history", "A sparse table per sealed day plus a segment (or Fenwick) tree for the live day, with the query split across them", "Scan the raw samples"]
  answer: 2
  explanation: >-
    Sealed data gets O(1) queries and no update cost; the live chunk gets O(log n) updates. Rebuilding a sparse table per write is O(n log n) per second; a single segment tree pays log n on everything and doubles memory for data that never changes.
- q: >-
    A Parquet reader evaluates WHERE ts BETWEEN a AND b using per-row-group min/max statistics. Which range-query technique is this?
  options: ["A segment tree query", "Lazy propagation", "Square-root (block) decomposition: skip whole blocks by summary, scan the partial blocks at the ends", "A sparse table lookup"]
  answer: 2
  explanation: >-
    Block statistics are exactly the per-block summaries of sqrt decomposition; the block size is chosen to match an I/O unit rather than √n, but the query shape (whole blocks by summary, edges by scan) is the same.
- q: >-
    You must answer 10⁵ queries of the form "how many distinct values in [l, r]" on a static array of 10⁵ elements, all queries known in advance. The best fit is:
  options: ["A sparse table", "A Fenwick tree", "Mo's algorithm: sort queries by (l // √n, r) and slide a window with a frequency counter", "A lazy segment tree"]
  answer: 2
  explanation: >-
    Distinct count does not combine from two halves, so trees do not apply directly. Mo's algorithm exploits the offline setting to move the window O((n + q)√n) steps in total, each a constant-time counter update.
- q: >-
    After building a sparse table over 10⁶ values, one value changes. What does it cost to make the table correct again?
  options: ["O(1)", "O(log n)", "O(n) in the worst case, because every window containing that index across all rows is stale", "O(n log n) always"]
  answer: 2
  explanation: >-
    Row k has up to 2^k windows containing the index; summed over rows that is O(n). Full rebuild is O(n log n) but a targeted fix is O(n); either way it is not a structure for mutable data.
```
