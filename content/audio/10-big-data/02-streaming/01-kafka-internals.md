---
lesson: kafka-internals
source: 4f9a88b32f51adaa
fit: great
desk:
  - "The segment files table and the three-move offset lookup"
  - "The acks equals all produce trace and the leader-epoch failover trace, step by step"
  - "The producer, consumer and transactional loop code, with their settings"
  - "The production failure-modes table"
  - "Exercise: implement the range and round-robin partition assignors"
---
## Introduction

A payments team does a routine rolling restart of its Kafka brokers. Afterwards, reconciliation finds 214 authorisation events that the producing service logged as successfully sent, and that no consumer ever saw. Nobody changed any code. The producer was set to acks equals 1. A broker acknowledged the writes, restarted before its followers had copied them, and a follower that never had them became the new leader.

A week later, a different team double-charges customers during a consumer-group rebalance, again with no code change. They committed offsets after calling the payment provider, and a rebalance replayed a batch.

Kafka is the spine of most streaming platforms; Netflix's Keystone pipeline runs trillions of events a day through it. At that scale and at much smaller ones, correctness is decided less by your code than by a dozen settings and the mechanisms behind them. Four ideas, then: why the log on disk is fast, how replication decides what is safe, how consumer groups decide what gets replayed, and what exactly-once really covers.

## The log on disk

A topic is split into partitions. Each partition is a directory on one broker's disk, holding an append-only log cut into segments. Each segment is a log file of record batches, plus two sparse indexes: one from offset to byte position, one from timestamp to offset, with an entry roughly every 4 kilobytes of data. To find an offset, the broker picks the right segment, binary-searches its index, and scans forward at most about 4 kilobytes, however big the partition is.

Three properties make this fast on ordinary hardware. First, sequential input and output and the page cache. Appends go to the tail and consumers mostly read the tail. The broker writes into the kernel's page cache and does not force each record to disk; durability comes from replication, which is why replicas must fail independently.

Second, batches end to end. The producer builds a batch per partition, compresses it once, and the broker stores and serves those exact bytes. It never decompresses on the hot path.

Third, zero-copy. Because batches are served verbatim, the kernel moves bytes from the page cache to the socket with no copy through the application. Turn on TLS and that benefit disappears, because encryption happens in user space, and broker CPU per gigabyte served goes up.

Notice what the broker does not do. It does not track what a consumer has read or delete on read. Consumers own their position, so independent groups read the same topic at different speeds, and a new consumer can replay seven days of history.

## Partitions and the arithmetic

With a key, the producer hashes the key modulo the partition count, so one key's records land in one partition, in order. Without a key, the sticky partitioner fills a batch for one partition and moves on: good batching, no ordering.

Four consequences. Ordering is per partition only, so "account opened" and "account closed" need the same key. The partition count is sticky: adding partitions changes the hash result for most keys, so a key's new events land somewhere new and per-key ordering breaks across the change. Client libraries disagree: clients built on librdkafka, which covers Python, Go and dot net, default to a different hash than Java, so a Python and a Java producer can send the same key to different partitions unless you set the murmur2 partitioner. And hot keys make hot partitions. Hashing spreads keys, not load.

Sizing starts from the consumer. Peak ingest is 300 megabytes a second, and one consumer handles about 10 megabytes a second per partition. You need at least 30 partitions, because consumer parallelism is capped at the partition count. Plan for three times growth and for draining a backlog, since an hour of outage at that rate is about a terabyte to catch up, and you land at 96.

On the broker side, think in orders of magnitude: roughly 50 to 300 megabytes a second of producer traffic per broker at replication factor 3. The big multiplier is the network. Every ingested byte goes out again to each follower and to every consumer group, so a leader with two followers and two consumer groups sends about four bytes out for each byte in. And partitions cost the broker open files, mapped indexes and a leader election each when a broker dies. A few thousand per broker has long been the practical guideline.

## Replication and the high watermark

Each partition typically has three replicas: a leader that handles all produces and, by default, all fetches, and followers. Followers are not pushed to. Each runs an ordinary fetch loop against the leader, and the offset a follower asks for tells the leader how far it has got.

The in-sync replica set, the ISR, is the leader plus every follower that has caught up within 30 seconds. The high watermark is the smallest log end across the ISR: everything below it is on every in-sync replica. Consumers only read below the high watermark, so they never see a record a failover could erase.

Now the settings. Acks equals 0 does not wait. Acks equals 1 waits for the leader to append, to page cache, not disk. Acks equals all waits until every current ISR member has the record. Here is the trap: acks equals all alone is weaker than it sounds. If both followers fall out of the ISR, "all in-sync replicas" is one machine. Setting min in-sync replicas to 2 closes that hole.

So the standard triple is replication factor 3, min in-sync replicas 2, and acks equals all. It survives one broker down with no loss, and with two down it refuses writes rather than lose data. Reads continue up to the high watermark either way. Spread the three replicas across availability zones, and leave unclean leader election off, so a replica outside the ISR can never become leader.

Here is a detail that surprises people. In the lesson's trace, the leader has appended two records and both followers have fetched and appended them. Is the producer acknowledged yet?

[pause]

No. The leader only learns a follower's progress from that follower's next fetch request. So the acknowledgement costs one extra fetch round trip after the data has landed. Only when both followers fetch again from the new offset does the high watermark move and the producer get its answer.

## Failover and leader epochs

Every leader change increments the partition's leader epoch, and every batch is stamped with the epoch it was written under. Before epochs, a recovering replica truncated to its own high watermark, which lags the leader's, and two quick failovers could lose committed records or leave logs that disagreed. Epochs replace that guess with a question to the new leader: where did my epoch end?

