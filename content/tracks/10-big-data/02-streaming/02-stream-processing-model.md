---
slug: stream-processing-model
title: "The stream processing model: event time, windows, watermarks and late data"
description: Why streams must be computed in event time, how tumbling, sliding and session windows assign events, how watermarks decide when a window is complete, and what to do with data that arrives after that.
minutes: 28
difficulty: hard
tags: [big-data, streaming, event-time, windowing, watermarks, late-data, flink, spark-structured-streaming]
---
You are asked for plays per title per minute: a live dashboard for the operations team, and the same numbers, later, for partner reporting. The obvious implementation keeps a counter per title, adds one for every event that arrives, and emits the counters every minute on the wall clock. It is wrong in three ways that only show up in production. A phone on a flight buffers forty plays and uploads them three hours later, so they are counted in the wrong minute. A consumer outage of twenty minutes is followed by a catch-up where twenty minutes of events are processed in two, so the dashboard shows a flat line and then a tenfold spike that never happened. And rerunning the job over the same input gives different answers each time, because the answer depends on when the events were processed.

The fix is to compute on **event time**, the time something happened, rather than **processing time**, the time your code saw it. That choice immediately raises a hard question: if events can arrive late and out of order, when is the minute from 10:04 to 10:05 finished? The answer, shared by Flink, Beam/Dataflow, Kafka Streams and Spark Structured Streaming, is a small set of concepts: windows, watermarks, triggers and a policy for late data.

## Two clocks

| Clock | Set by | Properties |
|---|---|---|
| Event time | The device or service where the event happened, stamped into the record | Deterministic: replaying the same input gives the same windows. Arrives out of order. |
| Ingestion time | The broker or source operator on arrival | Monotonic per source, still decoupled from processing speed, but wrong for buffered or delayed events. |
| Processing time | The operator's wall clock when it handles the record | Simplest and lowest latency; results depend on load, outages and replays. |

