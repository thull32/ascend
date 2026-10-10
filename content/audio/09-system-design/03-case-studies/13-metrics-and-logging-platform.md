---
lesson: metrics-and-logging-platform
source: 2a369f7d0df5e31e
fit: great
desk:
  - "The estimates table, line by line"
  - "The one-sample trace from scrape to object storage, as a timeline"
  - "The downsampling table and the Bloom filter sizing formula"
  - "Exercise: downsample samples into rollups"
---
## Introduction

Checkout starts failing at nine on a Friday night. Five hundred engineers open dashboards at once, every service starts logging stack traces at three times its normal rate, and the platform that is supposed to explain the outage gets its highest read load and its highest write load in the same minute. If it falls over, the company is debugging blind.

That is the system to design: metrics and logs for 200 thousand containers. The workload is upside down compared with most products. Writes outnumber reads by three orders of magnitude, nothing is ever updated, and the data is only valuable in aggregate. And the platform has to be more available than what it monitors, so it cannot share that system's failure modes.

Three deep dives, after the numbers and the architecture. Why the capacity unit is distinct time series, not requests. How to downsample without lying about averages and percentiles. And whether to index every word of your logs or only their labels.

## Requirements and the numbers

Ask first: how many containers, how many series each, how long to keep raw and rolled-up data, how fresh dashboards must be, and whether logs need full-text search or only filtering.

The answers here: metrics every 10 seconds, 30 thousand alert rules evaluated every 30 seconds, raw metrics kept 15 days and rollups 13 months, so you can compare with last year's peak. Logs hot for 7 days and kept for 90. A metric should reach a dashboard within 30 seconds, and a log line should be searchable within a minute. Ingest must never block the application, because slowing checkout to protect telemetry is worse than losing telemetry. And the platform must survive the loss of the region it monitors.

Now the estimates. 200 thousand containers, about 50 series each, mostly histograms, is ten million active series. Scraped every 10 seconds, that is a million samples a second, flat all day. The peaks come from deploys creating new series, not from traffic.

At about 2 bytes per compressed sample, raw metrics are 173 gigabytes a day. Logs are a different animal: five lines a second per container at 500 bytes is 500 megabytes a second, 43 terabytes a day, and three times that in an incident.

Here are the consequences worth saying out loud in an interview. Logs are 250 times the metric bytes, so the logging tier is where the money goes. Ingester memory scales with series, not samples, so cardinality is the capacity unit. And the 13-month rollup tier is 40 times bigger than the raw tier, which on replicated SSD would cost about 15 times what it costs in object storage. So history lives in object storage.

## The architecture, and one sample through it

In words: an agent on each host scrapes its containers and tails their logs. It pushes compressed batches to an ingest gateway, which handles authentication, per-team limits and cardinality checks. The gateway writes to Kafka, metrics keyed by series hash and logs by stream. Metric ingesters consume from Kafka, append to a write-ahead log, hold two hours in memory, and upload immutable two-hour blocks to object storage. A compactor merges and downsamples those blocks in the background. Queries go through a query frontend to queriers, which read recent data from the ingesters and history from object storage.

Two choices carry the design. First, when the gateway answers 429, over the limit, the agent spools to a bounded local disk buffer and retries. It never blocks the application, and if the buffer fills, it drops the oldest data first. Second, the rule evaluator reads only from the in-memory ingesters. Alerts look at the last few minutes, so an object storage outage degrades dashboards over last month, but paging survives.

Now follow one sample. It is scraped at nine o'clock exactly. The agent holds it in a batch flushed every second or at one megabyte. The gateway takes a couple of milliseconds. Kafka acknowledges it from all in-sync replicas within 5 to 10 milliseconds. Three ingester replicas append it to their write-ahead logs and open chunks within a few hundred milliseconds, and only then commit the Kafka offset. About 1.2 seconds after the scrape, a dashboard can see it.

[pause]

Which step set that freshness? The agent's one-second batch window. Everything else is milliseconds. The 30-second target leaves about 28 seconds of slack for consumer lag, which is why consumer lag is itself an alert. And alert latency is a different number: the evaluation interval plus the rule's waiting period, so a rule that waits two minutes fires two to two and a half minutes after the condition becomes true.

Later, the chunk seals at 120 samples, the two-hour window becomes a block in object storage, and the next day the compactor merges it into a 24-hour block. That is the LSM tree pattern with time as the partition: append to memory backed by a log, flush immutable files, compact in the background, and delete whole blocks at retention.

One edge case. The gateway was down for 15 minutes and the agents now replay their spool. The ingester accepts samples up to 10 minutes older than its newest, so the oldest 5 minutes are rejected as out of order. Size the out-of-order window to the spool, or accept the gap and count the rejections.

## Cardinality and honest downsampling

Cardinality is multiplicative. Take a latency histogram labelled by service, endpoint, method, status, pod, and bucket. Its upper bound is 300 services times 20 endpoints times 2 methods times 5 statuses times 30 pods times 12 buckets: 21.6 million series. That one metric exceeds the whole platform's 10 million budget. Add a user ID label with a million values and you multiply by a million.

