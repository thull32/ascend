---
lesson: reversal-and-runner-techniques
source: d2809171479c9103
---
## 1

In iterative reversal, what happens if you point the current node back at the previous one before saving the current node's next?

A, the loop ends after one node, and the rest of the list is unreachable. B, the list is reversed correctly, since previous still holds the old successor. C, the loop never ends, since the first node now points back at itself. D, only the last node is lost, since the saved next is read one iteration late.

[think]

The answer is A: the loop ends after one node, and the rest of the list is unreachable.

Overwriting the current node's next discards the only reference to the remainder. The saved next is then read from the already rewired pointer, which is null on the first iteration, so current becomes null and the loop exits, with the tail lost and no error raised. No self-loop is created, because the node points at previous, not at itself.

## 2

Slow and fast pointers both start at the head, and the loop runs while fast and fast's next both exist. For the list 1, 2, 3, 4, where does slow end up?

A, at 3, the second middle node. B, at 1, the head of the list. C, at 2, the first middle node. D, at 4, the tail of the list.

[think]

The answer is A: at 3, the second middle node.

Slow and fast go from 1 and 1, to 2 and 3, to 3 and null, and the loop exits with slow at 3. Starting fast at the head's next, or looping while fast's next and the node after it both exist, gives the first middle, 2, which is what splitting a list for merge sort needs.

## 3

Why is recursive list reversal a poor choice for a list of 100 thousand nodes in Python?

A, each node adds a frame, and the default recursion limit is 1,000 frames. B, Python lacks tail-call optimisation, which makes it n log n time. C, recursion cannot reassign next, so it must copy every node it visits. D, it is quadratic, since each call walks the remaining sublist to find its end.

[think]

The answer is A: each node adds a frame, and the default recursion limit is 1,000 frames.

The recursion depth equals the list length. The algorithm is linear time but also linear stack space, and CPython raises a recursion error at its default limit of 1,000 frames. The function does work after the recursive call, so it is not tail-recursive, and tail-call optimisation would not help even if Python had it. Iteration uses constant space.

## 4

To delete the nth node from the end with two pointers in one pass, why start the trailing pointer at a sentinel rather than at the head?

A, because the head might be null, and the sentinel avoids a null check on it. B, so the trailing pointer lands on the target itself, which can then be unlinked directly. C, so the trailing pointer ends just before the target, even when the target is the head. D, so the lead pointer is not needed, since the sentinel marks where counting starts.

[think]

The answer is C: so the trailing pointer ends just before the target, even when the target is the head.

Deleting from a singly linked list needs the predecessor, not the target. Starting at the sentinel, the trailing pointer ends one node behind the target. When n equals the length, the second loop never runs, the head's predecessor is the sentinel, and the sentinel's next is rewired with no special case.

## 5

Which of these problems combines the runner technique and reversal?

A, remove the nth node from the end in a single pass. B, reverse the sublist between positions m and n in place. C, reorder a list as first, last, second, second-last, and so on. D, sort a list by splitting it at the middle and merging.

[think]

The answer is C: reorder a list as first, last, second, second-last, and so on.

Reorder list finds the middle with fast and slow pointers, reverses the second half in place, and interleaves the two halves, so it exercises both techniques. Removing the nth from the end uses offset pointers but no reversal. Reversing a sublist uses reversal but no runner. And merge sort uses the runner to split, but never reverses.

## 6

You are reversing positions 2 to 4 of the list 1, 2, 3, 4, 5. The sublist has been reversed, and the front has been reconnected, so the 1 points at the 4. What does the list look like if the back reconnection, pointing the sublist's old first node at the node after the sublist, is forgotten?

A, 1, 2, 3, 4, 5, since the reversal is undone. B, 1, 4, 3, 2, with node 5 unreachable. C, 1, 4, 3, 2, 5, since current already pointed at 5. D, 1, 4, 3, 2, 2, with a self-loop on node 2.

[think]

The answer is B: 1, 4, 3, 2, with node 5 unreachable.

Node 2 was the first node of the sublist and became its last. Its next was set to null on the first iteration of the reversal loop, and nothing rewrote it. Current holds node 5, but only the missing write connects it. The result is a shorter list with no error, which is why a length assertion around the call is a cheap test.
