---
lesson: modelling-for-access-patterns
source: 5aaf553031a76a3d
---
## 1

A leaderboard query left-joins users to lesson progress, 23 rows per user, and to submissions, 37 rows per user, then counts distinct values. It returns the right numbers but takes 34 seconds. What is the mechanism?

A, the distinct forces a sort of every row in the two child tables. B, each user yields 23 times 37 joined rows, and the distinct only hides it. C, the limit of 100 is applied before the joins, so each join is repeated. D, the planner picked merge joins where hash joins would be far faster.

[think]

The answer is B: each user yields 23 times 37 joined rows, and the distinct only hides it.

Two independent one-to-many joins from the same parent multiply: 851 rows per user and 85 million in total, which count distinct collapses back to the right answer. Aggregating each child table in its own subquery, and joining one row per user, took 749 milliseconds. The join algorithm was not the problem, and the limit applies after aggregation.

## 2

Sixteen clients insert comments on one popular lesson, and each transaction also increments that lesson's counter row. Throughput stays near 400 a second and latency is 40 milliseconds, with the database mostly idle. What sets the ceiling?

A, the counter's row lock is held until commit, write-ahead log flush included. B, the connection pool is too small for sixteen concurrent writers. C, the primary key index on the stats table is locked by each update. D, autovacuum cannot keep up with the dead versions of the counter row.

[think]

The answer is A: the counter's row lock is held until commit, flush included.

Each updater waits on the previous transaction until it commits, and a commit includes flushing the log, about 2.5 milliseconds in the lab. So one row sustains about one over the hold time, whatever the client count, and extra clients only queue. Sharding the counter over 16 rows raised throughput sixfold. The updates were 97 percent heap-only, so vacuum and index locks were not the issue.

## 3

Users read a materialised view continuously, and a plain refresh every five minutes causes half-second timeouts. What does switching to a concurrent refresh change?

A, it needs no extra index, because the view is diffed on every column. B, it refreshes only the rows whose base data changed since the last run. C, it swaps in a new file atomically, so no dead tuples are produced. D, it takes an exclusive lock that readers can pass, but takes twice as long.

[think]

The answer is D: it takes a lock readers can pass, but takes twice as long.

The concurrent form takes an exclusive lock instead of an access exclusive one, so selects proceed. But it reruns the whole query and diffs the result against the view, using a required unique index, then applies deletes and inserts: 909 milliseconds against 456 in the lab, even with nothing changed, and dead tuples for every changed row. The plain refresh is the one that swaps files.

## 4

A DynamoDB query returns 50 comments of about 600 bytes each, eventually consistent. How many read units does it consume, and why?

A, 25, because each item is rounded up to 4 kilobytes and then halved. B, 15, because 30 thousand bytes is about 30 kilobytes, and each 2 kilobytes is a unit. C, 50, because every item returned costs one full read unit. D, 4, because the sizes are summed, rounded up to 4 kilobyte units, then halved.

[think]

The answer is D: 4, because the sizes are summed, rounded to 4 kilobyte units, then halved.

A query sums the returned sizes, 30 thousand bytes, rounds up to 4 kilobyte units, which makes 8, and halves that for eventual consistency, which makes 4. Per-item rounding applies to single and batch gets by key, which is why fetching the same items by key costs 25 units. At 4 units per page, one partition's 3 thousand read units cap that lesson at about 750 page loads a second.

## 5

A per-user dashboard aggregates about 70 rows through indexes that lead with the user ID. It measured 0.26 milliseconds, and runs 200 times a second. What should you do about it?

A, keep computing it on read, since frequency times cost is tiny. B, move the dashboard counts into a Redis hash, kept in sync by change data capture. C, add a summary row per user, maintained in the same transaction. D, create a materialised view of all dashboards, refreshed each minute.

[think]

The answer is A: keep computing it on read, since frequency times cost is tiny.

200 times 0.26 milliseconds is about 0.05 CPU seconds per second, and the cost does not grow with the number of users, only with one user's history. Every alternative adds a copy and a consistency mechanism to save almost nothing. Denormalise the queries whose rows touched dwarf the rows returned, such as a global leaderboard at 749 milliseconds per call.

## 6

Which copy of data should be kept in sync by change data capture, rather than by the same database transaction?

A, a comment count column kept in the same Postgres database. B, a generated column computing XP from three counter columns. C, a redundant author name column on the comments table. D, a Redis sorted set that serves the leaderboard to readers.

[think]

The answer is D: the Redis sorted set.

A transaction can only make copies inside the same database atomic. Redis is outside it, so the update must be eventual, and change data capture from the write-ahead log, or an outbox, is the reliable way to deliver it. The other copies live in Postgres, and belong in the same transaction or in a generated column.
