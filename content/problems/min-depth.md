---
slug: min-depth
title: Minimum Depth of Binary Tree
difficulty: easy
patterns: [tree-bfs]
lists: [ascend-150]
companies: [amazon, google, microsoft, meta]
order: 4
lesson: interview-patterns/tree-and-graph-patterns/tree-bfs
hints:
  - "Minimum depth is measured to the nearest *leaf*. A node with one child is not a leaf, so `1 + min(left, right)` is wrong when one side is empty."
  - "Breadth-first search finds the shallowest leaf first. Stop the moment you dequeue a node with no children."
  - "If you recurse instead, treat a missing child as 'no path' rather than as depth 0."
signatures:
  python:
    name: min_depth
    starter: |
      def min_depth(root: TreeNode | None) -> int:
          pass
  javascript:
    name: min_depth
    starter: |
      function min_depth(root) {
      }
tests:
  - args: [{"$tree": [3, 9, 20, null, null, 15, 7]}]
    expected: 2
  - args: [{"$tree": [2, null, 3, null, 4, null, 5, null, 6]}]
    expected: 5
    label: right chain, the only leaf is at the bottom
  - args: [{"$tree": []}]
    expected: 0
    label: empty tree
  - args: [{"$tree": [1]}]
    expected: 1
    label: root is a leaf
  - args: [{"$tree": [1, 2]}]
    expected: 2
    label: root has one child, so it is not a leaf
  - args: [{"$tree": [1, 2, 3, 4, 5]}]
    expected: 2
    hidden: true
    label: leaf 3 is shallower than 4 and 5
  - args: [{"$tree": [1, 2, null, 3, null, 4]}]
    expected: 4
    hidden: true
  - args: [{"$tree": [1, 2, 3, 4, 5, 6, 7, 8, 9]}]
    expected: 3
    hidden: true
time_limit_ms: 4000
---
Given the root of a binary tree, return its minimum depth: the number of nodes on the shortest path from the root down to the nearest **leaf**. A leaf is a node with no children. The empty tree has depth 0.

### Examples

| Input | Output | Why |
|---|---|---|
| `[3, 9, 20, null, null, 15, 7]` | `2` | `3 → 9`; 9 is a leaf |
| `[1, 2]` | `2` | 1 has a child, so it is not a leaf; the nearest leaf is 2 |
| `[2, null, 3, null, 4, null, 5, null, 6]` | `5` | The only leaf is at the bottom of the chain |

### Constraints

- `0 ≤ number of nodes ≤ 10⁵`
- `-1000 ≤ node.val ≤ 1000`

### Follow-up

The interviewer asks: "Compare the work done by BFS and DFS on a tree with a shallow leaf near the root and a huge subtree elsewhere." Then: "Where does the same 'nearest target' reasoning apply outside trees?"

## Solution

### The naive approach

Copy the maximum-depth solution and swap `max` for `min`: `1 + min(depth(left), depth(right))`. It returns 1 for `[1, 2]`, because the missing right child contributes 0 and `min(1, 0) = 0`. The bug is that a missing child is not a leaf; it is the absence of a path. This is the most common wrong answer, and interviewers ask the question to see whether you notice.

### The insight

"Nearest leaf" is a shortest-path question, and shortest paths in unweighted graphs are what BFS is for. Level-order traversal visits nodes in increasing depth, so the first leaf you dequeue is at the minimum depth, and you can return immediately without touching the rest of the tree. That early exit is a real advantage: a tree with a leaf at depth 2 and a million nodes hanging off the other side costs BFS a handful of operations and costs DFS a full traversal.

### The optimal approach

BFS with a depth counter per level; return when the first childless node is dequeued.

```python
from collections import deque

def min_depth(root: TreeNode | None) -> int:
    if root is None:
        return 0
    queue = deque([root])
    depth = 1
    while queue:
        for _ in range(len(queue)):
            node = queue.popleft()
            if node.left is None and node.right is None:
                return depth
            if node.left is not None:
                queue.append(node.left)
            if node.right is not None:
                queue.append(node.right)
        depth += 1
    return depth  # unreachable: every non-empty tree has a leaf
```

Time `O(n)` worst case (a chain forces a full traversal), often far less. Space `O(w)`.

The correct DFS, for comparison, treats a single missing child as infinite:

```python
def min_depth_dfs(root):
    if root is None:
        return 0
    if root.left is None:
        return 1 + min_depth_dfs(root.right)
    if root.right is None:
        return 1 + min_depth_dfs(root.left)
    return 1 + min(min_depth_dfs(root.left), min_depth_dfs(root.right))
```

Also `O(n)`, `O(h)` stack, and no early exit.

### Common mistakes

- `1 + min(left, right)` with 0 for a missing child.
- Returning `depth` when a `None` is dequeued, which counts absent children as leaves.
- Incrementing `depth` inside the inner loop so it counts nodes rather than levels.

### How to discuss it

Lead with the `[1, 2]` counterexample to the naive recursion; it is the point of the question. Then say "nearest leaf is a shortest path, so BFS with early exit" and compare with the fixed DFS. For the follow-ups: BFS wins whenever the target is shallow relative to the tree's size, which is exactly when a full DFS is wasteful; and the same reasoning gives you shortest paths in grids (rotting oranges, walls and gates), fewest hops in social graphs, and the minimum number of edits in word-ladder-style problems, all of which are BFS from the source with the first hit being optimal because every edge has the same cost.
