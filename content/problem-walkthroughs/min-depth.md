---
problem: min-depth
args: [{"$tree": [1, 2, 3, 4, null, null, 5, null, null, 6]}]
frames: 34
source: 0553c44f516d8240
---
@0
The tree: root 1, with children 2 and 3. Node 2 has only a left child, 4, which is a leaf. Node 3 has only a right child, 5, and 5 has a child 6 below it. The minimum depth is the number of nodes on the shortest path from the root down to a leaf. Nearest leaf is a shortest-path question, and in an unweighted tree that means breadth-first search: visit the tree level by level, and the first leaf you meet is the answer.

@1-4
The root exists, so the queue starts with node 1, and the depth is 1, the root's level. The inner loop handles exactly the nodes of one level: right now, just one.

@5-11
Take node 1 off the queue. It has children, so it is not a leaf. Both children go on the queue: 2, then 3.

@12-14
Level one is done, so depth becomes 2. The queue holds the two nodes of level two.

@15-20
Node 2. It has a left child but no right child. Here is the trap the problem is famous for. The quick recursive answer takes one plus the smaller of the two child depths, and the missing right child counts as zero, so it would call node 2 a leaf and answer 2. But a missing child is not a leaf. Node 2 has a child, so we enqueue its left child, 4, and move on.

@21-27
Node 3 has only a right child, 5, which goes on the queue. Level two is done: depth becomes 3, and the queue holds 4 and 5.

@28-31
Node 4 comes off the queue. It has no left child and no right child: a real leaf.

@32-33
We return 3 immediately. Node 5 is never expanded, and node 6 is never touched. That early exit is the point of breadth-first search here: in a tree with a shallow leaf on one side and a million nodes on the other, it stops after a handful of steps. The worst case, a long chain, is still linear time, and the space is the width of the widest level.
