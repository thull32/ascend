---
review: streaming
source: b3a252692121c5de
---
## Introduction

Twelve questions from the streaming module. Answer out loud before the answer comes.

Three on Kafka internals, three on the stream processing model, then two each on stateful streaming, lambda versus kappa, and change data capture. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A topic has replication factor 3 and min in-sync replicas set to 2. The producer uses acks equals all. Two of the three brokers hosting a partition go down. What happens?

A, writes are rejected with a not-enough-replicas error, and reads continue. B, writes continue on the remaining broker, and may be lost later. C, reads and writes both stop until a second replica rejoins. D, Kafka elects an out-of-sync replica so that writes can continue.

[think]

The answer is A: writes are rejected, and reads continue.

With only one in-sync replica, acks-all writes fall below the min in-sync replicas floor and are rejected, choosing consistency over write availability. Consumers can still read already-committed data up to the high watermark, so reads do not stop. Electing an out-of-sync replica only happens with unclean leader election enabled.

## Question 2

A read-committed consumer of a partition stops receiving new records for a minute, even though several producers keep writing and committing normally. What is the most likely cause?

A, the partition's high watermark cannot advance while any transaction is in flight. B, the committing producers are fenced by an older epoch, and their writes are aborted. C, one transactional producer has an open transaction on that partition, holding back the last stable offset. D, the consumer's session timed out, and the partition is being rebalanced away.

[think]

The answer is C: one producer's open transaction is holding back the last stable offset.

The last stable offset is the first offset of the oldest open transaction on the partition, and read-committed consumers only fetch up to it. So one stalled transaction hides every later record, including other producers' committed ones, until it commits or times out. The high watermark advances independently of transactions, and fenced producers fail immediately rather than committing normally.

## Question 3

A consumer group's batches occasionally take 7 minutes to process, and the group keeps rebalancing. What is the most direct cause?

A, auto-commit is disabled, so offsets are never committed in time. B, the session timeout is too short for 7-minute batches. C, there are more partitions than consumers to spread them over. D, batches exceed the max poll interval, so the member is evicted.

[think]

The answer is D: batches exceed the max poll interval, so the member is evicted.

Heartbeats run on a background thread, so the session timeout is not the issue. Failing to call poll within the max poll interval, 5 minutes by default, is, and the evicted member later rejoins and triggers another rebalance. Shrink batches, speed up processing, or raise the interval deliberately; cooperative rebalancing plus static membership reduce the blast radius.

## Question 4

A consumer was down for 20 minutes, then caught up in 2. A processing-time one-minute count shows zero for 20 minutes and then two huge spikes. What does an event-time count show?

A, zero for every minute, because the events are all late. B, the same spikes, because the events were processed then. C, correct per-minute counts for the outage, emitted late. D, a gap and one spike, since windows close on the wall clock.

[think]

The answer is C: correct per-minute counts for the outage, emitted late.

Event-time windows place each event by when it happened, so the backlog fills the right minutes. The watermark was not advanced past those minutes while the consumer was down, because no events arrived, so the windows fire correctly during catch-up, just later in wall-clock time. Closing windows on the wall clock is exactly what event time does not do.

## Question 5

A device with a clock one year in the future sends an event into a bounded out-of-orderness pipeline. What happens next?

A, only that device's own key and windows are affected. B, the watermark jumps a year, and real events become late. C, the event is dropped as late, and nothing else changes. D, nothing, because the watermark ignores outlier timestamps.

[think]

The answer is B: the watermark jumps a year, and real events become late.

The watermark is derived from the maximum event time seen, so a single future timestamp drags it forward. Every window up to that time fires, and almost all later legitimate events become late, for every key, not only that device's. Validate or clamp event times against ingestion time at the source.

## Question 6

Sliding windows of size 10 sliding by 5, with a 2-second bound. An event stamped 8 arrives when the watermark is 10. What happens to it?

A, it is counted only in the window from 0 to 10, because that window matches its timestamp first. B, it is late for the window from 0 to 10, but counted in the window from 5 to 15. C, it is counted in both of its windows, because neither has been cleaned up. D, it is dropped as late, because its timestamp is below the watermark.

[think]

The answer is B: late for the window from 0 to 10, but counted in the window from 5 to 15.

Lateness is decided per window, not per timestamp. The window from 0 to 10 fired when the watermark reached 10, so the event is late for it. The window from 5 to 15 stays open until the watermark reaches 15, so the event counts there. A timestamp below the watermark is not, by itself, a reason to drop an event.

## Question 7

A Flink job restores from checkpoint 42 after a crash and reprocesses 50 seconds of Kafka records. Why are per-user counters not double-counted?

