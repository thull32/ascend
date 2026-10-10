---
review: relational-fundamentals
source: 4899c45a7d743c58
---
## Introduction

Twelve questions from the relational-fundamentals module. Answer out loud before the answer comes.

Two from each lesson, in order: the relational model, query plans, indexes, transactions, isolation levels, and MVCC and locking. Each one has four options, A to D, then a few seconds for you to commit to one.

## Question 1

An orders table stores the unit price in cents on each order line, although the products table has a price column. A reviewer calls it a third normal form violation. What is the right response?

A, move it into a materialised view that is refreshed from products daily. B, keep it, and sync it with a trigger whenever the product's price changes. C, remove it, because the current price can always be joined from products. D, keep it, because the price at purchase is a fact about the line, not a copy.

[think]

The answer is D: keep it, because the price at purchase is a fact about the line, not a copy.

The purchase price is an attribute of the order line, and it must not change when the product's current price changes. Joining to products, or syncing with a trigger, would silently rewrite past invoices. Telling historical facts apart from redundant copies of current values is the core normalisation judgement.

## Question 2

An orders table of 300 million rows has a customer ID column that references users, and there is no index on that column. What does deleting user number 5 do?

A, it cascades by default and removes the customer's orders. B, it scans orders to look for referencing rows before it can finish. C, it fails at once, because rows with foreign keys cannot be deleted. D, it is fast, because Postgres indexes foreign key columns itself.

[think]

The answer is B: it scans orders to look for referencing rows before it can finish.

Postgres indexes primary keys and unique constraints, but not the referencing side of a foreign key. So the delete's check on the orders table becomes a sequential scan, run while holding the lock on the user row. On the 2 million row lab table that took 42 milliseconds, against 0.3 with an index. And the default action is no action, which only raises an error if a referencing row exists.

## Question 3

A query filters on country equals Japan and currency equals yen. The planner estimates 965 rows, but the query returns 10 thousand. What is wrong, and what fixes it?

A, the most-common-values list is stale; run vacuum full so analyze sees every row. B, both columns need a composite index before any estimate can be made. C, the histogram is too coarse; raise the statistics target on country. D, the planner assumed the columns are independent; create extended statistics.

[think]

The answer is D: it assumed the columns are independent, so create extended statistics.

The planner multiplied one tenth by one tenth, because it assumes columns are independent, but currency is determined by country. Creating extended statistics with dependencies lets it know that, and the estimate became about 10,200. Indexes do not change row estimates, and neither a larger histogram nor a table rewrite captures a dependency between columns.

## Question 4

A query asks for the ten newest pending orders. It walks an index on the placed-at time, takes 185 milliseconds, and throws away nearly 2 million rows with a filter. The statistics correctly say 1 percent of orders are pending. What is the best fix?

A, index status and then placed-at together, so the scan starts at the pending rows. B, replace the limit with an offset of zero, so the planner stops expecting an early exit. C, run analyze, so the planner sees that 1 percent of the rows are pending. D, raise work mem, so the filter can be applied inside the index.

[think]

The answer is A: a composite index on status, then placed-at.

The count is right. What is wrong is the assumption that pending rows are spread evenly along placed-at, when they all sit at the old end. A composite index with status first makes the scan read only pending entries, in placed-at order: 5 buffers and 0.17 milliseconds. Analyze would only confirm the same 1 percent, and work mem has nothing to do with filtering during an index walk.

## Question 5

An index on created-at, then account ID, serves a query for one account's rows from the last seven days. Both columns appear in the index condition, yet 30 thousand buffers are read for 12 rows. What fixes it?

A, adding a separate single-column index on account ID. B, reordering the index to account ID first, then created-at. C, running cluster, so the heap follows created-at order. D, moving account ID into an include clause on the index.

[think]

The answer is B: reorder the index to account ID first, then created-at.

Only the leading range column bounds the scan, so every entry from the last week, for every account, is walked and filtered. Equality first, then range, makes the matching entries one contiguous slice: in the lab, 2,300 buffers became 8. The wasted reads are index pages, so clustering the heap cannot help, and include columns are never used to bound a scan.

## Question 6

A users table is updated on every request to set the last-seen time. Someone adds an index on last-seen for an admin report. What is the most important side effect?

A, every lookup by ID now misses the cache, because the index is so large. B, the report's scans lock the table against those frequent updates. C, none, because an index costs nothing until a query actually reads it. D, those updates lose heap-only tuple updates, and now write every index on the table.

[think]

The answer is D: those updates lose heap-only updates and now write every index.

A heap-only update requires that no indexed column changes. Indexing last-seen took heap-only updates from 97.6 percent to zero in the lab, so the busiest write now inserts into every index, with the matching write-ahead log and bloat. Index scans take no locks that block updates, and the cost is paid on every write whether or not the report ever runs.

