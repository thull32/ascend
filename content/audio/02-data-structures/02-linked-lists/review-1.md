---
review: linked-lists
source: 3c53d38544e27174
---
## Introduction

Twelve questions from the linked-lists module. Answer out loud before the answer comes.

They run through the module in order: fundamentals, reversal and runners, cycle detection, and merging and partitioning. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

An engineer argues for a linked list over an array "because inserting in the middle is constant time". What is the strongest objection?

A, arrays can also insert in the middle in constant amortised time, using spare capacity. B, linked lists must copy the tail on insert to keep their nodes contiguous. C, it is constant time only given the predecessor, and finding that is a linear walk. D, linked lists use more memory per node, which outweighs any insert gain.

[think]

The answer is C: it is constant time only given the predecessor, and finding that is a linear walk.

The constant-time claim hides the linear search. Because each node is a separate allocation, that search is a chain of dependent cache misses at roughly 100 nanoseconds each, while an array's shift is a memory move at bandwidth. So arrays win even for middle insertion at the sizes Stroustrup measured. The memory overhead is real but secondary. The list wins only when positions are reached without searching.

## Question 2

Why does an LRU cache need a doubly linked list rather than a singly linked one?

A, to iterate entries from most to least recent when the cache is listed. B, to unlink a node found through the map in constant time, without finding its predecessor. C, to store both key and value, since a singly linked node holds one field. D, to save memory, since each node's previous pointer replaces a map entry.

[think]

The answer is B: to unlink a node found through the map in constant time, without finding its predecessor.

On a cache hit, the map hands you the node itself. Unlinking it means updating the predecessor's next pointer, and only a previous pointer makes that constant time. A singly linked list would need a linear walk to the predecessor on every hit. Backward iteration is a side benefit, and the extra pointer costs memory rather than saving it.

## Question 3

Why does Redis approximate LRU by sampling, instead of keeping the map plus a doubly linked list?

A, because sampling five keys is exact LRU whenever the cache holds fewer than five keys. B, because two list pointers per key would cost gigabytes at scale and make every read a write. C, because Redis is single-threaded, and a linked list cannot be updated without a lock. D, because a doubly linked list cannot evict from the tail in constant time once keys expire.

[think]

The answer is B: two list pointers per key would cost gigabytes at scale and make every read a write.

Two 8-byte pointers per key is 1.6 gigabytes at 100 million keys, and keeping recency means writing to the list on every read. A 24-bit clock per object, plus sampling a few keys at eviction time, approximates LRU closely for far less. Threading is unrelated, tail eviction is constant time on a doubly linked list, and sampling is approximate in general.

## Question 4

In iterative reversal, what happens if you point current back at previous before saving current's next?

A, the loop ends after one node, and the rest of the list is unreachable. B, the list is reversed correctly, since previous still holds the old successor. C, the loop never ends, since the first node now points back at itself. D, only the last node is lost, since the saved next is read one iteration late.

[think]

The answer is A: the loop ends after one node, and the rest of the list is unreachable.

Overwriting current's next discards the only reference to the remainder. The saved next is then read from the already rewired pointer, which is null on the first iteration, so current becomes null and the loop exits with the tail lost and no error raised. No self-loop is created, because the node points at previous, not at itself.

## Question 5

To delete the nth node from the end with two pointers in one pass, why start the trailing pointer at a sentinel rather than at the head?

A, because the head might be null, and the sentinel avoids a null check on it. B, so the trailing pointer lands on the target itself, which can then be unlinked directly. C, so the trailing pointer ends just before the target, even when the target is the head. D, so the lead pointer is not needed, since the sentinel marks where counting starts.

[think]

The answer is C: so the trailing pointer ends just before the target, even when the target is the head.

Deleting from a singly linked list needs the predecessor, not the target. Starting at the sentinel, the trailing pointer ends one node behind the target. When n equals the length, the second loop never runs, the head's predecessor is the sentinel, and the sentinel's next is rewired with no special case.

## Question 6

Reversing a sublist, positions 2 to 4 of the list 1, 2, 3, 4, 5. The sublist has been reversed, and the front has been reconnected, so the 1 points at the 4. What does the list look like if the back reconnection, pointing the old first node of the sublist at the node after it, is forgotten?

A, 1, 2, 3, 4, 5, since the reversal is undone. B, 1, 4, 3, 2, with node 5 unreachable. C, 1, 4, 3, 2, 5, since current already pointed at 5. D, 1, 4, 3, 2, 2, with a self-loop on node 2.

[think]

The answer is B: 1, 4, 3, 2, with node 5 unreachable.

Node 2 was the first node of the sublist and became its last. Its next was set to null on the first iteration of the reversal loop, and nothing rewrote it. Current holds node 5, but only the missing write connects it. The result is a shorter list with no error, which is why a length assertion around the call is a cheap test.

