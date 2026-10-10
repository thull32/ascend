---
lesson: count-min-sketch-and-hyperloglog
source: 69b7cb13366af63f
fit: partial
desk:
  - "The count-min cell trace for ten request paths, and the conservative-update example"
  - "The count-min error-bound derivation and sizing formulas"
  - "The HyperLogLog register table, the harmonic-mean formula and the 16-register worked example"
  - "The Redis, BigQuery, ClickHouse, Spark and Caffeine internals, and the failure-modes table"
  - "Exercises: implement a count-min sketch; estimate cardinality from HyperLogLog registers"
---
## Introduction

Two questions come up in every analytics or abuse-detection system. How many times has this key appeared: which URL is hottest, which IP is hammering us. And how many distinct keys have appeared: daily active users, unique visitors per page.

The exact answer to both is a hash map with one entry per distinct key. At a hundred million distinct keys, that is several gigabytes per counter, per node, per time window. And you wanted one per country per hour.

You do not need exact answers. You need "this IP sent roughly 40 thousand requests, give or take a few hundred", and "about 3.2 million unique users today, plus or minus 1 percent". Two structures give you that with memory that does not grow with the number of distinct keys: the count-min sketch for frequencies, and HyperLogLog for distinct counts.

Three ideas: why the count-min sketch can only overestimate, and what that makes it good for. How counting leading zeros in a hash lets you count distinct items in 12 kilobytes. And the one operation HyperLogLog does for free, and the one it cannot do at all.

## The count-min sketch

A count-min sketch is a grid of counters, all zero. A few rows, call it d of them, and many columns, call it w. Each row has its own hash function that maps a key to one column.

To add a key, go to each row, find the key's column, and increment that counter. To estimate a key's count, read the key's counter in every row, and take the smallest.

Here is the invariant. Every counter is shared by every key that hashes to it in that row. So each counter holds the key's true count plus whatever collided with it, and never less. The minimum picks the row with the least collision noise. So the estimate is never below the truth, and it is above the truth only when the key collided in every single row.

The lesson traces a tiny sketch: three rows, 16 columns, ten request paths, 61 requests in total. Take "GET slash login", which really appeared 8 times. In row zero its cell holds 23, because it shares that column with two other paths. In row one, 27, shared with three others. In row two, 11, shared with one. The minimum is 11. The truth is 8. An overestimate of 3, because it collided in all three rows. Eight of the ten paths came back exact, because each had at least one row where its column was private.

A 16-column sketch is absurdly small; the point is to see the mechanism. Widen the grid and collisions per row fall in proportion.

## Sizing it, and what it is good for

The error bound, in words. Call the total count of everything added N. With high probability, the estimate exceeds the truth by at most two times N divided by the width. More rows raise the confidence: each extra row halves the chance of a bad estimate.

A sizing example. Errors below 0.1 percent of total traffic, with 99 percent confidence, needs 2 thousand columns and 7 rows. That is 14 thousand counters. With 4-byte counters, 56 kilobytes. It does not matter whether you have a thousand distinct keys or a billion.

But listen to the phrase "a fraction of total traffic". If N is a billion requests, the guarantee is "within a million". That is precise enough to spot a key with 5 percent of traffic, which is 50 million, and useless for a key with 500 requests. So a count-min sketch is a heavy-hitter structure. It is accurate about keys that are large relative to the stream, and it lies about the long tail, always upward.

To find the top keys, which is its main job, keep a small min-heap of the best estimates beside the sketch, because the sketch itself never stores keys and cannot list them.

One cheap accuracy win is conservative update. When you add one to a key, first compute its current estimate, then raise each row's counter only up to that estimate plus one, instead of adding one everywhere. Add one more "GET slash login" to the traced sketch: the estimate is 11, so the target is 12. The cells at 23 and 27 are already above 12 and stay put. Only the row-two cell moves, from 11 to 12. Counters already inflated by collisions are not inflated further. It costs no memory, but it gives up decrements, because a counter that was not raised cannot safely be lowered.

Where it runs. Caffeine's frequency sketch, with 4-bit counters, is the admission memory of the W-TinyLFU cache policy. RedisBloom has count-min commands. And API gateways and DDoS detection keep one sketch per one-second window to find the top source IPs at line rate, without a per-IP table.

## HyperLogLog: counting distinct items

Counting distinct items is a different problem. Adding the same key twice must not change the answer.

The idea: a good hash turns every distinct key into a uniformly random bit string, and random bit strings have a predictable structure. Half of them start with a 1. A quarter start with zero, one. One in eight starts with two zeros and then a 1. So if you hash every element and remember the longest run of leading zeros you have ever seen, you know roughly how many distinct elements you have seen. Seeing ten leading zeros takes about a thousand random draws. And duplicates hash identically, so they add nothing new. That is exactly the property you need.

