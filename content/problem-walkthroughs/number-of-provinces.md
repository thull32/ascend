---
problem: number-of-provinces
args: [[[1, 1, 1, 0], [1, 1, 1, 0], [1, 1, 1, 0], [0, 0, 0, 1]]]
frames: 66
source: 15074f151e4ed79f
---
@0
Four cities. Cities 0, 1 and 2 all have roads to each other, and city 3 has none. A province is a group of cities connected directly or through others: a connected component, handed to us as an adjacency matrix. We count them with union-find. Start with every city as its own province, and for each road between two different provinces, merge them and subtract one. The matrix is symmetric, and its diagonal is meaningless, so we only scan the upper triangle, where the column is past the row.

@1-5
Every city is its own parent, every group has size one, and the count starts at 4.

@6-15
Row 0, column 1: a road. Find the root of each end. City 0 is its own root, and so is city 1. Different roots, so different provinces.

@16-20
Merge them. The sizes are equal, so city 1 goes under city 0. Group 0 now has size two, and the count drops to 3.

@21-29
Row 0, column 2: another road. City 0's root is 0, city 2's root is 2. Different again.

@30-34
City 2 joins group 0, which now has size three, and the count drops to 2.

@35-40
Row 0, column 3: no road. Row 1, column 2: a road between cities 1 and 2.

@41-46
Find the root of city 1. Its parent is 0, not itself, so we walk up. On the way, path halving points it at its grandparent, which keeps future finds short. The root is 0.

@47-53
City 2's root is also 0. Same root, so this road joins two cities already in the same province, and the count does not change. This is the line that matters: decrementing on every road instead of every real merge would have counted three merges here and answered 1.

@54-63
The rest of the upper triangle has no roads, so city 3 stays on its own.

@64-65
We return 2: cities 0, 1 and 2, and city 3. Reading the matrix costs n squared and dominates; each find is nearly constant with union by size and path halving. Union-find is the reference answer because it handles roads arriving one at a time without any change.
