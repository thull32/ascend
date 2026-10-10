---
lesson: sparse-tables-and-sqrt-decomposition
source: d77d4956a3cf13fb
fit: partial
desk:
  - "The idempotence proof and the two-window cover argument"
  - "The sparse-table code, its three-row trace and three query traces, and the cost table at a million elements"
  - "The disjoint sparse table code and its two traces"
  - "The square-root decomposition class, its query trace, and the block-size arithmetic"
  - "Mo's algorithm traced move by move, and the move-count table"
  - "The choosing table and the failure-mode table"
  - "Exercises: range-minimum queries with a sparse table; distinct values in ranges with Mo's algorithm"
---
## Introduction

A log-analytics service stores one day of 99th-percentile latency samples, ten million of them, and a dashboard asks "what was the worst latency between these two timestamps" thousands of times per redraw. Once the day is over, the data never changes.

A segment tree answers each query in about 24 levels. Fine, but not free. Because the data is static and the operation is max, there is a structure that answers every query with two array reads. Measured in CPython at a million elements: 0.28 microseconds per query, against 2.2 for an iterative segment tree.

This lesson also covers the opposite corner: an operation with no useful algebra at all, where a deliberately crude block decomposition wins by being simple, and where sorting the queries beats every online structure. Three ideas. Idempotence, and the sparse table it allows. Square-root blocks, which turn out to be how every columnar database prunes. And offline queries, with Mo's ordering.

## Idempotence

An operation is idempotent when combining a value with itself gives the value back. Min, max, greatest common divisor, bitwise and, bitwise or: all idempotent. Plus, times and XOR are not.

That one property makes overlapping windows harmless. If two windows together cover a range, the min of the first window combined with the min of the second is the min of the whole range, even where they overlap, because an element counted twice still gives the same min.

And two windows always suffice. Take the range's length, and the largest power of two that fits in it. Use one window of that size starting at the left end, and one ending at the right end. Each fits inside the range, and together they cover it, because twice that power of two is longer than the range. A range of length 7, from position 2 to 8: windows of 4, positions 2 to 5 and 5 to 8, overlapping at 5. A range of length 8: one window, used twice.

Before I go on: why can't the same trick answer range sum?

[pause]

Because the overlap is counted twice. Sum is not idempotent. It does have an inverse, though, which is why prefix sums answer static range sums in one subtraction anyway.

## The sparse table

Precompute, for every power of two and every start position, the min of that many elements starting there. Row 0 is the array. Each row above is built from two adjacent half-windows of the row below. The build is n log n time and memory, and a query is two reads and one min.

On seven values, 5, 2, 4, 7, 1, 3, 6: the min of positions 2 to 4, the values 4, 7 and 1, is a length-3 range, so two windows of 2: positions 2 and 3, min 4, and positions 3 and 4, min 1. Answer: 1.

The common build bug: combining each cell with its immediate neighbour in the row below, instead of the cell half a window away. That table is right for windows of length one and two, and wrong above. So test ranges of length 4 or more.

And one subtle trap in the "constant time" part: finding the largest power of two. Use an integer instruction, a bit length or a count of leading zeros. A floating-point base-2 log of 2 to the k, minus 1, rounds up to k once k reaches 49, which picks a window longer than the range. Integer bit operations cannot round.

## What it costs

Here is the number to compute before you propose one. At a million elements there are 20 rows, about 19 million entries: 75.8 megabytes of 32-bit values. The table is nineteen times the data, against 16 megabytes for a segment tree. In CPython the build took 2.16 seconds; in Node, 87 milliseconds, with 16-nanosecond queries. At 100 million elements it would be 27 rows and about 10 gigabytes.

The fix for memory combines both halves of this lesson. Cut the array into blocks of 32, keep one minimum per block, and build the sparse table over the block minima only. At a million elements that is 1.7 megabytes instead of 75.8. A query scans the two partial blocks at its ends and answers everything in between with two table reads.

And it cannot update. Change one value and every window containing it is stale: up to 2 to the k windows in row k, linear in total. On time series, the pragmatic hybrid is a sparse table per sealed chunk, a day or an hour, and a segment or Fenwick tree for the live chunk, with each query split across the two.

For static sums, products modulo a composite, or string concatenation, a disjoint sparse table also answers in constant time, using non-overlapping pieces. But when the operation has an inverse, plain prefix sums beat it.

