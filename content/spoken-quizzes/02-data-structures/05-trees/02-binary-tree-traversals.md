---
lesson: binary-tree-traversals
source: 20f2cfb5243ad036
---
## 1

You are implementing an interpreter for arithmetic expression trees. Which traversal evaluates them correctly?

A, preorder, because the operator must be read before its operands. B, level order, since operators at one depth are independent. C, inorder, because that is how the expression is written. D, postorder, because an operator needs both operands' values first.

[think]

The answer is D: postorder, because an operator needs both operands' values first.

Information flows up: a node's value is computed from its children's values, so the children must be evaluated first. Inorder gives the human-readable form, but reaches a left operand before knowing the operator. Preorder reaches the operator before either operand has a value.

## 2

An iterative inorder traversal of a balanced tree with a million nodes uses how much stack at its peak?

A, about 500 thousand entries, the widest level. B, about a million entries, one per node. C, about 1,000 entries, the square root of n. D, about 20 entries, the height of the tree.

[think]

The answer is D: about 20 entries, the height of the tree.

The stack holds the current path from the root, so it is bounded by the height, which is about log base 2 of a million, roughly 20, for a balanced tree. A queue-based level-order traversal would hold up to 500 thousand, the widest level.

## 3

Take the perfect tree with root 1, children 2 and 3, leaves 4 and 5 under 2, and 6 and 7 under 3. A single-stack loop pops a node, emits it, then pushes its left child and then its right child. What does it emit, and why?

A, 4 2 5 1 3 7 6, an inorder, because the left child is pushed before the right. B, 1 2 4 5 3 6 7, a preorder, because a stack is last-in, first-out. C, 4 5 2 7 6 3 1, a correct postorder, because the push order is reversed. D, 1 3 6 7 2 5 4, node, right, left, because emitting at pop time visits the parent first.

[think]

The answer is D: node, right, left, because emitting at pop time visits the parent first.

Emitting a node when it is popped visits it before either child, so the loop is a preorder; pushing left before right makes the right child pop first, so the order is node, right, left. Reversing that output gives a postorder, the two-stack method, but the nodes were still touched in the wrong order, which is why the single-stack version that tracks the last visited node exists.

## 4

A lazy inorder traversal, written as a recursive generator that delegates with yield from, is fast on test trees, but takes minutes on a 100 thousand node chain. What is happening?

A, each yielded value is resumed through every enclosing generator, so the total work is n times the height. B, each yield from copies the remaining subtree into a temporary list before delegating. C, the chain pushes the recursion depth past the limit, so Python falls back to a slow path. D, generators allocate a new frame per value, so memory churn dominates on long chains.

[think]

The answer is A: each yielded value is resumed through every enclosing generator, so the total work is n times the height.

Asking the outer generator for the next value re-enters every delegating generator down to the one that produces it, so a value at depth d costs d resumptions. The total is the sum of the depths, about n squared over 2 on a chain. Frames are created once per generator, not per value, nothing is copied, and a chain deeper than the recursion limit raises an error rather than slowing down.

## 5

Which of these is a real drawback of Morris traversal?

A, it needs a parent pointer on every node to climb back up. B, it mutates the tree mid-walk, so readers can see broken links. C, it only works on binary search trees, since its threads follow the sorted order. D, it takes n log n time, since each predecessor search costs the height.

[think]

The answer is B: it mutates the tree mid-walk, so readers can see broken links.

Morris threads spare right pointers back to ancestors and removes them on the second visit, so a concurrent reader, or an exception in the middle, can see a cycle. Each edge is walked at most three times, so it stays linear time and constant space. And it works on any binary tree, with no parent pointers.

## 6

Java's tree map iterator advances in constant amortised time, with no stack. What makes that possible?

A, the map keeps a cached sorted array of entries that the iterator indexes into. B, each entry has a parent pointer, so the successor climbs until it arrives from a left child. C, the iterator threads spare right pointers back to ancestors, as Morris traversal does. D, entries are stored in level order, so the next entry sits at index 2 i plus 1.

[think]

The answer is B: each entry has a parent pointer, so the successor climbs until it arrives from a left child.

The successor is the leftmost node of the right subtree, if there is one; otherwise it climbs parent pointers while arriving from a right child. Every edge is crossed at most twice per full iteration, so the amortised cost is constant, and the memory is a single reference. The price is a third pointer per node, kept correct through rotations, plus a modification counter that makes the iterator fail fast.
