---
problem: right-side-view
args: [{"$tree": [1, 2, 3, 4]}]
frames: 41
source: 51d68393615aa64c
---
@0
The tree has 1 at the root, 2 on the left and 3 on the right, and 4 hanging below 2, on the left side. Standing to the right of it you see 1, then 3, then 4. That 4 is the trap: following right pointers from the root would stop at 3 and miss it, because the right subtree is shorter. The node you see at each depth is the last node on that level, wherever it lives. So we go level by level and keep the last node of each.

@1-5
The root is not empty, so we start with an empty view and a queue holding just the root. The size of the queue, taken before the level starts, is how many nodes belong to this level. Here, one.

@6-13
We pop 1. Its index is zero and the level size is one, so it is the last node on its level, and 1 goes into the view. Then its children join the queue, left first: 2, then 3.

@14-16
Second level. The queue holds 2 and 3, so the size is two. Taking that size up front is what draws the line between levels, even though new children will be added during the round.

@17-22
We pop 2. Its index is zero, not the last of two, so it is not visible. Its left child, 4, joins the queue behind 3. It has no right child.

@23-28
We pop 3, index one, the last on this level. 3 goes into the view: 1, 3. Node 3 has no children to add.

@29-37
Third level. Only 4 is in the queue, so the size is one, and 4 is both the first and the last node on its level. 4 goes into the view: 1, 3, 4. It has no children.

@38-40
The queue is empty, so we return 1, 3, 4. Node 4 is visible even though it sits in the left subtree, because nothing to its right reaches that depth.

Every node is enqueued and popped once, so time is linear, and the queue holds at most the widest level. The alternative is a depth first search that visits the right child before the left: the first node you reach at each new depth is the visible one, and the space is the tree's height. The mistakes are following only right pointers, and in the search version, visiting left first, which gives you the left side view instead.
