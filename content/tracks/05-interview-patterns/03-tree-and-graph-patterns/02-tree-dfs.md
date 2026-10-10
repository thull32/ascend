---
slug: tree-dfs
title: "Tree DFS: what to pass down and what to return up"
description: Recognise subtree questions, choose between top-down parameters and bottom-up return values, and see Diameter, Validate BST, Max Path Sum and Kth Smallest traced call by call.
minutes: 40
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
- The tree is **huge and degenerate** (a linked list of 10⁵ nodes) and the language has a small call stack. Python's default recursion limit is 1,000 frames; Node's default stack holds on the order of 10⁴. Convert to an explicit stack, or use BFS.
- The problem is a **graph with cycles** dressed up as a tree ("nodes with a parent pointer", "n-ary structure with shared children"). You need a visited set, which is [Graph traversal](/learn/interview-patterns/tree-and-graph-patterns/graph-traversal).

The single most useful question to ask yourself is: *to answer for this node, what do I need to know about each child?* If the answer is "one number", the recursion returns that number. If it is "two numbers", return a tuple. If the node also needs to know something about its ancestors, that becomes a parameter. The lessons in [Tree recursion patterns](/learn/data-structures/trees/tree-recursion-patterns) cover the theory; this lesson is about recognising which shape a problem wants in the first minute.

### Near misses

