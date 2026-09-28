---
slug: binary-tree-traversals
title: "Binary tree traversals: four orders, three implementations"
description: Preorder, inorder, postorder and level order, recursive and with explicit stacks, Morris traversal in O(1) space, and how to pick the traversal from the shape of the problem.
minutes: 45
difficulty: medium
tags: [trees, traversal, dfs, bfs, inorder, morris]
problems: [level-order-traversal, right-side-view, zigzag-level-order, kth-smallest-bst]
---
A tree has no natural first-to-last order the way an array does. To print it, copy it, free it, serialise it, sum it or search it, you have to choose an order to visit the nodes in, and the choice is not cosmetic: the wrong order makes some problems impossible. Freeing a tree in preorder frees a node before its children and then reads freed memory; evaluating an expression tree in anything but postorder computes `+` before its operands exist; reading a binary search tree in anything but inorder produces unsorted output.

There are four orders worth knowing and three ways to implement each. Interviewers test the recursive versions at the mid level; they test the iterative versions, the space cost, and the reasoning about *which* traversal a problem needs at the senior level. This lesson uses one seven-node tree for every trace so that you can check each table against the previous one.

## The four orders on one tree

```text
          1
        /   \
       2     3
      / \     \
     4   5     6
              /
             7
```

In the level-order encoding the harness uses, this is `[1, 2, 3, 4, 5, null, 6, null, null, null, null, 7]`. The values are the level-order positions, so the level-order output reads 1 to 7 and the other three orders are visibly different from it. Node 3 has only a right child and node 6 only a left child, which is what exercises the null branches in the traces below.

The three depth-first orders differ only in *when the node itself is visited* relative to its subtrees:

| Order | Rule | Output on the tree above |
|---|---|---|
| Preorder | node, left, right | 1 2 4 5 3 6 7 |
| Inorder | left, node, right | 4 2 5 1 3 7 6 |
| Postorder | left, right, node | 4 5 2 7 6 3 1 |
| Level order | depth 0, then depth 1 left to right, and so on | 1 2 3 4 5 6 7 |

Preorder starts with the root and postorder ends with it, which is what makes them the natural orders for building and destroying. Inorder on a binary *search* tree is sorted; on this tree, which is not a BST, it is not, and that is a useful reminder that the property belongs to the BST invariant, not to the traversal.

```viz
{"type": "tree", "algorithm": "inorder", "values": [8, 3, 10, 1, 6, 14, 4, 7, 13],
 "title": "Inorder traversal", "caption": "Go left as far as possible, visit, then go right. On a BST the visit sequence is sorted."}
```

## Recursive versions

The recursive code is the definition transcribed:

```python
def preorder(node, out):
    if node is None:
        return
    out.append(node.val)
    preorder(node.left, out)
    preorder(node.right, out)

def inorder(node, out):
    if node is None:
        return
    inorder(node.left, out)
    out.append(node.val)
    inorder(node.right, out)

def postorder(node, out):
    if node is None:
        return
    postorder(node.left, out)
    postorder(node.right, out)
    out.append(node.val)
```

Each is O(n) time: every node is visited once and every null child pointer is checked once, 2n + 1 calls in total (15 for the seven-node tree). Space is O(h) for the call stack, which holds the path from the root to the current node; on this tree the deepest moment is the path 1 → 3 → 6 → 7 plus the null probe below 7, five frames.

The one thing to internalise is that all three are the *same walk*. The walk passes each node three times: arriving from the parent, returning from the left subtree, and returning from the right subtree. Preorder records the first pass, inorder the second, postorder the third. That view is what makes the iterative versions make sense, and it is why the single-stack postorder below needs to know *which* return it is on.

### What a recursive call costs in CPython

Since CPython 3.11, a Python-to-Python call does not recurse in C: the interpreter pushes a new frame onto a per-thread data stack (chunks of heap memory) and continues in the same C loop. A frame is on the order of 100–200 bytes for a function like `inorder` (the frame header plus slots for its two locals and its evaluation stack; the exact figure depends on the version and the function). The recursion limit, 1,000 by default, is a count of those frames. So a 10^5-deep recursion is no longer a C stack overflow risk after `sys.setrecursionlimit`, but it still costs a frame push and pop per node, which is several times the cost of a list append; the explicit-stack versions below do the same work with a tuple push instead.

Generators are the trap. A recursive generator using `yield from` looks like the cleanest lazy traversal:

```python
def inorder_gen(node):
    if node:
        yield from inorder_gen(node.left)
        yield node.val
        yield from inorder_gen(node.right)
```

