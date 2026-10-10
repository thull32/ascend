---
lesson: merging-and-partitioning
source: 227cd2e349fe7fca
fit: partial
desk:
  - "The two-list merge code and its six-step trace, with the merge visualiser"
  - "List merge sort, and the two-node split traced both ways"
  - "The heap-of-heads code, its trace, and the node-visit table by k"
  - "The two-sentinel partition trace with the stale-pointer column"
  - "The reorder trace, and the compaction and external sort details"
  - "Exercises: merge two sorted lists, and stable partition around a value"
---
## Introduction

A storage engine flushes sorted runs of records to disk and later has to combine dozens of them into one sorted file, without loading everything into memory. A log aggregator receives timestamp-ordered streams from a hundred servers and must emit one ordered stream. Merge sort has to combine two sorted halves. All three are the same operation: walk several sorted sequences in lockstep, always taking the smallest head. On linked lists it is the cleanest algorithm you will write, because splicing nodes costs nothing.

Partitioning is the sibling: split one list into two by a predicate, then join them. On a list it is naturally stable, because you never move a node past another; you only re-thread pointers. The price of that freedom is a class of bug that produces a cycle instead of an error.

Four ideas. The two-list merge and its tie rule. Merging k lists, where the strategy is worth a factor of 50. The stable partition and its stale pointer. And where these merges run in real systems.

## Merging two sorted lists

Keep a sentinel as the start of the result, and a tail pointer at its end. While both lists have nodes, compare their heads, detach the smaller one, append it to the tail, and advance. When one list runs out, point the tail at whatever remains of the other. That last step is a single pointer write, because the remainder is already sorted and already linked. An array merge would have to copy it.

Say it on 1, 2, 4 and 1, 3, 4. The heads are 1 and 1, a tie, so take the first list's 1. Then 2 against 1: take the second list's 1. Then 2 against 3: take 2. Then 4 against 3: take 3. Then 4 against 4, another tie: take the first list's 4. The first list is empty, so splice on the rest of the second, its 4. Result: 1, 1, 2, 3, 4, 4. Five comparisons and one splice for six nodes, with no nodes allocated.

Now the detail that matters. The comparison is "less than or equal", so ties take from the first list. Why does that matter?

[pause]

Stability. Equal keys keep their input order across the two lists. When the values are keys of records and the input order carries meaning, an earlier timestamp or a newer version, the tie rule decides which record wins. Use strict less-than and ties come from the second list. In a database compaction, that is the bug where the older version of a record survives.

Write the merge iteratively. The recursive version is two lines shorter, and its stack depth equals the output length, so it dies at about 1,000 nodes in CPython and ten thousand in V8.

## Merge sort on a list

Merge sort is the natural sort for linked lists. It needs only sequential access, and the merge is in place. Find the middle with the runner, cut the list there, sort both halves, merge them. Order n log n time, no extra nodes.

The split decides whether the function terminates. Start the fast pointer at the head, and on a two-node list slow stops on the second node. The cut produces the whole list and an empty half, the left recursion gets the same input it started with, and it recurses forever. Start fast one node ahead, at the head's next, and slow stops on the first node: two singletons, merged. Every non-trivial input contains a two-node sublist somewhere, so this bug is not rare.

Quicksort on a list is possible and pointless: it wants random access for good pivots and gains nothing from swapping in place. So "how would you sort a linked list?" has one good answer. And for constant extra space, do it bottom up: merge runs of length one, then two, then four, with no recursion at all. The Linux kernel's list sort is a bottom-up merge.

## Merging k lists

With k sorted lists totalling n nodes, there are three strategies.

Sequential merging folds list one into list two, the result into list three, and so on. It sounds linear, since each merge is linear. But each merge re-walks everything merged so far, so the total is about n times k over 2.

Divide and conquer pairs the lists up and merges each pair, halving k every round. Each round touches all n nodes once, and there are log k rounds: n log k.

A min-heap of heads puts the first node of every list into a heap. Pop the smallest, append it to the output, push that node's successor. Every node is pushed and popped once at log k cost: n log k time, and only k entries of extra space.

Put numbers on the gap, with lists of a thousand nodes each. At 8 lists, sequential does about 1.5 times the heap's work. At 64 lists, about 5 times: 2 million node visits against 384 thousand. At a thousand lists, 50 times: half a billion visits against ten million. At three lists nobody can tell the difference. At a thousand input streams, it is the difference between a compaction that finishes and one that does not.

The heap version is also the only one that works on streams, because it never needs a whole list, only each input's current head. That is how external sort merges runs on disk, how LSM compaction merges files, and how log aggregators produce one ordered stream. Python's heapq merge is this loop.

