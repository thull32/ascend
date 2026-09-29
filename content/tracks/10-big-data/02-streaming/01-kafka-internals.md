---
slug: kafka-internals
title: "Kafka internals: partitions, replication, consumer groups and exactly-once"
description: How Kafka's partitioned, replicated log works on disk and over the wire; a produce, a broker failure and a transaction traced offset by offset; which settings (acks, min.insync.replicas, leader epochs, retention, rebalance protocol, transactions) decide whether you lose or duplicate data; and the arithmetic for partitions, disks and throughput.
minutes: 40
difficulty: hard
tags: [big-data, streaming, kafka, replication, consumer-groups, delivery-guarantees, exactly-once, partitioning]
---
A payments team runs a routine rolling restart of its Kafka brokers. Afterwards, reconciliation finds 214 authorisation events that the producing service logged as successfully sent but that no consumer ever saw. Nobody changed any code. The producer was configured with `acks=1`, a broker acknowledged the writes and then restarted before its followers had copied them, and a follower that never had them became the new leader. A week later a different team double-charges customers during a consumer-group rebalance, again with no code change: they committed offsets after calling the payment provider, and a rebalance replayed a batch.

Kafka is the spine of most streaming platforms. Netflix's Keystone pipeline moves events from Netflix's services through Kafka into stream processors and sinks such as S3 and Elasticsearch, at a scale described publicly as trillions of events a day. At that scale, and at much smaller ones, correctness is decided less by application code than by a dozen settings and the mechanisms behind them. This lesson builds those mechanisms from the bytes on disk up, and traces a produce, a broker failure and a transaction offset by offset.

## Under the hood: the log on disk

A **topic** is split into **partitions**. Each partition is a directory on one broker's disk, `playback-events-7/`, holding an append-only log cut into **segments**. A segment is three files named by the offset of its first record, zero-padded to 20 digits:

| File | Contents | Entry size | Sizing |
|---|---|---|---|
| `00000000000001000000.log` | Record batches, stored in the compressed form the producer sent | Variable | Rolls at `log.segment.bytes` (1 GiB default) or `segment.ms` (7 days) |
| `00000000000001000000.index` | Sparse map: relative offset to byte position in the `.log` | 8 bytes (4 + 4) | One entry per `log.index.interval.bytes` (4,096) of appended data |
| `00000000000001000000.timeindex` | Sparse map: timestamp to relative offset | 12 bytes (8 + 4) | Same interval; used by `offsetsForTimes` and time-based retention |

A full 1 GiB segment has about 1 GiB / 4 KiB = 262,144 index entries, so its offset index is about 2 MiB and its time index about 3 MiB. Both are memory-mapped, which is why "too many partitions" first shows up as mapped-file and file-descriptor pressure.

A fetch for offset 1,234,567 resolves in three moves. The broker finds the segment with the largest base offset at or below the target, here `…1000000`. It binary-searches that segment's `.index` for the largest entry at or below relative offset 234,567, say (234,560 → byte 93,824,000). It then reads the `.log` from that byte, scanning forward at most about 4 KiB to reach 234,567, whatever the partition's size.

Three properties of this layout make Kafka fast on ordinary hardware:

1. **Sequential I/O and the page cache.** Appends go to the tail; consumers mostly read the tail. The broker writes into the kernel's page cache and does not `fsync` per record (`log.flush.interval.messages` is unbounded by default); durability comes from replication, which is why replicas must fail independently, and recent reads are served from memory without Kafka keeping its own cache.
2. **Batches end to end.** The producer builds a per-partition batch (`batch.size`, `linger.ms`), compresses it once, and the broker stores and serves that exact byte range. The broker never decompresses or re-encodes on the hot path.
3. **Zero-copy.** Because batches are served verbatim, the broker uses `FileChannel.transferTo`, which is `sendfile` on Linux: bytes move from page cache to socket buffer inside the kernel with no user-space copy. With TLS the benefit disappears, because encryption happens in user space, and broker CPU per gigabyte served rises measurably.

The broker does not track what a consumer has read, delete on read, or route individual records; consumers own their position, so independent groups read the same topic at different speeds and a new consumer can replay seven days of history.

## Partitioning and the partition-count arithmetic

The producer picks a partition per record. With a key, the Java client uses `murmur2(key) mod partitions`, so one key's records land in one partition, in order. Without a key, the sticky partitioner fills a batch for one partition, then moves on, which gives good batching and no ordering.

```viz
{"type": "system", "scenario": "kafka-partitions", "nodes": 3,
 "title": "Keys, partitions and a consumer group",
 "caption": "The key's hash picks the partition, so events for one key stay in order. Each partition is read by exactly one consumer in the group; when a consumer dies, its partitions move to the survivors and resume from the last committed offset."}
```

Four consequences every senior engineer knows:

