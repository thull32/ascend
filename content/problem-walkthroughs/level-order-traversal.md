---
problem: level-order-traversal
args: [{"$tree": [3, 9, 20, null, null, 15, 7]}]
frames: 47
source: 32fdc0ee40aaa323
---
@0-3
A tree rooted at 3. Its children are 9 and 20, and 20 has children 15 and 7. We want the values level by level: 3, then 9 and 20, then 15 and 7. Breadth first search already visits nodes in level order, because a node's children join the back of the queue behind everything already waiting. The only missing piece is where one level ends and the next begins. Here is the trick. At the start of each round, the queue holds exactly the current level and nothing else, so its length tells you how many nodes to take. The tree is not empty, so we start the result and put the root in the queue.

@4-5
Round one. The queue holds one node, so this level has exactly one node. We read that length once, before the loop starts adding children.

@6-11
Pop 3 from the front and record it. It has a left child, 9, and a right child, 20, so both join the back of the queue.

@12-14
That was the one node of this level, so the round is over even though the queue is not empty. The level, just 3, goes into the result. The queue holds 9 and 20: exactly the next level.

@15-20
Round two. The queue's length is two, so we will take exactly two nodes. Pop 9 and record it. It has no children, so nothing is added.

@21-27
Pop 20 and record it. Its children, 15 and 7, join the queue. They are behind nothing from this level, because we already took both.

@28-30
Two nodes taken, so the round ends, and 9, 20 goes into the result. The queue holds 15 and 7.

@31-44
Round three, two nodes. Pop 15 and record it; no children. Pop 7 and record it; no children. The level 15, 7 goes in, and the queue is empty.

@45-46
The loop ends, and we return three levels: 3; then 9 and 20; then 15 and 7.

Every node is enqueued and dequeued once, so time is linear. The queue holds at most one level and a bit, so space is the tree's maximum width. The classic mistakes: reading the queue's length inside the inner loop, so it grows as children are added and the levels bleed into each other; and using a plain list with pop from the front, which shifts every element and makes the whole traversal quadratic on a wide tree. A deque pops from the front in constant time.
