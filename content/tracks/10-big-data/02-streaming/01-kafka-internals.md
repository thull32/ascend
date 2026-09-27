---
slug: kafka-internals
title: "Kafka internals: partitions, replication, consumer groups and exactly-once"
description: How Kafka's partitioned, replicated log works; which settings (acks, min.insync.replicas, retention, consumer-group timeouts, transactions) decide whether you lose or duplicate data; and how to size partitions and disks with arithmetic.
minutes: 33
difficulty: hard
tags: [big-data, streaming, kafka, replication, consumer-groups, delivery-guarantees, exactly-once, partitioning]
---
A payments team runs a routine rolling restart of its Kafka brokers. Afterwards, reconciliation finds 214 authorisation events that the producing service logged as successfully sent but that no consumer ever saw. Nobody changed any code. The producer was configured with `acks=1`, a broker acknowledged the writes and then restarted before its followers had copied them, and a follower that never had them became the new leader. A week later a different team double-charges customers during a consumer-group rebalance, again with no code change: they committed offsets after calling the payment provider, and a rebalance replayed a batch.

Kafka is the spine of most streaming platforms. Netflix's Keystone pipeline, for example, moves events from Netflix's services through Kafka into stream processors and sinks such as S3 and Elasticsearch, at a scale described publicly as trillions of events a day. At that scale, and at much smaller ones, correctness is decided less by application code than by a dozen settings and the mechanisms behind them. This lesson builds those mechanisms from the log up.

## The log: why Kafka is fast

A **topic** is split into **partitions**. Each partition is an append-only log stored on a broker's disk as a sequence of **segment** files (1 GB by default), each with a sparse offset index and a time index. Every record gets a monotonically increasing **offset** within its partition. Records are never modified; they are deleted only when whole segments age out.

Three design choices make this fast on ordinary hardware:

1. **Sequential I/O.** Producers append and consumers usually read the tail, so disks see sequential writes and reads, and the operating system's page cache serves most reads from memory without Kafka keeping its own cache.
2. **Batching end to end.** The producer groups records per partition into batches (`batch.size`, `linger.ms`), compresses the whole batch, and the broker stores and serves it in that same compressed form. A consumer fetch returns whole batches.
3. **Zero-copy reads.** Because the broker does not transform batches, it can send file bytes to the network socket with `sendfile`, skipping user-space copies.

The broker is deliberately simple: it does not track which consumer has read what, does not delete on read, and does not route individual messages. Consumers track their own position. That is why many independent consumer groups can read the same topic at different speeds, and why a new consumer can replay seven days of history.

## Partitioning: ordering and parallelism

The producer picks a partition for each record. With a key, the Java client uses `murmur2(key) mod partitions`, so all records for one key land in one partition, in order. Without a key, modern producers fill a batch for one partition and then move to another (the "sticky" partitioner), which gives good batching but no ordering.

```viz
{"type": "system", "scenario": "kafka-partitions", "nodes": 3,
 "title": "Keys, partitions and a consumer group",
 "caption": "The key's hash picks the partition, so events for one key stay in order. Each partition is read by exactly one consumer in the group; when a consumer dies, its partitions move to the survivors and resume from the last committed offset."}
```

Four consequences every senior engineer knows:

- **Ordering is per partition only.** If "account opened" and "account closed" must be processed in order, they need the same key.
- **The partition count is sticky.** Adding partitions changes `hash mod N` for most keys, so a key's new events land in a different partition from its old ones, and per-key ordering breaks across the change. Choose a count with headroom up front.
- **Client libraries disagree.** librdkafka-based clients (Python, Go, .NET, C/C++) default to a CRC32-based partitioner, not murmur2. A Python producer and a Java producer writing the same key can pick different partitions unless you set `partitioner=murmur2_random` in librdkafka.
- **Hot keys make hot partitions.** One celebrity account or one live event sends its whole load to one partition and one consumer. Hashing spreads keys, not load.

### Sizing partitions

Size from throughput, then add headroom:

- Peak ingest is 300 MB/s. One consumer instance, which is CPU-bound on deserialisation and enrichment, handles about 10 MB/s per partition. You need at least 300 / 10 = 30 partitions to keep up, and consumer parallelism is capped at the partition count.
- Plan for about 3× growth and for catching up after an outage (a consumer that is 1 hour behind at 300 MB/s needs spare capacity to drain 1 TB): 96 partitions.
- Check the other side. Every partition is open files, replication fetch work and a leader election on broker failure. A few thousand partitions per broker has long been a practical guideline; tens of thousands of tiny partitions make failover slow. Recent Kafka versions replace ZooKeeper with a built-in Raft quorum (KRaft) for metadata, which raises the ceiling but does not make partitions free.