## Question 7

In Floyd's algorithm, why is it guaranteed that the fast pointer does not jump over the slow pointer without landing on it?

A, the cycle length is always even, so a jump of two lands on every node. B, the list is finite, so fast must eventually visit every node in the cycle. C, the gap between them changes by exactly one node each iteration. D, the gap between them shrinks by two nodes each iteration, reaching zero.

[think]

The answer is C: the gap between them changes by exactly one node each iteration.

With speeds one and two, the relative speed is one, so the distance from slow forward to fast grows by one each iteration. It must pass through a multiple of the cycle length within that many iterations of slow entering the cycle. A gap that changed by two could skip over that multiple on cycles of even length, and cycles can have any length.

## Question 8

Which comparison correctly tests whether the two pointers have met, in a linked list of node objects?

A, slow is fast, since only identity proves they are the same node. B, slow's value equals fast's value, since meeting means reaching the same value. C, the id of slow's value equals the id of fast's value, since ids are unique per node. D, slow's next is fast's next, since equal successors mean the same node.

[think]

The answer is A: slow is fast, since only identity proves they are the same node.

Two distinct nodes can hold equal values, so comparing values gives false positives, and small integers share one object, so their ids match too. Identity comparison, "is" in Python or triple equals on objects in JavaScript, checks that both references point at the same node. Equal successors do not prove it either: the cycle's first node has two predecessors.

## Question 9

Speeds one and three are used instead of one and two, on a list with no tail and a cycle of length 4. What happens?

A, the pointers never meet, since a gap that changes by two skips every node. B, the pointers meet at the cycle start directly, so the second phase is unnecessary. C, the pointers meet only after the fast one has lapped the cycle four times. D, the pointers meet after two iterations, but the cycle-start walk then fails.

[think]

The answer is D: the pointers meet after two iterations, but the cycle-start walk then fails.

With speed three, the pointers coincide when twice the iteration count is a multiple of 4, so at iteration 2 they meet at cycle position 2. Because 2 is not a multiple of the cycle length, slow is not where the second phase needs it, and advancing a head pointer and slow together never lands both on the start. Speed two guarantees the meeting time is a multiple of the cycle length, which is what the second phase relies on.

## Question 10

Merging k sorted lists, totalling n nodes, by merging them one after another into an accumulator, costs how much?

A, order n times k, because each merge re-walks everything merged so far. B, order n log k, because each node takes part in log k of the merges. C, order k log n, because the accumulator doubles in length each merge. D, order n, because every node is appended to the output exactly once.

[think]

The answer is A: order n times k, because each merge re-walks everything merged so far.

The i-th merge re-walks all the output so far, so the total is roughly n times k over 2: about 2 million node visits for 64 lists of a thousand, against 384 thousand for a heap. The early lists' nodes take part in almost every merge, not log k of them. It is pairwise divide and conquer, or a heap of heads, that brings the cost down to n log k.

## Question 11

In the two-sentinel partition of a list, what happens if you forget to set the next pointer of the "greater or equal" sublist's tail to null?

A, the second sublist is dropped, since the join reads a stale pointer. B, nothing, since the last node appended was already the original tail. C, the order within groups is lost, since that node's next skips ahead. D, the result can contain a cycle through that node's stale next pointer.

[think]

The answer is D: the result can contain a cycle through that node's stale next pointer.

Nodes keep their original next pointers until something overwrites them. The last node placed in the second sublist may come from the middle of the original list and still point at a node that moved to the first sublist. After the join, the list loops forever. It is only already null when that node happened to be the original tail.

## Question 12

A Python heap merge that pushes pairs of a node's value and the node works in tests, but raises a type error in production. Why?

A, the heap grew beyond k entries, so heapq compared entries of different lengths. B, two nodes had equal values, so the tuple comparison fell through to the node objects. C, the values were floats, which heapq cannot order against integers. D, a list was empty, so None was pushed and compared with an integer.

[think]

The answer is B: two nodes had equal values, so the comparison fell through to the node objects.

Tuples compare element by element. When the first elements tie, Python compares the second, and list nodes have no ordering. Put a tiebreaker, the input's index or a counter, between the key and the node, which also makes the merge stable. Empty inputs are skipped before pushing, heap size does not affect comparison, and integers and floats compare fine.

## Recap

Three ideas kept returning. First, constant-time operations on a list are constant only given the position, and a doubly linked list exists to make unlinking by handle constant; when the position must be searched for, the array wins. Second, most list bugs are a pointer overwritten before it was saved, or never terminated: the lost tail in reversal, the dropped node in a sublist, the cycle after a partition. And third, the invariants carry the proofs: a gap that grows by exactly one, a meeting time that is a multiple of the cycle length, and a tie rule that keeps a merge stable.
