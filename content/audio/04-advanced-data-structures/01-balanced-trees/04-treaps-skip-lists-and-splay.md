---
lesson: treaps-skip-lists-and-splay
source: a50dbf500d4971e9
fit: partial
desk:
  - "The treap insert, delete, split and merge code, and the seven-key insert and delete trace"
  - "The skip-list level-distribution table, the three-search trace and the update vector"
  - "The splay trace on a seven-node chain, step by step"
  - "The Redis sorted-set node, RocksDB memtable and ConcurrentSkipListMap details"
  - "The choosing and trade-off tables, and the failure-mode table"
  - "Exercises: build a treap from explicit priorities; skip list with explicit levels"
---
## Introduction

AVL and red-black trees buy their log n guarantee with case analysis: four rotation shapes, colour rules, a delete procedure that runs to pages. Two things bother experienced engineers about that. The code is long, and every line is a place for a bug that shows up once a month. And the structures are hostile to concurrency, because a rotation changes several nodes at once and readers must not see the half-done state.

Three structures solve the same problem by giving something up. Treaps and skip lists replace the invariant with randomness: balanced with high probability, in a fraction of the code. Splay trees keep no balance information at all, and instead reshape themselves around whatever you touch. Between them they cover Redis, RocksDB, LevelDB and Java's concurrent ordered map.

Three ideas, one per structure: what each invariant really is, why its cost is what it is, and where it runs. Then the traps.

## Treaps: a search tree and a heap at once

A treap node holds a key and a priority. The tree is a search tree on the keys and a max-heap on the priorities: every node's priority is at least its children's. That is the whole invariant.

Here is why it balances. If priorities are drawn at random when a node is created, the treap is exactly the search tree you would get by inserting the keys in decreasing priority order. That is a random order. And a tree built from a random order has expected depth about 1.39 times the base-2 log of n. So operations are log n in expectation, and no insertion order an adversary picks can break it.

A tiny example. Insert keys 30, 10 and 20 with priorities 10, 5 and 50, in any order you like. You always end with 20 at the root, because it has the highest priority, and 10 and 30 sort to its left and right. The shape depends only on the pairs of key and priority. Remember that; it comes back in the interview.

Insert is a normal leaf insert with a fresh random priority, then rotate the node up while its priority beats its parent's. Delete rotates the node down, always with the higher-priority child so the heap holds, until it has at most one child, then splices it out. No cases.

The feature that makes treaps worth knowing is split and merge. Split divides a treap into keys below k and keys at or above k, in log n, with a short recursion down one path. Merge joins two treaps where every key in the first is smaller: the root is whichever root has the higher priority, and you recurse on one side. Each is about ten lines. With them, insert is "split, then merge left, new node, right". And an implicit treap stores no keys at all, addressing positions by subtree size, which gives you an array with log n insert, delete, reverse and range sum anywhere: the interface of a text editor's rope.

## Skip lists: a linked list with express lanes

A sorted linked list is linear to search because you cannot skip ahead. So give some nodes a second forward pointer that skips several nodes, some of those a third that skips more, and you get a stack of ever sparser lists over the same keys. Search starts at the top level, moves right while the next key is still below the target, drops a level, and repeats. It is binary search on a linked list.

Each node's height is random. With probability p it gets one more level, repeated. With p of one half, half the nodes reach level 2, a quarter level 3, and a node averages 2 pointers. With p of one quarter, a quarter reach level 2, and a node averages 1.33 pointers.

Here is the surprise. Before I tell you: does p of one quarter make search slower, since there are half as many levels?

[pause]

Barely. Pugh's bound on the expected search path for a million keys is about 42 steps either way, 41.9 at one half and 41.2 at one quarter. Half the levels is paid back by walking up to three nodes per level instead of one. Measured on 100 thousand keys, a search touched 33 nodes at one half and 30 at one quarter. So one quarter gives about the same search time for a third less pointer memory, which is why Pugh recommends it, and why Redis, LevelDB and RocksDB all use it.

A small search said aloud. The bottom level holds 10, 20, 25, 30, 40, 50 and 60. Level 2 holds 20, 30 and 50. Level 3 holds only 30. Search for 40: at the top, 30 is below 40, so move to it; nothing after it, drop. At level 2, the next is 50, too big, drop. At level 1, the next is 40. Three nodes touched instead of five. The price shows when you search for 10: you still visit the top of every level first, three nodes where a plain list needs one. A skip list's log n is an average over keys and over the coin flips.

Insert is a search that remembers, at every level, the last node below the new key. Draw a random height and splice the node in at each level. No rotations, and an existing node never moves. That is the property concurrency people care about.

## Splay trees: let the workload shape the tree

A splay tree stores nothing but keys and pointers. Every access, lookups included, ends by splaying the node you touched up to the root, in steps chosen by the node, its parent and its grandparent. Zig, when the parent is the root: one rotation. Zig-zig, when node and parent are both left children or both right children: rotate at the grandparent first, then at the parent. Zig-zag, when they bend: rotate at the parent, then at the new parent.