One Python trap. If the heap entries are pairs of value and node, the first tie makes Python compare the two node objects, and it raises a type error: less-than is not supported between two list nodes. It passes tests with distinct values and fails in production on the first duplicate. Put a tiebreaker, the list's index, between the value and the node. That also makes the merge stable: the earlier list wins ties.

## Partitioning around a value

Rearrange a list so every node less than x comes before every node greater than or equal to x, keeping the original order within each group. On an array, keeping the order costs linear extra space or an n log n in-place scheme. On a list, it is one pass with two sentinels: one heads the "less" list, one heads the "more" list, and each node is appended to the tail of one or the other. Then join "less" onto "more".

Here is the trap. Appending a node only overwrites the previous tail's next. The node's own next still points into the original list, until something overwrites it in turn. Take 1, 4, 3, 2, 5, 2 with x equal to 3. The less list collects 1, 2, 2. The more list collects 4, 3, 5. But the 5 was appended last to the more list, and its next still points at the final 2, which now lives in the less list.

Before I tell you, what happens if you join without fixing that?

[pause]

The joined list reads 1, 2, 2, 4, 3, 5, and then the 5 points back at that last 2, which leads to 4, 3, 5 again, forever. A cycle, no error, and a traversal that hangs somewhere else, later. The fix is one line before the join: set the more list's tail's next to null. The general rule: whenever you re-thread nodes into several lists, terminate every list explicitly before joining. The correct result is 1, 2, 2, 4, 3, 5, with both groups in their original order.

The same two-sentinel pattern separates odd and even positions, splits by parity, and with a third sentinel for "equal to x" gives you the Dutch national flag without any of its index juggling.

## Composing the primitives

Most "rearrange this list" problems compose middle, reverse, merge and partition. Reorder 1, 2, 3, 4, 5 into 1, 5, 2, 4, 3. Split at the first middle: 1, 2, 3 and 4, 5. Reverse the second half: 5, 4. Interleave, which is a merge with "alternate" instead of "smaller first": 1, 5, 2, 4, 3. For odd lengths, the first half is the longer one, so the middle node stays at the end.

Adding two numbers stored as reversed-digit lists is a merge with a carry instead of a comparison, plus a final carry node that people forget. Rotating a list by k is simplest as: connect the tail to the head to make a ring, walk to the new end, and cut. The common thread: never allocate nodes unless a new value must exist, and always terminate lists explicitly.

## Merges in real systems

LSM compaction, in RocksDB, Cassandra and LevelDB, opens an iterator per input file and drives them through a heap of heads, exactly like the k-way merge. When the same key appears in several inputs, the entry with the highest sequence number, the newest write, is emitted, and older versions are dropped once no snapshot needs them. That is the stable merge's tie rule with "newest wins" as the priority. A key that comes back from the dead after compaction is a tie rule pointing the wrong way.

External sort is every database's order by on a result bigger than memory. Postgres sorts runs the size of work mem, 4 megabytes by default, spills each to disk, and k-way merges them. A gigabyte of input is on the order of 250 runs. With 4 megabytes, Postgres merges about 15 runs at a time, so 250 runs need two intermediate passes before the final merge. Each extra pass reads and writes everything again. The number of passes, set by memory, is the cost that matters.

And Timsort, behind Python's sorted, Java's object sort and V8's array sort, is a merge sort over the runs already present in the input, switching to galloping after one run wins 7 comparisons in a row.

## In the interview

A follow-up the lesson expects. Merge k sorted lists: which strategy, and why?

[pause]

Name all three with their costs. Write the heap version, because it is n log k, uses only k extra space, and works on streams. Mention that pairwise divide and conquer has the same complexity with no heap and is a good choice when everything is in memory. Then put a number on it: at 64 lists the sequential version does about 5 times the work, at a thousand about 50 times. The common wrong answer is to concatenate and sort, which throws away the fact that the inputs are already sorted.

## Recap

Four things to remember. Merge with a sentinel and less-than-or-equal; the tie rule is stability, and in a compaction it is which version of a record survives. For k lists, sequential merging is n times k, while a heap of heads or pairwise merging is n log k, 50 times less work at a thousand inputs, and only the heap streams; give heap entries a tiebreaker. Split for merge sort at the first middle, or two-node lists recurse forever. And when you re-thread nodes into several lists, terminate each one before joining, or you get a silent cycle.

At your desk: the merge trace, the two-node split, the heap trace and the node-visit table, the partition trace with its stale pointers, the reorder steps and the compaction details, and the two exercises, merging two sorted lists and the stable partition.
