---
problem: balanced-binary-tree
args: [{"$tree": [1, 2, 2, 3, null, null, 3, 4, null, null, 4]}]
frames: 45
source: 1273e606bf25ee44
---
@0-2
This tree is built to fool a check at the root. The root, 1, has two children, both 2. The left 2 hangs a chain going left: 3, then 4. The right 2 hangs a mirror chain going right. Both sides of the root have height 3, so the root looks perfectly balanced. But balance has to hold at every node, and the left 2 has a left subtree of height 2 and an empty right one. The idea that makes this linear: compute heights bottom-up, and let the height function carry the verdict. If any subtree is unbalanced, it returns a sentinel, minus one, instead of a height, and that sentinel travels straight to the top.

@3-13
We call height on the root, and it goes left before doing anything else, because a node can only be judged once its children are finished. Down through 1, the left 2, then 3, then 4, and then the empty child below 4, which returns zero.

@14-22
Node 4 is a leaf. Its left height is zero, which is not the sentinel. Its right child is empty too, also zero. The heights differ by nothing, so 4 reports height 1: one plus the larger of zero and zero.

@23-31
Back at node 3. Its left subtree, the 4, has height 1. Its right is empty, height zero. They differ by one, which is allowed, so 3 reports height 2.

@32-40
Back at the left 2. Its left subtree has height 2, and its right is empty, zero. Now the difference is two, more than one. This is the node a root-only check never looks at. Instead of a height, it returns the sentinel, minus one.

@41-43
At the root, the left result is minus one. The root does not compare anything and does not even look at its right subtree; it returns the sentinel immediately. That early return is what keeps the work linear: once a subtree has failed, nothing more needs visiting. The whole right chain under the second 2 is never touched.

@44
The top-level call compares the result with the sentinel, and since it is minus one, the answer is false. Each node is visited at most once, so time is linear, and space is the height of the tree for the recursion. The classic mistakes are checking balance only at the root, which says true here, and calling a separate height helper at every node, which recomputes the same heights level after level and costs quadratic time on a chain.