The zig-zig order is the subtle part and the trap. The naive version rotates at the parent every time, a plain move-to-root. That brings your node up just as fast, but leaves the rest of the path as deep as it was. Zig-zig halves the depth of every node on the path. The lesson measured it: a 2,000-key tree built by sorted inserts, then accessed in order 1 to 2,000. Splaying cost 4.4 rotations per access on average. Naive move-to-root cost 1,000 per access, because it keeps the tree a chain. That factor of 200 is the whole content of the analysis, and a two-parent-rotation bug passes every unit test while failing it.

What you get is log n amortised: any sequence of m operations costs m log n in total, even though one operation can cost n. And you get locality no balanced tree has. The working-set property: touching one of the last t distinct keys costs about log t, so a hot set of a hundred keys in a tree of a billion costs on the order of 7 steps, not 30. And touching every key in order costs constant amortised per key.

The costs are just as concrete. Reads write: every lookup restructures the tree, so concurrent readers serialise on the root, and a cache line many threads read becomes one many threads write. And with no per-operation bound, a splay tree is out for anything with a latency target. So they are rare on shared read paths; the idea lives on in cache eviction policies.

## Where they run

Redis sorted sets. A small set, at most 128 entries each at most 64 bytes, is a flat listpack scanned linearly. Above that it becomes a skip list plus a hash table from member to score. Each skip-list node holds the member, the score, a backward pointer for reverse iteration, and per level a forward pointer and a span: how many bottom-level nodes that pointer jumps over. Spans are what make ZRANK and range-by-rank logarithmic: add up the spans along the search path and you have the rank. The cost is roughly 80 to 100 bytes per member before the string itself. And Antirez's reasons were not speed: simpler code, ranges that walk the bottom level, and memory you can tune by lowering p.

RocksDB and LevelDB memtables are skip lists with p of one quarter, allocated from an arena, keys stored inline. A writer fully builds a node, then publishes it by writing one forward pointer per level with release semantics. A reader either sees the old next pointer and skips the new node, or sees the new node complete. No node ever moves, so readers never lock. Concurrent writers use one compare-and-swap per level.

Java's ConcurrentSkipListMap is the standard library's only concurrent ordered map, for the same reason: lock-free insertion into a red-black tree is a research problem; on a skip list it is a compare-and-swap per level.

The honest cost: skip lists use more memory than a B-tree, a pointer per level per node and a cache miss per node visited, and their bound is expected, not guaranteed. Nobody has been bitten by the expected bound. Everyone has been bitten by the memory.

## Choosing, and the traps

Guaranteed bounds, single-threaded: red-black or a B-tree. Concurrent readers and writers: a skip list. Rank queries: spans or subtree sizes. Splitting and joining sequences: a treap. Skewed access with a small hot set, single thread: a splay tree. Anything big enough to miss cache: a B-tree.

The traps. A Redis instance using five times the memory of its sorted-set data: a million 20-byte members is about 120 megabytes, not 20. Keep members short and shard many small sets rather than one huge one. A treap that turns into a chain in production: priorities were derived from the key, or from a random generator an attacker can predict, so crafted keys build a chain. Never derive priorities from the key on untrusted input. Read-only load on a splay tree that gets slower as you add cores, because every read writes the root. And rank queries that are linear in a home-grown skip list, because nobody stored spans.

## In the interview

A follow-up the lesson expects. Two replicas insert the same keys in different orders. How do you make their in-memory trees identical?

[pause]

A treap whose priority is a deterministic function both replicas agree on, for example a keyed hash of the key with a shared secret. The shape depends only on the set of key and priority pairs, so both converge, and the secret protects against adversarial keys. The wrong answer is "an AVL tree, because it is deterministic". It is deterministic given the order, and the orders differ.

And another: why did Redis choose a skip list over a red-black tree? Shorter code, ranges that fall out of the bottom list, rank through spans without augmenting a tree, and comparable memory at p of one quarter. Not speed, and not the bound, which is only expected.

## Recap

Four things to remember. A treap is a search tree on keys and a heap on random priorities, which makes it the tree of a random insertion order: expected depth about 1.39 log n, a shape fixed by the pairs, and split and merge in ten lines each. A skip list is binary search on a linked list; p of one quarter costs 1.33 pointers per node for about the same search, and because nodes never move, it is the concurrent ordered map. A splay tree is log n amortised with a working-set bonus, zig-zig must rotate the grandparent first, and because reads write, it does not belong on a concurrent or latency-bound path. And all three trade a guarantee for simplicity: expected or amortised, never worst case.

At your desk: the treap code and trace, the skip-list table and search trace, the splay trace, the Redis and RocksDB node details, the choosing tables, and the two exercises.
