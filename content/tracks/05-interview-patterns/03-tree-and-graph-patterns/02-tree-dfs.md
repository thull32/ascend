---
slug: tree-dfs
title: "Tree DFS: what to pass down and what to return up"
description: Recognise subtree questions, choose between top-down parameters and bottom-up return values, and see Diameter, Validate BST, Max Path Sum and Kth Smallest traced call by call.
minutes: 34
difficulty: medium
tags: [tree, dfs, recursion, post-order, in-order, pattern:tree-dfs]
problems: [invert-binary-tree, max-depth-binary-tree, diameter-binary-tree, balanced-binary-tree, same-tree, subtree-of-another, lowest-common-ancestor-bst, validate-bst, kth-smallest-bst, construct-from-preorder-inorder, max-path-sum, path-sum-ii, count-good-nodes]
---
Almost every tree question that is not about levels is a question about *subtrees*: how tall is this one, is it balanced, is it a valid BST, what is the best path through it, does it match that other tree. A subtree is defined by its root, and the answer for a root is built from the answers for its children. That sentence is the whole of tree DFS. The recursion does the traversal; your only decisions are what information flows *down* into a call as parameters and what flows *up* out of it as a return value.

Candidates who treat "DFS" as a single trick get stuck the moment a problem needs two pieces of information at once (the diameter needs the height of each child *and* the best diameter seen so far), or when the answer to the problem is not the value the recursion should return (the max path sum recursion returns the best *single-arm* path, while the answer is the best *two-arm* path). The candidates who see it as a data-flow question write those problems in four minutes.

## The signal

Reach for tree DFS when the statement says any of these:

- **A property of the whole tree defined in terms of subtrees**: height, depth, size, diameter, balanced, symmetric, same tree, subtree of another. The recurrence is "combine the children's answers".
- **A path constraint**: root-to-leaf sums, "good nodes" (no ancestor larger), longest univalue path, max path sum. Something about ancestors flows down; something about descendants flows up.
- **BST ordering**: validate, kth smallest, LCA in a BST, inorder successor, convert to a sorted list. In-order traversal of a BST visits keys ascending, and the BST property gives you a value range per subtree.
- **Rebuilding a tree** from traversals or from a serialised string: the root is the first pre-order token, and the rest splits into left and right subtrees.
- **Transforming in place**: invert, flatten, prune. Recurse into children, then fix up the current node.

What rules it out:

- The statement is about **levels, rows, nearest or width**. Use [Tree BFS](/learn/interview-patterns/tree-and-graph-patterns/tree-bfs); DFS can do it with a depth map but the argument is clumsier.
- The tree is **huge and degenerate** (a linked list of 10⁵ nodes) and the language has a small call stack. Python's default recursion limit is 1,000 frames; Node's is a few thousand. Convert to an explicit stack, or use BFS.
- The problem is a **graph with cycles** dressed up as a tree ("nodes with a parent pointer", "n-ary structure with shared children"). You need a visited set, which is [Graph traversal](/learn/interview-patterns/tree-and-graph-patterns/graph-traversal).

The single most useful question to ask yourself is: *to answer for this node, what do I need to know about each child?* If the answer is "one number", the recursion returns that number. If it is "two numbers", return a tuple. If the node also needs to know something about its ancestors, that becomes a parameter. The lessons in [Tree recursion patterns](/learn/data-structures/trees/tree-recursion-patterns) cover the theory; this lesson is about recognising which shape a problem wants in the first minute.

## The template

Two shapes cover the family. **Bottom-up** (post-order): recurse first, then compute this node's answer from the children's answers. **Top-down** (pre-order): compute something from the ancestors, pass it into the children. Many problems combine them: pass a bound down, return a result up.

```python
def bottom_up(node):
    """Post-order: children first, then combine."""
    if node is None:
        return BASE                        # e.g. 0 for height, True for balanced
    left = bottom_up(node.left)
    right = bottom_up(node.right)
    return COMBINE(node, left, right)      # e.g. 1 + max(left, right)


def top_down(node, state):
    """Pre-order: ancestors decide `state`, children inherit it."""
    if node is None:
        return
    state = UPDATE(state, node)            # e.g. running max, remaining sum, bounds
    RECORD(node, state)                    # e.g. count += 1 if node.val >= state
    top_down(node.left, state)
    top_down(node.right, state)
```

