---
problem: middle-of-linked-list
args: [{"$list": [1, 2, 3, 4, 5, 6]}]
frames: 13
source: 6e2f358b48cfd36c
---
@0
Six nodes, one to six. With an even length there are two middles, 3 and 4, and this problem wants the second. You could count the nodes and walk halfway, but there is a one-pass trick that shows up in harder problems: two pointers, a slow one that moves one node per step and a fast one that moves two. When the fast one has covered the whole list, the slow one has covered half.

@1-4
Both start at the head, node 1. The fast pointer and the node after it both exist, so we step: slow to 2, fast to 3.

@5-7
Again, fast is on 3 and there is a 4 after it, so we step: slow to 3, fast to 5. Notice the gap: slow has moved two nodes, fast four.

@8-10
Fast is on 5, and 6 follows, so one more step: slow to 4, and fast jumps two nodes from 5, past 6, off the end. Fast is now nothing.

@11-12
The condition fails because fast is gone, and we return slow, node 4: the second middle. On five nodes, fast would land on the last node instead, and its missing successor would stop the loop with slow on 3, the true middle. Time is linear, about n over two steps, and the space is two pointers. The mistake to avoid is checking only that fast exists and then jumping two, which crashes on even lengths, or not knowing which middle your loop condition returns. Trace two and four nodes before you say done.
