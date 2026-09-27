---
slug: tree-bfs
title: "Tree BFS: processing a tree one level at a time"
description: When the words "level", "row", "nearest" or "width" select a queue over recursion, the level-size loop that makes per-level work trivial, and Level Order, Right Side View, Minimum Depth and Serialize traced queue by queue.
minutes: 30
difficulty: medium
tags: [tree, bfs, queue, level-order, pattern:tree-bfs]
problems: [level-order-traversal, right-side-view, zigzag-level-order, min-depth, serialize-deserialize]
---
You are handed a binary tree and asked for something about its *rows*: the values grouped by depth, the last node visible from the right, the shallowest leaf, the widest level. A recursive traversal visits every node, so it can answer these too, but it visits them in the wrong order. It runs down to a leaf before it has seen the second node of level 1, and you end up carrying a depth parameter and a dictionary from depth to list just to reassemble the rows the recursion tore apart.

Breadth-first search visits the tree in exactly the order the question is asked. A queue holds the current level; you drain it, and while draining you enqueue the next level. The whole pattern is one extra line, `size = len(queue)` at the top of the outer loop, and that line is what separates candidates who fumble the per-level bookkeeping from those who write the solution in three minutes and spend the rest of the round on follow-ups.

## The signal

Reach for tree BFS when the statement contains any of these:

- **"Level", "row", "depth d", "per level"**: level-order traversal, level averages, largest value per row, zigzag order. The output is grouped by depth, and BFS produces it grouped for free.
- **"Nearest", "closest", "minimum depth", "shortest"**: the first leaf BFS reaches is the shallowest. DFS has to explore the whole tree to be sure; BFS can stop.
- **"Seen from the side"**, **"rightmost", "leftmost"**: the last (or first) node of each level.
- **"Connect nodes at the same level"** (next-right pointers), **"width of the tree"**, **"cousins"** (same depth, different parent): all of these are statements about which nodes share a level.
- **Serialisation where you want a compact, non-recursive format** and the LeetCode-style array `[1, 2, 3, null, null, 4, 5]` is the target. That array *is* a level-order listing.

What rules it out:

- **The answer is a property of subtrees** (height, diameter, path sum, is-balanced, is-BST, LCA). Those questions ask "what does the subtree below me look like", which is a post-order return value. That is [Tree DFS](/learn/interview-patterns/tree-and-graph-patterns/tree-dfs).
- **The order is in-order or pre-order** (kth smallest in a BST, build from preorder/inorder, flatten to a linked list). BFS does not produce those orders.
- **Memory is the constraint and the tree is wide.** A complete tree's bottom level holds half the nodes, so the BFS queue is `O(n)`; DFS uses `O(height)` stack, which is `O(log n)` on a balanced tree. For a *deep, narrow* tree the situation reverses: DFS recursion depth is `O(n)` and can overflow the call stack, while the BFS queue stays small.

The nearest confusable pattern is DFS with a depth parameter, which can produce per-level output by writing `levels[depth].append(node.val)`. It works, and interviewers accept it, but the pre-order visit order means "right side view" becomes "the first node visited at each depth when you visit right before left", which is an argument you have to make, where BFS makes it obvious. When the question is about levels, use the tool built for levels.

## The template

The whole pattern is a queue, an outer loop over levels and an inner loop that runs exactly `size` times. Capturing `size` before the inner loop is what pins the level boundary; without it, children enqueued during the inner loop bleed into the current level.

```python
from collections import deque

def bfs_levels(root):
    if root is None:
        return []
    out = []
    queue = deque([root])
    while queue:
        size = len(queue)                # nodes in the current level, fixed now
        level = []
        for _ in range(size):
            node = queue.popleft()
            level.append(node.val)
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
        out.append(level)                # per-level work happens here
    return out
```

```javascript
function bfsLevels(root) {
  if (root === null) return [];
  const out = [];
  let queue = [root];                    // swap-a-level form: no shift()
  while (queue.length) {
    const next = [];
    const level = [];
    for (const node of queue) {
      level.push(node.val);
      if (node.left) next.push(node.left);
      if (node.right) next.push(node.right);
    }
    out.push(level);
    queue = next;
  }
  return out;
}
```

