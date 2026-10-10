---
lesson: stateful-streaming
source: 20d9328ac2dae90a
fit: great
desk:
  - "The checkpoint-42 barrier trace through source, counter and transactional sink, step by step"
  - "The incremental checkpoint table: which SST files are uploaded and which are shared"
  - "The checkpoint configuration block and its version-specific key names"
  - "The Flink versus Kafka Streams comparison and the failure-modes table"
  - "Exercise: plan a rescale with key groups"
---
## Introduction

A sessionisation job keeps, for each of 200 million users, the start time, last event and running totals of their current viewing session. At 3 in the morning, one of its 32 worker machines dies. The job must resume in minutes, with every session intact, without counting any event twice, and without dropping the events that arrived while it was down. On launch day, the same job has to go from 32 workers to 48, and the state has to be split along with the work.

Windows, joins, deduplication and sessionisation are all stateful: the output for an event depends on events before it. Once a stream processor holds state, it is a distributed database with an unusual access pattern, and the hard problems are database problems: where the state lives, how it is made durable, and how it is repartitioned. Those are the three parts of this lesson, plus the question every interviewer asks: why does a replay not double-count?

## Where state lives

Most state is keyed. After a key-by on user id, every event for a user goes to the same operator instance, which keeps that user's state locally. It is a shuffle, like Spark's, except it runs forever. There is also operator state that is not keyed, most importantly a source's current offset in each Kafka partition.

A state backend decides how state is stored. The heap backend keeps Java objects in memory: no serialisation, the lowest latency, but two to five times the serialised size, and garbage collection pauses that scale with it. The RocksDB backend, which is also Kafka Streams' default, keeps an embedded LSM tree on local SSD with a block cache in memory. Every access serialises, and reads may hit disk, but state can be far larger than memory, and checkpoints are incremental. Flink 2 adds a disaggregated backend that keeps working state on object storage with a local cache, for very large state where fast rescaling matters more than per-access latency.

Size it before you choose. 200 million users at about 300 bytes each is 60 gigabytes. On the heap, with object overhead, that is 120 to 300 gigabytes across 32 instances, 4 to 9 gigabytes of heap each, with pauses to match. In RocksDB it is 2 to 4 gigabytes of local SSD per instance, with hot keys served from cache. That is why RocksDB is the default for large state.

## A checkpoint barrier

Flink checkpoints with asynchronous barrier snapshotting, a variant of the Chandy-Lamport distributed snapshot. A marker, the barrier, flows with the data, and every operator snapshots exactly the state produced by records before the marker.

Picture three actors: a Kafka source reading two partitions, one keyed counter, and a transactional Kafka sink. The coordinator triggers checkpoint 42. Each source records its offsets and emits the barrier behind the records it has already sent. The counter receives the barrier on its first input channel first. It now blocks that channel, buffering whatever arrives behind the barrier, and keeps draining the second channel until the barrier arrives there too. That is alignment. Once aligned, the counter snapshots its state, say a equals 3 and b equals 3, forwards the barrier and unblocks. The sink receives the barrier, flushes its open Kafka transaction without committing it, the pre-commit, records "transaction 42 pending" in its snapshot, and acknowledges. When every acknowledgement is in, checkpoint 42 is complete, and the sink commits the transaction.

Now the crash. After checkpoint 42, the counter processes one more a, emits a equals 4 into a new transaction, and its machine dies. Recovery restores the counter to a equals 3, rewinds the sources to the offsets in checkpoint 42, and aborts the open transaction. The same a is read again, a equals 4 is emitted again, and committed once at the next checkpoint.

So, before I say it: why was that record not double-counted?

[pause]

Because state and source offsets were captured in the same consistent cut. The replayed record updated state that had been rolled back to before it was first applied. The record was delivered twice and affected state once, and only one copy of the output was ever committed. That is exactly-once: the effect, not the delivery. The wrong answer is "Flink deduplicates by Kafka offset". It never does.

## Aligned and unaligned

Alignment has a cost. Under backpressure, a slow sink fills the network buffers between itself and the counter, and those back up to the counter's inputs. The barrier on the second channel waits behind every buffered record. Alignment takes as long as the buffers take to drain, checkpoints time out at the 10-minute default, and a job that cannot complete checkpoints replays ever more data at its next failure.

Unaligned checkpoints change that step. When the first barrier arrives, the counter forwards it at once, overtaking the queued records, and writes those in-flight records into the checkpoint alongside its state. Recovery re-injects them first, so the result is identical. The checkpoint completes in roughly the barrier's network transit time, whatever the backpressure, at the price of storing in-flight data, which under heavy backpressure can be gigabytes. A common production setting starts each checkpoint aligned and switches to unaligned only if alignment stalls for 30 seconds.

And remember: unaligned checkpoints let checkpoints complete. They do not cure the slow sink that caused the backpressure. Batch its writes, make it asynchronous, give it more parallelism.

## RocksDB, incremental checkpoints and the arithmetic