```javascript
function bottomUp(node) {
  if (node === null) return BASE;
  const left = bottomUp(node.left);
  const right = bottomUp(node.right);
  return combine(node, left, right);
}

function topDown(node, state) {
  if (node === null) return;
  state = update(state, node);
  record(node, state);
  topDown(node.left, state);
  topDown(node.right, state);
}
```

Height is the bottom-up template with `BASE = 0` and `COMBINE = 1 + max(left, right)`. Invert is bottom-up with `COMBINE = swap the children and return node`. Same-tree is bottom-up over two trees in lockstep. Count-good-nodes is top-down with `state = max value on the path so far`.

The third shape, which is where problems become "medium", is the **bottom-up recursion with a side channel**: the return value is what the *parent* needs, and a separate variable (a nonlocal, a closure, an instance field, a one-element list) records the *answer*, which may be something different. Diameter, max path sum and longest univalue path are all this shape.

```python
def with_side_channel(root):
    best = 0                               # the answer, updated as a side effect
    def go(node):
        nonlocal best
        if node is None:
            return 0
        left = go(node.left)
        right = go(node.right)
        best = max(best, left + right)     # the answer uses BOTH arms
        return 1 + max(left, right)        # the parent can only use ONE arm
    go(root)
    return best
```

Watch the two quantities separate on a real tree:

```viz
{"type": "tree", "algorithm": "diameter", "values": [1, 2, 3, 4, 5, 6, 7, 8, 9], "title": "Diameter: return height, record the best left + right", "caption": "Each call returns its height to the parent and updates the global best with left + right."}
```

The complexity of every shape is `O(n)` time, because each node is visited once and the combine step is `O(1)`, and `O(h)` space for the recursion stack, where `h` is the height: `O(log n)` on a balanced tree, `O(n)` on a chain.

## Worked problems

### Diameter of Binary Tree

[Diameter](/practice/diameter-binary-tree): the longest path between any two nodes, measured in edges. The path need not pass through the root.

The two-quantity insight: the diameter *through* a node is `height(left) + height(right)`, but the node's parent cannot use both arms, because a path that goes down into the left child and back up cannot continue into the right child and then also go up to the parent. So the recursion returns the height (one arm) and records `left + right` (two arms) on the side.

```python
def diameter(root):
    best = 0
    def height(node):
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

Trace on `[1, 2, 3, 4, 5]` (root 1, children 2 and 3, node 2 has children 4 and 5). Calls return in post-order:

| call returns for | `l` | `r` | `best` after | returns (height) |
|---|---|---|---|---|
| 4 | 0 | 0 | 0 | 1 |
| 5 | 0 | 0 | 0 | 1 |
| 2 | 1 | 1 | 2 | 2 |
| 3 | 0 | 0 | 2 | 1 |
| 1 | 2 | 1 | 3 | 3 |

Diameter 3: the path 4 → 2 → 1 → 3. Note that at node 2, `best` became 2 (path 4 → 2 → 5) before the root was even considered; the answer can live entirely inside a subtree, which is why it is recorded on the side and not computed only at the root.

A common wrong version computes `height` inside a separate recursion at every node: `diameter(node) = max(height(left) + height(right), diameter(left), diameter(right))` with `height` as a fresh `O(n)` call. That is `O(n²)` on a chain, and the interviewer will ask you to fix it. The fix is the single-pass version above.

### Validate Binary Search Tree

[Validate BST](/practice/validate-bst): is every node greater than everything in its left subtree and less than everything in its right subtree?

The trap is checking only `left.val < node.val < right.val`. That accepts the tree `[5, 1, 7, null, null, 3, 8]`, where 3 is in the right subtree of 5 but is less than 5. The property is about *all* descendants, and the clean way to express "all descendants" is a range passed top-down: every node must lie strictly inside `(lo, hi)`, and the children inherit a tightened range.

```python
def is_valid_bst(root):
    def ok(node, lo, hi):
        if node is None:
            return True
        if not (lo < node.val < hi):
            return False
        return ok(node.left, lo, node.val) and ok(node.right, node.val, hi)
    return ok(root, float("-inf"), float("inf"))