The gap between event time and processing time is not a constant. It is a distribution with a long tail: most events arrive within a second or two, some within minutes (mobile networks, retries), a few within hours or days (offline devices, a partner's batch upload). Every design decision in this lesson is about where on that tail you stop waiting.

Processing time is still the right choice in a few cases: operational metrics about the pipeline itself ("records processed per second"), alerting where a late answer is useless, and anything where "now" is genuinely the question. For business facts ("how many plays happened between 10:04 and 10:05"), it is not.

## Windows: turning an infinite stream into finite groups

An aggregation over an unbounded stream needs boundaries. A **window assigner** maps each event, by its event time, to one or more windows.

- **Tumbling** windows have a fixed size and do not overlap. An event at time `t` belongs to the window starting at `t - (t mod size)`. With 60-second windows, an event at 10:04:37 belongs to [10:04:00, 10:05:00).
- **Sliding** (hopping) windows have a size and a slide. With size 10 minutes and slide 1 minute, each event belongs to 10 windows, so state and output are 10 times larger than for a tumbling window. Use them for "moving averages" that update smoothly.
- **Session** windows are defined by gaps: events for a key closer together than the gap merge into one session, which closes after the gap passes with no events. The window's size is data-driven, and a late event can merge two sessions into one.

```viz
{"type": "system", "scenario": "stream-windowing", "requests": 12,
 "title": "Tumbling, sliding and session windows over the same events",
 "caption": "Tumbling windows put each event in exactly one bucket; sliding windows count each event in size/slide buckets; session windows grow while events keep arriving within the gap. All three need to know when a window is complete."}
```

State is proportional to (open windows × keys). A tumbling one-minute window over 50,000 titles with a few minutes of allowed lateness keeps a few hundred thousand counters; a 24-hour sliding window with a 1-minute slide over 10 million users keeps 1,440 windows per user and will not fit anywhere. For long sliding windows, aggregate into small tumbling panes (one per slide) and combine panes at query time.

## Watermarks: deciding that a window is complete

A **watermark** is a timestamp that flows through the pipeline with the data, carrying an assertion: "no more events with event time earlier than W are expected." When the watermark passes the end of a window, the window is considered complete and fires.

A **perfect** watermark is possible only when you know the input's ordering (for example, a single log file written in time order). Everything else uses a **heuristic** watermark. The common one is **bounded out-of-orderness**:

$$ W = \max(\text{event time seen so far}) - \text{bound} $$

With a bound of 30 seconds, once the source has seen an event stamped 10:05:30, it declares that nothing before 10:05:00 is still coming, and the [10:04, 10:05) window fires.

```viz
{"type": "system", "scenario": "watermarks",
 "title": "A watermark with a 2-second bound over out-of-order events",
 "caption": "The watermark trails the largest event time seen by the bound. Out-of-order events that are still ahead of the watermark are counted; the window fires when the watermark passes its end, and anything for that window arriving afterwards is late."}
```

The watermark bound is a direct dial between **latency** and **completeness**. Measure the lateness distribution before choosing it: if 99.9% of events arrive within 40 seconds of their event time, a 60-second bound fires every window a minute after it closes and misses about one event in a thousand, which you can then handle explicitly. A 10-minute bound would catch nearly everything and make the live dashboard ten minutes stale.

### Watermarks across partitions

A source reading a Kafka topic tracks a watermark **per partition**, and every operator's watermark is the **minimum** of its inputs' watermarks. This is correct (the slowest input determines what is complete) and it produces two classic incidents:

- **The idle partition.** One of 64 partitions receives no events (a region is quiet at night, a key range is empty). Its watermark never advances, so the minimum never advances, so **no window fires anywhere**. The job looks healthy, consumes everything, and emits nothing. Engines provide an idleness timeout that excludes a silent partition from the minimum after a while; configure it.
- **The skewed clock.** A device with its clock set a year ahead emits an event stamped in the future. The maximum event time jumps, the watermark jumps with it, and every legitimate event from then on is "late." Validate and clamp event times at ingestion (for example, reject or re-stamp events more than a few minutes in the future relative to ingestion time).

## Late data: drop, update or divert

An event whose window has already fired is **late**. You have four options, and a mature pipeline often uses more than one:

1. **Drop it** (the default in Flink and Spark). Count what you drop; an unmeasured drop rate is silent data loss.
2. **Allowed lateness**: keep window state for an extra period after firing, and on each late event emit an **updated** result. The sink must accept updates, which means upserts keyed by (window, key), not appends.
3. **Side output**: route too-late events to a separate stream that a correction job or a batch reconciliation consumes.
4. **Recompute in batch**: let the nightly batch job over the complete data produce the authoritative numbers, and treat the stream as a fast estimate. That is the lambda architecture, discussed in [lambda vs kappa](/learn/big-data/streaming/lambda-vs-kappa).

The fuller model, from Google's Dataflow work, separates the questions: **what** is computed (the aggregation), **where** in event time (the windows), **when** in processing time results are emitted (**triggers**: early speculative results every 10 seconds, an on-time result at the watermark, late updates afterwards), and **how** successive results relate (discarding, accumulating, or accumulating with retractions of the previous value). A live dashboard wants early firings and accumulation; a billing sink wants exactly one final value per window.

## The same query in two engines

Flink SQL declares the watermark on the source table and uses a windowing table function:

```sql
CREATE TABLE plays (
  title_id  BIGINT,
  user_id   BIGINT,
  event_ts  TIMESTAMP(3),
  WATERMARK FOR event_ts AS event_ts - INTERVAL '30' SECOND
) WITH (
  'connector' = 'kafka',
  'topic' = 'playback-events',
  'properties.bootstrap.servers' = 'kafka-1:9092',
  'properties.group.id' = 'plays-per-minute',
  'scan.startup.mode' = 'group-offsets',
  'format' = 'json'
);

SELECT window_start, window_end, title_id, COUNT(*) AS plays
FROM TABLE(TUMBLE(TABLE plays, DESCRIPTOR(event_ts), INTERVAL '1' MINUTE))
GROUP BY window_start, window_end, title_id;
```

Spark Structured Streaming expresses the bound with `withWatermark`:

```python
from pyspark.sql import functions as F

per_minute = (
    plays                                              # a streaming DataFrame read from Kafka
    .withWatermark("event_ts", "30 seconds")           # state for older windows can be dropped
    .groupBy(F.window("event_ts", "1 minute"), "title_id")
    .count()
)
query = (per_minute.writeStream
         .outputMode("append")                         # emit each window once, after the watermark passes it
         .format("parquet")
         .option("checkpointLocation", "s3://checkpoints/plays-per-minute/")
         .option("path", "s3://warehouse/plays_per_minute/")
         .start())
```

The output mode is the "how" question in Spark's vocabulary: `append` emits a window once when it is final (good for files), `update` emits changed rows on every micro-batch (good for upsert sinks and dashboards). Kafka Streams expresses the same idea as a window **grace period**, after which a window accepts no more records.

## A worked example

Size 10 seconds, bound 2 seconds. Events arrive in this order as (event time, key): (1, a), (4, a), (9, b), (3, a), (12, a), (7, b), (15, a), (2, a).

| Arrival | Event | Max seen | Watermark | Action |
|---|---|---|---|---|
| 1 | (1, a) | 1 | −1 | [0,10): a=1 |
| 2 | (4, a) | 4 | 2 | [0,10): a=2 |
| 3 | (9, b) | 9 | 7 | [0,10): b=1 |
| 4 | (3, a) | 9 | 7 | Out of order, but its window ends at 10, which is still ahead of the watermark (7), so it counts: a=3 |
| 5 | (12, a) | 12 | 10 | [10,20): a=1; watermark reaches 10, so [0,10) fires: a=3, b=1 |
| 6 | (7, b) | 12 | 10 | Window [0,10) already fired: late |
| 7 | (15, a) | 15 | 13 | [10,20): a=2 |
| 8 | (2, a) | 15 | 13 | Late |

At end of input the watermark advances to infinity and [10,20) fires with a=2. The true count for [0,10) was 6; the pipeline reported 4 and flagged 2 late events. With a bound of 6 seconds the watermark would have been 9 when (2, a) arrived, both stragglers would have counted, and every result would have been 4 seconds later. That is the whole trade-off in one table.

Note row 4: an event is late only if its **window** has already fired, not merely because it is older than the latest event. Out-of-order is normal; late is a policy outcome.

## Exercise

```exercise
id: tumbling-window-watermark
title: Tumbling-window counts with a watermark and late events
prompt: |
  Count events per key in tumbling event-time windows.

  - `events` is a list of `[event_time, key]` in arrival order (integers and strings).
  - Window `[s, s + size)` contains event times with `s <= t < s + size`,
    where `s` is a multiple of `size`.
  - The watermark is `(largest event time seen so far) - max_delay`; before
    any event it is minus infinity.
  - A window fires as soon as the watermark is `>=` its end. When it fires,
    emit `[window_start, key, count]` for each key in that window, keys in
    sorted order. If several windows fire at once, emit them by window start.
  - An event whose window end is `<=` the watermark when it arrives is late:
    do not count it; append `[event_time, key]` to the late list. (A window
    that never received an event can still be "passed" by the watermark.)
  - At the end of the input the watermark becomes infinite, so every
    remaining window fires.

  Return `{"results": [...], "late": [...]}`.
languages: [python, javascript]
entry: tumbling_counts
starter:
  python: |
    def tumbling_counts(events, size, max_delay):
        results, late = [], []
        # your code here
        return {"results": results, "late": late}
  javascript: |
    function tumbling_counts(events, size, max_delay) {
      const results = [], late = [];
      // your code here
      return { results, late };
    }
tests:
  - args: [[[1, "a"], [4, "a"], [9, "b"], [3, "a"], [12, "a"], [7, "b"], [15, "a"], [2, "a"]], 10, 2]
    expected: {"results": [[0, "a", 3], [0, "b", 1], [10, "a", 2]], "late": [[7, "b"], [2, "a"]]}
    label: the worked example
  - args: [[[1, "a"], [4, "a"], [9, "b"], [3, "a"], [12, "a"], [7, "b"], [15, "a"], [2, "a"]], 10, 6]
    expected: {"results": [[0, "a", 4], [0, "b", 2], [10, "a", 2]], "late": []}
    label: a larger bound catches the stragglers
  - args: [[[0, "x"], [5, "x"], [10, "x"], [25, "y"]], 10, 0]
    expected: {"results": [[0, "x", 2], [10, "x", 1], [20, "y", 1]], "late": []}
    label: in-order input fires each window as the next begins
  - args: [[], 10, 5]
    expected: {"results": [], "late": []}
    label: empty stream
  - args: [[[9, "k"], [21, "k"], [10, "k"], [19, "j"], [9, "k"]], 10, 1]
    expected: {"results": [[0, "k", 1], [20, "k", 1]], "late": [[10, "k"], [19, "j"], [9, "k"]]}
    hidden: true
    label: late for a window that never opened
  - args: [[[3, "b"], [1, "a"], [2, "c"], [30, "a"]], 10, 5]
    expected: {"results": [[0, "a", 1], [0, "b", 1], [0, "c", 1], [30, "a", 1]], "late": []}
    hidden: true
    label: several keys fire together in sorted order
hints:
  - "Keep a map from window start to a map of key to count, plus the current watermark."
  - "For each event: compute its window start `t - t % size`; if `start + size <= watermark` it is late. Otherwise count it, update the watermark, then fire every open window whose end is `<=` the watermark, in order of start."
  - "Use `float('-inf')` in Python and `-Infinity` in JavaScript for the initial watermark, and fire everything that remains at the end."
```

## Senior signals

- You insist on **event time** for business metrics and can explain the three failures of processing time: misplaced delayed events, catch-up spikes and non-reproducible results.
- You choose the watermark bound from a **measured lateness distribution** and state it as a latency–completeness trade-off, not a magic number.
- You know an operator's watermark is the **minimum over its inputs**, and you configure idleness handling and clamp future timestamps before they stall or poison the pipeline.
- You never drop late data silently: you **count** it, and choose between allowed lateness with upserts, a side output, or batch correction.
- You match **triggers and output modes** to the sink: early accumulating results for dashboards, one final value for billing, and upsert-capable sinks whenever results can change.
- You estimate **window state** as open windows × keys and avoid long sliding windows with small slides.

## Check yourself

```quiz
- q: >-
    A consumer was down for 20 minutes, then caught up in 2 minutes. A processing-time one-minute count shows zero for 20 minutes and then two huge spikes. What does an event-time count show?
  options: ["Zero for every minute, because the events are all late", "The same spikes, because the events were processed then", "Correct per-minute counts for the outage, emitted late", "A gap and one spike, since windows close on the wall clock"]
  answer: 2
  explanation: >-
    Event-time windows place each event by when it happened, so the backlog fills the right minutes. As long as the watermark was not advanced past those minutes while the consumer was down (it was not, because no events arrived), the windows fire correctly during catch-up, just later in wall-clock time. Closing windows on the wall clock is exactly what event time does not do.
- q: >-
    A Flink job reads a 32-partition topic. After a deploy, it consumes normally but emits no window results at all. Two partitions currently receive no traffic. What is the most likely cause?
  options: ["The window size is too small for the traffic to fill a window", "Late events are being dropped because the bound is too tight", "The checkpoint interval is too long, so windows never commit", "The idle partitions hold the operator's minimum watermark back"]
  answer: 3
  explanation: >-
    Watermarks combine by minimum over partitions, so a partition with no events never advances it and holds the whole operator's watermark back; no window ever fires. An idleness timeout marks silent partitions idle so they are excluded. Dropping late data would reduce counts, not eliminate all output.
- q: >-
    Your 99.9th-percentile event delay is 45 seconds and the dashboard must be within 2 minutes of real time. Which watermark bound is most defensible?
  options: ["0 seconds, dropping every event that arrives out of order", "About 60 seconds, and divert the ~0.1% that arrive later", "About 15 minutes, so that almost no events are ever late", "No watermark at all; window on processing time instead"]
  answer: 1
  explanation: >-
    A bound just above the measured tail meets the freshness requirement and loses about one event in a thousand, which you count and handle with a side output or correction. Zero drops all out-of-order data; 15 minutes violates the freshness requirement; processing time gives wrong windows.
- q: >-
    A device with a clock one year in the future sends an event into a bounded out-of-orderness pipeline. What happens next?
  options: ["Only that device's own key and windows are affected", "The watermark jumps a year and real events become late", "The event is dropped as late and nothing else changes", "Nothing, because the watermark ignores outlier timestamps"]
  answer: 1
  explanation: >-
    The watermark is derived from the maximum event time seen, so a single future timestamp drags it forward. Every window up to the future time fires and almost all subsequent legitimate events become late, for every key, not just that device's. Validate or clamp event times against ingestion time at the source.
- q: >-
    You need a one-hour sliding window updated every minute for 5 million users. Why is this expensive, and what is a common mitigation?
  options: ["The watermark is the expensive part; raise its bound instead", "Sliding windows cannot be used with event time; use session windows", "Each event joins 60 windows; combine 60 one-minute panes", "It is not expensive because windows share state automatically"]
  answer: 2
  explanation: >-
    With size/slide = 60, every event updates 60 windows, multiplying state and output by 60. Pre-aggregating into one-minute tumbling panes stores one partial per minute per user and computes the hour by combining the last 60 partials, which only works for combinable aggregates like sums and counts.
```
