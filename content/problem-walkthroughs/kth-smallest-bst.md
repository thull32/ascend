---
problem: kth-smallest-bst
args: [{"$tree": [5, 3, 6, 2, 4, null, null, 1]}, 4]
frames: 42
source: 21c1038de6e735d7
---
@0-2
A binary search tree rooted at 5. Its left child is 3, whose children are 2 and 4, and 2 has a left child, 1. The root's right child is 6. We want the fourth smallest value. The insight: an in-order traversal of a search tree visits the values in sorted order, so the fourth node visited is the answer. The improvement over collecting the whole traversal is simply to stop after four visits, and an explicit stack makes stopping easy. The stack starts empty, and node starts at the root.

@3-15
First we push the left spine: keep going left, pushing every node on the way. 5, then 3, then 2, then 1. Then 1's left child is empty, and the inner loop stops. The stack holds 5, 3, 2 and 1, with 1 on top: the smallest value is always the bottom of the left spine.

@16-18
Pop 1. That is the first visit, the smallest value, and k drops from four to three. Not zero yet.

@19-21
Move to 1's right child. It has none, so there is no spine to push, and we go straight back to the stack.

@22-27
Pop 2: the second smallest. K drops to two. 2 has no right child either.

@28-31
Pop 3: the third smallest. K drops to one. And 3 does have a right child, 4, so node moves there. This is the step that keeps the order right: everything in 3's right subtree is bigger than 3 but smaller than 5, which is still waiting on the stack.

@32-36
We push 4's left spine. That is just 4, since it has no left child. The stack holds 5 and 4.

@37-41
Pop 4. K drops to zero, so 4 is the fourth smallest, and we return it. Notice that 5 and 6 were never visited. The traversal stopped the moment it had the answer.

Time is the height of the tree plus k: the height to reach the smallest node, then k visits that cost constant time each on average. Space is the height, for the stack. The classic mistakes: building the full sorted list when only k values are needed; an off by one in when k is decremented, which a single-node tree with k equal to one catches; and a recursive version whose early return only leaves the current call, so the traversal keeps going.