Every value yielded at depth d is passed up through d generator frames, one resumption each, because `next()` on the outer generator re-enters each delegating generator in turn. Measured by counting those intermediate re-yields: a 1,000-node chain yields 1,000 values with 499,500 intermediate resumptions, and a balanced 1,023-node tree needs 8,194. The total is the sum of node depths, O(n·h): quadratic on a chain. The iterative generator in the next section yields each value with O(1) work.

## Iterative preorder with an explicit stack

Recursion depth equals tree height, and on a degenerate tree that is n. Production code that walks trees of unknown shape (a JSON document from a client, a directory tree, a parsed expression) needs an explicit stack. In every table the stack is written bottom to top, so the rightmost entry is the next to pop.

Push the root; then repeatedly pop, visit, and push the right child *then* the left child so that the left is popped first.

```python
def preorder_iter(root):
    out, stack = [], [root] if root else []
    while stack:
        node = stack.pop()
        out.append(node.val)
        if node.right: stack.append(node.right)   # pushed first, popped last
        if node.left:  stack.append(node.left)
    return out
```

| Step | Pop and emit | Push | Stack after |
|---|---|---|---|
| 0 | | 1 | [1] |
| 1 | 1 | 3, 2 | [3, 2] |
| 2 | 2 | 5, 4 | [3, 5, 4] |
| 3 | 4 | | [3, 5] |
| 4 | 5 | | [3] |
| 5 | 3 | 6 | [6] |
| 6 | 6 | 7 | [7] |
| 7 | 7 | | [] |

Emitted: 1 2 4 5 3 6 7. The stack peaks at three entries, which is not the height: it holds one pending right sibling per level of the current left spine, so it is bounded by h + 1.

## Iterative inorder and the BST iterator

You cannot visit a node when you first reach it; you have to finish its left subtree first. So walk left pushing every node, and only when you run out of left children do you pop, visit, and step to the right child.

```python
def inorder_iter(root):
    out, stack, node = [], [], root
    while stack or node:
        while node:                 # dive left, remembering the path
            stack.append(node)
            node = node.left
        node = stack.pop()          # leftmost unvisited node
        out.append(node.val)
        node = node.right           # its right subtree is next
    return out
```

| Step | Action | Stack after | `node` becomes | Emitted so far |
|---|---|---|---|---|
| 1–3 | push 1, push 2, push 4 | [1, 2, 4] | 4.left = None | |
| 4 | pop 4, emit | [1, 2] | 4.right = None | 4 |
| 5 | pop 2, emit | [1] | 2.right = 5 | 4 2 |
| 6 | push 5 | [1, 5] | 5.left = None | |
| 7 | pop 5, emit | [1] | 5.right = None | 4 2 5 |
| 8 | pop 1, emit | [] | 1.right = 3 | 4 2 5 1 |
| 9 | push 3 | [3] | 3.left = None | |
| 10 | pop 3, emit | [] | 3.right = 6 | 4 2 5 1 3 |
| 11–12 | push 6, push 7 | [6, 7] | 7.left = None | |
| 13 | pop 7, emit | [6] | 7.right = None | 4 2 5 1 3 7 |
| 14 | pop 6, emit | [] | 6.right = None | 4 2 5 1 3 7 6 |

Each node is pushed once and popped once, so the whole loop is O(n) with a stack that never exceeds the height plus one. This loop is also the engine behind a BST **iterator** with O(h) memory and amortised O(1) `next()`, which is what `kth-smallest-bst` and "BST iterator" problems want:

```python
class InorderIterator:
    def __init__(self, root):
        self.stack = []
        self._push_left(root)
    def _push_left(self, node):
        while node:
            self.stack.append(node); node = node.left
    def has_next(self):
        return bool(self.stack)
    def next(self):
        node = self.stack.pop()
        self._push_left(node.right)    # may push many nodes now, but each is pushed only once ever
        return node.val
```

A single `next()` can push a whole left spine, O(h) work, but every node is pushed and popped exactly once across the entire iteration, so n calls cost O(n) total: O(1) amortised.

## Iterative postorder

The awkward one, because a node is visited only after *both* children, and when you pop it you need to know whether you are returning from the left or from the right. The naive attempt, "pop, emit, push left then right", produces 1 3 6 7 2 5 4 on our tree: that is node-right-left, the reverse of postorder, because emitting at pop time is a preorder with the children swapped. Two correct methods follow.

### Two stacks

