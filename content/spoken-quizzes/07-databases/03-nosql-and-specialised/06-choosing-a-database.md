---
lesson: choosing-a-database
source: 150222f385113e19
---
## 1

A team proposes MongoDB for a new orders service, because the requirements are still changing. Orders have line items, reserve inventory, and must never be double-charged. What is the strongest counter-argument?

A, the invariants need transactions and constraints, and jsonb gives the flexibility. B, MongoDB cannot nest line items in an order, so reads need extra lookups. C, changing requirements suit a graph database better than a document store. D, MongoDB is always slower than Postgres on writes, so charges would lag.

[think]

The answer is A: the invariants need transactions and constraints, and jsonb gives flexibility.

Schema flexibility is available in Postgres through jsonb, while invariants that span several entities, such as reservations and payments, are what relational transactions and constraints are for. Nesting line items is something MongoDB does well, so that is not the objection. And MongoDB has multi-document transactions; they are the exception in its model rather than the default.

## 2

Which requirement, stated with numbers, most directly argues for a wide-column store such as Cassandra?

A, known-key, time-ordered appends at 60 thousand a second, in three regions. B, strictly consistent balance transfers at 3 thousand a second. C, ad hoc reporting that filters on any of 40 attributes over 2 billion rows. D, 200 gigabytes of data, growing 5 gigabytes a month, most of it rarely read.

[think]

The answer is A: known-key, time-ordered appends at 60 thousand a second in three regions.

Known-key access, very high write rates and writes in several regions are the wide-column sweet spot. Ad hoc reporting points to a columnar warehouse, strong multi-row consistency to a relational store, and 200 gigabytes fits comfortably on one relational node.

## 3

A design adds Elasticsearch, Redis and ClickHouse beside Postgres from day one, for an app with 5,000 users. What is the most important review comment?

A, every store adds sync, backup and on-call cost before it delivers any benefit. B, use OpenSearch instead of Elasticsearch, since its licence is safer. C, keep sessions only in Redis, since they are read on every request. D, make ClickHouse the primary store, since it answers queries fastest.

[think]

The answer is A: every store adds sync, backup and on-call cost before any benefit.

The polyglot tax, a sync path, a visible consistency window, backups and restores, an on-call surface, compliance, is paid immediately and continuously. The benefits arrive only when the default fails. Swapping one search engine for another leaves that tax untouched. At this size, Postgres full-text search, a well-indexed schema and replicas very likely cover every pattern.

## 4

A product manager says the feed can be eventually consistent. What should you ask before agreeing?

A, whether the feed data exceeds a terabyte, as only small data stays consistent. B, whether the feed is stored as JSON, as document stores are eventual. C, which vendor they prefer, since the vendor fixes the consistency model. D, what stale data users will see, for how long, and what acting on it does.

[think]

The answer is D: what stale data users see, for how long, and what acting on it does.

Eventual consistency without a bound and a named anomaly is not a requirement. The anomaly to name first is usually a user not seeing their own new post: read-your-writes for a user's own actions is usually required even when global staleness is fine, and it changes the design. Consistency is a property of how reads and writes are routed, not of the vendor or the storage format.

## 5

Ascend's security rate limits had to hold across several replicas. Why did it keep them in an unlogged Postgres table, instead of adding Redis?

A, Redis cannot make a check and an increment atomic across clients. B, a Postgres check avoids the network round trip that Redis would add. C, an unlogged table survives a crash, which Redis without an append-only file cannot. D, every replica already shares Postgres, and an unlogged table skips the WAL.

[think]

The answer is D: every replica already shares Postgres, and unlogged skips the WAL.

Shared state needed no new system, and one conditional upsert makes the check and the advance atomic. Skipping the WAL keeps each check cheap; the price is that a crash truncates the table, which only forgives some recent requests. Redis could do the same atomically, with an increment or a Lua script; it was simply not needed. Each check is still a database round trip, which is why the loose general bucket stays in memory.

## 6

Which of these decisions is cheapest to reverse a year later?

A, adopting a single-table DynamoDB design for every entity type. B, moving the orders source of truth from Postgres to DynamoDB. C, sharding the orders table by customer across 16 Postgres nodes. D, adding Elasticsearch as an index derived from Postgres and fed by change data capture.

[think]

The answer is D: adding Elasticsearch as a derived index fed by change data capture.

A derived store fed this way is a two-way door: the source of truth never changed, so dropping the index loses nothing, and the application falls back to Postgres queries. Moving or reshaping the source of truth changes every query and every invariant, and walking it back needs a full migration, with backfill, change data capture and shadow reads.
