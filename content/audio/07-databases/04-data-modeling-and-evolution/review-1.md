---
review: data-modeling-and-evolution
source: 5b6651b907f6d261
---
## Introduction

Twelve questions from the data-modeling-and-evolution module. Answer out loud before the answer comes.

Three from each lesson, in order: modelling for access patterns, schema migrations at scale, ORMs and N plus one, and caching layers. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A leaderboard query left-joins users to lesson progress, 23 rows per user, and to submissions, 37 rows per user, then counts distinct values. It returns the right numbers but takes 34 seconds. What is the mechanism?

A, the distinct forces a sort of every row in the two child tables. B, each user yields 23 times 37 joined rows, and the distinct only hides it. C, the limit of 100 is applied before the joins, so each join is repeated. D, the planner picked merge joins where hash joins would be far faster.

[think]

The answer is B: each user yields 23 times 37 joined rows, and the distinct only hides it.

Two independent one-to-many joins from the same parent multiply: 851 rows per user and 85 million in total, which count distinct collapses back to the right answer. Aggregating each child table in its own subquery, and joining one row per user, took 749 milliseconds. The join algorithm was not the problem, and the limit applies after aggregation.

## Question 2

Sixteen clients insert comments on one popular lesson, and each transaction also increments that lesson's counter row. Throughput stays near 400 a second and latency is 40 milliseconds, with the database mostly idle. What sets the ceiling?

A, the counter's row lock is held until commit, write-ahead log flush included. B, the connection pool is too small for sixteen concurrent writers. C, the primary key index on the stats table is locked by each update. D, autovacuum cannot keep up with the dead versions of the counter row.

[think]

The answer is A: the counter's row lock is held until commit, flush included.

Each updater waits on the previous transaction until it commits, and a commit includes flushing the log, about 2.5 milliseconds in the lab. So one row sustains about one over the hold time, whatever the client count, and extra clients only queue. Sharding the counter over 16 rows raised throughput sixfold. The updates were 97 percent heap-only, so vacuum and index locks were not the issue.

## Question 3

Which copy of data should be kept in sync by change data capture, rather than by the same database transaction?

A, a comment count column kept in the same Postgres database. B, a generated column computing XP from three counter columns. C, a redundant author name column on the comments table. D, a Redis sorted set that serves the leaderboard to readers.

[think]

The answer is D: the Redis sorted set.

A transaction can only make copies inside the same database atomic. Redis is outside it, so the update must be eventual, and change data capture from the write-ahead log, or an outbox, is the reliable way to deliver it. The other copies live in Postgres, and belong in the same transaction or in a generated column.

## Question 4

A migration adds a nullable text column to the orders table, with no default. It should take milliseconds, yet reads on orders stop for four minutes. What is the most likely cause?

A, adding a text column writes an empty pointer into each existing row. B, the connection pool was too small for the migration and the API together. C, adding the column rewrote every row of the table under an exclusive lock. D, the alter waited behind an open transaction, and reads queued behind it.

[think]

The answer is D: the alter waited behind an open transaction, and reads queued behind it.

Adding a nullable column is catalog-only. But the alter needs access exclusive, so it waits for an existing reader's lock, and because a new request must not conflict with waiting requests either, every later select queues behind the alter. The lab showed readers blocked by the migration, not by the report. A lock timeout with retries capped reader latency at 200 milliseconds.

## Question 5

You must add not null to a column of a 2 terabyte table on Postgres 17, without blocking traffic. Which sequence works?

A, set not null directly, since Postgres 12 no longer scans for nulls. B, add a not null column with a default, then drop the original column. C, add a check that the column is not null, marked not valid; validate it; then set not null. D, create a unique index concurrently on the column, since it rejects null values.

[think]

The answer is C: a not valid check, then validate, then set not null.

The not valid check is instant. Validate scans under share update exclusive, while reads and writes continue. Set not null then uses the validated check to skip its own scan, as the debug message in the lab confirmed. A bare set not null scans under access exclusive, and unique indexes allow multiple nulls.

## Question 6

In expand and contract, why does the code start writing the new columns before it starts reading them?

A, because reads are more expensive than writes, so the cheaper change should always ship first. B, because Postgres will not build an index on a column until at least one row holds a value. C, so the backfill can run inside the migration transaction without holding any row locks. D, so rows written after that deploy are already right, and the backfill covers only older rows.

[think]

The answer is D: so new rows are already right, and the backfill covers only older ones.

Once every write fills both shapes, only rows older than that deploy need the backfill, and the read switch can then be verified against a complete data set. Reading first would return nulls for every row not yet backfilled. And the backfill belongs in a batched job, not in the migration transaction.

## Question 7

At 1,000 comments, one left join to users took 4 milliseconds, while fetching the comments and then the authors by an array of IDs took 1.35. What explains the join losing?

