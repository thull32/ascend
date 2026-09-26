---
slug: storage-and-scale
title: Storage engines and scaling
description: What the database does with your bytes on disk and in memory, how it copies them to other machines, how it splits them across machines, and why the connection between your service and the database is the resource you run out of first.
prerequisites: [databases/relational-fundamentals]
---
The first module explained what the database promises. This one explains what it costs to keep those promises and what happens when one machine is no longer enough.

It starts inside a single Postgres node: the 8 KiB page, the buffer pool that decides which pages live in memory, the write-ahead log that turns random writes into one sequential stream, and the checkpoint and recovery machinery that make a crash boring. Once you can picture a `COMMIT` as an `fsync` of a few hundred bytes of WAL rather than a rewrite of a table, replication becomes obvious: it is the same WAL stream sent over a network. Replication lag, failover, split brain and the "I just saved that and now it is gone" bug are all consequences of where that stream has and has not reached.

The second half is about the limits of one node. Partitioning splits a table inside the database so the planner can skip most of it; sharding splits a dataset across databases and makes you the planner. Choosing a shard key badly is the most expensive reversible-in-theory decision in backend engineering, so the lesson spends its time on how to choose and how to move data without downtime when you chose wrong. The module closes with connections, because in practice the first thing that falls over under load is not the disk or the CPU but the pool of connections between your service and the database, and the arithmetic for sizing it is short enough to do in an interview.

Every lesson uses Postgres as the reference implementation, shows the catalogue queries and `EXPLAIN` output you would use to check your reasoning, and names where other engines (MySQL, RocksDB, Cassandra) make a different trade.
