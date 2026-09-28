---
slug: nosql-and-specialised
title: NoSQL and specialised stores
description: How Redis, MongoDB, Cassandra, Elasticsearch, graph, time-series and vector databases actually store and find your data, and a framework for choosing between them from access patterns rather than fashion.
prerequisites: [databases/relational-fundamentals]
---
Every non-relational database is a relational database with one thing removed and one thing added. Redis removes the disk from the read path and adds data structures. Cassandra removes joins and multi-row transactions and adds linear write scaling. Elasticsearch removes updatable rows and adds an inverted index. Each removal is what makes the addition possible, and every outage caused by a "wrong database" decision is a team discovering the removal after they depended on it.

This module takes the specialised stores one at a time and opens each to the mechanism: the single-threaded event loop, listpack thresholds, copy-on-write snapshots and 16,384 hash slots inside Redis; the embedding rules, WiredTiger snapshots and rollback inside MongoDB; the LSM tree, tombstones and quorum arithmetic inside Cassandra and DynamoDB; the postings lists and BM25 worked by hand inside Elasticsearch; and Gorilla compression and the HNSW graph inside time-series and vector stores. For each you will see the query shape it is built for, the query shape that quietly breaks it, and the Postgres alternative, measured on PostgreSQL 17, that often makes the extra system unnecessary. The exercises implement the pieces: a cluster slot function, a sliding-window limiter, a quorum-overlap calculator, a BM25 ranker and an HNSW beam search.

The final lesson turns that into judgement. It gives you a decision framework built on access patterns, per-operation consistency needs, realistic single-node limits, and operational cost, then works three real systems through it. The senior signal here is not knowing ten databases; it is being able to say which one you would not add, and what it would cost the on-call rota if you did.
