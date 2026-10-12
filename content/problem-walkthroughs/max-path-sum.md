---
problem: max-path-sum
args: [{"$tree": [-10, 9, 20, null, null, 15, 7]}]
frames: 53
source: 6628c8e6eb795778
---
@0-2
A tree rooted at minus ten. Its left child is 9, a leaf. Its right child is 20, with children 15 and 7. A path can start and end at any nodes, so what is the largest sum along one? The insight: every path has a single topmost node, where it bends. At the bend, the path is an arm going down into the left subtree, the bend node, and an arm going down into the right subtree, and either arm can be empty. So one post-order pass does it. Each node gets its children's best arms, tries itself as the bend, and returns its own best single arm to its parent. Best starts at minus infinity, not zero, because an all-negative tree has a negative answer.

@3-16
The root asks its left child, 9, for an arm. 9's children are empty and return zero. As a bend, 9 is worth zero plus 9 plus zero: 9. Best becomes 9. Then 9 returns its best single arm, also 9.

@17-31
Back at the root, the left arm is 9. Now the right side: 20 asks 15, a leaf. As a bend, 15 is worth 15, which beats 9, so best becomes 15. It returns an arm of 15.

@32-44
20 asks its right child, 7. As a bend, 7 is worth 7, not better than 15. It returns an arm of 7.

@45-47
Now node 20 has both arms: 15 on the left, 7 on the right. As a bend it is worth 15 plus 20 plus 7: 42. Best becomes 42. But what does it return to its parent? Only one arm: 20 plus the larger of 15 and 7, which is 35. A parent can extend a path down through 20 into one side, never both, because a path cannot fork.

@48-50
Back at the root, minus ten. The arms are 9 and 35. As a bend, it is worth 9 minus 10 plus 35: 34, less than 42. It returns an arm of 25, which nobody uses.

@51-52
We return 42: the path 15, 20, 7. It never touches the root.

One more detail you did not see here: each arm is clamped at zero. If a child's best arm were negative, the node would take zero instead, which means stopping rather than extending into a loss. The bend itself is never clamped, because it always includes the node's own value.

Every node is visited once, so time is linear, and space is the height of the tree for the recursion. The classic mistakes: returning the two-armed sum to the parent, which lets a path fork; starting best at zero, which breaks all-negative trees; forgetting to clamp the arms, so a negative leaf drags a good path down; and only considering paths through the root.
