---
problem: lowest-common-ancestor-bst
args: [{"$tree": [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5]}, 3, 5]
frames: 14
source: 140dfefeebfb46c6
---
@0-2
A binary search tree rooted at 6. Its left child is 2, with children 0 and 4, and 4 has children 3 and 5. The right side is 8, with 7 and 9. We want the lowest common ancestor of 3 and 5: the deepest node that has both below it. The tree is a search tree, and that is the whole point. Comparing the two values with a node tells you which side each one lives on. While both are on the same side, the answer is further down that side. The first node where they split up is the answer. We sort the pair into lo, 3, and hi, 5, so each test is a single comparison, and start at the root.

@3-5
At 6, is the larger value, 5, less than 6? Yes, so both are smaller, and both live in the left subtree. Go left, to 2.

@6-9
At 2, is 5 less than 2? No. Is the smaller value, 3, greater than 2? Yes, so both are larger, and both live in 2's right subtree. Go right, to 4.

@10-13
At 4, 5 is not less than 4, and 3 is not greater than 4. The two values sit on opposite sides: 3 to the left, 5 to the right. So 4 is the split point, and we return 4. No node below 4 can hold both, because they are on different sides of it.

The same else branch covers the case where one value is the node itself, such as asking for 2 and 4: at 2, neither test passes, so 2 is returned. That is right, because a node counts as its own ancestor.

One walk from the root, so time is the height of the tree, logarithmic when balanced and linear when it degenerates into a chain. Space is constant: no paths stored, no recursion. The classic mistakes: writing or instead of and in one of the branch tests, so a split at the current node is missed; treating a value equal to the node as a reason to keep walking, which steps past the answer when one value is the other's ancestor; and storing both root-to-node paths, which works on any binary tree but ignores the ordering you were given.
