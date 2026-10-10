---
lesson: stream-processing-model
source: 262bc3553a54aa4b
fit: partial
desk:
  - "The four traces: tumbling with allowed lateness, sliding, session merge, and the idle partition"
  - "The triggers and accumulation table across Beam, Flink, Spark and Kafka Streams"
  - "The Flink SQL and Spark versions of the per-minute query"
  - "The production failure-modes and late-data trade-off tables"
  - "Exercise: tumbling-window counts with a watermark and late events"
---
## Introduction

You are asked for plays per title per minute: a live dashboard for operations, and the same numbers later for partner reporting. The obvious version keeps a counter per title, adds one for each event that arrives, and emits the counters every minute on the wall clock. It is wrong in three ways that only show up in production.

A phone on a flight buffers forty plays and uploads them three hours later, so they land in the wrong minute. A twenty-minute consumer outage is followed by a catch-up that processes twenty minutes of events in two, so the dashboard shows a flat line and then a tenfold spike that never happened. And rerunning the job over the same input gives different answers, because the answer depends on when events were processed.

The fix is to compute on event time, when something happened, not processing time, when your code saw it. That raises the hard question: if events arrive late and out of order, when is the minute from 10:04 to 10:05 finished? Flink, Beam, Kafka Streams and Spark all answer with the same small set of ideas: windows, watermarks, triggers, and a policy for late data.

## Three clocks

Event time is stamped by the device or service where the event happened. It is deterministic: replay the same input and you get the same windows. It also arrives out of order. Ingestion time is stamped by the broker or source on arrival, which is ordered per partition but wrong for anything buffered before the broker. Processing time is the operator's wall clock: simplest, lowest latency, and its results depend on load, outages and replays.

The gap between event time and processing time is a distribution with a long tail, not a constant. On a consumer-device pipeline, the median is typically under a second, the 99th percentile tens of seconds, and the 99.9th percentile minutes to hours: offline devices, a partner's batch upload. Measure yours. Every decision in this lesson is about where on that tail you stop waiting.

Processing time is still right for metrics about the pipeline itself, records per second, and for alerting where a late answer is useless. For business facts, plays between 10:04 and 10:05, event time is the only choice that reproduces.

## Windows

A window assigner maps each event, by its event time, to one or more windows. Tumbling windows put each event in exactly one fixed bucket: per-minute counts. Sliding windows have a size and a slide, so a ten-minute window sliding every five minutes puts each event in two windows: moving averages. Session windows open a window of one gap length per event and merge any windows of the same key that overlap or touch: user sessions.

State is open windows times keys. A one-minute tumbling window over 50 thousand titles with two minutes of windows retained is about 100 thousand counters. A 24-hour sliding window with a one-minute slide over 10 million users is 1,440 windows per user, 14 billion counters, and it will not fit anywhere. The trick for sums, counts, minimums and maximums: aggregate into tumbling panes of one slide each, and combine the last panes on output. State drops to one pane per slide per key.

## Watermarks

A watermark is a timestamp that flows through the pipeline in line with the data, carrying a promise: no more events earlier than this are expected. When the watermark passes the end of a window, the window fires.

A perfect watermark only exists when the input order is known. Everything else uses a heuristic, most often bounded out-of-orderness: the watermark is the largest event time seen so far, minus a bound. With a 30-second bound, once the source has seen an event stamped 10:05:30, it declares that nothing before 10:05 is still coming, and the 10:04 window fires.

The bound is a dial between latency and completeness. If 99.9 percent of events arrive within 40 seconds, a 60-second bound fires each window a minute after it closes and misses about one event in a thousand, which you then handle explicitly. A ten-minute bound catches nearly everything and makes the live dashboard ten minutes stale.

Now the point most people miss. Tumbling windows of size 10, a bound of 2. Events have arrived stamped 1, 4 and 9, so the watermark is 7. Then an event stamped 3 arrives. It is older than the latest event. Is it late?

[pause]

No. It is out of order, but its window ends at 10 and the watermark is only 7, so it counts. An event is late only if its window has already fired. Out of order is normal; late is a policy outcome. In the lesson's trace, two stragglers did arrive after the first window fired, so the pipeline reported a count of 3 where the truth was 4, and flagged two late events. With a bound of 6 instead of 2, both would have counted, and every result would have come 4 seconds later.

## Late data, sliding and sessions

