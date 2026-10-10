---
review: storage-and-scale
source: 1dff44afc234694b
---
## Introduction

Twelve questions from the storage-and-scale module. Answer out loud before the answer comes.

Three from each lesson, in order: storage engine internals, replication, partitioning and sharding, and connection management. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

Why does Postgres log the whole 8 kilobyte page the first time it is modified after a checkpoint?

A, the buffer pool does not track which bytes of a page changed since the last read. B, a crash can tear a page write, and a small redo record cannot repair a torn page. C, full images compress better than deltas, so the write-ahead log ends up smaller overall. D, replicas can only apply whole pages, never byte-level changes from the primary.

[think]

The answer is B: a crash can tear a page write, and a small redo record cannot repair it.

Devices do not guarantee atomic 8 kilobyte writes. If a crash tears a page, recovery restores the logged image and then replays the later deltas on top. The cost is real: 56 megabytes of log against 2.3 for the same updates without a checkpoint just before them. Replicas apply the same records recovery does, deltas included.

## Question 2

A count of every row reads all 28 thousand pages of a 224 megabyte table. Afterwards, the buffer cache shows only 32 of its pages cached. Why?

A, the clock sweep evicted the pages at once, because each had a usage count of zero. B, the table's values are stored out of line, so only its pointer pages are kept in shared buffers. C, the scan ran in parallel workers, and their buffers are freed when they exit. D, big sequential scans use a 32-buffer ring, to protect the working set.

[think]

The answer is D: big sequential scans use a 32-buffer ring.

A sequential scan of a table larger than a quarter of shared buffers uses a private ring of 256 kilobytes and recycles it, so a one-off scan cannot evict everyone else's hot pages. Index scans do not use the ring. The table had no large values, and parallelism was not involved.

## Question 3

On a write-heavy database, you raise the checkpoint timeout from 5 minutes to 60, and the maximum log size to match. What should you expect?

A, fewer full-page images and smoother I/O, but longer crash recovery. B, a lower buffer hit ratio, because dirty pages crowd out clean ones. C, more write-ahead log, because each page is logged in full more often than before. D, commits become less durable, because pages reach disk less often.

[think]

The answer is A: fewer full-page images and smoother I/O, but longer crash recovery.

Durability comes from the log flush at commit, not from checkpoints. Fewer checkpoints mean fewer first-touch page images and less bursty I/O. But recovery must replay everything since the last checkpoint's redo point, which can now be many gigabytes. The hit ratio is unaffected.

## Question 4

A user updates their display name, is redirected, and sees the old name. A refresh shows the new one. Which fix has the least cost on the write path?

A, route that user's reads by the log position of their write, or to the primary. B, add replicas, so that read load, and therefore lag, is spread out. C, make every transaction's commit wait until the replicas have applied it. D, switch to logical replication, so that row changes apply faster.

[think]

The answer is A: route the user's reads by their write position, or to the primary.

Routing by log position, or pinning briefly to the primary, affects only the user who wrote, and adds nothing to commits. Making every commit wait for replay fixes it, but at a cost on every write. More replicas do not reduce lag, and logical replication applies changes more slowly, not faster.

## Question 5

With its streaming client stopped, an inactive replication slot's retained log grew from under a megabyte to 30 megabytes in 6 seconds. What is the danger, and the guard?

A, replicas stop streaming at once; restart the sender process to release it. B, the log piles up until the disk fills; cap it with the maximum slot keep size. C, the slot is dropped after a timeout; raise the general log keep size to protect it. D, commits slow down as the slot grows; add a second standby to share it.

[think]

The answer is B: the log piles up until the disk fills, so cap it with the maximum slot keep size.

A slot promises to keep the log until its consumer confirms, and an absent consumer never does: at this rate, about 18 gigabytes an hour. Postgres never drops idle slots by itself. The maximum slot keep size invalidates the slot past a limit, turning a disk-full outage into a rebuild of one consumer.

## Question 6

You name a single synchronous standby, replica A, with synchronous commit on. Replica A reboots. What happens to writes on the primary?

A, they fail at once with an error that no standby is available. B, they commit locally and queue in the slot for replica A. C, they hang until replica A returns or the setting is changed. D, they continue asynchronously until replica A reconnects.

[think]

The answer is C: they hang until replica A returns or the setting is changed.

The primary will not acknowledge without the confirmation it was told to wait for, and it does not silently downgrade durability. That is why one synchronous standby reduces write availability, and why production lists several candidates, so that any one of them can confirm.

## Question 7

A 2 terabyte events table is partitioned by month. A query filters on the occurred-at time truncated to the day, equal to the 20th of September. The plan shows every partition scanned. Why?

