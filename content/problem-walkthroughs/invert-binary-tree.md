---
problem: invert-binary-tree
args: [{"$tree": [4, 2, 7, 1, 3, 6, 9]}]
frames: 66
source: f8224b93d8d5420b
---
@0-2
A tree rooted at 4. Its left child is 2, with children 1 and 3; its right child is 7, with children 6 and 9. We want its mirror image. Hold onto one sentence, because it is the whole function: the mirror of a tree is its root with the mirror of the old right subtree on the left, and the mirror of the old left subtree on the right. So each node does one swap, and recursion does the rest. At the root, 4 is not empty, so we swap its children in one tuple assignment. Now 7 is on the left and 2 on the right. Then we recurse into the new left child.

@3-5
That is 7. Watch the call stack grow by one. We swap 7's children, so 9 is now on its left and 6 on its right, and recurse left again.

@6-17
Node 9 is a leaf. Swapping its two empty children changes nothing, and both recursive calls hit the base case: an empty subtree is its own mirror, so they return none straight away. Then 9 returns itself.

@18-32
Back at 7, we recurse right, into 6. Same story: a leaf, a harmless swap, two empty calls. 6 returns, and then 7 returns. The whole right half of the original tree is now mirrored and sitting on the left.

@33-35
Back at the root, we recurse into its new right child, 2. We swap 2's children: 3 moves to the left and 1 to the right.

@36-48
Into 3, a leaf. Swap, two empty calls, return.

@49-63
Into 1, also a leaf. Swap, two empty calls, return. Then 2 returns.

@64-65
And the root returns itself. The tree now reads 4 at the top, 7 and 2 below it, and 9, 6, 3, 1 along the bottom: the exact mirror.

Every node is visited once, so time is linear. Space is the depth of the recursion, the height of the tree: here three calls deep at most, logarithmic for a balanced tree, but linear for a chain, which is when you switch to an explicit stack. The swap can happen before or after the recursive calls, because a node's swap does not depend on anything below it. The classic mistakes are forgetting the empty check at the top, so leaves crash, and swapping with a temporary and then recursing into the wrong child twice; the one-line tuple swap avoids that.