The JavaScript version uses the swap-a-level form: instead of a deque, it holds the current level in one array and builds the next level in another. That avoids `Array.prototype.shift()`, which is `O(n)` in most engines because it re-indexes the array; on a wide tree a `shift()`-based queue turns the `O(n)` traversal into `O(n²)`. The Python version uses `collections.deque`, whose `popleft` is `O(1)`. Either form works in either language; know which one you are writing and why.

The invariant to say out loud: *at the top of the outer loop, the queue holds exactly the nodes of one level, in left-to-right order*. The inner loop consumes those `size` nodes and appends their children, so at the bottom of the outer loop the queue holds exactly the next level, again left to right. Every node is enqueued once and dequeued once: `O(n)` time. The queue's peak size is the widest level, which is `O(n)` in the worst case (a complete tree's last level has about `n/2` nodes).

Watch the queue fill and drain on a real tree:

```viz
{"type": "tree", "algorithm": "level-order", "values": [8, 3, 10, 1, 6, 14, 4, 7, 13], "title": "Level-order traversal", "caption": "Each outer iteration drains one level and enqueues the next."}
```

The reason the per-level work is trivial is that everything about level `d` (its size, its first and last node, its sum, its maximum) is available inside the outer loop body with no bookkeeping beyond `level`. The variants below are all one-line changes at the `# per-level work` spot.

## Worked problems

### Binary Tree Level Order Traversal

[Level Order Traversal](/practice/level-order-traversal): return the values grouped by level, top to bottom, left to right.

This is the template with no changes, which is exactly why it appears in phone screens: the interviewer wants to know whether you know the `size` trick or whether you will build the levels with a depth map.

Trace on the tree `[3, 9, 20, null, null, 15, 7]`, which is 3 at the root, children 9 and 20, and 20 has children 15 and 7:

| outer iteration | queue at top | `size` | dequeued (in order) | enqueued | `out` after |
|---|---|---|---|---|---|
| 1 | `[3]` | 1 | 3 | 9, 20 | `[[3]]` |
| 2 | `[9, 20]` | 2 | 9, 20 | 15, 7 | `[[3], [9, 20]]` |
| 3 | `[15, 7]` | 2 | 15, 7 | (none) | `[[3], [9, 20], [15, 7]]` |
| 4 | `[]` | | loop ends | | |

Node 9 has no children, so it enqueues nothing; node 20 enqueues 15 and 7. Because `size` was captured as 2 at the top of iteration 2, the inner loop stops after dequeuing 20 even though the queue now contains 15 and 7. That is the level boundary.

Time `O(n)`, space `O(w)` where `w` is the maximum width, plus `O(n)` for the output.

### Binary Tree Right Side View

[Right Side View](/practice/right-side-view): return the values you would see standing to the right of the tree, top to bottom.

What you see from the right is the *last* node of each level in left-to-right order. Not "the rightmost path": if the right subtree is shorter than the left, the lower levels are visible from the left subtree. That is the trap the problem is built around, and it is why the level-boundary form matters. With the boundary pinned, the answer is "the node dequeued when `i == size - 1`".

```python
def right_side_view(root):
    if root is None:
        return []
    out, queue = [], deque([root])
    while queue:
        size = len(queue)
        for i in range(size):
            node = queue.popleft()
            if i == size - 1:
                out.append(node.val)            # last node of this level
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
    return out
```

Trace on `[1, 2, 3, 4, null, null, null, 5]`: root 1 with children 2 and 3; 2 has a left child 4; 4 has a left child 5; 3 is a leaf.

| level | queue at top | dequeued | `i == size - 1` on | `out` |
|---|---|---|---|---|
| 0 | `[1]` | 1 | 1 | `[1]` |
| 1 | `[2, 3]` | 2, 3 | 3 | `[1, 3]` |
| 2 | `[4]` | 4 | 4 | `[1, 3, 4]` |
| 3 | `[5]` | 5 | 5 | `[1, 3, 4, 5]` |

Levels 2 and 3 are visible from the *left* subtree because the right subtree ended at level 1. A candidate who walks `root.right` repeatedly returns `[1, 3]` and fails the second test case. The DFS version (visit right child first, record the first node seen at each new depth) also works, but you have to argue that "first visited at this depth, right-first" equals "rightmost at this depth", whereas the BFS version is correct by inspection.

Time `O(n)`, space `O(w)`.

