---
slug: right-side-view
title: Binary Tree Right Side View
difficulty: medium
patterns: [tree-bfs]
lists: [ascend-150]
companies: [meta, amazon, microsoft, bloomberg]
order: 2
lesson: interview-patterns/tree-and-graph-patterns/tree-bfs
hints:
  - "Standing to the right of the tree, you see the rightmost node of each level, whether or not it is a right child."
  - "Level-order traversal gives you each level; take the last element of each."
  - "For a DFS version, visit right before left and record the first node you reach at each new depth."
signatures:
  python:
    name: right_side_view
    starter: |
      def right_side_view(root: TreeNode | None) -> list[int]:
          pass
  javascript:
    name: right_side_view
    starter: |
      function right_side_view(root) {
      }
tests:
  - args: [{"$tree": [1, 2, 3, null, 5, null, 4]}]
    expected: [1, 3, 4]
  - args: [{"$tree": [1, null, 3]}]
    expected: [1, 3]
  - args: [{"$tree": []}]
    expected: []
    label: empty tree
  - args: [{"$tree": [1, 2, 3, 4]}]
    expected: [1, 3, 4]
    label: a left child is visible when the right side is shorter
  - args: [{"$tree": [1, 2, 3, 4, 5, 6, 7]}]
    expected: [1, 3, 7]
  - args: [{"$tree": [1, 2, 3, 4, null, null, null, 5]}]
    expected: [1, 3, 4, 5]
    hidden: true
    label: deep left branch peeks out below the right subtree
  - args: [{"$tree": [1, 2, null, 3, null, 4]}]
    expected: [1, 2, 3, 4]
    hidden: true
    label: left chain, every node visible
time_limit_ms: 4000
---
Imagine standing to the right of a binary tree and looking at it side-on. Return the values of the nodes you can see, ordered from top to bottom. At each depth you see exactly one node: the rightmost one that exists at that depth.

### Examples

| Input | Output | Why |
|---|---|---|
| `[1, 2, 3, null, 5, null, 4]` | `[1, 3, 4]` | 5 is hidden behind 4 |
| `[1, 2, 3, 4]` | `[1, 3, 4]` | Depth 2 has only node 4 (a left child), so it is visible |
| `[1, 2, null, 3, null, 4]` | `[1, 2, 3, 4]` | A left-only chain: every node is the rightmost at its depth |

### Constraints

- `0 ≤ number of nodes ≤ 100`
- `-100 ≤ node.val ≤ 100`

### Follow-up

The interviewer asks: "Left side view, and then the *top* view. Which of those is still a one-line change?"

## Solution

### The naive approach

Follow right pointers from the root until you run out. This is the trap: it returns `[1, 3]` for `[1, 2, 3, 4]`, missing the 4 that sits below the right subtree's reach. The visible node at a depth is the rightmost node *at that depth*, which may be deep inside the left subtree when the right subtree is shorter.

### The insight

"Rightmost at each depth" is a per-level question, and per-level questions are level-order traversal. Traverse level by level and keep the last node of each level. Equivalently, do a DFS that visits the right child before the left child; the first time you reach any given depth, the node you are on is the rightmost one at that depth, because every node further right (if any) would have been visited first.

### The optimal approach

BFS with level boundaries, recording the last value popped in each round:

```python
from collections import deque

def right_side_view(root: TreeNode | None) -> list[int]:
    if root is None:
        return []
    view: list[int] = []
    queue = deque([root])
    while queue:
        size = len(queue)
        for i in range(size):
            node = queue.popleft()
            if i == size - 1:
                view.append(node.val)
            if node.left is not None:
                queue.append(node.left)
            if node.right is not None:
                queue.append(node.right)
    return view
```

Time `O(n)`, space `O(w)` for the widest level.

The DFS version is shorter and uses `O(h)` space:

```python
def right_side_view_dfs(root):
    view = []

    def dfs(node, depth):
        if node is None:
            return
        if depth == len(view):     # first arrival at this depth
            view.append(node.val)
        dfs(node.right, depth + 1)  # right first
        dfs(node.left, depth + 1)

    dfs(root, 0)
    return view
```

Trace the DFS on `[1, 2, 3, 4]`: depth 0 sees 1. Go right to 3 at depth 1, first arrival, record 3. 3 has no children. Back to 1, go left to 2 at depth 1: `len(view)` is 2, not first arrival, skip. 2's right is `None`; its left is 4 at depth 2, first arrival, record 4. Result `[1, 3, 4]`.

### Common mistakes

- Following only right pointers.
- In the DFS version, visiting left before right and thereby recording the leftmost node.
- In the BFS version, appending `node.val` for every node and then trying to fix it afterwards; the `i == size - 1` check is the whole idea.

### How to discuss it

Give the counterexample to "follow right pointers" first; it shows you understand what the question is asking. Then choose BFS or DFS and state the other. For the follow-up: left side view is a one-line change in either version (first node per level, or left-before-right DFS). Top view is different: it is indexed by horizontal *column*, not depth, so you need a BFS that tracks each node's column offset (`root = 0`, left `-1`, right `+1`) and records the first node seen per column; the level-order structure survives but the key changes. Recognising that "view" problems are "first node per some key" is what makes the variants mechanical.
