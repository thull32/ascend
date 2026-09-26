---
slug: max-depth-binary-tree
title: Maximum Depth of Binary Tree
difficulty: easy
patterns: [tree-dfs]
lists: [core-75, ascend-150]
companies: [amazon, microsoft, google, linkedin]
order: 2
lesson: interview-patterns/tree-and-graph-patterns/tree-dfs
hints:
  - "The depth of a tree is one more than the depth of its deeper subtree. The depth of an empty tree is zero."
  - "That is a post-order computation: you need both children's answers before you can answer for the parent."
  - "For the iterative version, breadth-first traversal counts levels directly; the number of levels processed is the depth."
signatures:
  python:
    name: max_depth
    starter: |
      def max_depth(root: TreeNode | None) -> int:
          pass
  javascript:
    name: max_depth
    starter: |
      function max_depth(root) {
      }
tests:
  - args: [{"$tree": [3, 9, 20, null, null, 15, 7]}]
    expected: 3
  - args: [{"$tree": [1, null, 2]}]
    expected: 2
  - args: [{"$tree": []}]
    expected: 0
    label: empty tree
  - args: [{"$tree": [1]}]
    expected: 1
    label: single node
  - args: [{"$tree": [1, 2, 3, null, null, 4, null, null, 5]}]
    expected: 4
  - args: [{"$tree": [1, 2, 3, 4, 5, 6, 7, 8]}]
    expected: 4
    hidden: true
  - args: [{"$tree": [1, 2, null, 3, null, 4, null, 5]}]
    expected: 5
    hidden: true
    label: left-leaning chain
time_limit_ms: 4000
---
Given the root of a binary tree, return its maximum depth: the number of nodes on the longest path from the root down to a leaf. An empty tree has depth 0; a single node has depth 1.

### Examples

| Input | Output | Why |
|---|---|---|
| `[3, 9, 20, null, null, 15, 7]` | `3` | `3 → 20 → 15` (or `→ 7`) |
| `[1, null, 2]` | `2` | `1 → 2` |
| `[]` | `0` | No nodes |

### Constraints

- `0 ≤ number of nodes ≤ 10⁴`
- `-100 ≤ node.val ≤ 100`

### Follow-up

The interviewer asks: "Your recursion is bounded by the height. What happens on a 10⁴-node chain in Python, and how do you fix it?" Then: "How would you compute depth if the tree were stored as a parent-pointer array in a database rather than as linked nodes?"

## Solution

### The naive approach

There is no slower correct approach worth writing; this problem exists to check that you can express a recursive definition cleanly and know its space cost.

### The insight

Depth is defined recursively: `depth(None) = 0`, and `depth(node) = 1 + max(depth(left), depth(right))`. That definition is already the algorithm. It is a **post-order** computation: the parent's value depends on the children's, so children are evaluated first and results flow upwards.

### The optimal approach

```python
def max_depth(root: TreeNode | None) -> int:
    if root is None:
        return 0
    return 1 + max(max_depth(root.left), max_depth(root.right))
```

Time `O(n)`: every node is visited once. Space `O(h)` on the call stack, which is `O(log n)` for a balanced tree and `O(n)` for a degenerate chain.

The iterative alternative is level-order traversal with a queue, counting how many levels you process:

```python
from collections import deque

def max_depth_bfs(root):
    if root is None:
        return 0
    depth = 0
    queue = deque([root])
    while queue:
        depth += 1
        for _ in range(len(queue)):
            node = queue.popleft()
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
    return depth
```

Same `O(n)` time; space is `O(w)` for the widest level, which is up to `n / 2` for a complete tree. Neither version is universally better: DFS uses memory proportional to height, BFS to width.

### Common mistakes

- Returning `max(left, right)` without the `+ 1`, or defining a leaf as depth 0 when the problem counts nodes.
- Confusing depth with *height*: the same number for the whole tree, but height is measured from a node down while depth is measured from the root; the follow-up questions in [Balanced Binary Tree](/practice/balanced-binary-tree) and [Diameter](/practice/diameter-binary-tree) use height per node.
- Treating the recursion as free. Python's default limit is about 1000 frames; the `10⁴`-node chain in the constraints will raise `RecursionError`.

### How to discuss it

Give the recurrence in one line and the code in three. Then volunteer the space analysis and the stack-depth risk, and offer the BFS version as the fix; that is the whole senior signal on this question. For the parent-pointer follow-up: with `parent_id` rows and no child pointers, depth is computed by walking up from each node (`O(n · h)` naively) or by a recursive CTE that descends from the root level by level, and if the query runs often you materialise the depth as a column and maintain it on insert.
