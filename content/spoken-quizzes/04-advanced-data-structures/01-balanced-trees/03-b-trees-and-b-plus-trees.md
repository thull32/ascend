---
lesson: b-trees-and-b-plus-trees
source: 7e11dc003f6fd1e1
---
## 1

An index on a 4-billion-row table uses 8 kilobyte pages holding about 400 entries each. About how many levels does the B plus tree have, and how many of them are usually served from cache on a point lookup?

A, about 32 levels, roughly half of them cached. B, 4 or 5 levels, all but the leaf cached. C, about 12 levels, only the root cached. D, 2 or 3 levels, all of them cached.

[think]

The answer is B: 4 or 5 levels, all but the leaf cached.

400 cubed is 64 million, and 400 to the fourth is 25.6 billion, so 4 to 5 levels. The levels above the leaves hold at most a few hundred thousand pages in total, which a normal buffer pool keeps in memory; the leaf level is the one that may need the disk. 32 levels is what a binary tree would need, not a tree that fans out 400 ways.

## 2

Why do B plus trees keep records only in the leaves, and link the leaves together?

A, internal pages fit more separators, and range scans walk sibling leaves. B, linked leaves let the tree hold duplicate keys in overflow chains. C, leaf-only records keep every leaf at one depth, which balances the tree. D, records in leaves mean inserts split pages far less often.

[think]

The answer is A: internal pages fit more separators, and range scans walk sibling leaves.

Balance comes from the rule that the tree grows by splitting at the root, not from where the data lives. Moving data out of internal nodes lets each internal page hold more separators, a higher fan-out and a shorter tree, and the leaf chain lets a range query read sequential pages without revisiting internal nodes.

## 3

A table in InnoDB uses random version 4 UUIDs as primary keys. Compared with an auto-increment key, what is the main storage-engine cost?

A, inserts land in random leaves, splitting pages across the whole table. B, equality lookups on UUID keys need a hash index instead of the tree. C, lookups degrade towards linear, since random keys unbalance the tree. D, each insert triggers rotations that rebalance the tree up to the root.

[think]

The answer is A: inserts land in random leaves, splitting pages across the whole table.

Random keys defeat the rightmost-insert optimisation and spread splits everywhere, so pages stay about 70 percent full, and each insert dirties an unpredictable page. InnoDB's clustered layout means the table data pays this too, and every secondary index carries the 16-byte key. The tree stays perfectly balanced whatever the key order, and B plus trees split pages rather than rotate.

## 4

After deleting 80 percent of the rows in a large Postgres table, queries on its index are still slow, and the index file is the same size. Why?

A, Postgres B-tree indexes cannot remove entries once written. B, Postgres leaves underfull pages in place until a reindex. C, the tree height cannot shrink, so lookups keep the original depth. D, the deleted rows remain in the write-ahead log, which index scans still read.

[think]

The answer is B: Postgres leaves underfull pages in place until a reindex.

Merging eagerly on delete is expensive and rarely worth it, so Postgres does not merge underfull pages; it only reclaims completely empty pages after a vacuum. Scans still walk the bloated leaf chain until the index is rebuilt. Height is not the problem: the internal levels are few and cached, and the cost is the mostly empty leaves.

## 5

In a B plus tree with at most 3 keys per node, a leaf merge empties its parent, an internal node. Its left sibling holds 30 and 50, and the root above them holds 70. What repairs the empty node?

A, the sibling's 50 moves sideways into it, and the root is unchanged. B, the root's 70 moves down into it, and the sibling's 50 moves up to the root. C, it is deleted and the root's 70 is dropped, shrinking the tree by a level. D, it merges with the sibling, and the root becomes 30, 50 and 70.

[think]

The answer is B: the root's 70 moves down, and the sibling's 50 moves up to the root.

Internal nodes borrow through the parent: the separator between the two siblings, 70, comes down into the underfull node, the sibling's largest key, 50, rises to replace it, and the sibling's last child moves across. Moving 50 sideways would put a key below 70 under a subtree the root says holds 70 and above. A merge is only used when the sibling has no spare key.

## 6

A B plus tree index is on tenant id, then created at. Which query can it serve without a separate sort step?

A, where tenant id equals a value, ordered by created at. B, where tenant id is greater than a value, ordered by created at. C, where created at is after a value, ordered by created at. D, ordered by created at, descending, limit 10.

[think]

The answer is A: where tenant id equals a value, ordered by created at.

The index is sorted by the combined key, so for one tenant the leaves are contiguous and in created-at order. A range on tenant id spans many tenants, each sorted separately, so the combined result still needs a sort. Queries that filter or order by created at without fixing the tenant cannot walk a prefix of the key, and need a different index or a sort.
