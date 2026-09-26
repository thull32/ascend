---
slug: kth-smallest-bst
title: Kth Smallest Element in a BST
difficulty: medium
patterns: [tree-dfs]
lists: [core-75, ascend-150]
companies: [amazon, google, meta, bloomberg]
order: 9
lesson: interview-patterns/tree-and-graph-patterns/tree-dfs
hints:
  - "In-order traversal of a BST visits values in ascending order, so the k-th value visited is the answer."
  - "Do not collect the whole traversal into a list. Count as you visit and stop the moment the count reaches k."
  - "An explicit stack gives you control over stopping: push left spine, pop, count, then move to the right child."
signatures:
  python:
    name: kth_smallest
    starter: |
      def kth_smallest(root: TreeNode | None, k: int) -> int:
          pass
  javascript:
    name: kth_smallest
    starter: |
      function kth_smallest(root, k) {
      }
tests:
  - args: [{"$tree": [3, 1, 4, null, 2]}, 1]
    expected: 1
  - args: [{"$tree": [5, 3, 6, 2, 4, null, null, 1]}, 3]
    expected: 3
  - args: [{"$tree": [1]}, 1]
    expected: 1
    label: single node
  - args: [{"$tree": [2, 1, 3]}, 3]
    expected: 3
    label: k equals the node count
  - args: [{"$tree": [8, 4, 12, 2, 6, 10, 14, 1, 3, 5, 7, 9, 11, 13, 15]}, 10]
    expected: 10
  - args: [{"$tree": [5, 3, 6, 2, 4, null, null, 1]}, 6]
    expected: 6
    hidden: true
  - args: [{"$tree": [8, 4, 12, 2, 6, 10, 14, 1, 3, 5, 7, 9, 11, 13, 15]}, 7]
    expected: 7
    hidden: true
  - args: [{"$tree": [4, 2, null, 1, 3]}, 4]
    expected: 4
    hidden: true
    label: root is the largest
time_limit_ms: 4000
---
Given the root of a binary search tree and an integer `k`, return the `k`-th smallest value in the tree, counting from 1. All values are distinct and `k` is always valid.

### Examples

| Input | Output | Why |
|---|---|---|
| `[3, 1, 4, null, 2]`, `k = 1` | `1` | Sorted order is `1, 2, 3, 4` |
| `[5, 3, 6, 2, 4, null, null, 1]`, `k = 3` | `3` | Sorted order is `1, 2, 3, 4, 5, 6` |
| `[4, 2, null, 1, 3]`, `k = 4` | `4` | The root is the largest value |

### Constraints

- `1 ≤ k ≤ number of nodes ≤ 10⁴`
- `0 ≤ node.val ≤ 10⁴`

### Follow-up

The interviewer asks: "The tree is modified often (inserts and deletes) and you are asked for the k-th smallest repeatedly. How do you make each query faster than O(h + k)?"

## Solution

### The naive approach

In-order traverse into a list and return `list[k - 1]`. `O(n)` time and `O(n)` space regardless of `k`. It is correct, and for `k = 1` on a million-node tree it does a million times more work than necessary.

### The insight

In-order traversal of a BST yields sorted order, so the `k`-th value visited is the `k`-th smallest. The improvement is simply to *stop* after `k` visits. With an explicit stack you control the traversal step by step, so stopping early is natural; with recursion you need a counter and an early-return flag.

### The optimal approach

Iterative in-order: push the left spine from the root, pop a node (that is the next smallest), decrement `k`, and if `k` hits zero return it; otherwise move to the popped node's right child and push its left spine.

Trace on `[5, 3, 6, 2, 4, null, null, 1]`, `k = 3`: push 5, 3, 2, 1. Pop 1 (`k = 2`), no right child. Pop 2 (`k = 1`), no right child. Pop 3 (`k = 0`) → return 3.

```python
def kth_smallest(root: TreeNode | None, k: int) -> int:
    stack = []
    node = root
    while True:
        while node is not None:
            stack.append(node)
            node = node.left
        node = stack.pop()
        k -= 1
        if k == 0:
            return node.val
        node = node.right
```

Time `O(h + k)`: `O(h)` to reach the leftmost node, then each of the `k` visits is amortised `O(1)`. Space `O(h)` for the stack.

### Common mistakes

- Collecting the full traversal when the problem is clearly asking for early termination.
- Off-by-one: decrementing before checking versus after. Trace `k = 1` on a single node.
- A recursive version that keeps traversing after finding the answer because the early return only exits the current frame; you need to check a `found` flag before recursing into the right subtree.

### How to discuss it

Say "in-order is sorted order; stop after k pops" and write the iterative traversal, then give `O(h + k)`. The follow-up is the real question: augment each node with the size of its subtree. Then at each node, if the left subtree has `L` nodes: `k ≤ L` means go left, `k == L + 1` means this node is the answer, otherwise go right with `k - L - 1`. Queries become `O(h)`, and inserts and deletes update the sizes along one root-to-leaf path in `O(h)`. That is an order-statistic tree, and it is what a database does when it supports `OFFSET` efficiently on an index. Mentioning that you would keep the augmentation balanced (AVL or red-black) closes the loop.
