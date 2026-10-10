---
lesson: choosing-a-database
source: 76a5378f42f86da2
fit: great
desk:
  - "The single-node Postgres limits table and the module's measurements table"
  - "The access-shape to data-structure table"
  - "The decision-flow chart"
  - "This app's shared rate limiter in the rate-limit service and its migration"
  - "The Postgres-feature versus dedicated-store table"
---
## Introduction

A startup chooses MongoDB because "the schema will change a lot", and Cassandra for its event history because "it needs to scale". Eighteen months later the product has a relational core, customers, orders, invoices, refunds, that the team keeps consistent with multi-document transactions and joins in application code. The event history takes 300 writes a second, which one Postgres table would have absorbed without noticing. And a three-person platform team half-understands two clusters, each with its own backups, upgrades and 3 a.m. failure modes.

None of those choices was wrong in the abstract. Each was made from a product's reputation instead of the workload's requirements, and each was paid for in operating cost long before any benefit arrived.

A senior engineer's contribution here is not knowing more databases. It is asking four questions that turn "which database is best?" into "which requirement does the default fail, and by how much?", with numbers attached. What are the access patterns, what consistency does each operation need, what is the scale and its shape, and what will it cost to operate.

## Start from the default

For a new transactional system, the default is a mainstream relational database, Postgres in this track, and the burden of proof is on anything else. That is not nostalgia. It is a list of capabilities you get together, in one system: transactions across any rows, constraints, ad hoc queries and joins with a planner, JSONB, full-text search, vectors, partitioning, replication and point-in-time recovery, and a managed offering from every cloud.

What does one well-provisioned node handle? Treat these as orders of magnitude to check against your own workload. Hundreds of gigabytes to a few terabytes of data comfortably. Thousands to low tens of thousands of simple indexed writes a second. Tens to hundreds of thousands of indexed point reads, more with replicas.

Two pieces of arithmetic show where real work starts. Transaction IDs: autovacuum must freeze old rows every 200 million transactions. At a thousand write transactions a second that is every 56 hours. At ten thousand, every five and a half hours, and if vacuum falls behind, the hard stop arrives in about 60 hours. And restore time: a restore moves every byte back, so 2 terabytes takes one to two hours and 20 terabytes takes eleven to twenty-two, before replaying the log. Your recovery-time objective caps single-node size long before disk capacity does.

This module measured Postgres against every specialised store, and every result was "fine until a number". JSONB containment: one and a half milliseconds, until one key update rewrote a 100 kilobyte value. Full-text: under 2 milliseconds for a rare term, 49 for a term in 250 thousand documents. Two-hop graph queries: one millisecond, until a supernode or depth four. Time series with BRIN: about one millisecond, at 52 bytes a point against roughly 1.4 in a time-series database. That is the form a database decision should take: a match count, a depth, a byte cost, a selectivity.

## Access patterns and consistency

Question one: the access patterns. Write the table before you discuss products: every query, its shape, frequency, latency target and result size. Then map shapes to the structures that serve them. Point lookups plus ad hoc filters and joins: B-trees and a planner. Known-key access at very high write rates: hash partitioning over an LSM tree, Cassandra or DynamoDB. Sub-millisecond reads of a hot set: an in-memory store. Ranked text: an inverted index. Similarity: HNSW. Deep traversals: a graph store. Aggregations over billions of rows: columnar storage.

The table turns a vague requirement into a checkable one. "We need to scale" becomes "this query is a known-key write at 40 thousand a second with no reads except by key", and that sentence chooses the store for you.

Question two: consistency, asked per operation, not per system. Moving money or decrementing inventory needs atomic, isolated, multi-row transactions. A likes counter can be approximate. Editing your own profile needs read-your-writes: you must see the change at once, even if others see it a second later. If core entities have invariants spanning several rows, you need transactions over those rows.

A product manager says the feed can be eventually consistent. Are you done?

[pause]

No. "Eventually consistent" names no bound and no anomaly. Ask which stale read a user sees, for how long, and what happens when they act on it. The anomaly to name first is usually a user not seeing their own new post: read-your-writes for the author, staleness for everyone else, decided per operation. And remember that asynchronous replication can lose the last acknowledged writes on a failover on any store, relational included.

## Scale, and the cost of operating it

Question three: the scale and its shape. Fifty million users with 2 kilobyte profiles is 100 gigabytes, which fits in the memory of one large machine. Twenty thousand events a second at 500 bytes is 864 gigabytes a day, over 300 terabytes a year: a partitioning problem, not a tuning problem. Read-heavy workloads scale with replicas and caches; write-heavy ones scale only by partitioning. Hot keys concentrate load whatever the cluster size. And write shape is where engines genuinely differ: a B-tree updates pages in place, while an LSM tree turns every write into a sequential append and pays later in compaction and reads.