A, a default partition exists, which switches pruning off for all queries. B, pruning works only for equality on integer keys, never on timestamps. C, the filter is on an expression of the key, not on the key itself. D, pruning needs an index on occurred-at in every partition to find the bounds.

[think]

The answer is C: the filter is on an expression of the key, not on the key itself.

Pruning compares the predicate with partition bounds, and the planner does not invert an expression to recover the key. In the lab, the version that cast to a date scanned all 24 partitions in 140 milliseconds. Rewrite it as a half-open range on occurred-at, and one partition remains. Indexes and default partitions do not affect pruning.

## Question 8

You remove a month of data by detaching the partition and dropping it, instead of deleting the rows. Why does this matter most on a large, replicated table?

A, delete cannot remove rows from a partitioned table without a full scan. B, drop returns disk space only after the next vacuum full has completed. C, drop runs faster because it skips the foreign-key checks that delete runs. D, drop writes a few catalogue records instead of one log record per row.

[think]

The answer is D: drop writes a few catalogue records instead of one log record per row.

Deleting about 100 thousand rows wrote about 100 thousand log records and 14 megabytes of log that every replica replays, and the table did not even shrink. The drop wrote 91 records and under 15 kilobytes. At 100 gigabytes a month, that is the difference between hours of log and an unlink. Drop returns space at once; delete only makes it reusable.

## Question 9

A router sends each key to its hash modulo 4. A fifth shard is added. Roughly what fraction of keys must move, and what avoids it?

A, none; keys keep their shard and only new keys go to the new shard. B, about 80 percent; consistent hashing or a directory moves about a fifth. C, about 25 percent; each old shard hands a quarter of its keys to the new one. D, about 20 percent; only the keys that belong on the new shard have to move.

[think]

The answer is B: about 80 percent move, and consistent hashing or a directory moves about a fifth.

A key stays put only if its hash modulo 4 equals its hash modulo 5, which holds for one hash in five, so 80 percent move. Consistent hashing moves about a fifth of the keys, and a directory moves exactly the tenants you choose. Leaving old keys in place would break lookups, since the router now computes a different shard for them.

## Question 10

An API has 12 instances, each with a connection pool of at most 25, against a Postgres limit of 200 connections. Average pool usage is 3 per instance. Why might this still fail?

A, it cannot; average usage is 36 connections, far below the limit of 200. B, under load every pool can fill to 25, and 12 times 25 is 300, which exceeds 200. C, idle connections time out and reconnect so often that slots run out. D, Postgres refuses any client pool configured above 20 connections.

[think]

The answer is B: under load every pool can fill to 25, and 300 exceeds 200.

The budget must hold at the maximum, not the average. Load spikes and slow queries push every pool to its cap at the same moment, and a rolling deploy adds more pools on top, so at peak new connections are refused. Shrink the pools to fit the budget, or put a server-side pooler in front.

## Question 11

Why is raising the connection limit from 200 to 2,000 usually the wrong fix for "too many clients" errors?

A, extra backends use memory and add contention, not throughput, so the database gets slow. B, Postgres caps the limit at 1,000, so the new value is silently ignored. C, the superuser reservation grows with the limit, so few slots are gained. D, changing it needs a restart, which is never acceptable for a busy production database.

[think]

The answer is A: extra backends add memory and contention, not throughput.

Connections are not free capacity. Each is a process with its own memory, and active connections beyond a small multiple of the core count compete for the same CPUs and locks. The failure turns from refused connections into a slow database. Queueing in a pool or a pooler, with timeouts, keeps the number of active queries near what the hardware can execute.

## Question 12

An HTTP handler has a 2-second deadline. The pool's acquire timeout is 10 seconds, and there is no statement timeout. What happens during a slow-query incident?

A, requests fail after 2 seconds, which frees their connections so the database recovers. B, the pool cancels any query that outlives its 10-second acquire timeout. C, nothing unusual; each timeout guards a different layer, so they never interact. D, waits and slow queries continue after callers give up, keeping the database loaded.

[think]

The answer is D: waits and slow queries continue after the callers give up.

Outer timeouts shorter than inner ones create work nobody wants. Requests keep waiting up to 10 seconds for a connection after their callers have gone, and slow queries run to completion with no one to read the results. The acquire timeout bounds waiting for a connection, not query runtime. It should sit well inside the request deadline, and a statement timeout should cancel queries whose callers cannot use the result.

## Recap

Three ideas kept coming back. The write-ahead log is the real unit of cost: page images after checkpoints, retained log behind an idle slot, and the per-row records a delete sends to every replica. Capacity must be judged at the peak and at the tail, not the average: pools filling at once, keys moving when shards change, and timeouts that must nest inside each other. And the cheapest fix is usually the targeted one: route only the user who wrote, drop a partition instead of deleting rows, and queue connections instead of adding more.
