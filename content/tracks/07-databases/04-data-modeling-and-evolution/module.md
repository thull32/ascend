---
slug: data-modeling-and-evolution
title: Data modelling and schema evolution
description: How to design a schema from the queries you will actually run, change it under live traffic without downtime, keep an ORM from generating fifty queries where one would do, and keep a cache honest with the database behind it.
prerequisites: [databases/relational-fundamentals]
---
The first three modules of this track explain what a database does. This one is about the part of database work that fills a senior engineer's week: deciding what the tables look like, changing them once they hold a billion rows, and living with the layers of code and cache that sit between the application and the storage engine.

The module starts where junior data modelling goes wrong. Normalising the nouns of the domain into tables produces a schema that is correct and slow, because nobody asked which queries would run against it ten thousand times a second. You will learn to write the access-pattern table first, derive the schema and indexes from it, and pay on the write path (counters, summary tables, materialised views, change-data-capture) so that the read path stays cheap. The same discipline is what makes a DynamoDB single-table design work, and the lesson shows the mapping.

Schemas then have to change. `ALTER TABLE` looks harmless in development and can take a site down in production, because the lock it needs queues behind a long-running transaction and every reader queues behind it. You will learn which Postgres DDL is metadata-only and which rewrites the table, how `CREATE INDEX CONCURRENTLY` and `NOT VALID` constraints avoid the lock, and how the expand/contract pattern turns a column rename into four boring deploys and one batched backfill.

The last two lessons are about the layers around the database. ORMs make the N+1 query pattern the default and hide it behind a property access; you will learn to detect it from query counts, fix it with joins and batch loading, and read the SeaORM code in this very app to see the single-query threading and single-statement upserts it uses. Finally, caches: every caching strategy has a race with the database, and each race has a specific interleaving you can draw on a whiteboard and a specific fix. By the end you should be able to defend a schema, a migration plan and a cache design in a design review with the failure modes already written down.
