---
lesson: two-dimensional-arrays
source: 7dd9e8353a68f47f
---
## 1

Summing a large row-major matrix with the column index in the outer loop and the row index in the inner loop is much slower than the reverse. Why?

A, the inner loop runs more iterations, so loop overhead dominates the total. B, each inner step jumps a whole row of elements, so each access hits a new cache line. C, strided access mispredicts the loop branch on almost every iteration. D, column sums need extra additions to combine each column's partial result.

[think]

The answer is B: each inner step jumps a whole row of elements, so each access hits a new cache line.

The number of additions and iterations is identical either way. Row-major storage puts a row's elements side by side, so walking a row is sequential and prefetched, one new cache line per 16 integers. Walking a column is strided, and touches a new cache line, often a new page, per element. Measured on a 64 megabyte matrix: 3 milliseconds against 62.

## 2

In Python, you build a grid by multiplying a list containing one inner list of three zeros by 2. Then you set row 1, column 2 to 5. What is the grid now?

A, an index error is raised. B, two rows, both reading 0, 0, 5. C, a first row of 0, 0, 0, and a second row of 0, 0, 5. D, two rows, both reading 5, 5, 5.

[think]

The answer is B: two rows, both reading 0, 0, 5.

The outer multiplication copies the reference to one inner list twice, so both rows are the same object, and a write through either is visible through both. The inner list of three zeros is fine, because integers are immutable.

## 3

Rotating an n by n matrix 90 degrees clockwise in place is usually done as a transpose, then reversing each row. What is the complexity?

A, order n squared time, and order n squared extra space. B, order n squared time, and constant extra space. C, order n log n time, and linear extra space. D, linear time, and constant extra space.

[think]

The answer is B: order n squared time, and constant extra space.

Both passes touch every cell once, so the time is order n squared, which is linear in the number of cells. Both reflections swap in place, so no extra matrix is needed. Order n squared extra space is the cost of the simpler version that writes into a second matrix.

## 4

A recursive flood fill passes on a 20 by 20 example and crashes on a 2,000 by 2,000 grid of open cells. What happened, and what is the fix?

A, the recursion went as deep as the number of cells: use an explicit stack or breadth-first search. B, the recursion revisited cells without a visited set: add one, and it fits in the stack. C, the grid exceeded the cache, so the recursion timed out: tile the grid into blocks. D, the list of lists ran out of memory: switch to a flat array before recursing.

[think]

The answer is A: the recursion went as deep as the number of cells, so use an explicit stack or breadth-first search.

On an open grid the search path can be as long as the number of cells, four million here, far past CPython's default limit of 1,000 frames and Node's stack of roughly ten thousand. A visited set is needed for correctness but does not bound the depth, and four million cells as a list of lists is only tens of megabytes. The iterative version keeps the same order with a stack on the heap.

## 5

Which statement about a grid treated as a graph is correct?

A, breadth-first search on a grid needs a priority queue to find the shortest path. B, you must build an explicit adjacency list before running breadth-first search on it. C, traversal costs the square of rows times columns, since any cell can reach any other. D, a bounds-checked neighbours function serves as the adjacency list.

[think]

The answer is D: a bounds-checked neighbours function serves as the adjacency list.

The graph is implicit: nodes are cells, and edges are in-bounds neighbours generated on demand. Each cell has at most 4, or 8, edges, so breadth-first or depth-first search costs rows times columns, linear in the number of cells. A priority queue is only needed for weighted shortest paths.

## 6

In the constant-space set-matrix-zeroes algorithm, what goes wrong if you clear the first row before processing the interior?

A, it destroys the column markers stored in the first row. B, nothing, since the two saved flags already record every zero column. C, it zeroes the first column twice, which double-counts its marker. D, it forces extra space in proportion to rows plus columns, to hold the markers elsewhere.

[think]

The answer is A: it destroys the column markers stored in the first row.

The first row is borrowed as the record of which columns to clear. Overwriting it early destroys that information before it is used: if the first row was flagged and is zeroed first, every column marker reads 0, and every interior cell gets wiped. The two flags only record whether the first row and column themselves need clearing. Process the interior using the markers, then clear the first row and column.
