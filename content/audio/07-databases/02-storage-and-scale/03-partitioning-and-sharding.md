---
lesson: partitioning-and-sharding
source: c8f6bdc481572a79
fit: great
desk:
  - "The pruning measurements and the run-time pruning plan output"
  - "The planner cost table for 10, 100 and 1,000 partitions"
  - "The hash, range and directory comparison table"
  - "The resharding plan, step by step"
  - "Exercise: merge per-shard results for a cross-shard top-k query"
---
## Introduction

The events table has 4 billion rows and 1.2 terabytes on disk. Deleting last year's data takes nine hours and generates enough log to put every replica behind. The primary is at 85 percent CPU during the afternoon peak, and adding another read replica does nothing, because the bottleneck is writes.

You have hit the two limits of one table on one machine, and they have two different fixes that are often confused.

Partitioning splits one table into pieces inside one database. The planner still sees one table; the point is to let it skip pieces, and to let maintenance work on pieces. Sharding splits a dataset across databases. No planner sees the whole thing. Your application or a proxy becomes the planner, and the point is to multiply write capacity and storage. Partitioning is a Tuesday-afternoon change. Sharding is a multi-quarter programme that changes how every query is written.

## Partitioning, and what pruning really buys

A partitioned table in Postgres is a parent with no storage, and child tables, each holding a slice of the partition key. Range partitioning suits time and ordered ids. List suits a small set of values, like regions. Hash spreads rows evenly when there is no natural range. Only range partitioning gives cheap time-based retention, and that is why most partitioned tables exist.

First surprise: uniqueness is enforced per partition, so any unique index must include the partition key. Try to make the id alone unique on a table partitioned by time, and Postgres refuses.

Now the measurements: 2.4 million events in 24 monthly partitions, against an identical flat table, both with an index on the timestamp. A one-week query on the partitioned table scanned only the one matching partition: 320 buffers, 2.31 milliseconds. The flat table used its index: 320 buffers, 2.26 milliseconds.

That is the honest headline. For a query a good index already serves, pruning buys nothing measurable. Both plans read the same pages. Pruning is a coarse, free index on the partition key. It wins when the alternative is a scan, so a query that must read a whole month reads one partition instead of the table, or when the small per-partition indexes stay cached while one giant index would not.

The classic mistake is filtering on an expression of the key. Casting the timestamp to a date, or truncating it to the day, is not the key, and the planner does not invert it. In the lab that scanned all 24 partitions, 26 thousand buffers, 140 milliseconds. Rewrite it as a half-open range on the column itself.

Pruning can happen at three moments. At plan time, when the values are constants: the skipped partitions never appear in the plan. At executor start-up, for parameters of a prepared statement or a function like now, which is fixed for the statement but not known when the plan was cached. And per scan, inside a nested loop joined on the key. The rule to carry: anything the planner sees as a constant, a parameter or a stable expression of the key column itself prunes. Expressions of the key, and volatile functions, do not.

## The real win: retention

Here is where partitioning earns its keep. Deleting one month from the flat table, about 100 thousand rows, wrote about 100 thousand log records, 14 megabytes of log, and the table did not shrink even after vacuum; the space became reusable, not returned. Detaching and dropping the matching partition wrote 91 log records, 14.6 kilobytes, and the file was simply unlinked.

At lab scale the delete was fast. What scales is the log. One month of a 1.2 terabyte table is about 100 gigabytes. Deleting it writes a record per row plus page images, every replica replays it, vacuum then scans it, and the file never shrinks. Dropping the partition writes a few catalogue records regardless of size. That is the nine-hour delete reduced to a lock and an unlink. Detach concurrently to avoid locking the parent.

Maintenance improves the same way. Vacuum and reindexing run per partition, old partitions are frozen once and stay that way, and a partition can be moved to cheaper storage or dropped without touching the rest.

But partitions are not free. Each is a real table with real indexes. Pruned queries stay cheap at any count. Unpruned ones pay per partition: at a thousand partitions, planning took 9 milliseconds in a warm session, and the first query in a fresh session took 130 milliseconds, to load a catalogue entry for every partition. Backend memory grew from 1.3 megabytes to 12. With short-lived connections and no pooler, you pay that on every connection. Hundreds of partitions are fine. Many thousands need every hot query to prune, and a pooler in front.

## Choosing a shard key

Sharding puts disjoint subsets of rows on different servers, each a complete Postgres with its own primary and replicas, and a router decides which shard serves a query. Everything follows from the shard key. A query that includes it goes to one shard and is as fast as before. A query without it must go to all of them. You choose the key once, and changing it means moving every row.

