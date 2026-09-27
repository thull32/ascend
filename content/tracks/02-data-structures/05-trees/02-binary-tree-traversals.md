---
slug: binary-tree-traversals
title: "Binary tree traversals: four orders, three implementations"
description: Preorder, inorder, postorder and level order, recursive and with explicit stacks, Morris traversal in O(1) space, and how to pick the traversal from the shape of the problem.
minutes: 40
difficulty: medium
tags: [trees, traversal, dfs, bfs, inorder, morris]
problems: [level-order-traversal, right-side-view, zigzag-level-order, kth-smallest-bst]
---
A tree has no natural first-to-last order the way an array does. To print it, copy it, free it, serialise it, sum it or search it, you have to choose an order to visit the nodes in, and the choice is not cosmetic: the wrong order makes some problems impossible. Freeing a tree in preorder frees a node before its children and reads freed memory; evaluating an expression tree in anything but postorder computes `+` before its operands exist; reading a binary search tree in anything but inorder produces unsorted output.

There are exactly four orders worth knowing, and three ways to implement each. Interviewers test the recursive versions at the mid level; they test the iterative versions, the space cost, and the reasoning about *which* traversal a problem needs at the senior level.

## The four orders

Take the tree built by inserting `8, 3, 10, 1, 6, 14, 4, 7, 13` into a BST:

```text
          8
        /   \
       3     10
      / \      \
     1   6      14
        / \     /
       4   7   13
```

The three depth-first orders differ only in *when the node itself is visited* relative to its subtrees:

| Order | Rule | Output on the tree above |
|---|---|---|
| Preorder | node, left, right | 8 3 1 6 4 7 10 14 13 |
| Inorder | left, node, right | 1 3 4 6 7 8 10 13 14 |
| Postorder | left, right, node | 1 4 7 6 3 13 14 10 8 |

And the breadth-first order visits by depth:

| Order | Rule | Output |
|---|---|---|
| Level order | depth 0, then depth 1 left to right, … | 8 3 10 1 6 14 4 7 13 |

Notice that inorder on a BST is sorted; that is the in-order property and it is the reason the traversal has that name. Notice also that preorder starts with the root and postorder ends with it, which is what makes them the natural orders for building and destroying.

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

Each is O(n) time: every node is visited once and every null child pointer is checked once, so about 2n + 1 calls in total. Space is O(h) for the call stack: at any moment the stack holds the path from the root to the current node, plus one frame per pending right subtree, which is bounded by the height.

The one thing to internalise is that all three are the *same walk* through the tree. The walk passes each node three times: arriving from the parent, returning from the left subtree, and returning from the right subtree. Preorder records the first pass, inorder the second, postorder the third. That view is what makes the iterative versions make sense.

## Iterative versions with an explicit stack

Recursion depth equals tree height, and on a degenerate tree that is `n`. Production code that walks trees of unknown shape (a JSON document from a client, a directory tree, a parsed expression) needs an explicit stack.

### Preorder

The simplest. Push the root; then repeatedly pop, visit, and push the right child *then* the left child so that the left is processed first.

```python
def preorder_iter(root):
    out, stack = [], [root] if root else []
    while stack:
        node = stack.pop()
        out.append(node.val)
        if node.right: stack.append(node.right)
        if node.left:  stack.append(node.left)
    return out
```

### Inorder

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

Trace on the tree above: dive 8, 3, 1. Pop 1, visit, right is None. Pop 3, visit, go right to 6; dive 6, 4. Pop 4, visit. Pop 6, visit, go right to 7; dive 7. Pop 7. Stack is now [8]. Pop 8, visit, go right to 10; dive 10. Pop 10, go right to 14; dive 14, 13. Pop 13, pop 14. Done: 1 3 4 6 7 8 10 13 14.

This loop is also the engine behind a BST **iterator** with O(h) memory and amortised O(1) `next()`, which is what `kth-smallest-bst` and "BST iterator" problems want. The stack holds the path to the next node; each node is pushed and popped exactly once across the whole iteration.

### Postorder

The awkward one, because a node is visited only after *both* children, and when you pop it you need to know whether you are returning from the left or the right. Two clean solutions:

**Reverse of a modified preorder.** Preorder is node-left-right. Node-*right*-left, reversed, is left-right-node, which is postorder. Run the preorder loop pushing left before right, then reverse the output.

```python
def postorder_iter(root):
    out, stack = [], [root] if root else []
    while stack:
        node = stack.pop()
        out.append(node.val)
        if node.left:  stack.append(node.left)
        if node.right: stack.append(node.right)
    return out[::-1]
```

This works for collecting values but not for actions that must happen in true postorder as you go (freeing memory, evaluating expressions), because the "visits" happen in the wrong order and are only *reported* reversed.

**One stack with a last-visited pointer.** Peek at the top of the stack. If it has an unvisited right child, go there. Otherwise pop and visit, and remember it as `last` so the parent knows its right subtree is finished.

```python
def postorder_true(root):
    out, stack, node, last = [], [], root, None
    while stack or node:
        while node:
            stack.append(node); node = node.left
        top = stack[-1]
        if top.right and top.right is not last:
            node = top.right
        else:
            out.append(top.val)
            last = stack.pop()
    return out
```

This is the version that maps onto a real interpreter's stack, and being able to write it under pressure is a senior-level differentiator.

### Level order

Breadth-first needs a **queue**, not a stack. Push the root; repeatedly pop from the front, visit, and push both children at the back. The interview twist is "return the nodes grouped by level", which needs one extra idea: record the queue's length at the start of each level and pop exactly that many.

```python
from collections import deque

def level_groups(root):
    out = []
    queue = deque([root]) if root else deque()
    while queue:
        width = len(queue)              # nodes on this level
        level = []
        for _ in range(width):
            node = queue.popleft()
            level.append(node.val)
            if node.left:  queue.append(node.left)
            if node.right: queue.append(node.right)
        out.append(level)
    return out
```

Space is O(w), where `w` is the maximum width of the tree; for a complete tree that is n/2, which is far more than the O(h) of a depth-first walk. That is the trade: BFS finds the shallowest thing first and gives you levels for free, DFS uses less memory and gives you paths for free.

```viz
{"type": "tree", "algorithm": "level-order", "values": [8, 3, 10, 1, 6, 14, 4, 7, 13],
 "title": "Level order with a queue", "caption": "The queue front is the next node to visit; children are appended at the back, so an entire level drains before the next begins."}
```

Every level-order interview variant is this loop with a different line inside: right side view takes the last node of each level; zigzag reverses odd levels; minimum depth returns the first level containing a leaf; level averages sum then divide.

## Morris traversal: inorder in O(1) space

Both the recursive and stack versions need O(h) memory to remember the way back up. Morris traversal removes that by temporarily storing the way back *in the tree itself*, using the right pointers of nodes that have none: their right child is null, and their in-order successor is exactly the ancestor you need to return to.

For a node with a left subtree, find the rightmost node of that left subtree (the in-order predecessor). If its right pointer is null, set it to point back to the current node (a *thread*) and go left. If its right pointer already points at the current node, the left subtree is finished: remove the thread, visit the current node, and go right.

```python
def morris_inorder(root):
    out, node = [], root
    while node:
        if node.left is None:
            out.append(node.val)
            node = node.right
        else:
            pred = node.left
            while pred.right is not None and pred.right is not node:
                pred = pred.right
            if pred.right is None:          # first arrival: thread and descend
                pred.right = node
                node = node.left
            else:                           # second arrival: unthread and visit
                pred.right = None
                out.append(node.val)
                node = node.right
    return out
```

Time is still O(n): each edge is walked at most twice while finding predecessors, plus once for the traversal itself. Space is O(1). The costs are that the tree is mutated during the walk (unsafe with concurrent readers), that an exception mid-traversal leaves threads in the tree, and that the code is genuinely hard to read. It is worth knowing for the "can you do it in O(1) space?" follow-up, and worth *not* using in production unless memory is the constraint and you own the tree.

## Choosing a traversal

The traversal is chosen by *when you need the information*:

| You need… | Traversal | Examples |
|---|---|---|
| To do something with a node before its children (information flows down) | Preorder | Copy a tree, serialise, print a directory, path-sum with running total |
| To combine results from children (information flows up) | Postorder | Height, size, delete/free, evaluate an expression, balanced check, diameter |
| Sorted order on a BST, or "the k-th smallest" | Inorder | Validate BST via sortedness, kth smallest, BST to sorted list, successor |
| Anything about depth, levels, or the nearest/shallowest | Level order | Level averages, right side view, minimum depth, zigzag, connect next pointers |
| Sorted order with no extra memory | Morris | Streaming inorder over a huge tree |

Two production rules of thumb. Freeing or dropping a tree must be postorder; Rust's default `Drop` for `Option<Box<Node>>` is recursive postorder and will overflow the stack on a long chain, which is why real implementations write an iterative `Drop`. Serialising for later reconstruction is preorder with explicit null markers, covered in the [serialisation lesson](/learn/data-structures/trees/n-ary-trees-and-serialization).

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

- You describe the three depth-first orders as **one walk that passes each node three times**, and you can convert any of them to an explicit stack.
- You know postorder-by-reversed-preorder only works for collecting values, and you can write the true one-stack postorder when actions must happen in order.
- You state the space cost honestly: O(h) for DFS, O(w) for BFS, and you know which is worse on a complete tree.
- You reach for level order when the question mentions depth, levels or "nearest", and for postorder when a node's answer depends on its children.
- You can explain **Morris traversal** and why you would almost never ship it.
- You know that dropping a deep tree recursively is a stack overflow waiting to happen, and you have seen it in a real language runtime.

## Check yourself

```quiz
- q: >-
    You are implementing an interpreter for arithmetic expression trees. Which traversal evaluates them correctly?
  options: ["Level order, since operators at one depth are independent", "Inorder, because that is how the expression is written", "Preorder, because the operator must be read before its operands", "Postorder, because an operator needs both operands' values first"]
  answer: 3
  explanation: >-
    Information flows up: a node's value is computed from its children's values, so children must be evaluated first. Inorder produces the human-readable form but evaluates a left operand before knowing the operator; preorder reaches the operator before either operand has a value.
- q: >-
    An iterative inorder traversal on a balanced tree of a million nodes uses how much stack memory at peak?
  options: ["About 1,000 entries, the square root of n", "About 500,000 entries, the widest level", "About 1,000,000 entries, one per node", "About 20 entries, the height of the tree"]
  answer: 3
  explanation: >-
    The stack holds the current root-to-node path, bounded by the height, which is about log2(10^6) ≈ 20 for a balanced tree. A queue-based level order would hold up to 500,000 (the widest level).
- q: >-
    Why does pushing the right child before the left child produce a correct iterative preorder?
  options: ["Because the parent is then visited after both of its children", "Because the right subtree must be visited before the left", "Because the stack is FIFO, so the right child is popped first", "Because the stack is LIFO, so the left child is popped first"]
  answer: 3
  explanation: >-
    Preorder needs the left subtree processed entirely before the right. A stack is last-in, first-out, so pushing right then left leaves the left on top, and it and its whole subtree are handled before the right child is ever popped. The parent is visited when it is popped, before its children, not after.
- q: >-
    Which is a real drawback of Morris traversal?
  options: ["It mutates the tree mid-walk, so readers can see broken links", "It takes O(n log n) time, since each predecessor search is O(h)", "It only works on BSTs, since threads follow the sorted order", "It needs a parent pointer on every node to climb back up"]
  answer: 0
  explanation: >-
    Morris threads predecessor right-pointers back to ancestors and removes them on the second visit, so concurrent readers, or an exception mid-walk, can observe a corrupted structure. Each edge is walked at most a constant number of times, so it stays O(n) time and O(1) space, and it works on any binary tree without parent pointers.
- q: >-
    You need the values of the deepest level of a tree. The most direct approach is:
  options: ["Level order, keeping the last level the queue produces", "Postorder, keeping the last node visited in the walk", "Inorder, taking the middle element of the output", "Preorder with a depth counter, keeping the first deepest node"]
  answer: 0
  explanation: >-
    Level order produces levels in depth order, so the deepest level is simply the last group. A preorder with a depth counter that keeps only the first node at maximum depth returns one node, not the whole level; the last node in postorder is the root.
```
