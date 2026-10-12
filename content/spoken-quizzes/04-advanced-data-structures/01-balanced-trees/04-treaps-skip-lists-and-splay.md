---
lesson: treaps-skip-lists-and-splay
source: 234f1e756963fa73
---
## 1

Two replicas insert the same set of key and priority pairs into treaps, in different orders. What is true of the resulting trees?

A, they match only if priorities were assigned in sorted order. B, they are identical, since the pairs alone fix the shape. C, they differ, because insertion order changes the rotations. D, they share the same height but can differ in shape.

[think]

The answer is B: they are identical, since the pairs alone fix the shape.

With distinct keys and priorities, there is exactly one tree that is a search tree on the keys and a heap on the priorities. Insertion order does change which rotations happen along the way, but not the final shape.

## 2

Redis implements sorted sets with a skip list rather than a red-black tree. Which reason did not motivate that choice?

A, the code is far shorter than an equivalent balanced tree. B, rank queries take log n, using the span stored on each pointer. C, skip lists guarantee log n in the worst case for every operation. D, range operations are simple, since the bottom level is a linked list.

[think]

The answer is C: skip lists guarantee log n in the worst case.

They do not: skip lists are log n in expectation, not in the worst case. Simplicity, easy ranges, and rank support through spans were the real reasons; the missing worst-case guarantee is a cost that was accepted.

## 3

Why is a skip list a better fit than a red-black tree for a storage engine's in-memory memtable, with concurrent readers?

A, inserts never move existing nodes, so readers need no locks. B, it uses less memory per key than a red-black tree. C, it has a better worst-case bound than a red-black tree. D, it supports range scans, which balanced trees cannot do.

[think]

The answer is A: inserts never move existing nodes, so readers need no locks.

Rotations relocate nodes and change several pointers at once, which readers must not see half-done. A skip-list insert splices a new node in with one pointer write per level, so a reader either sees it or does not. Its memory is higher, a pointer per level per node, trees support range scans fine, and the skip list's bound is only expected.

## 4

Redis, LevelDB and RocksDB all promote skip-list nodes with a probability of one quarter per level, rather than one half. What does that choice change?

A, inserts no longer need the update vector, since levels are sparser. B, searches become about twice as fast, with half as many levels. C, the worst case improves, because tall towers become rarer. D, memory drops to about 1.33 pointers per node, while search cost stays about the same.

[think]

The answer is D: memory drops to about 1.33 pointers per node, and search cost stays about the same.

Halving the number of levels is paid back by walking up to three nodes per level instead of one, so the expected search is nearly unchanged, about 41 steps for a million keys either way. But the expected pointers per node fall from 2 to 1.33. The worst case is still a chain in principle, and inserts still record the update vector.

## 5

A single splay tree lookup takes linear time. What does the amortised log n bound tell you?

A, the next lookup is guaranteed to be constant time, to compensate. B, the tree has degenerated, and must now be rebuilt. C, that lookup was a bug in the splay implementation. D, any sequence of m operations costs m log n in total.

[think]

The answer is D: any sequence of m operations costs m log n in total.

Amortised bounds constrain totals, not individual operations. The slow lookup restructured the tree so that the following operations are cheaper, and the potential-function argument shows the sum stays within m log n. It promises nothing about any particular next operation.

## 6

You need an in-memory ordered index for a service with a 99th percentile latency target, a moderate write rate, and a single-threaded access path. Which is the weakest choice?

A, an in-memory B-tree. B, a randomised treap. C, a splay tree. D, a red-black tree.

[think]

The answer is C: a splay tree.

A splay tree can spend linear time on one operation, which is exactly what a tail-latency target forbids. Red-black trees and B-trees have worst-case bounds. A treap's bounds are expected, but its bad cases are astronomically unlikely, and no workload can trigger them.