### Minimum Depth of Binary Tree

[Min Depth](/practice/min-depth): the number of nodes on the shortest path from the root to a *leaf*.

Two things make this a BFS problem rather than the obvious `1 + min(depth(left), depth(right))` recursion. First, the recursion is wrong as written: a node with only a right child has `depth(left) = 0`, so `min` picks the missing side and returns 1 for a node that is not a leaf. You have to special-case a missing child, and candidates forget. Second, BFS can *stop early*: the first leaf it dequeues is on the shallowest level, and nothing below needs to be visited. On a tree with one short branch and a huge deep subtree, that is the difference between `O(n)` and `O(k)` where `k` is the number of nodes at or above the shallowest leaf.

```python
def min_depth(root):
    if root is None:
        return 0
    queue = deque([(root, 1)])
    while queue:
        node, depth = queue.popleft()
        if node.left is None and node.right is None:
            return depth                          # first leaf dequeued is shallowest
        if node.left:
            queue.append((node.left, depth + 1))
        if node.right:
            queue.append((node.right, depth + 1))
```

This version carries depth *with the node* rather than using the `size` loop, which is the other legitimate BFS shape: use it when you need per-node depth and do not need level boundaries. Both shapes give identical visit order.

Trace on `[2, null, 3, null, 4, null, 5]`, a right-leaning chain 2 → 3 → 4 → 5:

| dequeued (node, depth) | leaf? | enqueued |
|---|---|---|
| (2, 1) | no, has right child | (3, 2) |
| (3, 2) | no | (4, 3) |
| (4, 3) | no | (5, 4) |
| (5, 4) | yes, return 4 | |

The naive `1 + min(0, depth(right))` recursion returns 1 here, which is the wrong answer the test suite is looking for.

Now a case where early exit pays: root 1 with left child 2 (a leaf) and a right subtree of a thousand nodes. BFS dequeues 1, enqueues 2 and 3, dequeues 2, sees a leaf, returns 2. Three nodes visited. The recursive version visits all thousand.

### Serialize and Deserialize (BFS form)

[Serialize and Deserialize](/practice/serialize-deserialize): turn a tree into a string and back. Either traversal works; the BFS form is worth knowing because its output is the `[1, 2, 3, null, null, 4, 5]` array format used in every test harness including this one's, so you can explain the encoding your tests already use.

Serialise with a plain BFS that emits `null` for missing children (no `size` loop needed; every node emits two entries). Deserialise by walking the token list with a queue of nodes waiting for children: each dequeued parent consumes the next two tokens.

```python
def serialize(root):
    if root is None:
        return ""
    out, queue = [], deque([root])
    while queue:
        node = queue.popleft()
        if node is None:
            out.append("#")
            continue
        out.append(str(node.val))
        queue.append(node.left)                 # enqueue None too; it emits "#"
        queue.append(node.right)
    return ",".join(out)

def deserialize(data):
    if not data:
        return None
    tokens = data.split(",")
    root = TreeNode(int(tokens[0]))
    queue, i = deque([root]), 1
    while queue and i < len(tokens):
        node = queue.popleft()
        if tokens[i] != "#":
            node.left = TreeNode(int(tokens[i]))
            queue.append(node.left)
        i += 1
        if i < len(tokens) and tokens[i] != "#":
            node.right = TreeNode(int(tokens[i]))
            queue.append(node.right)
        i += 1
    return root
```

Serialising `[1, 2, 3, null, null, 4, 5]` emits `1,2,3,#,#,4,5,#,#,#,#`: the trailing `#` entries are the missing children of 4 and 5 and of the leaf 2. Deserialising consumes them in pairs: root 1 takes `2,3`; node 2 takes `#,#`; node 3 takes `4,5`; node 4 takes `#,#`; node 5 takes `#,#`. The queue and the token index advance in lockstep, which is the invariant: *the queue holds, in order, exactly the nodes whose children have not yet been read*. Output length is `2n + 1` tokens; time `O(n)` each way.

## Variations