Run that swapped preorder (node, right, left) but move each popped node onto a second stack instead of emitting it; the second stack, read top to bottom, is left-right-node.

```python
def postorder_two_stacks(root):
    s1, s2 = [root] if root else [], []
    while s1:
        node = s1.pop()
        s2.append(node)
        if node.left:  s1.append(node.left)     # left pushed first so right is popped first
        if node.right: s1.append(node.right)
    return [n.val for n in reversed(s2)]
```

| Step | Pop from S1, push to S2 | Push to S1 | S1 after | S2 after |
|---|---|---|---|---|
| 1 | 1 | 2, 3 | [2, 3] | [1] |
| 2 | 3 | 6 | [2, 6] | [1, 3] |
| 3 | 6 | 7 | [2, 7] | [1, 3, 6] |
| 4 | 7 | | [2] | [1, 3, 6, 7] |
| 5 | 2 | 4, 5 | [4, 5] | [1, 3, 6, 7, 2] |
| 6 | 5 | | [4] | [1, 3, 6, 7, 2, 5] |
| 7 | 4 | | [] | [1, 3, 6, 7, 2, 5, 4] |

S2 reversed: 4 5 2 7 6 3 1. This works for collecting values but not for actions that must happen in true postorder as you go (freeing memory, evaluating an expression), because the nodes are *touched* in the wrong order and only *reported* reversed. It also needs O(n) space for S2.

### One stack with a last-visited pointer

Dive left as in inorder. Then peek at the top: if it has a right child that is not the node you last emitted, go there; otherwise both subtrees are done, so pop and emit, and remember the node as `last`.

```python
def postorder_true(root):
    out, stack, node, last = [], [], root, None
    while stack or node:
        while node:
            stack.append(node); node = node.left
        top = stack[-1]
        if top.right and top.right is not last:
            node = top.right                 # right subtree still pending
        else:
            out.append(top.val)
            last = stack.pop()               # tells the parent its right side is done
    return out
```

| Step | Action | Stack after | `last` | Emitted so far |
|---|---|---|---|---|
| 1–3 | push 1, 2, 4 | [1, 2, 4] | | |
| 4 | peek 4: no right, pop and emit | [1, 2] | 4 | 4 |
| 5 | peek 2: right is 5, not `last`, descend | [1, 2] | 4 | |
| 6 | push 5 | [1, 2, 5] | 4 | |
| 7 | peek 5: no right, pop and emit | [1, 2] | 5 | 4 5 |
| 8 | peek 2: right is 5 == `last`, pop and emit | [1] | 2 | 4 5 2 |
| 9 | peek 1: right is 3, descend | [1] | 2 | |
| 10 | push 3 | [1, 3] | 2 | |
| 11 | peek 3: right is 6, descend | [1, 3] | 2 | |
| 12–13 | push 6, push 7 | [1, 3, 6, 7] | 2 | |
| 14 | peek 7: no right, pop and emit | [1, 3, 6] | 7 | 4 5 2 7 |
| 15 | peek 6: no right, pop and emit | [1, 3] | 6 | 4 5 2 7 6 |
| 16 | peek 3: right is 6 == `last`, pop and emit | [1] | 3 | 4 5 2 7 6 3 |
| 17 | peek 1: right is 3 == `last`, pop and emit | [] | 1 | 4 5 2 7 6 3 1 |

Step 8 is the whole idea: node 2 is on top for the second time, and the only way to know that its right subtree is finished is that the last emitted node was its right child. O(n) time, O(h) space, true postorder as you go. This is the version that maps onto a real interpreter's stack, and writing it under pressure is a senior-level differentiator.

## Level order with a queue

Breadth-first needs a **queue**. Push the root; repeatedly pop from the front, visit, and push both children at the back.

| Step | Pop and emit | Push | Queue after |
|---|---|---|---|
| 0 | | 1 | [1] |
| 1 | 1 | 2, 3 | [2, 3] |
| 2 | 2 | 4, 5 | [3, 4, 5] |
| 3 | 3 | 6 | [4, 5, 6] |
| 4 | 4 | | [5, 6] |
| 5 | 5 | | [6] |
| 6 | 6 | 7 | [7] |
| 7 | 7 | | [] |

The interview twist is "return the nodes grouped by level", which needs one extra idea: record the queue's length at the start of each level and pop exactly that many. At step 2 above the queue is [3, 4, 5] and contains two levels; only the length snapshot tells you where one ends.

