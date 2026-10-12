---
problem: diameter-binary-tree
args: [{"$tree": [1, 2, null, 3, 4, 5, null, null, 6]}]
frames: 62
source: f81239420f120a5a
---
@0-2
The root, 1, has only a left child, 2. Node 2 has two children: 3, which has a left child 5, and 4, which has a right child 6. The longest path is 5, 3, 2, 4, 6: four edges, and it never touches the root. That is the point of this example. Every path has one topmost node where it bends. There, it runs down the left as deep as it can and down the right as deep as it can, so its length is the left height plus the right height. So we compute heights bottom-up, and at every node we also try that node as the bend, keeping the best in a variable outside the recursion. Best starts at zero.

@3-20
Height goes left before anything else: down through 1, 2 and 3 to the leaf 5. Both of 5's children are empty, height zero. As a bend, 5 gives zero plus zero, and best stays zero. It returns its height: one plus the larger child height, so 1.

@21-27
Back at 3. Its left height is 1, from the 5, and its right is empty, zero. As a bend, 3 gives a path of one edge, so best becomes 1. It returns height 2.

@28-46
Now node 2's right side: node 4. Its left is empty. Its right child is the leaf 6, which, like 5, returns height 1.

@47-49
At 4, the left height is zero and the right height is 1. As a bend that gives 1, no better than best. It returns height 2.

@50-52
Back at node 2, the interesting moment. The left height is 2 and the right height is 2. As a bend, 2 gives a path of four edges: down to 5 on one side and down to 6 on the other. Best becomes 4. But look at what 2 returns to its parent: not 4, but one plus the larger side, 3. The parent can only extend one arm of a path, never both, so the return value is the height and the two-armed path goes into the side variable. Returning the sum instead is the classic bug.

@53-59
At the root, the left height is 3 and the right is empty. As a bend, the root gives only 3, which does not beat 4. A solution that only checks paths through the root would answer 3 here, and be wrong.

@60-61
We return best: 4. One visit per node, so linear time, and space proportional to the height of the tree for the recursion. The same shape comes back in maximum path sum: the recursion returns what the parent can use, a single arm, while a side variable records what the problem asks for, the best bend. And count edges, not nodes: a single node has a diameter of zero.
