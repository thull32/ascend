---
lesson: bloom-filters
source: 3a73e3d96310dde6
---
## 1

A Bloom filter reports "not present" for a key. What can you conclude?

A, the key was definitely never added. B, the key was probably never added. C, nothing, without checking the backing store. D, the key was added and later deleted.

[think]

The answer is A: the key was definitely never added.

Adding a key sets all k of its bits, so if any of them is 0, the key was never added. "Probably" describes the positive answer, not the negative one. And a plain Bloom filter has no deletion, so "added and later deleted" cannot happen.

## 2

You sized a Bloom filter for a million keys at a 1 percent false-positive rate, about 9.6 bits per key with 7 hash functions, but you inserted 2 million keys. Roughly what is the false-positive rate now?

A, about 16 percent. B, about 50 percent. C, about 1 percent. D, about 2 percent.

[think]

The answer is A: about 16 percent.

The bits per key halve to 4.8, while the number of hash functions stays at 7, and the formula then gives about 0.16. The rate does not scale linearly with the number of keys, so 2 percent is the tempting wrong answer; it degrades much faster once the array is more than half full.

## 3

Why does RocksDB attach a Bloom filter to each SSTable?

A, to compress each file's keys, so fewer pages are read. B, to let range scans skip files outside the scanned range. C, to find which keys to merge together during compaction. D, to skip files that cannot hold the key, on a point lookup.

[think]

The answer is D: to skip files that cannot hold the key, on a point lookup.

Otherwise a point read must check every SSTable that might hold the key. The filter answers "definitely not here" for most files without touching the disk. It does not help range scans: a filter answers membership for one key, and a range scan must visit every overlapping file regardless. A prefix Bloom filter helps only prefix seeks.

## 4

Your double-hashing implementation computes positions as h1 plus i times h2, modulo m. For one key, h2 modulo m is zero. What happens?

A, nothing, since the key still sets k distinct bits. B, the key sets one bit instead of k, so false positives rise. C, the insert fails, and the key is left out of the filter. D, the filter later returns a false negative for that key.

[think]

The answer is B: the key sets one bit instead of k, so false positives rise.

All k positions collapse onto h1 modulo m, as lemon, melon and coconut do in the lesson's trace. The key is still found, so there is no false negative, but it occupies one bit instead of k, so it becomes a false positive far more easily. Implementations force h2 to be odd, or non-zero.

## 5

Why does RocksDB's cache-local Bloom filter put all of a key's bits inside one 64-byte block?

A, so the false-positive rate drops, because the bits are packed more densely. B, so the filter can be updated in place when keys are deleted. C, so a query costs one cache miss instead of k, at a slightly higher false-positive rate. D, so the filter can be built without knowing the number of keys.

[think]

The answer is C: one cache miss instead of k, at a slightly higher false-positive rate.

With k independent positions, a query touches k random cache lines, about k memory misses on a large filter; confining the probes to one line makes it one miss. Packing keys into blocks makes the bits less uniform, so the false-positive rate rises a little for the same bits per key. Blocking does nothing for deletion or an unknown key count.

## 6

Which use case is a poor fit for a Bloom filter?

A, answering "is this username taken?" exactly, at signup. B, avoiding re-crawling URLs a crawler has already visited. C, admitting a URL to a CDN cache on its second request. D, skipping a disk read for keys not in an SSTable.

[think]

The answer is A: answering "is this username taken?" exactly, at signup.

Signup needs an exact answer, and a false positive tells a user their name is taken when it is not. The other three tolerate a false positive, at the cost of an extra read, a delayed admission or a skipped URL, and need to avoid false negatives, which is the Bloom filter's guarantee.