```python
from collections import deque

def level_groups(root):
    out = []
    queue = deque([root]) if root else deque()
    while queue:
        width = len(queue)              # nodes on this level, and only this level
        level = []
        for _ in range(width):
            node = queue.popleft()
            level.append(node.val)
            if node.left:  queue.append(node.left)
            if node.right: queue.append(node.right)
        out.append(level)
    return out
```

Space is O(w), where w is the maximum width; for a complete tree that is n/2, far more than the O(h) of a depth-first walk. That is the trade: BFS finds the shallowest thing first and gives you levels for free, DFS uses less memory and gives you paths for free. Every level-order interview variant is this loop with a different line inside: right side view takes the last node of each level; zigzag reverses odd levels; minimum depth returns the first level containing a leaf; level averages sum then divide.

```viz
{"type": "tree", "algorithm": "level-order", "values": [8, 3, 10, 1, 6, 14, 4, 7, 13],
 "title": "Level order with a queue", "caption": "The queue front is the next node to visit; children are appended at the back, so an entire level drains before the next begins."}
```

## Morris traversal: inorder in O(1) space

Both the recursive and stack versions need O(h) memory to remember the way back up. Morris traversal removes that by storing the way back *in the tree itself*, using the right pointers of nodes that have none: the rightmost node of a left subtree (the in-order predecessor) has a null right pointer, and its in-order successor is exactly the ancestor you need to return to.

At a node with a left subtree, find that predecessor. If its right pointer is null, set it to point back to the current node (a *thread*) and go left. If its right pointer already points at the current node, the left subtree is finished: remove the thread, visit the current node, and go right.

```python
def morris_inorder(root):
    out, node = [], root
    while node:
        if node.left is None:
            out.append(node.val)
            node = node.right                       # may follow a thread back up
        else:
            pred = node.left
            while pred.right is not None and pred.right is not node:
                pred = pred.right
            if pred.right is None:                  # first arrival: thread and descend
                pred.right = node
                node = node.left
            else:                                   # second arrival: unthread and visit
                pred.right = None
                out.append(node.val)
                node = node.right
    return out
```

| Step | At | Predecessor walk | Action | Emit | Move to |
|---|---|---|---|---|---|
| 1 | 1 | 2 → 5; 5.right is None | create thread 5 → 1 | | 2 |
| 2 | 2 | 4; 4.right is None | create thread 4 → 2 | | 4 |
| 3 | 4 | no left child | emit | 4 | 4.right, which is the thread to 2 |
| 4 | 2 | 4; 4.right is 2: thread found | remove thread 4 → 2, emit | 2 | 5 |
| 5 | 5 | no left child | emit | 5 | 5.right, the thread to 1 |
| 6 | 1 | 2 → 5; 5.right is 1: thread found | remove thread 5 → 1, emit | 1 | 3 |
| 7 | 3 | no left child | emit | 3 | 6 |
| 8 | 6 | 7; 7.right is None | create thread 7 → 6 | | 7 |
| 9 | 7 | no left child | emit | 7 | 7.right, the thread to 6 |
| 10 | 6 | 7; 7.right is 6: thread found | remove thread 7 → 6, emit | 6 | None |

Output 4 2 5 1 3 7 6, and after step 10 every thread has been removed, so the tree is exactly as it started. Counting every pointer move (descents, predecessor-walk steps and thread hops) gives 18 on a tree with 6 edges: each edge is walked at most three times, once during a predecessor search, once descending, once returning along the thread, and this tree hits the 3 × 6 bound exactly. So time is O(n) with a constant about three times a stack traversal's, and space is O(1).

### Why it is a follow-up answer, not production code

The tree is **mutated** during the walk: between steps 1 and 6 node 5's right pointer points at node 1, so any concurrent reader following right pointers sees a cycle (1 → 2 → 5 → 1) and loops forever or reads the wrong subtree. An exception between those steps leaves the thread in place permanently. And the code is hard to review. Preorder has a Morris variant (emit on the first arrival instead of the second); postorder needs a further trick of reversing right spines.

The idea has a respectable ancestor. The Deutsch-Schorr-Waite algorithm marks a heap for garbage collection with no mark stack by reversing pointers as it descends and restoring them as it returns, exactly Morris's trick applied to arbitrary graphs. Several early collectors used it because a mark stack could itself run out of memory during collection; modern collectors keep an explicit mark stack with overflow handling because pointer reversal writes to every object twice and cannot run alongside mutator threads that read those pointers.

## Under the hood: how real libraries traverse

