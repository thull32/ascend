---
problem: detect-squares
args: [["__init__"], ["add", [1, 1]], ["add", [1, 4]], ["add", [4, 1]], ["count", [4, 4]], ["add", [4, 1]], ["count", [4, 4]]]
frames: 38
source: 1ba965f429c9e0ff
---
@0-1
We store points and count axis-aligned squares that use a query point as one corner. Trying every triple of stored points is cubic. The insight: a square with one corner at the query is fixed entirely by the opposite corner, the diagonal. Pick the diagonal, and the other two corners have no freedom left: one shares the query's x and the diagonal's y, the other shares the diagonal's x and the query's y. So we only loop over diagonal candidates and look the other two up. The store is a counter from point to how many copies of it we have, because duplicates count as separate points.

@2-7
Three points are added: 1, 1; then 1, 4; then 4, 1. Each has a count of one.

@8-13
Count squares for the query 4, 4. The first candidate diagonal is 1, 1. Is it really a diagonal? It must not share the query's x, and the horizontal and vertical distances must be equal, here 3 and 3. Yes. So the other corners are 4, 1 and 1, 4. We multiply the three counts: one copy of the diagonal, one of 4, 1, one of 1, 4. One square. Total is 1. The lookups use get with a default of zero, not plain indexing. On this kind of map, plain indexing of a missing point would insert it, and inserting into the map while looping over it is an error.

@14-21
The next candidate, 1, 4, shares the query's y, so the distances are 3 across and zero up. Not equal: skip it. Then 4, 1 shares the query's x, so it cannot be a diagonal either. That x check is also what rules out zero-area squares, where the diagonal sits on the query point itself. The answer is 1: the square 1, 1; 1, 4; 4, 1; 4, 4.

@22-23
Now add 4, 1 a second time. Its count becomes 2.

@24-29
Query 4, 4 again. The diagonal 1, 1 passes the same test. The product is one copy of the diagonal, times two copies of 4, 1, times one copy of 1, 4: two. There are two ways to pick the same square, one for each copy of 4, 1, and the multiplication counts both with no extra code.

@30-37
The other two candidates are skipped as before, and we return 2.

Adding is constant time. Counting is linear in the number of distinct stored points, with constant-time lookups. The mistakes: using a set instead of a counter, which loses duplicates; counting a diagonal that shares the query's x or y, which produces zero-area squares; and the insert-on-lookup trap. If queries vastly outnumber adds, index points by column, so a query only scans the points that share its x.
