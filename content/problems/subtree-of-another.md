---
slug: subtree-of-another
title: Subtree of Another Tree
difficulty: easy
patterns: [tree-dfs]
lists: [ascend-150]
companies: [amazon, meta, microsoft, google]
order: 6
lesson: interview-patterns/tree-and-graph-patterns/tree-dfs
hints:
  - "You already know how to check whether two trees are identical. A subtree match is that check, tried at every node of the big tree."
  - "Walk `root`; at each node, if `is_same_tree(node, sub)` is true you are done, otherwise try the node's children."
  - "That is O(n · m) worst case. To do better, serialise both trees with null markers and search for one string inside the other, but be careful with the delimiters so `2` does not match inside `12`."
signatures:
  python:
    name: is_subtree
    starter: |
      def is_subtree(root: TreeNode | None, sub: TreeNode | None) -> bool:
          pass
  javascript:
    name: is_subtree
    starter: |
      function is_subtree(root, sub) {
      }
tests:
  - args: [{"$tree": [3, 4, 5, 1, 2]}, {"$tree": [4, 1, 2]}]
    expected: true
  - args: [{"$tree": [3, 4, 5, 1, 2, null, null, null, null, 0]}, {"$tree": [4, 1, 2]}]
    expected: false
    label: candidate has an extra descendant
  - args: [{"$tree": [1]}, {"$tree": [1]}]
    expected: true
    label: identical single nodes
  - args: [{"$tree": [1, 2, 3]}, {"$tree": [2]}]
    expected: true
    label: a leaf is a subtree
  - args: [{"$tree": [1, 1]}, {"$tree": [1]}]
    expected: true
    label: duplicate values, matches at the leaf
  - args: [{"$tree": [1, 2, 3]}, {"$tree": [1, 2]}]
    expected: false
    hidden: true
    label: matches at the root but root has an extra child
  - args: [{"$tree": [1, 2, 3, 4, 5]}, {"$tree": [2, 4, 5]}]
    expected: true
    hidden: true
  - args: [{"$tree": [1, 2, 3, 4, 5]}, {"$tree": [2, 4]}]
    expected: false
    hidden: true
    label: partial match is not a subtree
time_limit_ms: 4000
---
Given the roots of two non-empty binary trees `root` and `sub`, return `true` if `sub` is a **subtree** of `root`: some node `n` in `root` exists such that the tree rooted at `n` (including *all* of its descendants) is identical to `sub` in structure and values. A tree counts as a subtree of itself.

### Examples

| Input | Output | Why |
|---|---|---|
| `root = [3, 4, 5, 1, 2]`, `sub = [4, 1, 2]` | `true` | The node `4` with its children `1, 2` matches exactly |
| `root = [3, 4, 5, 1, 2, null, null, null, null, 0]`, `sub = [4, 1, 2]` | `false` | In `root`, node `2` has a child `0`, so the subtree at `4` is bigger than `sub` |
| `root = [1, 2, 3]`, `sub = [1, 2]` | `false` | The root matches by value but has an extra right child |

### Constraints

- `1 ≤ nodes in root ≤ 2000`
- `1 ≤ nodes in sub ≤ 1000`
- `-10⁴ ≤ node.val ≤ 10⁴`

### Follow-up

The interviewer asks: "Your solution is O(n · m). Can you make it linear?" Then: "If `sub` is tiny and `root` is huge, what is the practical bottleneck, and does the linear solution actually help?"

## Solution

### The naive approach

For every node in `root`, run [Same Tree](/practice/same-tree) against `sub`. Worst case every node is a candidate and every comparison runs to the end of `sub`: `O(n · m)`. In practice the identical check bails at the first mismatched value, so the typical cost is far lower; the worst case needs pathological inputs such as a tree of all equal values. This is the expected interview answer, and it is fine to start here.

### The insight

Two observations. First, a subtree match must include *everything* below the matching node, which is why the "extra descendant" example fails; that is what makes `is_same_tree` the right primitive rather than a prefix check. Second, the whole problem is pattern matching, and tree pattern matching reduces to string matching if you serialise with structure markers: pre-order with an explicit token for `None`, and a delimiter before every value so `2` cannot match inside `12` or `-2`.

### The optimal approach

The recursive version is clearest and passes every test:

```python
def is_subtree(root: TreeNode | None, sub: TreeNode | None) -> bool:
    def same(a, b):
        if a is None and b is None:
            return True
        if a is None or b is None or a.val != b.val:
            return False
        return same(a.left, b.left) and same(a.right, b.right)

    if root is None:
        return sub is None
    if same(root, sub):
        return True
    return is_subtree(root.left, sub) or is_subtree(root.right, sub)
```

Time `O(n · m)` worst case, space `O(h)`.

The linear version serialises both trees and uses a linear-time substring search. Python's `in` on strings is fast in practice but not guaranteed linear; KMP or hashing gives a strict bound. The serialisation is the part interviewers scrutinise:

```python
def is_subtree_linear(root, sub):
    def serialise(node, out):
        if node is None:
            out.append("#")
            return
        out.append("^" + str(node.val))   # '^' delimits each value
        serialise(node.left, out)
        serialise(node.right, out)

    a, b = [], []
    serialise(root, a)
    serialise(sub, b)
    return "".join(b) in "".join(a)
```

The `^` prefix matters: without it, `sub = [2]` serialises to `2##` and would match inside `root = [12]` as `12##`. With it, `^2##` cannot match inside `^12##`. Time `O(n + m)` with a linear matcher; space `O(n + m)` for the strings.

### Common mistakes

- Using a "does `sub` appear as a prefix of some subtree" check, which returns `true` for the extra-descendant example.
- Serialising without `None` markers, so different shapes with the same value order collide.
- Serialising with `None` markers but without delimiters, so digits of adjacent values run together.

### How to discuss it

Start with "identical-tree check at every node", give its worst case, and then describe serialisation-plus-substring-search as the linear improvement, being explicit about the two encoding hazards. For the last follow-up: when `m` is tiny the naive approach is usually faster in practice because most candidates fail on the first comparison, the serialisation builds an `O(n)` string you may not need, and the constant factors of a real KMP dwarf a couple of integer compares. Knowing when the asymptotically better algorithm is the worse engineering choice is the point of the question.