**Java's `TreeMap` iterator** uses no stack at all. Each entry stores a parent pointer, and `next()` calls `successor(e)`: if `e` has a right child, go to the leftmost node of that subtree; otherwise climb through parent pointers while you are arriving from a right child, and stop at the first ancestor you reach from the left. Across a full iteration every edge is traversed at most twice (once down, once up), so `next()` is O(1) amortised with O(1) memory, at the price of a third pointer per node and the work of maintaining it through rotations. The iterator also checks a modification counter on every `next()` and throws `ConcurrentModificationException` if the map changed underneath it, which is the library-grade version of "Morris breaks concurrent readers".

**The DOM's `TreeWalker`** and `NodeIterator` are iterative for the same reason: every DOM node has `parentNode`, `firstChild` and `nextSibling`, so `nextNode()` is "first child if any, else next sibling, else climb parents until one has a next sibling". A page with 10^5 nodes and a deeply nested `<div>` chain from generated markup would overflow a recursive walker's stack in JavaScript's roughly 10^4-frame budget; the parent-pointer walk never recurses.

**Rust's default `Drop`** for `Option<Box<Node>>` is recursive postorder: dropping a node drops its children, which drop theirs. On a long chain that overflows the 8 MiB main-thread stack, so real implementations write an iterative `Drop` that pops children into a `Vec` and drops them one at a time. The same recursion hides in C++ `unique_ptr` destructors and in any language with recursive destructors.

## Choosing a traversal

The traversal is chosen by *when you need the information*:

| Task | Traversal | Why |
|---|---|---|
| Copy or clone a tree | Preorder | The parent must exist before its children can be attached |
| Serialise for reconstruction; print prefix notation | Preorder (with null markers) | The root comes first, so the decoder knows what it is building |
| Free, size, height, diameter, "is balanced" | Postorder | A node's answer depends on its children's answers |
| Evaluate an expression tree | Postorder | An operator needs both operand values first |
| Sorted output, k-th smallest, validation by sortedness of a BST | Inorder | The BST invariant makes left-node-right ascending |
| Width, level averages, shortest path to a leaf, closest to the root, right side view | Level order | Depth is the grouping; the shallowest answer is reached first |
| Print infix notation | Inorder (with parentheses) | Operator between operands |
| Sorted streaming with no extra memory | Morris | O(1) space, if you own the tree and no one else reads it |

Two production rules of thumb. Freeing or dropping a tree must be postorder, and iterative if the tree can be deep. Serialising for later reconstruction is preorder with explicit null markers, covered in the [serialisation lesson](/learn/data-structures/trees/n-ary-trees-and-serialization); a preorder without nulls is ambiguous unless you also have the inorder sequence.

## Trade-offs across implementations

| Implementation | Extra space | Mutates tree | Early exit | Deep-tree safe | Code risk |
|---|---|---|---|---|---|
| Recursive DFS | O(h) call frames | No | Return through every frame | No: limit of 1,000 frames in CPython, ~10^4 in the JVM and V8 | Lowest |
| Explicit-stack DFS | O(h) heap | No | `return` from the loop | Yes, bounded by heap | Low; postorder needs `last` |
| Iterator with parent pointers | O(1) | No, but needs a third pointer maintained on every update | Yes | Yes | Medium |
| Morris | O(1) | Yes, temporarily | Leaves threads behind unless you unwind | Yes | High |
| Level order (queue) | O(w), up to n/2 | No | Yes | Yes | Low |

## Production failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| Service dies with a stack overflow on one input after months; the trace is the same traversal function repeated | Recursive traversal on a tree whose height a client controls (nested document, chain-shaped index) | Explicit stack; a depth limit on parsers; measure the height of incoming structures |
| A lazy traversal is fast on fixtures and quadratic on a real dataset | `yield from` recursion: each element resumes O(depth) generators, O(n·h) total, 499,500 resumptions for a 1,000-node chain | Explicit-stack generator that yields at each pop |
| Readers of a shared tree hang or return garbage while a background job runs | Morris traversal (or any in-place threading) under concurrent readers; a thread makes a cycle visible for the duration of the walk | A stack-based traversal, or exclusive access for the duration of the walk |
| "Right side view" or "level averages" returns nodes from the wrong depth | Level order without level boundaries: the queue mixes the tail of one level with the head of the next | Snapshot `len(queue)` per level, or store (node, depth) pairs |
| Deleting a subtree reads freed memory or double-frees | Preorder free: the parent's storage is released before the children are reached through it | Postorder, iterative when depth is unbounded |