- **Zigzag order** ([Zigzag Level Order](/practice/zigzag-level-order)): run the standard loop and reverse `level` on odd depths before appending. Do not try to alternate the queue direction; the queue always delivers left to right and the reversal is a presentation step. Reversing costs `O(w)` per level, `O(n)` total.
- **Level aggregates**: average, maximum, sum per level. Replace `level.append(node.val)` with an accumulator. Largest-value-per-row is "max over the inner loop".
- **Bottom-up level order**: run the standard loop and reverse `out` at the end, or `appendleft` into a deque.
- **Connect next-right pointers**: inside the inner loop keep `prev`; set `prev.next = node` when `prev` exists; the `size` boundary guarantees you never link across levels. For a *perfect* tree there is an `O(1)`-space version that walks level `d` using the pointers you built at level `d - 1`.
- **Cousins**: BFS with `(node, parent)` pairs; two values are cousins if they are dequeued in the same outer iteration with different parents.
- **Maximum width**: assign heap-style indices (`2i` and `2i + 1` for children of `i`) and take `last_index - first_index + 1` per level; the indices grow exponentially, so in a fixed-width-integer language subtract the level's first index before enqueuing children.
- **N-ary trees**: replace the two `if node.left / node.right` lines with `for child in node.children`. Everything else is identical.
- **BFS on a graph** is the same loop with a `visited` set added, which is [Graph traversal](/learn/interview-patterns/tree-and-graph-patterns/graph-traversal).

## Pitfalls

- **Forgetting to capture `size`.** `for _ in range(len(queue))` in Python evaluates `len(queue)` once, so it happens to work; in JavaScript `for (let i = 0; i < queue.length; i++)` re-evaluates the length every iteration and swallows the next level into the current one. Capture it explicitly in both languages so the intent is visible.
- **`Array.prototype.shift()` as a queue.** `O(n)` per call on most engines. Use the swap-a-level form or a head index (`let head = 0; ... queue[head++]`).
- **Not handling the empty tree.** `deque([None])` puts `None` in the queue, and `node.left` on it throws. Return early on `root is None`.
- **Right side view by following `root.right`.** Wrong when the left subtree is deeper. Take the last node per level.
- **Minimum depth with `1 + min(left, right)`.** Returns 1 for a node with one missing child. Either special-case the missing side or use BFS and stop at the first leaf.
- **Enqueuing `None` children in the level loop.** In the level-order template, skip missing children; in the serialiser, enqueue them deliberately because you need to emit a marker. Mixing the two conventions produces `None.left` errors or missing markers.
- **Deserialising with the wrong pairing.** Every dequeued parent consumes exactly two tokens, even when both are `#`. Skipping the second token when the first is `#` desynchronises the queue from the tokens and produces a tree that looks almost right.
- **Assuming BFS is always cheaper than DFS.** The queue holds a full level; on a complete tree that is `n/2` nodes. DFS holds a root-to-leaf path. Name the shape of the tree when you state the space bound.

## Exercise

```exercise
id: largest-value-per-level
title: Largest value in each row
prompt: |
  Given the root of a binary tree, return a list containing the largest
  value at each depth, from the root level downwards. Return an empty list
  for an empty tree.

  Use a level-by-level BFS; the answer for each level must be computed
  inside the level loop. Values may be negative.
languages: [python, javascript]
entry: largest_per_level
starter:
  python: |
    from collections import deque

    def largest_per_level(root):
        # root is a TreeNode with .val, .left, .right (or None)
        return []
  javascript: |
    function largest_per_level(root) {
      // root is a TreeNode with .val, .left, .right (or null)
      return [];
    }
tests:
  - args: [{"$tree": [1, 3, 2, 5, 3, null, 9]}]
    expected: [1, 3, 9]
  - args: [{"$tree": [1, 2, 3]}]
    expected: [1, 3]
  - args: [{"$tree": []}]
    expected: []
    label: empty tree
  - args: [{"$tree": [7]}]
    expected: [7]
    label: single node
  - args: [{"$tree": [-1, -5, -3, null, -9]}]
    expected: [-1, -3, -9]
    label: all negative, so a max seeded with 0 is wrong
  - args: [{"$tree": [4, 4, 4, 4, null, null, 4]}]
    expected: [4, 4, 4]
    hidden: true
    label: duplicates
  - args: [{"$tree": [1, null, 2, null, 3, null, 4]}]
    expected: [1, 2, 3, 4]
    hidden: true
    label: right-leaning chain
hints:
  - "Capture size = len(queue) at the top of each outer iteration and dequeue exactly that many nodes."
  - "Seed the level maximum with the first dequeued value (or negative infinity), not with 0."
  - "In JavaScript, build the next level in a fresh array instead of calling shift()."
```

