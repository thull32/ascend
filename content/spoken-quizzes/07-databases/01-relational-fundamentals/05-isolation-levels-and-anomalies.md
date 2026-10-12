---
lesson: isolation-levels-and-anomalies
source: 3ba84d50fd49c6e1
---
## 1

Two sessions at Postgres repeatable read each count the bookings for room 3 on a given day, see zero, and then insert a booking for it. What happens?

A, the second commit fails with a serialisation error, because both read one predicate. B, both commit, since the inserts share no row, and the room is double-booked. C, the second count sees the first insert, so it never inserts at all. D, the second insert blocks on the first's row lock, then fails at commit.

[think]

The answer is B: both commit, and the room is double-booked.

This is write skew through phantoms, which the lab reproduced with welcome credits. Both snapshots legitimately show zero, and the writes are new rows, so first-updater-wins has no write-write conflict to detect. Aborting on a shared read predicate is what serializable adds. A unique or exclusion constraint would reject the second insert at any level.

## 2

At read committed, two concurrent runs of an update that sets stock to stock minus 1, for item 7, starting from 10, end at 8. But reading the stock first, then setting it to the computed 9, ends at 9. Why the difference?

A, single statements are silently promoted to serializable by Postgres. B, the atomic form takes a table lock, so the two runs cannot overlap. C, neither is safe; the atomic form only happened to win the race. D, a blocked update re-reads the committed row, and recomputes stock minus 1 from it.

[think]

The answer is D: a blocked update re-reads the committed row and recomputes.

When the second update finds the row locked, it waits, then fetches the newly committed version, re-checks its condition, and computes the new value from it, which returns 8. In the two-statement form, the value 9 was computed from a read that is stale by the time it is written. Only a row lock is taken, and no promotion happens.

## 3

A nightly job sums balances with one select per batch of 10 thousand accounts, all inside one read committed transaction, while transfers keep running. The totals are occasionally wrong. What is the fix?

A, run the job at repeatable read, so every batch shares one snapshot. B, add an index, so each batch is bounded and phantoms cannot appear. C, run the job at read uncommitted, so it sees transfers in progress. D, read each batch with select for update, to block the transfers.

[think]

The answer is A: run the job at repeatable read, so every batch shares one snapshot.

Read committed takes a new snapshot per statement, so a transfer that commits between two batches is counted on one side only. That is read skew, and the lab reproduced it. One snapshot for the whole job fixes it without blocking writers. Locking every row would stall transfers, and Postgres treats read uncommitted as read committed anyway.

## 4

An application moves from MySQL to Postgres, both at repeatable read, and starts seeing errors saying it could not serialize access due to concurrent update. What does that tell you?

A, read-modify-writes that InnoDB overwrote silently now abort. B, the migration switched the default to serializable for all sessions. C, Postgres takes gap locks that InnoDB avoids, so inserts now conflict. D, Postgres detects write skew at repeatable read, which InnoDB permits.

[think]

The answer is A: read-modify-writes that InnoDB overwrote silently now abort.

InnoDB's repeatable read lets an update act on the latest committed version, so a stale read followed by a write overwrites the other transaction's change without an error. Postgres's first-updater-wins rule aborts the second writer instead. The errors reveal lost updates the old system was committing. Write skew still commits at Postgres repeatable read, and gap locks are InnoDB's mechanism.

## 5

A team enables serializable and sees many serialisation failures on a table that most transactions read with sequential scans. What is the most likely contributor?

A, serializable takes an exclusive lock on every row a transaction reads. B, the retry loop is too eager, so each retry collides with the one before. C, sequential scans take relation-level predicate locks, so writes conflict. D, read committed sessions on the same table are counted as conflicts too.

[think]

The answer is C: sequential scans take relation-level predicate locks.

These predicate locks block nothing, but they drive conflict detection. A sequential scan records the coarsest one, on the whole relation, so nearly every concurrent write forms a read-write dependency, including false positives. Index scans lock index pages instead, so suitable indexes cut aborts. Transactions not running at serializable are invisible to the detector.

## 6

With 16 clients and a thousand accounts, serializable retried 4.3 percent of transfers. With 10 accounts, it retried 60 percent. What does that show?

A, serializable is broken for small tables and should not be used there. B, the benchmark's retry option itself causes most of the serialisation failures. C, retries are driven by contention on hot rows, not by a fixed cost of serializable. D, the serializable bookkeeping is expensive, and grows with the number of accounts.

[think]

The answer is C: retries are driven by contention on hot rows, not a fixed cost.

Fewer accounts means more transactions touching the same rows at once, so more concurrent-update conflicts and dangerous structures. At low contention, the strict levels cost under 10 percent of throughput. The abort rate is a property of the workload, which is why you measure on your own contention profile rather than quoting a fixed overhead.
