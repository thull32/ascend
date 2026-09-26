---
slug: same-tree
title: Same Tree
difficulty: easy
patterns: [tree-dfs]
lists: [core-75, ascend-150]
companies: [amazon, google, microsoft, bloomberg]
order: 5
lesson: interview-patterns/tree-and-graph-patterns/tree-dfs
hints:
  - "Two trees are identical if their roots agree and their left subtrees are identical and their right subtrees are identical. That sentence is the recursion."
  - "Handle the base cases in the right order: both empty is true; exactly one empty is false; otherwise compare values and recurse."
  - "Walk both trees in lockstep. Any traversal order works as long as it is the same order on both sides and structure is compared, not just values."
signatures:
  python:
    name: is_same_tree
    starter: |
      def is_same_tree(p: TreeNode | None, q: TreeNode | None) -> bool:
          pass
  javascript:
    name: is_same_tree
    starter: |
      function is_same_tree(p, q) {
      }
tests:
  - args: [{"$tree": [1, 2, 3]}, {"$tree": [1, 2, 3]}]
    expected: true
  - args: [{"$tree": [1, 2]}, {"$tree": [1, null, 2]}]
    expected: false
    label: same values, different shape
  - args: [{"$tree": [1, 2, 1]}, {"$tree": [1, 1, 2]}]
    expected: false
    label: same shape, different values
  - args: [{"$tree": []}, {"$tree": []}]
    expected: true
    label: both empty
  - args: [{"$tree": [5]}, {"$tree": [5]}]
    expected: true
  - args: [{"$tree": []}, {"$tree": [1]}]
    expected: false
    hidden: true
    label: one empty
  - args: [{"$tree": [1, 2, 3, 4]}, {"$tree": [1, 2, 3, 4]}]
    expected: true
    hidden: true
  - args: [{"$tree": [1, 2, 3, null, 4]}, {"$tree": [1, 2, 3, 4]}]
    expected: false
    hidden: true
    label: child on different sides
time_limit_ms: 4000
---
Given the roots of two binary trees `p` and `q`, return `true` if they are structurally identical and every corresponding node holds the same value.

### Examples

| Input | Output | Why |
|---|---|---|
| `[1, 2, 3]`, `[1, 2, 3]` | `true` | Identical |
| `[1, 2]`, `[1, null, 2]` | `false` | Same values but `2` is a left child in one and a right child in the other |
| `[1, 2, 1]`, `[1, 1, 2]` | `false` | Same shape, values swapped |

### Constraints

- `0 ≤ number of nodes in each tree ≤ 100`
- `-10⁴ ≤ node.val ≤ 10⁴`

### Follow-up

The interviewer asks: "Would comparing the in-order traversals of both trees work? What about pre-order?" Then: "How would you compare two very large trees stored in different services without shipping either one over the network?"

## Solution

### The naive approach

Serialise each tree to a list with a traversal and compare the lists. This is where the follow-up bites: an in-order (or pre-order, or post-order) sequence of *values alone* does not determine the shape. `[1, 2]` and `[1, null, 2]` have in-order sequences `2, 1` and `1, 2`, which differ here, but `[2, 1]` and `[2, null, 1]` have pre-order `2, 1` in both. Serialisation only works if `null` markers are included, at which point you are doing the recursive comparison with extra memory.

### The insight

Identity is recursive: two trees are the same if the roots match and the two left subtrees are the same and the two right subtrees are the same. Empty trees are the same as each other and different from any non-empty tree. Walking both trees simultaneously compares structure and values in a single pass and stops at the first difference.

### The optimal approach

```python
def is_same_tree(p: TreeNode | None, q: TreeNode | None) -> bool:
    if p is None and q is None:
        return True
    if p is None or q is None:
        return False
    if p.val != q.val:
        return False
    return is_same_tree(p.left, q.left) and is_same_tree(p.right, q.right)
```

Time `O(min(n, m))`: the walk stops as soon as one tree runs out or a value differs. Space `O(min(h_p, h_q))` for recursion.

The iterative version pushes pairs `(p_node, q_node)` onto a stack and applies the same three checks per pair; use it when the tree may be deep.

```python
def is_same_tree_iterative(p, q):
    stack = [(p, q)]
    while stack:
        a, b = stack.pop()
        if a is None and b is None:
            continue
        if a is None or b is None or a.val != b.val:
            return False
        stack.append((a.left, b.left))
        stack.append((a.right, b.right))
    return True
```

### Common mistakes

- Checking `p.val != q.val` before checking for `None`, which dereferences a null.
- Writing `if p is None or q is None: return False` *before* the both-`None` case, which makes two empty trees unequal.
- Comparing value traversals without structure markers and getting fooled by trees like `[2, 1]` versus `[2, null, 1]`.

### How to discuss it

Give the three base cases in order and say why the order matters. Answer the traversal follow-up with a concrete counterexample. For the distributed follow-up: compute a structural hash per subtree (a Merkle tree: `hash(val, hash(left), hash(right))`), exchange root hashes, and only descend into subtrees whose hashes differ; that is how replicated databases and Git compare large trees with bandwidth proportional to the size of the difference rather than the size of the data.
