---
slug: construct-from-preorder-inorder
title: Construct Binary Tree from Preorder and Inorder Traversal
difficulty: medium
patterns: [tree-dfs]
lists: [core-75, ascend-150]
companies: [amazon, microsoft, meta, bloomberg]
order: 10
lesson: interview-patterns/tree-and-graph-patterns/tree-dfs
hints:
  - "The first element of preorder is always the root. Find that value in inorder: everything to its left is the left subtree, everything to its right is the right subtree."
  - "The left subtree has as many elements in preorder as it has in inorder, so you can split preorder at the same count and recurse on both halves."
  - "Slicing arrays at every level costs O(n) per call. Precompute a value-to-index map for inorder and pass index ranges instead of copies to get O(n) total."
signatures:
  python:
    name: build_tree
    starter: |
      def build_tree(preorder: list[int], inorder: list[int]) -> TreeNode | None:
          pass
  javascript:
    name: build_tree
    starter: |
      function build_tree(preorder, inorder) {
      }
tests:
  - args: [[3, 9, 20, 15, 7], [9, 3, 15, 20, 7]]
    expected: {"$tree": [3, 9, 20, null, null, 15, 7]}
  - args: [[-1], [-1]]
    expected: {"$tree": [-1]}
    label: single node
  - args: [[1, 2, 3], [3, 2, 1]]
    expected: {"$tree": [1, 2, null, 3]}
    label: left-leaning chain
  - args: [[1, 2, 3], [1, 2, 3]]
    expected: {"$tree": [1, null, 2, null, 3]}
    label: right-leaning chain
  - args: [[2, 1, 3], [1, 2, 3]]
    expected: {"$tree": [2, 1, 3]}
  - args: [[1, 2, 4, 5, 3, 6, 7], [4, 2, 5, 1, 6, 3, 7]]
    expected: {"$tree": [1, 2, 3, 4, 5, 6, 7]}
    hidden: true
    label: full tree
  - args: [[1, 2, 3, 4], [2, 1, 4, 3]]
    expected: {"$tree": [1, 2, 3, null, null, 4]}
    hidden: true
  - args: [[5, 3, 1, 4, 8, 9], [1, 3, 4, 5, 8, 9]]
    expected: {"$tree": [5, 3, 8, 1, 4, null, 9]}
    hidden: true
time_limit_ms: 4000
---
You are given two integer arrays, `preorder` and `inorder`, which are the preorder and inorder traversals of the same binary tree. All values are distinct. Rebuild the tree and return its root.

Recall: preorder visits `root, left subtree, right subtree`; inorder visits `left subtree, root, right subtree`.

### Examples

| Input | Output | Why |
|---|---|---|
| `preorder = [3, 9, 20, 15, 7]`, `inorder = [9, 3, 15, 20, 7]` | `[3, 9, 20, null, null, 15, 7]` | 3 is the root; `[9]` is left, `[15, 20, 7]` is right |
| `preorder = [1, 2, 3]`, `inorder = [3, 2, 1]` | `[1, 2, null, 3]` | Every node is a left child |
| `preorder = [1, 2, 3]`, `inorder = [1, 2, 3]` | `[1, null, 2, null, 3]` | Every node is a right child |

### Constraints

- `1 ≤ len(preorder) = len(inorder) ≤ 3000`
- `-3000 ≤ values ≤ 3000`, all distinct
- The arrays are valid traversals of one tree.

### Follow-up

The interviewer asks: "Why is preorder alone not enough, and would preorder plus postorder be enough?" Then: "What breaks if values are not distinct?"

## Solution

### The naive approach

Take `preorder[0]` as the root, find it in `inorder` by linear search, split both arrays with slicing, recurse. Correct, and it is what most candidates write first. The cost: each level searches and slices `O(n)` elements, and with `h` levels that is `O(n · h)`, which is `O(n²)` for a chain. Also `O(n²)` memory churn from the slices.

### The insight

Two facts make the reconstruction unique. Preorder puts the root first. Inorder puts the root *between* its subtrees, so once you know the root you know exactly which values belong to the left subtree and, by counting them, how many preorder entries belong to it too. Both arrays split at consistent positions, and the same reasoning applies recursively.

Two optimisations remove the quadratic term. A hash map from value to inorder index makes the root lookup `O(1)`. Passing index bounds instead of slices makes each call `O(1)` beyond its recursion. Total `O(n)`.

### The optimal approach

Keep a running pointer into `preorder` (the next root to consume) and recurse on inorder ranges `[lo, hi)`. Each call: if the range is empty, return `None`; otherwise take the next preorder value as the root, look up its inorder index `mid`, build the left subtree from `[lo, mid)` and then the right from `[mid + 1, hi)`. The left-before-right order is essential because preorder lists the entire left subtree before the right one, so the running pointer is in the right place when the right subtree starts.

Trace on `preorder = [3, 9, 20, 15, 7]`, `inorder = [9, 3, 15, 20, 7]`: root 3 at inorder index 1. Left range `[0, 1)`: root 9, both sub-ranges empty. Right range `[2, 5)`: root 20 at index 3; left `[2, 3)` gives 15; right `[4, 5)` gives 7.

```python
def build_tree(preorder: list[int], inorder: list[int]) -> TreeNode | None:
    index = {v: i for i, v in enumerate(inorder)}
    pre_pos = 0

    def build(lo: int, hi: int) -> TreeNode | None:
        nonlocal pre_pos
        if lo >= hi:
            return None
        val = preorder[pre_pos]
        pre_pos += 1
        node = TreeNode(val)
        mid = index[val]
        node.left = build(lo, mid)        # must build left first
        node.right = build(mid + 1, hi)
        return node

    return build(0, len(inorder))
```

Time `O(n)`: one map build, one node per call, `O(1)` work per call. Space `O(n)` for the map plus `O(h)` recursion.

### Common mistakes

- Building the right subtree before the left, which desynchronises the preorder pointer.
- Slicing at every level and claiming `O(n)`.
- Using the *preorder* index of a value to split, which is meaningless; the split comes from inorder.
- Miscounting the preorder split in the slice-based version: the left subtree takes `mid - lo` elements, not `mid`.

### How to discuss it

Explain the two facts (root first in preorder, root in the middle in inorder) and state that they make the tree unique when values are distinct. Then name the two optimisations and their effect on complexity. For the follow-ups: preorder alone is ambiguous because `[1, 2]` could be a left chain or a right chain; preorder plus postorder is *also* ambiguous for the same reason (a node with one child gives identical traversals either way), and only becomes unique if the tree is full; inorder is the ingredient that resolves left-versus-right. With duplicates, the inorder lookup cannot tell which occurrence is the root, so reconstruction is no longer unique. If you must handle it, you need extra structure such as `null` markers, which is what [Serialize and Deserialize](/practice/serialize-deserialize) uses.
