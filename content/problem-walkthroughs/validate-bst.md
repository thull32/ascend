---
problem: validate-bst
args: [{"$tree": [10, 5, 15, null, null, 6, 20]}]
frames: 25
source: 709e5153b1d111b9
---
@0
The root is 10, with 5 on the left and 15 on the right. Under 15 sit 6 on the left and 20 on the right. Every parent and child pair looks fine: 6 is less than 15, as a left child should be. But 6 is in the right subtree of 10, so it must be greater than 10. It is not, so this is not a valid search tree. A check that only compares parents with children cannot see that. The insight is to carry the constraints down instead. Every node inherits an open interval it must fall strictly inside. Going left, the parent's value becomes the upper bound; going right, it becomes the lower bound.

@1-4
The root may be anything: the interval is minus infinity to plus infinity. 10 is inside it. Now recurse left, with the upper bound tightened to 10.

@5-7
Node 5 must lie between minus infinity and 10. It does. Its children inherit minus infinity to 5 on the left, and 5 to 10 on the right.

@8-14
Both of 5's children are missing, and a missing node is always valid. So the left subtree checks out.

@15-17
Now the right subtree. Node 15 inherits 10 to infinity, and 15 fits. Its left child will inherit 10 to 15: both bounds, one from the root and one from 15.

@18-21
Node 6 must lie strictly between 10 and 15. It is below 10, so this returns false. The lower bound of 10 came all the way down from the root, which is exactly the constraint the local check could not see.

@22-24
The false travels back up. The and short circuits, so 20 is never visited, and the answer is false.

Every node is checked once, so time is linear, and the recursion uses the tree's height in space. The bounds must be real infinities, not the 32 bit integer limits: a single node holding the largest 32 bit value is a valid tree, and using that value as a sentinel would reject it. Use strictly less than on both sides, so duplicates are rejected. An in order traversal is the other good answer: in a valid tree, it visits values in strictly increasing order, so you only need to remember the previous value.