The trace, in short. The leader writes batch A at offset 100 and batch B at 101 under epoch 3. One follower copies only A. The leader crashes before acknowledging anything, and that follower is elected under epoch 4. The producer, which is idempotent, retries A; the new leader already holds A's sequence number, so it answers with the original offset instead of appending again. Then B is retried and written at 101 under epoch 4. When the old leader comes back, it asks where epoch 3 ended, hears 101, and truncates its own stale B before fetching the new one.

No acknowledged record was lost or duplicated. Now change one setting. With acks equals 1, the old leader acknowledged A and B straight away, the producer moved on, and that final truncation deleted B, an acknowledged write. Consumers never saw it because the high watermark never passed it. That is exactly the 214 missing payments, and why the loss stayed silent until reconciliation.

Idempotence works through a producer id plus a sequence number per partition. The broker keeps the last five batches per producer and partition in memory, so a duplicate retry is answered from that cache, never by hashing contents. Five cached batches is why at most five requests may be in flight while keeping order. And the guarantee is per producer session: a restarted producer gets a new id, so its own application-level resend is a new record.

## Consumer groups and rebalances

Consumers sharing a group id split a topic's partitions, one member per partition, so within a group Kafka is a queue, while separate groups each receive everything. Committed offsets are records in an internal, compacted offsets topic.

Where you commit decides the guarantee. Before processing is at-most-once. After processing is at-least-once, the normal choice, and it requires idempotent handling. That second team committed after the payment call, the normal choice, and a rebalance replayed the batch. Only idempotent handling makes that replay safe.

A rebalance starts when a member joins, leaves, misses heartbeats for 45 seconds, or fails to call poll within 5 minutes. That last one causes rebalance storms: a batch takes 7 minutes, the member is evicted, it rejoins, and triggers another rebalance. The heartbeat runs on a background thread, so the session timeout is not the culprit; the poll interval is.

The protocol decides the cost. The original eager protocol makes every member give up every partition, so one member joining a group of 50 stops all 50. Cooperative sticky revokes only the partitions that move. The newest protocol, generally available in Kafka 4, computes assignments on the broker and delivers them in heartbeats. Static membership is separate: a member that restarts within the session timeout keeps its partitions, so a rolling deploy of 50 consumers goes from 50 group-wide pauses to none.

The health metric is lag, and alert on lag in time, not records. A hundred thousand records is nothing on one topic and an hour on another.

## Retention, compaction and exactly-once

Kafka keeps data by policy, not by consumption. With delete retention, whole closed segments older than seven days are removed. The active segment is never deleted, and on a quiet partition it only rolls after seven days, so a record can outlive retention by up to that long, which matters for privacy commitments. Disk arithmetic: 300 megabytes a second for seven days at replication factor 3 is about 544 terabytes, or about a third of that if compression gets three to one.

With compaction, the log cleaner keeps only the latest record per key. A record with no value is a tombstone; it survives 24 hours so a lagging consumer sees the delete. The cleaner only works on closed segments, once enough of the log is dirty. So a quiet compacted topic whose active segment never rolls grows without bound, and a new consumer takes hours to bootstrap. Lower the segment roll time for that topic.

Exactly-once in Kafka is a specific guarantee: in a read, process, write loop from Kafka to Kafka, the output records and the consumed offsets commit atomically. Three pieces build it. Idempotent producers. Transactions with a stable transactional id, which fence any older instance with the same id. And consumers set to read committed, which only read up to the last stable offset: the first offset of the oldest still-open transaction on that partition.

That last stable offset is the cost centre. One producer that opens a transaction and stalls holds back every read-committed consumer of those partitions, including records other producers committed, until the transaction times out at 60 seconds. And exactly-once covers nothing outside Kafka. If the loop calls a payment API or writes to Postgres, an aborted and retried transaction repeats the side effect. External sinks need idempotent writes keyed by an event id.

On metadata: KRaft, a Raft quorum of controllers whose standbys already hold the full state, replaced ZooKeeper, and Kafka 4, in 2025, removed ZooKeeper entirely.

## In the interview

The lesson's sharpest follow-up. Replication factor 3, acks equals all, min in-sync replicas 2. Can you still lose an acknowledged write?

[pause]

Yes, in two ways. Two ISR members can be lost at once, which is why replicas go in different zones and the survivor must not be allowed to lead uncleanly. And if the delivery timeout expires after the broker appended but before the acknowledgement arrived, the application sees a failure for a record that exists. Retried from the application, it gets a new sequence number, so the record is duplicated rather than lost. The wrong answer is "no, the quorum guarantees it", which forgets correlated failures and application retries.

And a sizing one: a group must process 600 megabytes a second and each consumer does 10. At least 60 partitions, then headroom, say 180, checked against per-broker counts. The wrong answer is "60, we can add more later", because adding partitions breaks per-key ordering.

## Recap

Four things to remember. Durability is a triple: replication factor 3, min in-sync replicas 2, acks equals all, plus idempotence, unclean election off, and zones. Consumers read only below the high watermark, and leader epochs decide what a returning replica truncates. Consumer processing is at-least-once, so make handlers idempotent, and fix rebalance storms with the poll interval, cooperative rebalancing and static membership. And exactly-once is Kafka to Kafka only, and one stalled transaction stalls every committed reader.

At your desk: the segment layout, the produce and failover traces, the client code, the failure-modes table, and the partition-assignor exercise.
