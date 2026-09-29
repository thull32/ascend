---
slug: tree-bfs
title: "Tree BFS: processing a tree one level at a time"
description: When the words "level", "row", "nearest" or "width" select a queue over recursion, the level-size loop that makes per-level work trivial, and Level Order, Right Side View, Minimum Depth and Serialize traced queue by queue.
minutes: 45
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

### Near misses

Each of these statements contains a BFS trigger word and is not a tree-BFS problem, or looks like something else and is one. The tell is in the last column.

| Statement | Looks like | Actually | The tell |
|---|---|---|---|
| "Return all nodes at distance `k` from a target node" | BFS, because "distance" | Graph BFS: you need a parent map first (one DFS), then BFS outward through children *and* parent | Distance is measured through the parent edge too, and tree nodes have no upward pointer |
| "Maximum depth of the tree" | Levels, count them with BFS | Either; the bottom-up DFS is one line (`1 + max(l, r)`) and uses `O(h)` memory | No per-level output is required, so the level loop buys nothing |
| "Sum of all root-to-leaf paths" | "Leaf", "path", sounds like min-depth | Top-down DFS carrying the running value | The answer depends on the *ancestors* of each leaf, not on its level |
| "Boundary of the tree, anticlockwise" | "Seen from the side", like Right Side View | Three DFS walks (left edge, leaves, right edge) | The output order is not by level; the left edge is visited top-down and the right edge bottom-up |
| "Vertical order traversal" | Level order rotated 90° | BFS with `(node, column)` pairs *plus* a sort inside each column by row then value | Ties inside a column are ordered by a rule BFS order does not give you |
| "Check if two trees are identical" | Compare them level by level | Lockstep DFS on both roots | Two trees with identical level lists can differ in structure (`[1, 2]` with 2 as a left child versus a right child) |

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

The JavaScript version uses the swap-a-level form: instead of a deque, it holds the current level in one array and builds the next level in another. That avoids `Array.prototype.shift()`, which can cost `O(n)` because it re-indexes the array (V8 skips the copy only in some cases, covered under the hood below); on a wide tree a `shift()`-based queue can turn the `O(n)` traversal into `O(n²)`. The Python version uses `collections.deque`, whose `popleft` is `O(1)`. Either form works in either language; know which one you are writing and why.

The invariant to say out loud: *at the top of the outer loop, the queue holds exactly the nodes of one level, in left-to-right order*. The inner loop consumes those `size` nodes and appends their children, so at the bottom of the outer loop the queue holds exactly the next level, again left to right. The argument is an induction on depth, and the code never mentions depth: the queue starts as `[root]`, level 0; if it holds exactly level `d` left to right, the inner loop dequeues those nodes in order and appends each one's left child then right child, which is left-to-right order at level `d + 1`, and nothing else is appended because `size` was fixed before any child arrived. Every node is enqueued once and dequeued once with `O(1)` work per visit, so time is `O(n)`.