RocksDB writes go to an in-memory buffer and are flushed as immutable sorted files, SST files, which background compaction merges into larger ones. Immutability is what makes incremental checkpoints cheap. A checkpoint is the set of files that currently make up the database, and only files not already in durable storage are uploaded.

A registry on the coordinator reference-counts the files. When an old checkpoint is discarded, the files only it used are deleted, and a file still referenced by the newer checkpoint is kept. Nothing is copied or re-uploaded; that is the whole saving. The savings are not uniform, though. A compaction that rewrites a 10-gigabyte level produces 10 gigabytes of new files for the next checkpoint, even though the logical state barely changed.

State also needs an end. Set a time to live on keyed state, so a compaction filter drops expired entries as files merge. And bound your joins: "join within 10 minutes" costs 10 minutes of both streams; "join ever" costs everything.

Now the numbers that tell you whether a design holds. Replay after failure is up to one interval plus restart. At a 60-second interval, a 45-second restart and 200 thousand events a second, that is about 21 million events to reprocess. A full snapshot of 100 gigabytes every minute is 1.7 gigabytes a second of sustained upload; incremental uploads are typically a few gigabytes a minute for that job. Downloading 100 gigabytes on recovery across 32 machines takes about 16 seconds; on one machine, over 8 minutes. Keep the interval at least three to five times the checkpoint duration, with a minimum pause between checkpoints, or the job spends its life checkpointing.

## The sink decides

Checkpoints make state exactly-once. Output emitted after a checkpoint and before a crash is emitted again, so the sink must hide it. Three designs.

An idempotent upsert keyed by window and key, or by event id: the replay overwrites the same rows. No extra latency; it relies on a deterministic key. A two-phase commit, Kafka transactions or Iceberg commits: never visible to committed readers, at up to one checkpoint interval of extra latency. Or at-least-once with reader-side deduplication, which moves the problem to every consumer forever.

Two-phase commit surprises teams twice. Latency: committed readers see a 60-second interval's output in 60-second bursts. If the product needs 5-second freshness, you need a 5-second interval and the upload load that implies, or an idempotent sink. Timeouts: the broker aborts a transaction open too long, and a pre-committed transaction aborted before the recovered job commits it loses its records. After a 20-minute outage, a window of output is simply missing. The producer's transaction timeout must exceed the interval plus the longest downtime you tolerate, and brokers cap it at 15 minutes by default, while Flink's Kafka sink defaults to an hour. Reconcile them deliberately.

## Kafka Streams and rescaling

Kafka Streams reaches the same guarantee without snapshots. Each state store is backed by a compacted changelog topic, and under exactly-once, the changelog writes, the outputs and the input offsets commit in one Kafka transaction every 100 milliseconds. Recovery replays the changelog into a fresh store, so cost is proportional to store size: 50 gigabytes at 100 megabytes a second is over 8 minutes of that task doing nothing. The direct fix is standby replicas, which keep a warm copy on another instance by consuming the changelog continuously, and make failover seconds. Raising the commit interval does not help; the replay is the whole store.

Rescaling. If keys went to instances by hash modulo parallelism, going from 32 to 48 would move almost every key. Flink instead fixes a max parallelism, say 1,024, and hashes every key into one of that many key groups, once and forever. Instances own contiguous ranges of key groups, so on rescale each new instance reads exactly its ranges, typically from one or two old instances' files.

The price: max parallelism is fixed for the life of the state. Start with 128 and at most 128 instances can own state, because key groups are never split, so any more would sit idle; changing it means discarding or rewriting state. Choose it with headroom: 720 divides evenly by many parallelisms, 1,024 by repeated doubling. Rescale through a savepoint, and give every stateful operator a stable id, or a refactor makes the restore fail. In Kafka Streams, the input partition count caps parallelism instead.

## In the interview

A follow-up from the lesson. You need 2-second end-to-end latency and exactly-once into Kafka. What are your options?

[pause]

A checkpoint interval of one to two seconds with a transactional sink, which is expensive in uploads and coordination. Or an idempotent upsert design, which decouples visibility from checkpoints. The wrong answer is "exactly-once with a 60-second interval", which delivers results in minute-long bursts.

And: when would you turn on unaligned checkpoints, and what does it cost? When alignment under backpressure makes checkpoints time out. They store in-flight records, so checkpoints grow with the backlog, and they do not fix the slow operator. "Always, because they are faster" ignores both.

## Recap

Four things to remember. Size state first, keys times bytes, and pick heap or RocksDB from the numbers, with a time to live so it stops growing. A barrier captures offsets, state and a pending transaction in one consistent cut, which is why a replay does not double-count. Exactly-once state is not exactly-once output: the sink decides, by idempotent upserts or two-phase commit, with its latency and timeout rules. And choose max parallelism up front; key groups are never split.

At your desk: the barrier trace, the incremental checkpoint table, the configuration block, the comparison and failure-modes tables, and the key-group rescaling exercise.