```

Trace on `[5, 1, 7, null, null, 3, 8]`:

| call | `(lo, hi)` | check | result |
|---|---|---|---|
| 5 | (−∞, ∞) | −∞ < 5 < ∞ | recurse |
| 1 | (−∞, 5) | −∞ < 1 < 5 | recurse into (None, None) → True |
| 7 | (5, ∞) | 5 < 7 < ∞ | recurse |
| 3 | (5, 7) | 5 < 3? no | **False** |

The bound `lo = 5` was set by the root and inherited through 7; node 3 violates it even though its own parent 7 is fine. Top-down bounds encode "all ancestors" in two numbers.

The alternative is in-order traversal with a `prev` value: a BST's in-order sequence is strictly increasing, so a single `prev >= node.val` check fails it. Both are `O(n)` time and `O(h)` space. The in-order version generalises to "kth smallest", "inorder successor" and "recover a BST with two swapped nodes", so know it too:

```viz
{"type": "tree", "algorithm": "validate-bst", "values": [8, 3, 10, 1, 6, 14, 4, 7, 13], "title": "Validate BST with inherited bounds", "caption": "Each node is checked against the (lo, hi) range its ancestors imposed."}
```

Duplicates: the problem must say whether equal keys are allowed and on which side. Ask. With "strictly less / strictly greater", the checks are strict; with "left ≤ node", loosen one side only.

### Binary Tree Maximum Path Sum

[Max Path Sum](/practice/max-path-sum): the maximum sum over any path (a sequence of nodes connected parent-to-child, not necessarily through the root, at least one node). Values can be negative.

Same shape as the diameter with two twists. First, an arm with a negative sum is worse than no arm, so each child's contribution is clamped at 0: `gain = max(0, go(child))`. Second, the answer may be a single node when everything is negative, so `best` is initialised to `-inf`, not 0.

```python
def max_path_sum(root):
    best = float("-inf")
    def gain(node):
        nonlocal best
        if node is None:
            return 0
        l = max(0, gain(node.left))         # drop a negative arm
        r = max(0, gain(node.right))
        best = max(best, node.val + l + r)  # path through node, both arms
        return node.val + max(l, r)         # parent may extend ONE arm
    gain(root)
    return best
```

Trace on `[-10, 9, 20, null, null, 15, 7]` (root −10, children 9 and 20, node 20 has children 15 and 7):

| returns for | `l` (clamped) | `r` (clamped) | `best` after | returns (`val + max(l, r)`) |
|---|---|---|---|---|
| 9 | 0 | 0 | 9 | 9 |
| 15 | 0 | 0 | 15 | 15 |
| 7 | 0 | 0 | 15 | 7 |
| 20 | 15 | 7 | 42 | 35 |
| −10 | 9 | 35 | 42 | 25 |

Answer 42, the path 15 → 20 → 7, which never touches the root. At the root, `-10 + 9 + 35 = 34 < 42`, so `best` stays. The root's return value 25 is irrelevant because there is no parent, but the code is uniform.

Second trace, all negative, `[-3, -1, -2]`: node −1 returns `max(0, ...)` clamped children, `best = -1`, returns −1. Node −2: `best` stays −1 (−2 < −1), returns −2. Root: `l = max(0, -1) = 0`, `r = 0`, `best = max(-1, -3) = -1`. Answer −1, the single node. With `best = 0` initially you would return 0, a path with no nodes, which the problem forbids.

### Kth Smallest Element in a BST

[Kth Smallest](/practice/kth-smallest-bst): the kth smallest key, 1-indexed.

In-order traversal of a BST yields keys in ascending order, so the kth visited node is the answer. The point of the problem is to *stop after k visits* rather than build the whole sorted list: use the iterative in-order with an explicit stack, which lets you return from the middle of the traversal.

```python
def kth_smallest(root, k):
    stack, node = [], root
    while stack or node:
        while node:                      # walk left as far as possible
            stack.append(node)
            node = node.left
        node = stack.pop()               # the next in-order node
        k -= 1
        if k == 0:
            return node.val
        node = node.right                # then explore its right subtree
