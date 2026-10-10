---
lesson: bloom-filters
source: 2fd319aef816cbaa
fit: partial
desk:
  - "The 64-bit Bloom filter code, and the ten-fruit trace of every bit it sets"
  - "The false-positive derivation, the optimal k, and the sizing table"
  - "The Guava, RocksDB, Cassandra and Postgres implementation details and knobs"
  - "The trade-offs table against blocked, Ribbon, cuckoo filters and a hash set, and the failure-modes table"
  - "Exercises: implement a Bloom filter with double hashing; size a filter from n and p"
---
## Introduction

A RocksDB or Cassandra node keeps a key's value in one of dozens of sorted files on disk. A read for a key that exists has to find the one file that holds it. A read for a key that does not exist has to check every file and come back empty-handed. Each check is a disk read of at least one 4 kilobyte block. Thirty files, thirty reads, for a key that was never there.

And absent keys are common. Every "insert if not exists", every cache miss, every deduplication check is a lookup for something that is probably not there. So this is the dominant read cost of the whole engine.

You cannot afford to keep every key of every file in memory. What you can afford is about ten bits per key. A Bloom filter turns those ten bits into one of two answers: "definitely not in this file", or "probably in this file". At a 1 percent false-positive rate, the engine skips 99 percent of the useless reads.

Three ideas: the one asymmetry the whole structure rests on, how to size a filter from the number of keys and the error rate you will accept, and where filters live in real systems and where they are the wrong tool.

## The invariant

A Bloom filter is an array of bits, all starting at zero, and a handful of hash functions. Call the number of hash functions k. Each one maps a key to a position in the array.

To add a key, compute its k positions and set those k bits to 1. To ask whether a key is present, compute the same k positions and look. If any of them is zero, the key was never added, because adding it would have set that bit. If all of them are 1, the answer is "probably".

That asymmetry is the whole structure. A zero bit is proof of absence. A one bit is not proof of presence, because some other key may have set it. So there are no false negatives, ever. The false positives come from bits shared with other keys.

Here is the smallest example. The lesson's filter has 64 bits and three hash functions. Add "apple", and it sets bits 63, 54 and 45. Add "banana", and it sets 16, 54 and 28. Bit 54 was already set by apple, so banana only adds two new bits. After ten fruit names, 19 of the 64 bits are set.

Now query "strawberry", which was never added. Its positions are 28, 22 and 16. Bit 28 came from banana and cherry. Bit 22 from elderberry. Bit 16 from banana and several others. All three are set, so the filter says "probably present". That is a false positive, assembled entirely from other people's bits.

Notice what a query costs. k hash computations and k bit reads. No comparison of the key itself, no pointer chasing, and no dependence on how many keys are stored. The filter never stores the key at all, which is also why you cannot list what is in it, or remove anything from it.

## Sizing a filter

You will be asked to size a filter, so here is what the formula says, in words. A query for an absent key is a false positive when all k of its bits happen to be set. So the error rate depends on how full the array is, and how full it is depends on bits per key and on k.

There is an optimal k. More hash functions make each query check more bits, which helps, but they also fill the array faster, which hurts. The sweet spot is about 0.7 times the bits per key, and at that point exactly half the bits are set.

The number to remember: about 10 bits per key for a 1 percent false-positive rate. More precisely, 9.6 bits per key with 7 hash functions. And every factor of ten in accuracy costs about 4.8 more bits per key. So 0.1 percent is 14.4 bits per key, and 10 percent is 4.8.

A worked example. A million keys at 1 percent needs about 9.6 million bits, which is 1.2 megabytes, for keys that might themselves be 20 to 100 bytes each. That is the bargain.

Now the trap. The formula assumes you know how many keys you will insert. Suppose you sized for a million and inserted two million. Bits per key drops from 9.6 to 4.8, with k still at 7. Before I tell you, guess the new false-positive rate.

[pause]

About 16 percent. Not 2 percent. The rate does not scale linearly with the key count; it degrades fast once the array is more than half full. The filter still never lies about absence, but its "probably yes" answers become nearly useless.

That is why log-structured engines love Bloom filters. An SSTable's key count is known when the file is written, so each filter is sized exactly and never overfills. If you cannot know the count up front, a scalable Bloom filter adds a new, larger filter when the current one fills, and queries all of them.

## Hashing, and the zero-step trap

Seven independent high-quality hash functions per query is expensive. The standard trick, from Kirsch and Mitzenmacher, is double hashing: compute two hashes once, and derive the rest as the first hash plus i times the second, modulo the array size. Same false-positive rate in practice, a fraction of the cost. Guava does this by splitting one 128-bit MurmurHash3 output into two halves.

There is a trap in it, and the lesson's own trace walks into it. If the second hash, the step, is a multiple of the array size, every probe lands on the same bit. The key sets one bit instead of k. In the trace, "lemon" has exactly that problem and sets only bit 16. "Melon" and "coconut" both collapse onto bit 28, which banana had set, so both are false positives on the strength of a single bit.

