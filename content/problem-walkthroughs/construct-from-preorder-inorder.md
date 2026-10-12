---
problem: construct-from-preorder-inorder
args: [[3, 9, 20, 15, 7], [9, 3, 15, 20, 7]]
frames: 73
source: 668cce7fb302b6ba
---
@0-8
Preorder is 3, 9, 20, 15, 7. Inorder is 9, 3, 15, 20, 7. Two facts rebuild the tree. Preorder puts the root first. Inorder puts the root between its subtrees, so once you know the root, everything to its left in inorder is the left subtree and everything to its right is the right subtree. To make that split cheap, we first build a map from each value to its inorder position: 9 at zero, 3 at one, 15 at two, 20 at three, 7 at four. And instead of slicing arrays, we keep one pointer into preorder, the next root to use, starting at zero. Build works on a range of inorder positions, from lo up to but not including hi. The first call covers all five.

@9-14
The range is not empty, so the next preorder value is the root: 3. The pointer moves to 1. The map says 3 sits at inorder position 1. So position zero, just the 9, forms the left subtree, and positions 2 to 4 form the right.

@15-20
We build the left subtree first, and that order is essential. Preorder lists the whole left subtree before the right one, so the pointer must be spent on the left first. The range is position zero only. The next preorder value is 9, the pointer moves to 2, and 9 sits at inorder position zero.

@21-29
Both of 9's ranges are empty: nothing to its left, and nothing between it and the 3. Each empty range returns nothing, and 9 comes back as a leaf. The left child of 3 is 9.

@30-36
Now the right subtree of 3: positions 2 to 4. The pointer is at 2, so the root is 20, and the pointer moves to 3. The map puts 20 at inorder position 3: position 2 is its left subtree, and position 4 is its right.

@37-51
The left of 20 is position 2 alone. The pointer gives 15, exactly the value at that position, and it moves to 4. Both of 15's ranges are empty, so it is a leaf.

@52-67
The right of 20 is position 4. The pointer gives 7, and moves to 5. Another leaf.

@68-72
20 returns with children 15 and 7, and 3 returns with children 9 and 20. The pointer has reached 5: every preorder value was used exactly once. The map makes each root lookup constant time, and the ranges avoid copying, so the whole build is linear in time and space.

The bugs to avoid: building the right subtree before the left, which hands the right subtree the left's values; slicing the arrays at every level, which is quadratic on a chain; and trying to split by preorder position. The split always comes from inorder.
