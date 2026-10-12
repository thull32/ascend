---
lesson: orms-and-n-plus-one
source: 2a079e5fea1ddf01
---
## 1

A page renders 100 orders with each customer's name, and issues 101 queries, each under 0.1 milliseconds inside Postgres. The application runs in the same availability zone as the database, with a half-millisecond round trip. Roughly how long does the page spend on the database, and why?

A, about 10 milliseconds, since 101 queries at 0.1 milliseconds each is the whole cost. B, about 200 milliseconds, since each query must parse and plan the SQL again. C, under 1 millisecond, since each lookup is a fast primary-key index probe. D, about 60 milliseconds, since every query pays a network round trip.

[think]

The answer is D: about 60 milliseconds, since every query pays a round trip.

Each lazy load pays a round trip, plus pool and client work, which dwarf the execution time: 101 half-millisecond round trips is about 50 milliseconds before anything else, and the lab model gave 62. Execution time is the smallest term, and a cached prepared statement is not parsed again. One join, or two queries, removes almost all of it.

## 2

At 1,000 comments, one left join to users took 4 milliseconds, while fetching the comments and then the authors by an array of IDs took 1.35. What explains the join losing?

A, the array query benefits from a warmer cache, because it runs as the second statement. B, the join sent 1,000 separate result messages, while the batch sent them all at once. C, joins cannot use an index on the inner table once a query returns many rows. D, the planner hashed the whole users table instead of probing it 1,000 times.

[think]

The answer is D: the planner hashed the whole users table.

With 1,000 outer rows and the random page cost at 4, the planner estimated that 1,000 index probes would cost more than a sequential scan, so it built a hash of all 100 thousand users. The batch gave it one index scan for 994 distinct IDs. A join can use the index, as it did with a nested loop at 100 rows. Checking the plan at realistic sizes is the lesson.

## 3

You need blog posts with their comments and their tags. Why is one query joining posts to both comments and tags a poor choice?

A, tags must be stored in an array column, so they cannot be joined as rows. B, joins cannot use indexes on to-many relations, so each one scans a whole table. C, two to-many joins return comments times tags rows for each post, duplicating data. D, Postgres cannot join more than two tables in one query without a subquery.

[think]

The answer is C: two to-many joins return comments times tags rows for each post.

Joining a parent to two independent to-many relations produces their cartesian product. 20 comments and 10 tags yield 200 rows for one post, which the ORM then deduplicates, and a limit counts those rows rather than posts. Batch-load each relation separately, or aggregate into JSON in SQL.

## 4

Your server does not load the statement statistics extension. Which signal distinguishes an N plus one page from a single join?

A, the page's worst query time, as recorded in the slow query log. B, the number of statements or transactions per page load. C, the index scan counter on the related table's primary key index. D, the number of buffers the related table reads from the buffer pool.

[think]

The answer is B: the number of statements or transactions per page load.

N plus one is a statement-count problem, so count statements. In the lab, the commit counter rose by 106 for the N plus one page and by 4 for the join. The index scan counter rose by about 100 for both, because a nested-loop join probes the index once per row. Each N plus one query is too fast for a slow query log, and buffer reads are similar either way.

## 5

The first version of Ascend's comment listing used SeaORM's find also related, with users. What SQL did that generate, and what was the fair review comment?

A, two queries, one per table, joined in memory; the fix was a single join. B, one left join, not N plus one, but it also selected password hashes. C, N plus one: one lazy load per comment for its author; the fix was a single join. D, a recursive CTE threading replies in SQL; the fix was threading in memory.

[think]

The answer is B: one left join, not N plus one, but it also selected password hashes.

Find also related is a single left join with prefixed column aliases, served by the comments index on target and creation time, so the query count was already right. The projection was wider than necessary: every users column, including email and password hash, when only the display name was used. The current code selects the comment's columns plus the user's display name into a dedicated row struct.

## 6

SeaORM's load one batches related rows with an IN list of one parameter per distinct key. What problem can this cause that comparing against a single array parameter, with equals any, avoids?

A, IN lists return related rows in a different order than the keys. B, the IN form cannot use the primary key index for its lookups. C, each list length is a new statement, and 65,535 keys is the cap. D, the IN form repeats parent columns on every related row returned.

[think]

The answer is C: each list length is a new statement, and 65,535 keys is the cap.

Postgres plans both forms as the same array comparison with an index scan. But the IN text changes with the number of keys, so each length is prepared separately and competes for the 100 entries of sqlx's statement cache, and a statement cannot carry more than 65,535 parameters. One array parameter is one statement text for any list size.
