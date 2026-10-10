---
lesson: ordered-maps-vs-hash-maps
source: a5cb4d0aaff8ec98
fit: partial
desk:
  - "The table of ordered-map operations against their hash-map equivalents"
  - "The floor and ceiling trace on a binary search tree, and the skip-list search for 42"
  - "The red-black against B-tree against skip-list table, and the honest comparison with a hash map"
  - "The bisect SortedMap code and the four-row bisect-left and bisect-right table"
  - "The calendar booking trace, and the production failure table"
  - "Exercises: floor of a key in a sorted array, and a time-based key-value store"
---
## Introduction

"Given a timestamp, return the value that was current at that moment." "Is there a booking that overlaps this one?" "How many events happened between 9:00 and 9:15?" "Who are the ten users just above me on the leaderboard?"

None of these is a lookup by exact key, so a hash map answers none of them. They are questions about order: the largest key not above x, the neighbours of x, everything in a range. Those need a map that keeps its keys sorted, and the price is a logarithm.

Knowing when to pay that logarithm, and what to reach for in a language that does not ship an ordered map, is a senior skill. Junior code sorts the whole collection on every query. Mid-level code uses a hash map and a linear scan. Senior code names the operation, "I need the floor of x", and picks the structure that provides it, knowing the cost.

## What an ordered map gives you

An ordered map keeps key-value pairs sorted by key. Exact get, put and remove become log n instead of constant. In exchange you get operations a hash map simply does not have. Floor: the largest key less than or equal to k. Ceiling: the smallest key greater than or equal to k. Minimum and maximum. A range scan, in log n plus the number of keys returned. Sorted iteration. And, with an augmented structure, rank: how many keys sit below this one.

Java calls it TreeMap. C++ has std map. Rust has BTreeMap. Go, Python and JavaScript have nothing in the standard library, which is where the second half of this goes.

## Balanced trees, and what a level costs

A binary search tree keeps every node's left subtree below it and its right subtree above it, rebalanced so the height stays logarithmic. Every ordered operation is one walk from the root that remembers the best candidate on each side.

Here is the lesson's example. The tree is built from 30, 10, 50, 20, 40, 60, and you want the floor and ceiling of 45. At the root, 30 is below 45, so 30 is the floor so far; go right. 50 is above 45, so 50 is the ceiling so far; go left. 40 is below 45, a better floor; go right. Nothing there. Floor 40, ceiling 50, in three comparisons. A hash map would scan all six keys.

Now the cost that matters. A red-black tree of a million entries is about 20 levels deep, and every level is a pointer to a separately allocated node. When the tree is bigger than the cache, each level is a trip to main memory, about 100 nanoseconds. So a cold lookup is about 2 microseconds, against 50 to 100 nanoseconds for a hash lookup. Each Java TreeMap entry is a 40-byte node before the key and value.

B-trees fix the levels. A B-tree node holds many keys in a small sorted array. Rust's BTreeMap holds 5 to 11 keys per node, so a node of 64-bit keys and values is 192 bytes, three cache lines, one allocation. A million entries is 6 to 8 levels deep instead of 20. That is why Rust chose a B-tree, and why databases did, one level down, with nodes the size of disk pages. Expect an in-memory B-tree to be two to three times faster than a red-black tree with the same big-O.

Skip lists take a third route: a sorted linked list with express lanes. Each node is promoted to the next level up with some fixed probability, a half in the textbook, a quarter in Redis. A search runs along the top lane while the next key is still below the target, drops a level, and repeats. Expected height is logarithmic. Insertion never rotates anything; it just splices a node into a few lanes. So concurrent insertion needs only local updates, which is why Java's concurrent sorted map is a skip list. The weakness is the same as any linked structure: every hop can be a cache miss.

## Where they actually run

The Linux scheduler keeps every runnable task in a red-black tree, with the leftmost node cached. Why a tree and not a heap? Because tasks are also removed from the middle when they block, and a heap can only remove its top cheaply.

Redis sorted sets are a hash table, member to score, for constant-time score lookups, plus a skip list ordered by score. Each forward pointer stores a span, the number of nodes it skips, and that makes rank queries logarithmic, which a plain tree cannot do. And small sorted sets, up to 128 members, are stored as one flat block instead, because a linear scan of a few hundred bytes beats any pointer structure.