The controls, cheapest first. Admission limits per team and metric: the gateway rejects new series over the limit but keeps accepting samples for existing ones, so dashboards keep working and the failure lands on the team that caused it. Aggregate before storing: summing across pods and dropping the pod label divides the bound by 30. Put identity in logs and traces, priced per event, and use exemplars to link a latency bucket to a trace. And watch churn: pod names change on every deploy, so a fleet redeploy inside the two-hour window holds both generations, twice the series and twice the memory, while the active count on the dashboard looks unchanged.

Now downsampling. A queue-depth gauge has six samples in most minutes, but four scrapes failed in one minute, which spiked, so it has only two samples, averaging 105. Average the five minute-averages and you get 39.5. The true average is 29.4. The two-sample minute weighed as much as the full ones, and the answer came out a third too high. The fix: store min, max, sum and count for every window. Min of mins, max of maxes, sum of sums, count of counts, and the average is sum over count, at every level.

Percentiles are worse: they do not roll up at all. Pod A serves 9 thousand requests with a 99th percentile of 69 milliseconds. Pod B, degraded, serves a thousand with a 99th percentile of 520. Before I tell you the true fleet number: what do you get if you average the two?

[pause]

Averaging gives 295 milliseconds. Weighting by traffic gives 114. The true fleet 99th percentile is 463. Summing the two pods' histogram buckets and interpolating inside the right bucket gives 484, correct to within the bucket width. So store histograms or mergeable sketches, sum the buckets, and compute the quantile last.

One surprise: a one-minute rollup is larger than the six raw samples it replaces. Rollups buy query speed and long retention, not compression. That is why the 13-month tier is rolled again to five minutes after 30 days, from 114 terabytes down to 30.

## Logs: index everything, or index labels and scan

This decision sets the logging bill. Option A is a full-text inverted index, Elasticsearch-class. Any query is fast, but indexing a million documents a second takes a large, CPU-heavy cluster sized for the incident peak, and the index is about the size of the raw data: roughly 600 terabytes of SSD for 7 days with two copies.

Option B, Loki-class: index only the labels, and store compressed chunks of lines in object storage. At about six times compression, 90 days is 648 terabytes in object storage, around 13 thousand dollars a month, and ingest does no per-word work. You pay per query instead. Checkout errors containing "timeout" in the last hour scans 18 gigabytes and takes a third of a second on 100 cores. One IP address across all services for a day scans 43 terabytes and takes over a minute on a thousand cores, every time it runs.

For needle queries, like every line for one trace ID, each chunk carries a Bloom filter. A chunk of 10 thousand lines holds about 5 thousand distinct trace IDs, and a 1 percent false-positive rate costs about 10 bits per key, about 6 kilobytes, under 1 percent of the chunk. But be honest about the whole-day query: a filter only answers per chunk, so you check all 8.6 million filters, about 52 gigabytes, and 1 percent of chunks are wasted fetches, about 86 thousand. Two orders of magnitude cheaper than scanning everything, not free. Narrowing by service first cuts it ten times more.

The usual senior answer: option B with filters, a small full-text index for the few log types that need arbitrary search, like security audit, and a habit of turning repeated log searches into metrics. A team grepping for "payment declined" every day needs a counter.

## Failure modes

The incident log flood: ingest triples, mostly stack traces. Kafka's 24-hour buffer absorbs it, per-team limits shed debug and info lines before errors, and agents collapse repeats into "repeated 4 thousand times".

The cardinality bomb: a deploy adds a label holding raw URLs or IDs, ingester memory climbs, and pods are killed for running out of memory. The gateway's per-team series limit stops it, and everyone else is untouched.

The query of death: one regular expression over a year pins every querier. The frontend enforces limits on range, series and bytes per team, queues fairly, and kills queries over budget.

And the quiet one: alerting silenced by its own outage. Rules evaluated over no data return nothing, so no alert fires. The fix is a dead man's switch, an alert that pages when it stops firing, plus alerts on ingest lag. And keep alerting and critical dashboards in a different failure domain from production, with a small meta-monitoring stack somewhere else.

## In the interview

A team wants user ID as a label for per-user latency. What do you say?

[pause]

No, with arithmetic. A million users multiplies every series of that metric by up to a million, and ingester memory is per series. Per-user questions belong in traces and structured logs, and exemplars link a latency bucket to a trace. The wrong answer is "it adds a million series, we can absorb that", which confuses adding with multiplying.

And: why Kafka between the agents and the ingesters? It absorbs the threefold incident burst without sizing ingesters for peak, it turns a storage outage into delay rather than loss for 24 hours, and other consumers can read the same stream. It costs 31 terabytes of broker disk and a system to run, so below about 50 thousand samples a second, push directly. And do not say Kafka makes it exactly-once: committing the offset only after the write-ahead log is what prevents loss.

## Recap

Four things to remember. Active series and churn are the capacity unit, and labels multiply; enforce limits per team at the gateway. Freshness is set by the agent's batch window, and alert latency by the evaluation interval plus the waiting period. Store min, max, sum and count so rollups compose, and histograms so percentiles merge; never average averages or 99th percentiles. And for logs, index labels, scan compressed chunks, and use per-chunk Bloom filters for needle queries, with the honest arithmetic on what they cost.

At your desk: the estimates table, the one-sample timeline, the downsampling table and Bloom filter sizing, and the rollup exercise.
