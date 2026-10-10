---
lesson: binary-tree-traversals
source: c088e0a7fcceb4f7
fit: partial
desk:
  - "The seven-node tree and its four orders, side by side"
  - "The recursive code, and the iterative preorder and inorder traces with the stack at each step"
  - "The BST iterator code"
  - "Iterative postorder: the two-stack trace and the last-visited trace, step by step"
  - "The grouped level-order code and its queue trace"
  - "The Morris traversal code and its ten-step thread trace"
  - "The choosing-a-traversal and implementation trade-off tables"
  - "Exercises: inorder without recursion, and level order grouped by depth"
---
## Introduction

A tree has no natural first-to-last order the way an array does. To print it, copy it, free it, serialise it or search it, you have to choose an order to visit the nodes in, and the choice is not cosmetic. Free a tree parent-first and you read memory you have already released. Evaluate an expression tree in the wrong order and you compute a plus sign before its operands exist. Read a binary search tree in anything but inorder and the output is not sorted.

There are four orders worth knowing, and three ways to implement each. At the mid level, interviewers test the recursive versions. At the senior level, they test the iterative versions, the space cost, and the reasoning about which traversal a problem needs.

Three ideas, then. All three depth-first orders are one walk. How to take the recursion away with an explicit stack, and the one order where that gets awkward. And how to choose the traversal from the shape of the problem.

## Four orders, one walk

Here is a tree to hold in your head. The root is 1. Its left child is 2 and its right child is 3. Node 2 has two leaves under it, 4 on the left and 5 on the right. Node 3 is a leaf. Five nodes.

Preorder visits the node, then its left subtree, then its right: 1, 2, 4, 5, 3. Inorder is left, node, right: 4, 2, 5, 1, 3. Postorder is left, right, node: 4, 5, 2, 3, 1. And level order goes depth by depth, left to right: 1, 2, 3, 4, 5.

Notice that preorder starts with the root and postorder ends with it. That is what makes them the natural orders for building and for destroying. And notice that inorder here is not sorted, because this is not a binary search tree. Sortedness belongs to the search tree's invariant, not to the traversal.

Now the one thing to internalise. The three depth-first orders are the same walk. The walk passes each node three times: arriving from its parent, coming back from its left subtree, and coming back from its right subtree. Preorder records the first pass. Inorder records the second. Postorder records the third. Hold that picture, because it explains every iterative version.

The recursive code is the definition transcribed: an empty node returns, otherwise recurse left, recurse right, and record the node before, between or after. Each version makes 2n plus 1 calls, one per node and one per empty child pointer, so order n time. Space is order h, the height, because the call stack holds only the path from the root to where you are.

One trap in Python. A recursive generator using yield from looks like the cleanest lazy traversal. But each value produced at depth d is passed up through d generators, one resumption each. The total is the sum of all node depths, order n times h. On a 1,000-node chain, that is 499,500 resumptions to yield 1,000 values. Quadratic, and the profiler shows the time inside generator machinery rather than your code.

## Taking the recursion away

Recursion depth equals tree height, and on a degenerate tree that is n. Code that walks trees of unknown shape, a client's JSON document, a directory tree, a parsed expression, needs an explicit stack.

Preorder is easy. Push the root. Then repeatedly pop a node, record it, and push its right child and then its left child, so the left one pops first. On the five-node tree: pop 1, push 3 and 2. Pop 2, push 5 and 4. Pop 4, pop 5, pop 3. Out comes 1, 2, 4, 5, 3.

Inorder needs a different shape, because you cannot record a node when you first reach it; its left subtree comes first. So dive left, pushing every node on the way. When you run out of left children, pop, record, and step to the right child. On the five-node tree: push 1, 2 and 4. Pop 4 and record it; it has no right child. Pop 2, record it, step right to 5. Push 5, pop it, record it. Pop 1, record it, step right to 3. Push 3, pop it, record it. Out comes 4, 2, 5, 1, 3, and the stack never held more than three nodes, the height plus one.

That loop is also the engine of a binary search tree iterator. Keep the left spine on a stack. Each call to next pops a node and pushes the left spine of its right child. A single call can push a whole spine, order h work, but every node is pushed and popped exactly once across the whole iteration, so next is constant time amortised, with order h memory. Flattening the tree into a list up front is the common wrong answer: order n memory.

## Postorder, the awkward one

Postorder is hard iteratively because a node may only be recorded after both children, and when it reaches the top of the stack you need to know whether you are coming back from the left or from the right.

Here is the classic mistake. Pop a node, record it, push left then right. On the five-node tree, that records 1, 3, 2, 5, 4. Before I tell you what that is: is it postorder?

[pause]

