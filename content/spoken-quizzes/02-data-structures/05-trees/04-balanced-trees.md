---
lesson: balanced-trees
source: 2a16a0bdf4337e36
---
## 1

After a right rotation at node y, whose left child is x, which statement is true?

A, the tree's height always drops by one, and the inorder sequence is unchanged. B, x is now above y, so the inorder sequence changes. C, y's right subtree becomes x's left, and the inorder sequence is unchanged. D, x's right subtree becomes y's left, and the inorder sequence is unchanged.

[think]

The answer is D: x's right subtree becomes y's left, and the inorder sequence is unchanged.

The subtree that sits between x and y in inorder, x's right, stays between them by becoming y's left, and y's right subtree stays where it is. Rotations never change the inorder sequence; they only change which of two adjacent nodes is on top. The height drops only when the rotation was fixing an imbalance.

## 2

In an AVL tree, a node has a balance factor of plus 2, and its left child has a balance factor of minus 1. Which fix is needed?

A, a single left rotation at the node, as for the right-right case. B, rotate right at the left child, then left at the node, the right-left case. C, a single right rotation at the node, as for the left-left case. D, rotate left at the left child, then right at the node, the left-right case.

[think]

The answer is D: rotate left at the left child, then right at the node, the left-right case.

A left-heavy node whose left child leans right is the zig-zag left-right case, and the tell is the opposite signs. A single right rotation would just move the heavy subtree to the other side, and leave the mirror-image imbalance. The first rotation straightens the shape into the left-left case.

## 3

An AVL insert never needs more than one rotation, single or double, but a delete may need one per level. What explains the difference?

A, deletion removes a key from the middle of the tree, which invalidates every height above it. B, insert always adds a leaf, and leaves never change balance factors above their parent. C, the fixing rotation after an insert restores the subtree to its height before the insert, so ancestors are unaffected. D, insert rotations are single and delete rotations are double, so each delete counts twice.

[think]

The answer is C: the fixing rotation after an insert restores the subtree to its height before the insert, so ancestors are unaffected.

After an insert, the rotation at the lowest unbalanced node brings that subtree back to exactly its old height, so no ancestor's balance factor changed and the walk stops. A delete shortens a subtree, and a repairing rotation can shorten it again, which is exactly what unbalances the next ancestor up.

## 4

In a red-black tree, why is the height at most 2 times log base 2 of n plus 1?

A, reds cannot stack, so no path is more than twice the all-black shortest path, and b levels of black nodes hold at least 2 to the b, minus 1, nodes. B, the root is black and each insert adds at most one red node, so reds are at most half the nodes. C, recolouring keeps the number of red nodes below the number of black nodes overall. D, every path alternates colours, so exactly half the nodes on any path are black.

[think]

The answer is A: reds cannot stack, so no path is more than twice the all-black shortest path.

The shortest path from the root to a null is all black, with a length equal to the black height. The longest alternates red and black, so it is at most twice that. The black nodes alone contain a perfect tree of at least 2 to the black height, minus 1, nodes, so the black height is at most log base 2 of n plus 1. Paths need not alternate exactly, and nothing bounds the total count of red nodes against black ones.

## 5

Why do most standard libraries use red-black trees instead of AVL trees for their ordered maps?

A, they rebalance with a bounded number of rotations per update, but allow taller trees. B, AVL trees cannot delete without rebuilding the whole tree. C, red-black trees have smaller height, so lookups need fewer comparisons. D, red-black trees store no extra data per node, so they use less memory.

[think]

The answer is A: they rebalance with a bounded number of rotations per update, but allow taller trees.

AVL keeps a tighter height, about 1.44 log n against 2 log n, but may rotate at every level during a delete. Red-black fix-ups are bounded by two rotations per insert and three per delete, and are mostly recolouring. Both store one extra field per node, a height or a colour, and it is AVL, not red-black, that has the smaller height.

## 6

A database stores a billion rows with a B-plus tree index over 16 kibibyte pages, each holding about 1,000 keys. Roughly how many pages does a point lookup read?

A, about 9, if each level cuts the rows by 10. B, about 1,000, one per key in the leaf page. C, about 30, one per level of a binary tree. D, about 3 or 4, one per level of the B-plus tree.

[think]

The answer is D: about 3 or 4, one per level of the B-plus tree.

Each level divides the remaining keys by about 1,000: a billion to a million, to a thousand, to one, so three internal levels plus the leaf. A binary tree would need 30 levels, each a separate page read. The keys inside one page are searched in memory, not read one page each.
