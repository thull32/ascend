---
lesson: design-problems
source: 88915894dd68ccd1
---
## 1

In the swap-with-last removal for a randomised set, the code deletes the removed value's position entry before writing the moved last value's new position. On which operation does this fail?

A, never; the two writes can safely go in either order. B, removing the element that sits first in the array. C, removing any element from a set of exactly two. D, removing the last element, whose entry gets re-created.

[think]

The answer is D: removing the last element, whose entry gets re-created.

When the removed value is the last one, the last value and the removed value are the same. Deleting first and repairing second writes its position back into the map, so the map claims a value that is no longer in the array. Repairing first and deleting last handles the case with no special branch.

## 2

Why does an LRU cache use a doubly linked list, rather than a singly linked one?

A, singly linked lists cannot use a sentinel head node. B, doubly linked nodes use less memory than singly linked ones. C, to print the cache in both directions for debugging. D, unlinking needs the predecessor, and the previous pointer gives it in constant time.

[think]

The answer is D: unlinking needs the predecessor, and the previous pointer gives it at once.

The hash map gives direct access to the node, and moving it to the front means unlinking it first. Unlinking needs the node's predecessor, and a singly linked list would have to walk from the head to find it, which is linear. The extra pointer costs memory; it is the price of constant-time moves.

## 3

An LFU cache evicts the key with the fewest uses. Why can it run in constant time without a heap?

A, counts are capped at a constant, so a heap is constant time too. B, counts only rise by 1, so a bucket per count plus the minimum count suffice. C, eviction scans every bucket, but the buckets are small. D, hash maps keep their keys sorted by value automatically.

[think]

The answer is B: counts only rise by 1, so buckets and the minimum suffice.

A use moves a key from the bucket for count f to the bucket for f plus 1, and a new key enters bucket 1. So the minimum can only become f plus 1, when bucket f empties, or 1, on an insert. Tracking it in one variable avoids both a heap's decrease-key and any scan over the buckets.

## 4

Four Python threads share an unlocked LRU cache. Why can it end up above its capacity, even with the GIL?

A, Python threads have run truly in parallel since version 3.12. B, the GIL is released during every dictionary lookup. C, dictionaries are not thread-safe for concurrent reads. D, the GIL makes each bytecode atomic, not each method.

[think]

The answer is D: the GIL makes each bytecode atomic, not a method.

A thread switch can land between the pointer writes of an unlink and a push to the front, leaving the list and the map disagreeing. In the measurement, the map grew to 300 entries with a capacity of 100, and the list became a cycle. Every get writes to the list, so each public method needs a lock, or the cache must be sharded.

## 5

In Node, an LRU cache built on a Map, deleting and re-setting each key on a hit, was measured against a hand-written linked list. Which result matches, and why?

A, the Map version failed, since insertion order is not guaranteed. B, they were identical, since both are constant time per operation. C, the Map version was faster, since its order is maintained natively. D, the Map version was 4 to 5 times slower, from churn in its ordered table.

[think]

The answer is D: the Map was 4 to 5 times slower, from churn in its ordered table.

Both are constant time, but each delete and re-insert appends a new entry and leaves a deleted slot in V8's insertion-ordered table, reclaimed only on rehash. On a million operations, the Map version took about 250 to 290 milliseconds, and the hand-written list about 55 to 75. Insertion order is guaranteed by the language specification.

## 6

Design Twitter's news feed call must return the 10 newest tweets from F followees. What is the efficient in-memory approach?

A, merge with a heap, one cursor per author, in order F plus 10 log F. B, store each tweet in every follower's feed as it is posted. C, keep one global list, and filter it for each read request. D, sort all of the followees' tweets by time on each read.

[think]

The answer is A: a heap merge with one cursor per author.

Each author's tweets are already in time order, so a heap seeded with each author's newest tweet yields the global order one pop at a time, pushing that author's previous tweet after each pop. Sorting or filtering touches every tweet. Pushing into followers' feeds is fan-out on write, a scale decision with its own cost for accounts with millions of followers.