A good key has three properties that pull against each other. Query locality: most queries must include it. In multi-tenant software, tenant id is natural, because nearly every query is "for this tenant". Stability: a row's key must never change. Shard by email, and a user changing theirs moves every row. And even distribution of load, not just rows.

That last one is where the arithmetic matters. Tenant sizes are heavy-tailed. Model 10 thousand tenants whose load follows a Zipf distribution. The largest tenant carries about 10 percent of all load; the top ten together, 30 percent.

Now hash them across 16 shards. Each shard's fair share is about 6 percent. Before I tell you: how much does the shard holding the largest tenant carry?

[pause]

About 16 percent: that tenant's 10, plus its fair share of everyone else. That is two and a half times the average. If a shard saturates at 10 thousand writes a second, the fleet saturates when that one shard does: at about 63 thousand total, instead of 160 thousand.

No hash function fixes that. The tenant still lands on exactly one shard. The remedies: a directory that places the big tenant on a dedicated shard, or splitting that tenant by a secondary key, say a hash of the user into eight buckets, which turns its 10 percent into eight pieces of about 1.3, at the cost of an eight-way fan-out for its cross-user queries.

## Hash, range and directory

Hash sharding spreads keys evenly, sequential ones included, and sends a point lookup to one shard. But a range of keys is scattered across every shard. Range sharding keeps contiguous keys together, so range scans hit one or a few shards, but sequential keys like timestamps send every new write to the last shard.

Adding a shard is where naive hashing hurts. With hash mod N, a key stays put only if its hash gives the same remainder for both shard counts, which is true for about one key in N plus one. Going from 4 shards to 5, 80 percent of keys move. From 16 to 17, 94 percent. Consistent hashing moves about one in N plus one: 20 percent and 6 percent.

Many teams choose a third option: a directory, a small replicated table mapping each tenant to a shard, cached in the router. Placement becomes explicit, a hot tenant can be moved by hand, and a reshard moves exactly the tenants you choose.

## Cross-shard queries and resharding

Any query without the shard key is a scatter-gather: send it to every shard and merge. Its latency is the slowest shard's latency. If each shard answers within 10 milliseconds 99 percent of the time, a query that waits for all 16 sees at least one slow answer about 15 percent of the time. With 64 shards, 47 percent. And a "newest 20" query across 16 shards fetches 20 from each, 320 rows, to keep 20.

Three things get expensive across shards. Joins between tables sharded on different keys: co-locate them, say orders and order lines both by customer, or join in the application. Uniqueness on a non-key column, like email: that needs a separate table sharded by email, mapping to the user, written in the same logical operation. And transactions: each shard commits on its own, so atomicity across them needs two-phase commit or a saga. Design the key so the transactions you care about stay on one shard.

And you will reshard. Take 2 terabytes moving from 8 shards to 16, with the copy throttled to 50 megabytes a second so replicas keep up. The mechanism is always the same: copy history, stream the tail, verify, swap. Start tailing the log, or double-writing, before the copy. The backfill alone is 40 thousand seconds, about 11 hours. Then verify, with checksums per chunk. Then move reads over a tenant or a percent at a time, over days, then writes, and keep the old copy for a rollback window.

The verify step is the one teams skip, and it is where you find the writes the double-write missed. Teams that skip it learn months later that 0.02 percent of rows exist only on the old shards.

Before any of this, a senior engineer lists what comes first. Scale up: one modern primary handles tens of thousands of durable commits a second and several terabytes, and the big machine is cheaper than the sharding programme. Partition, so retention stops being the problem. Remove write load, like unneeded indexes. Cache reads. And split by service before splitting by key.

## In the interview

A follow-up the lesson expects. "We partitioned the table and the query did not get faster. Why?"

[pause]

Because an index already bounded the query, so pruning reads the same pages: 320 buffers either way in the lab. Partitioning's wins are retention by dropping a partition, per-partition maintenance, and scans that become partition-sized. The wrong answer is "partitioning always speeds up queries".

And: your largest tenant is 10 percent of traffic across 16 shards. What happens? Its shard carries about two and a half times the average and caps the fleet's throughput. Isolate it on its own shard through a directory, or split it by a secondary key. Do not say "add more shards". The tenant still lives on one.

## Recap

Five things to remember. Partitioning is one database where the planner prunes; sharding is many databases where you are the planner. Pruning adds little over a good index; the real win is retention, a few catalogue records instead of a log record per row. Thousands of partitions cost planning time and memory on every fresh connection. Hashing spreads tenants, not load, so do the hot-tenant arithmetic and put a directory in front. And hash mod N moves most keys, fan-out inherits the slowest shard, and resharding is copy, tail, verify, cut over, with the verify step never skipped.

At your desk: the pruning measurements and plan output, the partition-count cost table, the sharding strategy comparison, the resharding plan, and the scatter-gather top-k exercise.