## Square-root blocks

Split the array into blocks of size B and keep one summary per block. A query takes the partial block at each end element by element, and the whole blocks in between by their summaries.

Sixteen elements in blocks of 4, and a query from position 2 to 13: two elements from the end of the first block, the summaries of blocks 1 and 2, and two elements from the start of the last block. Four element reads plus two summaries, instead of twelve element reads.

The cost is at most two partial blocks plus n over B summaries, minimised near the square root of n over 2. For a million elements, B of about 707 and about 2,800 steps, against roughly 40 nodes for a segment tree. Measured in CPython: 42.9 microseconds per query with the plain loop, 6.1 with slicing and the built-in sum doing the scans, 2.2 for the segment tree. In Node, 2.4.

So why would anyone accept that? Three reasons. The operation has no structure: distinct values in a range, the most frequent value, the k-th smallest. None of those combines from two halves, but a frequency table or sorted copy per block answers them simply. Updates with odd semantics, like replacing each element with its integer square root, where no tag composes. And the partial blocks are sequential scans: a block of a thousand 32-bit integers is 4 kilobytes, one page, read at memory bandwidth.

## Blocks are how databases think

Per-block summaries are the most widely deployed range-query technique there is, though nobody calls them square-root decomposition. Parquet and ORC store min, max and null information per row group; a time-range filter compares against those and skips whole groups, then decodes the partial groups at the edges. ClickHouse keeps a mark every 8,192 rows with per-granule min-max indexes. Postgres's block range index stores a min and max per 128 heap pages, so a terabyte table needs only tens of megabytes of index. It works when the column follows physical order, like an append-only timestamp, and degrades to a full scan when it does not. Iceberg, Snowflake and BigQuery prune the same way, at file or partition grain.

None of them use the square root of n. They size the block to an I/O unit, a page, a row group, a file, because reading a block costs the same whether you need one row of it or all of them. When a design "needs a segment tree over the data lake", the honest answer is nearly always block statistics and a scan.

## Offline queries and Mo's ordering

The sparse table is online: build once, answer each query as it arrives. Some problems are easier offline, when you receive every query up front and may answer them in whatever order is cheapest. In an interview, "can I see all the queries first?" is the question that unlocks the simpler algorithm.

Mo's algorithm is square-root decomposition applied to the queries. It needs a statistic you can maintain by adding one element to a window and removing one, like a count of distinct values. Sort the queries by the block of their left end, then by right end. Keep one current window and slide its ends one step at a time to each query in turn. Within a block of left ends, the right end only moves forward; the left end wanders by at most B per query. Total movement is about n plus q, times the square root of n.

The lesson traces seven queries over sixteen elements: 43 single-element moves in Mo's order, against 94 in the input order. Flipping the sort direction on alternate blocks, so the right end sweeps back instead of rewinding, gets 41. On random data with 10 thousand elements and 10 thousand queries: 53 million moves in input order, 1.3 million in Mo's order.

But it only works offline. For distinct counts specifically there are better offline answers; Mo's algorithm earns its place for statistics like the mode, which only support add one and remove one.

## In the interview

A follow-up the lesson expects. Range minimum on a static array of 100 million 32-bit values.

[pause]

Not a full sparse table: compute its size first, about 10 gigabytes. Instead, blocks of 32 or 64 with one minimum each, a sparse table over the block minima, and scans or per-position bitmasks for the ends. Or a segment tree at 800 megabytes with log n queries. The wrong answer is "a sparse table, because it is constant time", said without the size.

And another: your queries arrive one at a time from users. Then Mo's algorithm is out, because it needs every query in advance. Batching users' requests for minutes to run it trades latency no product will accept.

## Recap

Four things to remember. Idempotent operations, min, max, gcd, and, or, let two overlapping power-of-two windows answer any static range in two reads; sum cannot, but has prefix sums. Compute the sparse table's size, nineteen times the data at a million elements, and fall back to block minima plus a small table. Square-root blocks win when the operation has no algebra, updates are odd, or the block is an I/O unit, which is exactly how Parquet, ClickHouse and Postgres prune. And ask whether the queries are offline: if so, Mo's ordering turns a quadratic walk into n plus q, times root n.

At your desk: the two-window proof, the sparse-table and disjoint-table code with their traces, the square-root class and block arithmetic, Mo's trace move by move, the choosing table, and the two exercises.
