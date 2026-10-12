---
problem: zigzag-level-order
args: [{"$tree": [3, 9, 20, null, null, 15, 7]}]
frames: 56
source: 00535d956998fa6d
---
@0
The tree has 3 at the root, 9 and 20 below it, and 15 and 7 under the 20. Zigzag order reads the first level left to right, the next right to left, and so on: 3, then 20, 9, then 15, 7. The insight is that the zigzag belongs to the output, not to the traversal. The queue stays in plain left to right level order, every level, because each level's children depend on that order. Only the way each level's list is assembled alternates, controlled by a flag that flips once per level.

@1-5
The tree is not empty. The result starts empty, the queue holds the root, and the flag says left to right.

@6-16
Level one. The queue has one node, so the level has one value. We pop 3 and, reading left to right, append it to the end of the level list. Its children, 9 then 20, join the queue in their natural order. The level, just 3, goes into the result.

@17-20
The flag flips to right to left. A fresh level list begins, and the queue holds two nodes, 9 and 20.

@21-26
Pop 9. Reading right to left, it goes on the front of the level list, not the end. The list is 9. Node 9 has no children.

@27-35
Pop 20, and it too goes on the front: the list becomes 20, 9. That is the reversal, done as we build, with no second pass. But look at the queue: 20's children join as 15, then 7, still left to right. The level 20, 9 goes into the result.

@36-52
The flag flips back to left to right. Pop 15, append it. Pop 7, append it. The level is 15, 7.

@53-55
The flag flips once more, the queue is empty, and we return 3, then 20, 9, then 15, 7.

Each node is queued and popped once, so time is linear, and the queue holds at most the widest level. The tempting mistake is to reverse the order in which children are queued on alternate levels. It looks right for two levels and scrambles the third, because the grandchildren are then queued in a reversed parent order. Keep the traversal untouched and push the zigzag into the output. A double ended queue makes adding to the front constant time, where inserting at the front of a Python list is linear. Building normally and reversing every other level costs the same in the end.
