---
lesson: partitioning-and-sharding
source: fa98442fe0827c8a
---
## 1

A 2 terabyte events table is partitioned by month. A query filters on the occurred-at time truncated to the day, equal to the 20th of September. The plan shows every partition scanned. Why?

A, a default partition exists, which switches pruning off for all queries. B, pruning works only for equality on integer keys, never on timestamps. C, the filter is on an expression of the key, not on the key itself. D, pruning needs an index on occurred-at in every partition to find the bounds.

[think]

The answer is C: the filter is on an expression of the key, not on the key itself.

Pruning compares the predicate with partition bounds, and the planner does not invert an expression to recover the key. In the lab, the version that cast to a date scanned all 24 partitions in 140 milliseconds. Rewrite it as a half-open range on occurred-at, and one partition remains. Indexes and default partitions do not affect pruning.

## 2

After partitioning a table by month, a one-week query that already used an index on the occurred-at time is no faster. What does that tell you?

A, pruning skipped only what the index already skipped, so the same pages are read. B, the partitions were created wrongly, so pruning did not apply. C, Postgres 17 disables pruning when a partitioned index is present. D, partitioned tables are always slower, because of the append node.

[think]

The answer is A: pruning skipped only what the index already skipped.

The lab measured 320 buffers and about 2.3 milliseconds either way. The index already bounded the scan to one week, so skipping the other partitions saved nothing. Partitioning pays off for retention, for per-partition maintenance, and for queries that would otherwise scan the whole table. The append node's overhead is negligible when pruning leaves one partition.

## 3

You remove a month of data by detaching the partition and dropping it, instead of deleting the rows. Why does this matter most on a large, replicated table?

A, delete cannot remove rows from a partitioned table without a full scan. B, drop returns disk space only after the next vacuum full has completed. C, drop runs faster because it skips the foreign-key checks that delete runs. D, drop writes a few catalogue records instead of one log record per row.

[think]

The answer is D: drop writes a few catalogue records instead of one log record per row.

Deleting about 100 thousand rows wrote about 100 thousand log records and 14 megabytes of log that every replica replays, and the table did not even shrink. The drop wrote 91 records and under 15 kilobytes. At 100 gigabytes a month, that is the difference between hours of log and an unlink. Drop returns space at once; delete only makes it reusable.

## 4

Ten thousand tenants have Zipf-distributed load, and are hashed across 16 shards. The largest tenant carries about 10 percent of all traffic. What is the consequence?

A, its shard carries about 2.5 times the average load, and caps the fleet. B, every shard carries about 10 percent more than it would with uniform tenants. C, the fleet needs 17 shards, so that the largest tenant can be spread out. D, nothing, because hashing spreads tenants evenly across the 16 shards.

[think]

The answer is A: its shard carries about 2.5 times the average load.

Hashing spreads tenants, not load. The largest tenant's 10 percent lands on one shard, on top of that shard's share of everyone else, about 5.6 percent: roughly 16 percent, against an average of about 6. The fleet saturates when that shard does. A directory that isolates the tenant, or splitting it by a secondary key, fixes it; more shards do not.

## 5

Each of 16 shards answers within 10 milliseconds 99 percent of the time. A query must wait for all 16. How often does it take longer than 10 milliseconds?

A, about 16 percent of the time, sixteen times the single-shard rate. B, about 1 percent of the time, the same as a single shard. C, about 50 percent of the time, since half the shards are always slow. D, about 15 percent of the time, since 1 minus 0.99 to the 16th is 0.149.

[think]

The answer is D: about 15 percent of the time.

The query is slow if any shard is slow, which is 1 minus 0.99 to the 16th, or 0.149. Adding the probabilities, to get 16 percent, overcounts the overlaps, and the single-shard rate ignores the fan-out. With 64 shards it is about 47 percent, which is why fan-out queries have poor tail latency, and why hedged requests, or avoiding fan-out, matter.

## 6

A router sends each key to its hash modulo 4. A fifth shard is added. Roughly what fraction of keys must move, and what avoids it?

A, none; keys keep their shard and only new keys go to the new shard. B, about 80 percent; consistent hashing or a directory moves about a fifth. C, about 25 percent; each old shard hands a quarter of its keys to the new one. D, about 20 percent; only the keys that belong on the new shard have to move.

[think]

The answer is B: about 80 percent move, and consistent hashing or a directory moves about a fifth.

A key stays put only if its hash modulo 4 equals its hash modulo 5, which holds for one hash in five, so 80 percent move. Consistent hashing moves about a fifth of the keys, and a directory moves exactly the tenants you choose. Leaving old keys in place would break lookups, since the router now computes a different shard for them.
