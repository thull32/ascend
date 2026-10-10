---
lesson: isolation-levels-and-anomalies
source: 44529b07cc492d21
fit: great
desk:
  - "The two-session timelines for read skew, phantoms, lost updates and write skew"
  - "The table of which level prevents each anomaly in Postgres and in InnoDB"
  - "The dangerous-structure diagram for serialisable snapshot isolation"
  - "The pgbench contention table for the three levels"
  - "Exercise: find write skew in a schedule"
---
## Introduction

Every new account gets one welcome credit. The code is careful and runs in a transaction: count this user's welcome credits, and if there are none, insert one. A user double-clicks. Two requests arrive 3 milliseconds apart. Both count, both see zero, both insert. The user has two credits.

Under Postgres's default isolation level, that is allowed. Under repeatable read, it is still allowed. Only serialisable, or a constraint, stops it.

A transaction guarantees atomicity. How well it is protected from other transactions running at the same time depends on the isolation level, and the default in almost every database permits anomalies that break real invariants. Here is the plan: the anomalies, from mildest to the one that survives repeatable read; how to stop each; how Postgres's serialisable mode works; and what the strict levels cost. Every result was produced with two real sessions, interleaved step by step.

## Dirty reads, read skew and phantoms

A dirty read is seeing another transaction's uncommitted write. In Postgres it never happens. You can ask for read uncommitted, and Postgres accepts the name and runs read committed, because a version written by a transaction still in progress is invisible to everyone else. MySQL's InnoDB does implement it and hands you the dirty value.

The next one is subtler. Under read committed, every statement takes a fresh snapshot. So picture two accounts, the first holding 10 thousand and the second empty. Session A reads the first: 10 thousand. Session B moves 4 thousand from the first to the second and commits. A reads the second: 4 thousand. A's total is 14 thousand, a figure that existed at no instant. That is read skew. Each read was correct, and together they describe a moment that never happened. It is how nightly reports produce totals that never existed, and the fix is to run the reader at repeatable read, where one snapshot serves every statement in the transaction.

A phantom is the same problem for a set of rows. A counts bookings for a room, B inserts one and commits, and A counts again: zero then one at read committed, zero then zero at repeatable read. The standard permits phantoms at repeatable read, but Postgres is stricter, because its snapshot simply does not contain rows committed after it was taken.

## Lost updates, and why one statement is safe

Two transactions read a stock count of 10, each computes 9 in the application, each writes 9. A's update goes first; B's update blocks on A's row lock. A commits. At read committed, B's update then succeeds, and the stock is 9. Two items sold, stock decremented once, and nothing complained.

At repeatable read, B instead gets an error: could not serialise access due to concurrent update. The second writer aborts and must retry.

Now change B to the atomic form, keeping read committed: set stock to stock minus one, where stock is above zero, returning the result. B returns 8. Correct. Why does one statement work when two do not?

[pause]

Because of a mechanism Postgres calls EvalPlanQual. When an update at read committed finds its target row locked, it waits. When the locker commits, it fetches the newly committed version, re-evaluates the where clause against it, and computes the new value from it. The decrement applies to the current value. One caveat: the re-check only covers rows the statement had already found. Rows that only start to match because of the other transaction are not picked up.

This app leans on that. Finishing an interview is one conditional update, where the status is still active or grading. Two racing finish calls both reach the update; the second re-checks the now-committed row, finds it completed, updates nothing, and reports a conflict. A test runs two concurrent finishes and asserts exactly one succeeds.

## Write skew

Here is the anomaly that survives repeatable read. A hospital requires at least one doctor on call per shift. Alice and Bob are both on call for shift 7, and both feel unwell. Both start a repeatable read transaction. Both count the doctors on call: two. Alice takes herself off call. Bob takes himself off call. Both commit. Both succeed. Doctors on call: zero.

Each transaction checked the invariant against its snapshot, and the check was true. Each wrote a different row, so first-updater-wins had nothing to compare. Snapshot isolation only detects two writes to the same row, and these write sets do not overlap. That is write skew: two transactions read overlapping data, make disjoint writes, and each write invalidates the other's premise.

The welcome credit is the same shape with inserts, and worse, because there is no existing row either transaction could even have locked. Double-booked rooms, usernames claimed twice, two admins each demoting the other: all write skew.

Rerun both at serialisable, and the first commit succeeds while the second fails, with a message that it was cancelled on identification as a pivot. One doctor stays on call. Bob's retry sees one active doctor and refuses to go off shift.

## Names do not travel

A warning about databases. Postgres's repeatable read is snapshot isolation: no phantoms, lost updates abort, write skew commits. InnoDB's default is also called repeatable read, but only plain selects read the snapshot. Updates and locking reads act on the latest committed version. So the two-statement lost update that Postgres aborts commits silently on InnoDB at the same level name. InnoDB's serialisable is lock-based instead: in the welcome credit case, both counts take shared locks on the gap where the credit would go, both inserts wait for each other, and the deadlock detector aborts one. And Oracle's serialisable is snapshot isolation, so it permits write skew. Read the documentation, or test the interleaving. Never infer guarantees from the name.

