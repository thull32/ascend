---
lesson: avl-trees
source: 344e2d230552d6d7
---
## 1

An AVL tree holds a million keys. Which statement about its height is guaranteed?

A, it is at most 28 levels. B, it can reach a million on sorted input. C, it is exactly 20, as in a perfect tree. D, it is at most 40 levels.

[think]

The answer is A: at most 28 levels.

The sparsest AVL tree of height 29 needs about 1.35 million nodes, more than a million, so the height is at most 28; 1.44 times log base 2 of n, about 28.7, says the same. A perfect tree would be 20, but AVL does not guarantee perfection. 40 is the red-black bound, and a million is the unbalanced worst case that AVL exists to prevent.

## 2

After an insert, the lowest unbalanced node, z, has a balance of minus 2, and its right child has a balance of plus 1. What fixes it?

A, left-rotate the right child, then right-rotate z. B, right-rotate z once, since its right child leans left. C, right-rotate the right child, then left-rotate z. D, left-rotate z once, since z is right-heavy.

[think]

The answer is C: right-rotate the right child, then left-rotate z.

Minus 2 means right-heavy, and a right child leaning left, at plus 1, is the right-left case. A single left rotation at z, the tempting fix, moves the zig-zag to the other side and leaves the tree unbalanced. Straighten the child with a right rotation first, then left-rotate at z.

## 3

Why can an AVL delete cost log n rotations, while an insert needs at most one rebalancing?

A, an insert never changes the heights of the ancestors above the new leaf. B, a delete of a node with two children unbalances both subtrees, so each needs its own rotation. C, a delete must also rebalance the successor's old subtree, in a separate pass. D, a rotation after a delete can shorten the subtree, and unbalance its parent.

[think]

The answer is D: a rotation after a delete can shorten the subtree, and unbalance its parent.

After an insert, the rebalanced subtree is back to the height it had before, so the ancestors are unaffected. After a delete, fixing one node can leave its subtree one shorter, which can unbalance the parent, and so on up to the root, as the lesson's Fibonacci-tree trace shows with two rotations. An insert does change ancestor heights on the way up; it is the rotation that restores the old height and stops the climb.

## 4

You insert the keys 1 through 7, in order, into an AVL tree. What is the root?

A, 1, which was inserted first. B, it varies with rotation tie-breaking. C, 7, which was inserted last. D, 4, with 2 and 6 as its children.

[think]

The answer is D: 4, with 2 and 6 as its children.

Sorted input triggers single left rotations at 1 after inserting 3, at 3 after 5, at 2 after 6, and at 5 after 7. The result is the perfect tree: 4 at the root, 2 and 6 below it, and 1, 3, 5 and 7 as leaves. It is deterministic: each case has exactly one fix, so there is nothing to break ties on.

## 5

A delete leaves node z with a balance of plus 2, and its left child with a balance of 0. The rebalance code chooses the left-left case if the left child's balance is above zero, and the left-right case if it is below zero. What happens?

A, the left-left branch runs, because 0 counts as leaning left. B, the left-right branch runs, and produces a valid but taller tree. C, an exception is raised when the heights are recomputed. D, neither branch runs, and z stays unbalanced with no error.

[think]

The answer is D: neither branch runs, and z stays unbalanced with no error.

A balance of 0 passes neither strict test, so the function returns z unchanged at plus 2, and the invariant is silently broken; nothing in the code checks heights against the shape. The case never arises after an insert, which is why insert-only tests miss it. The correct test for the single rotation is "at least zero".

## 6

A service keeps 50 million timestamped events in memory and runs range queries constantly, with occasional inserts. A colleague proposes an AVL tree. What is the strongest objection?

A, a red-black tree is shorter, so its reads would be faster. B, the height field on each node makes AVL trees too memory-hungry. C, an in-memory B-tree needs far fewer cache misses per lookup. D, AVL trees cannot answer range queries without a second index.

[think]

The answer is C: an in-memory B-tree needs far fewer cache misses per lookup.

Every AVL level costs a pointer dereference and, once the tree is bigger than the cache, a memory miss: about 36 of them for 50 million keys. A B-tree with 64-key nodes holds many keys per node and needs about 5. Range queries work fine on any search tree through in-order traversal, and red-black trees are slightly taller, not shorter.
