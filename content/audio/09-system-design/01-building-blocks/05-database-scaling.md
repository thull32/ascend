---
lesson: database-scaling
source: 73af6ff8c96750ce
fit: great
desk:
  - "The read-your-writes and failover traces, and the synchronous commit levels"
  - "The shard-key and hot-key tables"
  - "The uniqueness sign-up trace and the shard-aware ID code"
  - "The worked capacity plan, line by line"
---
## Introduction

The stateless tier scaled to forty replicas in an afternoon. The database did not. One primary at 80 percent CPU. A read replica four seconds behind at peak. 800 connections requested against a limit of 500. And a product request for "all orders for this merchant" that touches every row.

Every large system reaches this point, and the interesting decisions live here, because the database is where the state is, and state cannot be scaled by copying a process.

So this is the sequence of moves that scales a database, in order, with the measurement that justifies each and the way each one fails. It ends at sharding, the last resort and the one that changes every query you will ever write.

## The order of operations

Seven steps, in order. Fix queries and indexes, which can be ten to a thousand times on a specific query; always first. Pool connections, once they pass a few hundred. Cache reads. Scale the primary vertically, for two to eight times. Add read replicas, for reads that tolerate lag. Partition big tables on one node. And only then, shard.

Put numbers on "one node". On a 32-thread workstation, Postgres served 53,000 primary-key lookups a second, and committed 16,000 single-row transactions a second with 64 connections sharing each disk flush. With a cache in front, one well-provisioned primary covers tens of millions of daily users. What pushes you past it is usually the write rate, or a dataset whose restore time is unacceptable. Not the read rate; replicas solve that.

## Connection pooling

Postgres forks a process per connection, and it scales with cores, not connections. Measured: 32 connections did 53,000 lookups a second at 0.6 milliseconds. 90 connections did 69,000, at 1.3 milliseconds. Throughput up 30 percent, latency doubled. Past about one active connection per core, extra connections add queueing, not work.

So size pools from Little's law, not from defaults. A fleet doing 2,000 transactions a second at 5 milliseconds each has only 10 transactions in flight. Forty replicas with a default pool of 10 each bring 400.

A pooler like PgBouncer multiplexes many client connections onto a few server connections. Transaction mode is the usual choice: a server connection is held for one transaction, so 600 client connections from 60 pods become a server pool of 20 to 50. What breaks in that mode is session state: session settings, advisory locks, listen and notify, temporary tables. And set a pool-acquire timeout, so a slow database fails requests quickly instead of stacking threads.

## Replicas and what lag does to users

A replica receives the primary's write-ahead log as a stream and replays it. Bandwidth is rarely the problem: 2,000 single-row writes a second ship under a megabyte a second. Replay is the problem. Healthy same-region lag is milliseconds; under a bulk load or a long transaction it is seconds to minutes.

Picture a user renaming themselves from Adelaide to Ada. The write commits on the primary. The page reloads from a replica 40 milliseconds behind, and shows Adelaide. The edit vanished.

The fix is a token. After the commit, the API returns the primary's WAL position to the client. Before serving that client's read, the replica checks whether it has replayed past that position. If not, wait up to 20 milliseconds, then forward the read to the primary. Only the reads that need freshness wait. The blunter alternatives: send a user's reads to the primary for a few seconds after they write, or return the new state from the write so the client never re-reads.

Lag has a worse consequence. With asynchronous replication the primary acknowledges before the replica has the log. Order 9001 commits, and the client is told "confirmed". A tenth of a second later the primary's host fails. Thirty seconds later the replica is promoted.

[pause]

Order 9001 does not exist. The customer has an email saying it does.

The synchronous commit setting chooses what a commit waits for, and you can set it per transaction. Off waits for nothing, and a primary crash may lose the last 0.6 seconds or so. Local waits for the local flush. On, with a synchronous standby, waits for the standby to flush, and survives failover. Each step up adds a cross-zone round trip, about a millisecond, to every commit. Orders deserve a synchronous standby. View counters can take off.

## Sharding and the shard key

Before rows move to other machines, partition big tables on the same machine, one partition per month, say. Queries with a time predicate scan only matching partitions, and retention becomes dropping a table, a metadata operation, instead of a delete that rewrites and bloats a multi-terabyte table. It adds no write capacity. It buys operability, and gives sharding a natural unit later.

Sharding splits rows across nodes by a shard key, and each shard is itself a replicated primary, so four shards are at least eight nodes. A good key passes three tests. Every hot query includes it. It distributes writes, with no dominant values. And it co-locates the rows that are joined or transacted together.

