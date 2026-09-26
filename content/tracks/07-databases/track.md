---
slug: databases
title: Databases Inside Out
description: Understand what a database actually does with your query, your transaction and your disk, so you can pick, model, index, scale and migrate one without guessing.
icon: database
phase: 4
---
Every service you have shipped is, underneath, a thin layer of code around a database. When that service is slow, the database is usually why. When it loses data, corrupts an order, double-charges a customer or falls over at 3 a.m., the cause is almost always a database mechanism the team did not understand: an isolation level that permits write skew, an index that does not cover the query, replication lag that makes a user's own write disappear, or a connection pool sized by guesswork.

This track opens the box. You will see how a B-tree index turns a full scan into four page reads, how the write-ahead log lets Postgres promise durability without waiting on random disk writes, how MVCC lets readers and writers coexist and why that leaves garbage for `VACUUM`, how leader-follower replication and quorums trade latency for consistency, and how LSM trees make Cassandra and RocksDB fast at writes. Every lesson includes real SQL in the Postgres dialect and the shape of the `EXPLAIN` output you would use to prove your reasoning.

The second half moves from mechanism to judgement: Redis, MongoDB, Cassandra, Elasticsearch, graph, time-series and vector stores, and a decision framework for choosing between them from access patterns rather than fashion. The final module is about the part of database work that fills a senior engineer's week: modelling for the queries you will actually run, changing a schema under live traffic without downtime, avoiding the N+1 traps that ORMs (including the SeaORM layer in this very app) make easy, and keeping a cache honest.

This track builds on [hashing](/learn/data-structures/hashing/hash-tables) and [balanced trees](/learn/data-structures/trees/balanced-trees) from Core Data Structures and feeds directly into the [System Design](/learn/system-design/building-blocks/database-scaling) track, where these mechanisms become the building blocks of a design interview answer.
