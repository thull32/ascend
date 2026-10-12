---
lesson: lambda-vs-kappa
source: b5fc8dced756d205
---
## 1

What was the main reason the lambda architecture kept a batch layer as the source of truth?

A, HDFS storage was far cheaper than keeping events in Kafka. B, early stream engines lacked exactly-once state and replay. C, stream processors could not compute aggregations over keys. D, batch jobs finished faster than streams could process data.

[think]

The answer is B: early stream engines lacked exactly-once state and replay.

Early stream processors had no exactly-once state, no event-time semantics and no replay, so their results could not be trusted to be complete or correct. Lambda bounded the damage by recomputing everything in a slow but trustworthy batch system; speed was never batch's advantage. Once stream processors gained durable state, event time and replay, the justification weakened, which is the argument behind kappa.

## 2

You must reprocess 60 days of events that arrived at an average of 50,000 events a second, and you want it done in 12 hours. Roughly what replay rate do you need?

A, about 50,000 events a second. B, about 6 million events a second. C, about 60 million events a second. D, about 600,000 events a second.

[think]

The answer is B: about 6 million events a second.

60 days is 120 times 12 hours, so you need 120 times the live rate: 50,000 times 120 is 6 million events a second. That takes enough partitions for the parallelism, brokers able to serve cold reads, and capacity to rebuild state, which is why large backfills often read from lake tables instead.

## 3

A lambda pipeline counts plays for one title. The batch layer deduplicates by event id, counts plays of at least 60 seconds, and counts 4. The speed layer is at-least-once, counts plays of at least 30 seconds, drops events more than 10 minutes late, and counts 5. Which single change would remove the largest class of drift for good?

A, deduplicating events by event id in the speed layer as well. B, running the same code in batch and streaming modes over the same input. C, moving the batch cut from 2 a.m. to 4 a.m., so more late events land. D, raising the speed layer's lateness bound from 10 minutes to 2 hours.

[think]

The answer is B: running the same code in batch and streaming modes over the same input.

Each individual fix, deduplication, the threshold or lateness, closes one gap and leaves the others to reappear at the next change, because the logic is still implemented twice. One codebase run in two modes removes the drift mechanism itself. Lateness policy is then the only documented, deliberate difference between the estimate and the final number.

## 4

A downstream job consumes the output of a streaming count-per-title aggregation and sums the counts it receives to get a daily total. The totals are far too high. Why?

A, the upstream job is at-least-once, so records are duplicated. B, the watermark is too short, so late events are counted twice. C, the records are updated counts per key, so summing re-adds old values. D, Kafka reordered the records, so updates are applied twice.

[think]

The answer is C: the records are updated counts per key, so summing re-adds old values.

An aggregation turns a stream into a table, and emits the table's changes as each key's count changes. Each record replaces the previous value for its key, so the consumer must treat records as upserts by key. Summing treats updates as independent facts, the classic stream-table duality bug; occasional at-least-once duplicates could not inflate totals this much.

## 5

A changelog contains six records, in order: a 1, b 2, a 3, a tombstone for b, c 4, and a 5. After compaction, but before the tombstone expires, what does the log contain?

A, a 5, b 2, and c 4: the latest non-null value for every key. B, a 5 and c 4, with the tombstone dropped as soon as the cleaner runs. C, the tombstone for b, then c 4, then a 5: each key's last record, in its original position. D, a 1, b 2, and c 4: the first record seen for each key.

[think]

The answer is C: the tombstone for b, then c 4, then a 5, each key's last record in its original position.

The cleaner keeps exactly the latest record per key and leaves it where it was, so the survivors are the tombstone at offset 3, c 4 at offset 4, and a 5 at offset 5. The tombstone stays for a delete retention period, so a lagging reader still sees the delete. It is not replaced by an older value, and first-seen records are precisely what compaction discards.

## 6

Finance needs daily partner numbers that include events arriving up to 48 hours late, while operations wants per-minute numbers within 30 seconds. What design fits best?

A, a streaming estimate plus a batch overwrite two days later, sharing code. B, one streaming job with processing-time windows, so nothing is late. C, two separately written pipelines, merged in the serving layer. D, a single streaming job with a 48-hour watermark for both.

[think]

The answer is A: a streaming estimate plus a batch overwrite two days later, sharing code.

One watermark cannot satisfy both freshness and completeness. A streaming job with a short watermark serves operations, and a batch job over the lake table produces the final daily numbers two days later, overwriting the streaming estimates in one atomic snapshot. Sharing the logic avoids lambda's drift, which is the problem with two separately written pipelines. A 48-hour watermark would make operations wait two days.
