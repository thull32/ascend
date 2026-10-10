---
review: balanced-trees
source: bbfc76e64bfb53e4
---
## Introduction

Twelve questions from the balanced-trees module. Answer out loud before the answer comes.

Three from each lesson, in order: AVL trees, red-black trees, B-trees and B-plus trees, and then treaps, skip lists and splay trees. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

An AVL tree holds one million keys. Which statement about its height is guaranteed?

A, the height is at most 28 levels. B, the height can reach a million on sorted input. C, the height is exactly 20, as in a perfect tree. D, the height is at most 40 levels.

[think]

The answer is A: at most 28 levels.

The sparsest AVL tree of height 29 already needs 1,346,268 nodes, more than a million, so a million keys cannot reach height 29. The rule of thumb, 1.44 times the base-2 log of n, says the same. A perfect tree would be 20, but AVL does not guarantee perfection. 40 is the red-black bound, and a million is the unbalanced worst case that AVL exists to prevent.

## Question 2

Why can an AVL delete cost a logarithmic number of rotations, while an insert needs at most one rebalancing?

A, insert never changes the heights of the ancestors above the new leaf. B, a delete of a node with two children unbalances both subtrees, so each needs its own rotation. C, delete must also rebalance the successor's old subtree, as a separate pass. D, a rotation after a delete can shorten the subtree, and that unbalances its parent.

[think]

The answer is D: a post-delete rotation can shorten the subtree and unbalance its parent.

After an insert, the rebalanced subtree has the same height it had before the insert, so the ancestors are unaffected. After a delete, fixing one node can leave its subtree one level shorter, which can unbalance the parent, and so on to the root; the Fibonacci-tree trace shows two rotations in one delete. Option A is wrong: insert does change ancestor heights on the way up. It is the rotation that restores the old height and stops the propagation.

## Question 3

A service keeps 50 million timestamped events in memory and runs range queries constantly, with occasional inserts. A colleague proposes an AVL tree. What is the strongest objection?

A, a red-black tree is shorter, so its reads would be faster. B, the height field in every node makes AVL trees too memory-hungry. C, an in-memory B-tree needs far fewer cache misses per lookup. D, AVL trees cannot answer range queries without a second index.

[think]

The answer is C: an in-memory B-tree needs far fewer cache misses.

Every AVL level costs a pointer dereference, and once the tree is bigger than cache, a DRAM miss: about 36 of them for 50 million keys. A B-tree with 64-key nodes holds many keys per node and needs about 5. Range queries work fine on any search tree through an in-order walk, and red-black trees are slightly taller, not shorter.

## Question 4

During a red-black insert, the new node is red, its parent is red, and its uncle is red. What happens?

A, colour the parent and the uncle black and the grandparent red, then continue from the grandparent. B, colour the new node black and stop, since the red-red pair is gone. C, rotate at the parent, then rotate at the grandparent. D, rotate at the grandparent, then swap the colours of the grandparent and the parent.

[think]

The answer is A: recolour, then continue from the grandparent.

A red uncle means the grandparent's 2-3-4 node is full, and you are splitting it. The middle key, the grandparent, moves up as a red, which may clash with its own parent, so the loop continues. Rotations are for the black-uncle cases. Colouring the new node black would add a black to one path only and break the equal-black-height rule.

## Question 5

A red-black delete removes a black leaf and leaves a double-black hole. Its sibling is black, with two black children. What does the fix-up do?

A, colour the sibling red and move the problem up to the parent. B, colour the hole red, which restores the black count on its path. C, colour the sibling black and the parent red, then rotate at the sibling. D, rotate at the parent and stop, since the sibling has spare keys.

[think]

The answer is A: colour the sibling red and move the problem up.

That is case D2. In 2-3-4 terms, the sibling's node has no spare key to lend, so the parent loses a black on both sides and the double black moves up to the parent. The loop stops there if the parent is red or the root. Rotations belong to D1, D3 and D4, which need a red sibling or a red nephew; and colouring a null hole red means nothing.

## Question 6

Why does C++ implement its standard map as a red-black tree rather than a B-tree, which is faster on large data?

A, B-trees cannot iterate keys in sorted order across nodes. B, B-trees were not yet known when the standard was written. C, the standard requires iterators to stay valid across other inserts. D, red-black trees use less memory per key than B-trees.

[think]

The answer is C: iterators must survive other inserts.

The standard guarantees that inserting or erasing other elements never invalidates iterators or references, which requires one node per element. B-tree nodes move keys around within pages when they insert and split, which would invalidate pointers to elements. B-trees iterate in order perfectly well; Rust's BTreeMap makes no stability guarantee, so it could choose the faster structure.

