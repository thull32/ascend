---
lesson: tree-recursion-patterns
source: bedde1885aa8b8ba
---
## 1

A problem asks for the number of nodes whose value is greater than every ancestor's value. Which recursion shape fits, and why?

A, level order, because ancestors are on earlier levels. B, top-down, because each node needs the maximum above it. C, bottom-up, because each node needs its subtree's maximum. D, either, since both shapes need the same single parameter.

[think]

The answer is B: top-down, because each node needs the maximum above it.

The node needs one fact from its ancestors, the running maximum on the path from the root, and nothing from its descendants, so pass it down as an argument. A bottom-up version would have to return every value in the subtree, which is wasteful and nothing like the same code.

## 2

A diameter function returns the largest of three things: the height of the left child plus the height of the right child, plus 2; the diameter of the left child; and the diameter of the right child. It calls a separate height function. What is its time complexity on a chain of n nodes?

A, n log n. B, linear. C, 2 to the n. D, order n squared.

[think]

The answer is D: order n squared.

The height function costs the size of its subtree, and it is called at every node. On a chain the subtree sizes are n, n minus 1, and so on down to 1, which sums to about n squared over 2: 5 billion visits at 100 thousand nodes. Computing height and diameter in the same pass makes it linear.

## 3

In the maximum path sum recursion, why does each node return its own value plus the larger of its two branches, rather than its value plus both branches?

A, because a path that continues up to the parent can use only one branch. B, because adding both branches would count a negative branch twice. C, because the parent adds in the other branch by itself. D, to keep the recursion linear, rather than quadratic, on a chain.

[think]

The answer is A: because a path that continues up to the parent can use only one branch.

A path is a simple sequence of nodes. If the parent extends this node's path, that path enters from above and can leave through at most one child; otherwise it would visit the node twice. The both-sides value only updates the global best and is never returned. Negative branches are already handled by clamping each branch at zero.

## 4

The bottom-up lowest common ancestor function is called with two values, and one of them is not in the tree. What does it return?

A, the node that is present, since a lone hit propagates up. B, the root, since the search reaches it with one hit. C, an error, since one recursive branch returns nothing. D, nothing, since no node gets a hit from both children.

[think]

The answer is A: the node that is present, since a lone hit propagates up.

A node matching either value returns itself immediately, and a lone result passes up the tree unchanged, so there is no error and no empty result. With one target absent, the function returns the present one, which is wrong if the caller assumes both exist. When presence is not guaranteed, return found flags alongside the candidate.

## 5

You rebuild a tree from its preorder and inorder sequences, slicing the arrays at each recursive call. On a tree that is a left chain of n nodes, what does it cost?

A, order n squared, since each slice copies its whole subtree. B, n log n, since each level of recursion slices n items. C, linear, since a slice is a view, not a copy. D, linear, since each node is created exactly once.

[think]

The answer is A: order n squared, since each slice copies its whole subtree.

Each call slices arrays in proportion to its subtree's size, and on a chain those sizes sum to order n squared. Python and JavaScript slices copy; they are not views. Pass index ranges, and use a map from value to index, instead.

## 6

A static tree of 100 thousand nodes must answer 100 thousand lowest common ancestor queries. Which approach makes that feasible, and at what cost?

A, the bottom-up recursion per query, linear each, since n is small. B, parent pointers, walking both nodes up to the root per query, at the cost of the height each. C, binary lifting: an n log n table of ancestors, then log n per query. D, memoising each query's answer in a dictionary keyed by the pair.

[think]

The answer is C: binary lifting, an n log n table of ancestors, then log n per query.

The table holds each node's ancestor at every power of two, so a query can equalise depths and then jump in powers of two, about 17 steps at this size. A linear recursion per query is 10 billion visits. The parent-pointer walk is fine on a shallow tree, but linear on a chain, and memoising only helps when the same pairs repeat.