The fix is a guard: force the step to be odd, or otherwise refuse a zero step. Production libraries mostly make the trap improbable instead, with 64-bit steps or different probe arithmetic. When you write a filter with small hashes or a small array, write the guard.

The other production concern is memory locality. A 1.2 megabyte filter sits in the CPU cache. The filters of a whole store do not: a billion keys at 10 bits per key is 1.25 gigabytes. There, seven random bit reads are seven likely memory misses, several hundred nanoseconds, against a few nanoseconds of hashing. A blocked Bloom filter hashes the key to one cache-line-sized block first, and sets all k bits inside that block. One cache miss per query instead of k. The cost is a slightly higher false-positive rate: RocksDB's comments give about 0.96 percent at 10 bits per key, against 0.82 for a standard filter.

## Deletion

You cannot delete from a plain Bloom filter. Clearing a key's bits also clears bits shared with other keys, and those keys then produce false negatives, which breaks the one guarantee the structure makes. In the trace, deleting banana by clearing 16, 54 and 28 would make apple and cherry disappear.

A counting Bloom filter replaces each bit with a small counter, typically 4 bits. Add increments, delete decrements, query checks that all k counters are non-zero. It works, at three to four times the memory, and with an overflow hazard: a 4-bit counter saturates at 15, and after that you must never decrement it. Leave it stuck, which slightly raises false positives, rather than risk a false negative.

The modern answer is a cuckoo filter. It stores a short fingerprint of each key in one of two candidate buckets, and relocates fingerprints on collision. Lookup reads two buckets, delete removes one matching fingerprint. The memory is similar to a Bloom filter at the same error rate. The cost: inserts can fail when the table is nearly full, above about 95 percent load. If an interviewer asks "and if we need to remove keys?", the cuckoo filter is the answer that shows you have looked past the textbook.

## Where filters live

Log-structured storage engines first. Cassandra, ScyllaDB and HBase write a filter into every SSTable, and LevelDB and RocksDB do the same once you configure a filter policy. RocksDB builds no filter at all by default; the conventional setting is 10 bits per key. A point read checks the in-memory table, then asks each file's filter from newest to oldest, and reads only the files that say "maybe". Turn the filters off on a table with many files and read latency can multiply by the number of files.

Two RocksDB details worth knowing. Its Ribbon filter reaches the same false-positive rate as a 10-bit Bloom filter in about 7 bits per key, roughly 30 percent less space, at three to four times the construction CPU. And filters have to stay in memory: if the block cache is shrunk and filter blocks get evicted, every read fetches the filter from disk before it can skip anything.

CDN admission. An account of Akamai found that over three quarters of the objects in their logs were one-hit wonders, requested once and never again. Caching them evicts things that will be requested again. So a Bloom filter of recently seen URLs gates admission: an object is cached only on its second request. Switched on across about 47 servers, the byte hit rate rose from around 74 percent to 83, and disk writes fell by 44 percent.

And deduplication: a per-user filter of articles already recommended, a crawler's filter of visited URLs. The common thread is that every one of these tolerates a false positive, an extra disk read, a delayed admission, a skipped article, and cannot tolerate a false negative. If your use case is the other way round, a Bloom filter is the wrong tool.

One more honest limit. Filters answer membership for one key. A range scan cannot ask about a range, so "we have Bloom filters" does not make scans fast. A prefix Bloom filter helps prefix seeks, and that is the only exception.

## In the interview

A follow-up the lesson expects. Size a filter for 100 million keys at 0.1 percent false positives, and tell me the memory.

[pause]

14.4 bits per key, so 1.44 billion bits, about 180 megabytes, with 10 hash functions. If that is too much, 1 percent costs 120 megabytes and 10 percent costs 60, and the choice depends on what a false positive costs downstream. The wrong answer is "a few megabytes", from mixing up bits and bytes or forgetting that bits scale with the key count.

And a design one. A colleague proposes a Bloom filter in front of the user table to reject unknown usernames at login. Fine as a pre-filter that saves a database read for most junk requests. Wrong as the source of truth. Every "maybe" must go to the database, and the user-facing message must never come from the filter, or 1 percent of legitimate new users are told their name is taken. "Use a lower false-positive rate" reduces that error; it does not remove it.

## Recap

Four things to remember. A zero bit proves absence; all ones only means probably, so there are no false negatives and the false positives come from shared bits. About 10 bits per key buys 1 percent, and each further factor of ten costs 4.8 bits, but only if you know the key count: overfill a filter two times and 1 percent becomes 16. Never delete by clearing bits; use a counting or cuckoo filter. And ask what a false positive costs before you reach for one.

At your desk: the filter code and the ten-fruit trace, the false-positive derivation and sizing table, the library internals and failure modes, and the two exercises, implementing the filter and sizing it.