## Question 7

A table in InnoDB uses random version 4 UUIDs as its primary key. Compared with an auto-increment key, what is the main cost inside the storage engine?

A, inserts land in random leaves, splitting pages across the whole table. B, equality lookups on UUID keys need a hash index instead of the tree. C, lookups degrade toward linear time, because random keys unbalance the tree. D, each insert triggers rotations that rebalance the tree up to the root.

[think]

The answer is A: random leaves, and page splits everywhere.

Random keys defeat the rightmost-insert optimisation and spread splits across the tree, so pages stay about 70 percent full and every insert dirties an unpredictable page. Because InnoDB clusters the table on its primary key, the table data pays this cost too. The tree stays perfectly balanced whatever the key order, so lookups remain logarithmic, and B-plus trees split pages; they never rotate.

## Question 8

After deleting 80 percent of the rows in a large Postgres table, queries on its index are still slow and the index file is the same size. Why?

A, Postgres B-tree indexes cannot remove entries once written. B, Postgres leaves underfull pages in place until the index is rebuilt. C, the tree's height cannot shrink, so lookups keep the original depth. D, the deleted rows remain in the write-ahead log, which index scans still read.

[think]

The answer is B: underfull pages stay in place until a reindex.

Eager merging on delete is expensive and rarely worth it, so Postgres does not merge underfull pages; it only reclaims pages that are completely empty, after vacuum. Scans keep walking the bloated leaf chain until the index is rebuilt. Height is not the problem: the internal levels are few and cached. The cost is the mostly empty leaves.

## Question 9

A B-plus tree index is built on two columns: tenant ID first, then creation time. Which query can it serve without a separate sort step?

A, rows for one given tenant, ordered by creation time. B, rows for every tenant ID above some value, ordered by creation time. C, rows created after some time, ordered by creation time. D, the ten newest rows across all tenants.

[think]

The answer is A: one tenant, ordered by creation time.

The index is sorted by the concatenated key, so for a fixed tenant the leaves are contiguous and already in time order. A range on tenant ID spans many tenants, each sorted by time separately, so the combined result still needs a sort. Queries that filter or order by creation time without fixing the tenant cannot walk a prefix of the key.

## Question 10

Redis implements sorted sets with a skip list rather than a red-black tree. Which of these did NOT motivate that choice?

A, the code is far shorter than an equivalent balanced tree. B, rank queries are logarithmic, using the span stored on each pointer. C, skip lists guarantee logarithmic worst-case time for every operation. D, range operations are simple, since the bottom level is a linked list.

[think]

The answer is C: skip lists do not guarantee a worst case.

A skip list is logarithmic in expectation, not in the worst case. Simplicity, easy ranges and rank support through spans were the real reasons; the missing worst-case guarantee is a cost that was accepted, not a motivation.

## Question 11

Redis, LevelDB and RocksDB all promote a skip-list node to the next level with probability one quarter, rather than one half. What does that change?

A, inserts no longer need the update vector, since levels are sparser. B, searches become about twice as fast, because there are half as many levels. C, the worst case improves, because tall towers become rarer. D, memory drops to 1.33 pointers per node, while search cost stays about the same.

[think]

The answer is D: fewer pointers, about the same search.

Halving the number of levels is paid back by walking up to three nodes per level instead of one, so the expected search is nearly unchanged, about 41 steps for a million keys either way. The expected pointer count falls from 2 to 1.33 per node. The worst case is still a chain in principle, and insertion still records the update vector.

## Question 12

You need an in-memory ordered index for a service with a 99th-percentile latency target, a moderate write rate, and a single-threaded access path. Which is the weakest choice?

A, an in-memory B-tree. B, a randomised treap. C, a splay tree. D, a red-black tree.

[think]

The answer is C: the splay tree.

A splay tree can spend linear time on a single operation, which is exactly what a tail-latency target forbids; its bound is only amortised. Red-black trees and B-trees have worst-case bounds. A treap's bound is only expected, but its bad cases are astronomically unlikely and no workload can trigger them.

## Recap

Three ideas kept coming back. First, at scale the cost of a tree is memory traffic, not comparisons: cache misses per level in memory, page reads on disk, which is why wide B-tree nodes win once data outgrows cache. Second, know which kind of bound you are quoting: worst case for AVL, red-black and B-trees, expected for treaps and skip lists, amortised for splay trees. And third, the balanced structure itself rarely fails; what hurts is the pattern around it, a delete that cascades, random keys that scatter page splits, or underfull pages nobody reclaims.
