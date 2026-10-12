---
lesson: binary-search-trees
source: 172939c58fff30bf
---
## 1

A validator checks that every left child is smaller than its parent and every right child is larger. Every tree below has a root of 10, with 5 on the left and 15 on the right, plus one more node. Which tree does it wrongly accept?

A, 5 has a left child of 12. B, 5 has a right child of 7. C, 15 has a right child of 12. D, 15 has a left child of 6.

[think]

The answer is D: 15 has a left child of 6.

6 is smaller than its parent 15, so the parent-only check passes. But 6 sits in the right subtree of 10 and must be greater than 10; a search for 6 turns left at 10 and never finds it. Only ancestor bounds catch it. 7 under 5 is a valid placement, and the two trees with 12 fail even the parent-only check.

## 2

Deleting a node with two children, by replacing it with its in-order successor, never requires a further two-child deletion. Why?

A, the successor is the right subtree's minimum, so it has no left child. B, the successor is the left subtree's maximum, so it has no right child. C, the successor is always the direct right child, so it is spliced out. D, the successor is always a leaf, so removing it needs no splicing.

[think]

The answer is A: the successor is the right subtree's minimum, so it has no left child.

The leftmost node of a subtree has no left child by construction, so removing it is either the leaf case or the one-right-child case. It may not be a leaf, and it is the direct right child only when that child has no left subtree. The maximum of the left subtree is the in-order predecessor, the other valid choice, not the successor.

## 3

The keys 1 to 100 thousand are inserted in ascending order into a plain binary search tree. Roughly how many nodes does a search for key 100 thousand visit?

A, about 23, since the average depth is 1.39 times log base 2 of n. B, about 17, since each step halves the remaining keys. C, about 50 thousand, since a search stops halfway on average. D, about 100 thousand, since the tree is a right chain.

[think]

The answer is D: about 100 thousand, since the tree is a right chain.

Ascending insertion builds a right chain of height 99,999, and the largest key sits at the very bottom, so the search walks every node. A balanced tree would take about 17. The logarithmic depth figures only hold for random insertion order.

## 4

You need insert, delete, and "how many stored keys are less than x", each in logarithmic time. What is the right structure?

A, a sorted array, using binary search to find the rank. B, a hash set, scanning every key to count the ones below x. C, a balanced binary search tree with a subtree size stored in each node. D, a min-heap, popping until the top is at least x.

[think]

The answer is C: a balanced binary search tree with a subtree size stored in each node.

Subtree sizes let you compute the rank of x in one descent, and balancing keeps that descent logarithmic. A sorted array answers the query in logarithmic time, but inserts in linear time. A heap gives no rank information without destroying itself, and a hash set has no order.

## 5

A Java tree map is keyed on objects whose comparison uses a field that is later mutated. It starts reporting that it does not contain keys that iteration still prints. What is going on?

A, the mutated keys were rehashed into a different bucket of the backing hash table. B, the tree map caches comparison results per key, and the cache is stale after the mutation. C, the tree has degenerated into a chain, so lookups time out and report absence. D, searches turn the wrong way at nodes whose keys now break the invariant, so present keys are unreachable.

[think]

The answer is D: searches turn the wrong way at nodes whose keys now break the invariant, so present keys are unreachable.

A red-black tree only works if every key sits inside the bounds its ancestors impose, and mutating a key breaks that silently. A search that compares against the mutated value goes down the wrong side, while iteration, which follows pointers rather than comparisons, still visits the node. A chain slows lookups but does not lose keys, and a tree map has no buckets and no comparison cache.

## 6

Python has no balanced tree in its standard library. For an ordered set of about 10 thousand integers, with frequent inserts and floor queries, what is the pragmatic choice?

A, a hand-written red-black tree, for logarithmic inserts. B, a dict, sorting its keys on every query. C, a list ordered by heapq, searched for the floor key. D, a sorted list, using bisect for search and insert.

[think]

The answer is D: a sorted list, using bisect for search and insert.

Bisect gives logarithmic search and linear insert, but the insert is a block memory move of at most 80 kilobytes, which takes microseconds. A hand-written red-black tree is a lot of risky code that does not beat it below about 100 thousand elements. Sorting a dict's keys per query is n log n every time, and a heap cannot answer floor.