```

Trace on `[5, 3, 6, 2, 4, null, null, 1]` with `k = 3`: push 5, 3, 2, 1 (walking left). Pop 1 (`k = 2`); no right child. Pop 2 (`k = 1`); no right. Pop 3 (`k = 0`): return 3. The stack never held more than the height, four nodes, and nodes 4, 5 and 6 were never visited. Time `O(h + k)`, space `O(h)`.

The follow-up is always "what if the tree is modified often and kth is queried often?": augment each node with the size of its left subtree, so the query becomes a single root-to-node walk in `O(h)` and updates cost `O(h)` too. Say that without being asked and the interviewer moves on to something harder.

## Variations

- **Two trees in lockstep** ([Same Tree](/practice/same-tree), [Subtree of Another](/practice/subtree-of-another), symmetric tree): `go(a, b)` with base cases for both `None`, one `None`, and values differing. Subtree-of-another is `same(a, b) or subtree(a.left, b) or subtree(a.right, b)`, `O(n·m)`; the follow-up is serialising both with markers and running a string search.
- **Root-to-leaf paths** ([Path Sum II](/practice/path-sum-ii)): top-down with a `path` list you append to on entry and pop on exit. Copy the list when you record an answer; do not store the live reference.
- **Building from traversals** ([Construct from Preorder and Inorder](/practice/construct-from-preorder-inorder)): `preorder[0]` is the root; find it in `inorder` (precompute a value-to-index map to make that `O(1)`), and the left subtree has `idx` elements. Recurse on index ranges, not on sliced copies, to keep it `O(n)`.
- **Bottom-up with early exit** ([Balanced Binary Tree](/practice/balanced-binary-tree)): return the height, or −1 as a sentinel meaning "already unbalanced", and short-circuit as soon as a child returns −1. Same trick applies to "is this a BST" returning `(min, max, valid)` tuples.
- **LCA**: in a BST, walk from the root until `p` and `q` are on different sides ([LCA of BST](/practice/lowest-common-ancestor-bst)). In a general binary tree, bottom-up: return the node if it is `p` or `q`, otherwise return whichever child returned non-null, or the current node if both did.
- **Iterative DFS**: an explicit stack of `(node, visited_flag)` pairs or a two-stack post-order reproduces any of these without recursion, which is the answer to "the tree has a million nodes in a chain".
- **Tree DP** (longest univalue path, house robber on a tree, count nodes satisfying a subtree predicate): every one is bottom-up returning one or more numbers per subtree; see [Interval and tree DP](/learn/algorithms/dynamic-programming/interval-and-tree-dp).

## Pitfalls

- **Returning the answer instead of what the parent needs.** In diameter and max path sum the return value is a one-arm quantity; the answer is recorded on the side. Returning `l + r` gives the parent a path it cannot extend.
- **Checking only the immediate children in Validate BST.** Pass bounds down or use in-order with `prev`. Also decide the duplicate policy before writing the comparison.
- **Initialising the best to 0** when values can be negative. Use `-inf` (or the root's value).
- **Forgetting to clamp negative arms** in max path sum. A negative subtree should contribute nothing, not reduce the total.
- **Storing a live reference to the path list.** `paths.append(path)` then continuing to mutate `path` makes every recorded path identical. Append `path[:]` (Python) or `[...path]` (JavaScript).
- **Slicing arrays in the construct-from-traversals recursion.** `preorder[1:idx+1]` copies at every level, `O(n²)` on a skewed tree. Pass index bounds.
- **`O(n²)` diameter/balanced** by calling a separate height function at every node. Compute height and the answer in one pass.
- **Recursion depth on a chain.** Python's limit is 1,000 by default; `sys.setrecursionlimit` is a partial fix (it can still segfault). Know the iterative version.
- **Using `if node.left` where you mean `if node.left is not None`.** Same in JavaScript with truthiness: a node object is always truthy, so this one is safe, but a *value* of 0 is not. Test `val` comparisons with zeros in the tree.

## Exercise

```exercise
id: count-good-nodes
title: Count good nodes
prompt: |
  A node is "good" if no node on the path from the root to it (inclusive of
  ancestors, excluding itself) has a value strictly greater than its own.
  The root is always good. Return the number of good nodes.

  Use a top-down DFS that passes the maximum value seen so far along the
  path. Values may be negative. Return 0 for an empty tree.
languages: [python, javascript]
entry: count_good_nodes
starter:
  python: |
    def count_good_nodes(root):
        # root is a TreeNode with .val, .left, .right (or None)
        return 0
  javascript: |
    function count_good_nodes(root) {
      // root is a TreeNode with .val, .left, .right (or null)
      return 0;
    }
tests:
  - args: [{"$tree": [3, 1, 4, 3, null, 1, 5]}]
    expected: 4
  - args: [{"$tree": [3, 3, null, 4, 2]}]
    expected: 3
  - args: [{"$tree": [1]}]
    expected: 1
    label: single node
  - args: [{"$tree": []}]
    expected: 0
    label: empty tree
  - args: [{"$tree": [-1, -2, -3]}]
    expected: 1
    label: negatives, so a max seeded with 0 is wrong
  - args: [{"$tree": [2, 2, 2, 2, 2]}]
    expected: 5
    hidden: true
    label: equal values are good
  - args: [{"$tree": [5, 3, 8, 1, 4, 7, 9]}]
    expected: 3
    hidden: true
