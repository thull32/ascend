---
lesson: modelling-for-access-patterns
source: 78a08ce554174cc1
fit: great
desk:
  - "The access-pattern table and the index derived for each query"
  - "The fan-out join, its query plan, and the pre-aggregated rewrite"
  - "The idempotent conditional upsert, traced on a retry"
  - "The counter benchmark and the materialised view refresh timings"
  - "The DynamoDB single-table key layout and its key conditions"
  - "Exercise: compute DynamoDB read and write units"
---
## Introduction

Your first schema for an e-learning product had users, lessons, lesson progress, submissions and quiz attempts. It was in third normal form, every foreign key was declared, and every reviewer approved it. Six months later the weekly leaderboard times out, and a well-meaning fix to it makes things worse.

On a lab copy in Postgres 17, with 100 thousand users and a few million progress rows and submissions, the leaderboard query as first written took 34 and a half seconds. Rewritten carefully, 749 milliseconds. Served from a summary table, 0.4 milliseconds. And the per-user dashboard, which everyone assumed was the slow one, took about a quarter of a millisecond straight from the normalised tables and needed no change at all.

Nothing was wrong with the normalisation. What was wrong was the order of operations: the team modelled the nouns of the domain and hoped the queries would be fine. Senior engineers write down the queries first.

Four ideas, then. The access-pattern table, and how it tells you what to denormalise. Moving work to the write path, and the hot row that caps it. Materialised views, and the lock that decides between two kinds of refresh. And DynamoDB, where the same method is the only option you have.

## The access-pattern table

Before you draw a single table, write this one. One row per query, and four columns that each do a job: frequency, a 99th percentile latency target, cardinality, and freshness.

Frequency multiplies cost. The number that matters is frequency times cost per call, in CPU-seconds per second. The latency target bounds how many pages a query can afford to read: 50 milliseconds is generous for an index scan and hopeless for millions of rows.

Cardinality is the column people omit, and it predicts the design. It means rows touched against rows returned. When the two are close, an index can bound the query. When a hot query touches millions of rows to return 100, no index can, and the work has to move to the write path.

Freshness is what unlocks denormalisation. A leaderboard that may be three minutes stale can be precomputed. A progress list that must show a write immediately reads the source of truth.

Now do the arithmetic on the two contenders. The dashboard runs 200 times a second at a quarter of a millisecond: about 0.05 CPU-seconds per second. Nothing. The leaderboard, at its very best, runs 5 times a second at 749 milliseconds: 3.7 CPU-seconds per second, four cores busy all day for one widget, and the cost grows with every user who signs up. The table has told you which query to denormalise, and it is not the one people guessed.

The other half of the habit: every hot query names its index, and every index names the query that pays for its writes.

## The leaderboard's fan-out

The first version of the leaderboard joined users to lesson progress and to submissions, then counted distinct values to undo the duplication. Before I tell you why it took 34 seconds, picture one user with 23 progress rows and 37 submissions. How many rows does that join produce for them?

[pause]

851. The first join produces 23 rows, and the second joins each of those to all 37 submissions: 23 times 37. Across 100 thousand users, that is 85 million rows, which count distinct then collapses back to the right answer. Two independent one-to-many joins from the same parent multiply. The distinct hides the wrong answer and leaves the cost.

The fix is to aggregate each child table first, in its own subquery, and then join one row per user. That took 749 milliseconds. It is correct, and it still reads 6 million rows to return 100. The shape is wrong for the frequency, and only moving the work fixes it.

## Summary tables and the hot row

Every fix from here moves work from reads to writes, which are usually rarer, 20 a second against 200 in this app, and already hold a transaction. The cost is that one fact now lives in two places, and something must keep them consistent.

For the leaderboard, keep one stats row per user, with counters for lessons completed, problems solved and quizzes passed, and an XP column generated from them, with an index on XP descending. The leaderboard became a hundred index entries plus a hundred primary-key probes for the names: 0.4 milliseconds, and the same at ten times the users. The query that rebuilds the table from scratch took 1.9 seconds. Keep it next to the migration, because it is how you repair drift.

The part that breaks under retries is idempotency. A client can retry "mark lesson complete", and the counter must not move twice. So make the increment conditional on the progress row actually changing state: the upsert only updates a row whose status was not already completed, and the counter only moves if the upsert returned a row. A retry changes nothing, so the counter stays put. One subtlety: if a user marks the lesson in progress and then complete again, the counter goes to 2. If the product means "completed at least once", test whether the completion time is still empty instead. Write the rule down; the SQL follows from it.

The smallest summary is one counter. Keep a comment count per lesson and bump it inside the comment's transaction. That is correct, and it has a ceiling. With 16 clients, inserts alone ran at about 3,900 a second. With the counter spread over 10 thousand lessons, the same. With every comment landing on one popular lesson, one hot row, throughput fell to around 400 a second and latency rose to 40 or 50 milliseconds, on a database that was mostly idle.

Here is why. An update stamps the row with its transaction ID until that transaction ends. A second updater sleeps on that ID, and when the first commits, it applies its increment to the newest version. So updates to one row are serial, and each holds the lock until its commit returns, write-ahead log flush included: about 2.5 milliseconds in the lab. One row's throughput is one over 2.5 milliseconds, 400 a second, whether 1 client tries or 16. The extra clients only queue. Sixteen waiters at 400 a second wait about 40 milliseconds each, which is exactly the latency that was measured.