## Senior signals

- You capture **`size` before the inner loop** without being prompted and say why: it pins the level boundary so children enqueued now belong to the next level.
- You choose BFS for **"nearest" questions because it can stop early**, and you can quantify the saving on a lopsided tree.
- You state the **space bound in terms of tree shape**: `O(width)` for BFS, `O(height)` for DFS, and which is worse on a complete tree versus a chain.
- You know **`shift()` is O(n)** in JavaScript and use a head index or the swap-a-level form, and you know `deque.popleft` is O(1) in Python.
- You recognise the LeetCode array format as a **level-order serialisation with explicit nulls**, and can explain why the deserialiser consumes tokens in pairs.
- When the interviewer asks for the DFS version of a level problem, you can give it (depth-indexed lists) and explain **when you would prefer it** (narrow deep trees, or when you also need subtree information).

## Check yourself

```quiz
- q: >-
    A candidate writes the BFS level loop in JavaScript as for (let i = 0; i < queue.length; i++) with queue.push for children inside. What goes wrong?
  options: ["queue.length is re-read each pass, so levels merge together", "The loop never terminates, since push keeps growing length", "It works, but costs O(n log n) from the repeated length check", "Nothing; the loop ends cleanly once the queue empties"]
  answer: 0
  explanation: >-
    The loop bound grows as children are pushed, so the inner loop keeps consuming into the next level; every node ends up in one giant level. It still terminates, because the tree is finite. Capturing the size first, or building the next level in a separate array, fixes it. Python's range(len(queue)) evaluates the length once, which is why the bug is language-specific.
- q: >-
    Right Side View on the tree [1, 2, 3, 4] (node 2 has a left child 4, node 3 is a leaf). A solution that repeatedly follows root.right returns [1, 3]. The correct answer is:
  options: ["[1, 4]", "[1, 3]", "[1, 3, 4]", "[1, 2, 4]"]
  answer: 2
  explanation: >-
    Level 2 contains only node 4, in the left subtree, and it is visible from the right because nothing on that level blocks it. The view is the last node of each level, not the right spine.
- q: >-
    Why is 1 + min(min_depth(left), min_depth(right)) wrong for minimum depth, and which fix is cleanest?
  options: ["It counts the root twice; fix it by starting the count at 0", "A missing child counts as 0; treat it as infinity, or use BFS", "It is correct as written; no fix is needed at all", "It is O(n²) from repeated calls; fix it by memoising depths"]
  answer: 1
  explanation: >-
    min_depth(None) is 0, so a node with only a right child returns 1 even though it is not a leaf. Either exclude the missing side from the min (treat it as infinity) or use BFS and return at the first leaf dequeued, which additionally stops early. The recursion visits each node once, so memoising fixes nothing.
- q: >-
    A binary tree is a single chain of 100,000 nodes, each with only a right child. Which traversal is the safer choice for computing the values grouped by depth, and why?
  options: ["Recursive DFS, because it uses less memory than a queue on chains", "Either one, since both use O(n) auxiliary memory on a chain", "BFS, since its queue holds one node, not 100,000 stack frames", "Neither, until the tree is converted to an array first"]
  answer: 2
  explanation: >-
    BFS memory is proportional to the widest level, which is 1 here. Recursive DFS depth equals the chain length and overflows the call stack in Python and most JavaScript engines. On a wide balanced tree the comparison flips: BFS holds n/2 nodes, DFS holds log n frames.
- q: >-
    In the BFS deserialiser, the serialised string is 1,2,3,#,#,4,5,#,#,#,#. A candidate advances the token index by one, not two, whenever a dequeued parent's first token is #. What happens?
  options: ["Only the last level of the tree is lost; the rest is fine", "Tokens shift by one, so later children attach to wrong parents", "The tree is rebuilt correctly, since # carries no data", "An exception is thrown as soon as the first # is read"]
  answer: 1
  explanation: >-
    Every dequeued node owns exactly two tokens. Consuming only one leaves the second # to be read as the right child, which shifts every subsequent token by one and misattaches all later children. The invariant is that queue order and token pairs advance together.
```