## Replication, the ISR and the high watermark

Each partition has a **replication factor** (typically 3). One replica is the **leader** and handles all reads and writes for that partition; the others are **followers** that continuously fetch from the leader. The **in-sync replica set (ISR)** is the leader plus the followers that have caught up within `replica.lag.time.max.ms` (30 s by default). The leader tracks the **high watermark**: the highest offset that every ISR member has copied. Consumers can only read up to the high watermark, so they never see a record that a leader failover could erase.

Durability comes from two knobs, one on each side:

| Setting | Where | Meaning |
|---|---|---|
| `acks=0` | Producer | Do not wait at all. Fire and forget. |
| `acks=1` | Producer | Wait for the leader to append to its log (not to disk; to the page cache). |
| `acks=all` | Producer | Wait until every current ISR member has the record. |
| `min.insync.replicas` | Topic or broker | Reject `acks=all` writes (with `NotEnoughReplicas`) if the ISR is smaller than this. |
| `unclean.leader.election.enable` | Topic or broker | Whether a replica outside the ISR may become leader. Default `false`. |

`acks=all` on its own is weaker than it sounds. If both followers fall behind (a network blip, a long GC pause), the ISR shrinks to the leader alone, and "all in-sync replicas" means one machine. `min.insync.replicas=2` closes that hole: with a replication factor of 3, a write is acknowledged only when at least two brokers have it.

The standard durable configuration and what it tolerates:

| RF | min.insync.replicas | acks | Brokers down | Writes | Acknowledged data |
|---|---|---|---|---|---|
| 3 | 2 | all | 0 or 1 | Accepted | Safe |
| 3 | 2 | all | 2 | Rejected (`NotEnoughReplicas`) | Safe; reads continue up to the high watermark |
| 3 | 1 | all | 1 (and a lagging follower) | Accepted by the leader alone | Lost if that leader dies next |
| 3 | any | 1 | 1 (the leader, at the wrong moment) | Accepted | Lost |

The `acks=1` loss is the opening incident, step by step. The leader appends offset 1,000 and acknowledges. Before any follower fetches it, the leader restarts. A follower whose log ends at 999 is still in the ISR (it was within the 30-second lag window), so it becomes leader and starts assigning offset 1,000 to new records. When the old leader rejoins, it truncates its log to match the new leader, and the original record 1,000 is gone, though its producer was told it succeeded.

```viz
{"type": "system", "scenario": "replication-leader-follower", "replicas": 2,
 "title": "Asynchronous versus synchronous acknowledgement",
 "caption": "acks=1 is the asynchronous mode: the leader acknowledges before followers have the record, and a failover in that window loses it. acks=all with min.insync.replicas=2 is the synchronous mode with a quorum floor: slower by one replication round trip, and no acknowledged record is lost when one broker dies."}
```

Two more details matter in production. First, Kafka acknowledges from the page cache and does not fsync each write by default; durability comes from having the record in the memory of several machines, which is why replicas must fail independently. Set `broker.rack` to the availability zone so replicas spread across zones, or a zone-wide power loss can take all three copies at once. Second, `unclean.leader.election.enable=true` trades exactly this safety for availability: if every ISR member is down, an out-of-date replica may lead and silently discard acknowledged records. Leave it off for anything you would reconcile.

## Producers: idempotence, ordering and batching

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

Retries are what make a producer reliable, and they are also what create duplicates: a request times out, the producer retries, but the first attempt had succeeded. With **idempotence** (on by default in recent Java clients), the broker assigns each producer an id, the producer numbers every batch per partition, and the broker discards a batch whose sequence number it has already written. It also rejects out-of-order sequences, which is why idempotence preserves ordering with up to five in-flight requests. The guarantee is per producer session and per partition: a producer that restarts gets a new id, and records it re-sends from its own application-level retry are new records.

`linger.ms` and `batch.size` trade latency for throughput. At 10 ms of linger a producer sending 50,000 records per second to 64 partitions builds batches of about 8 records per partition; raising linger to 50 ms gives about 40 per batch, better compression and far fewer requests, for up to 40 ms more latency.

## Consumer groups, offsets and rebalances

Consumers that share a `group.id` split a topic's partitions between them: each partition is assigned to exactly one member, so the group behaves like a queue, while separate groups each receive every record, like publish/subscribe. A **group coordinator** broker tracks membership, and one member (or, in newer protocol versions, the coordinator itself) computes the assignment.

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

