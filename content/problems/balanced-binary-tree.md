---
slug: balanced-binary-tree
title: Balanced Binary Tree
difficulty: easy
patterns: [tree-dfs]
lists: [ascend-150]
companies: [amazon, google, microsoft, bloomberg]
order: 4
lesson: interview-patterns/tree-and-graph-patterns/tree-dfs
hints:
  - "Checking balance at each node by calling a separate height function is correct but O(n²) on a skewed tree, because heights are recomputed at every level."
  - "Compute height bottom-up, and the moment any node has children whose heights differ by more than one, report failure upwards immediately."
  - "Use a sentinel: return -1 for height to mean 'unbalanced somewhere below', and propagate it without further work."
signatures:
  python:
    name: is_balanced
    starter: |
      def is_balanced(root: TreeNode | None) -> bool:
          pass
  javascript:
    name: is_balanced
    starter: |
      function is_balanced(root) {
      }
tests:
  - args: [{"$tree": [3, 9, 20, null, null, 15, 7]}]
    expected: true
  - args: [{"$tree": [1, 2, 2, 3, 3, null, null, 4, 4]}]
    expected: false
  - args: [{"$tree": []}]
    expected: true
    label: empty tree
  - args: [{"$tree": [1]}]
    expected: true
    label: single node
  - args: [{"$tree": [1, 2, 3, 4]}]
    expected: true
    label: heights differ by exactly one
  - args: [{"$tree": [1, 2, null, 3]}]
    expected: false
    hidden: true
    label: chain of three
  - args: [{"$tree": [1, 2, 2, 3, null, null, 3, 4, null, null, 4]}]
    expected: false
    hidden: true
    label: balanced at the root but not below
  - args: [{"$tree": [1, 2, 3, 4, 5, 6, 7, 8]}]
    expected: true
    hidden: true
time_limit_ms: 4000
---
A binary tree is **height-balanced** if, at *every* node, the heights of the left and right subtrees differ by at most one. Given the root, return `true` if the tree is height-balanced.

The height of an empty subtree is 0 and the height of a leaf is 1.

### Examples

| Input | Output | Why |
|---|---|---|
| `[3, 9, 20, null, null, 15, 7]` | `true` | At the root heights are 1 and 2; every other node is a leaf or has leaf children |
| `[1, 2, 2, 3, 3, null, null, 4, 4]` | `false` | The left subtree of the root has height 3, the right has height 1 |
| `[1, 2, null, 3]` | `false` | A chain: at the root, left height 2 versus right height 0 |

### Constraints

- `0 ≤ number of nodes ≤ 5000`
- `-10⁴ ≤ node.val ≤ 10⁴`

### Follow-up

The interviewer asks: "Why does this definition of balance guarantee O(log n) height, and roughly how tall can a balanced tree of n nodes actually get?" Then: "What does an AVL tree do when an insert breaks this property?"

## Solution

### The naive approach

For each node, compute `height(left)` and `height(right)` with a helper, compare, and recurse into both children. Correct, and `O(n log n)` on a balanced tree, but on a chain each level recomputes the height of everything below it: `O(n²)`. The interviewer will ask why, and the answer is "the height helper does work the outer recursion has already done".

### The insight

Balance is a bottom-up property: a node is balanced if both subtrees are balanced *and* their heights are within one. Both facts are available at the moment you finish the children. So compute height post-order, and let the height function itself carry the balance verdict, so nothing is visited twice. A sentinel return value (`-1`) says "unbalanced somewhere in here"; once seen, it propagates straight to the root without any further comparisons.

### The optimal approach

```python
def is_balanced(root: TreeNode | None) -> bool:
    UNBALANCED = -1

    def height(node: TreeNode | None) -> int:
        if node is None:
            return 0
        l = height(node.left)
        if l == UNBALANCED:
            return UNBALANCED
        r = height(node.right)
        if r == UNBALANCED:
            return UNBALANCED
        if abs(l - r) > 1:
            return UNBALANCED
        return 1 + max(l, r)

    return height(root) != UNBALANCED
```

Time `O(n)`: each node is visited once, and the early return after an unbalanced left subtree means the right subtree is not even entered. Space `O(h)` for recursion.

Trace on `[1, 2, 2, 3, null, null, 3, 4, null, null, 4]`: the root's left subtree is `2 → 3 → 4` (a left chain) and its right subtree is a mirror-image right chain. Both have height 3, so the root *looks* balanced. But at the left `2`, `l = 2` (node 3 with child 4) and `r = 0`, difference 2, so the sentinel fires and the answer is `false`. This is why "check at the root only" is wrong.

### Common mistakes

- Checking balance only at the root.
- Recomputing heights at every level (the `O(n²)` version) and not being able to explain why it is slow.
- Returning a `(balanced, height)` tuple from the recursion. It is fine, and arguably clearer, but candidates often forget to short-circuit and end up doing full work on an already-failed subtree.

### How to discuss it

Describe the naive version and its `O(n²)` chain case first, then say "height is post-order anyway, so fold the check into it and use a sentinel to bail out early." For the first follow-up: with this definition the minimum node count for height `h` satisfies `N(h) = N(h-1) + N(h-2) + 1`, which grows like Fibonacci, so height is at most about `1.44 log₂ n`; balanced does not mean perfectly balanced, and a tree can be almost half again as tall as a perfect one. For the second: an AVL tree stores the height (or balance factor) in each node and repairs a violation with one or two rotations at the lowest unbalanced ancestor, which is `O(log n)` per insert because it only walks the insertion path.