Take orders, with 50 million users, 200,000 merchants and 2,000 orders a second at peak. Shard by user ID, and "my orders" is one shard and writes are uniform. Shard by merchant ID, and the merchant dashboard is one shard, but write distribution follows the merchants. Shard by creation time, and every write lands on the newest shard.

Before I give you the number: the largest merchant is 5 percent of orders, and a flash sale multiplies its orders ten times. With merchant sharding over 32 shards, what happens to the busiest shard?

[pause]

It takes 1,057 of 2,906 orders a second. Over a third of all orders, 11.6 times the average shard. Hashing spreads merchants, not one merchant's orders. Salting that merchant across 16 shards cut it to 2.65 times, at the price of a 16-way read for its dashboard. And on a normal day the hot shard is not one tenant but several large ones that hashed together, so salting only the largest barely helps; salting the top 10 does. Keyed by user ID instead, the busiest shard ran 4 percent above average.

So the design is user ID, plus an explicit second path for merchants. No key serves every access pattern, and saying so is the senior move.

## Everything the shard key does not cover

The dashboard asks for orders by merchant, across shards keyed by user. Three options. Scatter-gather: ask all 32 shards and merge. If each shard stalls 1 percent of the time, the query stalls 27 percent of the time, and 32 shards each doing 5,000 queries a second serve only 5,000 scatter-gather queries, not 160,000. Fine for a dashboard at 50 queries a second; fatal on a hot path. A global index, partitioned by merchant, which turns every write into either a distributed transaction or an asynchronous update that lags. Or a derived copy, a merchant orders table fed by change data capture: one partition read, lagging by tens to hundreds of milliseconds.

Uniqueness has the same problem. Users are sharded by user ID, and email must be unique; a unique index on each shard enforces nothing across shards. So uniqueness gets its own table, sharded by email, whose primary key is the lock. Reserve the address with an insert that fails on conflict, create the user on its own shard, then mark the reservation active, with a sweeper that finishes or deletes reservations left behind by a crash.

And IDs can carry their shard. Following Instagram's scheme, a 64-bit ID holds 41 bits of milliseconds, 13 bits of logical partition, and 10 bits of sequence. A support agent pastes an order ID, and the router reads the partition straight out of it.

Resharding is where logical partitions pay off. With hash mod 8, going to 16 shards rehashes every key and moves half of every shard's rows. With 1,024 fixed logical partitions, you move whole partitions and no key changes its partition. To move data live, record the change-stream position first, then snapshot, then replay until lag is under 100 milliseconds, verify, and flip the router per range. Prefer stream replay to dual writes, which can diverge with no record of it.

## A capacity plan, in brief

An order service: 60 million orders a day, 2,000 a second at peak, five rows per order, 90 days online. Does the write rate need sharding? No: 2,000 transactions a second against a measured 16,000 commits a second on one node. Storage comes to 8.6 terabytes online. Restoring that at about 500 megabytes a second takes about 5 hours, so it does need sharding, for operability. Target about a terabyte per shard: 8 shards, each with a primary, a synchronous standby and a read replica. 24 Postgres nodes.

## In the interview

A follow-up the lesson expects. Orders are sharded by user ID. How does the merchant dashboard get its last 100 orders? Not scatter-gather on a hot path: 32 queries, a merge, and a 27 percent chance of hitting a stall. A merchant orders table fed by change data capture answers with one partition read, lagging by tens to hundreds of milliseconds, which a dashboard tolerates. The one read that must be fresh, the order the merchant was just notified about, goes to its home shard by order ID. The wrong answer: "add an index on merchant ID", which is a local index on every shard.

And: what is your replica lag alert threshold? Healthy same-region lag is milliseconds. Alert at one second, because users notice read-your-writes failures around there and lag past a second usually keeps growing, and alert on its rate of change to catch a bulk job starting. Above ten seconds, an asynchronous failover would lose ten seconds of commits. The wrong answer: "lag doesn't matter, it's eventually consistent".

## Recap

Four things to remember. Walk the ordered list before sharding: queries, pooling, caching, a bigger primary, replicas, partitions, and only then shards. Size connection pools with Little's law; past one connection per core, Postgres trades latency for nothing. Treat lag as a measured quantity, implement read-your-writes with a WAL position token, and choose synchronous commit per kind of data. And choose the shard key against hot queries, write skew and co-location, then build every other access path explicitly.

At your desk: the replication traces and commit levels, the shard-key and hot-key tables, the uniqueness trace and ID code, and the capacity plan.