## Question 7

Two concurrent requests each read an account balance, subtract 40 in application code, then write the computed value back, inside a transaction at Postgres's default isolation level. What can happen?

A, a deadlock, since each request holds the row lock the other needs. B, nothing bad, because the transaction serialises both read-modify-write cycles. C, a serialisation error on one of them, which must then be retried. D, a lost update, as both read the same balance and the second write wins.

[think]

The answer is D: a lost update.

Under read committed, nothing stops both transactions reading the same value. The second update waits for the first's row lock, then overwrites its result. There is no serialisation error at this level, and no deadlock with a single row. The fixes: compute in SQL, balance equals balance minus 40; lock the row with select for update; or run at a stricter level with retries.

## Question 8

Your client sends commit for a money transfer, and the connection resets before any reply arrives. What is the safe handling?

A, assume it committed, because commit is only sent after every write. B, store an idempotency key under a unique constraint, and retry. C, assume it failed and retry, since unacknowledged commits roll back. D, reconnect and check the activity view to see how the session ended.

[think]

The answer is B: store an idempotency key under a unique constraint, and retry.

The outcome is unknown to the client: the commit record may or may not have been flushed. A blind retry risks a double transfer, and assuming success risks a lost one. The old session is gone from the activity view either way. A key written in the same transaction turns the retry into a detectable duplicate if the first attempt did commit.

## Question 9

Two sessions at Postgres repeatable read each count the bookings for room 3 on a given day, see zero, and then insert a booking for it. What happens?

A, the second commit fails with a serialisation error, because both read one predicate. B, both commit, since the inserts share no row, and the room is double-booked. C, the second count sees the first insert, so it never inserts at all. D, the second insert blocks on the first's row lock, then fails at commit.

[think]

The answer is B: both commit, and the room is double-booked.

This is write skew through phantoms. Both snapshots legitimately show zero, and the writes are new rows, so first-updater-wins has no write-write conflict to detect. Aborting on a shared read predicate is what serializable adds. A unique or exclusion constraint would reject the second insert at any level.

## Question 10

A nightly job sums balances with one select per batch of 10 thousand accounts, all inside one read committed transaction, while transfers keep running. The totals are occasionally wrong. What is the fix?

A, run the job at repeatable read, so every batch shares one snapshot. B, add an index, so each batch is bounded and phantoms cannot appear. C, run the job at read uncommitted, so it sees transfers in progress. D, read each batch with select for update, to block the transfers.

[think]

The answer is A: run the job at repeatable read, so every batch shares one snapshot.

Read committed takes a new snapshot per statement, so a transfer that commits between two batches is counted on one side only. That is read skew, and the lab reproduced it. One snapshot for the whole job fixes it without blocking writers. Locking every row would stall transfers, and Postgres treats read uncommitted as read committed anyway.

## Question 11

A queue table of 168 kilobytes has grown to 17 megabytes. Vacuum verbose reports 200 thousand tuples that are dead but not yet removable. What should you check first?

A, whether autovacuum is disabled, or throttled too hard to keep up. B, whether the disk is too full for vacuum to compact the file. C, whether the table is missing an index on its run-at column. D, what is pinning the oldest visible transaction horizon, such as an idle transaction.

[think]

The answer is D: what is pinning the horizon, such as an idle transaction.

Vacuum ran and found the tuples, so it is not disabled. It refused to remove them because some snapshot might still need them. Look in the activity view for sessions holding old snapshots, then at replication slots and prepared transactions. In the lab, ending one idle session let the next vacuum remove all 200 thousand.

## Question 12

Twenty workers each select the oldest job, ordered by run-at, limit one, for update, then process the job and delete it. Throughput equals one worker's. Why, and what fixes it?

A, Postgres limits concurrent writers per table, so partition the jobs table. B, for update takes a table lock, so workers run one by one; use for share. C, without an index on run-at, every worker scans the table; add one. D, all workers pick the same oldest row and queue on it; add skip locked.

[think]

The answer is D: they all queue on the same row, so add skip locked.

Every worker's query finds the same row first, so all but one wait on its row lock. The lab measured 390 jobs a second with 16 workers, against 5,807 with skip locked. For update locks rows, not tables, and there is no per-table writer limit. A lease column covers workers that crash mid-job.

## Recap

Three ideas kept coming back. First, the planner and the storage engine do exactly what the structure allows: column order in an index, a missing index on a foreign key, or one new indexed column can turn a cheap operation into a scan or a write on every index. Second, concurrency anomalies are specific: a lost update from read-modify-write, read skew across statements, write skew through phantoms, each with its own fix. And third, a stuck or slow system often has one culprit holding something: an idle transaction pinning vacuum, or one hot row every worker queues on.
