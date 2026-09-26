---
slug: relational-fundamentals
title: Relational fundamentals
description: How a relational database turns your SQL into page reads, keeps your invariants under concurrent writes, and where each of those guarantees quietly stops.
prerequisites: [data-structures/hashing]
---
Most engineers learn SQL as a syntax and the database as a black box that returns rows. That is enough until the first query that takes 40 seconds, the first report that double-counts, or the first deadlock in production. Each of those has a precise mechanical cause, and every senior engineer you will interview with expects you to be able to name it.

This module works through the relational engine from the outside in. It starts with the model itself: what a relation is, why keys and normal forms exist, and when a senior engineer deliberately breaks them. It then follows a query through the planner, the three join algorithms and the statistics that choose between them, and into the B-tree index that makes the difference between a scan of a hundred million rows and four page reads.

The second half is about correctness under concurrency. Transactions and the write-ahead log explain how the database can promise your commit survived a power cut. Isolation levels explain the anomalies that the default settings permit, including the write skew that has cost real companies real money. Multi-version concurrency control and locking explain how Postgres lets readers and writers coexist, why that leaves garbage for `VACUUM`, and how to build a job queue that does not serialise on a single row.

Every lesson uses the Postgres dialect and shows the `EXPLAIN` output or the interleaved session transcript you would use to prove your reasoning to a colleague.