**Offsets** are committed to an internal compacted topic, `__consumer_offsets`. Where you commit decides the delivery guarantee:

- Commit **before** processing: a crash after the commit skips the batch. At-most-once.
- Commit **after** processing: a crash before the commit replays the batch. At-least-once, the normal choice, which requires idempotent handling (upsert by key, dedupe by event id).
- Auto-commit commits on a timer during `poll`. If you hand records to other threads, it can commit records that were never processed.

**Rebalances** happen when a member joins, leaves, misses heartbeats for `session.timeout.ms` (45 s by default in recent versions), or fails to call `poll` within `max.poll.interval.ms`. The last one is the classic incident: a batch that sometimes takes six minutes to process gets its consumer evicted, its partitions move, it rejoins, triggers another rebalance, and the group spends its time rebalancing. Under the old **eager** protocol every member stops and gives up all partitions during a rebalance. The **cooperative** protocol moves only the partitions that change owner, and **static membership** (`group.instance.id`) lets a restarting pod reclaim its partitions without any rebalance, which turns a rolling deploy of 50 consumers from 50 group-wide pauses into none.

Assignment strategy also matters for balance. The **range** assignor gives each consumer a contiguous block of each topic's partitions, handing the leftovers to the first consumers; with several topics the same consumers get the leftovers every time. The **round-robin** assignor deals all partitions out in turn. The **sticky** assignors balance like round-robin and also minimise movement between rebalances. The exercise below makes the difference concrete.

**Lag** (log-end offset minus committed offset, per partition) is the health metric for a consumer group. Alert on lag in time ("this group is 4 minutes behind") rather than in records, because 100,000 records is nothing on one topic and an hour on another.

```viz
{"type": "system", "scenario": "message-queue", "requests": 12,
 "title": "Competing consumers and a growing backlog",
 "caption": "Within one consumer group Kafka behaves like a work queue: each record is handled by one member, an unacknowledged (uncommitted) record is redelivered after a crash, and when producers outpace consumers the backlog grows. Alert on the age of the oldest unprocessed record, not only on depth."}
```

## Retention and compaction

Kafka keeps data by policy, not by consumption:

- **Time or size retention** (`cleanup.policy=delete`): segments older than `retention.ms` (7 days by default) or beyond `retention.bytes` per partition are deleted. Deletion works on whole closed segments, and the active segment is never deleted. On a low-traffic partition a segment may only roll when `segment.ms` (7 days by default) expires, so records can outlive `retention.ms` by up to that long, which matters for privacy commitments.
- **Compaction** (`cleanup.policy=compact`): the log cleaner keeps at least the latest record per key and removes older ones. A record with a null value is a **tombstone** that deletes the key after `delete.retention.ms`. A compacted topic is a table: replaying it rebuilds the latest state per key. `__consumer_offsets`, Kafka Streams changelogs and CDC topics all use it.

Disk sizing is straightforward arithmetic. At 300 MB/s for 7 days with replication factor 3: 300 MB/s × 86,400 s × 7 × 3 ≈ 544 TB of broker disk, or roughly a third of that if zstd compresses your JSON 3×. Tiered storage, available in recent Kafka versions, moves closed segments to object storage and keeps only recent data on broker disks, which makes long retention affordable.

```bash
kafka-topics.sh --bootstrap-server kafka-1:9092 --create --topic playback-events \
  --partitions 96 --replication-factor 3 \
  --config min.insync.replicas=2 \
  --config retention.ms=604800000 \
  --config unclean.leader.election.enable=false
```

## Exactly-once, precisely

Kafka's exactly-once semantics (EOS) is a specific guarantee: in a **read-process-write** loop from Kafka to Kafka, the output records and the consumed offsets are committed atomically, so each input affects the output exactly once even across crashes and retries. It is built from three pieces:

1. **Idempotent producers**, which remove duplicates from retries within a session.
2. **Transactions.** A producer with a stable `transactional.id` writes to many partitions and adds the consumer's offsets to the same transaction (`send_offsets_to_transaction`), then commits. The coordinator writes commit or abort markers into every partition involved. The `transactional.id` carries an epoch, so when a restarted instance initialises with the same id, the old "zombie" instance is fenced and its writes are rejected.
3. **`read_committed` consumers**, which only read up to the last stable offset and skip aborted records.

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

