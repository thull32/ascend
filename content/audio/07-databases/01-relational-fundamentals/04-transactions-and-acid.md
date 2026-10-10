---
lesson: transactions-and-acid
source: 7c49a8a839894ff4
fit: great
desk:
  - "The pg_walinspect output for one transfer, before and after a checkpoint"
  - "The pgbench table for synchronous_commit and group commit"
  - "The retry loop in Python and the budget reservation in the app's code"
  - "Exercise: recover a database from its log with redo and undo"
---
## Introduction

A wallet service moves money in two statements: debit the customer, credit the merchant. The process is killed by the out-of-memory killer between them. The driver was in autocommit mode, so each statement was its own transaction. The debit is committed and durable, and the credit never happened. Forty pounds has left the system, and nobody notices until the monthly reconciliation fails.

Wrap both statements in one transaction, and the same crash leaves neither. That is the promise everyone remembers from ACID. The other three letters promise something narrower than most engineers assume, and the gaps between what they promise and what people believe are where production bugs live.

So: what each letter actually does in Postgres, what a commit costs, and the five transaction bugs application code keeps reintroducing.

## The transaction boundary

A transaction is a group of statements treated as one unit: either all their effects become visible and permanent, or none do. Without an explicit begin, Postgres runs every statement in its own transaction. And drivers add defaults that differ in ways that bite.

Python's psycopg is not in autocommit mode by default. The first statement silently opens a transaction that stays open until you commit. A script that runs one select and then sleeps holds a transaction open the whole time, shows up as idle in transaction, and blocks vacuum. The Rust libraries this app uses go the other way: autocommit, unless you call begin, and dropping the transaction without committing rolls it back, so an early error return undoes the work. And many ORMs wrap each save in its own transaction: atomic per object, not across objects.

## Atomicity is a status flip

How can Postgres undo a transaction that has already written a million rows to pages, some of them already on disk? It does not undo anything.

Every row version a transaction writes is stamped with its transaction ID. The fate of each transaction is recorded separately, in a commit log of two bits per transaction: in progress, committed, or aborted. A reader that meets a row version checks the status of the transaction that wrote it. If that transaction aborted, the version is invisible, wherever it sits.

So commit writes a commit record to the log, flushes it, and sets two bits. Abort just sets the bits to aborted. The dead versions stay where they are until vacuum reclaims them.

Measured on a 2 million row table: an update of every row took 16 seconds. The rollback that followed took 0.2 milliseconds. The cost moved elsewhere: the table grew from 143 megabytes to 260, with 2 million dead rows for vacuum to clean.

MySQL's InnoDB makes the opposite choice. It updates rows in place and keeps old values in an undo log, so a rollback replays the undo log backwards, and its manual warns that can take several times as long as the original changes. Killing the server does not help, because the rollback resumes after restart. Postgres pays later, in vacuum. InnoDB pays at rollback.

Two consequences surprise people. First, one error poisons the transaction: after any error, every further statement fails until you roll back. Second, savepoints are not free. Each one that writes gets a sub-transaction ID, and each session caches only 64 of them. Past that, visibility checks hit a small shared cache backed by disk, and throughput falls off a cliff. GitLab traced stalls on its replicas to exactly this in 2021, and fixed them by removing every savepoint its Rails code issued, mostly in favour of insert on conflict.

## The log behind durability

Durability and atomicity both rest on the write-ahead log. The lesson inspected exactly what one transfer writes. At steady state: a small prune record before each update, two in-place updates of 72 bytes each with no index change, and a commit record of 34 bytes. The whole transfer: 296 bytes of log. When that commit record is flushed to disk, the transfer is durable.

Now the same transfer immediately after a checkpoint, on full pages. The first change to any page after a checkpoint writes a full image of the page, so recovery can repair a page torn by a crash mid-write. And the full pages had no room, so the new versions went to other pages, which meant new index entries too. The same 296 byte transfer became about 33 kilobytes.

The rule underneath is write-ahead: the database will not write a changed data page to disk until the log describing that change is flushed. So data pages can stay dirty in memory for minutes, and after a crash, replay from the last checkpoint rebuilds them. A rollback writes a tiny abort record and does not even wait for it, since losing it changes nothing. A read-only transaction writes no commit record at all.

## Consistency is yours

The database cannot know your invariants, like "a balance never goes negative". It promises something narrower: a transaction moves the database from one state satisfying the declared constraints to another, or it fails.

So declare them. Add a check constraint that the balance is at least zero, and a race that would have overdrawn an account becomes an error instead of silent corruption. Check and not null are verified on each row as it is written. Foreign keys are checked at the end of the statement, or at commit if you declare them deferrable, which is how you insert two rows that reference each other. Every invariant you cannot declare is enforced by your code, inside transactions, under whatever isolation level you chose.

