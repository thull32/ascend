---
slug: level-order-traversal
title: Binary Tree Level Order Traversal
difficulty: medium
patterns: [tree-bfs]
lists: [core-75, ascend-150]
companies: [amazon, microsoft, meta, linkedin]
order: 1
lesson: interview-patterns/tree-and-graph-patterns/tree-bfs
hints:
  - "A queue visits nodes in breadth-first order, but a plain BFS loop does not tell you where one level ends and the next begins."
  - "Record the queue length at the start of each round; exactly that many nodes belong to the current level. Process them, enqueue their children, repeat."
  - "Use a deque or an index pointer. Popping from the front of a Python list is O(n) per pop."
signatures:
  python:
    name: level_order
    starter: |
      def level_order(root: TreeNode | None) -> list[list[int]]:
          pass
  javascript:
    name: level_order
    starter: |
      function level_order(root) {
      }
tests:
  - args: [{"$tree": [3, 9, 20, null, null, 15, 7]}]
    expected: [[3], [9, 20], [15, 7]]
  - args: [{"$tree": [1]}]
    expected: [[1]]
    label: single node
  - args: [{"$tree": []}]
    expected: []
    label: empty tree
  - args: [{"$tree": [1, 2, 3, 4, 5, 6, 7]}]
    expected: [[1], [2, 3], [4, 5, 6, 7]]
  - args: [{"$tree": [1, null, 2, null, 3]}]
    expected: [[1], [2], [3]]
    hidden: true
    label: chain
  - args: [{"$tree": [1, 2, 3, null, 4, null, 5]}]
    expected: [[1], [2, 3], [4, 5]]
    hidden: true
    label: gaps inside a level
time_limit_ms: 4000
---
Given the root of a binary tree, return its **level order traversal**: a list of levels, each level being the list of node values at that depth from left to right. The root is level 0.

### Examples

| Input | Output | Why |
|---|---|---|
| `[3, 9, 20, null, null, 15, 7]` | `[[3], [9, 20], [15, 7]]` | Three levels |
| `[1, null, 2, null, 3]` | `[[1], [2], [3]]` | One node per level |
| `[]` | `[]` | No levels |

### Constraints

- `0 ≤ number of nodes ≤ 2000`
- `-1000 ≤ node.val ≤ 1000`

### Follow-up

The interviewer asks: "Do it with DFS instead. Which one uses more memory, and on what kind of tree?" Then: "What if the tree is a million nodes wide at one level and you only need the *last* level?"

## Solution

### The naive approach

Compute the depth of every node with a DFS, bucket values by depth in a dictionary, and emit the buckets in key order. `O(n)` time, and it works, but it separates the traversal from the grouping and needs an extra pass and a sort (or a max-depth scan) to emit levels in order. A queue does both at once.

### The insight

Breadth-first search visits nodes in exactly level order, because a node's children are enqueued after everything already on the queue, which is at most one level deeper. The only missing piece is *level boundaries*. At the moment you start a round, the queue holds exactly the current level and nothing else, so its length is the number of nodes to process before the next level begins.

### The optimal approach

Use a `deque`. While it is non-empty: read `len(queue)`, pop that many nodes into a new level list, enqueuing each node's children as you go, then append the level to the result.

Trace on `[3, 9, 20, null, null, 15, 7]`: queue `[3]`, size 1, pop 3, push 9, 20, level `[3]`. Queue `[9, 20]`, size 2, pop both, push 15, 7, level `[9, 20]`. Queue `[15, 7]`, size 2, no children, level `[15, 7]`. Done.

```python
from collections import deque

def level_order(root: TreeNode | None) -> list[list[int]]:
    if root is None:
        return []
    result: list[list[int]] = []
    queue = deque([root])
    while queue:
        level: list[int] = []
        for _ in range(len(queue)):        # exactly the current level
            node = queue.popleft()
            level.append(node.val)
            if node.left is not None:
                queue.append(node.left)
            if node.right is not None:
                queue.append(node.right)
        result.append(level)
    return result
```

Time `O(n)`: each node is enqueued and dequeued once. Space `O(w)` for the queue where `w` is the maximum width, up to `n / 2` for a complete tree, plus the output.

The DFS alternative passes the depth as a parameter and appends `node.val` to `result[depth]`, creating the level list when first reached. Also `O(n)`, with `O(h)` stack instead of `O(w)` queue. Pre-order with left before right preserves left-to-right order within each level.

### Common mistakes

- Using `list.pop(0)`, which is `O(n)` per pop and makes the traversal quadratic on wide trees.
- Reading `len(queue)` inside the inner loop, so the bound changes as children are added and levels bleed into each other.
- Enqueuing `None` children and then having to filter them, which works but doubles queue traffic and invites null dereferences.

### How to discuss it

This is the template for every BFS-on-a-tree problem ([Right Side View](/practice/right-side-view), [Zigzag](/practice/zigzag-level-order), [Minimum Depth](/practice/min-depth)), so state the "snapshot the queue length" trick clearly. Answer the memory follow-up with the width-versus-height contrast: BFS is `O(w)`, DFS is `O(h)`; on a balanced tree width dominates (`n / 2` versus `log n`), on a chain height does. For the last-level-only follow-up, you do not need to store all levels: keep only the current level, and if even one level is too big to hold, you are effectively streaming and need to think about whether you can process the level incrementally (a generator over BFS) rather than materialising it.
