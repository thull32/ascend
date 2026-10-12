---
lesson: stateful-streaming
source: d41213bedcccffc4
---
## 1

A Flink job restores from checkpoint 42 after a crash and reprocesses 50 seconds of Kafka records. Why are per-user counters not double-counted?

A, Kafka transactions stop the source from re-delivering the records. B, the counters are restored to checkpoint 42, before those records. C, Flink deduplicates replayed records using their Kafka offsets. D, RocksDB ignores writes that repeat an earlier key and value.

[think]

The answer is B: the counters are restored to checkpoint 42, before those records.

State and source positions are snapshotted together by the barrier. The counters go back to their values at checkpoint 42, and the sources rewind to the offsets recorded in that same checkpoint. The replayed records are applied to state that has never seen them, so each affects state exactly once. Records are delivered twice, and nothing deduplicates them; their effect is not.

## 2

A job uses Flink's exactly-once Kafka sink with a 2-minute checkpoint interval. Downstream read-committed consumers complain that data arrives in bursts every two minutes. Why?

A, the watermark lags two minutes, so windows fire in batches. B, the Kafka producer lingers for two minutes to fill batches. C, unaligned checkpoints hold output until the barriers catch up. D, transactions commit only when each checkpoint completes.

[think]

The answer is D: transactions commit only when each checkpoint completes.

The two-phase-commit sink pre-commits at the barrier and commits when the checkpoint completes. Until then, read-committed consumers cannot see the records, so each period's output appears all at once. Shorter intervals, or an idempotent upsert sink, reduce the latency. Producer linger is milliseconds, not minutes.

## 3

Checkpoints start timing out whenever a downstream Elasticsearch sink slows down. What is the most likely mechanism, and a reasonable mitigation?

A, source offsets cannot be committed; increase Kafka retention. B, RocksDB compaction is blocked; switch to the heap backend. C, the JobManager is overloaded; add more TaskManagers to share it. D, barriers queue behind full buffers; use unaligned checkpoints.

[think]

The answer is D: barriers queue behind full buffers, so use unaligned checkpoints.

Backpressure fills the network buffers, and barriers travel with the data, so they queue behind it and aligned checkpoints stall. Unaligned checkpoints let barriers overtake in-flight records, storing those records in the snapshot. The slow sink is still the root cause to fix, and adding TaskManagers does not unblock the barriers.

## 4

Checkpoint 42 is incremental, and references an SST file that was uploaded for checkpoint 41. Checkpoint 41 is then discarded, because only one checkpoint is retained. What happens to that file?

A, it is copied into checkpoint 42's directory before checkpoint 41 is removed. B, it is deleted with checkpoint 41, and checkpoint 42 re-uploads it at the next interval. C, it is rewritten by RocksDB compaction, so that checkpoint 42 owns a fresh copy. D, it is kept, because the shared state registry still counts a reference from checkpoint 42.

[think]

The answer is D: it is kept, because the shared state registry still counts a reference from checkpoint 42.

Incremental checkpoints share immutable SST files, and the JobManager reference-counts them; a file is deleted only when no retained checkpoint points at it. Nothing is copied or re-uploaded, which is the whole saving. Compaction produces new files for future checkpoints, but does not touch files already in durable storage.

## 5

A Kafka Streams instance with a 60 gigabyte state store dies. Recovery takes 10 minutes, during which its partitions make no progress. What reduces this most directly?

A, adding more input partitions to the source topic. B, switching the state store to an in-memory store. C, raising the commit interval, so less of the log is replayed. D, standby replicas that keep a warm copy of the store.

[think]

The answer is D: standby replicas that keep a warm copy of the store.

Without a standby, the new owner rebuilds the store by replaying the changelog, which scales with the store's size, not with the commit interval. A standby replica continuously consumes the changelog on another instance, is already caught up, and can take over in seconds. An in-memory store would still need the full replay.

## 6

A Flink job was started with max parallelism 128, and now needs 200 parallel instances. What is the problem?

A, Flink splits key groups automatically when it rescales. B, only the sources are limited; keyed operators can go to 200. C, only 128 key groups exist, so at most 128 instances own state. D, none: parallelism may exceed max parallelism at any time.

[think]

The answer is C: only 128 key groups exist, so at most 128 instances own state.

Key groups are the atomic unit of keyed state, and they are never split. With 128 of them, more than 128 instances would leave some with nothing. The mapping from key to key group is fixed for the life of the state, so raising max parallelism means discarding or rewriting the state. Choose max parallelism with headroom from the start.
