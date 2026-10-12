---
lesson: metrics-and-logging-platform
source: 1032fc43313e78b2
---
## 1

A metric has labels for service, with 300 values, endpoint with 20, status with 5, and pod with 30. An engineer proposes adding a customer ID label with 50,000 values. What is the most accurate objection?

A, it slows down queries, but does not affect ingestion. B, it adds 50,000 series, which the platform can absorb. C, labels with numeric values cannot be indexed by the time-series database. D, it multiplies the metric's series count by up to 50,000.

[think]

The answer is D: it multiplies the metric's series count by up to 50,000.

The series count is the product of the label cardinalities, so a new label multiplies rather than adds. Ingester memory, index size and query cost all scale with distinct series. The tempting "adds 50,000" answer is the mistake that causes cardinality outages.

## 2

Pod A serves 9,000 requests with a 99th percentile of 69 milliseconds, and pod B serves 1,000 with a 99th percentile of 520. Which method gives a fleet 99th percentile close to the true 463 milliseconds?

A, sum both pods' histogram buckets, then interpolate. B, weight the 99th percentiles by traffic, which gives about 114 milliseconds. C, average the two 99th percentiles, which gives about 295 milliseconds. D, take the larger 99th percentile, since the slow pod sets the tail.

[think]

The answer is A: sum both pods' histogram buckets, then interpolate.

Quantiles are not additive, so any average of per-pod 99th percentiles describes nothing. Summing the bucket counts gives the merged distribution, and interpolating in the 400 to 500 millisecond bucket gives about 484, within one bucket width of the truth. The maximum is an upper-bound heuristic, here 57 milliseconds too high.

## 3

Five one-minute rollups have averages of 14.7, 30.5, 105, 33 and 14.2, but the minute with 105 has only 2 samples, while the others have 6 each. What should the five-minute average be built from?

A, the maximum of the maxima, divided by the sample count. B, the median of the five averages, to damp the outlier. C, the sum of the sums, divided by the sum of the counts: 29.4. D, the mean of the five averages, which is about 39.5.

[think]

The answer is C: the sum of the sums, divided by the sum of the counts: 29.4.

Averages of averages weight a two-sample minute like a six-sample one. Storing a sum and a count per window lets every level roll up exactly: 764 over 26 samples is 29.4. The median discards information, rather than weighting it correctly.

## 4

A sample is scraped at exactly 9 in the evening. In the traced design, which step contributes most to the time before a dashboard can see it?

A, the WAL fsync on the ingester, before the offset commit. B, the agent's one-second batching window, before pushing. C, the Kafka produce, acknowledged by all three replicas. D, the two-hour block upload to object storage.

[think]

The answer is B: the agent's one-second batching window, before pushing.

The batch window costs up to a second, while the gateway, the Kafka acknowledgement and the WAL append take milliseconds to a few hundred milliseconds. Recent samples are served from the ingester's head, so the block upload hours later does not affect visibility.

## 5

A needle query looks for one trace ID across all services for 24 hours, with a Bloom filter per chunk at 1 percent false positives, over 8.6 million chunks. What is the realistic cost?

A, nothing beyond the label index, which stores trace IDs. B, about 52 gigabytes of filters, plus about 86,000 false-positive chunks. C, one chunk fetch, because the filter points to the chunk. D, a full scan of 7.2 terabytes, because filters cannot skip chunks.

[think]

The answer is B: about 52 gigabytes of filters, plus about 86,000 false-positive chunks.

A Bloom filter only answers per chunk, so every chunk's filter must be checked, and 1 percent of 8.6 million chunks are wasted fetches. That is roughly 100 times cheaper than scanning everything, and narrowing by a service label, or a lower false-positive rate, cuts it further. Filters do not point to locations.

## 6

Why does the rule evaluator read only from the in-memory ingesters, rather than through the full query path?

A, alerts read recent data, so paging survives an outage of the history tier. B, reading from memory is cheaper per query than object storage. C, ingesters hold more complete data than the object store. D, object storage cannot hold time-series data in queryable form.

[think]

The answer is A: alerts read recent data, so paging survives an outage of the history tier.

Alert rules look at the last few minutes, which live in the ingesters. Removing the dependency on store gateways and object storage means a failure in the historical tier degrades dashboards, but not paging. The cheaper query is a side effect, not the reason.
