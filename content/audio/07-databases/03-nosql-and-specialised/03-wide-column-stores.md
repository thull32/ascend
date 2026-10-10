---
lesson: wide-column-stores
source: 43530d950e7d87ac
fit: great
desk:
  - "The readings table definition and the access-pattern and partition-size tables"
  - "The compaction strategy comparison table"
  - "The quorum overlap table for N = 3 and N = 5, and the tail-latency table"
  - "The DynamoDB request-unit table and the single-table design example"
  - "Exercises: guaranteed quorum overlap across datacentres; coordinator read and read repair"
---
## Introduction

You are ingesting 400 thousand sensor readings a second, or a billion user events a day, and every one must be stored and readable by device and time window for the next ninety days. A single Postgres primary will take perhaps twenty thousand of those writes a second before its write-ahead log and B-tree updates saturate the disk. Sharding it yourself means building a routing layer, a rebalancer and a cross-shard query engine.

The Dynamo family, Cassandra, ScyllaDB, and in data model if not internals, DynamoDB, was built for exactly this shape: writes that scale linearly with node count, no single point of failure, and fast reads for one query pattern per table. The trade is everything else. No joins, no ad hoc queries, no multi-row transactions, and a data model where the schema is the query.

Four ideas. The partition is the unit of everything. Deletes are writes, and they can come back from the dead. Consistency is arithmetic you choose per request. And DynamoDB meters the same model with hard per-partition ceilings.

## The partition is the unit of everything

A Cassandra primary key has two parts. The partition key decides which nodes store the row. The clustering columns decide the order of rows inside the partition. Rows with the same partition key live together, sorted, on the same replicas.

So a read that names the whole partition key is cheap: hash the key, go to the owning replicas, read one contiguous sorted slice. It costs the same on ten nodes or a thousand. A query that omits any part of the partition key has to ask every node, and Cassandra refuses to run it unless you add "allow filtering", which is the database telling you that you are about to scan the cluster.

The key hashes to a token on a ring. Each node owns several ranges of that ring, and a partition lives on its token's owner plus the next nodes clockwise, up to the replication factor. A new node takes over some ranges and streams only that data. That is the mechanism behind "linear scalability".

You design tables from queries, not entities. Readings for one device in a time range today: one table, partitioned by device and day, clustered by timestamp, newest first. Latest reading for every device in a building: a second table, partitioned by building. Each reading is written to both. Denormalisation here is the design, not a compromise, because writes are cheap and cross-partition reads are not.

Then size the partitions. At about 30 bytes a row and one reading a second, a day bucket holds 86,400 rows, about 2 and a half megabytes. Comfortable. A month bucket is about 78 megabytes, at the edge of the usual guideline of 100 megabytes and 100 thousand rows. No bucket at all, device only, grows to about 950 megabytes a year, forever, and is broken within weeks. Reads, compaction, repair and streaming all degrade on the replicas that own it. Anything append-only needs a time bucket.

## Writes, reads and compaction

A client sends a write to any node, which becomes the coordinator. It sends the mutation to every replica and waits for as many acknowledgements as the consistency level asks. On each replica, the write is appended to the commit log and merged into a sorted in-memory table. Nothing is read first: a write never looks at the old value. When memory fills, the table is flushed to an immutable file on disk, an SSTable.

One detail worth knowing: by default the commit log is synced to disk every 10 seconds, and replicas acknowledge before that. One node's power loss can lose up to ten seconds of acknowledged writes. A replication factor of three is what covers it.

Every cell carries a write timestamp, and a row's current state may be spread over memory and several files. A read merges them cell by cell, newest timestamp wins. Each file has a bloom filter over its partition keys, so a definite no skips the file without touching disk.

How many files a read touches depends on the compaction strategy, chosen per table. Size-tiered, the default, merges four similar-sized files at a time: cheap writes, several files per read, and up to half the disk kept free for the largest merge. Leveled keeps about one file per level: good reads, heavy rewriting. Time-window compaction only merges within a window, say one day, and never merges old windows. For time series with a TTL, that is the right choice: each day ends up in one file, and the whole file is deleted when it expires. Size-tiered on the same table is a classic disk-full incident, because expired data waits for a huge merge.

## Tombstones and resurrection

Files are immutable, so a delete writes a tombstone: a timestamped marker that hides older data. Expired TTL cells become tombstones too. Compaction only drops a tombstone after the grace period, ten days by default.

Queue-shaped tables are the first casualty. Insert and delete constantly, and a partition becomes mostly tombstones that every read must scan. Cassandra warns at a thousand tombstones in one read and aborts at a hundred thousand. Do not build a queue in Cassandra.

Why ten days of grace? Because of replicas that missed the delete. Three replicas: A, B and C. Day zero, row K is written to all three. Day one, C's disk fails and it goes down. The delete succeeds on A and B. The coordinator keeps a hint for C, but hints only last three hours, and C is down for five days. Day six, C comes back, still holding K, with no tombstone. Day eleven, the grace period passes on A and B, and compaction purges the tombstone and the old data. Day twelve, someone runs repair. What does repair see?