Question four, the one most often skipped, decides more outcomes than the other three: what will it cost to operate? Who is on call for it, and have they run it through a failure? Can the team restore it from backup today, how long does that take, and when was it last tested? A store nobody has restored is a store without backups. What does an upgrade or a reindex look like at full size: reindexing 500 gigabytes at 50 megabytes a second is about three hours before catch-up. Every store that is not the source of truth needs a sync pipeline, which is code with bugs and a lag users can see. A system that is 20 percent faster on a benchmark and needs a specialist you do not have is slower in every way that matters.

So the decision flow is: decide the relational core first, by invariants and query flexibility. Everything else is a derived store, added for one failing access pattern, fed from the source of truth, with a named reason.

## Three worked decisions

First, this app. Ascend stores users, sessions, lesson progress, quiz attempts, code submissions, comments, AI conversations and usage, and rate-limit state. The access patterns are per-user lookups and composite-key upserts, with no analytics, text search over user data, or traversals in the request path. The invariants, like an AI budget that a hundred concurrent requests must not overspend, and at most one active interview per user, are ones a transactional store gives almost for free. The scale is at most millions of progress rows, and the curriculum and its search index are served from memory. The answer: one Postgres, nothing else.

The interesting part is the trigger. Every rate limit used to live in process memory, so a second replica would silently double each allowance, and the plan was to add Redis. When the trigger came, the store already running met it. The security limits now live in an unlogged Postgres table, checked and advanced with one conditional upsert, so two replicas cannot both take the last slot. Unlogged skips the write-ahead log, which keeps each check cheap; the price is that a crash empties the table, which only forgives some recent requests. That is the pattern to copy: name the requirement that triggers the next store, and when it fires, check whether the store you already run can meet it.

Second, ride-hailing locations. A million drivers each report a position every four seconds: 250 thousand writes a second, and only the latest position matters. The whole fleet's latest positions are about 100 megabytes in Redis, but that write rate is more than one Redis core, so partition by city: the largest city is 25 thousand writes a second per shard. Losing a few seconds of positions is fine, because every driver reports again in four seconds. History goes to a log feeding analytics. Trips and payments stay in Postgres, with transactions. Writing short-lived positions into a B-tree with a write-ahead log would pay durability costs for data whose value expires in four seconds.

Third, viewing history at a streaming service. 250 million members, about 14,500 events a second on average and over 40 thousand at peak, about 90 terabytes of raw data a year, read as "continue watching" for one member, newest first, in several regions that must each stay writable. Known key, time-ordered, write-heavy, multi-region, relaxed consistency: a wide-column store partitioned by member and clustered by time, at local quorum, which is what Netflix has described using Cassandra for. Billing and entitlements live elsewhere.

## The polyglot tax, and reversible decisions

Every extra store charges the same tax. A sync path from the source of truth, with its own monitoring, lag and replay story. A consistency window users can see: the search result missing the item you just created. A tested backup and restore, consistent with the other stores; restoring Postgres to nine o'clock and the search index to eight is itself an inconsistency. An on-call surface. And security and compliance work, including deletion requests that must reach every copy. Add a store when a measured requirement fails the default and the tax is smaller than the gap. Adding one because the requirement might fail someday usually costs more than migrating would when the day comes, and the day often does not come.

Decisions also differ in how reversible they are. Adding a derived store fed by change data capture is a two-way door: drop it and nothing is lost. Moving the source of truth is a one-way door with a long walk back. Spend review time in proportion.

When you do move a workload, use the machinery of a schema change. Backfill the new store from a snapshot. Start change data capture from the snapshot's log position. Shadow-read: serve from the old store, read the new one too, and log mismatches until they are zero. Cut over reads behind a flag, a percentage at a time, then writes. And keep the old path until the new one has survived a real incident.

## In the interview

Why not MongoDB for a new orders service?

[pause]

Orders reserve inventory and must not double-charge. Those are multi-entity invariants that relational transactions and constraints give by default, and flexibility is available through JSONB. MongoDB would fit if there were no relational core and built-in sharding mattered. The wrong answer is "MongoDB cannot do transactions", which has been false since 4.0.

And: what would make you add a second datastore to a one-Postgres app? A named trigger with a number, such as common search terms outgrowing ranked queries. When one fires, check the existing store first, as this app did when several replicas needed shared rate limits. Until then the tax outweighs the benefit. "When we grow" is not an answer.

## Recap

Five things to remember. Start from the relational default and ask which requirement it fails, with a number, knowing the single-node limits, including restore time and transaction-ID arithmetic. Write the access-pattern table first, and let shapes, not reputations, choose structures. Decide consistency per operation, and name the anomaly every relaxed operation allows. Treat operating cost, people, restores, change and data movement, as a first-class requirement, and itemise the polyglot tax for every new store. And prefer two-way doors: derived stores fed by change data capture, and migrations by backfill, shadow reads and a flagged cut-over.

At your desk: the single-node limits and module measurements, the access-shape table, the decision-flow chart, this app's shared rate limiter, and the feature-versus-store table.
