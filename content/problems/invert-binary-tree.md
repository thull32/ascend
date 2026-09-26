---
slug: invert-binary-tree
title: Invert Binary Tree
difficulty: easy
patterns: [tree-dfs]
lists: [core-75, ascend-150]
companies: [google, amazon, microsoft, meta]
order: 1
lesson: interview-patterns/tree-and-graph-patterns/tree-dfs
hints:
  - "Mirroring a tree means every node's left and right children swap places, all the way down. A swap at one node plus the same operation on each child is the whole algorithm."
  - "Swap first, then recurse into the (new) left and right; or recurse first and then swap. Both work, but do not swap and then recurse into the *old* left twice."
  - "Recursion depth equals tree height. If the interviewer asks about a deep, skewed tree, switch to an explicit stack or queue."
signatures:
  python:
    name: invert_tree
    starter: |
      def invert_tree(root: TreeNode | None) -> TreeNode | None:
          pass
  javascript:
    name: invert_tree
    starter: |
      function invert_tree(root) {
      }
tests:
  - args: [{"$tree": [4, 2, 7, 1, 3, 6, 9]}]
    expected: {"$tree": [4, 7, 2, 9, 6, 3, 1]}
  - args: [{"$tree": [2, 1, 3]}]
    expected: {"$tree": [2, 3, 1]}
  - args: [{"$tree": []}]
    expected: null
    label: empty tree
  - args: [{"$tree": [1]}]
    expected: {"$tree": [1]}
    label: single node
  - args: [{"$tree": [1, 2]}]
    expected: {"$tree": [1, null, 2]}
    hidden: true
    label: only a left child
  - args: [{"$tree": [1, null, 2, null, 3]}]
    expected: {"$tree": [1, 2, null, 3]}
    hidden: true
    label: right-leaning chain becomes left-leaning
  - args: [{"$tree": [1, 2, 3, 4, null, null, 5]}]
    expected: {"$tree": [1, 3, 2, 5, null, null, 4]}
    hidden: true
time_limit_ms: 4000
---
Given the root of a binary tree, produce its mirror image: for every node, the left subtree and right subtree exchange places. Return the root of the inverted tree. You may modify the tree in place.

Trees in the tests are written in level order with `null` for a missing child, so `[1, null, 2]` is a root whose only child is on the right.

### Examples

| Input | Output | Why |
|---|---|---|
| `[4, 2, 7, 1, 3, 6, 9]` | `[4, 7, 2, 9, 6, 3, 1]` | Every level is reversed |
| `[1, null, 2, null, 3]` | `[1, 2, null, 3]` | A right-leaning chain becomes left-leaning |
| `[]` | `[]` | Nothing to invert |

### Constraints

- `0 ≤ number of nodes ≤ 100`
- `-100 ≤ node.val ≤ 100`

### Follow-up

The interviewer asks: "Do it without recursion." Then: "What is the difference between inverting the tree and just reading it right-to-left everywhere, and when does the difference matter?"

## Solution

### The naive approach

There is no meaningfully worse approach here; the trap is overthinking it. Some candidates try to rebuild a new tree from a traversal, which costs `O(n)` extra memory and a lot of code for an operation that is a local swap.

### The insight

Mirroring is *self-similar*: the mirror of a tree is a node whose left child is the mirror of the old right subtree and whose right child is the mirror of the old left subtree. That sentence is the recursive function. Each node does one swap; the recursion handles the rest.

### The optimal approach

If `root` is `None`, return it. Otherwise swap `root.left` and `root.right`, recurse into both, return `root`. Pre-order (swap then recurse) or post-order (recurse then swap) both work because the swap at a node does not depend on what happens below.

```python
def invert_tree(root: TreeNode | None) -> TreeNode | None:
    if root is None:
        return None
    root.left, root.right = root.right, root.left
    invert_tree(root.left)
    invert_tree(root.right)
    return root
```

Time `O(n)`: each node is visited once. Space `O(h)` for the recursion stack, where `h` is the height, `O(log n)` for a balanced tree and `O(n)` for a chain.

Iteratively, use a stack (or queue; the order does not matter): pop a node, swap its children, push the non-null children. Same complexity, no recursion limit.

```python
def invert_tree_iterative(root):
    stack = [root] if root else []
    while stack:
        node = stack.pop()
        node.left, node.right = node.right, node.left
        if node.left:
            stack.append(node.left)
        if node.right:
            stack.append(node.right)
    return root
```

### Common mistakes

- Swapping, then recursing into `root.right` while calling it "the old left", and doing it twice. Use the tuple swap so there is no temporary to confuse.
- Returning `None` from the recursive calls and reassigning `root.left = invert(root.left)`, which is fine, but then forgetting to `return root` at the end.
- Not handling `None` at the top of the function, so leaves crash.

### How to discuss it

This is a screening question; the interviewer wants clean code in under two minutes and a correct answer on space. State `O(n)` time, `O(h)` space, and offer the iterative version unprompted. For the "reading right-to-left" follow-up: if a tree is only ever *traversed*, a mirrored traversal (visit right before left) produces the same observable output without touching the structure. Inverting matters when the structure itself is consumed by something with fixed semantics, for example an expression tree where left and right operands are not interchangeable, or a BST whose ordering invariant the inversion deliberately reverses.
