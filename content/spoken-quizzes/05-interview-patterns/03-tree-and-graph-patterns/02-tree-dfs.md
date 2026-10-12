---
lesson: tree-dfs
source: edd8fe6d3dbd07a3
---
## 1

In the single-pass diameter solution, why does the recursive function return one plus the larger child height, rather than the left height plus the right height?

A, either works; the two values are interchangeable here. B, because returning left plus right would make the recursion never terminate. C, because a parent can extend a path through only one arm of this node. D, because left plus right is never larger than the height anyway.

[think]

The answer is C: a parent can extend a path through only one arm.

A path that goes down into both children of a node is complete at that node; it cannot continue upward. Returning it would let the parent build an impossible path. The height, one arm, is what the parent needs. The two-arm sum is a candidate answer, recorded on the side.

## 2

Validate Binary Search Tree, on a tree with root 5, left child 1, and right child 7, where 7 has children 3 and 8. A solution that only checks each node against its immediate children returns true. Which node exposes the bug, and what bound does it violate?

A, node 3, which violates the lower bound of 5 set by the root. B, none; the tree is a valid search tree, and true is correct. C, node 8, which violates the upper bound set by its parent. D, node 1, which violates the lower bound set by the root.

[think]

The answer is A: node 3, which violates the lower bound of 5.

Node 3 sits in the right subtree of 5, so it must be greater than 5, even though its parent, 7, is fine with it. The immediate-children check only compares 3 with 7. Passing a low and a high bound down the recursion encodes every ancestor's constraint in two numbers.

## 3

Maximum path sum, on a tree where every value is negative. A solution starts its best at zero, and clamps each child's contribution at zero. What does it return, and why is that wrong?

A, the largest single value, which is the correct answer. B, negative infinity, since the best is never updated at all. C, the sum of all values, since every arm is clamped at zero. D, zero, an empty path, though a path needs at least one node.

[think]

The answer is D: it returns zero, which is an empty path.

Clamping arms at zero is correct, because an arm that hurts the total should be dropped. But the best itself must be able to hold a negative single-node path, so it has to start at negative infinity. Starting at zero silently returns an empty path instead of the largest single value.

## 4

Which problem is best solved with a parameter passed down from the top, rather than a value returned up from below?

A, whether the tree is height-balanced at every node. B, the diameter, the longest path between any two nodes. C, the count of nodes whose value is at least every ancestor's value. D, the height of the tree, from the root to its deepest leaf.

[think]

The answer is C: counting nodes whose value is at least every ancestor's.

Whether a node counts depends only on its ancestors, and that is information that flows down. Height, diameter and balance are properties of the subtree below a node, which flow up.

## 5

You find the kth smallest value in a binary search tree with an iterative in-order traversal. What is the time complexity, and what augmentation makes repeated queries faster on a frequently modified tree?

A, log n always, and no augmentation is needed. B, linear, and you keep the sorted values in an array alongside. C, the height plus k, and you store each node's left-subtree size. D, k log n, and you keep a heap of the k smallest keys.

[think]

The answer is C: the height plus k, and store each node's left-subtree size.

The iterative in-order stops after k pops, and its stack holds at most the tree's height in nodes. A sorted array breaks on updates. Left-subtree sizes let you decide at each node whether the kth value is to the left, here, or to the right, so a query walks one root-to-node path, costing the height per query and per update.

## 6

In Path Sum Two, a candidate appends the live path list to the results whenever a leaf matches. Every result comes out identical. Why?

A, the base case fires on internal nodes as well as leaves. B, Python lists cannot be nested inside another list. C, every result is the same list object, which keeps changing. D, the recursion visits the leaves in the wrong order each time.

[think]

The answer is C: every result is the same list object, which keeps changing.

The path list is shared across the whole recursion, and later pops and appends keep mutating it. Recording it stores a reference, not a snapshot. Append a copy of the path at the moment of the match.
