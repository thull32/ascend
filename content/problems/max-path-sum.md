---
slug: max-path-sum
title: Binary Tree Maximum Path Sum
difficulty: hard
patterns: [tree-dfs]
lists: [core-75, ascend-150]
companies: [meta, amazon, google, microsoft]
order: 11
lesson: interview-patterns/tree-and-graph-patterns/tree-dfs
hints:
  - "Every path has a single highest node where it bends. At that node the path is: best downward arm on the left, plus the node, plus best downward arm on the right."
  - "A downward arm can be empty. If the best arm from a child is negative, contributing nothing (0) is better than including it."
  - "The recursion returns the best *single* arm (node plus at most one child arm) for the parent to extend, and separately records the best *two-armed* path seen so far."
signatures:
  python:
    name: max_path_sum
    starter: |
      def max_path_sum(root: TreeNode | None) -> int:
          pass
  javascript:
    name: max_path_sum
    starter: |
      function max_path_sum(root) {
      }
tests:
  - args: [{"$tree": [1, 2, 3]}]
    expected: 6
  - args: [{"$tree": [-10, 9, 20, null, null, 15, 7]}]
    expected: 42
  - args: [{"$tree": [-3]}]
    expected: -3
    label: single negative node
  - args: [{"$tree": [2, -1]}]
    expected: 2
    label: skip a negative child
  - args: [{"$tree": [-1, -2, -3]}]
    expected: -1
    label: all negative
  - args: [{"$tree": [1, -2, 3]}]
    expected: 4
    hidden: true
  - args: [{"$tree": [5, 4, 8, 11, null, 13, 4, 7, 2, null, null, null, 1]}]
    expected: 48
    hidden: true
    label: path bends below the root on one side
  - args: [{"$tree": [9, 6, -3, null, null, -6, 2, null, null, 2, null, -6, -6, -6]}]
    expected: 16
    hidden: true
time_limit_ms: 4000
---
A **path** in a binary tree is any sequence of nodes where each consecutive pair is joined by an edge, and no node appears twice. A path does not have to pass through the root and does not have to start or end at a leaf; a single node is a path.

Given the root of a non-empty binary tree, return the maximum sum of node values over all paths. Values may be negative.

### Examples

| Input | Output | Why |
|---|---|---|
| `[1, 2, 3]` | `6` | `2 → 1 → 3` |
| `[-10, 9, 20, null, null, 15, 7]` | `42` | `15 → 20 → 7`; including `-10` would only lower it |
| `[-1, -2, -3]` | `-1` | Every path is negative; the best is the root alone |

### Constraints

- `1 ≤ number of nodes ≤ 3 × 10⁴`
- `-1000 ≤ node.val ≤ 1000`

### Follow-up

The interviewer asks: "Return the path itself, not just the sum." Then: "Now the path must start and end at leaves. What changes?"

## Solution

### The naive approach

Enumerate every pair of nodes, find the path between them, sum it. There are `O(n²)` pairs and each path is `O(n)`; hopeless. Even the smarter "for every node as the bend point, compute the best downward arm on each side" is `O(n · h)` if arms are recomputed per node. The structure of that second idea is right; the recomputation is the waste.

### The insight

Every path has a unique topmost node, its **bend**. At the bend, the path consists of a downward arm into the left subtree (possibly empty), the bend node itself, and a downward arm into the right subtree (possibly empty). So the answer is `max over nodes of (best_left_arm + node.val + best_right_arm)`, and the best downward arm from a node is `node.val + max(0, best arm of a child)`, the `0` meaning "stop here rather than extend into a negative arm".

Best arms are a post-order quantity: a node's best arm depends on its children's best arms. So one post-order traversal computes every arm once and, at each node, tries that node as the bend. This is the same return-one-thing-record-another shape as [Diameter](/practice/diameter-binary-tree), with sums in place of edge counts and the extra twist that arms are clamped at zero.

### The optimal approach

```python
def max_path_sum(root: TreeNode | None) -> int:
    best = float("-inf")

    def arm(node: TreeNode | None) -> int:
        nonlocal best
        if node is None:
            return 0
        left = max(0, arm(node.left))     # a negative arm is worth less than no arm
        right = max(0, arm(node.right))
        best = max(best, left + node.val + right)   # node as the bend point
        return node.val + max(left, right)          # best single arm for the parent

    arm(root)
    return best
```

Trace on `[-10, 9, 20, null, null, 15, 7]`: leaves 9, 15, 7 return arms 9, 15, 7 and set `best` to at most 15. Node 20: `left = 15, right = 7`, candidate `42`, returns `35`. Node -10: `left = 9, right = 35`, candidate `34`, returns `25`. `best = 42`.

Time `O(n)`, space `O(h)`.

Why `best` starts at `-inf` and not `0`: with all-negative trees the answer is negative, and a `0` initial value would be wrong. The clamping to `0` applies to *arms*, not to the bend candidate, which always includes `node.val`.

### Common mistakes

- Returning `left + node.val + right` from the recursion. A parent cannot extend a two-armed path; it can only extend a single arm.
- Clamping `best` at 0, or initialising it to 0, which breaks all-negative trees.
- Forgetting to clamp the arms, so a `-100` leaf drags a good path down instead of being excluded.
- Only considering paths through the root, or only leaf-to-leaf paths (the problem allows any node to be an endpoint).

### How to discuss it

Say "bend point; two clamped arms plus the node; post-order; return one arm, record the two-arm best." Interviewers listen for whether you distinguish what the recursion *returns* from what it *records*. For the path-reconstruction follow-up: record the bend node when `best` improves, and also store for each node which child its best arm came from (or `None`); then rebuild by walking down from the bend along the recorded choices on each side. For the leaf-to-leaf variant: arms may no longer be clamped to zero (an arm must reach a leaf), a bend candidate is only valid when the node has two children, and a leaf's arm is its value; the all-negative case then genuinely requires including negative nodes.
