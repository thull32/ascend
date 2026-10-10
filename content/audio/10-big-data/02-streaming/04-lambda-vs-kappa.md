---
lesson: lambda-vs-kappa
source: 54bdd05b55c6e7cf
fit: great
desk:
  - "The lambda and kappa architecture diagrams"
  - "The eight-event trace of batch versus speed layer drift"
  - "The replay-capacity and retention arithmetic tables"
  - "The comparison table of lambda, kappa and stream plus lakehouse, and the failure-modes table"
  - "Exercise: compact a changelog into a table"
---
## Introduction

The real-time dashboard says a title was played 4,812,330 times yesterday. The finance report, from the nightly batch job, says 4,961,208. Both teams are sure they are right. The streaming job drops events more than ten minutes late. The batch job counts everything that landed by 2 in the morning. And the two codebases disagree on whether a play under 60 seconds counts, because a fix went into one of them eight months ago. Meanwhile, someone asks how to correct two weeks of streaming output after a bug in the sessionisation logic.

These are the two questions every streaming architecture must answer: where does the correct answer come from, and how do you recompute history when the logic changes? Lambda and kappa are two answers, and most real platforms end up between them. Underneath both sits one idea, the duality of streams and tables, which also explains change data capture, event sourcing, compacted topics and materialised views.

## Lambda

Lambda, popularised by Nathan Marz from 2011, runs two pipelines over the same input. The batch layer stores every event immutably and periodically recomputes the views from scratch. It is the source of truth: if its logic is wrong, you fix the code and recompute. The speed layer processes only recent events to cover the hours since the last batch run, and its results are allowed to be approximate. The serving layer merges the two at query time.

It made sense for what stream processors could do in 2011. Early engines were at-least-once, had no event-time semantics, kept state in memory with no durable snapshots, and could not replay history. Batch on Hadoop was slow but trustworthy. The reason for the batch layer was never speed; it was trust. Lambda accepted the streaming layer's weaknesses and bounded the damage to a few hours.

Its structural cost is two implementations of the same logic, in two frameworks, which must agree and do not.

## Why the layers disagree

The lesson traces eight plays of one title in the last ten minutes of a day. The batch job deduplicates by event id and counts plays of at least 60 seconds. The speed layer is at-least-once with no deduplication, still counts plays of at least 30 seconds because the threshold change never reached it, and drops events more than 10 minutes late.

Batch counts 4. Speed counts 5. And the difference decomposes exactly. Plus one from a 45-second play that only the speed layer counts: threshold drift. Plus one from a producer retry the speed layer counted twice: no deduplication. Minus one from an offline device that arrived 17 minutes late: the speed layer dropped it.

And one more event, which arrived at half past two the next morning, after the batch cut. Neither layer counted it. So the batch layer is not "the truth"; it is a later cut with a different lateness bound, two hours instead of ten minutes. Every one of these differences is a design decision made twice, separately. That is the argument against lambda in one example.

Which single change removes the largest class of drift for good?

[pause]

Running the same code in batch and streaming modes. Adding deduplication or fixing the threshold closes one gap and leaves the next to reappear at the next change, because the logic is still written twice. One codebase removes the drift mechanism itself.

## Kappa and the replay arithmetic

In 2014, Jay Kreps, one of Kafka's creators, questioned the premise. If the stream processor is correct, with event time, durable state and exactly-once, and the log can be replayed, the batch layer is redundant. Kappa keeps only the streaming path. The log is the source of truth, and reprocessing means running the new version of the job over the log from the beginning.

The procedure: deploy version two with a new consumer group and a new output table, starting from the earliest retained offset. Let it catch up while version one keeps serving. Validate, then switch readers through a view or an alias. Then stop version one. And do not forget consumers of the output topic: their committed offsets mean nothing on the new topic, so they reset by timestamp.

Kappa depends on three things. The job must be deterministic in event time; a lookup against a live service whose answers have changed gives different results on replay, so enrichment data must be versioned, for example as a compacted topic joined as a table. The log must hold enough history. And replay must be fast enough, which is where it usually breaks.

Here is the arithmetic. 30 days at a steady 100 thousand events a second is about 259 billion events. Reprocessing in six hours needs about 12 million events a second, 120 times the live rate. A job that runs on 20 instances live needs the equivalent of about 2,400 for six hours, or it takes 30 days to replay 30 days.

And there is a hard cap. Put that stream on 64 partitions. A replay gets at most one consumer per partition. If each sustains 25 thousand events a second while rebuilding state, the replay tops out at 1.6 million a second, and 30 days takes about 45 hours, not six. Adding partitions does not help: Kafka never moves existing records, so the history stays in the original 64. To go wider, replay from a store that splits more finely, such as a lake table scanned by thousands of tasks.

