---
lesson: lru-cache
source: 0923b5e764f636a2
---
## 1

Why does an LRU cache need a doubly linked list, rather than a singly linked one?

A, eviction must delete the key from the map, and only a doubly linked node can store it. B, doubly linked nodes use less memory, because sentinels remove the null checks. C, pushing to the front needs the old head's address, which a singly linked list does not keep. D, unlinking a node needs its predecessor, which a singly linked node cannot reach in constant time.

[think]

The answer is D: unlinking a node needs its predecessor.

The hash map hands you a pointer to the node, not to the node before it. Unlinking means pointing the predecessor past the node, and only a previous pointer gets you there without a linear walk. The head is always known, any node can store its key, and a previous pointer costs memory rather than saving it.

## 2

A full LRU cache with a maximum size of 2, in the pure-Python version of functools, misses on a new key. What happens to its linked list?

A, the oldest link is freed, and a new link is allocated before the root. B, the dictionary and the ring are cleared, and the new entry starts a fresh ring. C, the old root takes the new entry, and the oldest link becomes the root. D, the oldest link is found by scanning the ring for the lowest hit count.

[think]

The answer is C: the old root takes the new entry, and the oldest link becomes the root.

The root sits between the newest and the oldest link, so writing the new key and result into the old root makes it the newest entry, and emptying the oldest link turns it into the new root: no pointer writes and no allocation. The C version reuses the oldest link too, but moves it with six pointer writes. Nothing scans hit counts, because LRU order is the ring order.

## 3

A put on a key that is already cached creates a fresh node and pushes it to the front, leaving the old node in the list. What is the first visible consequence?

A, the map and the list disagree, and a later eviction deletes a live key from the map. B, the old node is evicted first, so the cache acts as if the key were refreshed. C, nothing: the map points at the new node, so the old one is unreachable. D, memory use doubles at once, because the value is stored twice.

[think]

The answer is A: the map and list disagree, and a later eviction deletes a live key.

The map has one entry for the key, but the list has two nodes. When the stale node reaches the tail, eviction deletes the key from the map, although the fresh node is still near the front, so a live entry disappears. Memory grows by one node, not double, and the old node is still reachable through the list.

## 4

A nightly job scans every row of a large table through a pure LRU cache in front of the database. What happens to the daytime working set?

A, it survives, because its keys have far higher access counts. B, it survives, because read-only access does not change LRU order. C, it is evicted, because every scanned row becomes the most recent. D, part of it survives, because scanned rows enter at the middle of the list.

[think]

The answer is C: it is evicted, because every scanned row becomes the most recent.

LRU has no notion of frequency: a single touch makes a scanned row the most recent entry, and a scan larger than the cache flushes everything. Midpoint insertion is InnoDB's defence against exactly this, not something pure LRU does. This scan pollution is why Linux, InnoDB and Postgres all depart from pure LRU.

## 5

Why does Redis approximate LRU by sampling a few keys, instead of keeping a linked list?

A, a list needs a lock around every access, and Redis must avoid locks. B, expired keys would clog a list, and sampling purges them for free. C, sampling gives a higher hit ratio than exact LRU for the same memory. D, a list costs 16 bytes per key, and sampling comes close to exact LRU.

[think]

The answer is D: a list costs 16 bytes per key, and sampling comes close to exact LRU.

Sixteen bytes of pointers per key is significant when keys are small and numerous. A 24-bit clock, plus sampling 5 to 10 keys, with a 16-entry pool of the best candidates, gets close to exact LRU's hit ratio at a fraction of the memory. It is not more accurate than exact LRU, only nearly as accurate, and much cheaper.

## 6

You add thread safety with a single mutex around get and put. What is the main cost?

A, every read queues on the one lock, so reads lose their parallelism. B, gets can interleave with puts, so results become incorrect. C, memory roughly doubles, because every entry needs its own lock. D, recency order becomes approximate, because reads are buffered.

[think]

The answer is A: every read queues on the one lock, so reads lose their parallelism.

A global lock is correct, but it turns a structure meant to serve reads in parallel into a serial bottleneck. Segmented locks, or lock-free read buffers as in Caffeine, keep reads concurrent; approximate recency order is the price of those read buffers, not of a global lock.