A, the array query benefits from a warmer cache, because it runs as the second statement. B, the join sent 1,000 separate result messages, while the batch sent them all at once. C, joins cannot use an index on the inner table once a query returns many rows. D, the planner hashed the whole users table instead of probing it 1,000 times.

[think]

The answer is D: the planner hashed the whole users table.

With 1,000 outer rows and the random page cost at 4, the planner estimated that 1,000 index probes would cost more than a sequential scan, so it built a hash of all 100 thousand users. The batch gave it one index scan for 994 distinct IDs. A join can use the index, as it did with a nested loop at 100 rows. Checking the plan at realistic sizes is the lesson.

## Question 8

You need blog posts with their comments and their tags. Why is one query joining posts to both comments and tags a poor choice?

A, tags must be stored in an array column, so they cannot be joined as rows. B, joins cannot use indexes on to-many relations, so each one scans a whole table. C, two to-many joins return comments times tags rows for each post, duplicating data. D, Postgres cannot join more than two tables in one query without a subquery.

[think]

The answer is C: two to-many joins return comments times tags rows for each post.

Joining a parent to two independent to-many relations produces their cartesian product. 20 comments and 10 tags yield 200 rows for one post, which the ORM then deduplicates, and a limit counts those rows rather than posts. Batch-load each relation separately, or aggregate into JSON in SQL.

## Question 9

Your server does not load the statement statistics extension. Which signal distinguishes an N plus one page from a single join?

A, the page's worst query time, as recorded in the slow query log. B, the number of statements or transactions per page load. C, the index scan counter on the related table's primary key index. D, the number of buffers the related table reads from the buffer pool.

[think]

The answer is B: the number of statements or transactions per page load.

N plus one is a statement-count problem, so count statements. In the lab, the commit counter rose by 106 for the N plus one page and by 4 for the join. The index scan counter rose by about 100 for both, because a nested-loop join probes the index once per row. Each N plus one query is too fast for a slow query log, and buffer reads are similar either way.

## Question 10

A service handles 50 thousand reads a second with a 98 percent cache hit ratio. A deploy changes the cache key format, and the hit ratio drops to 60 percent for twenty minutes. How does database read load change?

A, it stays near 1,000 a second, since misses refill the cache. B, it rises twentyfold, from 1,000 to 20 thousand queries a second. C, it roughly doubles, from 1,000 to 2,000 queries a second. D, it rises by about 40 percent, from 1,000 to 1,400 queries a second.

[think]

The answer is B: it rises twentyfold, from 1,000 to 20 thousand.

Database load follows the miss ratio: 2 percent of 50 thousand is 1,000, and 40 percent is 20 thousand. Refilling does not help while every new key starts cold. Small changes in hit ratio are large changes in miss ratio, which is why key-format changes and cold starts need warming and a gradual rollout.

## Question 11

A handler begins a transaction, updates a product's price, deletes the product's cache key, and then commits. Occasionally the old price stays cached for a full TTL. Why?

A, the TTL is too short, so the key is refilled before the commit lands. B, the delete was sent before the update finished, so Redis ignored it. C, a reader refills the old committed price between the delete and the commit. D, a Redis delete runs asynchronously, so the key can outlive the transaction.

[think]

The answer is C: a reader refills the old committed price between the delete and the commit.

Until the commit, other transactions see the old row, as the lab's two sessions showed. A reader that misses after the delete reads the old price and fills the cache, and the commit then lands behind a stale entry. Delete after the commit, or invalidate from the write-ahead log, which only carries committed changes.

## Question 12

Cache fills read a replica that is usually a second behind. The writer deletes the key after commit, and the cache supports memcache-style leases. Some users still see an old name for an hour. Why did leases not help?

A, the reader's miss came after the delete, so its lease was still valid. B, leases expire after ten seconds, which is shorter than the replica lag. C, the replica ignored the lease token that the cache issued to the reader. D, leases only work when every fill is read from the primary database.

[think]

The answer is A: the reader's miss came after the delete, so its lease was still valid.

A lease is revoked only by invalidations that happen after it was granted. Here the miss, and the lease, came after the delete, so the fill of the replica's old value was accepted. A versioned marker left by the writer rejects any fill older than the new version, wherever it was read from.

## Recap

Three ideas kept coming back. Cost is set by shape, not by how fast one piece looks: joins that multiply rows, a row lock held through commit, a hundred fast round trips, and a plan that flips at scale. Ordering is where correctness breaks: lock requests granted in order behind an idle transaction, writing before reading in expand and contract, and a delete that lands before the commit or before a slow fill. And every copy of data needs a named mechanism that keeps it honest: one transaction inside the database, change data capture outside it, and a TTL or a version as the bound on every cache race.
