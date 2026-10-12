---
problem: max-depth-binary-tree
args: [{"$tree": [3, 9, 20, null, null, 15, 7]}]
frames: 33
source: 0a7cfda60b195dd6
---
@0-1
A tree rooted at 3. Its left child is 9, a leaf. Its right child is 20, with children 15 and 7. How deep is it, counting nodes on the longest path from the root down? The definition is the algorithm. An empty tree has depth zero, and any other tree has depth one plus the deeper of its two subtrees. That is a post-order computation: a node cannot answer until both children have. The root, 3, is not empty, so it asks its left subtree first.

@2-10
Node 9. It asks its left child, which is empty, so that call returns zero straight away. Its right child is empty too: zero. So 9 returns one plus the larger of zero and zero, which is one. A leaf has depth one.

@11-12
Back at the root, the left answer is one. Now it asks the right subtree, 20, which in turn asks its own left child first.

@13-21
That is 15, a leaf. Two empty children, two zeros, and 15 returns one. Watch the call stack: four calls deep at the moment 15 checks its empty children. That stack is the memory this algorithm uses.

@22-30
Then 20 asks its right child, 7. Also a leaf, so it also returns one.

@31
Now 20 has both answers, one and one. It returns one plus one: two.

@32
And the root has both of its answers: one from the left, two from the right. It returns one plus two: three. The longest path is 3, 20, then 15 or 7.

Every node is visited once, so time is linear. Space is the depth of the call stack, which is the height of the tree: logarithmic when balanced, linear for a chain. Python's default recursion limit is about a thousand, so a chain of ten thousand nodes will crash; that is when you switch to a level-order traversal with a queue and count levels, which uses memory proportional to the tree's width instead. The common mistakes are forgetting the plus one, and treating the recursion as free.
