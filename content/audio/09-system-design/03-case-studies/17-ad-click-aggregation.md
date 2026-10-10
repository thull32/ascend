---
lesson: ad-click-aggregation
source: bc0c8838235447a0
fit: great
desk:
  - "The one-click timeline from tap to final firing"
  - "The watermark table and the crash-and-replay table, row by row"
  - "The upsert statement keyed by window"
  - "Exercise: count clicks in event-time windows with a watermark"
---
## Introduction

An advertiser pays you every time someone clicks their ad. Every click is money, and an error in either direction hurts. Undercount and you lose revenue. Overcount and you have billed a customer for clicks that never happened, which is a trust problem and in some places a legal one. Advertisers also want to see clicks within seconds, because they adjust bids live, and the ad server needs near-real-time spend to stop showing ads for a campaign that has run out of budget.

The tension is between fast and exact. A counter that updates in seconds cannot also wait for late data, run a fraud model over a day of traffic, and deduplicate against every click in the past 24 hours. The senior answer is not to pick one. Build two paths that share one immutable log, make each correct for its purpose, and reconcile them.

Three deep dives after the numbers: one click traced end to end, event time and watermarks, and counting each click exactly once, then proving it.

## Requirements and the numbers

Record every click with its ad, campaign, time, location, device and a user key. Aggregate per ad per minute, by country and device, plus the top ads in the last minute. Feed budget pacing within seconds. And produce billing-grade daily counts, deduplicated, with fraudulent clicks removed, auditable. Dashboards within about 30 seconds of the click. The real-time path accepts clicks up to 5 minutes late; the billing path up to 48 hours.

A billion clicks a day is about 11,600 a second, and 58 thousand at a fivefold peak. At about 200 bytes each, that is small for Kafka; 64 partitions are chosen for consumer parallelism, not throughput. Raw clicks compress to about 40 gigabytes a day as columnar files, 15 terabytes a year, so keeping the audit trail for years is cheap. Window state is about 115 megabytes. Hardware is a handful of machines, sized by state and recovery speed, not CPU.

Now the number that changes the design: pacing. A campaign paying a dollar a click on a live-event ad draws a thousand clicks a second. If the ad server learns about spend 30 seconds late, it has spent 30 thousand dollars it did not know about. So pacing does not wait for minute windows. It reads the raw stream with a running counter, pushes totals to the ad server every one to two seconds, and stops at about 95 percent of budget. That bounds the blind spot on that campaign to about 2 thousand dollars, which the 5 percent margin absorbs.

## The architecture in words

The click itself is a redirect. The ad links to your click server, which checks a signed token carrying the impression ID and ad ID, logs the click asynchronously, and sends the user to the landing page. The landing URL comes from the ad's metadata, never from a query parameter, or your click server becomes an open redirect for phishing.

The click server is stateless, runs in every region, and appends to Kafka with an idempotent producer. If Kafka is unreachable, it spools to local disk rather than dropping or blocking the redirect. The raw topic is partitioned by impression ID, so every duplicate of a click lands on the same partition and dedupe needs no shuffle. Keying by ad instead would put a viral ad's entire traffic on one partition.

Three consumers read that topic. The fast path, a Flink-class stream job, dedupes, windows by event time, and upserts minute aggregates into an OLAP store, Pinot or Druid class, which can scan 30 days of a campaign grouped by country and device while 25 thousand upserts a second arrive. Pacing keeps its running counters. And the billing path lands hourly Parquet files for a daily batch job with the full fraud model, which writes the billing database and feeds reconciliation.

## One click, and the early firing

A user taps an ad at 41 seconds past ten. The redirect returns in about 100 milliseconds, mostly the mobile round trip; the server itself spends about one millisecond. Kafka makes the event durable on its in-sync replicas within about 20 milliseconds. The stream task fetches it, checks the impression ID against its seen set, finds it new, and stores it for an hour. The event is re-keyed by ad, and the count for that ad, that minute, that country and device goes up by one.

At 10:00:50 the job emits a partial count, 342, marked not final. The OLAP store makes it queryable within a second or two, and the dashboard's next poll shows it: the click is visible 10 to 20 seconds after the tap. At 10:01:30 the watermark passes the end of the minute, and the job writes the final count, 412. Five minutes after that, state for the minute is dropped. And 48 hours later, the batch job computes the billing count over the whole day, late clicks included, and replaces the real-time rows.

[pause]

Here is the design point people miss. Why emit that partial count at all? With a 30-second watermark bound, a click at one second past ten would not appear until 10:01:30, 89 seconds later, which breaks the 30-second freshness target. Partial counts on a processing-time trigger, plus a final count on the watermark, give you both freshness and completeness.

