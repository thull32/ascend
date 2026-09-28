---
slug: stream-processing-model
title: "The stream processing model: event time, windows, watermarks and late data"
description: Why streams must be computed in event time; tumbling, sliding and session windows traced event by event with out-of-order and late data; how a bounded-out-of-orderness watermark advances, propagates through a keyed operator as the minimum of its inputs and stalls on an idle partition; what allowed lateness, triggers and accumulation modes do in Beam, Flink, Spark and Kafka Streams.
minutes: 30
difficulty: hard
tags: [big-data, streaming, event-time, windowing, watermarks, late-data, flink, spark-structured-streaming]
---
You are asked for plays per title per minute: a live dashboard for the operations team, and the same numbers, later, for partner reporting. The obvious implementation keeps a counter per title, adds one for every event that arrives, and emits the counters every minute on the wall clock. It is wrong in three ways that only show up in production. A phone on a flight buffers forty plays and uploads them three hours later, so they are counted in the wrong minute. A consumer outage of twenty minutes is followed by a catch-up where twenty minutes of events are processed in two, so the dashboard shows a flat line and then a tenfold spike that never happened. And rerunning the job over the same input gives different answers each time, because the answer depends on when the events were processed.

The fix is to compute on **event time**, the time something happened, rather than **processing time**, the time your code saw it. That choice raises a hard question: if events arrive late and out of order, when is the minute from 10:04 to 10:05 finished? The answer, shared by Flink, Beam/Dataflow, Kafka Streams and Spark Structured Streaming, is a small set of concepts: windows, watermarks, triggers and a policy for late data. This lesson traces each of them on paper, then shows what Flink does underneath.

## Three clocks

| Clock | Set by | Properties |
|---|---|---|
| Event time | The device or service where the event happened, stamped into the record | Deterministic: replaying the same input gives the same windows. Arrives out of order. |
| Ingestion time | The broker or source operator on arrival (Kafka's `LogAppendTime`, Flink's ingestion-time strategy) | Monotonic per partition, so watermarks are trivial; still decoupled from processing speed; wrong for anything buffered before the broker |
| Processing time | The operator's wall clock when it handles the record | Simplest and lowest latency; results depend on load, outages and replays |