Three fixes. Hold the lock for less time: put the hot update last in the transaction. Doing 2 milliseconds of other work after it dropped throughput to 208 a second. Shard the counter: 16 rows per lesson, each writer picks one at random, readers add them up; throughput rose sixfold. Or stop updating in place: append a small delta row per event and fold them into the total every few seconds, so there is no hot row at all.

And watch the index. The counter updates were 97 percent heap-only updates, which keep bloat small. Adding an index on the count dropped that to zero: every increment now writes an index entry too.

## Materialised views and who keeps copies in sync

A materialised view is a summary table the database builds from a query and stores on disk, with real indexes. Over 2 million XP events, the aggregate query took 655 milliseconds; reading the top 100 from the view took 0.13.

There are two ways to refresh it, and the lock is what decides between them. A plain refresh took about 460 milliseconds and holds an access exclusive lock, which conflicts with every select, so readers wait for the whole refresh. A concurrent refresh holds a weaker exclusive lock, which blocks writes and other refreshes but lets selects through. In the lab, a read during the plain refresh timed out. During the concurrent one, it returned all 100 thousand rows.

The concurrent form has a price, and the reason is how it works. A plain refresh writes a brand-new file and swaps it in, so it leaves no dead rows. A concurrent refresh cannot swap files under running readers, so it reruns the full query into a temporary table, diffs it against the current contents, and applies ordinary deletes and inserts. Three consequences. It needs a unique index to match old rows to new ones, and Postgres refuses without one. It costs about twice a plain refresh even when nothing changed: 909 milliseconds against 456. And every changed row becomes a dead tuple, so a view refreshed every minute needs autovacuum to keep up.

Postgres 17 core has no incremental maintenance. Materialised views fit the queries where minutes of staleness are fine, and never read-your-writes: a user whose XP does not move for five minutes files a bug, unless the product says "updated every few minutes".

Every copy you create needs a named mechanism that keeps it in sync, and there are three. The same transaction in application code is atomic and costs nothing extra; it drifts only when a new code path forgets the copy, so route every write through one function. A database trigger is atomic too, but invisible to application developers, and it adds latency to every write. Change data capture, a consumer tailing the write-ahead log, is eventual, with tens of milliseconds to seconds of lag, and it needs idempotent apply and reconciliation.

The rule: one transaction for copies inside the database, change data capture for copies outside it, like a Redis sorted set for the leaderboard or a search index, and triggers only with a written reason. And every read model must be droppable and rebuildable from the source, or its first inconsistency becomes permanent.

## DynamoDB: the same method, no fallback

DynamoDB makes all of this mandatory. There are no joins. A query reads one partition key, optionally narrowed by a condition on the sort key, and you pay per request unit. So you start from the same access-pattern table and design keys until every row maps to one get or one query.

Four techniques carry the design. Item collections: the user's profile and every progress item share a partition key, so one query returns the dashboard. The join is done at write time, by choosing keys. An overloaded GSI: one global secondary index means "by author, by time" for comments, "by track, in course order" for lessons, and "by user" for memberships, because each entity type writes different values into the same two attributes. An adjacency list for many-to-many: a membership is an edge item stored under the group and projected under the user. And a sparse index: an index on moderation status holds only the comments that have been flagged, so the moderation queue is a small index over a large table.

Then the arithmetic. A read unit is one strongly consistent read of up to 4 kilobytes, or two eventually consistent ones. A query adds up the sizes it returns before rounding. Fifty comments of 600 bytes is 30 thousand bytes: 8 units strongly consistent, 4 eventually consistent. Fetch the same 50 items by key and each one rounds up separately: 25 units, more than six times the cost.

Then the limits. One partition serves at most 3,000 read units and 1,000 write units a second, so one lesson's comments top out at 750 page loads a second. An item is at most 400 kilobytes, so embedding comments in the lesson stops at around 680, and long before that every append is charged on the whole item's size. And global secondary indexes are only eventually consistent, so the read-your-writes patterns must use the base table's keys.

Every denormalisation this lesson applied to Postgres is the only design DynamoDB offers. The reasoning is identical; DynamoDB just removes the option of skipping it.

## In the interview

A follow-up the lesson expects. Your comment counter is a hot row. Why do more connections not help?

[pause]

The row lock serialises the updates and is held until commit, write-ahead log flush included, so throughput is about one over the hold time: 400 a second at 2.5 milliseconds. More clients only queue. Shorten the hold, shard the counter, or append deltas. The wrong answer is "the database is out of CPU, scale it up", when it was sitting idle.

And another: the dashboard is slow, would you add a summary table? Measure it first. A per-user aggregate over a few dozen indexed rows cost a quarter of a millisecond here, so a summary table adds a consistency mechanism for no gain. "Precompute everything the UI shows" buys drift and write contention for queries that were already cheap.

## Recap

Four things to remember. Write the access-pattern table before the schema, and denormalise where frequency times cost is large and rows touched dwarf rows returned, not where it feels slow. Two one-to-many joins from one parent multiply, and distinct only hides it. A hot row's ceiling is one over the lock hold time, commit flush included; shorten the hold, shard the counter, or append deltas. And every copy needs a named sync mechanism and a rebuild query: one transaction inside the database, change data capture outside it, and a concurrent refresh, with its unique index and double cost, for views that people read.

At your desk: the access-pattern and index tables, the fan-out plan and its rewrite, the idempotent upsert, the counter and refresh benchmarks, the DynamoDB key layout, and the capacity-unit exercise.