## Three ways to stop write skew, and one trap

First, make the database enforce the invariant. A unique partial index, one welcome credit per user, holds at every isolation level. So does an exclusion constraint against overlapping bookings. This app does it for interviews, with a unique index allowing one active interview per user, replacing a check-then-insert that could race. A constraint cannot be forgotten by the next engineer who writes a new code path.

Second, materialise the conflict with a lock. If both transactions must lock the same row before deciding, they serialise. For the doctors, select the on-call rows for update. Bob now blocks until Alice commits, then sees one doctor. For the insert case there is no row yet, so lock a parent row that always exists, such as the user, or take an advisory lock on the key.

Third, run at serialisable, with a retry loop.

The trap is folding the check into the write: an update that takes Alice off call only where a subquery counts more than one doctor. It looks atomic. It is not. The subquery reads a snapshot without Bob's uncommitted change, the two updates touch different rows so neither blocks, and the re-check only looks at the updated row, not the subquery's rows. Both commit.

## How serialisable snapshot isolation works

Postgres's serialisable mode runs exactly like repeatable read, with no extra blocking, and additionally records what each transaction read. Those records are called SIRead locks, and they block nothing. From them it tracks a particular kind of edge: transaction one read a version that transaction two later overwrote, so one did not see two's write and must come first in any serial order.

The theory proves that every snapshot-isolation anomaly contains a dangerous structure: two of those edges in a row, with the last transaction committing first. In write skew, Alice read the row Bob wrote, and Bob read the row Alice wrote. Two edges, a cycle, and the middle transaction is the pivot. When the structure completes, Postgres aborts a participant.

Three practical consequences. Granularity creates false positives: a sequential scan locks the whole table at once, so any concurrent write to that table forms an edge, while index scans lock much finer. Good indexes cut serialisation failures. Second, everyone must participate: a read committed writer on the same tables is not tracked and can still produce an anomaly. Third, test the guarantee. Jepsen's 2020 analysis of Postgres 12.3 found a bug in exactly this conflict detection, fixed in that August's releases. Isolation is implemented code.

## What the strict levels cost

Sixteen clients ran transfers for 6 seconds. With a thousand accounts, read committed did about 19 thousand a second, and serialisable about 17,600, with about 4 percent retried. Under 10 percent of throughput, and the retries came from two transactions touching the same account, not from the bookkeeping.

With only ten hot accounts, it changed completely. Read committed did about 8 thousand a second, queuing on row locks. Serialisable did about 2,200, retried 60 percent of attempts, and 2 percent failed even after 50 tries. The real cost of serialisable is the abort rate on hot data, and that is a property of your workload, not a constant.

Isolation also stops at the server's edge. A read from a replica trails the primary, so two reads split between primary and replica can show read skew at any level, and Postgres refuses serialisable on a standby. Behind a transaction-mode pooler, set the level per transaction or per role, never with a session setting that leaks to the next client. And a balance read from Redis has no isolation at all. Decisions that protect invariants must read from the database, inside the transaction.

So choose. Read committed plus discipline: single-statement updates, locks when a decision depends on rows you will write, constraints for every invariant that can be one. Fast, and what most Postgres shops do, but correctness depends on every engineer spotting every race. Or serialisable plus retries everywhere, where correctness no longer depends on spotting races, at the cost of retry machinery, throughput on hot rows, and keeping side effects out of transactions. A retried transaction must not have already sent the email.

## In the interview

A follow-up the lesson expects. Your service runs at repeatable read. Is it safe from lost updates?

[pause]

In Postgres, yes for a two-statement read-modify-write on the same row: the second writer aborts and must retry. But not from write skew. And in InnoDB, no, because updates read the latest version. The wrong answer is "repeatable read means nothing changes under you", which ignores both write skew and engine differences.

And another: serialisable doubled your abort rate. What do you look at? Whether hot queries are sequential scans, which take table-level predicate locks; how long transactions are; and hot rows. Add indexes, shorten transactions, keep a jittered retry loop. The wrong answer is "switch back to read committed", which brings the anomalies back silently.

## Recap

Four things to remember. Name the anomaly, not "a race": read skew, phantom, lost update, write skew, each with its own fix. A single conditional update is safe at read committed because the blocked update re-checks the committed row; select then update is not. Repeatable read in Postgres is snapshot isolation, and write skew commits through it. And stop write skew with the cheapest mechanism that works: a constraint first, then a lock both transactions must take, then serialisable with retries.

At your desk: the two-session timelines, the comparison table for Postgres and InnoDB, the dangerous-structure diagram, the contention benchmark, and the write skew exercise.