LSM-tree memtables in LevelDB and RocksDB are skip lists, and their sorted order is what makes flushing to disk one sequential write. And a database B-tree index answers "the latest row at or before time t" as a floor: descend to the leaf, position on the last key not above the bound, read one row.

## Python and JavaScript: three substitutes

First, a sorted array with binary search. In Python, that is bisect. Lookups, floor and ceiling are log n. Insertion into the middle is linear, because everything after it shifts.

Getting floor right is the whole difficulty. bisect left returns the first index whose key is at least x. bisect right returns the first index whose key is strictly greater than x. Floor is the element just before bisect right. Ceiling is the element at bisect left.

Here is the trap. Keys 1, 3, 5, 7, and you want the floor of 5. Before I tell you: what does "bisect left, minus one" return?

[pause]

3. bisect left of 5 is index two, where the 5 sits, so minus one gives the 3, and you have skipped the exact match. bisect right of 5 is index three, so minus one gives the 5, which is correct. And guard index zero: the floor of 0 in that list is nothing.

How big can the sorted array get? Measured, a random insert costs about 0.6 microseconds at 10 thousand keys and about 40 microseconds at a million, against about a microsecond for a tree. So below 10 thousand to 100 thousand keys, the sorted array is competitive and far simpler. Above that, random inserts need a real ordered structure. A million random inserts with insort is quadratic work, and takes minutes. But if keys arrive already sorted, timestamps in a log, every insert is an append, and the sorted array is strictly the best structure there is.

Second, the sortedcontainers package: a list of sorted sub-lists, each kept between 500 and 2,000 elements. An insert shifts at most one small sub-list, contiguous memory, not pointer chasing. It is not in the standard library, so in an interview, say: "in production I'd use sortedcontainers; here I'll use bisect, and note that insert is linear."

Third, a heap, when you only ever need one end. If the only ordered operation is the minimum, a heap gives log n insert and pop, in one contiguous array. Scheduling and "k smallest" want a heap. The tell: you never need the floor of an arbitrary key, which a heap cannot do short of a full scan.

## Worked example: no double-booking

Book a time range only if it overlaps no existing booking. Keep bookings in an ordered map keyed by start time. Only two existing bookings can possibly overlap: the one with the largest start at or before yours, and the one with the smallest start at or after it. Two log n queries, no scan.

Say the bookings are 10 to 20, 30 to 40, and 50 to 60. A request for 20 to 30: the floor is the booking at 10, which ends at 20, not after your start. The ceiling is the booking at 30, which starts at 30, not before your end. No conflict; booked. A request for 45 to 55: the floor ends at 40, fine, but the ceiling starts at 50, before your end at 55. Conflict.

## In the interview

The lesson's follow-up. Design a leaderboard with "my rank" and "the ten users around me."

[pause]

A hash map from user to score, for constant-time score lookup, plus an order-statistics structure keyed by score and user: a tree augmented with subtree sizes, or a skip list with spans, so rank and select are both log n. That is exactly a Redis sorted set. The wrong answers are sorting all users on every request, or a heap, which cannot answer rank.

And: why is Rust's BTreeMap faster than a red-black tree when both are log n? Cache misses, not comparisons. A B-tree with 11 keys per node is 6 to 8 contiguous nodes deep at a million entries; a red-black tree is about 20 separately allocated nodes deep; and one miss to main memory costs about as much as a hundred comparisons. Saying "B-trees have a lower big-O height" is wrong: only the base of the logarithm changes, not the complexity class.

## Recap

Four things to remember. Name the operation first: floor, ceiling, range, rank. A hash map answers none of them without a full scan, and insertion order is not sorted order. Quote the constant: a red-black lookup is about 20 pointer chases, a B-tree about 7, a hash lookup one or two. In Python, floor is the element before bisect right, and a sorted list is right below about 10 thousand keys or when writes are append-only. And use a heap when you only need one end; use a tree when items also leave from the middle.

At your desk: the operations table, the tree and skip-list traces, the comparison tables, the bisect code and four-row table, the booking trace, and the two exercises.