Allowed lateness keeps a fired window's state around for a while longer. A late event within that period updates the window and fires it again. In the trace, the window first emitted a count of 3 for key a and 1 for key b, then an update of 2 for b, then an update of 4 for a. The final values are right, but the sink received three results for the same window. It must upsert by window and key; a reader that sums rows sees 7 instead of 4. And events later than the allowed lateness are still dropped, which is why you count and side-output drops even with allowed lateness.

Sliding windows show that lateness is per event and per window. With a ten-wide window sliding by five, an event stamped 8 arriving when the watermark is 10 is late for the window from 0 to 10, which has fired, and on time for the window from 5 to 15, which is still open. Dropped from one, counted in the other.

Sessions are the hardest case. A late event can bridge two sessions that have already fired, so the right answer is one session of five events, not two of two. Producing that means withdrawing two rows a sink has already written, which only a sink with retractions or a keyed upsert plus a "superseded" mechanism can do. The lesson's advice: if sessions matter contractually, recompute them in batch.

## The minimum rule and the idle partition

Each Kafka partition's source generates its own watermark. After a key-by, every window operator receives watermarks from every source, and its own watermark is the minimum of them, because any input might still deliver an older event.

That rule has a famous failure. Two partitions: one keeps advancing to 33, the other goes quiet at 4. The operator's watermark sits at 4. Three windows are complete on the busy partition and cannot fire, because the quiet one might still deliver a 5. This is the idle-partition stall: a job that consumes everything, has zero lag, passes its checkpoints, and emits nothing.

The cure is an idleness timeout, which drops a quiet partition out of the minimum. Then everything fires. But it has an honest cost. Watermarks never move backwards, so when the idle partition wakes up and delivers an event stamped 7, that event is late. Choose the timeout longer than the partition's normal quiet periods, and prefer partition counts that keep every partition busy.

The same rule makes a skewed clock dangerous. One device stamped a year in the future pushes its partition's maximum, then its watermark, then the operator's watermark a year ahead, and every legitimate event, for every key, becomes late. Clamp event times at ingestion: reject or re-stamp anything more than a few minutes ahead of ingestion time.

## Triggers and accumulation

Google's Dataflow model separates four questions. What is computed, the aggregation. Where in event time, the windows. When in processing time results are emitted, the triggers. And how successive results relate, the accumulation mode.

Take that window again: an on-time result of 3, then a late event. Discarding mode emits 1, only the new pane. Accumulating mode emits 4. Accumulating and retracting emits minus 3, then plus 4. Match the mode to the sink. A sink that sums rows needs discarding. A sink that upserts needs accumulating. A downstream aggregation over the results needs retractions, or it double-counts.

So a live dashboard wants early firings and accumulation, and a billing sink wants exactly one final value per window: append mode in Spark, or suppress until the window closes in Kafka Streams.

Two engine details. Flink generates watermarks periodically, every 200 milliseconds by default, not per record, and implements windows as timers plus state keyed by key and window. Spark computes the watermark at the end of a micro-batch and applies it to the next one, so with a ten-second trigger interval, an appended window appears one batch later than the bound alone predicts. And Spark's guarantee is one-sided: rows within the bound always count, rows further behind are only likely to be dropped. Treat the bound as a floor, and reconcile against batch if it matters.

## In the interview

Here is the follow-up the lesson leads with. Why does an operator take the minimum of its input watermarks, and not, say, the average?

[pause]

A watermark is a promise that no older event will arrive on that input. The operator's promise can only be as strong as its weakest input, so the minimum is the only sound choice. The wrong answer is "the maximum, so windows fire faster", which fires windows while a slow input can still deliver into them.

And a practical one: you turned on allowed lateness and totals went up 20 percent. What happened? Each late element re-fired its window with the accumulated result, and an append-only sink now holds several rows per window and key. The sink must upsert, or the trigger must suppress until final. The wrong answer is that Flink double-counted inside the window, which it does not do.

## Recap

Four things to remember. Compute business metrics in event time; processing time misplaces delayed events, invents catch-up spikes, and never reproduces. Choose the watermark bound from a measured lateness distribution, as a trade between latency and completeness. An event is late only when its window has fired, and an operator's watermark is the minimum of its inputs, never moves backwards, and stalls on an idle partition. And never drop late data silently: count it, and match the accumulation mode to the sink.

At your desk: the four traces, the engine comparison table, the Flink and Spark queries, the failure-modes table, and the tumbling-window exercise.