## What a commit costs

Durable means that once commit returns, the transaction survives a crash, because its commit record was flushed to disk. That flush is the most expensive thing a typical transaction does. On the lab machine, a virtual disk, one flush took about 1.4 milliseconds.

With one client and synchronous commit on, every commit waits for its own flush: 623 commits a second, one over the flush time. Now add clients. Before I say it: what happens to throughput with 16 clients, if each commit still needs a flush?

[pause]

It went up 12 times, to about 7,700 a second, at similar latency. That is group commit. A flush writes all the log up to a position, so while one session waits for the disk, others append their commit records behind it, and the next flush covers all of them. Almost eight commits per flush.

Turn synchronous commit off, and commit returns as soon as the record is in memory. A background writer flushes every 200 milliseconds. One client went to about 6,400 a second, and 16 clients to about 72 thousand. What you can lose is up to three times that interval, about 600 milliseconds of acknowledged commits, on a server crash. Never corruption, never half a transaction. Do not confuse it with turning fsync off, which can corrupt the whole cluster.

And you can set it per transaction, which makes durability a dial. Off for page views. On, with a synchronous standby, for payments, where the commit waits until a second machine has flushed it too.

Durability also depends on layers below Postgres. The disk must tell the truth: consumer SSDs and some virtual disks acknowledge writes from a volatile cache, and a power cut loses commits the database was told were safe. And durable means this machine. A dead disk loses everything not on a replica or in a backup.

Isolation, the last letter, gets its own lesson. For now: Postgres defaults to read committed, which permits lost updates and write skew. "We use transactions" does not mean "we are safe from concurrency bugs".

## Five bugs that keep coming back

First, read-modify-write in the application. Two requests both read a balance of 10 thousand, both write 6 thousand, and one withdrawal disappears. A transaction at the default level does not help. Push the arithmetic into one statement: set the balance to the balance minus 40 pounds, only where the balance is at least that, and return the new value. Zero rows back means insufficient funds. This app does it throughout, with upserts that return the row and server-side appends to a JSON transcript, tested with 20 concurrent appends that must all survive. Where one statement is not enough, like the AI budget, it locks the usage row, decides in code, records a hold like a card authorisation, and commits before calling the model. Thirty concurrent reservations against a limit of 10 got exactly 10.

Second, slow work inside a transaction. A handler locks an order row, then calls a payment provider: 800 milliseconds typically, 30 seconds at worst. For that whole time it holds row locks, a pooled connection and the oldest snapshot vacuum must respect. At 50 requests a second the pool drains in seconds. Record the intent, commit, make the call, and record the outcome in a second transaction. Set an idle-in-transaction timeout as a guard rail.

Third, not retrying the failures meant to be retried. Serialisation failures and deadlocks mean the database aborted you to protect correctness. Retry the whole transaction, reads included, with jittered backoff. Retrying only the failed statement is wrong, because every read it made is now invalid.

Fourth, the commit whose outcome you do not know. The connection drops after you send commit and before the reply. Did it happen? The client cannot tell. Make the transaction idempotent: store a client-generated key under a unique constraint in the same transaction, so a retry of a committed transfer fails with a unique violation that means "already done". That is why payment APIs like Stripe take an idempotency key.

Fifth, the transaction that is too big. A backfill of 80 million rows writes 80 million new versions and tens of gigabytes of log for replicas to replay, holds every row lock until the end, and if it fails at 95 percent throws all of it away. At the lab's rate, that is about 11 minutes in one transaction. Do 5,000 rows per transaction by key range, commit, and repeat.

## In the interview

A follow-up the lesson expects. What exactly is on disk when commit returns?

[pause]

The log records up to and including the commit record, flushed. The data pages may still be dirty in memory, and they are rebuilt from the log after a crash. The wrong answer is "the updated rows are written to the table".

And: why is a Postgres rollback instant when an InnoDB rollback is not? Postgres wrote new versions and makes them invisible by flipping two status bits. InnoDB updated rows in place and must apply its undo log. Postgres pays later, in vacuum. The wrong answer is "Postgres keeps changes in memory until commit", when 2 million new versions were already on pages.

## Recap

Four things to remember. Atomicity in Postgres is a status flip, so rollback is instant and vacuum pays the bill. Consistency covers only the constraints you declare, so declare them. A commit costs a log flush, group commit is why throughput scales with clients, and synchronous commit off loses recent commits but never corrupts. And the bugs are in application code: read-modify-write, slow calls inside transactions, missing retries, unknown commit outcomes, and giant backfills.

At your desk: the write-ahead log records for one transfer, the commit benchmark table, the retry and budget code, and the recovery exercise.
