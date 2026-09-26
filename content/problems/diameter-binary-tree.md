---
slug: diameter-binary-tree
title: Diameter of Binary Tree
difficulty: easy
patterns: [tree-dfs]
lists: [ascend-150]
companies: [meta, amazon, google, microsoft]
order: 3
lesson: interview-patterns/tree-and-graph-patterns/tree-dfs
hints:
  - "The longest path in the tree bends at exactly one node, its highest point. At that node its length is left-height plus right-height."
  - "So compute the height of every node once, and at each node also evaluate left-height plus right-height as a candidate answer. The best candidate over all nodes is the diameter."
  - "The recursive function should return height (what the parent needs) and update a shared best-so-far (what the answer needs). Do not return the diameter from the recursion."
signatures:
  python:
    name: diameter_of_binary_tree
    starter: |
      def diameter_of_binary_tree(root: TreeNode | None) -> int:
          pass
  javascript:
    name: diameter_of_binary_tree
    starter: |
      function diameter_of_binary_tree(root) {
      }
tests:
  - args: [{"$tree": [1, 2, 3, 4, 5]}]
    expected: 3
  - args: [{"$tree": [1, 2]}]
    expected: 1
  - args: [{"$tree": [1]}]
    expected: 0
    label: single node
  - args: [{"$tree": []}]
    expected: 0
    label: empty tree
  - args: [{"$tree": [1, 2, 3, 4, 5, 6, 7]}]
    expected: 4
    label: full tree, path through the root
  - args: [{"$tree": [1, 2, null, 3, null, 4]}]
    expected: 3
    hidden: true
    label: chain
  - args: [{"$tree": [1, 2, null, 3, 4, 5, null, 6, null, 7]}]
    expected: 5
    hidden: true
    label: longest path does not pass through the root
time_limit_ms: 4000
---
The **diameter** of a binary tree is the number of edges on the longest path between any two nodes. The path may or may not pass through the root. Given the root, return the diameter.

### Examples

| Input | Output | Why |
|---|---|---|
| `[1, 2, 3, 4, 5]` | `3` | `4 → 2 → 1 → 3` has three edges |
| `[1, 2]` | `1` | One edge |
| `[1]` | `0` | A single node has no edges |

### Constraints

- `0 ≤ number of nodes ≤ 10⁴`
- `-100 ≤ node.val ≤ 100`

### Follow-up

The interviewer asks: "Now edges have positive weights. What changes?" Then: "The tree is unrooted, given as an adjacency list. Find the diameter without recursion on the root."

## Solution

### The naive approach

For every node, compute the height of its left and right subtrees and add them. Height is `O(subtree size)`, so doing it fresh at every node is `O(n · h)`, `O(n²)` on a chain. The structure is right; the waste is recomputing heights the recursion already visited.

### The insight

Every path has a unique topmost node where it "bends". At that node the path goes down the left as deep as possible and down the right as deep as possible, so its length is `height(left) + height(right)`. The diameter is the maximum of that quantity over all nodes. Heights are computed bottom-up anyway, so one post-order pass can compute each node's height *and* try it as the bend point.

The general shape, which recurs in [Max Path Sum](/practice/max-path-sum) and [Balanced Binary Tree](/practice/balanced-binary-tree), is: the recursion returns the value the parent needs (height, a single downward arm) while a side channel records the value the problem needs (the best two-armed path).

### The optimal approach

Write `height(node)` that returns `0` for `None`, otherwise computes `l = height(left)`, `r = height(right)`, updates `best = max(best, l + r)`, and returns `1 + max(l, r)`.

Trace on `[1, 2, 3, 4, 5]`: leaves 4, 5, 3 have height 1 and candidate 0. Node 2: `l = 1, r = 1`, candidate 2, height 2. Node 1: `l = 2, r = 1`, candidate 3, height 3. Answer 3.

```python
def diameter_of_binary_tree(root: TreeNode | None) -> int:
    best = 0

    def height(node: TreeNode | None) -> int:
        nonlocal best
        if node is None:
            return 0
        l = height(node.left)
        r = height(node.right)
        best = max(best, l + r)
        return 1 + max(l, r)

    height(root)
    return best
```

Time `O(n)`, one visit per node. Space `O(h)` for recursion.

### Common mistakes

- Returning `l + r` from the recursion instead of `1 + max(l, r)`, which feeds a two-armed path length to the parent as though it were a single arm.
- Only considering paths through the root: `height(root.left) + height(root.right)`. The hidden test with a deep left subtree catches it.
- Counting nodes instead of edges (off by one). The problem says edges; `[1]` is 0.

### How to discuss it

Say "longest path bends at one node; at that node it is left height plus right height; compute heights post-order and track the best." Name the return-one-thing-record-another pattern explicitly, because it is what the harder tree problems reuse. For weighted edges, `height` becomes the maximum weighted downward path and the candidate is `l + r` with each arm including its edge weight; the algorithm is unchanged. For an unrooted tree, either root it arbitrarily and run the same DFS, or use the two-BFS trick: BFS from any node to find the farthest node `u`, then BFS from `u`; the farthest distance from `u` is the diameter.
