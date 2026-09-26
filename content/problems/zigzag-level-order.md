---
slug: zigzag-level-order
title: Binary Tree Zigzag Level Order Traversal
difficulty: medium
patterns: [tree-bfs]
lists: [ascend-150]
companies: [amazon, microsoft, meta, linkedin]
order: 3
lesson: interview-patterns/tree-and-graph-patterns/tree-bfs
hints:
  - "This is plain level-order traversal with every odd-numbered level reversed. Do not change how nodes are enqueued; change how the level list is assembled."
  - "Keep a boolean that flips each level. When it says reverse, either reverse the finished level list or fill a deque from the left."
  - "Reversing the *children order* in the queue is a common attempt that breaks after two levels. Keep the queue in true level order."
signatures:
  python:
    name: zigzag_level_order
    starter: |
      def zigzag_level_order(root: TreeNode | None) -> list[list[int]]:
          pass
  javascript:
    name: zigzag_level_order
    starter: |
      function zigzag_level_order(root) {
      }
tests:
  - args: [{"$tree": [3, 9, 20, null, null, 15, 7]}]
    expected: [[3], [20, 9], [15, 7]]
  - args: [{"$tree": [1]}]
    expected: [[1]]
    label: single node
  - args: [{"$tree": []}]
    expected: []
    label: empty tree
  - args: [{"$tree": [1, 2, 3, 4, 5, 6, 7]}]
    expected: [[1], [3, 2], [4, 5, 6, 7]]
  - args: [{"$tree": [1, 2, 3, 4, null, null, 5, 6, null, null, 7]}]
    expected: [[1], [3, 2], [4, 5], [7, 6]]
    hidden: true
    label: four levels with gaps
  - args: [{"$tree": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]}]
    expected: [[1], [3, 2], [4, 5, 6, 7], [15, 14, 13, 12, 11, 10, 9, 8]]
    hidden: true
time_limit_ms: 4000
---
Given the root of a binary tree, return its level order traversal with alternating direction: the first level left to right, the second right to left, the third left to right, and so on.

### Examples

| Input | Output | Why |
|---|---|---|
| `[3, 9, 20, null, null, 15, 7]` | `[[3], [20, 9], [15, 7]]` | Level 1 is reversed, level 2 is not |
| `[1, 2, 3, 4, 5, 6, 7]` | `[[1], [3, 2], [4, 5, 6, 7]]` | |
| `[]` | `[]` | |

### Constraints

- `0 ≤ number of nodes ≤ 2000`
- `-100 ≤ node.val ≤ 100`

### Follow-up

The interviewer asks: "Do it without reversing any list, using a deque per level and appending on the correct side. What does that buy you, and is it worth it?"

## Solution

### The naive approach

Do a normal [level order traversal](/practice/level-order-traversal), then reverse every odd-indexed level. Two passes over the output, `O(n)` total, and honestly fine. The interviewer wants to see that you recognise it as level order plus a cosmetic transformation, and that you do not try to be clever with the queue.

### The insight

The zigzag is a property of the *output*, not of the traversal. The queue must stay in true left-to-right level order, because each level's children order depends on it. Only the way you *assemble* each level's list alternates. A flag toggled once per level decides whether the level list is built left-to-right or right-to-left.

### The optimal approach

Standard BFS with level boundaries. Collect each level into a `deque`: when the flag says left-to-right, `append`; when right-to-left, `appendleft`. Toggle after each level.

```python
from collections import deque

def zigzag_level_order(root: TreeNode | None) -> list[list[int]]:
    if root is None:
        return []
    result: list[list[int]] = []
    queue = deque([root])
    left_to_right = True
    while queue:
        level: deque[int] = deque()
        for _ in range(len(queue)):
            node = queue.popleft()
            if left_to_right:
                level.append(node.val)
            else:
                level.appendleft(node.val)
            if node.left is not None:
                queue.append(node.left)
            if node.right is not None:
                queue.append(node.right)
        result.append(list(level))
        left_to_right = not left_to_right
    return result
```

Time `O(n)`, space `O(w)`.

Trace on `[1, 2, 3, 4, 5, 6, 7]`: level 0, flag true, `[1]`. Level 1, flag false: pop 2, `appendleft` → `[2]`; pop 3, `appendleft` → `[3, 2]`. Children enqueued in order 4, 5, 6, 7. Level 2, flag true: `[4, 5, 6, 7]`.

### Common mistakes

- Enqueuing children right-to-left on alternate levels. It looks right for two levels and then scrambles the third, because the grandchildren are now enqueued from a reversed parent order.
- Using a stack-per-level scheme and getting the child push order wrong. It can be made to work (push left then right on one parity, right then left on the other) but it is fragile and hard to explain under pressure.
- Forgetting to toggle the flag, or toggling it inside the inner loop.

### How to discuss it

Say "level order; the queue is unchanged; only the direction of assembly alternates." Interviewers ask this question specifically to see whether you keep the traversal invariant and push complexity to the output. For the follow-up: the deque-per-level approach avoids the `O(level width)` reversal, but reversing a level is already `O(width)` and the level had to be built at that cost anyway, so the asymptotics are identical and the difference is a constant factor; it is worth it only as a demonstration that you know `deque.appendleft` is `O(1)` where `list.insert(0, x)` is `O(n)`.