- **Ordering is per partition only.** If "account opened" and "account closed" must be processed in order, they need the same key.
- **The partition count is sticky.** Adding partitions changes `hash mod N` for most keys, so a key's new events land in a different partition from its old ones and per-key ordering breaks across the change. Choose a count with headroom up front.
- **Client libraries disagree.** librdkafka-based clients (Python, Go, .NET, C/C++) default to a CRC32-based partitioner, not murmur2. Set `partitioner=murmur2_random` in librdkafka or a Python and a Java producer will send the same key to different partitions.
- **Hot keys make hot partitions.** One celebrity account or one live event sends its whole load to one partition and one consumer. Hashing spreads keys, not load.

### Sizing partitions and brokers

Size from consumer throughput, then check the broker side:

- Peak ingest is 300 MB/s. One consumer instance, CPU-bound on deserialisation and enrichment, handles about 10 MB/s per partition. You need at least 300 / 10 = 30 partitions, and consumer parallelism is capped at the partition count.
- Plan for 3× growth and for draining a backlog (an hour of outage at 300 MB/s is about 1 TB to catch up): 96 partitions.
- A broker's ingest ceiling is an order of magnitude, not a constant: roughly 50 to 300 MB/s of producer traffic per broker at replication factor 3 on NVMe and a 10 to 25 GbE network. It depends on record size (small records make the broker CPU-bound on request handling before the disk is busy), compression, `acks`, and above all the network multiplier: every ingested byte is sent out again to RF − 1 followers and to every consumer group, so a leader with RF 3 and two consumer groups sends out about 4 bytes for every byte it takes in.
- Partition count has a broker-side cost: each partition is open files, mapped indexes, a replica-fetcher slot and a leader election when its broker dies. A few thousand partitions per broker has long been the practical guideline; the failure-mode section shows why tens of thousands of tiny partitions make failover slow.

## Replication, the ISR and the replica fetcher

Each partition has a **replication factor** (typically 3). One replica is the **leader**, which handles all produce requests and, by default, all fetches; the others are **followers**. A follower does not receive pushes: its **replica fetcher thread** runs an ordinary fetch loop against the leader, asking for everything from its own log-end offset (LEO) and waiting up to `replica.fetch.wait.max.ms` (500 ms) when nothing is new. The fetch request itself tells the leader how far that follower has got, because the requested offset is the follower's LEO.

The **in-sync replica set (ISR)** is the leader plus every follower that has caught up to the leader's LEO within `replica.lag.time.max.ms` (30 s in current versions). A follower that has not fetched to the end within that window is removed from the ISR (the leader tells the controller), and re-added when it catches up. The leader's **high watermark (HW)** is the smallest LEO across the ISR: everything below it is on every in-sync replica. Consumers can only read below the HW, so they never see a record that a failover could erase.

| Setting | Where | Meaning |
|---|---|---|
| `acks=0` | Producer | Do not wait. Fire and forget. |
| `acks=1` | Producer | Wait for the leader to append to its log (page cache, not disk). |
| `acks=all` | Producer | Wait until the HW passes the record: every current ISR member has it. |
| `min.insync.replicas` | Topic or broker | Reject `acks=all` writes with `NotEnoughReplicas` if the ISR is smaller than this. |
| `unclean.leader.election.enable` | Topic or broker | Whether a replica outside the ISR may become leader. Default `false`. |

`acks=all` alone is weaker than it sounds: if both followers fall out of the ISR, "all in-sync replicas" is one machine. `min.insync.replicas=2` closes that hole. The standard triple (RF 3, `min.insync.replicas=2`, `acks=all`) tolerates one broker down with no loss and refuses writes rather than lose data when two are down; reads continue up to the HW either way. Set `broker.rack` to the availability zone so the three replicas do not share a zone.

```viz
{"type": "system", "scenario": "replication-leader-follower", "replicas": 2,
 "title": "Asynchronous versus synchronous acknowledgement",
 "caption": "acks=1 is the asynchronous mode: the leader acknowledges before followers have the record, and a failover in that window loses it. acks=all with min.insync.replicas=2 is the synchronous mode with a quorum floor: slower by one replication round trip, and no acknowledged record is lost when one broker dies."}
```

## A produce with acks=all, traced

Partition 7 has leader L and followers F1 and F2, all with LEO 100 and HW 100 (offsets 0 to 99 committed). The producer sends one batch of two records with `acks=all`; `min.insync.replicas=2`.

