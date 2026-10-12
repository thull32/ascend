---
lesson: schema-migrations-at-scale
source: b726ba810925d196
---
## 1

A migration adds a nullable text column to the orders table, with no default. It should take milliseconds, yet reads on orders stop for four minutes. What is the most likely cause?

A, adding a text column writes an empty pointer into each existing row. B, the connection pool was too small for the migration and the API together. C, adding the column rewrote every row of the table under an exclusive lock. D, the alter waited behind an open transaction, and reads queued behind it.

[think]

The answer is D: the alter waited behind an open transaction, and reads queued behind it.

Adding a nullable column is catalog-only. But the alter needs access exclusive, so it waits for an existing reader's lock, and because a new request must not conflict with waiting requests either, every later select queues behind the alter. The lab showed readers blocked by the migration, not by the report. A lock timeout with retries capped reader latency at 200 milliseconds.

## 2

Which of these statements rewrites the whole table on Postgres 17?

A, adding a not null text column with the constant default new. B, changing a varchar column's limit from 20 characters to 40. C, adding a timestamp column whose default is now. D, adding a UUID column whose default is gen random UUID.

[think]

The answer is D: adding a column whose default is gen random UUID.

That function is volatile, so each row needs its own value, and the table is rewritten: 2.7 seconds and a new file in the lab. Now is stable, so it is evaluated once and stored as the missing value, and every old row gets the same timestamp without a rewrite. Constant defaults have been catalog-only since Postgres 11, and widening a varchar needs no data change.

## 3

Create index concurrently was cancelled by the lock timeout during its waiting-for-old-snapshots phase. What does the catalog show for the index, and what does it cost?

A, not valid, but ready: writes maintain it, and queries skip it. B, nothing: a failed concurrent build is rolled back like any transaction. C, neither valid nor ready: a harmless empty catalog entry. D, a valid index, which the planner will use once analyze has run.

[think]

The answer is A: not valid but ready, so writes maintain it and queries skip it.

By that phase the index was built and marked ready, so every insert and update maintains it; 200 thousand inserts went from 356 milliseconds to 504 in the lab. But it was never marked valid, so the planner ignores it. A build that fails earlier, such as on a duplicate key, leaves an empty unready entry instead. Drop it concurrently, or reindex concurrently.

## 4

You must add not null to a column of a 2 terabyte table on Postgres 17, without blocking traffic. Which sequence works?

A, set not null directly, since Postgres 12 no longer scans for nulls. B, add a not null column with a default, then drop the original column. C, add a check that the column is not null, marked not valid; validate it; then set not null. D, create a unique index concurrently on the column, since it rejects null values.

[think]

The answer is C: a not valid check, then validate, then set not null.

The not valid check is instant. Validate scans under share update exclusive, while reads and writes continue. Set not null then uses the validated check to skip its own scan, as the debug message in the lab confirmed. A bare set not null scans under access exclusive, and unique indexes allow multiple nulls.

## 5

A backfill updates 2 million rows in one update statement. It finishes in 4.4 seconds, about as fast as batches. What is the main cost of doing it that way?

A, every updated row stays locked until the end, stalling application writes. B, it writes several times more WAL in total than batches of 10 thousand rows. C, it prevents heap-only updates, which small batches would have allowed. D, it takes an access exclusive lock on the table for the whole run.

[think]

The answer is A: every updated row stays locked until the end, stalling application writes.

Total WAL was similar in every run, about 300 bytes per row, and an update takes only a row exclusive lock on the table. But its row locks last until commit: concurrent single-row application updates waited 1.2 seconds on average and up to 4.2, against about 80 milliseconds with batches of 10 thousand. And the 690 megabytes of WAL arrived as one transaction for replicas and change data capture.

## 6

In expand and contract, why does the code start writing the new columns before it starts reading them?

A, because reads are more expensive than writes, so the cheaper change should always ship first. B, because Postgres will not build an index on a column until at least one row holds a value. C, so the backfill can run inside the migration transaction without holding any row locks. D, so rows written after that deploy are already right, and the backfill covers only older rows.

[think]

The answer is D: so new rows are already right, and the backfill covers only older ones.

Once every write fills both shapes, only rows older than that deploy need the backfill, and the read switch can then be verified against a complete data set. Reading first would return nulls for every row not yet backfilled. And the backfill belongs in a batched job, not in the migration transaction.
