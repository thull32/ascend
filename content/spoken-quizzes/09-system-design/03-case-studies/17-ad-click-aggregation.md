---
lesson: ad-click-aggregation
source: 57e4cce587952767
---
## 1

After a 20-minute outage, the stream job recovers and processes the backlog. If its windows use processing time, what goes wrong?

A, the backlog is counted in the recovery minute. B, the 20 minutes of clicks are dropped as too late. C, nothing, since each minute's count comes out the same. D, Kafka rejects the backlog as older than its retention.

[think]

The answer is A: the backlog is counted in the recovery minute.

Processing-time windows assign events by when the job sees them, so twenty minutes of clicks land in the recovery minute: a false spike, with empty minutes before it. Nothing is dropped; it is misattributed. Event-time windows assign each click to the minute it happened.

## 2

The watermark policy is the maximum event time seen, minus 30 seconds. When does the window from 10:00 to 10:01 get its final firing?

A, when 1,000 events for that window have arrived. B, only once the allowed-lateness period has expired. C, at 10:01 on the wall clock of the job's host. D, once an event stamped 10:01 and 30 seconds, or later, is seen.

[think]

The answer is D: once an event stamped 10:01 and 30 seconds, or later, is seen.

The watermark is derived from event times, not from wall-clock time. It reaches 10:01 once the maximum event time seen is 10:01 and 30 seconds. Allowed lateness governs corrections after the final firing, not the firing itself.

## 3

The job checkpoints after emitting a count of 202, emits 278 ten seconds later, crashes, and replays from the checkpoint. The window's true count is 412. What does a sink that adds increments end up showing?

A, 278, because output after the crash is discarded. B, 488, because the 76 clicks after the checkpoint count twice. C, 412, because the checkpoint restores the job's state. D, 202, because the sink rolls back to the checkpoint.

[think]

The answer is B: 488, because the 76 clicks after the checkpoint count twice.

The restored job believes it has emitted 202, so it re-emits the increment for clicks it already reported: 76 of them. The sink is outside the checkpoint, and keeps everything written. An upsert of the absolute count rewrites the same key, and ends at 412.

## 4

With a 30-second watermark bound, a click at one second past 10:00 would first appear on dashboards at 10:01 and 30 seconds. How does the design meet a 30-second freshness target?

A, shrink the bound to 1 second, so windows close almost at once. B, have the dashboards read the raw Kafka topic directly. C, emit partial counts every 10 seconds, and a final one on the watermark. D, switch the windows to processing time, for the dashboard only.

[think]

The answer is C: emit partial counts every 10 seconds, and a final one on the watermark.

Early firings on a processing-time trigger publish the running count while the window is open, and the watermark firing marks it final. A one-second bound would divert every click delayed by more than a second, and processing-time windows misplace clicks after any delay.

## 5

Why is the billing number computed by a daily batch job, rather than taken from the real-time stream?

A, batch jobs are always more accurate than stream jobs. B, the stream is too expensive to run over every click. C, fraud context, late clicks, and reproducible invoices. D, streams can only count approximately at this scale.

[think]

The answer is C: fraud context, late clicks, and reproducible invoices.

Fraud filtering needs a day of context, late clicks have a long tail, and invoices must be reproducible from immutable inputs. Each reason is a property of the billing requirement, not a general claim that batch beats streaming. Reconciliation keeps the two paths honest.

## 6

Dashboards stop updating every night at 3 in the morning, although clicks are still arriving in most regions. What is the most likely cause?

A, the analytics store is compacting segments, and blocks writes. B, clock skew on the click servers stamps events wrongly. C, Kafka's nightly retention sweep deletes the input. D, an idle partition is holding back the job's watermark.

[think]

The answer is D: an idle partition is holding back the job's watermark.

An operator's watermark is the minimum of its inputs' watermarks, so one partition from a quiet region, with no events, stops every window from firing. An idleness timeout excludes silent partitions from the minimum.