hints:
  - "Pass the maximum value on the path so far as a parameter; a node is good if node.val >= that maximum."
  - "Seed the maximum with the root's value (or negative infinity), never with 0."
  - "Update the maximum before recursing into the children: max(path_max, node.val)."
```

## Senior signals

- You ask **"what does the parent need from each child?"** before writing the function, and you say when the return value and the answer are different things.
- You know the **`O(n²)` trap** of calling height at every node and write the single-pass version first.
- You pass **bounds top-down** for BST validation and can explain why checking immediate children is wrong with a four-node counterexample.
- You initialise **best to −∞** when values can be negative and clamp negative arms, and you can say which test case breaks each mistake.
- You can produce the **iterative in-order** with an explicit stack and use it to stop early for kth smallest, and you mention subtree-size augmentation for the repeated-query follow-up.
- You state **space as `O(h)`** and name the degenerate case where recursion overflows, offering the iterative version before the interviewer asks.

## Check yourself

```quiz
- q: >-
    In the single-pass diameter solution, why does the recursive function return 1 + max(l, r) rather than l + r?
  options: ["Either works; the two values are interchangeable here", "Because returning l + r would make the recursion never terminate", "Because l + r is never larger than the height anyway", "A parent can extend a path through only one arm of this node"]
  answer: 3
  explanation: >-
    A path that descends into both children of a node is complete at that node; it cannot continue upward. Returning it would let the parent build an impossible path. The height (one arm) is what the parent needs; the two-arm sum is a candidate answer, kept on the side.
- q: >-
    Validate BST on [5, 1, 7, null, null, 3, 8] with a solution that only checks left.val < node.val < right.val returns true. Which node exposes the bug and what bound does it violate?
  options: ["Node 3, which violates the lower bound 5 set by the root", "None; the tree is a valid BST and true is correct", "Node 8, which violates the upper bound set by its parent", "Node 1, which violates the lower bound set by the root"]
  answer: 0
  explanation: >-
    3 sits in the right subtree of 5, so it must be greater than 5, even though its parent 7 is fine with it. The immediate-children check only compares 3 with 7. Passing (lo, hi) down encodes every ancestor constraint in two numbers.
- q: >-
    Max path sum on a tree where every value is negative. A solution initialises best = 0 and clamps child contributions with max(0, gain). What does it return, and why is that wrong?
  options: ["Negative infinity, since best is never updated at all", "0, an empty path, though the path needs at least one node", "The sum of all values, since every arm is clamped at 0", "The largest single value, which is the correct answer"]
  answer: 1
  explanation: >-
    Clamping arms at 0 is correct (an arm that hurts is dropped), but best itself must be able to hold a negative single-node path, so it must start at negative infinity. Starting at 0 silently returns an empty path instead of the largest single value.
- q: >-
    Which problem is best solved with a top-down parameter rather than a bottom-up return value?
  options: ["Whether the tree is height-balanced at every node", "Count of nodes whose value is at least every ancestor's", "Height of the tree, from the root to its deepest leaf", "Diameter, the longest path between any two nodes"]
  answer: 1
  explanation: >-
    Whether a node is good depends only on its ancestors, which is information that flows down. Height, diameter and balance are properties of the subtree below a node, which flow up.
- q: >-
    Kth smallest in a BST using the iterative in-order traversal. What is the time complexity, and what augmentation makes repeated queries faster on a frequently modified tree?
  options: ["O(k log n); keep a heap of the k smallest keys", "O(log n) always; no augmentation is needed", "O(n); keep the sorted values in an array alongside", "O(h + k); store each node's left-subtree size"]
  answer: 3
  explanation: >-
    The iterative in-order stops after k pops and its stack holds at most h nodes. A sorted array breaks on updates. Left-subtree sizes let you decide at each node whether the kth is left, here or right, so a query walks one root-to-node path: O(h) per query and per update.
- q: >-
    In Path Sum II, a candidate appends the live path list to the results whenever a leaf matches. Every result comes out identical. Why?
  options: ["The base case fires on internal nodes as well as leaves", "Every result is the same list object, which keeps changing", "The recursion visits the leaves in the wrong order each time", "Python lists cannot be nested inside another list"]
  answer: 1
  explanation: >-
    The path list is shared across the whole recursion and keeps being mutated by later pops and appends. Recording it stores a reference, not a snapshot. Append path[:] or [...path] at the moment of the match.
```
