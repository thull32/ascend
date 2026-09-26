---
slug: lowest-common-ancestor-bst
title: Lowest Common Ancestor of a BST
difficulty: medium
patterns: [tree-dfs]
lists: [core-75, ascend-150]
companies: [amazon, meta, microsoft, linkedin]
order: 7
lesson: interview-patterns/tree-and-graph-patterns/tree-dfs
hints:
  - "In a BST, the ordering tells you which side each target is on. If both `p` and `q` are smaller than the current node, the LCA is in the left subtree; if both are larger, in the right."
  - "The first node where `p` and `q` are not on the same side is the split point, and that node is the LCA. A node equal to `p` or `q` also qualifies."
  - "There is no need for recursion or a stack: walk down from the root with a single pointer."
signatures:
  python:
    name: lowest_common_ancestor
    starter: |
      def lowest_common_ancestor(root: TreeNode | None, p: int, q: int) -> int:
          # p and q are values present in the BST; return the LCA's value
          pass
  javascript:
    name: lowest_common_ancestor
    starter: |
      function lowest_common_ancestor(root, p, q) {
        // p and q are values present in the BST; return the LCA's value
      }
tests:
  - args: [{"$tree": [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5]}, 2, 8]
    expected: 6
  - args: [{"$tree": [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5]}, 2, 4]
    expected: 2
    label: one node is an ancestor of the other
  - args: [{"$tree": [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5]}, 3, 5]
    expected: 4
  - args: [{"$tree": [2, 1]}, 2, 1]
    expected: 2
    label: two-node tree
  - args: [{"$tree": [5, 3, 8, 1, 4, 7, 10, null, 2]}, 2, 4]
    expected: 3
  - args: [{"$tree": [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5]}, 0, 5]
    expected: 2
    hidden: true
  - args: [{"$tree": [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5]}, 7, 9]
    expected: 8
    hidden: true
  - args: [{"$tree": [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5]}, 0, 9]
    expected: 6
    hidden: true
    label: leaves on opposite edges
time_limit_ms: 4000
---
You are given the root of a **binary search tree** and two distinct values `p` and `q` that both exist in the tree. Return the value of their **lowest common ancestor**: the deepest node that has both `p` and `q` as descendants, where a node counts as a descendant of itself.

The BST property holds throughout: every value in a node's left subtree is smaller than the node, every value in its right subtree is larger, and values are unique.

### Examples

| Input | Output | Why |
|---|---|---|
| `[6, 2, 8, 0, 4, 7, 9, null, null, 3, 5]`, `p = 2`, `q = 8` | `6` | 2 is left of 6, 8 is right of 6 |
| same tree, `p = 2`, `q = 4` | `2` | 4 is in 2's subtree, so 2 is its own ancestor |
| same tree, `p = 3`, `q = 5` | `4` | Both sit under 4 on opposite sides |

### Constraints

- `2 ≤ number of nodes ≤ 10⁵`
- `-10⁹ ≤ node.val ≤ 10⁹`, all values unique
- `p ≠ q`, and both exist in the tree

### Follow-up

The interviewer asks: "Now it is an ordinary binary tree, not a BST. What changes?" Then: "You will receive a million LCA queries on the same tree. How do you avoid walking from the root every time?"

## Solution

### The naive approach

Find the path from the root to `p` and the path from the root to `q` (each `O(h)` in a BST), then compare them from the top and return the last node they share. Correct and `O(h)` time, but it uses `O(h)` memory for two paths and does two searches where one walk suffices. It is also the generic-binary-tree solution, so it ignores the BST property that the interviewer gave you deliberately.

### The insight

In a BST, comparing `p` and `q` with the current node tells you which subtree contains each. As long as both are on the *same* side, the LCA is further down on that side. The first node where they are on *different* sides (or where the node equals one of them) is the split point, and the split point is exactly the lowest node that has both as descendants. No path needs storing.

### The optimal approach

Start at the root. If `p` and `q` are both smaller, go left. If both larger, go right. Otherwise stop: the current node is the answer.

Trace on the example tree with `p = 3`, `q = 5`: at 6, both smaller, go left. At 2, both larger, go right. At 4, `3 < 4 < 5`, split. Answer 4.

```python
def lowest_common_ancestor(root: TreeNode | None, p: int, q: int) -> int:
    lo, hi = min(p, q), max(p, q)
    node = root
    while node is not None:
        if hi < node.val:
            node = node.left
        elif lo > node.val:
            node = node.right
        else:
            return node.val
    return -1  # unreachable: p and q are guaranteed to exist
```

Time `O(h)`: one walk from the root, `O(log n)` in a balanced tree and `O(n)` in a degenerate one. Space `O(1)`.

### Common mistakes

- Writing `p < node.val and q < node.val` in one branch and `p > node.val or q > node.val` in the other; the second must also be `and`, or a split at the current node is missed.
- Treating "equal to the node" as a mismatch and stepping past the answer when one value is the ancestor of the other.
- Recursing when a loop does the same job with no stack.

### How to discuss it

Say "in a BST the values tell me the direction; the LCA is the first node where the two targets diverge" and write the loop. Then contrast with the general binary-tree version: without ordering you must search, and the standard answer is a post-order recursion that returns the node if it is `p` or `q`, and otherwise returns whichever child found something, or the current node if both did; that is `O(n)` because you may visit the whole tree. For the many-queries follow-up: preprocess. Binary lifting stores each node's `2^k`-th ancestor for `O(n log n)` preprocessing and `O(log n)` per query, and the Euler-tour-plus-range-minimum method gets `O(1)` per query. Knowing that the answer changes when the query count changes is the senior signal.
