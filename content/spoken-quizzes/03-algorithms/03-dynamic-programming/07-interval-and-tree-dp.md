---
lesson: interval-and-tree-dp
source: 1697e6eeb7d478f7
---
## 1

In matrix chain multiplication, why must the table be filled by increasing interval length, rather than row by row?

A, row by row works too; length order is purely a convention. B, the matrices must be multiplied left to right, one by one. C, the right-hand sub-interval sits in a later row, so row order reads it unfilled. D, only length order fills the zero diagonal before it is read.

[think]

The answer is C: the right-hand sub-interval sits in a later row, so row order reads it unfilled.

The cell for i to j depends on i to k and on k plus 1 to j, both shorter intervals, and the second is in a later row than the cell being filled. Increasing length, or equivalently i descending with j ascending, is a valid order for the dependencies. The zero diagonal is the base case, and can be written up front in any order.

## 2

For burst balloons, why does defining the state as "the best coins when balloon k is burst first in the range" fail?

A, the recursion never terminates, since k can be picked again later. B, the answer moves to a cell the fill never reaches. C, the two sides become adjacent, so they stop being independent. D, the array can no longer be padded with ones at both ends.

[think]

The answer is C: the two sides become adjacent, so they stop being independent.

After bursting k first, the balloons on its left and right become neighbours and interact. An interval table needs the two sides of a split to be solvable separately. Bursting k last keeps the range's two boundaries as k's neighbours throughout, so the sides never interact. Padding is needed in both formulations, and is not the issue.

## 3

House robber on a tree returns two numbers per node, rob and skip. Why does a node's rob value add each child's skip value, rather than the better of the child's rob and skip?

A, because skip is always at least as large as rob. B, because a robbed node's children cannot be robbed at all. C, it should be the better of the two; the pair is only a memory saving. D, because rob is undefined for leaves, so skip is safer.

[think]

The answer is B: a robbed node's children cannot be robbed at all.

The constraint is on directly connected nodes. If the node is robbed, its children must be skipped, so only their skip value is legal, and a child's skip value already includes the best choice for the grandchildren. Skip is not always larger: a leaf's rob value is its cash, and its skip value is zero. The node's own skip value is where the better of the two is taken.

## 4

A bitmask table indexed by the set of visited cities and the last city is used for a travelling-salesman style problem with 25 cities. Is it feasible in a typical interview time limit?

A, only if the graph is complete, so that every mask is valid. B, no: about 800 million states, each with a linear transition. C, yes: only 25 squared states, one for each pair of cities. D, yes: memoisation visits only the reachable masks.

[think]

The answer is B: no; about 800 million states, each with a linear transition.

2 to the 25 is about 34 million masks, times 25 last cities, is about 840 million cells: several gigabytes for the table alone, and the transition multiplies the work by another 25. Bitmask tables are a tool for n up to about 20. Memoisation does not help here, since nearly every mask is reachable.

## 5

Rerooting computes an answer for every node of a tree in linear time, with two passes. What property must the combine operation have?

A, it must be idempotent, so a child counted twice is harmless. B, it must be linear, so the answer scales with node values. C, it must let one child's contribution be removed again. D, it must be commutative, so children combine in any order.

[think]

The answer is C: it must let one child's contribution be removed again.

The second pass derives a node's value excluding its own subtree from the parent's full value, so one child's contribution must be removable. For sums you subtract; for a maximum you keep the best and second-best child, so excluding the best still leaves an answer. Commutativity alone does not give you that, and without it, rerooting degrades to recomputing.

## 6

A table loops over every bitmask of n bits and, inside, over every submask of it, using the trick that steps from one submask to the next by subtracting one and masking. What is the total work over all masks?

A, n times 2 to the n, since each submask differs from the mask by one bit. B, 2 to the n, since the trick visits every subset once. C, 3 to the n, since each element is outside, in the mask only, or in both. D, 4 to the n, since there are 2 to the n masks, each with up to 2 to the n submasks.

[think]

The answer is C: 3 to the n, since each element is outside, in the mask only, or in both.

A pair of a mask and one of its submasks gives each element one of three roles, so there are exactly 3 to the n pairs, and the trick visits each once with constant work. Trying all 2 to the n candidates for every mask would be 4 to the n. Submasks are not one-bit neighbours of the mask, and 2 to the n counts subsets, not pairs.
