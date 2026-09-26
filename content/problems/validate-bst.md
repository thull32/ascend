---
slug: validate-bst
title: Validate Binary Search Tree
difficulty: medium
patterns: [tree-dfs]
lists: [core-75, ascend-150]
companies: [amazon, microsoft, meta, bloomberg]
order: 8
lesson: interview-patterns/tree-and-graph-patterns/tree-dfs
hints:
  - "Checking only that each node is greater than its left child and less than its right child is not enough. A value deep in the right subtree must be greater than *every* ancestor it is to the right of."
  - "Pass an allowed range down the recursion: the root may be anything, a left child must be below its parent, a right child above, and the bounds tighten as you descend."
  - "Alternatively, an in-order traversal of a valid BST produces strictly increasing values. Check that each visited value exceeds the previous one."
signatures:
  python:
    name: is_valid_bst
    starter: |
      def is_valid_bst(root: TreeNode | None) -> bool:
          pass
  javascript:
    name: is_valid_bst
    starter: |
      function is_valid_bst(root) {
      }
tests:
  - args: [{"$tree": [2, 1, 3]}]
    expected: true
  - args: [{"$tree": [5, 1, 4, null, null, 3, 6]}]
    expected: false
    label: right child smaller than root
  - args: [{"$tree": [5, 4, 6, null, null, 3, 7]}]
    expected: false
    label: locally fine, violates an ancestor bound
  - args: [{"$tree": [1]}]
    expected: true
    label: single node
  - args: [{"$tree": []}]
    expected: true
    label: empty tree
  - args: [{"$tree": [2, 2, 2]}]
    expected: false
    hidden: true
    label: duplicates are not allowed
  - args: [{"$tree": [3, 1, 5, 0, 2, 4, 6]}]
    expected: true
    hidden: true
  - args: [{"$tree": [10, 5, 15, null, null, 6, 20]}]
    expected: false
    hidden: true
    label: 6 is in the right subtree of 10
  - args: [{"$tree": [2147483647]}]
    expected: true
    hidden: true
    label: extreme value must not be treated as a sentinel
time_limit_ms: 4000
---
Given the root of a binary tree, return `true` if it is a valid **binary search tree**:

- every value in a node's left subtree is strictly less than the node's value,
- every value in its right subtree is strictly greater,
- and both subtrees are themselves valid BSTs.

Note "subtree", not "child". Duplicates are not allowed anywhere.

### Examples

| Input | Output | Why |
|---|---|---|
| `[2, 1, 3]` | `true` | |
| `[5, 1, 4, null, null, 3, 6]` | `false` | `4` is a right child of `5` but smaller |
| `[10, 5, 15, null, null, 6, 20]` | `false` | `6 < 15` looks fine locally, but `6` sits in the right subtree of `10` |

### Constraints

- `0 ≤ number of nodes ≤ 10⁴`
- `-2³¹ ≤ node.val ≤ 2³¹ - 1`

### Follow-up

The interviewer asks: "Why does the local parent/child check fail, precisely?" Then: "Suppose the tree is huge and on disk, and you can only read nodes in a stream. Which of your two approaches survives?"

## Solution

### The naive approach

Check at each node that `left.val < node.val < right.val`. It passes the first two examples and fails the third: `[10, 5, 15, null, null, 6, 20]` has `6 < 15`, so the local check at 15 passes, but 6 lives in the right subtree of 10 and is therefore required to be greater than 10. The BST property is about *subtrees*, which means every ancestor constrains every descendant, and a one-level check cannot see ancestors.

### The insight

Instead of comparing with children, carry the constraints *down*. The root may hold any value: `(-∞, +∞)`. Going left, the upper bound becomes the parent's value; going right, the lower bound does. Each node then only needs to check that its own value lies strictly inside the interval it inherited, because that interval already encodes every ancestor.

The equivalent view: an in-order traversal of a BST visits values in strictly increasing order, and any violation of the subtree rule shows up as a non-increase somewhere in that sequence.

### The optimal approach

Range-passing recursion:

```python
def is_valid_bst(root: TreeNode | None) -> bool:
    def valid(node, lo, hi):
        if node is None:
            return True
        if not (lo < node.val < hi):
            return False
        return valid(node.left, lo, node.val) and valid(node.right, node.val, hi)

    return valid(root, float("-inf"), float("inf"))
```

Time `O(n)`; every node is checked once. Space `O(h)`.

The bounds must be true infinities (or `None` meaning "unbounded"), not `-2³¹` and `2³¹ - 1`: a single node holding `2³¹ - 1` is a valid BST, and using the integer limits as sentinels rejects it. The hidden test with `2147483647` exists for this.

In-order alternative, which is also `O(n)` and useful when you want to stream:

```python
def is_valid_bst_inorder(root):
    prev = None
    stack, node = [], root
    while stack or node:
        while node:
            stack.append(node)
            node = node.left
        node = stack.pop()
        if prev is not None and node.val <= prev:
            return False
        prev = node.val
        node = node.right
    return True
```

### Common mistakes

- The local parent/child comparison.
- Using `<=` in the bound check or `<` in the in-order check, so `[2, 2, 2]` is accepted.
- Integer sentinels for the bounds, which fail on extreme values.
- Doing the in-order check by collecting the whole traversal into a list and then verifying it is sorted: correct, `O(n)` extra space, and it hides that early exit is possible.

### How to discuss it

Explain the failure of the local check with the `6 under 15 under 10` example before writing any code; that is what the interviewer wants to know you understand. Then present the interval-passing recursion and name the sentinel hazard. For the streaming follow-up: the in-order approach needs only the previous value and a stack proportional to height, so it works as long as you can traverse in-order; the interval approach needs the path of bounds, which is also `O(h)`; both survive, but if the on-disk layout hands you nodes in in-order sequence (as a sorted index file does), the in-order check degenerates to "is this sorted" with `O(1)` state, which is the answer to give.