| Statement | Looks like | Actually | The tell |
|---|---|---|---|
| "Is this tree symmetric?" | Same-tree on `root.left` and `root.right` | Lockstep DFS, but comparing `a.left` with `b.right` and `a.right` with `b.left` | The mirror swaps which children pair up; the plain same-tree call returns false on a symmetric tree |
| "Is `t` a subtree of `s`?" | One bottom-up pass | `same(s, t)` at every node of `s`, `O(n·m)`, or serialise both and string-match in `O(n + m)` | The answer at a node does not combine the children's answers; it restarts a comparison |
| "Sum of nodes at the deepest level" | Bottom-up: return `(depth, sum)` | Works, and so does BFS keeping the last level; BFS is shorter | Level questions belong to [Tree BFS](/learn/interview-patterns/tree-and-graph-patterns/tree-bfs) even when phrased as "deepest" |
| "Count nodes in a complete binary tree in better than `O(n)`" | Bottom-up count `1 + l + r` | Compare left-edge and right-edge heights; if equal the subtree is perfect and has `2^h − 1` nodes, else recurse, `O(log² n)` | "Complete" is a structural promise the plain recursion ignores |
| "Longest path where consecutive values differ by exactly 1" | Diameter with a side channel | The same shape, but the arm only extends when `child.val == node.val ± 1`, otherwise it contributes 0 | Diameter with a condition on the edge, not on the node |
| "Flatten the tree to a linked list in pre-order, in place" | Pre-order visit collecting nodes, then rewire | Reverse post-order (right, left, root) with a `prev` pointer rewires in `O(1)` extra space | Rewiring in pre-order destroys the right pointer before you have visited it |
| "Nodes at distance `k` from a node" | DFS with a depth parameter | Graph BFS after a parent map | Distance runs upward too |

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
{"type": "tree", "algorithm": "diameter", "values": [1, 6, 4, 8, 3, 5, 7, 9], "heightUnit": "nodes", "title": "Diameter: return height, record the best left + right", "caption": "Each call returns its height to the parent and updates the global best with left + right."}
```

The complexity of every shape is `O(n)` time, because each node is visited once and the combine step is `O(1)`, and `O(h)` space for the recursion stack, where `h` is the height: `O(log n)` on a balanced tree, `O(n)` on a chain. Two consequences are worth stating with numbers. A balanced tree of 10⁶ nodes has height about 20, so twenty frames; a chain of 10⁶ nodes needs 10⁶ frames, and CPython's default limit is 1,000 (see "Under the hood"). And the `O(1)` combine step is only `O(1)` if it does not rebuild anything: a combine that concatenates the children's path lists, or slices an array, or calls a separate `height()` function, multiplies the cost by the subtree size and turns `O(n)` into `O(n²)` on a chain and `O(n log n)` on a balanced tree.

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

```viz
{"type": "tree", "algorithm": "inorder", "values": [5, 3, 6, 2, 4, 1], "iterative": true, "title": "In-order walk of a BST", "caption": "The stack holds the left spine; each pop yields the next key in ascending order, which is why the kth pop is the kth smallest."}
```

The follow-up is always "what if the tree is modified often and kth is queried often?": augment each node with the size of its left subtree, so the query becomes a single root-to-node walk in `O(h)` and updates cost `O(h)` too. Say that without being asked and the interviewer moves on to something harder.

## Variations

The template has three slots: what flows down (parameters), what flows up (return value), and what is recorded on the side. Every variant fills them differently.

| Problem | Flows down | Flows up | Side channel | Base case | Combine |
|---|---|---|---|---|---|
| Height / max depth | nothing | height | none | `0` | `1 + max(l, r)` |
| Diameter | nothing | height | best `l + r` | `0` | as height |
| Balanced | nothing | height or `−1` sentinel | none | `0` | `−1` if a child is `−1` or `abs(l − r) > 1` |
| Max path sum | nothing | best one-arm gain | best `val + l + r` | `0` | `val + max(l, r)` with arms clamped at 0 |
| Validate BST (bounds) | `(lo, hi)` | boolean | none | `True` | `lo < val < hi and children` |
| Validate BST (in-order) | nothing | nothing | `prev` value | | `prev < val`, then `prev = val` |
| Count good nodes | max on path | count | none | `0` | `(val >= mx) + children` |
| Path Sum II | remaining target, `path` | nothing | list of copied paths | leaf check | append `path[:]` when remaining hits 0 at a leaf |
| Same tree / symmetric | two nodes | boolean | none | both `None` | values equal and children pairs equal |
| LCA (general tree) | `p`, `q` | node or `None` | none | `None` | this node if it is `p` or `q`, else the non-null child, or this node if both children are non-null |
| Build from pre/in-order | index ranges | node | in-order index map | empty range | root is `pre[lo]`; left size is `idx − in_lo` |
| Kth smallest | `k` | nothing | counter | | in-order, stop on the kth pop |

- **Two trees in lockstep** ([Same Tree](/practice/same-tree), [Subtree of Another](/practice/subtree-of-another), symmetric tree): `go(a, b)` with base cases for both `None`, one `None`, and values differing. Subtree-of-another is `same(a, b) or subtree(a.left, b) or subtree(a.right, b)`, `O(n·m)`; the follow-up is serialising both with markers and running a string search.
- **Root-to-leaf paths** ([Path Sum II](/practice/path-sum-ii)): top-down with a `path` list you append to on entry and pop on exit. Copy the list when you record an answer; do not store the live reference.
- **Building from traversals** ([Construct from Preorder and Inorder](/practice/construct-from-preorder-inorder)): `preorder[0]` is the root; find it in `inorder` (precompute a value-to-index map to make that `O(1)`), and the left subtree has `idx` elements. Recurse on index ranges, not on sliced copies, to keep it `O(n)`.
- **Bottom-up with early exit** ([Balanced Binary Tree](/practice/balanced-binary-tree)): return the height, or −1 as a sentinel meaning "already unbalanced", and short-circuit as soon as a child returns −1. Same trick applies to "is this a BST" returning `(min, max, valid)` tuples.
- **LCA**: in a BST, walk from the root until `p` and `q` are on different sides ([LCA of BST](/practice/lowest-common-ancestor-bst)). In a general binary tree, bottom-up: return the node if it is `p` or `q`, otherwise return whichever child returned non-null, or the current node if both did.

```viz
{"type": "tree", "algorithm": "lca", "values": [6, 2, 8, 0, 4, 7, 9, 3, 5], "a": 2, "b": 8, "title": "LCA in a BST", "caption": "Walk down while both targets are on the same side; the first node that splits them is the answer."}
```
- **Iterative DFS**: an explicit stack of `(node, visited_flag)` pairs or a two-stack post-order reproduces any of these without recursion, which is the answer to "the tree has a million nodes in a chain".
- **Tree DP** (longest univalue path, house robber on a tree, count nodes satisfying a subtree predicate): every one is bottom-up returning one or more numbers per subtree; see [Interval and tree DP](/learn/algorithms/dynamic-programming/interval-and-tree-dp).

## Under the hood

**What a recursive call costs in CPython.** Each Python-level call creates a frame holding the local variables, the evaluation stack and a pointer to the code object; on CPython 3.11 and later frames are allocated in contiguous chunks rather than as separate heap objects, and a call from Python code into Python code no longer consumes C stack, which is why the interpreter can honour a raised recursion limit without crashing as readily as 3.10 did. The default limit is still 1,000 (`sys.getrecursionlimit()`; depth 990 succeeds and 1,000 raises `RecursionError` on 3.14), and it exists to catch runaway recursion, not to size your tree. Raising it to 10⁶ for a chain of 10⁶ nodes works on 3.11+ for a pure-Python recursion but costs memory per frame: a two-child height function measured about 145 bytes per frame on 3.14, so about 140 MB for the chain; the explicit stack of `(node, state)` tuples holds the same information in a list for a fraction of that. Node's default stack is about 984 KB, allowing on the order of 10⁴ frames depending on how many locals each frame carries; raising it takes a command-line flag (`--stack-size`) or running the code in a `Worker` created with `resourceLimits.stackSizeMb`, neither of which an online judge lets you choose, so the iterative version is the portable fix.

**`nonlocal` and the side channel.** A closure variable declared `nonlocal` lives in a cell object shared between the outer function and every inner call; reads and writes go through the cell, which is a pointer dereference, not a dictionary lookup. That is why `best` as a `nonlocal` costs barely more than a local. The alternatives (a one-element list, an instance attribute, a return tuple `(height, best)`) all work; the tuple version is the one to use in languages without closures over mutable locals, and it is also the one that makes the data flow visible in the signature, which some interviewers prefer.

**Why the iterative in-order stack is exactly the left spine.** Pushing while walking left leaves the stack holding the path from the root to the leftmost unvisited node, which is at most `h` entries; popping yields that node, and its right subtree is then walked left in turn. The stack depth is bounded by height, never by `k` or `n`, which is what makes early exit at the kth pop `O(h + k)`. The [traversals lesson](/learn/data-structures/trees/binary-tree-traversals) derives the pre-order and post-order stacks the same way; post-order is the awkward one because a node is visited after both children, so the explicit stack needs either a visited flag per entry or the reverse of a right-first pre-order.

**The in-order index map.** `construct-from-preorder-inorder` looks up the root's position in `inorder` at every call. Precomputing `{value: index}` makes that `O(1)`, but only if values are distinct; with duplicates the map keeps the last index and the split is wrong. Ask, and if duplicates are possible fall back to a linear scan within the current range or require a different pair of traversals.

## Failure modes

**Symptom: the diameter or balanced solution passes small tests and times out on a chain of 10⁴ nodes.** Diagnosis: `height()` is called from inside the recursion at every node, so each level rescans its subtree; on a chain that is `1 + 2 + … + n ≈ n²/2 ≈ 5 × 10⁷` visits. Fix: return the height and update the answer in the same pass, as the single-pass template does.

**Symptom: Validate BST accepts a tree the hidden tests reject.** Diagnosis: the check compares each node with its immediate children only. Reproduce with `[5, 1, 7, null, null, 3, 8]`: 3 is under 7 and below 5. Fix: pass `(lo, hi)` bounds down, or check `prev < val` in an in-order walk; and settle the duplicate policy (strict or not, and on which side) before choosing `<` versus `<=`.

**Symptom: Max Path Sum returns 0 on an all-negative tree.** Diagnosis: `best` was initialised to 0, so an empty path wins. Fix: initialise to `-inf`; keep the clamp on arms, because dropping a negative arm is correct while dropping every node is not.

**Symptom: every path in Path Sum II is the same, usually empty.** Diagnosis: `paths.append(path)` stored a reference to the shared list that later `pop`s emptied. Fix: `path[:]` or `list(path)` at the moment of recording.

**Symptom: `RecursionError` on a test whose tree is a list.** Diagnosis: height equals `n` and the recursion depth passed 1,000. Fix: an explicit stack; or, if the problem is a level question in disguise, BFS.

**Symptom: the tree built from `preorder` and `inorder` is wrong only when values repeat.** Diagnosis: the value-to-index map collapsed duplicates. Fix: confirm distinct values with the interviewer (the standard problem guarantees it) or scan for the root within the current in-order range.

## Interviewer follow-ups

**"Write the diameter without recursion."** Model answer: post-order with an explicit stack of `(node, visited)` pairs, or a two-pass approach that records a post-order sequence with a right-first pre-order and reverses it; keep a dictionary `height[node]` filled as nodes are finished, and update `best` when both children are done. Common wrong answer: a pre-order stack, which sees a node before its children's heights exist.

**"The tree is an N-ary tree. What changes in the diameter?"** Model answer: the best path through a node uses its two tallest children, so keep the top two child heights while iterating `children`, record `top1 + top2`, and return `1 + top1`. Common wrong answer: summing all child heights, which counts a path through three or more children, which is not a path.

**"Kth smallest, but the tree is updated between queries."** Model answer: store the left-subtree size in each node and maintain it on insert and delete; then a query walks one root-to-node path comparing `k` with the left size, `O(h)` per query and per update. Common wrong answer: "cache the sorted list", which is `O(n)` to rebuild after every change.

**"Validate a BST where duplicates are allowed in the left subtree."** Model answer: loosen exactly one bound: the left child inherits `hi = node.val` inclusive (`lo < val <= hi`), the right child keeps `lo = node.val` strict. Common wrong answer: making both bounds inclusive, which accepts a right child equal to its parent, which the policy forbids.

**"Subtree of Another Tree in better than `O(n·m)`."** Model answer: serialise both trees in pre-order with null markers and a delimiter that cannot occur in values (for instance `#` and a leading `,` before each value so `12` and `2` cannot alias), then run KMP or a rolling hash for the pattern in the text, `O(n + m)`. This changes the pattern from tree DFS to [string matching](/learn/data-structures/tries-and-string-structures/string-matching). Common wrong answer: hashing each subtree by value only, which collides for different shapes with the same multiset of values.