## Retention arithmetic

Long retention is a disk bill. At 100 thousand one-kilobyte events a second, the topic ingests 100 megabytes a second, which is 8.6 terabytes a day raw, 26 at replication factor 3. Thirty days is 778 terabytes, or about 259 with compression at three to one.

Tiered storage changes the bill. It uploads closed segments to object storage and keeps a day or two on the broker, so 30 days becomes about 86 terabytes of object storage, one copy, because the object store supplies its own redundancy. Two honest caveats. Replay from the remote tier runs at hundreds of megabytes a second per broker, not page-cache speed, and competes with live traffic. And compacted topics were not eligible for tiering, so "keep the latest value per key forever" still lives on local disk.

So, when someone asks why not keep 90 days in Kafka and skip the lake, the answer is the multiplication, rate times days times replication over compression, plus replay throughput capped by partitions. Tiered storage fixes the disk bill, not the replay parallelism. "Disk is cheap" is the answer without the multiplication.

## The stream-table duality

A table is the result of applying a stream of changes in order. A stream is the history of changes to a table. Both directions are mechanical.

Changelog to table, with compaction. Take six records: a equals 1, b equals 2, a equals 3, a delete of b, c equals 4, a equals 5. A null value is a tombstone, a delete. Kafka's log cleaner keeps exactly the latest record per key, in its original position. So the compacted log is the tombstone for b, then c equals 4, then a equals 5. The tombstone survives 24 hours so a lagging reader sees the delete, then goes. Replay either version and you get the same table: a is 5, c is 4. Folding a prefix of the full log gives the table as it was at any offset, which is what event sourcing exploits.

Table to stream, by diffing. Version one is a equals 1 and b equals 2; version two is a equals 3 and c equals 4. The diff is the changelog: update a, delete b, insert c. Debezium computes exactly this from the database's own log.

The trap: an aggregation's output is a changelog. A streaming count per title emits title X 1, then X 2, then X 3. Each record replaces the previous value for its key. A downstream job that sums them reports 6 for a title played 3 times. Consumers of aggregation output must upsert. And no, at-least-once duplicates cannot inflate a total several-fold; this can.

Once you see it, it is everywhere: a database's write-ahead log is a stream and its tables are materialised from it; a compacted topic is a table stored as a stream; a cache is a materialised view you maintain by hand. Kappa's reprocessing is rebuilding a table from its changelog with a new function.

## What platforms actually do

The distinction blurred once the same engines could run both ways. Flink runs the same program in streaming or batch mode, Spark shares its API, and Beam was designed around one model. With lakehouse tables, that gives a common modern shape.

Events flow through Kafka into the streaming job and also into an Iceberg or Delta table in the lake. The streaming job produces low-latency results. Backfills run the same logic in batch mode over the lake table, with unlimited retention and high scan parallelism. And for metrics with contractual weight, billing and partner reports, a batch job over complete data overwrites the streaming results for day T at T plus 1 or T plus 2. The stream is the fast estimate; the batch output is final. Lambda's correctness model, with kappa's single codebase.

The lakehouse table is what makes the overwrite safe. Iceberg commits a new snapshot by swapping a metadata pointer atomically, so the overwrite of day T is one snapshot. A dashboard sees the estimate one moment and the final numbers the next, never a mixture. The cost is small files from frequent commits: a checkpoint every minute is 1,440 commits a day, and compaction jobs to fix them.

## In the interview

A follow-up from the lesson. How do you make the T plus 1 overwrite invisible to dashboard users?

[pause]

Write it as one Iceberg or Delta snapshot that replaces the day's files atomically, so a query sees either the estimate or the final numbers, never both. The wrong answer is "delete the streaming rows, then insert the batch rows", which exposes an empty day in between.

And: is kappa exactly-once end to end when you replay? The job's state is, but the output is a new table. Readers must be switched atomically, and downstream consumers of the output topic must reset offsets by time. "Kafka transactions handle the switch" is the wrong answer.

## Recap

Four things to remember. Name the real problems first: where the correct answer comes from, and how history is recomputed. Lambda drifts because every decision is made twice, so prefer one codebase run in two modes. Do the arithmetic before promising a Kafka replay: history times rate over the time allowed, capped by partitions, which is why large backfills read from the lake. And aggregation output is a table of updates, not a stream of facts, so sinks upsert.

At your desk: the two architecture diagrams, the drift trace, the replay and retention tables, the architecture comparison, and the changelog compaction exercise.
