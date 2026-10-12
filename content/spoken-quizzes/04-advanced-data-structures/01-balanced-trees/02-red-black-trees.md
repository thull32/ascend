---
lesson: red-black-trees
source: 1f0896668aa1a743
---
## 1

Which single change to a valid red-black tree is guaranteed to keep it valid?

A, colouring a black root red. B, colouring a red leaf black. C, deleting a red node that has no children. D, inserting a key as a black leaf.

[think]

The answer is C: deleting a red node that has no children.

Removing a childless red node changes no path's black count, and cannot create two reds in a row. Colouring a red leaf black adds a black to some paths but not others, which breaks the equal-black-count rule. A red root breaks the root rule, and a new black leaf adds a black to one path only.

## 2

During a red-black insertion, the new node z is red, its parent is red, and its uncle is red. What happens?

A, colour the parent and uncle black and the grandparent red, then continue from the grandparent. B, colour z black and stop, since the red-red pair is gone. C, rotate at the parent, then rotate at the grandparent. D, rotate at the grandparent, then swap the colours of the grandparent and parent.

[think]

The answer is A: recolour the parent and uncle black and the grandparent red, then continue from the grandparent.

A red uncle means the grandparent's 2-3-4 node is a full 4-node being split: the middle key, the grandparent, moves up as a red, which may clash with its own parent, so the loop continues. Rotations are for the black-uncle cases. Colouring z black would add a black to one path and break the black-count rule.

## 3

A red-black tree holds 2 to the 20, minus 1, keys. What is the largest height it can have?

A, 40, which is 2 times log base 2 of n plus 1. B, about 29, which is 1.44 times log n. C, 20, as in a perfect tree. D, about a million, on sorted input.

[think]

The answer is A: 40.

The bound is twice log base 2 of n plus 1, which is 2 times 20, or 40. The AVL bound would be about 29, and a perfect tree is 20. The million-node chain is impossible, because two reds in a row are forbidden.

## 4

Deleting a black leaf leaves a double-black hole, whose sibling is black with two black children. What does the fix-up do?

A, colour the sibling red, and move the problem up to the parent. B, colour the hole red, which restores the black count on its path. C, colour the sibling black and the parent red, then rotate at the sibling. D, rotate at the parent and stop, since the sibling has spare keys.

[think]

The answer is A: colour the sibling red, and move the problem up to the parent.

The sibling's 2-3-4 node has no spare key to lend, so the parent loses a black on both sides, with the sibling turning red, and the double black moves up to the parent. There the loop continues, or stops if the parent is red or the root. Rotations belong to the cases with a red sibling or a red nephew, and colouring the hole red is meaningless for a null.

## 5

Why does C plus plus implement its standard map as a red-black tree, rather than a B-tree, which is faster on large data?

A, B-trees cannot iterate keys in sorted order across nodes. B, B-trees were not yet known when the standard was written. C, the standard requires iterators to survive other inserts. D, red-black trees use less memory per key than B-trees.

[think]

The answer is C: the standard requires iterators to survive other inserts.

The standard guarantees that inserting or erasing other elements does not invalidate iterators or references, which needs one node per element. B-tree nodes move keys around within pages on inserts and splits, which would invalidate pointers to elements. B-trees iterate in order perfectly well, and Rust's B-tree map makes no such stability promise, so it could choose the faster structure.

## 6

You need a container that returns the task with the smallest deadline and lets you cancel any task by handle, with hard latency bounds. Which is the best fit?

A, a binary heap keyed by deadline. B, a red-black tree keyed by deadline. C, a sorted array of tasks by deadline. D, a hash map from deadline to task.

[think]

The answer is B: a red-black tree keyed by deadline.

A heap gives the minimum, but cancelling an arbitrary task is linear unless you add an index. A red-black tree gives worst-case log n for the minimum, insert and arbitrary delete, which is why nginx and the Linux high-resolution timers use one, caching the leftmost node so the minimum is constant time. A sorted array has linear inserts, and a hash map has no order.
