---
lesson: back-of-envelope-estimation
source: f7d389f56e39cdba
fit: partial
desk:
  - "The reference tables of latencies and throughput ceilings, with their provenance"
  - "The fsync measurement snippet"
  - "Estimates 1 to 4 worked in full, with their bills of materials"
  - "The error-compounding and Poisson-peak tables"
  - "Exercise: build the estimate calculator"
---
## Introduction

Two candidates are asked to design a photo-sharing service. One says "we'll need a CDN and a sharded database". The other says "20 million uploads a day at 3 megabytes is 60 terabytes a day of originals, so the object store is the whole storage design; the metadata is 10 gigabytes a day and fits one Postgres for years".

The second candidate has not said anything cleverer. They have said something checkable. And the checkable sentence tells the interviewer where the design will spend its complexity budget, and where it will not.

Estimation is not about the right number. It is about the right order of magnitude, fast enough for the design to depend on it, with the assumptions stated so the interviewer can change one and watch you re-derive. Four things, then: the few reference numbers worth carrying, why the database ceilings are what they are, the four-step method with worked examples, and how wrong an estimate can honestly be.

## The numbers worth carrying

The page has a long reference table. By ear, carry a handful of orders of magnitude.

A main memory reference is about 100 nanoseconds. A random read from local flash, 20 to 100 microseconds. A round trip inside one availability zone, a tenth of a millisecond to half a millisecond. Across availability zones in a region, half a millisecond to 2. And from the US East Coast to Western Europe, 70 to 90 milliseconds.

Two facts fall out of that. The round trip dominates almost every request: five sequential calls in one zone cost 1 to 2 milliseconds before any work is done. And a cross-region call costs as much as a hundred same-zone calls, which is why multi-region designs replicate data rather than call across an ocean on the hot path. Distance is physics. Light in fibre covers about 200 kilometres a millisecond, so every 100 kilometres of path adds at least a millisecond of round trip, and no protocol removes it.

For the database, three measured numbers from Postgres 17. A primary-key lookup on one connection: 0.13 milliseconds. A single-row commit on one connection: 2.9 milliseconds. And one node served 53,000 primary-key lookups a second with 32 connections. A Redis instance does roughly 100,000 to 200,000 simple operations a second.

One unit trick does most of the work. A day is 86,400 seconds; round it to 100,000 and you are 14 percent low, which is within the noise. And one rule of thumb: if you are within three times of a ceiling, design for it. Ten times under, do not.

## Why the ceilings are what they are

Here is the part that lets you defend a number when challenged. A database acknowledges a commit only when its log record is on stable storage, so the floor for serial commits is one device flush. On the lesson's workstation, a flush measured 4.2 milliseconds at the median, which allows at most about 240 serial durable writes a second. Postgres's 2.9 millisecond commit is the same order.

So how does Postgres reach thousands of commits a second? Before I say: what would let many commits share the cost of one flush?

[pause]

Group commit. When one connection flushes the log up to its commit record, every other commit record already in the buffer becomes durable in the same flush. Measured: one connection, 343 commits a second. 16 connections, 3,800. 64 connections, 16,000, at about the same latency. Throughput grew 47 times because each flush carried more commits.

Reads hit a different wall. One connection did 7,700 lookups a second. 32 connections did 53,000. 90 connections did 69,000, but latency doubled. Past about one connection per hardware thread, throughput grew 30 percent while latency doubled. That is Little's law, in flight equals rate times latency, meeting a CPU limit. It is the numeric argument for small connection pools.

## The method, worked

Four steps. First, get the driving number: daily users, writes per day, events per second. If it is not given, ask, and if the answer is "you tell me", say "I'll assume 10 million daily users; tell me if that is off by ten times". Second, convert to per second by dividing by 100,000, then multiply by a peak factor: two to three times for global consumer traffic, five to ten for a daily spike or a broadcast. Third, multiply out each dimension separately: reads, writes, storage as items times bytes times replication times retention, and bandwidth as requests times payload. Fourth, compare to a ceiling and name the consequence. "400 writes a second: one Postgres. 40,000: shard, or use a log-structured store." Round at every step; precision you cannot defend only slows you down.

