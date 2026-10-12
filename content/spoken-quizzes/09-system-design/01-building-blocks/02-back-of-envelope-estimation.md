---
lesson: back-of-envelope-estimation
source: 5fb33dba250ddab8
---
## 1

An estimate multiplies four independent factors, each within a factor of 2 of the truth. How far off is the product likely to be?

A, within 2 times, since no factor is off by more than 2 times. B, within about 16 times, because the four bounds of 2 multiply. C, within about 8 times, since four errors of 2 times add up. D, within about 4 times in 90 percent of cases, because errors partly cancel.

[think]

The answer is D: within about 4 times in 90 percent of cases, because errors partly cancel.

Errors multiply, so they add on a log scale, and independent errors partly cancel: the spread grows with the square root of the number of factors. The simulation put the 90th percentile at 3.7 times. 16 times is the worst case, where every factor errs in the same direction, which is why correlated optimism is the real danger.

## 2

One Postgres connection commits 343 single-row transactions a second with fsync on. With 64 connections, it commits about 16,000 a second, at nearly the same latency. What explains this?

A, the 64 connections write to 64 separate WAL files. B, Postgres switches to asynchronous commit under load. C, concurrent commits share one WAL flush to disk. D, the operating system caches the WAL and skips fsync.

[think]

The answer is C: concurrent commits share one WAL flush to disk.

This is group commit. When one backend flushes the WAL up to its commit record, every commit record already in the buffer becomes durable in the same flush, so throughput grows with concurrency while latency stays near one flush. Postgres never silently drops durability, and there is a single WAL stream.

## 3

A request makes five sequential calls, each with a median of 2 milliseconds and a 99th percentile of 20. What is the best statement about the request's latency?

A, its 99th percentile is about 10 milliseconds, because five calls at 2 each add up. B, its 99th percentile is 20 milliseconds or more, because about 5 percent of requests hit a slow call. C, its 99th percentile is under 20 milliseconds, since the tails average out over five calls. D, its 99th percentile is exactly 100 milliseconds, because five calls at 20 each add up.

[think]

The answer is B: its 99th percentile is 20 milliseconds or more, because about 5 percent of requests hit a slow call.

With five independent calls, the chance that at least one lands in its slowest 1 percent is about 5 percent, so the request's tail contains at least one slow call. Budget with 99th percentiles. Summing means is the mistake, and summing five 99th percentiles assumes every call is slow at once.

## 4

A feed estimate shows 2,000 posts per second, and 200 followers on average. Which conclusion follows?

A, fan-out makes it about 400,000 inserts a second, so feeds need an in-memory store. B, storage is the bottleneck, so the posts table must be sharded first. C, Postgres handles 2,000 writes a second, so a single database is enough. D, the system is read-dominated, so a CDN is the main component to size.

[think]

The answer is A: fan-out makes it about 400,000 inserts a second, so feeds need an in-memory store.

Counting every copy of a write gives 2,000 times 200, which is 400,000 inserts a second: an in-memory number. Users with millions of followers would produce millions of inserts per post, which is why real feeds fan out on read for them. The 2,000 posts a second figure on its own is misleading.

## 5

A metrics pipeline writes 2 megabytes a second of raw points, kept for 15 days, and 1.3 megabytes a second of rollups, kept for 13 months. Which tier dominates storage?

A, neither, since both tiers end up at about the same size. B, the raw tier, because it writes more bytes every second. C, the rollup tier, because it is kept 26 times longer. D, the raw tier, because raw points compress worse than rollups.

[think]

The answer is C: the rollup tier, because it is kept 26 times longer.

Stored bytes are rate times retention. 2 megabytes a second for 15 days is about 2.6 terabytes, while 1.3 megabytes a second for 395 days is about 46 terabytes, before replication. Retention, not write rate, decides storage, which is why the rollup schema should keep only what dashboards query.

## 6

Which is the most useful sentence to end an estimate with?

A, "So we need to scale horizontally across several regions." B, "So the total is exactly 4,217 requests per second at peak." C, "So one replicated Postgres with a cache fits; no sharding." D, "So the numbers are large enough to need careful design."

[think]

The answer is C: "So one replicated Postgres with a cache fits; no sharding."

An estimate exists to change a decision. Naming the decision, and the thing you will not do, is the senior move. A precise number with no consequence, or a vague "scale horizontally", shows the arithmetic was ritual.
