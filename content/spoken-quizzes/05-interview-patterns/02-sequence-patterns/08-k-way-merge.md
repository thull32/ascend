---
lesson: k-way-merge
source: 824485aa158f8c25
---
## 1

In the k-way merge, why is the heap's root always the smallest element not yet emitted?

A, the tie-break index forces equal values out in order, so the root is least. B, the heap holds every unemitted value, so its root is the overall minimum. C, inputs are merged in index order, so earlier inputs always hold smaller values. D, every unemitted value is at least its own input's head, and the root is the least head.

[think]

The answer is D: every unemitted value is at least its input's head, and the root is the least head.

Each input is sorted, so its head, its smallest unemitted element, bounds everything left in it, and the heap property makes the root the smallest head. Together, the root is at most every unemitted element. The heap holds only one entry per input, not every value, and the index only settles ties.

## 2

A thousand sorted Python lists, a million integers in total, are already in memory, and you need them in one sorted list. Which is the better call, and why?

A, heapq merge, because its N log k beats any sort's N log N here. B, chaining the lists and calling the built-in sort, because Timsort merges the existing sorted runs in C. C, a hand-written heap loop, because heap replace does one sift per element. D, pairwise merging in Python, because it avoids a heap and its tuples.

[think]

The answer is B: chain the lists and call the built-in sort.

Timsort detects each input list as a sorted run and merges the runs, so on this input it is N log k too, with the work done in C. At a thousand lists it measured 109 milliseconds, against 299 for a hand-written heap loop and 362 for heapq merge. The heap is the right tool for streams, early stops and memory of order k, and pure-Python pairwise merging was the slowest of all.

## 3

What does heapq merge do when only one of its input iterators still has elements?

A, it yields the rest of that iterator directly, with no heap work. B, it keeps calling heap replace on a heap that holds a single entry. C, it copies the remaining elements into a list and sorts them first. D, it raises StopIteration, and the caller must drain the last input.

[think]

The answer is A: it yields the rest of that iterator directly.

Once the heap is down to one entry, heapq merge yields the pending value and then yields straight from that iterator, so the tail streams through without comparisons. Before that, each step mutates the root entry in place and calls heap replace. Nothing is ever copied or sorted.

## 4

A merge of k linked lists passes the samples, but raises a TypeError on a hidden test. The heap entries are pairs of the node's value and the node. What is the fix?

A, push the value, a unique input index, and then the node. B, define equality on the list node class, so that ties compare as equal. C, push the negated value and the node, so that the heap orders by value. D, push the value only, and look the node up in a dictionary.

[think]

The answer is A: put a unique input index between the value and the node.

When two heads have equal values, tuple comparison falls through to the nodes, and the list node class defines no ordering. A unique integer before the node settles every tie, and also makes the merge stable. Negating keeps the same tie, a value-to-node map breaks on duplicate values, and equality does not give the less-than that heapq needs.

## 5

Merging 100 sorted lists of a thousand elements each, by folding them in one at a time, took 146 milliseconds. The heap took 15. Why does the fold lose?

A, each fold sorts its output again, adding N log N work per step. B, the fold allocates a new heap per list, costing k log k per merge. C, each fold re-copies everything merged so far, about N times k over 2 moves. D, the fold compares every pair of heads, about k squared per element.

[think]

The answer is C: each fold re-copies everything merged so far.

Merge number i walks all the elements merged before it, so the first list is copied k minus 1 times, and the total is about N times k over 2 element moves: order N times k. The heap moves each element once, at log k each. No sorting or heap allocation happens inside a two-way merge.

## 6

You merge 200 Kafka partitions, each ordered by timestamp, with a lazy heap merge. One partition stops receiving data. What happens?

A, the merge emits out of order, because the idle partition's head is now stale. B, nothing, because the heap drops a partition once it has no messages. C, output stalls, because the idle partition might still hold the minimum. D, memory grows by the partition's size, because its entries are copied.

[think]

The answer is C: output stalls.

The merge can emit the root only when every input has offered a head, because the idle partition's next record could be older than anything in the heap. Stream processors bound that wait with watermarks and idle-source timeouts, trading completeness for latency. The heap never drops a live input on its own, and it holds one entry per partition.