Run it on the photo service. 10 million daily users, 2 uploads each, so 20 million a day. Divide by 86,400 and you get about 230 a second, and with a five times evening peak, 1,200 uploads a second. At 3 megabytes each, that is 3.5 gigabytes a second of ingest. The consequence: clients upload straight to object storage with pre-signed URLs, never through your servers. Storage, with the thumbnails, is 65 terabytes a day, 24 petabytes a year, and around 470 thousand dollars a month by year end. Metadata is 10 gigabytes a day: one primary with replicas. So the dominant cost is storage, and moving originals to a colder tier after 30 days is a requirement, not an optimisation.

Now a system with the opposite shape: live driver locations for a ride-hailing app. 3 million drivers online at peak, each sending a GPS fix every 4 seconds. That is 750,000 writes a second, and that is already the peak. Live state is 3 million times about 100 bytes: 300 megabytes. It fits on any machine. The "does it fit in memory" check passes by three orders of magnitude and decides nothing.

What decides the design is the write rate and how much durability each write deserves. If every update were a commit, at 16,000 group commits a second per Postgres primary, you would need 47 primaries, for data superseded 4 seconds later. So positions live in memory, sharded by city or cell over about 8 to 15 Redis-class nodes, with no fsync and no replica for durability: a lost shard refills from the next round of updates within 4 seconds. Only the trip history, which someone will ask for in a dispute, is durable, written as batched appends to a log.

One more from the feed estimate, because it is the classic trap. 2,200 posts a second at peak sounds small. But each post is fanned out to 200 followers' feeds, which is about 434,000 inserts a second. That is an in-memory number, not a Postgres one. Count every copy of a write.

## How wrong can you be?

Every factor in an estimate is a guess. If each of four factors is within two times of the truth, the product is within 16 times only in the worst case, where every guess errs the same way. Independent errors partly cancel. Simulated, a four-factor estimate lands within about 4 times nine times out of ten.

Three consequences. Fewer, better factors beat many: one number from a comparable system's telemetry can replace three guessed ones. Challenge the widest factor first: daily users are usually known to within 20 percent, while fan-out per post is not. And correlated errors do not cancel. A launch plan whose every guess is optimistic in the same direction sits at the worst case, so run it once with every factor pessimistic and see what breaks first.

Averages also hide peaks. Random arrivals from many users fluctuate by about the square root of the rate. A service averaging 10 requests a second sees a busiest second of about 24 every day, 2.4 times the average. At 10,000 a second the busiest second is only 4 percent above. Small services need proportionally more headroom than large ones.

And fan-out turns rare slowness into common slowness. If each call is slow 1 percent of the time, a request that waits on 20 parallel calls hits at least one slow call 18 percent of the time. With 100 calls, 63 percent. So budget per-call 99th percentiles, not medians.

## In the interview

Here is a follow-up the lesson expects. You assumed a 95 percent CDN hit ratio for the photos. What if it's 70?

[pause]

Origin requests go from 870 a second to 5,200, and origin egress from 174 megabytes a second to about a gigabyte. The origin fleet grows about six times, because origin load scales with the miss rate, and the miss rate went from 5 percent to 30. Whether you get 95 depends on how long-tailed viewing is: a feed of recent photos stays above it, archive browsing does not. Measure it in week one. The wrong answer is "about the same, 70 percent is still most of it".

And: give me the cost per user per month. Take the dominant cost and divide. Photo storage at year end is about 470 thousand dollars a month for 10 million daily users, about 5 cents each, before egress. That decides whether the product can be ad-funded. The wrong answer is summing every component to the dollar, which takes ten minutes and hides the one line that matters.

## Recap

Four things to remember. Carry orders of magnitude with their provenance: same-zone round trips under a millisecond, cross-ocean ones near 100, a Postgres node in the tens of thousands of reads and, thanks to group commit, up to 16,000 commits a second. Use the four steps: driving number, per second and peak, each dimension separately, then a ceiling and a consequence. Count every copy of a write, and ask what each write deserves in durability. And state the honest error band, about four times for four factors, and challenge the widest factor first.

At your desk: the reference tables, the fsync snippet, all four estimates worked in full, the error and peak tables, and the estimate calculator exercise.
