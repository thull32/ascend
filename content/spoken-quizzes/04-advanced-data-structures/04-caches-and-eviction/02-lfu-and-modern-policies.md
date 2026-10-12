---
lesson: lfu-and-modern-policies
source: 0025f4a57e8a9aa2
---
## 1

In a constant-time LFU cache, why can the minimum frequency be set to 1 after every insert of a new key, without checking anything?

A, the new key has a count of 1, so bucket 1 is now the lowest non-empty bucket. B, each insert resets all existing counts to 1, so every key sits at the minimum. C, eviction always empties the minimum bucket, so the old minimum is gone. D, it cannot; the minimum must be found by scanning the buckets after an insert.

[think]

The answer is A: the new key has a count of 1, so bucket 1 is the lowest non-empty bucket.

The new key lands in bucket 1, which is therefore non-empty, and is the smallest possible frequency. The minimum only needs to move up when a promotion empties the bucket it points at. Eviction removes one key from the lowest bucket and need not empty it; the reset is safe because of the new key, not because of the eviction.

## 2

An LFU cache that tracks its minimum frequency gains a delete method. A delete removes the only key at the minimum count, and the next put must evict. What goes wrong, and what avoids it?

A, the minimum falls to 0; a min-heap of bucket counts restores it in constant time. B, the minimum names an empty count; a sorted list of frequency nodes keeps the minimum right after the head. C, the deleted key stays in its bucket; a set instead of an ordered bucket removes it. D, nothing, because the next put resets the minimum to 1 before it evicts.

[think]

The answer is B: the minimum names an empty count; a sorted list of frequency nodes avoids it.

Only an insert repairs the minimum, and a put evicts before it inserts, so the eviction reads a count with no keys and must scan for the next one. In a list of frequency nodes, the delete unlinks the emptied node, so the node after the head is the minimum again, in constant time. The reset to 1 comes after the eviction, and a heap would make each repair log n.

## 3

Why is pure LFU, with no aging, unusable for a cache in front of a news site?

A, a per-key count costs more memory than caching the stories saves. B, each access costs log n, too slow for a busy site. C, one-hit wonders flush popular stories, as a scan does under pure LRU. D, old stories keep huge counts forever, so new stories are evicted first.

[think]

The answer is D: old stories keep huge counts forever, so new stories are evicted first.

Without decay, a count reflects all of history, and old hits crowd out everything new. Periodic halving, as in TinyLFU, or a time-based decrement, as in Redis, makes counts reflect recent frequency. One-hit wonders are what LFU evicts most readily; its failure is the opposite, counts that never fade.

## 4

In the ARC trace, a key that was evicted from T1 is requested again while its ghost is still in B1. What happens?

A, the key re-enters T1 at the front, and the target p is unchanged, since it was a miss. B, the target p shrinks, because a recency-side eviction proved correct. C, the key is served from B1, without any change to the lists. D, the target p grows, and the key enters T2, since it has now been seen twice.

[think]

The answer is D: the target p grows, and the key enters T2.

A ghost hit in B1 means the recency side was too small, so p increases, one entry is evicted to make room, and the returning key goes straight into T2, because this is its second sighting. B1 holds only keys, not values, so nothing can be served from it. A hit in B2 is what shrinks p.

## 5

What does the count-min sketch in W-TinyLFU decide?

A, how long each entry lives, by turning estimated frequency into a TTL. B, how large the window LRU is, by tracking the hit ratio over time. C, whether a newcomer is admitted, by comparing it with the eviction victim. D, which entry in the main cache is evicted, by its lowest estimated count.

[think]

The answer is C: whether a newcomer is admitted, by comparing it with the eviction victim.

TinyLFU separates admission from eviction. The main cache evicts by segmented LRU; the sketch is consulted only to decide whether the newcomer deserves the victim's slot, and one-hit wonders lose that comparison and never enter. The window size is tuned by hill-climbing on the hit ratio, not by the sketch.

## 6

A Caffeine cache is built with a maximum size of 10 thousand. How large is its frequency sketch?

A, 128 kibibytes: 16,384 longs, each holding sixteen 4-bit counters. B, 40 kilobytes: four 1-byte counters for each of the 10 thousand entries. C, 640 kilobytes: one 64-byte block of counters for every entry. D, about 5 kilobytes: one 4-bit counter per entry.

[think]

The answer is A: 128 kibibytes, 16,384 longs of sixteen 4-bit counters.

The sketch sizes its table to the maximum rounded up to a power of two, in 64-bit words of sixteen 4-bit counters: 16,384 longs, or 128 kibibytes, about 13 bytes per entry. Each key uses four counters inside one 64-byte block, but many keys share a block, so it is not a block per entry, and 4 bits is the width of a counter, not the cost of an entry.