## Interviewer follow-ups

**"Reconstruct the tree from its preorder and inorder sequences."** Model answer: the first preorder value is the root; find it in the inorder sequence (a hash map from value to index makes that O(1)); everything to its left in inorder is the left subtree, and its size tells you where the left subtree's preorder ends. On our tree, preorder 1 2 4 5 3 6 7 and inorder 4 2 5 1 3 7 6: root 1 is at inorder index 3, so the left subtree is the next 3 preorder values (2 4 5) with inorder (4 2 5), and the right is (3 6 7) with (3 7 6). Recurse; O(n) with the map. Duplicate values make it ambiguous. Common wrong answer: using `list.index` inside the recursion, which is O(n²), or claiming preorder alone is enough (it is not without null markers).

**"Write a BST iterator with O(h) memory and O(1) amortised `next()`."** Model answer: the `InorderIterator` above; the stack holds the left spine from the root to the next node, `next()` pops and pushes the popped node's right child's left spine, and every node is pushed once over the whole iteration. Common wrong answer: flattening the tree into a list up front, O(n) memory, or claiming O(1) worst-case per call, which a spine push refutes.

**"Why is postorder the one you need for deletion?"** Model answer: a node's memory can only be released after nothing else needs to reach its children through it; postorder visits children first. Preorder would free the parent and then dereference it to reach the children. In garbage-collected languages the same order appears in finalisation and in `drop` of owned children. Common wrong answer: "any order works because the GC handles it", which ignores manual memory and recursive destructors.

**"Can you produce level order without a queue?"** Model answer: preorder DFS carrying the depth, appending each node to `levels[depth]`; DFS visits left before right at each depth, so each level list ends up in left-to-right order. It uses O(h) stack instead of O(w) queue, which matters on a wide bushy tree. Common wrong answer: "no, BFS needs a queue", which confuses the visit order with the grouping.

**"Serialise a binary tree so it can be rebuilt exactly."** Model answer: preorder with an explicit marker for null, so the decoder consumes tokens in the same order the encoder produced them and never needs to search; O(n) both ways, at most n + 1 null markers. Common wrong answer: preorder without markers, which cannot distinguish a left-only child from a right-only one.

## What mid-level engineers get wrong

- **Emitting at pop time and calling it postorder.** The naive single stack produces node-right-left (1 3 6 7 2 5 4 on our tree); without a `last` pointer or a second stack the parent is emitted before its children.
- **Recursion on data whose depth a client chooses.** A recursive JSON walker or directory walker works in tests and overflows at depth 1,000 in CPython.
- **`yield from` recursion for lazy traversal.** O(n·h) resumptions; on a chain it is quadratic and the profiler shows time inside the generator machinery rather than in your code.
- **Level order without a level boundary.** Every "per level" question (right side view, averages, zigzag) needs the `len(queue)` snapshot; without it the answers drift one node into the next level.
- **Using `list.pop(0)` as the queue in Python.** It is O(n) per pop, turning BFS into O(n²); use `collections.deque` or a head index.
- **Shipping Morris because it is O(1) space.** It mutates a structure other code may be reading, and an exception mid-walk leaves permanent cycles.

## Exercises