What EOS does **not** cover is anything outside Kafka. If `sessionize` calls a payment API or writes to Postgres, an aborted and retried transaction repeats that side effect. For external sinks you still need idempotent writes (upserts keyed by an event id) or a sink that participates in the commit, which is what the [exactly-once semantics](/learn/system-design/distributed-systems/exactly-once-semantics) lesson covers in general. EOS also costs latency: `read_committed` consumers cannot see a record until its transaction commits, so end-to-end latency is at least the commit interval (Kafka Streams commits every 100 ms under EOS by default), and a long transaction holds back every downstream reader of those partitions.

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
- You can narrate how `acks=1` loses an **acknowledged** write during leader failover, and why consumers never see it thanks to the high watermark.
- You size partitions from **throughput per consumer** with headroom, and you know adding partitions later breaks per-key ordering.
- You treat consumer processing as **at-least-once and idempotent**, and you know rebalance storms come from `max.poll.interval.ms`, eager rebalancing and missing static membership.
- You scope **exactly-once** correctly: Kafka-to-Kafka read-process-write with transactions and `read_committed`, never external side effects.
- You compute **retention disk** (rate × time × replication factor ÷ compression) and know compaction turns a topic into a table.

## Check yourself

```quiz
- q: >-
    A topic has replication factor 3 and min.insync.replicas=2. The producer uses acks=all. Two of the three brokers hosting a partition go down. What happens?
  options: ["Writes continue on the remaining broker and may be lost later", "Writes to that partition are rejected with NotEnoughReplicas; consumers can still read up to the high watermark", "Kafka elects an out-of-sync replica and continues", "Both reads and writes stop"]
  answer: 1
  explanation: >-
    With only one in-sync replica, acks=all writes fall below the min.insync.replicas floor and are rejected, choosing consistency over write availability. Reads of already-committed data continue. Electing an out-of-sync replica only happens with unclean leader election enabled.
- q: >-
    Why can a producer with acks=all and min.insync.replicas=1 still lose acknowledged writes?
  options: ["acks=all ignores the ISR", "If followers lag out of the ISR, the leader alone satisfies acks=all; if it then fails, the record exists nowhere else", "min.insync.replicas=1 disables replication", "The high watermark is not updated with acks=all"]
  answer: 1
  explanation: >-
    acks=all waits for the current ISR, which can shrink to just the leader. min.insync.replicas=2 is what forces a second copy before acknowledging. Replication itself is still on; it simply was not waited for.
- q: >-
    A consumer group's batches occasionally take 7 minutes to process, and the group keeps rebalancing. What is the most direct cause?
  options: ["session.timeout.ms is too high", "Processing exceeds max.poll.interval.ms (5 minutes by default), so the member is evicted and later rejoins", "There are more partitions than consumers", "Auto-commit is disabled"]
  answer: 1
  explanation: >-
    Heartbeats run on a background thread, so session timeouts are not the issue; failing to call poll within max.poll.interval.ms is. Shrink batches, speed up processing, or raise the interval deliberately. Static membership and cooperative rebalancing reduce the blast radius.
- q: >-
    A Kafka Streams job uses exactly_once_v2 and, for each input, calls an external email API before producing an output record. After a crash, some customers receive two emails. Why?
  options: ["exactly_once_v2 is only at-least-once in practice", "Kafka transactions cover Kafka writes and offsets; the aborted attempt's external API call cannot be rolled back and is repeated on retry", "The consumer used read_uncommitted", "Idempotent producers do not work with Streams"]
  answer: 1
  explanation: >-
    EOS makes output records and consumed offsets atomic within Kafka. Side effects outside Kafka happen immediately and are replayed when the transaction aborts and the input is reprocessed. External actions need their own idempotency, such as a key checked by the email service.
- q: >-
    A topic keyed by account_id grows from 12 to 24 partitions while producers are running. What breaks?
  options: ["Nothing; Kafka rebalances existing records", "New records for many accounts go to a different partition than their older records, so per-account ordering across the change is lost and stateful consumers see keys move", "The topic becomes read-only until reassignment completes", "Replication factor is halved"]
  answer: 1
  explanation: >-
    The partition is hash(key) mod N, so changing N moves most keys. Existing records stay where they are. Consumers that keep per-key state or rely on per-key order must be designed for the change, which is why partition counts are chosen with headroom.
- q: >-
    Two consumers in a group subscribe to three topics with five partitions each, using the range assignor. How many partitions does the first consumer get?
  options: ["7", "8", "9", "15"]
  answer: 2
  explanation: >-
    Range assigns each topic separately: 5 partitions over 2 consumers gives 3 to the first and 2 to the second, for every topic. The first consumer gets 3 × 3 = 9 and the second 6. Round-robin would give 8 and 7.
```