## What mid-level engineers get wrong

- **Returning the answer instead of what the parent needs.** In diameter and max path sum the return value is a one-arm quantity; the answer is recorded on the side. Returning `l + r` gives the parent a path it cannot extend.
- **Checking only the immediate children in Validate BST.** Pass bounds down or use in-order with `prev`. Also decide the duplicate policy before writing the comparison.
- **Initialising the best to 0** when values can be negative. Use `-inf` (or the root's value).
- **Forgetting to clamp negative arms** in max path sum. A negative subtree should contribute nothing, not reduce the total.
- **Storing a live reference to the path list.** Append `path[:]` (Python) or `[...path]` (JavaScript).
- **Slicing arrays in the construct-from-traversals recursion.** `preorder[1:idx+1]` copies at every level, `O(n²)` on a skewed tree. Pass index bounds.
- **`O(n²)` diameter/balanced** by calling a separate height function at every node. Compute height and the answer in one pass.
- **Treating `sys.setrecursionlimit` as the fix for deep trees.** It moves the failure from an exception to memory pressure; know the iterative version.
- **Using `if node.left` where you mean `if node.left is not None`.** A node object is always truthy, so this one is safe, but a *value* of 0 is not. Test `val` comparisons with zeros in the tree.
- **Calling symmetric-tree "same tree on the two children".** The mirror pairs `a.left` with `b.right`; the plain comparison returns false on a symmetric tree.

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
- You state **space as `O(h)`** and name the degenerate case where recursion overflows, offering the iterative version before the interviewer asks, and you know why raising the recursion limit is not the fix.
- You recognise the **follow-ups that change the pattern**: subtree-of-another in `O(n + m)` is string matching over serialisations; distance-`k` is graph BFS; repeated kth-smallest queries are an augmented tree.

## Check yourself

```quiz
- q: >-
    In the single-pass diameter solution, why does the recursive function return 1 + max(l, r) rather than l + r?
  options: ["Either works; the two values are interchangeable here", "Because returning l + r would make the recursion never terminate", "A parent can extend a path through only one arm of this node", "Because l + r is never larger than the height anyway"]
  answer: 2
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
  options: ["The largest single value, which is the correct answer", "Negative infinity, since best is never updated at all", "The sum of all values, since every arm is clamped at 0", "0, an empty path, though the path needs at least one node"]
  answer: 3
  explanation: >-
    Clamping arms at 0 is correct (an arm that hurts is dropped), but best itself must be able to hold a negative single-node path, so it must start at negative infinity. Starting at 0 silently returns an empty path instead of the largest single value.
- q: >-
    Which problem is best solved with a top-down parameter rather than a bottom-up return value?
  options: ["Whether the tree is height-balanced at every node", "Diameter, the longest path between any two nodes", "Count of nodes whose value is at least every ancestor's", "Height of the tree, from the root to its deepest leaf"]
  answer: 2
  explanation: >-
    Whether a node is good depends only on its ancestors, which is information that flows down. Height, diameter and balance are properties of the subtree below a node, which flow up.
- q: >-
    Kth smallest in a BST using the iterative in-order traversal. What is the time complexity, and what augmentation makes repeated queries faster on a frequently modified tree?
  options: ["O(log n) always; no augmentation is needed", "O(n); keep the sorted values in an array alongside", "O(h + k); store each node's left-subtree size", "O(k log n); keep a heap of the k smallest keys"]
  answer: 2
  explanation: >-
    The iterative in-order stops after k pops and its stack holds at most h nodes. A sorted array breaks on updates. Left-subtree sizes let you decide at each node whether the kth is left, here or right, so a query walks one root-to-node path: O(h) per query and per update.
- q: >-
    In Path Sum II, a candidate appends the live path list to the results whenever a leaf matches. Every result comes out identical. Why?
  options: ["The base case fires on internal nodes as well as leaves", "Python lists cannot be nested inside another list", "Every result is the same list object, which keeps changing", "The recursion visits the leaves in the wrong order each time"]
  answer: 2
  explanation: >-
    The path list is shared across the whole recursion and keeps being mutated by later pops and appends. Recording it stores a reference, not a snapshot. Append path[:] or [...path] at the moment of the match.
```
