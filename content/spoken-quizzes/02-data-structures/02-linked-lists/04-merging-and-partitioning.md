---
lesson: merging-and-partitioning
source: ae27b96113ba004b
---
## 1

In the two-list merge, why take from the first list when its head is less than or equal to the second's, rather than only when it is strictly less?

A, ties then skip a comparison, which makes the loop measurably faster. B, ties then take from the first list, which keeps the merge stable. C, ties then take from both lists at once, which removes duplicate values. D, ties then advance a pointer, which prevents an infinite loop on equal heads.

[think]

The answer is B: ties then take from the first list, which keeps the merge stable.

With strictly less, ties take from the second list, reversing the relative order of equal keys across the two inputs. Stability, where the first input wins ties, is what merge sort and record merging rely on, and in a compaction it is the rule that keeps the newest version. Both versions advance exactly one pointer per iteration, so strictly less would not loop forever; it would only lose stability.

## 2

Merging k sorted lists, totalling n nodes, by merging them one after another into an accumulator, costs how much?

A, order n times k, because each merge re-walks everything merged so far. B, order n log k, because each node takes part in log k of the merges. C, order k log n, because the accumulator doubles in length each merge. D, order n, because every node is appended to the output exactly once.

[think]

The answer is A: order n times k, because each merge re-walks everything merged so far.

The i-th merge re-walks all the output so far, so the total is roughly n times k over 2: about 2 million node visits for 64 lists of a thousand, against 384 thousand for a heap. The early lists' nodes take part in almost every merge, not log k of them. It is pairwise divide and conquer, or a heap of heads, that brings the cost down to n log k.

## 3

Which k-way merge strategy is appropriate when the inputs are unbounded sorted streams arriving over the network?

A, collecting all the streams, then sorting them together with one stable sort. B, divide and conquer, pairing streams up and merging each pair recursively. C, a min-heap of size k, holding only the current head of each stream. D, sequential merging, folding each stream into one growing output.

[think]

The answer is C: a min-heap of size k, holding only the current head of each stream.

Only the heap needs just one element per input at a time. The others need each input to be complete before merging, which never happens for an unbounded stream. Divide and conquer has the same n log k cost, but not the streaming property. This is how external sort, LSM compaction and log aggregators work.

## 4

In the two-sentinel partition of a list, what happens if you forget to set the next pointer of the "greater or equal" sublist's tail to null?

A, the second sublist is dropped, since the join reads a stale pointer. B, nothing, since the last node appended was already the original tail. C, the order within groups is lost, since that node's next skips ahead. D, the result can contain a cycle through that node's stale next pointer.

[think]

The answer is D: the result can contain a cycle through that node's stale next pointer.

Nodes keep their original next pointers until something overwrites them. The last node placed in the second sublist may come from the middle of the original list, and still point at a node that moved to the first sublist. After the join, the list loops forever. It is only already null when that node happened to be the original tail.

## 5

A merge sort on a linked list recurses forever on a two-node input. What is the most likely cause?

A, the merge is unstable, so equal nodes keep swapping between the halves. B, the recursion is not tail-recursive, so the stack never unwinds. C, the list contains duplicates, which the midpoint split cannot separate. D, the split starts fast at the head, so the right half comes out empty.

[think]

The answer is D: the split starts fast at the head, so the right half comes out empty.

For a two-node list, slow must stop at the first node, so that the split yields two single nodes. Starting fast at the head advances slow to the second node, the cut produces the whole list and an empty one, and the left recursion never shrinks. Start fast at the head's next. Stability and duplicate values affect only the order of the output, never the size of the halves.

## 6

A Python heap merge that pushes pairs of a node's value and the node works in tests, but raises a type error in production. Why?

A, the heap grew beyond k entries, so heapq compared entries of different lengths. B, two nodes had equal values, so the tuple comparison fell through to the node objects. C, the values were floats, which heapq cannot order against integers. D, a list was empty, so None was pushed and compared with an integer.

[think]

The answer is B: two nodes had equal values, so the tuple comparison fell through to the node objects.

Tuples compare element by element. When the first elements tie, Python compares the second, and list nodes have no ordering. Put a tiebreaker, the input's index or a counter, between the key and the node, which also makes the merge stable. Empty inputs are skipped before pushing, heap size does not affect comparison, and integers and floats compare fine.