A, Kafka transactions stop the source from re-delivering the records. B, the counters are restored to checkpoint 42, before those records. C, Flink deduplicates replayed records using their Kafka offsets. D, RocksDB ignores writes that repeat an earlier key and value.

[think]

The answer is B: the counters are restored to checkpoint 42, before those records.

State and source positions are snapshotted together by the barrier. The counters go back to their values at checkpoint 42, and the sources rewind to the offsets recorded in that same checkpoint. The replayed records are applied to state that has never seen them, so each affects state exactly once. Records are delivered twice, and nothing deduplicates them; their effect is not.

## Question 8

Checkpoints start timing out whenever a downstream Elasticsearch sink slows down. What is the most likely mechanism, and a reasonable mitigation?

A, source offsets cannot be committed; increase Kafka retention. B, RocksDB compaction is blocked; switch to the heap backend. C, the JobManager is overloaded; add more TaskManagers to share it. D, barriers queue behind full buffers; use unaligned checkpoints.

[think]

The answer is D: barriers queue behind full buffers, so use unaligned checkpoints.

Backpressure fills the network buffers, and barriers travel with the data, so they queue behind it and aligned checkpoints stall. Unaligned checkpoints let barriers overtake in-flight records, storing those records in the snapshot. The slow sink is still the root cause to fix, and adding TaskManagers does not unblock the barriers.

## Question 9

What was the main reason the lambda architecture kept a batch layer as the source of truth?

A, HDFS storage was far cheaper than keeping events in Kafka. B, early stream engines lacked exactly-once state and replay. C, stream processors could not compute aggregations over keys. D, batch jobs finished faster than streams could process data.

[think]

The answer is B: early stream engines lacked exactly-once state and replay.

Early stream processors had no exactly-once state, no event-time semantics and no replay, so their results could not be trusted to be complete or correct. Lambda bounded the damage by recomputing everything in a slow but trustworthy batch system; speed was never batch's advantage. Once stream processors gained those properties, the justification weakened, which is the argument behind kappa.

## Question 10

A downstream job consumes the output of a streaming count-per-title aggregation and sums the counts it receives to get a daily total. The totals are far too high. Why?

A, the upstream job is at-least-once, so records are duplicated. B, the watermark is too short, so late events are counted twice. C, the records are updated counts per key, so summing re-adds old values. D, Kafka reordered the records, so updates are applied twice.

[think]

The answer is C: the records are updated counts per key, so summing re-adds old values.

An aggregation turns a stream into a table, and emits the table's changes as each key's count changes. Each record replaces the previous value for its key, so the consumer must upsert by key. Summing treats updates as independent facts, the classic stream-table duality bug; occasional at-least-once duplicates could not inflate totals this much.

## Question 11

A Debezium connector for a busy Postgres primary has been failing since Friday night. On Monday, the primary's disk is nearly full. Why?

A, the replication slot makes Postgres keep WAL since the last confirmed position. B, Kafka Connect keeps staging copies of tables in the database. C, repeated snapshot retries leave temporary tables behind. D, Debezium stores its offsets and history in the database.

[think]

The answer is A: the slot makes Postgres keep WAL since the last confirmed position.

A replication slot pins the write-ahead log until the consumer confirms it, so days of WAL have piled up; at 20 megabytes a second that is 1.7 terabytes a day. Monitor retained WAL, cap it with a maximum slot WAL size, and page when a connector stops confirming. Debezium keeps its offsets in Kafka Connect, not in the source database.

## Question 12

Deleted titles occasionally reappear in Elasticsearch a day after a search indexer is restarted from an old offset. External versioning is in use. What is the mechanism?

A, the cache invalidator repopulated the index from a stale Redis value. B, external versions compare as strings, so a shorter log position looks newer. C, the index forgot the delete's version after its garbage-collection window, and accepted an old upsert. D, tombstone records are replayed as creates, because their value is null.

[think]

The answer is C: the index forgot the delete's version, and accepted an old upsert.

Elasticsearch keeps a deleted document's version for only 60 seconds by default. A replay that arrives later finds no version to compare against, indexes the stale upsert, and resurrects the row. Soft deletes, or bounding how far back a restarted consumer may replay, prevent it. Tombstones carry no payload to create from, and the cache path never writes to the index.

## Recap

Three ideas kept coming back. First, a single slow or stale participant holds everyone back: an open transaction holds the last stable offset, a quiet or skewed input holds the watermark, a slow sink holds the barriers, and a dead connector holds the WAL. Second, lateness and correctness are decided per window and per key, not per record. And third, delivery is at-least-once almost everywhere, so correctness comes from state restored to a consistent cut, from upserts, and from version-aware sinks.