The gap between event time and processing time is a distribution with a long tail, not a constant. On a consumer-device pipeline it is typical to see a p50 under a second, a p99 of tens of seconds (mobile networks, client retries) and a p99.9 of minutes to hours (offline devices, a partner's batch upload). Measure yours: every decision in this lesson is about where on that tail you stop waiting.

Processing time remains right for operational metrics about the pipeline itself ("records processed per second"), alerting where a late answer is useless, and anything where "now" is the question. Ingestion time is a pragmatic middle when producers cannot be trusted to stamp events and freshness within a few seconds is acceptable. For business facts ("plays between 10:04 and 10:05"), event time is the only choice that reproduces.

## Windows: turning an infinite stream into finite groups

A **window assigner** maps each event, by its event time, to one or more windows:

| Window | Assignment for event at `t` | Windows per event | State per key (open windows) | Typical use |
|---|---|---|---|---|
| Tumbling, size `s` | `[t − t mod s, +s)` | 1 | About (bound + lateness) / s | Per-minute counts |
| Sliding, size `s`, slide `d` | Every `[k·d, k·d + s)` containing `t` | `s / d` | `s / d` times tumbling | Moving averages |
| Session, gap `g` | `[t, t + g)`, merged with any overlapping or touching window of the same key | 1, but merges | One per active session | User sessions, incident bursts |

```viz
{"type": "system", "scenario": "stream-windowing", "requests": 12,
 "title": "Tumbling, sliding and session windows over the same events",
 "caption": "Tumbling windows put each event in exactly one bucket; sliding windows count each event in size/slide buckets; session windows grow while events keep arriving within the gap. All three need to know when a window is complete."}
```

State is proportional to open windows × keys. A one-minute tumbling window over 50,000 titles with two minutes of retained windows is about 100,000 counters. A 24-hour sliding window with a one-minute slide over 10 million users is 1,440 windows per user, 14 billion counters, and will not fit anywhere. For long sliding windows over combinable aggregates (sum, count, min, max), aggregate into tumbling **panes** of one slide each and combine the last `s / d` panes on output; the state drops to one pane per slide per key.

## Watermarks: deciding that a window is complete

A **watermark** is a timestamp that flows through the pipeline in line with the data, carrying an assertion: no more events with event time earlier than `W` are expected. When the watermark passes the end of a window, the window fires. A **perfect** watermark exists only when the input's order is known (a single file written in time order). Everything else uses a heuristic, most often **bounded out-of-orderness**:

$$ W = \max(\text{event time seen so far}) - \text{bound} $$

With a bound of 30 seconds, once the source has seen an event stamped 10:05:30 it declares that nothing before 10:05:00 is still coming, and the [10:04, 10:05) window fires.

```viz
{"type": "system", "scenario": "watermarks",
 "title": "A watermark with a 2-second bound over out-of-order events",
 "caption": "The watermark trails the largest event time seen by the bound. Out-of-order events that are still ahead of the watermark are counted; the window fires when the watermark passes its end, and anything for that window arriving afterwards is late."}
```

The bound is a dial between **latency** and **completeness**. If 99.9% of events arrive within 40 seconds of their event time, a 60-second bound fires every window a minute after it closes and misses about one event in a thousand, which you then handle explicitly. A 10-minute bound catches nearly everything and makes the live dashboard ten minutes stale.

## Trace 1: a tumbling window with late events and allowed lateness

Size 10, bound 2. Events arrive as (event time, key): (1, a), (4, a), (9, b), (3, a), (12, a), (7, b), (15, a), (2, a). First with no allowed lateness:

| Arrival | Event | Max seen | Watermark | Action |
|---|---|---|---|---|
| 1 | (1, a) | 1 | −1 | [0,10): a=1 |
| 2 | (4, a) | 4 | 2 | [0,10): a=2 |
| 3 | (9, b) | 9 | 7 | [0,10): b=1 |
| 4 | (3, a) | 9 | 7 | Out of order, but window end 10 > watermark 7, so it counts: a=3 |
| 5 | (12, a) | 12 | 10 | [10,20): a=1; watermark reaches 10, so [0,10) fires: a=3, b=1 |
| 6 | (7, b) | 12 | 10 | [0,10) already fired: **late**, dropped |
| 7 | (15, a) | 15 | 13 | [10,20): a=2 |
| 8 | (2, a) | 15 | 13 | **Late**, dropped |

At end of input the watermark becomes infinite and [10,20) fires with a=2. The true count for [0,10) was a=4, b=2; the pipeline reported a=3, b=1 and flagged two late events. With a bound of 6 the watermark would have been 9 at arrival 8, both stragglers would have counted, and every result would have come 4 seconds later.

Row 4 is the point most people miss: an event is late only if its **window** has fired, not because it is older than the latest event. Out of order is normal; late is a policy outcome.

Now the same input with **allowed lateness 5**: a fired window's state is kept until the watermark reaches `end + 5 = 15`, and a late event within that period updates the window and fires it again, for its key only.

| Arrival | Watermark | Change from the first trace |
|---|---|---|
| 5 | 10 | [0,10) fires as before (a=3, b=1); state retained, cleanup scheduled at watermark 15 |
| 6 | 10 | (7, b): 10 < 15, so counted and re-fired: emits [0,10) **b=2** as an update |
| 8 | 13 | (2, a): 13 < 15, so counted and re-fired: emits [0,10) **a=4** as an update |
| end | ∞ | [0,10) state dropped; [10,20) fires a=2 |

The final values are correct, and the sink received three results for [0,10): (a=3, b=1), then b=2, then a=4. It must **upsert** by (window, key), or a reader summing rows sees a=7, b=3. An event (5, a) arriving after the watermark passed 15 would still be dropped, which is why you count and side-output drops even with allowed lateness.

## Trace 2: sliding windows, late for one window and on time for another

Size 10, slide 5, bound 2, one key. An event at `t` belongs to the two windows `[5⌊t/5⌋ − 5, +10)` and `[5⌊t/5⌋, +10)`. Events: (6), (9), (12), (8), (17).

| Arrival | Event | Watermark | Windows updated | Fires |
|---|---|---|---|---|
| 1 | 6 | 4 | [0,10)=1, [5,15)=1 | – |
| 2 | 9 | 7 | [0,10)=2, [5,15)=2 | – |
| 3 | 12 | 10 | [5,15)=3, [10,20)=1 | [0,10) fires: 2 |
| 4 | 8 | 10 | [0,10) has fired: late for it; [5,15)=4 counts | – |
| 5 | 17 | 15 | [10,20)=2, [15,25)=1 | [5,15) fires: 4 |
| end | – | ∞ | – | [10,20): 2, [15,25): 1 |

Arrival 4 shows that lateness is per (event, window): the same event is dropped from [0,10) and counted in [5,15). Every event costs two state updates, and the output cadence is the slide, not the size.

## Trace 3: session windows merged by a late event

Gap 5, bound 2, key a, events at 1, 4, 12, 14, 25, then a straggler at 9. Each event opens `[t, t + 5)`; windows of the same key that overlap or touch merge.

| Arrival | Event | Watermark | Sessions for a | Fires |
|---|---|---|---|---|
| 1 | 1 | −1 | [1,6) | – |
| 2 | 4 | 2 | [4,9) merges: [1,9) | – |
| 3 | 12 | 10 | [1,9), [12,17) | [1,9) fires: 2 |
| 4 | 14 | 12 | [1,9)✓, [12,19) | – |
| 5 | 25 | 23 | [1,9)✓, [12,19), [25,30) | [12,19) fires: 2 |
| 6 | 9 | 23 | [9,14) touches [1,9) and overlaps [12,19): would merge all into [1,19) | Both fired: **late**, dropped |

Without allowed lateness the pipeline reports two sessions of 2 and drops the event that would have joined them. With allowed lateness large enough that both fired sessions' state is still retained (say 20: cleanup at end + 20 > 23), the merge happens and [1,19) fires with count 5 as an update; the sink must then delete the two earlier session rows, which only a sink with retractions or an upsert keyed by session id plus a "superseded" mechanism can do. With allowed lateness 6, [1,9)'s state (cleaned once the watermark passed 9 + 6 = 15) is gone, so the event merges only with [12,19) and [9,19) with count 3 is emitted next to the surviving [1,9)=2. Session windows plus late data is the hardest combination in the model; if the sessions matter contractually, recompute them in batch.

## Trace 4: watermark propagation and the idle partition

A source subtask per Kafka partition generates its own watermark. After `keyBy`, every window operator instance receives watermarks from every source subtask and its own watermark is the **minimum** over them, because any input might still deliver an older event. Two partitions, bound 2, tumbling size 10:

| Step | p0 sees / W₀ | p1 sees / W₁ | Operator W | Effect |
|---|---|---|---|---|
| 1 | 10 / 8 | – / −∞ | −∞ | Nothing can fire |
| 2 | – | 6 / 4 | 4 | – |
| 3 | 22 / 20 | – | 4 | p1 holds the minimum |
| 4 | 35 / 33 | – | 4 | [0,10), [10,20), [20,30) complete on p0 but cannot fire: p1 might deliver a 5 |
| 5 | – | idle for the idleness timeout | 33 | p1 excluded from the minimum; all three windows fire |
| 6 | – | 7 / 5 (active again) | 33 | Watermarks never regress: the operator keeps 33 and the 7 is late |
| 7 | 45 / 43 | 40 / 38 | 38 | p1 is back in the minimum once its watermark passes 33 |

Step 4 is the **idle-partition stall**: a job that consumes everything, has zero lag, and emits nothing. Step 6 is the honest cost of the cure: an idle partition that wakes up delivers late events. Choose the idleness timeout longer than the partition's normal quiet periods, and prefer partition counts that keep every partition busy.

The same minimum rule makes a **skewed clock** dangerous: a device stamped a year ahead pushes one partition's maximum, then that partition's watermark, then, once the other partitions catch up, the operator's watermark a year ahead, and every legitimate event becomes late. Clamp event times at ingestion (reject or re-stamp anything more than a few minutes ahead of ingestion time).

## Triggers and accumulation: when and how results are emitted

Google's Dataflow model separates four questions: **what** is computed (the aggregation), **where** in event time (windows), **when** in processing time results emit (**triggers**), and **how** successive results relate (**accumulation mode**). Each engine spells them differently:

| Concept | Beam | Flink DataStream | Spark Structured Streaming | Kafka Streams |
|---|---|---|---|---|
| On-time result at the watermark | `AfterWatermark.pastEndOfWindow()` | `EventTimeTrigger` (default) | `append` output mode with `withWatermark` | `suppress(untilWindowCloses(...))` |
| Early (speculative) results | `.withEarlyFirings(AfterProcessingTime…plusDelayOf(10 s))` | `ContinuousProcessingTimeTrigger.of(10 s)` | `update` mode emits changed rows each micro-batch | Default emit-on-update, throttled by the record cache and commit interval |
| Late results | `.withLateFirings(AfterPane.elementCountAtLeast(1))` | `allowedLateness(t)` re-fires per late element | None: late rows are dropped once the watermark passes | Grace period on the window (`ofTimeDifferenceAndGrace`) |
| Accumulation | `discarding`, `accumulating`, `accumulatingAndRetracting` fired panes | Accumulating: window state is kept and the full result re-emitted | `update` is accumulating per row; `complete` re-emits the whole table | Accumulating, as KTable upserts |
| Retractions | Declared, rarely implemented by runners | Not in DataStream windows; Flink SQL emits `-U/+U` changelog rows | No | No, upsert semantics instead |

The modes differ on the [0,10) window from trace 1 when the late (2, a) arrives after the on-time result a=3: **discarding** emits 1 (only the new pane), **accumulating** emits 4, **accumulating and retracting** emits −3 then +4. A sink that sums rows needs discarding; a sink that upserts needs accumulating; a downstream aggregation over the results needs retractions or it double-counts. A live dashboard wants early firings and accumulation; a billing sink wants exactly one final value per window, which is `append` mode in Spark or `suppress` in Kafka Streams.

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

One Spark detail with a visible effect: the watermark is computed at the end of a micro-batch from the maximum event time seen and applied to the **next** batch, so with a 10-second trigger interval a window's `append` row appears one batch later than the bound alone predicts.

## Under the hood: what Flink does with a watermark

- **Generation is periodic, not per record.** `WatermarkStrategy.forBoundedOutOfOrderness(30 s)` keeps the maximum timestamp seen and, every `pipeline.auto-watermark-interval` (200 ms), emits `max − 30 s − 1 ms`. The 1 ms is because Flink's watermark means "no events with timestamp ≤ W", where the traces above use "< W". Between emissions the operator's watermark is whatever was last sent, so the traces' per-event updates are an idealisation of 200 ms steps.
- **Per partition, then minimum.** The Kafka source runs one generator per assigned partition (split) and emits the minimum over its splits; `withIdleness(1 min)` marks a split idle after a minute without records so it drops out of the minimum. Downstream, each operator's input valve tracks a watermark per input channel and emits the minimum over active channels, never a smaller value than it emitted before.
- **Windows are timers plus namespaced state.** After `keyBy`, window contents live in the state backend under (key, window) as the namespace. Assigning an element registers an event-time timer at `window.maxTimestamp()` (end − 1 ms). When a watermark arrives, the timer service (an in-memory heap by default, or RocksDB-backed for very many timers) pops every timer ≤ W and the trigger fires those windows. A second timer at `maxTimestamp + allowedLateness` clears the state.
- **Late check.** An element is late when `window.maxTimestamp() + allowedLateness <= currentWatermark`. It goes to the side output declared with `sideOutputLateData(tag)` or is dropped, and `numLateRecordsDropped` increments. Alert on that metric.
- **Sliding cost is timers too.** Each element registers `size / slide` timers and touches `size / slide` state entries, which is why the pane trick matters in RocksDB, where every access serialises.

The [stateful streaming](/learn/big-data/streaming/stateful-streaming) lesson covers how that state is checkpointed and restored.

## Production failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Idle partition stall | Consumer lag is zero, checkpoints succeed, no window output for minutes | `currentInputWatermark` on the window operator is frozen; one source subtask's watermark is far behind or `-Long.MAX` | `withIdleness` (or `table.exec.source.idle-timeout` in SQL); fewer partitions than always-busy sources; a heartbeat event per partition on low-volume topics |
| Future-clock poisoning | `numLateRecordsDropped` jumps to nearly the input rate and stays there | The maximum event time on one partition is hours or years ahead; find the record by timestamp | Clamp or reject timestamps ahead of ingestion time at the source; restart from a savepoint taken before the poison, or the watermark stays ahead forever |
| Silent under-count | Streaming totals are 0.3% below the batch job, consistently | Late-dropped counter is non-zero; the lateness distribution has moved (a new mobile client buffers longer) | Re-measure the tail; widen the bound or add allowed lateness with an upsert sink; side-output drops into a correction table so the loss is visible |
| Sliding-window state blow-up | Checkpoint size and duration grow with `size / slide`; RocksDB CPU is dominated by serialisation | State entries per key equal `size / slide`; timers per element likewise | Pre-aggregate into one pane per slide and combine on output; shorten the window or lengthen the slide |
| Duplicated rows from allowed lateness | Downstream sums are too high after enabling `allowedLateness` | The sink appends every re-fired result; rows for the same (window, key) accumulate | Upsert by (window, key), or suppress until the window is final and give up on updates |

## Trade-offs: what to do with late data

| Policy | Sink requirement | Latency | Completeness | Complexity |
|---|---|---|---|---|
| Drop, and count drops | Append-only is fine | Bound only | Loses the tail beyond the bound | Lowest; the drop rate must be monitored |
| Allowed lateness with updates | Upsert by (window, key) | Bound for the first result, then updates | Everything within bound + lateness | State retained longer; consumers must handle updates |
| Side output to a correction job | Any, plus a second path | Bound; corrections later | Complete, eventually | Two paths whose results must be reconciled |
| Batch recompute (lambda) | Batch overwrites stream output | Bound for estimates; hours for finals | Complete | Two modes of one codebase, see [lambda vs kappa](/learn/big-data/streaming/lambda-vs-kappa) |

## Interviewer follow-ups

**"Why does an operator take the minimum of its input watermarks rather than, say, the average?"** Model answer: a watermark is a promise that no older event will arrive on that input; the operator's promise can only be as strong as the weakest input, so the minimum is the only sound choice. Common wrong answer: "the maximum, so windows fire faster," which fires windows while a slow input can still deliver events into them.

**"Can a watermark ever move backwards?"** Model answer: no, an operator's emitted watermark is monotonic; when an idle input resumes with a lower watermark, its events are late until it catches up. Common wrong answer: "yes, when a late event arrives," which confuses event timestamps with watermarks.

**"Kafka preserves order per partition. Why do I still need a watermark bound above zero?"** Model answer: `keyBy` merges events from many partitions, whose producers stamp independently, and producers batch and retry, so even one partition is only ordered by append time, not event time. Common wrong answer: "a bound of zero is fine because Kafka is ordered."

**"You turned on allowed lateness and totals went up 20%. What happened?"** Model answer: each late element re-fires its window with the accumulated result, and an append-only sink now holds several rows per (window, key); the sink must upsert or the trigger must suppress until final. Common wrong answer: "late events were double-counted inside the window," which Flink does not do.

## What mid-level engineers get wrong

- Using processing time for business metrics because the code is simpler; every outage becomes a spike and no rerun reproduces.
- Treating out-of-order as late and dropping row 4 of trace 1, under-counting every window that receives any reordering.
- Choosing the watermark bound by feel; a bound below the p99 lateness silently loses a percent of the data.
- Testing with one Kafka partition, then deploying with 64 and never seeing output until someone finds `withIdleness`.
- Sizing a one-hour, one-minute-slide window as if it were tumbling and discovering 60× state at the first checkpoint.
- Writing allowed-lateness updates into Parquet files, then summing them.
- Believing a single clamp on the client fixes clock skew; the clamp belongs where the watermark is generated.

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
- You can trace tumbling, sliding and session windows by hand, including an event that is late for one sliding window and on time for another, and a late event that merges two sessions.
- You know an operator's watermark is the **minimum over its inputs**, that it never regresses, that an idle partition stalls it and that waking it up makes the partition's events late.
- You never drop late data silently: you count `numLateRecordsDropped`, and choose between allowed lateness with upserts, a side output, or batch correction.
- You can map Beam's triggers and accumulation modes onto Flink, Spark and Kafka Streams, and match them to the sink: discarding for summing sinks, accumulating for upserts, retractions for downstream aggregations.
- You estimate **window state** as open windows × keys, know that Flink implements windows as timers plus namespaced state, and avoid long sliding windows with small slides.

## Check yourself

```quiz
- q: >-
    A consumer was down for 20 minutes, then caught up in 2 minutes. A processing-time one-minute count shows zero for 20 minutes and then two huge spikes. What does an event-time count show?
  options: ["Zero for every minute, because the events are all late", "The same spikes, because the events were processed then", "Correct per-minute counts for the outage, emitted late", "A gap and one spike, since windows close on the wall clock"]
  answer: 2
  explanation: >-
    Event-time windows place each event by when it happened, so the backlog fills the right minutes. As long as the watermark was not advanced past those minutes while the consumer was down (it was not, because no events arrived), the windows fire correctly during catch-up, later in wall-clock time. Closing windows on the wall clock is exactly what event time does not do.
- q: >-
    A partition that was marked idle for an hour wakes up and delivers an event stamped ten minutes ago. The operator's watermark is already past that time. What happens?
  options: ["The window is reopened and its result is silently corrected", "The event is buffered until the partition's watermark catches up", "The event is late for its window and is dropped or side-output", "The operator's watermark moves back to include the event"]
  answer: 2
  explanation: >-
    Watermarks are monotonic: the input valve never emits a smaller value than before, and a resumed channel only rejoins the minimum once its watermark passes the current one. The woken partition's older events therefore arrive behind a watermark that has already fired their windows and are treated as late. Nothing buffers or reopens windows unless allowed lateness is configured and still in force.
- q: >-
    Your 99.9th-percentile event delay is 45 seconds and the dashboard must be within 2 minutes of real time. Which watermark bound is most defensible?
  options: ["0 seconds, dropping every event that arrives out of order", "About 60 seconds, and divert the ~0.1% that arrive later", "About 15 minutes, so that almost no events are ever late", "No watermark at all; window on processing time instead"]
  answer: 1
  explanation: >-
    A bound slightly above the measured tail meets the freshness requirement and loses about one event in a thousand, which you count and handle with a side output or correction. Zero drops all out-of-order data; 15 minutes violates the freshness requirement; processing time gives wrong windows.
- q: >-
    A device with a clock one year in the future sends an event into a bounded out-of-orderness pipeline. What happens next?
  options: ["Only that device's own key and windows are affected", "The watermark jumps a year and real events become late", "The event is dropped as late and nothing else changes", "Nothing, because the watermark ignores outlier timestamps"]
  answer: 1
  explanation: >-
    The watermark is derived from the maximum event time seen, so a single future timestamp drags it forward. Every window up to the future time fires and almost all subsequent legitimate events become late, for every key, not only that device's. Validate or clamp event times against ingestion time at the source.
- q: >-
    In a size-10, slide-5 sliding window with a 2-second bound, an event stamped 8 arrives when the watermark is 10. What happens to it?
  options: ["It is counted in [0,10) only, because that window matches its timestamp first", "It is late for the [0,10) window but is counted in the [5,15) window", "It is counted in both of its windows because neither has been cleaned up", "It is dropped as late because its timestamp is below the watermark"]
  answer: 1
  explanation: >-
    Lateness is decided per window, not per timestamp. [0,10) fired when the watermark reached 10, so the event is late for it, while [5,15) is still open until the watermark reaches 15, so the event counts there. A timestamp below the watermark is not by itself a reason to drop an event.
- q: >-
    An on-time result for a window was a=3. A late event for the same key arrives within allowed lateness. Under accumulating-and-retracting semantics, what is emitted?
  options: ["A retraction of 3 followed by a new result of 4", "A single result of 4, replacing the earlier value", "A single result of 1, the count of the late pane alone", "Nothing, because retractions suppress late updates entirely"]
  answer: 0
  explanation: >-
    Accumulating and retracting emits the withdrawal of the previous pane's value and then the new accumulated value, so a downstream aggregation can subtract 3 and add 4. Emitting 1 alone is discarding mode; emitting 4 alone is accumulating mode, which is only safe for a sink that upserts by key.
```