One edge case. The redirect returns before the event is durable, so a click server that crashes loses its producer buffer: about 10 clicks per crash at this rate. You can write each click to a local file before answering, at the cost of a disk write on the redirect. Most designs accept the small loss and make it visible by reconciling click-server request logs against the topic.

## Event time, watermarks and late clicks

A click at 10:00:58 belongs to the ten o'clock minute, even if the job sees it at 10:01:05, or at 10:40 after a regional mirror lagged. Count by processing time instead, and after a 20-minute outage, the whole backlog lands in the recovery minute: a false spike with empty minutes before it.

But when is a minute complete? The job never knows. A watermark is its declared assumption: "I have seen everything up to time W." Here W is the maximum event time seen minus 30 seconds. So the ten o'clock window fires its final count once an event stamped 10:01:30 or later shows up. Not on the wall clock.

A click that arrives out of order before the watermark passes is counted normally. One that arrives within the 5 minutes of allowed lateness corrects the count, and the window is re-emitted. One that arrives later still goes to a late-clicks topic for the batch path. The bound is a trade: 30 seconds means final results at least 30 seconds behind; 5 seconds fires sooner and diverts more clicks. Measure the arrival-delay distribution and set the bound at the percentile you can afford to divert.

[pause]

And the classic incident: dashboards freeze every night at three in the morning while clicks still arrive. Why? An operator's watermark is the minimum across its input partitions. One partition from a quiet region receives nothing, holds the minimum back, and no window fires anywhere. An idleness timeout excludes silent partitions, and watermark lag, wall clock minus watermark, is the alert.

## Counting once, then proving it

Exactly-once delivery does not exist across a network. The target is an exactly-once effect, and duplicates come from four places. The user double-clicks: policy says one billable click per impression, so dedupe on impression ID. The producer retries after a timeout: the idempotent producer's sequence numbers let the broker drop the copy. The job restarts: state and offsets are checkpointed together, so the job's state is exactly-once. And the sink: replayed events re-emit results already written.

The lesson simulated that last one. A minute's true count is 412. The job checkpoints after emitting 202, emits 278 ten seconds later, then crashes and replays from the checkpoint. A sink that adds increments ends at 488: the 76 clicks between the checkpoint and the crash counted twice, and nothing flags it. A sink that upserts the absolute count, keyed by window, ends at 412. The replay is invisible. That is why the OLAP key is the window itself.

The alternative for a Kafka sink is transactions: commit output and offsets together. The price is latency, because readers see output once per checkpoint, so a 60-second checkpoint interval adds up to 60 seconds to every result. The upsert sink needs no transaction.

Now, why can the stream never be the billing system? Fraud detection needs a day of context. Lateness has a long tail. And an invoice must be recomputable from immutable inputs by a versioned, deterministic job. So the batch path is authoritative for money, and once a day closes, its numbers overwrite the real-time rows.

Reconciliation compares the two per campaign per hour against an expected gap. Illustratively, for 120 thousand streamed clicks, batch dedupe removes 0.3 percent, fraud filtering 3.1, and late arrivals add 0.4, so the stream should run about 3 percent higher. Alert when the stream falls below batch by more than 1 percent, because it is losing events, or when one campaign's gap jumps far from its history: a fraud attack or a dedupe bug.

## In the interview

Why not just increment a Redis key per ad per minute?

[pause]

It keeps up at 58 thousand a second, but an increment is not idempotent, so every retry and replay double-counts, as the simulation shows. There is no dedupe, windows follow arrival time, a failover can lose recent increments, and there is no replayable source of truth. Put the immutable log first and derive every counter from it. "Redis is fast enough" answers the wrong question.

And: how do you convince an advertiser the invoice is right? Reproducibility: an immutable, retained click log, a versioned batch job that recomputes any day to the same number, click-level reports on request, documented invalid-traffic rules, and a reconciliation history showing the two paths agreeing within the expected gap. "We use exactly-once processing" is a mechanism, not evidence.

## Recap

Five things to remember. Two paths on one immutable log: the stream for dashboards and pacing, the daily batch for billing, reconciled against an expected gap. Window on event time; early firings give freshness and the watermark gives completeness; idle partitions freeze watermarks. Duplicates come from the user, the producer, the job and the sink, and the sink must write absolute counts keyed by window. Give pacing its own path, because 30 seconds of latency is real money. And make policy explicit where technology cannot decide: billable clicks, late cut-offs, and which number the advertiser sees.

At your desk: the one-click timeline, the watermark and crash tables, the upsert statement, and the windowed-count exercise.