[pause]

A and B have nothing for K. C has a live K. Repair streams it to A and B, and the deleted row is back. Had repair run between day six and day eleven, C would have received the tombstone. Hence the rule: every node must complete repair more often than the grace period. Lowering the grace period to save disk is only safe if repair runs more often than the new value.

Repair itself compares Merkle trees, hashes of ranges built top-down, so two replicas holding a terabyte each can find their differences by exchanging kilobytes. Two lighter mechanisms help between repairs. Read repair: when a quorum read sees replicas disagree, the coordinator writes the newest version back to the stale ones it contacted, before answering. And hinted handoff, replaying missed writes if the node returns within three hours.

## Tunable consistency

Each request states a consistency level: how many replicas must answer. Here is the arithmetic. If a write was acknowledged by W replicas and a read hears from R, out of N, the two sets share at least W plus R minus N replicas. When R plus W is greater than N, at least one replica in the read holds the newest timestamp, and the coordinator returns it.

With three replicas, quorum is two. Two plus two is four, greater than three: an overlap of one, and you survive one node down on each side. Write and read at ONE: one plus one is two, no overlap, and stale reads are possible. With five replicas, quorum is three, and you survive two failures, at the cost of two more copies and waiting for the third-fastest of five.

Now two datacentres, three replicas in each, six in total. Quorum is four, so every request waits for a remote replica, a cross-region round trip of roughly 70 to 80 milliseconds between the US east coast and western Europe. And losing a whole region makes quorum impossible. So multi-region deployments use local quorum, two of the three local replicas. Local latency, and a region can fail without the other noticing.

The price: a local-quorum write in Europe and a local-quorum read in the US, a few milliseconds later. Is the read guaranteed to see the write?

[pause]

No. The guaranteed overlap is zero. The write reaches the other region asynchronously, and unboundedly late during a partition. Writing at each-quorum, a quorum in every region, restores the overlap at the cost of the cross-region wait. The usual design routes each user to a home region, so their reads follow their writes.

And R plus W greater than N is not linearizability. Last write wins uses clock timestamps, so two writers whose clocks differ by 200 milliseconds can have the earlier write win. For a real compare-and-set there are lightweight transactions: a Paxos round, four round trips instead of one, about 4 milliseconds in-region, and only hundreds a second on a contended partition. Use them for rare claims like a unique username, never on the hot path.

The consistency level also sets the tail. A write waits for the W-th fastest of N replicas, so a quorum write is usually faster than one replica's 99th percentile. A read contacts only R replicas and needs all of them, so a quorum read is slower. Writing at ALL hurts twice, in availability and in latency.

## DynamoDB, metered

DynamoDB shares the data model, a partition key, an optional sort key, items up to 400 kilobytes, but not the leaderless internals: each partition is a three-replica group with a leader. You pay per request unit. A strongly consistent read costs one read unit per 4 kilobytes, an eventually consistent read half that. A write costs one write unit per kilobyte, rounded up. Transactions cost double.

Here is the number to remember. Each physical partition serves at most 3,000 read units and 1,000 write units a second. Adaptive capacity moves unused throughput to a hot partition, but nothing lets one partition key exceed that ceiling. A table provisioned at 10 thousand write units will still throttle one key at about a thousand 1-kilobyte writes a second. The fix is write sharding: append a suffix from zero to seven, spread the writes over eight partitions, and read all eight.

Global secondary indexes are separate tables updated asynchronously, so their reads are eventually consistent, and one short of capacity throttles the base table's writes. Single-table design puts every entity in one table with generic key attributes and encodes access patterns in key prefixes: powerful, and nearly unreadable to a newcomer, so keep the access-pattern table next to the code.

## In the interview

Design storage for chat messages, newest first per conversation.

[pause]

Partition by conversation plus a month, or a bucket sized from the message rate. Cluster by sent time descending, then message ID. State the partition-size bound out loud, and the read path for "load older" crossing buckets. The wrong answer is partitioning by conversation alone, which is unbounded for busy group chats.

And: replication factor three with quorum on both sides. Is that linearizable? No. Concurrent writes resolve by clock, a write that times out at quorum may have reached one replica and appear later, and compare-and-set needs a lightweight transaction. What it does give you is that a read after a successful write sees that write.

## Recap

Five things to remember. Start from the access patterns, build one table per query, and size every partition, with a time bucket on anything append-only. Use time-window compaction for TTL'd time series. Deletes are tombstones, so do not build queues, and complete repair more often than the grace period or deleted rows come back. R plus W greater than N gives overlap, not linearizability, and local quorum across regions guarantees nothing. And a DynamoDB partition caps one key at a thousand write units a second: shard the key, do not provision more.

At your desk: the table definitions and partition sizing, the compaction and quorum tables, the DynamoDB unit arithmetic, and the two exercises, quorum overlap across datacentres and the coordinator's read repair.
