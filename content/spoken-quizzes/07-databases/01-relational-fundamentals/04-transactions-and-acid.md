---
lesson: transactions-and-acid
source: 8cf6a1f0913535c8
---
## 1

A Postgres transaction updates 2 million rows in 16 seconds, then rolls back in 0.2 milliseconds. Where did the cost of undoing it go?

A, nowhere; the new versions were only in memory, and are discarded. B, to log replay, which reverts the pages during the next checkpoint. C, to vacuum, which must later remove 2 million dead row versions. D, to an undo log that background threads apply after the rollback returns.

[think]

The answer is C: to vacuum, which must later remove 2 million dead row versions.

The rollback only marks the transaction as aborted in the commit log, which makes every version it wrote invisible. Those versions stay on the pages as dead tuples, and the table grew from 143 megabytes to 260, until vacuum reclaims them. Postgres has no undo log, and the versions were already written to shared buffers, and partly to disk.

## 2

A two-row transfer writes 296 bytes of write-ahead log at steady state, but about 33 kilobytes immediately after a checkpoint. Why?

A, each page's first change after a checkpoint logs a full image of the page. B, checkpoints disable heap-only updates until the next autovacuum finishes. C, the commit record carries every modified row after a checkpoint. D, log compression is only applied between checkpoints, not after them.

[think]

The answer is A: each page's first change after a checkpoint logs a full image.

With full-page writes on, the first modification of a page after a checkpoint includes an image of the whole page, so recovery can repair a page torn by a crash mid-write. Later changes to the same page log only the change. In the traced case, the full pages also forced updates that were not heap-only, and index inserts, but the images account for most of the bytes.

## 3

With synchronous commit on and one client, a laptop does 623 commits a second. With 16 clients it does 7,749. What explains the scaling?

A, each client uses its own log file, so the flushes run in parallel. B, commits from different clients do not need a flush once the first has one. C, Postgres switches to asynchronous commit once there are many clients. D, group commit: one flush makes all the queued commit records durable.

[think]

The answer is D: group commit, where one flush makes all queued commit records durable.

There is one log stream. A flush writes everything up to a position, so commit records appended while a flush is in progress are covered by the next one; the lab measured 7.9 commits per flush with 16 clients. Every commit still waits for a flush that includes its record. Nothing switches to asynchronous mode.

## 4

Two concurrent requests each read an account balance, subtract 40 in application code, then write the computed value back, inside a transaction at Postgres's default isolation level. What can happen?

A, a deadlock, since each request holds the row lock the other needs. B, nothing bad, because the transaction serialises both read-modify-write cycles. C, a serialisation error on one of them, which must then be retried. D, a lost update, as both read the same balance and the second write wins.

[think]

The answer is D: a lost update.

Under read committed, nothing stops both transactions reading the same value. The second update waits for the first's row lock, then overwrites its result. There is no serialisation error at this level, and no deadlock with a single row. The fixes: compute in SQL, setting the balance to itself minus 40; lock the row with select for update; or run at a stricter level with retries.

## 5

Your client sends commit for a money transfer, and the TCP connection resets before any reply arrives. What is the safe handling?

A, assume it committed, because commit is only sent after every write. B, store an idempotency key under a unique constraint, and retry. C, assume it failed and retry, since unacknowledged commits roll back. D, reconnect and check the activity view to see how the session ended.

[think]

The answer is B: store an idempotency key under a unique constraint, and retry.

The outcome is unknown to the client: the commit record may or may not have been flushed. A blind retry risks a double transfer, and assuming success risks a lost one. The old session is gone from the activity view either way. A key written in the same transaction turns the retry into a detectable duplicate if the first attempt did commit.

## 6

A service turns synchronous commit off for its page-view inserts. What is the real risk?

A, inserts may become durable in a different order than they committed. B, a server crash can lose up to about 600 milliseconds of acknowledged inserts. C, other sessions may read page views before their transactions commit. D, a crash can leave data pages corrupted, because the log was never flushed.

[think]

The answer is B: a crash can lose up to about 600 milliseconds of acknowledged inserts.

Commit returns before the log flush, and the log writer flushes every 200 milliseconds, so a crash can lose up to three times that of acknowledged transactions. Ordering and visibility rules are unchanged, and nothing is corrupted, because the log still reaches disk before the data does. Corruption is the risk of turning fsync off, a different setting.
