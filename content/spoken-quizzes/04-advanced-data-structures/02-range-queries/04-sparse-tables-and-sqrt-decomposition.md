---
lesson: sparse-tables-and-sqrt-decomposition
source: 6b1eb4c6b0e6e682
---
## 1

Why can a sparse table answer range minimum in constant time, but not range sum?

A, sums of power-of-two windows overflow unless you use 64-bit integers. B, sum has no inverse, so the two windows cannot be subtracted. C, minimum is idempotent, so two overlapping windows are harmless. D, the table stores only minima, so sum needs a second table.

[think]

The answer is C: minimum is idempotent, so two overlapping windows are harmless.

Any range is covered by two power-of-two windows that may overlap. The minimum of a value with itself is the same value, so the overlap is harmless; a sum counts the overlap twice, so it needs a non-overlapping decomposition. A table of window sums would still double-count, and sum does have an inverse, which is what prefix sums and Fenwick trees rely on.

## 2

For a range of length 11, which two windows does the sparse table use, and why do they cover it?

A, two windows of length 4, the largest power below half of 11. B, windows of length 8 and 3, since those sum to exactly 11. C, two windows of length 8, since 8 fits within 11, and two 8s reach past 11. D, one window of length 16 that overhangs the range at one end.

[think]

The answer is C: two windows of length 8.

The largest power of two not above 11 is 8, so both windows have length 8, one starting at the left end and one ending at the right end. Each fits inside the range, and together they cover it, because 16 is at least 11. A length-3 window is not stored, a length-16 window would include elements outside the range, and two windows of 4 cover only 8 elements.

## 3

Your latency samples are immutable once a day closes, but the current day receives writes every second, and queries span both. What is the pragmatic design?

A, one segment tree over all history, sealed days included. B, scan the raw samples for every query, sealed or not. C, a sparse table per sealed day, and a segment tree for today. D, one sparse table over all history, rebuilt every second.

[think]

The answer is C: a sparse table per sealed day, and a segment tree for today.

Sealed data gets constant-time queries and no update cost, the live chunk gets log n updates, and each query is split across the two. Rebuilding a sparse table on every write costs n log n per second, and a single segment tree pays log n on everything, for data that never changes.

## 4

A Parquet reader evaluates a filter, timestamp between a and b, using the minimum and maximum statistics stored for each row group. Which range-query technique is this?

A, square-root decomposition: skipping blocks by their summary. B, a segment tree query: descending by each node's minimum and maximum. C, lazy propagation: pushing pending bounds down to rows. D, a sparse table lookup: two overlapping windows.

[think]

The answer is A: square-root decomposition, skipping blocks by their summary.

Row-group statistics are per-block summaries: whole blocks in the middle are skipped by their summary, and the partial blocks at the ends are scanned. The block size matches an I/O unit rather than the square root of n, and there is one level of summaries, not a tree of them.

## 5

Mo's algorithm sorts offline queries by the block of their left end, then by their right end. What does that ordering guarantee?

A, the left end only moves forward across the whole run. B, within one block of left ends, the right end only moves forward. C, the window never shrinks from either end between queries. D, every query is answered in constant time after the sort.

[think]

The answer is B: within one block of left ends, the right end only moves forward.

Queries whose left end falls in the same block are sorted by right end, so the right end sweeps forward at most n per block, and the left end moves at most a block's width per query. The window does shrink: in the lesson's trace, one step removes ten elements. Individual moves still cost work, and the left end moves back and forth within a block.

## 6

After building a sparse table over a million values, one value changes. What does it cost to make the table correct again?

A, constant: only the bottom row's cell for that index changes. B, log n: one window per row contains the index. C, linear: up to 2 to the k windows in row k contain the index. D, n log n: the whole table must always be rebuilt.

[think]

The answer is C: linear, since up to 2 to the k windows in row k contain the index.

Row k has up to 2 to the k windows that contain the index, and summed over all the rows that is linear in n, not one window per row. A full rebuild is n log n, and a targeted fix is linear; either way, it is not a structure for mutable data.