No. Recording at pop time visits the parent before its children, so it is a preorder, with the children swapped: node, right, left. Read it backwards and you get 4, 5, 2, 3, 1, which is postorder. That is the two-stack method: push each popped node onto a second stack and read it out at the end. It is fine for collecting values. It is wrong for actions that must happen in true postorder as you go, like freeing memory or evaluating an expression, because the nodes were touched in the wrong order and only reported reversed. And the second stack is order n.

The correct single-stack version keeps one extra variable: the last node you recorded. Dive left as in inorder. Then peek at the top. If it has a right child, and that right child is not the node you last recorded, go right. Otherwise both subtrees are done, so pop it, record it, and remember it as last. On the five-node tree, the key moment is node 2 appearing on top for the second time. The only way to know its right side is finished is that the last node recorded was 5, its right child. Order n time, order h space, true postorder. Writing that under pressure is a senior differentiator, and the full trace is at your desk.

## Level order and the width cost

Breadth-first needs a queue. Push the root. Repeatedly take from the front, record, and add both children at the back.

The interview twist is: return the nodes grouped by level. That needs one more idea. At the start of each level, read the queue's length, and take exactly that many. Without it, the queue holds the tail of one level and the head of the next, and nothing tells you where the boundary is. Every level-order variant is this loop with one different line inside. Right side view takes the last node of each level. Zigzag reverses every other level. Minimum depth returns at the first level containing a leaf.

The cost is width, not height. A complete tree's widest level holds about half the nodes, so a balanced tree of a million nodes keeps up to 500 thousand in the queue, against about 20 on a depth-first stack. That is the trade. Breadth-first finds the shallowest thing first and gives you levels for free. Depth-first uses less memory and gives you paths for free. And in Python, never use pop from the front of a list as the queue; each pop is order n and the whole walk becomes quadratic. Use a deque or a head index.

## Morris traversal

Every version so far needs order h memory to find the way back up. Morris traversal does inorder in constant space by storing the way back inside the tree. The rightmost node of a left subtree, the in-order predecessor, has an empty right pointer, and the node you need to return to is exactly the ancestor above. So on first arrival you point that empty slot back up, a thread, and go left. On second arrival you find the thread, remove it, record the node, and go right. Each edge is walked at most three times, so it is still order n time, with a constant about three times a stack traversal's.

Why is it a follow-up answer and not production code? It mutates the tree mid-walk. While a thread exists, any concurrent reader following right pointers sees a cycle and loops forever. An exception in the middle leaves a cycle there permanently. So you only run it if you own the tree and nobody else reads it.

Real libraries avoid both recursion and Morris. Java's TreeMap gives every entry a parent pointer. The successor of an entry is the leftmost node of its right subtree, or else climb parents until you arrive from a left child. Each edge is crossed at most twice per full iteration, so constant time amortised with constant memory, at the price of a third pointer per node kept correct through every rotation.

## Choosing a traversal

The traversal is chosen by when you need the information. Copying a tree, or serialising it for reconstruction, is preorder: the parent must exist before its children are attached. Size, height, diameter, freeing, and evaluating an expression are postorder: a node's answer depends on its children's answers. Sorted output, the k-th smallest, and validating a search tree are inorder. Anything about depth, levels, or "nearest to the root" is level order.

Two production rules. Freeing or dropping a tree must be postorder, and iterative if the tree can be deep; Rust's default drop on a long chain is recursive and overflows the stack. And serialising for later reconstruction is preorder with explicit null markers.

## In the interview

A follow-up the lesson expects. Can you produce level order without a queue?

[pause]

Yes. Do a preorder depth-first walk carrying the depth, and append each node to the list for its depth. Depth-first visits left before right at every depth, so each level comes out left to right. It uses order h stack instead of order w queue, which matters on a wide, bushy tree. The wrong answer is "no, breadth-first needs a queue", which confuses the visiting order with the grouping.

And another. Reconstruct a tree from its preorder and inorder sequences. The first preorder value is the root. Find it in the inorder sequence with a hash map from value to index. Everything to its left in inorder is the left subtree, and that count tells you where the left subtree ends in preorder. Recurse. Order n with the map. Searching the list inside the recursion makes it order n squared, and duplicate values make it ambiguous.

## Recap

Four things to remember. Preorder, inorder and postorder are one walk passing each node three times; pick which pass you record. The naive single-stack postorder is a reversed preorder; for true postorder keep a last-visited pointer. Depth-first costs the height, breadth-first costs the width, and on a complete tree the width is half the nodes. And choose the traversal by when you need the information: preorder to build, postorder to compute from children and to free, inorder for sorted, level order for depth.

At your desk: the seven-node tree and its four orders, the stack traces for each iterative version, the iterator and level-order code, the Morris trace, the decision tables, and the two exercises.