The space bound is the number of nodes in the widest level plus the output. In a complete binary tree with `n` nodes the bottom level holds `⌈n/2⌉` nodes, so the queue peaks at about `n/2` entries; on a chain it peaks at 1. Concretely, for a complete tree of `n = 2²⁰ − 1 ≈ 10⁶` nodes the queue holds up to `2¹⁹ = 524,288` node references at once, which in CPython 3.14 is about 4.5 MB of deque blocks (8 bytes per slot plus block overhead, measured at 8,680 bytes for a 1,000-element deque on this platform's interpreter) before counting the nodes themselves; a recursive DFS on the same tree is 20 frames deep. On a chain of 10⁶ nodes the numbers flip: the BFS queue holds one entry and the recursive DFS needs 10⁶ frames, which no default stack allows.

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

Serialising `[1, 2, 3, null, null, 4, 5]` emits `1,2,3,#,#,4,5,#,#,#,#`: the `#` pair after `3` is the missing children of the leaf 2, and the trailing four are the missing children of 4 and 5. Deserialising consumes them in pairs: root 1 takes `2,3`; node 2 takes `#,#`; node 3 takes `4,5`; node 4 takes `#,#`; node 5 takes `#,#`. The queue and the token index advance in lockstep, which is the invariant: *the queue holds, in order, exactly the nodes whose children have not yet been read*. Output length is `2n + 1` tokens (every node emits itself and every one of the `n + 1` missing children emits a marker); time `O(n)` each way.

Watch the same encoding produced from a BST built by inserting values in order:

```viz
{"type": "tree", "algorithm": "serialize", "values": [4, 2, 6, 1, 3, 5, 7], "title": "Level-order serialisation", "caption": "Each node emits its value; each missing child emits a marker, which is what lets the decoder consume tokens in pairs."}
```

## Variations

Every variant is the same loop with one of four slots changed: what a queue entry carries, what happens per dequeued node, what happens at the end of a level, and whether you may stop early.

| Variant | Queue entry | Per node | End of level | Early exit | Cost versus the template |
|---|---|---|---|---|---|
| Level order | `node` | append `val` to `level` | append `level` | no | none |
| Right side view | `node` | record when `i == size − 1` | nothing | no | none |
| Zigzag | `node` | append `val` | reverse `level` on odd depth | no | `+O(w)` per level, `O(n)` total |
| Level maximum / average / sum | `node` | fold into an accumulator | append the accumulator | no | none, and no `level` list |
| Minimum depth | `(node, depth)` | test for leaf | none (no `size` loop needed) | yes, at the first leaf | often much less than `O(n)` |
| Maximum width | `(node, index)` with `2i`, `2i + 1` | track first and last index | `last − first + 1` | no | index grows as `2^depth`, so re-base per level in fixed-width languages |
| Next-right pointers | `node` | `prev.next = node` | reset `prev` | no | none; `O(1)` space version exists for perfect trees |
| Cousins | `(node, parent)` | compare on the target values | check same level, different parents | yes, once both found | none |
| N-ary | `node` | `for child in node.children` | as level order | no | none |
| Serialise | `node` or `None` | emit `val` or `#` | none (no `size` loop) | no | output is `2n + 1` tokens |
| Graph BFS | `node` | mark visited on enqueue | as needed | as needed | needs the visited set: [Graph traversal](/learn/interview-patterns/tree-and-graph-patterns/graph-traversal) |

- **Zigzag order** ([Zigzag Level Order](/practice/zigzag-level-order)): run the standard loop and reverse `level` on odd depths before appending. Do not try to alternate the queue direction; the queue always delivers left to right and the reversal is a presentation step. Reversing costs `O(w)` per level, `O(n)` total.
- **Level aggregates**: average, maximum, sum per level. Replace `level.append(node.val)` with an accumulator. Largest-value-per-row is "max over the inner loop".
- **Bottom-up level order**: run the standard loop and reverse `out` at the end, or `appendleft` into a deque.
- **Connect next-right pointers**: inside the inner loop keep `prev`; set `prev.next = node` when `prev` exists; the `size` boundary guarantees you never link across levels. For a *perfect* tree there is an `O(1)`-space version that walks level `d` using the pointers you built at level `d - 1`.
- **Cousins**: BFS with `(node, parent)` pairs; two values are cousins if they are dequeued in the same outer iteration with different parents.
- **Maximum width**: assign heap-style indices (`2i` and `2i + 1` for children of `i`) and take `last_index - first_index + 1` per level; the indices grow exponentially, so in a fixed-width-integer language subtract the level's first index before enqueuing children.
- **N-ary trees**: replace the two `if node.left / node.right` lines with `for child in node.children`. Everything else is identical.
- **BFS on a graph** is the same loop with a `visited` set added, which is [Graph traversal](/learn/interview-patterns/tree-and-graph-patterns/graph-traversal).

## Under the hood

**What `deque.popleft` does.** CPython's `collections.deque` is a doubly linked list of fixed blocks, each holding 64 object pointers (`BLOCKLEN` in `Modules/_collectionsmodule.c`). `popleft` advances an index inside the leftmost block and frees the block only when it empties; `append` writes into the rightmost block and allocates a new one only when it is full. Both are `O(1)` with no memmove, which is why a 10⁶-node level costs about 10⁶ pointer writes and nothing more. A Python `list` used as a queue with `pop(0)` shifts every remaining pointer left with a memmove on each call: `n` pops cost `n²/2` pointer moves, which for a 10⁵-node level is 5 × 10⁹ moves and turns a millisecond traversal into seconds. Measured on CPython 3.14, a deque of 1,000 ints occupies 8,680 bytes and a list of the same 1,000 ints 8,056; the deque's extra 8% is two link pointers per 64-slot block, unused slots in the end blocks and a larger object header, and it is the price of `O(1)` at both ends.

**Why `shift()` is the JavaScript trap.** `Array.prototype.shift()` has to make element 1 become element 0. V8 can sometimes do that by moving the start of the backing store forward ("left-trimming") instead of copying, so `shift()` on a small array looks `O(1)` in a microbenchmark. In V8's source (`src/objects/elements.cc`), `shift()` left-trims only when more than 100 elements remain and the heap allows moving the object's start, which it refuses for backing stores in large-object space, during incremental marking and while optimising-compile jobs are pending; otherwise it copies every remaining element. So a very large array, or another engine, pays `O(n)` per call. The portable way to get `O(1)` dequeue is the head index (`queue[head++]`) or the swap-a-level form, both of which never move elements.

**Recursion limits, the reason BFS wins on chains.** CPython's default recursion limit is 1,000 frames (`sys.getrecursionlimit()`; a recursive function of depth 990 succeeds and 1,000 raises `RecursionError` on 3.14). Since 3.11 a Python-to-Python call no longer consumes C stack, so raising the limit with `sys.setrecursionlimit` lets pure-Python recursion go much deeper (on 3.14, a limit of 10⁶ lets a depth-200,000 recursion finish), but every frame costs heap memory and the `sys` docs still warn that a too-high limit can crash the interpreter when recursion runs through C code. Treat it as a safety rail you raise knowingly, not a fix. Node's default stack is about 1 MB (`--stack-size` is in KB and defaults to 984), which allows on the order of 10⁴ frames; the exact number depends on how many locals each frame holds. A tree given as a chain of 10⁵ nodes therefore overflows every recursive traversal in both languages, while the BFS queue holds one node at a time. The [call stack lesson](/learn/foundations/how-code-runs/stack-heap-and-the-call-stack) has the frame layout.

**The `[1, 2, 3, null, null, 4, 5]` format.** The array every test harness uses, including this platform's `$tree` encoding, is a level-order listing with explicit `null` gaps, with two conventions that differ from the serialiser above: the children of a `null` are not listed (so the array is shorter than `2n + 1`), and trailing `null`s are trimmed. Decoding it is the same queue-of-parents loop; each real node consumes the next two tokens and a `null` consumes none. Knowing this lets you read a failing test's input as a tree in your head. The [serialisation lesson](/learn/data-structures/trees/n-ary-trees-and-serialization) compares this with pre-order encodings.

## Failure modes

**Symptom: the JavaScript solution returns a single level containing every node, or times out on a wide tree.** Diagnosis: the inner loop's bound is `queue.length`, which grows as children are pushed, or the queue is drained with `shift()` on a level of 10⁵ nodes. Reproduce with `[1, 2, 3]`: `i < queue.length` sees 3 before it stops. Fix: capture `const size = queue.length` (or build `next` in a separate array) and dequeue with a head index.

**Symptom: Right Side View passes the sample and fails a test where the left subtree is deeper.** Diagnosis: the code walks `root.right` until it is `null`. On `[1, 2, 3, 4]` it returns `[1, 3]` and the expected answer is `[1, 3, 4]`. Fix: take the last node dequeued in each level (`i == size − 1`); the view is a per-level property, not a spine.

**Symptom: Minimum Depth returns 1 for a root with one child.** Diagnosis: `1 + min(depth(left), depth(right))` treats the missing child's depth of 0 as a leaf. Fix: exclude the missing side from the `min`, or use BFS and return at the first dequeued node with no children, which also stops early.

**Symptom: the deserialiser builds a tree that is almost right, with children attached one node too late.** Diagnosis: each parent must consume exactly two tokens; the code advances the index once when the first token is `#`. Trace `1,2,3,#,#,4,5` and watch node 3 receive `#` and `4` instead of `4` and `5`. Fix: advance the index twice per parent unconditionally, guarding the bounds check on each read.

**Symptom: `RecursionError` (Python) or `RangeError: Maximum call stack size exceeded` (Node) on a test with 10⁴ nodes.** Diagnosis: the per-level output was built with a recursive DFS and the test tree is a chain. Fix: use the queue form, whose memory is proportional to width; or, if the DFS is needed for another reason, convert it to an explicit stack.

## Interviewer follow-ups

**"Can you do it without the `size` variable?"** Model answer: carry the depth with each entry (`(node, depth)`) and start a new list whenever the dequeued depth exceeds the length of the output, or push a `None` sentinel after each level and treat dequeuing it as "level finished, re-push if the queue is non-empty". Both preserve the invariant. Common wrong answer: "use a second queue", which is the swap-a-level form, valid but not what was asked, or a version that forgets to re-push the sentinel and stops after level 1.

**"The tree has 10⁷ nodes and is nearly complete. What is your memory?"** Model answer: the queue peaks at the widest level, about 5 × 10⁶ references, roughly 40 MB of pointer slots before node objects, and the output holds every value once; DFS would use about 24 frames instead. If memory is the constraint and per-level output is still required, DFS with a depth-indexed list gives the same output with `O(h)` stack, at the cost of the visit order being pre-order. Common wrong answer: "BFS is `O(n)` space, same as DFS", which is true only in the worst case and misses that the shapes are opposite.

**"Connect each node to its next-right neighbour in `O(1)` extra space."** Model answer: for a perfect binary tree, walk level `d` using the `next` pointers you set when processing level `d − 1`, wiring `node.left.next = node.right` and `node.right.next = node.next.left`; the previous level is the queue. For a general tree, keep a dummy head for the next level and a `tail` pointer that appends children as you walk the current level. Common wrong answer: a BFS with a queue, which is `O(w)` space and does not meet the constraint.

**"Now return the nodes at distance `k` from a given node."** Model answer: this changes the pattern. Build a parent map with one DFS, then BFS from the target through `left`, `right` and `parent` with a visited set, collecting the level at distance `k`; `O(n)` time. Common wrong answer: BFS downward from the target only, which misses every node reached through an ancestor.

## What mid-level engineers get wrong

- **Not capturing `size` explicitly.** Python's `range(len(queue))` evaluates the length once, so the bug hides until the same code is written in JavaScript, where `i < queue.length` grows with the queue. Capture it in both languages so the intent is visible.
- **`Array.prototype.shift()` as a queue.** Engine-dependent, and `O(n)` per call in the cases that matter. Use the swap-a-level form or a head index.
- **Not handling the empty tree.** `deque([None])` puts `None` in the queue, and `node.left` on it throws. Return early on `root is None`.
- **Enqueuing `None` children in the level loop.** In the level-order template, skip missing children; in the serialiser, enqueue them deliberately because you need to emit a marker. Mixing the two conventions produces `None.left` errors or missing markers.
- **Assuming BFS is always cheaper than DFS.** The queue holds a full level; on a complete tree that is `n/2` nodes. DFS holds a root-to-leaf path. Name the shape of the tree when you state the space bound.
- **Comparing two trees by their level lists.** Without null markers, `[1, 2]` with 2 as a left child and `[1, 2]` with 2 as a right child look identical. Use the lockstep DFS from [Tree DFS](/learn/interview-patterns/tree-and-graph-patterns/tree-dfs), or compare serialisations that include the markers.
- **Treating "distance from a node" as a tree problem.** The parent edge makes it a graph; without a parent map and a visited set the search only ever goes down.

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
- You know **`shift()` can be O(n)** in JavaScript and use a head index or the swap-a-level form, and you know `deque.popleft` is O(1) in Python.
- You recognise the LeetCode array format as a **level-order serialisation with explicit nulls**, and can explain why the deserialiser consumes tokens in pairs.
- When the interviewer asks for the DFS version of a level problem, you can give it (depth-indexed lists) and explain **when you would prefer it** (narrow deep trees, or when you also need subtree information).
- You can put **numbers on the queue**: about `n/2` entries on a complete tree, one on a chain, and you know that CPython's deque is a linked list of 64-slot blocks so `popleft` never moves elements, while `list.pop(0)` does.
- You recognise **"distance `k` from a node"** as the follow-up that turns tree BFS into graph BFS with a parent map, and say so before writing a downward-only search.

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
    Every dequeued node owns exactly two tokens. Consuming only one leaves the second # to be read by the next parent, which shifts every subsequent token by one and misattaches all later children. The invariant is that queue order and token pairs advance together.
- q: >-
    The interviewer asks for every node at distance k from a given target node in a binary tree. Why does the tree-BFS template not apply directly, and what is the fix?
  options: ["It applies directly; run the level loop from the target and take level k", "The tree must first be converted to a BST so that distance is well defined", "BFS cannot count distance; only a recursive DFS can measure it correctly", "Distance runs through parents too; build a parent map, then BFS with a visited set"]
  answer: 3
  explanation: >-
    Nodes at distance k can sit above the target or in a sibling subtree, reachable only by an upward step that tree nodes do not provide. One DFS records each node's parent; a BFS from the target then expands left, right and parent, with a visited set because the parent edge makes the structure a graph. A downward-only BFS from the target misses every node reached through an ancestor.
```
