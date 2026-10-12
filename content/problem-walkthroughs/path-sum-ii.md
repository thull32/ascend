---
problem: path-sum-ii
args: [{"$tree": [1, 2, 3, 4, null, 3, 5]}, 7]
frames: 56
source: 06aff2b319887fbd
---
@0
The tree: root 1, with children 2 and 3. Node 2 has one child, 4. Node 3 has two, 3 and 5. We want every root-to-leaf path that sums to 7. The insight: the path to the current node is exactly the recursion stack. So keep one shared list, append a value on the way down, pop it on the way back up, and copy the list only when a leaf matches. Instead of a running sum, each call carries what is still needed: the remaining amount.

@1-8
Results and the path both start empty. At the root, the path becomes 1, and the remaining amount drops from 7 to 6. The root has children, so we go left.

@9-13
At node 2, the path is 1, 2, and the remaining amount is 4. Node 2 is not a leaf either: go left again.

@14-19
At node 4, the path is 1, 2, 4, and the remaining amount drops to zero. Node 4 has no children, so it is a leaf, and zero remaining means a match. We store a copy of the path, not the path itself. Store the shared list and every result would change as we keep popping, ending up empty.

@20-22
On the way out, node 4 pops itself, and the path is back to 1, 2. Node 2 now tries its right child.

@23-28
There is none, so that call returns at once. Node 2 pops itself, and the path is back to 1. This pop on every exit, leaf or not, keeps the list equal to the path to the current node, which is what the siblings rely on.

@29-33
The root's right child, node 3. The path is 1, 3, and 3 is still needed.

@34-41
Its left child is a 3, a leaf. Remaining drops to zero: another match, 1, 3, 3, copied into the results. Pop it.

@42-49
Its right child, 5, is also a leaf, but the remaining amount goes to minus 2. No match. Notice we did not stop as soon as the sum overshot: values can be negative, so a later node could bring it back, and the only safe check is at a leaf.

@50-55
Everything pops back to an empty path, and we return two paths: 1, 2, 4 and 1, 3, 3. Each node is visited once, plus a copy of the path for each match, and the extra space is the height of the tree. The other classic mistake is counting a match at a node that is not a leaf.