```exercise
id: inorder-iterative
title: Inorder traversal without recursion
prompt: |
  Given a binary tree as a **level-order list** with `null` gaps (LeetCode
  convention), return its inorder traversal as a list of values. Do it with
  an explicit stack, not recursion, so it survives a 100,000-node chain.

  The starter includes `build_tree`, which decodes the list into `BTNode`
  objects with `val`, `left` and `right`.
languages: [python, javascript]
entry: inorder
starter:
  python: |
    class BTNode:
        def __init__(self, val):
            self.val, self.left, self.right = val, None, None

    def build_tree(values):
        if not values or values[0] is None:
            return None
        root = BTNode(values[0])
        queue, head, i = [root], 0, 1
        while head < len(queue) and i < len(values):
            node = queue[head]; head += 1
            if values[i] is not None:
                node.left = BTNode(values[i]); queue.append(node.left)
            i += 1
            if i < len(values) and values[i] is not None:
                node.right = BTNode(values[i]); queue.append(node.right)
            i += 1
        return root

    def inorder(values):
        root = build_tree(values)
        out = []
        # explicit stack here
        return out
  javascript: |
    class BTNode {
      constructor(val) { this.val = val; this.left = null; this.right = null; }
    }

    function build_tree(values) {
      if (!values.length || values[0] === null) return null;
      const root = new BTNode(values[0]);
      const queue = [root];
      let head = 0, i = 1;
      while (head < queue.length && i < values.length) {
        const node = queue[head++];
        if (values[i] !== null && values[i] !== undefined) { node.left = new BTNode(values[i]); queue.push(node.left); }
        i++;
        if (i < values.length && values[i] !== null) { node.right = new BTNode(values[i]); queue.push(node.right); }
        i++;
      }
      return root;
    }

    function inorder(values) {
      const root = build_tree(values);
      const out = [];
      // explicit stack here
      return out;
    }
tests:
  - args: [[8, 3, 10, 1, 6, null, 14, null, null, 4, 7, 13]]
    expected: [1, 3, 4, 6, 7, 8, 10, 13, 14]
  - args: [[]]
    expected: []
    label: empty tree
  - args: [[1, null, 2, null, 3]]
    expected: [1, 2, 3]
    label: right chain
  - args: [[2, 1, 3]]
    expected: [1, 2, 3]
  - args: [[1, 2, null, 3, null, 4]]
    expected: [4, 3, 2, 1]
    hidden: true
    label: left chain
hints:
  - "Loop while the stack is non-empty or the current node is not None."
  - "Dive left pushing every node; when you cannot go left, pop, record, and set current to the popped node's right child."
```

```exercise
id: level-groups
title: Level order, grouped by depth
prompt: |
  Given a binary tree as a level-order list with `null` gaps, return a list
  of lists: the values at depth 0, then depth 1, and so on, each level left
  to right. Return `[]` for the empty tree.

  Use a queue and process one level per outer iteration by reading the
  queue's length before you start popping.
languages: [python, javascript]
entry: level_groups
starter:
  python: |
    from collections import deque

    class BTNode:
        def __init__(self, val):
            self.val, self.left, self.right = val, None, None

    def build_tree(values):
        if not values or values[0] is None:
            return None
        root = BTNode(values[0])
        queue, head, i = [root], 0, 1
        while head < len(queue) and i < len(values):
            node = queue[head]; head += 1
            if values[i] is not None:
                node.left = BTNode(values[i]); queue.append(node.left)
            i += 1
            if i < len(values) and values[i] is not None:
                node.right = BTNode(values[i]); queue.append(node.right)
            i += 1
        return root

    def level_groups(values):
        root = build_tree(values)
        out = []
        return out
  javascript: |
    class BTNode {
      constructor(val) { this.val = val; this.left = null; this.right = null; }
    }

    function build_tree(values) {
      if (!values.length || values[0] === null) return null;
      const root = new BTNode(values[0]);
      const queue = [root];
      let head = 0, i = 1;
      while (head < queue.length && i < values.length) {
        const node = queue[head++];
        if (values[i] !== null && values[i] !== undefined) { node.left = new BTNode(values[i]); queue.push(node.left); }
        i++;
        if (i < values.length && values[i] !== null) { node.right = new BTNode(values[i]); queue.push(node.right); }
        i++;
      }
      return root;
    }

    function level_groups(values) {
      const root = build_tree(values);
      const out = [];
      return out;
    }
tests:
  - args: [[8, 3, 10, 1, 6, null, 14, null, null, 4, 7, 13]]
    expected: [[8], [3, 10], [1, 6, 14], [4, 7, 13]]
  - args: [[]]
    expected: []
    label: empty tree
  - args: [[1]]
    expected: [[1]]
  - args: [[1, null, 2, null, 3]]
    expected: [[1], [2], [3]]
    label: one node per level
  - args: [[1, 2, 3, null, null, 4, 5]]
    expected: [[1], [2, 3], [4, 5]]
    hidden: true
hints:
  - "In JavaScript, shifting from an array is O(n); use a head index into the array instead, or accept it for small inputs."
  - "width = len(queue) at the top of the outer loop is the number of nodes on the current level; pop exactly that many."
```

## Senior signals

- You describe the three depth-first orders as **one walk that passes each node three times**, and you can convert any of them to an explicit stack and trace the stack by hand.
- You know why the naive single-stack postorder is wrong (it is preorder with swapped children), and you can write the `last`-pointer version when actions must happen in true postorder.
- You state the space cost honestly: O(h) for DFS, O(w) for BFS, and you know which is worse on a complete tree.
- You know a recursive `yield from` traversal is O(n·h) and you write the iterator with an explicit stack, O(1) amortised per element.
- You reach for level order when the question mentions depth, levels or "nearest", and for postorder when a node's answer depends on its children.
- You can trace **Morris traversal**, say why each edge is walked at most three times, and explain why you would almost never ship it: it mutates the tree under concurrent readers.
- You know how `TreeMap` and the DOM iterate without a stack (parent pointers, O(1) amortised successor) and what that costs per node.
- You know that dropping a deep tree recursively is a stack overflow waiting to happen, and you have seen it in a real language runtime.

