---
slug: count-good-nodes
title: Count Good Nodes in Binary Tree
difficulty: medium
patterns: [tree-dfs]
lists: [ascend-150]
companies: [microsoft, amazon, google, meta]
order: 13
lesson: interview-patterns/tree-and-graph-patterns/tree-dfs
hints:
  - "Whether a node is good depends only on the largest value among its ancestors. Carry that maximum down as a parameter."
  - "The root has no ancestors, so it is always good; start the running maximum at the root's value (or negative infinity)."
  - "Update the maximum with the current node before recursing into the children; ties count as good."
signatures:
  python:
    name: good_nodes
    starter: |
      def good_nodes(root: TreeNode | None) -> int:
          pass
  javascript:
    name: good_nodes
    starter: |
      function good_nodes(root) {
      }
tests:
  - args: [{"$tree": [3, 1, 4, 3, null, 1, 5]}]
    expected: 4
  - args: [{"$tree": [3, 3, null, 4, 2]}]
    expected: 3
  - args: [{"$tree": [1]}]
    expected: 1
    label: root alone
  - args: [{"$tree": []}]
    expected: 0
    label: empty tree
  - args: [{"$tree": [2, 2, 2]}]
    expected: 3
    label: ties count
  - args: [{"$tree": [5, 4, 3, 2, 1]}]
    expected: 1
    hidden: true
    label: strictly decreasing, only the root
  - args: [{"$tree": [1, 2, 3, 4, 5, 6, 7]}]
    expected: 7
    hidden: true
    label: every node beats its ancestors
  - args: [{"$tree": [-1, -5, -2, null, null, -3, 0]}]
    expected: 2
    hidden: true
    label: negative values
time_limit_ms: 4000
---
A node `x` in a binary tree is **good** if no node on the path from the root down to `x` has a value greater than `x.val`. The root is always good. Given the root, return the number of good nodes. An empty tree has 0.

### Examples

| Input | Output | Why |
|---|---|---|
| `[3, 1, 4, 3, null, 1, 5]` | `4` | Root `3`; `4` beats `3`; the left `3` ties the root's `3`; `5` beats `3, 4`. The `1`s lose to `3` |
| `[3, 3, null, 4, 2]` | `3` | Root; the child `3` ties; `4` beats `3`. `2` loses |
| `[5, 4, 3, 2, 1]` | `1` | Every descendant is smaller than the root |

### Constraints

- `0 ≤ number of nodes ≤ 10⁵`
- `-10⁴ ≤ node.val ≤ 10⁴`

### Follow-up

The interviewer asks: "Your recursion carries one value down. Contrast that with problems where information flows *up*. How do you decide which direction a tree problem needs?"

## Solution

### The naive approach

For each node, walk back up to the root (if you have parent pointers) or re-derive the root-to-node path, checking every ancestor. `O(n · h)` time. There is no need for it: the information you want about ancestors is a single number.

### The insight

"No ancestor is greater than me" is the same as "I am at least the maximum of my ancestors". The maximum of the ancestors of a child is `max(parent's ancestor-maximum, parent.val)`. So one integer, passed downwards and updated at each node, answers the question everywhere. This is a **top-down** (pre-order) recursion: the parameter carries context from above, and the node's answer needs nothing from below except the counts to sum up.

### The optimal approach

```python
def good_nodes(root: TreeNode | None) -> int:
    def dfs(node: TreeNode | None, max_so_far: int) -> int:
        if node is None:
            return 0
        good = 1 if node.val >= max_so_far else 0
        max_so_far = max(max_so_far, node.val)
        return good + dfs(node.left, max_so_far) + dfs(node.right, max_so_far)

    return dfs(root, float("-inf")) if root is not None else 0
```

Trace on `[3, 1, 4, 3, null, 1, 5]`: root 3 (max `-inf`) good, max 3. Left 1: not good; its child 3 (max 3): tie, good. Right 4 (max 3): good, max 4. Its children 1 (not good) and 5 (good). Total 4.

Time `O(n)`, space `O(h)`. The parameter is an `int`, so passing it costs nothing; no shared state is needed.

Iteratively, push `(node, max_so_far)` pairs onto a stack; same complexity, no recursion limit, which matters at `10⁵` nodes on a skewed tree.

### Common mistakes

- Using `>` instead of `>=`, so a node equal to its ancestor maximum is not counted.
- Updating `max_so_far` *after* recursing, or updating it in a shared variable without restoring it, so siblings see each other's values.
- Starting `max_so_far` at 0 instead of `-inf`, which miscounts trees with negative roots (the hidden negative test).

### How to discuss it

This is an easy problem placed to check that you can articulate the direction of information flow. Say "the answer for a node depends only on its ancestors, so I pass the ancestor maximum down; the recursion returns a count so the totals combine on the way up." The follow-up wants the general rule: if a node's answer depends on its *ancestors* (path constraints, running maxima, bounds as in [Validate BST](/practice/validate-bst)), pass parameters down, pre-order. If it depends on its *descendants* (height, subtree sums, [Diameter](/practice/diameter-binary-tree)), return values up, post-order. Many hard tree problems need both at once, and recognising which pieces flow which way is most of the solution.