| Step | Event | LEO L / F1 / F2 | HW on L | Producer |
|---|---|---|---|---|
| 1 | L appends the batch at offsets 100 and 101 | 102 / 100 / 100 | 100 | Waiting; request parked until HW ≥ 102 |
| 2 | F1's fetcher asks for offset 100; L replies with the batch and HW=100 | 102 / 100 / 100 | 100 | Waiting |
| 3 | F1 appends; F2's fetch for 100 is answered the same way | 102 / 102 / 100 | 100 | Waiting |
| 4 | F2 appends. Neither follower has told L yet | 102 / 102 / 102 | 100 | Waiting |
| 5 | F1 fetches again from 102; L now records LEO(F1)=102 | 102 / 102 / 102 | 100 | Waiting (min LEO in ISR is still F2's 100) |
| 6 | F2 fetches from 102; L records LEO(F2)=102; HW = min(102, 102, 102) | 102 / 102 / 102 | 102 | Acknowledged |
| 7 | L's responses to those fetches carry HW=102; followers advance their own HW | 102 / 102 / 102 | 102 | Consumers may now read 100 and 101 |

Three things fall out of the table. The acknowledgement costs one extra fetch round trip after the data has landed (steps 5 and 6), because the leader learns a follower's LEO from the follower's *next* request. Followers learn the HW one round trip after the leader does, which matters in the failover trace below. And the ISR check is per request: had F2 been out of the ISR at step 1, the HW would have advanced at step 5 and the write would be on two machines, which is exactly what `min.insync.replicas=2` requires.

## A broker failure with leader epochs, offset by offset

Every leader change increments the partition's **leader epoch**; every batch is stamped with the epoch it was written under, and each replica keeps a `leader-epoch-checkpoint` file of (epoch, first offset). Before KIP-101 (0.11) a recovering replica truncated to its own HW, which lags the leader's, and two quick failovers could lose committed records or leave diverging logs. Epochs replace that guess with a question to the new leader.

Setup: epoch 3, leader L. The producer is idempotent, sending batch A (sequence 7) and batch B (sequence 8) with `acks=all`, `min.insync.replicas=2`.

| Step | Event | Log L / F1 / F2 (offset:epoch) | HW | Notes |
|---|---|---|---|---|
| 1 | L appends A at 100 and B at 101 | …100:3, 101:3 / …99 / …99 | 100 | Nothing acknowledged |
| 2 | F1 replicates A only; F2 is slower | 100:3, 101:3 / 100:3 / …99 | 100 | L learns F1's LEO (101) on F1's next fetch |
| 3 | L crashes | (down) / 100:3 / …99 | 100 | Producer has acks for neither A nor B |
| 4 | Controller elects F1 (in ISR) at epoch 4 | – / 100:3 / …99 | 100 | F1 records "epoch 4 starts at offset 101" |
| 5 | F2 asks F1 `OffsetsForLeaderEpoch(3)`; answer: epoch 3 ends at 101 | – / 100:3 / …99 | 100 | LEO 100 ≤ 101: no truncation; F2 fetches 100 |
| 6 | Producer retries A (seq 7); F1 already holds seq 7, treats the batch as a duplicate and returns offset 100 without appending | – / 100:3 / 100:3 | 101 | A acknowledged once F2 has it |
| 7 | Producer retries B (seq 8): appended at 101 under epoch 4 | – / 100:3, 101:4 / 100:3 | 101 | B acknowledged after F2 replicates it |
| 8 | L returns as follower and asks `OffsetsForLeaderEpoch(3)`; answer: epoch 3 ends at 101 | 100:3, 101:3 / 100:3, 101:4 / 100:3, 101:4 | 102 | L's 101 is epoch 3, past epoch 3's end |
| 9 | L truncates to 101, discarding its old B, then fetches 101:4 | 100:3, 101:4 / same / same | 102 | All three logs identical |

No acknowledged record was lost or duplicated: idempotence deduplicated A, and epochs told L which of its records were never committed. Now change one setting. With `acks=1`, L acknowledged A and B at step 1, the producer moved on, and step 9 deleted B, an acknowledged write. Consumers never saw it because the HW never passed 101, which is why the loss stayed silent until reconciliation.

## Producers: sequence numbers and batching

```python
from confluent_kafka import Producer

producer = Producer({
    "bootstrap.servers": "kafka-1:9092,kafka-2:9092,kafka-3:9092",
    "acks": "all",                               # wait for the ISR (with min.insync.replicas=2 on the topic)
    "enable.idempotence": True,                  # broker drops duplicate retries
    "max.in.flight.requests.per.connection": 5,  # <= 5 keeps per-partition order with idempotence
    "delivery.timeout.ms": 120000,               # report failure after 2 minutes of retries
    "linger.ms": 10,                             # wait up to 10 ms to fill a batch
    "batch.size": 262144,                        # 256 KB per partition batch
    "compression.type": "zstd",
    "partitioner": "murmur2_random",             # same key -> same partition as Java clients
})
```

Retries make a producer reliable and also create duplicates: a request times out after the broker appended it, and the retry appends it again. **Idempotence** (the Java client's default since 3.0, effective from 3.2 after a bug suppressed it) fixes this with a producer id (PID) and epoch assigned at `InitProducerId`, plus a per-partition **sequence number** that the producer increments per batch. For each PID and partition the broker keeps the metadata of the last five batches. A batch whose sequence matches one of those is answered with the original offset and not written (step 6 above). A batch whose sequence is higher than expected is rejected with `OutOfOrderSequence`, so an earlier lost batch cannot be skipped. Five cached batches is why `max.in.flight.requests.per.connection` may be at most 5 while keeping order.

The guarantee is per producer session and per partition. A restarted producer gets a new PID, so anything it re-sends from its own application-level retry is a new record. Deduplicating across restarts needs transactions with a stable `transactional.id`, or an idempotent consumer.

`linger.ms` and `batch.size` trade latency for throughput. At 10 ms linger, a producer sending 50,000 records/s to 64 partitions builds batches of about 8 records per partition; 50 ms gives about 40, better compression and a fifth of the requests, for up to 40 ms more latency.

## Consumer groups, rebalances and __consumer_offsets

Consumers sharing a `group.id` split a topic's partitions: each partition goes to exactly one member, so the group is a queue, while separate groups each receive everything, like publish/subscribe. The **group coordinator** for a group is the leader of partition `hash(group.id) mod 50` of the internal topic `__consumer_offsets` (50 partitions by default, replication factor 3, compacted). Committed offsets are records in that topic keyed by (group, topic, partition) with the offset and commit time as the value; the coordinator caches them in memory. Offsets for a group that has been empty for `offsets.retention.minutes` (7 days) expire, after which `auto.offset.reset` decides where the group restarts.

```python
from confluent_kafka import Consumer

consumer = Consumer({
    "bootstrap.servers": "kafka-1:9092",
    "group.id": "playback-sessionizer",
    "enable.auto.commit": False,                 # commit explicitly, after processing
    "auto.offset.reset": "earliest",             # no committed offset -> start from the oldest retained record
    "partition.assignment.strategy": "cooperative-sticky",
    "group.instance.id": "sessionizer-7",        # static membership: a quick restart keeps its partitions
    "max.poll.interval.ms": 300000,              # processing a batch must take less than 5 minutes
    "isolation.level": "read_committed",         # skip records from aborted transactions
})
consumer.subscribe(["playback-events"])

while True:
    batch = consumer.consume(num_messages=500, timeout=1.0)
    for msg in batch:
        if msg.error():
            continue
        handle(msg)                              # must be idempotent: a crash before commit replays it
    if batch:
        consumer.commit(asynchronous=False)      # at-least-once
```

Where you commit decides the guarantee: before processing is at-most-once, after processing is at-least-once (the normal choice, requiring idempotent handling), and auto-commit on a timer during `poll` can commit records handed to another thread that never processed them.

### Rebalance protocols

A rebalance starts when a member joins, leaves, misses heartbeats for `session.timeout.ms` (45 s), or fails to call `poll` within `max.poll.interval.ms` (5 min). What happens next depends on the protocol:

| Protocol | Mechanism | Cost of one member joining 50 | Version |
|---|---|---|---|
| Eager (`range`, `roundrobin`) | Every member revokes all partitions, rejoins (`JoinGroup`), the elected leader member computes the assignment, everyone fetches it (`SyncGroup`) | All 50 stop processing for the whole round; every partition's state is flushed and reloaded | Original |
| Cooperative (`cooperative-sticky`) | Two rounds: first assignment revokes only partitions that change owner, second hands them out; unaffected partitions keep flowing | Only the moved partitions pause | 2.4+ |
| KIP-848 (`group.protocol=consumer`) | No join/sync barrier: the coordinator computes assignments server-side and delivers them incrementally in heartbeat responses, with a per-member epoch for fencing | Only the moved partitions pause, with less client-side coordination and no leader member | Early access 3.7, GA 4.0 |

**Static membership** (`group.instance.id`) is orthogonal: a member that restarts within `session.timeout.ms` reclaims its partitions with no rebalance at all, turning a rolling deploy of 50 consumers from 50 group-wide pauses into none. The `range` assignor also balances badly across topics (the same first consumers get every topic's leftovers); the exercise below makes that concrete.

**Lag** (log-end offset minus committed offset, per partition) is the health metric. Alert on lag in time, not records: 100,000 records is nothing on one topic and an hour on another.

```viz
{"type": "system", "scenario": "message-queue", "requests": 12,
 "title": "Competing consumers and a growing backlog",
 "caption": "Within one consumer group Kafka behaves like a work queue: each record is handled by one member, an unacknowledged (uncommitted) record is redelivered after a crash, and when producers outpace consumers the backlog grows. Alert on the age of the oldest unprocessed record, not only on depth."}
```

## Retention and the log cleaner

Kafka keeps data by policy, not by consumption:

- **Delete** (`cleanup.policy=delete`): a background task (every `log.retention.check.interval.ms`, 5 min) deletes whole closed segments whose largest timestamp is older than `retention.ms` (7 days) or that push the partition past `retention.bytes`. The active segment is never deleted, and on a quiet partition it only rolls when `segment.ms` (7 days) expires, so a record can outlive `retention.ms` by up to that long, which matters for privacy commitments.
- **Compact** (`cleanup.policy=compact`): the **log cleaner** thread picks the partition with the highest **dirty ratio** (bytes not yet cleaned ÷ total, cleaned only once above `min.cleanable.dirty.ratio`, 0.5). It scans the dirty section once to build an in-memory offset map of key → latest offset (24 bytes per key: a 16-byte hash plus the 8-byte offset, bounded by `log.cleaner.dedupe.buffer.size`, 128 MB, so about 5 million keys per pass), then rewrites the older segments keeping only records whose offset is the latest for their key. A record with a null value is a **tombstone**: it survives at least `delete.retention.ms` (24 h) so a consumer that is behind sees the delete, then disappears. `min.compaction.lag.ms` keeps a record uncompacted for at least that long, so a reader can see intermediate versions. The active segment is never cleaned.

Disk arithmetic at 300 MB/s for 7 days with replication factor 3: 300 MB/s × 86,400 s × 7 × 3 ≈ 544 TB, or about a third of that if zstd compresses your JSON 3×. Tiered storage (KIP-405, production-ready in 3.9) moves closed segments to object storage and keeps only `local.retention.ms` on broker disks.

```bash
kafka-topics.sh --bootstrap-server kafka-1:9092 --create --topic playback-events \
  --partitions 96 --replication-factor 3 \
  --config min.insync.replicas=2 \
  --config retention.ms=604800000 \
  --config unclean.leader.election.enable=false
```

## Under the hood: KRaft versus ZooKeeper

Cluster metadata (which broker leads which partition, the ISR, topic configs) needs a home and an arbiter. In the ZooKeeper design, one broker won an ephemeral znode to become the controller and kept metadata in ZooKeeper; on controller failover the new controller had to reload every partition's state from ZooKeeper before it could act, a reload that grew with the partition count and delayed every leader election behind it. **KRaft** (KIP-500) replaces this with a Raft quorum of controller nodes (typically 3 or 5) that write metadata as records in an internal `__cluster_metadata` log; brokers fetch that log and keep an in-memory image, and standby controllers already hold the full state, so failover is a Raft election with nothing to reload. The [Raft lesson](/learn/system-design/distributed-systems/consensus-raft) covers the election itself.

Version-honest timeline: KRaft shipped as early access in 2.8 (2021), was declared production-ready in 3.3 (2022), ZooKeeper mode was deprecated in 3.5, migration from ZooKeeper to KRaft became production-ready in 3.6, and Kafka 4.0 (2025) removed ZooKeeper entirely. A cluster on 4.x has no ZooKeeper to operate, and the cluster-wide partition ceiling is now bounded by controller memory and metadata log size rather than by ZooKeeper write throughput.

## Exactly-once: transactions and the last stable offset

Kafka's exactly-once semantics (EOS) is a specific guarantee: in a **read-process-write** loop from Kafka to Kafka, the output records and the consumed offsets commit atomically, so each input affects the output once even across crashes and retries. Three pieces build it:

1. **Idempotent producers** remove duplicates from retries within a session.
2. **Transactions.** A producer with a stable `transactional.id` calls `init_transactions`, which reaches the **transaction coordinator** (the leader of a partition of `__transaction_state`), bumps the producer epoch and **fences** any older instance with the same id: their next write fails with `ProducerFenced`. Inside a transaction the producer writes to any partitions and adds the consumer's offsets (`send_offsets_to_transaction`, a write to `__consumer_offsets` under the same transaction). On commit the coordinator writes a `PREPARE_COMMIT` record to its log, then a **control record** (commit marker) into every partition the transaction touched, then `COMPLETE_COMMIT`.
3. **`read_committed` consumers** fetch only up to the **last stable offset (LSO)**: the first offset of the oldest still-open transaction on that partition, or the HW if none is open. Records of aborted transactions are filtered out on the client using an aborted-transaction index the broker returns with the fetch.

```python
producer = Producer({"bootstrap.servers": "kafka-1:9092",
                     "transactional.id": "sessionizer-7", "enable.idempotence": True})
producer.init_transactions()                     # fences older producers with the same id

while True:
    batch = consumer.consume(num_messages=500, timeout=1.0)
    if not batch:
        continue
    producer.begin_transaction()
    for msg in batch:
        for out in sessionize(msg):
            producer.produce("sessions", key=out.key, value=out.value)
    producer.send_offsets_to_transaction(
        consumer.position(consumer.assignment()), consumer.consumer_group_metadata())
    producer.commit_transaction()                # outputs and offsets become visible together
```

The LSO is the cost centre. One producer that opens a transaction and stalls holds the LSO of every partition it touched at its first record, so every `read_committed` consumer of those partitions stops seeing new data, including other producers' committed records, until the broker aborts the transaction at `transaction.timeout.ms` (60 s default; brokers cap requests at `transaction.max.timeout.ms`, 15 min). Kafka Streams with `exactly_once_v2` commits every 100 ms by default for that reason.

EOS covers nothing outside Kafka. If `sessionize` calls a payment API or writes to Postgres, an aborted and retried transaction repeats the side effect. External sinks need idempotent writes keyed by an event id, or a sink that joins the commit, which [exactly-once semantics](/learn/system-design/distributed-systems/exactly-once-semantics) covers in general and [stateful streaming](/learn/big-data/streaming/stateful-streaming) covers for Flink.

## Production failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Consumer lag spiral | Lag in time climbs steadily; consumers are at 100% CPU or blocked on a downstream call; the backlog grows faster than it drains | Per-partition lag is uniform (throughput-bound) or concentrated (hot key); compare records/s per consumer against the produce rate | Add consumers up to the partition count, raise `fetch.min.bytes`/`max.poll.records` to batch downstream calls, move the slow call out of the poll loop; for a hot key, salt the key or split the workload |
| Rebalance storm | The group rebalances every few minutes; throughput drops to near zero; logs show members leaving with "poll interval exceeded" | Some batches take longer than `max.poll.interval.ms`; each eviction triggers a rebalance, the member rejoins and triggers another | Shrink `max.poll.records`, bound per-record work, raise the interval deliberately; use cooperative-sticky or the KIP-848 protocol plus static membership so one slow member does not stop the other 49 |
| Unclean leader election | After a multi-broker outage, consumers on some partitions see offsets jump backwards or replays; producers get `OutOfOrderSequence` | `unclean.leader.election.enable=true` let a replica outside the ISR lead; acknowledged records past its LEO were truncated when the old leader returned | Leave it `false` and accept unavailability until an ISR member returns; if you must enable it, treat the topic as reconcilable and never for money |
| ISR shrink under a slow disk | `UnderReplicatedPartitions` rises on one broker; `acks=all` latency spikes; then `NotEnoughReplicas` errors | A follower whose disk is saturated cannot fetch to the leader's LEO within `replica.lag.time.max.ms` and drops out of the ISR; with `min.insync.replicas=2` and a second slow follower, writes are refused | Find the disk (`iostat` await, page-cache eviction from a large consumer replay), throttle the replay with a quota, add brokers; the refusal is correct behaviour, the disk is the bug |
| Compacted topic that never compacts | A changelog or CDC topic grows without bound; a new consumer takes hours to bootstrap | Either the dirty ratio never reaches 0.5, the active segment never rolls on a quiet topic (`segment.ms`), the cleaner marked the partition uncleanable (`uncleanable-partitions-count` metric, `log-cleaner.log`), or `min.compaction.lag.ms` is huge | Lower `segment.ms`/`segment.bytes` for that topic, set `max.compaction.lag.ms`, fix the record that broke the cleaner, and size `log.cleaner.dedupe.buffer.size` for the key cardinality |

## Interviewer follow-ups

**"With RF 3, `acks=all` and `min.insync.replicas=2`, can you still lose an acknowledged write?"** Model answer: yes in two ways. Two ISR members can be lost simultaneously, which is why replicas go in different zones and the surviving replica must not be allowed to lead uncleanly. And a `delivery.timeout.ms` expiry after the broker appended but before the ack arrived produces an application-level failure for a record that exists; on retry from the application (not the client library) the idempotent sequence is new, so the record is duplicated rather than lost. Common wrong answer: "no, the quorum guarantees it," which forgets correlated failures and application retries.

**"Why does `read_committed` latency depend on other producers?"** Model answer: the LSO is a per-partition minimum over all open transactions, so any transactional producer that stalls holds back every committed reader of that partition until its transaction times out. Common wrong answer: "read_committed only waits for my own transaction."

**"A consumer group needs to process 600 MB/s and each consumer does 10 MB/s. How many partitions?"** Model answer: at least 60, then headroom for growth and backlog drain (say 180), checked against per-broker partition counts and the ordering cost of ever adding more. Common wrong answer: "60, we can add more later," ignoring that adding partitions breaks per-key ordering.

**"How does the broker deduplicate a retried batch without reading the log?"** Model answer: it keeps, per producer id and partition, the sequence numbers and offsets of the last five batches in memory (also checkpointed in a snapshot file per partition), so a duplicate is answered from that cache. Common wrong answer: "it hashes the record contents," which Kafka never does.

## What mid-level engineers get wrong

- Reading `acks=all` as "durable" without `min.insync.replicas=2`: the ISR shrinks to the leader under load and the write lands on one machine.
- Committing offsets before the side effect, or letting auto-commit run while records are in another thread: a crash skips work; the opposite order duplicates it, and only idempotent handling makes the duplication safe.
- Adding partitions to a keyed topic in production to "get more throughput" and losing per-key order for every key that moves.
- Believing `exactly_once` covers the email API or Postgres write inside the loop.
- Alerting on lag in records and paging at 3 a.m. for a backlog that drains in four seconds, while a 200-record lag on a low-volume topic that means "two hours stale" goes unnoticed.
- Treating a compacted topic as if compaction were immediate, then sizing a bootstrap consumer's memory for the compacted size.

## Exercise: partition assignment

```exercise
id: kafka-partition-assignment
title: Range and round-robin partition assignors
prompt: |
  Implement two consumer-group assignors. Every consumer subscribes to every topic.

  - `strategy` is `"range"` or `"roundrobin"`.
  - `consumers` is a list of member ids; sort them lexicographically first.
  - `topics` maps topic name to partition count; process topics in sorted
    name order and partitions in numeric order.

  Range: for each topic separately, with P partitions and C consumers, every
  consumer gets `P // C` contiguous partitions and the first `P % C`
  consumers get one extra. Round-robin: list every topic-partition (sorted by
  topic, then partition) and deal them to the sorted consumers in turn.

  Return an object mapping every consumer id to its list of
  `"topic-partition"` strings (for example `"orders-2"`), in the order assigned.
  A consumer with nothing assigned maps to an empty list.
languages: [python, javascript]
entry: assign_partitions
starter:
  python: |
    def assign_partitions(strategy, consumers, topics):
        members = sorted(consumers)
        result = {c: [] for c in members}
        # your code here
        return result
  javascript: |
    function assign_partitions(strategy, consumers, topics) {
      const members = [...consumers].sort();
      const result = {};
      for (const c of members) result[c] = [];
      // your code here
      return result;
    }
tests:
  - args: ["range", ["c1", "c2"], {"orders": 3, "payments": 3}]
    expected: {"c1": ["orders-0", "orders-1", "payments-0", "payments-1"], "c2": ["orders-2", "payments-2"]}
    label: range piles leftovers onto the first consumer
  - args: ["roundrobin", ["c1", "c2"], {"orders": 3, "payments": 3}]
    expected: {"c1": ["orders-0", "orders-2", "payments-1"], "c2": ["orders-1", "payments-0", "payments-2"]}
    label: round-robin balances across topics
  - args: ["range", ["a", "b", "c", "d"], {"t": 2}]
    expected: {"a": ["t-0"], "b": ["t-1"], "c": [], "d": []}
    label: more consumers than partitions
  - args: ["range", ["c2", "c1"], {"x": 5}]
    expected: {"c1": ["x-0", "x-1", "x-2"], "c2": ["x-3", "x-4"]}
    label: consumers are sorted first
  - args: ["roundrobin", ["a", "b", "c"], {"views": 2, "clicks": 2}]
    expected: {"a": ["clicks-0", "views-1"], "b": ["clicks-1"], "c": ["views-0"]}
    hidden: true
    label: topics are sorted by name
  - args: ["range", ["c1", "c2", "c3"], {"t": 7, "u": 1}]
    expected: {"c1": ["t-0", "t-1", "t-2", "u-0"], "c2": ["t-3", "t-4"], "c3": ["t-5", "t-6"]}
    hidden: true
hints:
  - "For range, consumer i starts at `i * (P // C) + min(i, P % C)` and takes `P // C` partitions plus one if `i < P % C`."
  - "For round-robin, build the full sorted list of topic-partitions first, then give item j to `members[j % C]`."
```

## Senior signals

- You state durability as a configuration triple: **replication factor 3, `min.insync.replicas=2`, `acks=all`**, plus idempotence, unclean election off, and replicas spread across zones.
- You can trace an `acks=all` produce through the **replica fetcher and the high watermark**, and a failover through **leader epochs and truncation**, and say which offsets survive.
- You know what a segment is on disk (`.log`, sparse `.index` every 4 KiB, `.timeindex`), why the page cache and `sendfile` make it fast, and that TLS costs the zero-copy path.
- You size partitions from **throughput per consumer** with headroom, know the per-broker order of magnitude and what it depends on, and know adding partitions later breaks per-key ordering.
- You treat consumer processing as **at-least-once and idempotent**, and you can explain eager vs cooperative vs KIP-848 rebalancing, static membership, and where `__consumer_offsets` lives.
- You scope **exactly-once** to Kafka-to-Kafka read-process-write with transactions, `read_committed` and the LSO, and you know a stalled transaction stalls every committed reader.
- You compute **retention disk** (rate × time × replication factor ÷ compression), know how the log cleaner works, and why a compacted topic can fail to compact.
- You can say what changed between ZooKeeper and KRaft and in which versions.

## Check yourself

```quiz
- q: >-
    A topic has replication factor 3 and min.insync.replicas=2. The producer uses acks=all. Two of the three brokers hosting a partition go down. What happens?
  options: ["Writes are rejected with NotEnoughReplicas; reads continue", "Writes continue on the remaining broker and may be lost later", "Reads and writes both stop until a second replica rejoins", "Kafka elects an out-of-sync replica so that writes can continue"]
  answer: 0
  explanation: >-
    With only one in-sync replica, acks=all writes fall below the min.insync.replicas floor and are rejected, choosing consistency over write availability. Consumers can still read already-committed data up to the high watermark, so reads do not stop. Electing an out-of-sync replica only happens with unclean leader election enabled.
- q: >-
    In the acks=all trace, the leader appended offsets 100 and 101 and both followers had fetched and appended them. Why was the producer still waiting?
  options: ["The followers must fsync the batch before the leader may count them as in sync", "The acknowledgement is sent by the followers, and their responses were still in flight", "The high watermark advances only when the controller confirms the ISR membership", "The leader learns a follower's LEO only from that follower's next fetch request"]
  answer: 3
  explanation: >-
    Replication is pull-based, and the offset a follower asks for in its next fetch is what tells the leader how far that follower has got. Until both followers fetch from offset 102, the leader's view of their LEOs is still 100 and the high watermark cannot pass 102. Followers never fsync per batch and never send acknowledgements to producers, and the controller is not involved in advancing the high watermark.
- q: >-
    An old leader rejoins after a failover and holds a record at offset 101 written under epoch 3. The new leader reports that epoch 3 ended at offset 101. What does the rejoining replica do?
  options: ["It truncates to its own high watermark, which may be lower than 101", "It truncates offset 101 away and fetches the new leader's record for that offset", "It keeps offset 101 because the offset is below the new leader's log-end offset", "It forwards its offset 101 to the new leader, which appends it after the epoch-4 records"]
  answer: 1
  explanation: >-
    Epoch 3 ending at 101 means the new leader's offset 101 belongs to epoch 4, so the rejoining replica's epoch-3 record at 101 was never committed and must go. It truncates to 101 and fetches the leader's version. Truncating to the local high watermark was the pre-KIP-101 behaviour that could leave logs diverged; no replica ever pushes its own records into a leader's log.
- q: >-
    A read_committed consumer of a partition stops receiving new records for a minute even though several producers keep writing and committing normally. What is the most likely cause?
  options: ["The partition's high watermark cannot advance while any transaction is in flight", "The committing producers are fenced by an older epoch and their writes are aborted", "One transactional producer has an open transaction on that partition, holding the LSO", "The consumer's session timed out, and the partition is being rebalanced away"]
  answer: 2
  explanation: >-
    The last stable offset is the first offset of the oldest open transaction on the partition, and read_committed consumers fetch only up to it, so a single stalled transaction hides every later record, including other producers' committed ones, until it is committed or times out. The high watermark advances independently of transactions, and fenced producers fail immediately rather than committing normally.
- q: >-
    A consumer group's batches occasionally take 7 minutes to process, and the group keeps rebalancing. What is the most direct cause?
  options: ["Auto-commit is disabled, so offsets are never committed in time", "session.timeout.ms is too short for the 7-minute batches", "There are more partitions than consumers to spread them over", "Batches exceed max.poll.interval.ms, so the member is evicted"]
  answer: 3
  explanation: >-
    Heartbeats run on a background thread, so session timeouts are not the issue; failing to call poll within max.poll.interval.ms (5 minutes by default) is, and the evicted member later rejoins and triggers another rebalance. Shrink batches, speed up processing, or raise the interval deliberately. Cooperative or KIP-848 rebalancing plus static membership reduce the blast radius.
- q: >-
    A compacted changelog topic keeps growing and a new consumer takes hours to bootstrap. Which explanation is consistent with how the log cleaner works?
  options: ["Tombstones are removed immediately, so the cleaner has nothing to reclaim", "The cleaner needs one consumer per partition to confirm keys are no longer read", "The topic is quiet, so its active segment never rolls and the cleaner never sees it", "Compaction runs only on the active segment, which is too small to matter"]
  answer: 2
  explanation: >-
    The cleaner works only on closed segments and only once the dirty ratio is high enough; a quiet topic whose active segment rolls only after segment.ms keeps every update in that uncleanable segment. Lower segment.ms or segment.bytes for the topic and set max.compaction.lag.ms. The cleaner never touches the active segment, tombstones are retained for delete.retention.ms, and consumers play no part in compaction.
```