## Check yourself

```quiz
- q: >-
    You are implementing an interpreter for arithmetic expression trees. Which traversal evaluates them correctly?
  options: ["Preorder, because the operator must be read before its operands", "Level order, since operators at one depth are independent", "Inorder, because that is how the expression is written", "Postorder, because an operator needs both operands' values first"]
  answer: 3
  explanation: >-
    Information flows up: a node's value is computed from its children's values, so children must be evaluated first. Inorder produces the human-readable form but evaluates a left operand before knowing the operator; preorder reaches the operator before either operand has a value.
- q: >-
    An iterative inorder traversal on a balanced tree of a million nodes uses how much stack memory at peak?
  options: ["About 500,000 entries, the widest level", "About 1,000,000 entries, one per node", "About 1,000 entries, the square root of n", "About 20 entries, the height of the tree"]
  answer: 3
  explanation: >-
    The stack holds the current root-to-node path, bounded by the height, which is about log2(10^6) ≈ 20 for a balanced tree. A queue-based level order would hold up to 500,000 (the widest level).
- q: >-
    A single-stack loop pops a node, emits it, then pushes its left child and then its right child. On the lesson's tree (preorder 1 2 4 5 3 6 7) what does it emit, and why?
  options: ["4 2 5 1 3 7 6, an inorder, because the left child is pushed before the right", "1 2 4 5 3 6 7, a preorder, because a stack is last-in first-out", "4 5 2 7 6 3 1, a correct postorder, because the push order is reversed", "1 3 6 7 2 5 4, node-right-left, because emitting at pop time visits the parent first"]
  answer: 3
  explanation: >-
    Emitting when a node is popped visits it before either child, so the loop is a preorder; pushing left before right makes the right child pop first, so the order is node-right-left. Reversing that output gives postorder (the two-stack method), but the nodes themselves were touched in the wrong order, which is why the last-visited single-stack version exists.
- q: >-
    A lazy inorder traversal written as a recursive generator with yield from is fast on test trees but takes minutes on a 100,000-node chain. What is happening?
  options: ["Each yielded value is resumed through every enclosing generator, so the total work is O(n times height)", "Each yield from copies the remaining subtree into a temporary list before delegating to it", "The chain makes the recursion depth exceed the limit, so Python falls back to a slow path", "Generators allocate a new frame per value, so memory churn dominates on long chains"]
  answer: 0
  explanation: >-
    next() on the outer generator re-enters each delegating generator down to the one that produces the value, so a value at depth d costs d resumptions; the total is the sum of depths, about n squared over 2 on a chain (499,500 for 1,000 nodes). Frames are created once per generator, not per value, nothing is copied, and a chain deeper than the recursion limit raises rather than slowing down.
- q: >-
    Which is a real drawback of Morris traversal?
  options: ["It needs a parent pointer on every node to climb back up", "It mutates the tree mid-walk, so readers can see broken links", "It only works on BSTs, since threads follow the sorted order", "It takes O(n log n) time, since each predecessor search is O(h)"]
  answer: 1
  explanation: >-
    Morris threads predecessor right-pointers back to ancestors and removes them on the second visit, so concurrent readers, or an exception mid-walk, can observe a cycle. Each edge is walked at most three times, so it stays O(n) time and O(1) space, and it works on any binary tree without parent pointers.
- q: >-
    Java's TreeMap iterator advances in O(1) amortised time with no stack. What makes that possible?
  options: ["The map keeps a cached sorted array of entries that the iterator indexes into", "Each entry has a parent pointer, so successor climbs until it arrives from a left child", "The iterator threads spare right pointers back to ancestors, as Morris traversal does", "Entries are stored in level order, so the next entry sits at index 2i + 1"]
  answer: 1
  explanation: >-
    successor(e) goes to the leftmost node of the right subtree if there is one, otherwise climbs parent pointers while it is arriving from a right child. Every edge is crossed at most twice per full iteration, so the amortised cost is O(1) and the memory is a single reference. The price is a third pointer per node kept correct through rotations, plus a modification counter that makes the iterator fail fast.
```