A single maximum is a terrible estimator, though. One unlucky hash with 30 leading zeros and you claim a billion elements. Two fixes turn the idea into HyperLogLog.

First, many registers. Use the first few bits of the hash to pick one of m registers, and use the rest to find the leading-zero run. Each register keeps the maximum it has seen. Now you have m independent small estimates instead of one.

Second, combine them with a harmonic mean, not an ordinary average. Why the harmonic mean? Before I say it, think about what one freak register would do.

[pause]

Each register's estimate is heavy-tailed: one lucky hash gives an enormous value. An ordinary average would be dominated by that one outlier. The harmonic mean is dominated by the small values, so the outlier barely moves it. It is still slightly biased, so a correction constant fixes the rest.

## The 12 kilobyte number

The relative error of HyperLogLog is about 1.04 divided by the square root of the number of registers. With 16 registers, 26 percent. With about 4 thousand, 1.6 percent. With 16,384 registers, 0.81 percent.

That last one is the number to remember, because it is exactly what Redis uses: 16,384 registers of 6 bits each, 12 kilobytes per HyperLogLog, 0.81 percent standard error, for any cardinality you will ever see. A simulation with that size estimated a thousand items as 1,004, and a million as about 1,002,000. Daily uniques per page cost 12 kilobytes each, so a year of daily counters for a thousand pages is about 4.5 gigabytes, instead of the terabytes exact sets would need.

Two refinements every real implementation has. For small counts, most registers are still zero and the formula is biased, so implementations switch to a different estimate, linear counting, at the low end; HyperLogLog plus plus, from Google, adds an empirical bias-correction table and a sparse representation for small sets. And Redis starts every key in a sparse encoding, converting to the dense 12 kilobytes only after about 3 thousand bytes, so a key that has seen a hundred users costs a few hundred bytes.

## Merge is free; intersect is not

Two HyperLogLogs with the same number of registers merge by taking the register-wise maximum. The result is exactly the HyperLogLog you would have built from the union of both streams, with the same error. That is why distributed systems love it. Each shard, region or day keeps its own 12 kilobytes, and any union, all shards, last 30 days, both regions, is one merge. BigQuery, ClickHouse, Druid, Elasticsearch and Postgres all rely on it.

What you cannot do is intersect. You can write the intersection as the size of A plus the size of B minus the size of the union. But each term carries about 1 percent error on a large number, and the intersection may be small. Two sets of a million users with an overlap of 10 thousand: each term carries around 10 thousand of error, against an answer of 10 thousand. The result can even come out negative. If you need users who did A and B, use MinHash, a Theta sketch, or count the intersection exactly. More registers shrink that error but do not fix it.

Two production traps. Feed HyperLogLog raw integer IDs through an identity hash, and small IDs share leading zeros, so the estimate is nonsense: always hash with a real mixing hash first. And sketches with different precisions or different hash functions will not merge correctly, so fix the precision fleet-wide and store it with the sketch.

## In the interview

The interview version is usually "show trending hashtags" or "count unique viewers of a live stream". The senior move is to name the exact structure first, state its memory at the given scale, and only then introduce the sketch, with its error bound and the reason that error is acceptable. "Use HyperLogLog, it's approximate" is not a senior answer.

A follow-up the lesson expects. How do you count distinct users across 200 shards with 1 percent error and no coordination?

[pause]

Each shard keeps a 12 kilobyte HyperLogLog with the same number of registers. The coordinator takes the register-wise maximum, which is exactly the union's sketch, with the same 0.81 percent error. Store daily sketches and merge for any window. The wrong answer is summing the per-shard counts, which double-counts every user seen on more than one shard.

And another: size a sketch to find IPs sending more than 1 percent of a billion requests. Two thousand columns makes the error about a million, a tenth of the 10 million threshold, and 7 rows give 99 percent confidence. 56 kilobytes with 4-byte counters, or 112 with 8-byte counters, because a billion increments can overflow 32 bits on a hot cell. The wrong answer sizes it by the number of distinct IPs, which the sketch does not depend on.

## Recap

Four things to remember. A count-min sketch never underestimates, and overestimates by at most a fraction of total traffic, so it finds heavy hitters and lies about the tail. 56 kilobytes buys 0.1 percent error at 99 percent confidence, whatever the number of keys. HyperLogLog counts distinct items from the longest leading-zero runs, combined with a harmonic mean: 12 kilobytes, 0.81 percent error. And merging is a register-wise maximum, but intersections by subtraction blow up; reach for MinHash or Theta sketches.

At your desk: the count-min cell trace and conservative-update example, the error-bound derivation, the HyperLogLog register table and worked example, the library internals and failure modes, and the two exercises.
