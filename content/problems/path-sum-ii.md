---
slug: path-sum-ii
title: Path Sum II
difficulty: medium
patterns: [tree-dfs]
lists: [ascend-150]
companies: [amazon, microsoft, meta, bloomberg]
order: 12
lesson: interview-patterns/tree-and-graph-patterns/tree-dfs
hints:
  - "Depth-first search carrying the path so far. At a leaf, check whether the running sum equals the target and, if so, copy the path into the results."
  - "Push the node before recursing and pop it after; the same list serves every path, which is O(h) memory instead of a new list per node."
  - "Only leaves count as endpoints. A node whose running sum equals the target but which has children is not a match; keep going, values may be negative."
signatures:
  python:
    name: path_sum
    starter: |
      def path_sum(root: TreeNode | None, target: int) -> list[list[int]]:
          pass
  javascript:
    name: path_sum
    starter: |
      function path_sum(root, target) {
      }
tests:
  - args: [{"$tree": [5, 4, 8, 11, null, 13, 4, 7, 2, null, null, 5, 1]}, 22]
    expected: [[5, 4, 11, 2], [5, 8, 4, 5]]
    any_order: true
  - args: [{"$tree": [1, 2, 3]}, 5]
    expected: []
    label: no path matches
  - args: [{"$tree": [1, 2]}, 1]
    expected: []
    label: root alone sums to target but is not a leaf
  - args: [{"$tree": []}, 0]
    expected: []
    label: empty tree
  - args: [{"$tree": [1]}, 1]
    expected: [[1]]
    label: single node is a leaf
  - args: [{"$tree": [1, -2, -3, 1, 3, -2, null, -1]}, -1]
    expected: [[1, -2, 1, -1]]
    hidden: true
    label: negative values
  - args: [{"$tree": [2, 1, 1, null, null, 1, 1]}, 4]
    expected: [[2, 1, 1], [2, 1, 1]]
    any_order: true
    hidden: true
    label: two distinct paths with identical values
  - args: [{"$tree": [0, 1, 1]}, 1]
    expected: [[0, 1], [0, 1]]
    any_order: true
    hidden: true
time_limit_ms: 4000
---
Given the root of a binary tree and an integer `target`, return every **root-to-leaf** path whose node values sum to `target`. Each path is a list of values from the root down to the leaf. Paths may be returned in any order. A leaf is a node with no children.

### Examples

| Input | Output | Why |
|---|---|---|
| `[5, 4, 8, 11, null, 13, 4, 7, 2, null, null, 5, 1]`, `target = 22` | `[[5, 4, 11, 2], [5, 8, 4, 5]]` | Two root-to-leaf paths sum to 22 |
| `[1, 2]`, `target = 1` | `[]` | `1` alone sums to 1 but is not a leaf |
| `[1]`, `target = 1` | `[[1]]` | A lone root is a leaf |

### Constraints

- `0 ≤ number of nodes ≤ 5000`
- `-1000 ≤ node.val, target ≤ 1000`

### Follow-up

The interviewer asks: "Now count paths that sum to the target where the path can start and end anywhere, as long as it goes downwards. Can you do it in one pass?"

## Solution

### The naive approach

Recurse, passing a *copy* of the current path to each child: `path + [node.val]`. It is correct and short, but each call allocates a new list of length equal to the depth, so total allocation is `O(n · h)`, `O(n²)` on a chain. Fine for the constraints here; a reviewer will still ask why you copied.

### The insight

The path to the current node is exactly the recursion stack. Maintain one shared list: append on entry, pop on exit, and only copy it when you have found a match. This is standard backtracking, and the invariant (the list always equals the root-to-current-node path) is what makes the pop safe. Because values can be negative, you cannot prune when the running sum exceeds the target; a later negative value could bring it back.

### The optimal approach

```python
def path_sum(root: TreeNode | None, target: int) -> list[list[int]]:
    results: list[list[int]] = []
    path: list[int] = []

    def dfs(node: TreeNode | None, remaining: int) -> None:
        if node is None:
            return
        path.append(node.val)
        remaining -= node.val
        if node.left is None and node.right is None:
            if remaining == 0:
                results.append(path.copy())
        else:
            dfs(node.left, remaining)
            dfs(node.right, remaining)
        path.pop()

    dfs(root, target)
    return results
```

Time `O(n)` to visit every node, plus `O(h)` per matching path to copy it; worst case `O(n · h)` if many paths match, which is inherent to the output size. Space `O(h)` for the recursion and the shared path, excluding the output.

Trace on `[1, -2, -3, 1, 3, -2, null, -1]`, `target = -1`: path `1, -2, 1, -1` has sum `-1` at a leaf, matched. Path `1, -2, 3` sums to 2. Path `1, -3, -2` sums to -4. One result.

### Common mistakes

- Appending `path` itself (not a copy) to results, so every result later mutates into the empty list.
- Treating any node whose running sum matches as a hit; only leaves count.
- Pruning on `remaining < 0`, which is wrong with negative values.
- Forgetting the `pop`, or popping only on the non-leaf branch, which corrupts the path for siblings.

### How to discuss it

Say "DFS with backtracking; the recursion stack is the path; copy only on a hit." Mention explicitly that negative values forbid the obvious pruning. The follow-up is the prefix-sum-on-a-tree trick: carry the running sum from the root and a hash map of how many ancestors had each running sum; at each node, the number of downward paths ending here with sum `target` is `count[running - target]`; increment `count[running]` before recursing and decrement after, so the map only ever describes the current root-to-node path. That is `O(n)` time and `O(h)` space, and it is the same idea as [Subarray Sum Equals K](/practice/subarray-sum-equals-k) lifted onto a tree.
