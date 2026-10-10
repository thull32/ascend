---
lesson: document-stores
source: a8ad2f5327269a47
fit: great
desk:
  - "The embedded and referenced order and review documents"
  - "The ESR index comparison table and the explain output"
  - "The aggregation pipeline example"
  - "The w:1 rollback trace and the JSONB GIN measurements table"
  - "Exercise: does the index provide the sort?"
---
## Introduction

An order has a customer, a shipping address, a list of line items and a payment record. In a normalised relational schema that is five tables and a four-way join to render one order page. Every developer who has written that join has thought: the order is the document, so why can I not store it as one?

A document store lets you. The order becomes one record, read and written as a unit, with nested arrays for the line items. The read is a single primary-key lookup instead of a join. The price is that the decisions the relational model made for you, what a row is, what a foreign key is, how to keep two copies of an address consistent, are now yours, and the store will not stop you getting them wrong.

Four ideas. Where the document boundary goes. How MongoDB's storage engine, WiredTiger, actually stores and caches documents. How to order a compound index and read the planner's output. And what a write acknowledgement really promises when the primary fails.

## Embed or reference

In MongoDB, every single-document write is atomic. An update that increments a counter and pushes onto an array happens entirely or not at all, even under concurrency. That boundary is the whole design question. Data that must change together belongs in one document. Data that changes independently, or is read independently at scale, belongs in separate documents.

The rules experienced modellers use, roughly in order of how often they apply. One-to-few: embed. A user's two or three addresses live in an array on the user. One-to-many: reference from the many side. A product with thousands of reviews gets a reviews collection with an indexed product field. One-to-squillions, a host with millions of log lines: reference from the many side only. Read together and rarely updated: copy. An order embeds the product name and price at purchase time, and that is the correct meaning, the price you paid, not a bug. Updated in many places: reference. A customer's display name shown on ten thousand orders is joined at read time, never copied ten thousand times.

Here is why unbounded arrays hurt long before they break. A document may not exceed 16 megabytes. At 500 bytes a review, that is about 33 thousand reviews. But take a popular product whose embedded reviews have reached 5 megabytes and which gains 100 reviews a day. Every page read loads 5 megabytes to show ten reviews. Every append creates a new version of the whole document, and when the engine checkpoints, it writes the whole document. Over the day, 100 appends write about 500 megabytes to disk for 50 kilobytes of new reviews. And one day the array crosses 16 megabytes and inserts start failing in production.

The rule: if you cannot state an upper bound on an array's length, it should be a collection. Two patterns keep the read benefit. The subset pattern embeds the newest ten reviews for the page and keeps all of them in their own collection. The bucket pattern groups a fixed number of time-ordered items per document, one document per sensor per hour, which is exactly what MongoDB's time-series collections do internally.

And "schemaless" does not mean no schema. The schema moves into application code, and every document ever written is a version of it. Three years in, you find price as an integer in pence, price as a float in pounds, price missing, and a nested pricing object, and every reader carries all four. Senior teams add a schema version field, validation on the collection, and a migration discipline not much lighter than the relational one.

## Under the hood: WiredTiger

WiredTiger is a B-tree engine. Each collection and each index is its own B-tree. Indexes point to an internal record ID, so a secondary-index lookup is two tree descents.

A write goes three places. First, memory: the engine keeps a chain of versions per record, and readers see the newest version visible to their snapshot, so readers never block writers. Second, the journal, its write-ahead log, flushed every 100 milliseconds unless the write asks to wait for it. Third, every 60 seconds a checkpoint writes dirty pages to new blocks. Recovery is the last checkpoint plus the journal.

The cache is the larger of half of memory minus a gigabyte, or 256 megabytes: 31 and a half gigabytes on a 64 gigabyte host. Background eviction starts at 80 percent full. At 95 percent, or when dirty data passes 20 percent, application threads get drafted into eviction. That is what turns a working set bigger than the cache, or a long transaction pinning old versions, into a latency spike on every operation, with no slow query to blame.

## Indexes and explain

Compound indexes follow the same B-tree rules as Postgres: an index on a and b serves queries on a, and on a and b, but not on b alone. The rule for field order is ESR: equality, sort, range.

Take 2 million orders, about 400 thousand of them with status placed, and about 33 thousand of those from the last 30 days, 8 percent. The query: placed orders from the last 30 days, sorted by customer, first 20. With the range before the sort, the database reads all 33 thousand matching keys, fetches them, and sorts them in memory. With ESR order, status then customer then date, it walks the placed keys already in customer order, checks the date inside each key, and stops at 20. That is about 243 keys and 20 fetches. Measured with the same data on Postgres: 0.07 milliseconds for ESR against 21 milliseconds the other way.

But ESR is a heuristic. Narrow the range to the last hour, 36 matching orders, and which order wins?

[pause]

Now range first wins. The ESR walk has to pass about half of all 400 thousand placed keys to find 20 matches, measured at 3 and a half milliseconds, while the range-first index reads 36 keys and sorts 36 rows in 0.15. When the range is very selective, put it before the sort field, and check on production-shaped data.

To check, read three numbers in explain: documents returned, keys examined and documents examined. Close together means the index fits. Keys far above documents means the index filters inside its keys, which is acceptable up to a point. Documents examined far above returned means a predicate runs after each fetch, and a better compound index would fix it. A collection scan on a large collection is an outage in waiting, and a sort stage is an in-memory sort capped at 100 megabytes.

## Transactions and write concern

Multi-document transactions exist and are ACID, with snapshot isolation. But conflicts behave differently from Postgres. Two checkouts race for the last unit of stock. The first transaction updates quantity from 1 to 0, uncommitted. The second tries the same update, and instead of waiting, it is refused immediately with a write conflict labelled transient, and aborted. The first commits. The driver's helper reruns the whole second callback from the start: it reads 0, and the application rejects the second checkout.

In Postgres, the second would wait on a row lock and then re-check. MongoDB gives you retries instead of a queue, and each retry reruns your code. Transactions are also capped at 60 seconds, wait at most 5 milliseconds for locks, and the guidance is no more than a thousand documents each. The consequence: MongoDB is fast when the document boundary is the transaction boundary. If most writes need multi-document transactions, the modelling is wrong, or the workload is relational.

Now write concern. A replica set is a primary plus secondaries that pull its oplog. With write concern one, the client is acknowledged as soon as the primary has applied the write. Picture it. The primary applies order A at position 101 and acknowledges. The secondaries have not fetched it. A partition isolates the primary, and it steps down. The two secondaries elect one of themselves, whose last entry is 100, and clients write new entries there. The partition heals. What happens to order A?

[pause]

The old primary rejoins, finds the last entry it shares with the new primary, 100, and rolls back 101. Order A is removed and written to a file in a rollback directory. The client was told it succeeded; the replica set no longer has it, and only an operator reading those files can recover it. With majority write concern, the default since 5.0, the write waits until a majority has it, and an election can only pick a member holding every majority-committed write. It costs one replication round trip: about a millisecond within a region. Journaling on the primary alone survives a crash and restart, not a failover.

Sharding in one sentence: the shard key decides everything. Queries with it go to one shard; without it they hit every shard. A timestamp or an ever-increasing ID as the key sends every insert to one shard, however many you add.

## The Postgres alternative

Most of what teams want from a document store is a table with one flexible column, and Postgres has one: JSONB, indexed with GIN, an inverted index from JSON items to rows. Measured on a million products, a containment query for a brand and a colour, matching 402 rows: 44 milliseconds with no index. 13 milliseconds with the default GIN operator class, at 25 megabytes. One and a half milliseconds with the path-ops operator class, at 18 megabytes.

The difference is what they index. The default indexes every key and every value separately, and the colour key appears in all million rows. Path-ops indexes one hash per path and value, brand equals brand 17, so the lists it intersects are short. Its catch is that it cannot answer "does this key exist" queries.

JSONB shares one cost with documents: an update rewrites the whole value. Changing one small key inside a 100 kilobyte JSONB value wrote 113 kilobytes of write-ahead log. Updating a plain text column on the same row wrote 130 bytes. Keep fields that change often in their own columns.

MongoDB genuinely wins when the data is documents with no relational core, when horizontal write scaling must be built in, and on nested-update ergonomics. It loses when joins are routine, when invariants span entities, and as schema debt compounds.

## In the interview

Blog comments: embed or reference?

[pause]

Comments per post are unbounded for popular posts, so a comments collection indexed by post and creation time, plus the newest ten embedded for the page render: the subset pattern. State the bound out loud. The wrong answer is "embed, because they are read together", which fails on the first viral post.

And: why not wrap everything in transactions? Because conflicts abort rather than wait, so contention becomes retries; open snapshots pin cache; and there is a 60-second lifetime and a 5 millisecond lock timeout. Design so each invariant lives in one document. Saying "MongoDB transactions are not ACID" is wrong, and has been since 4.0.

## Recap

Five things to remember. The document is the unit of atomicity, so draw its boundary around what changes together, and state every embedded array's bound. WiredTiger's cache stalls every operation once it is 95 percent full or 20 percent dirty. Order compound indexes equality, sort, range, unless the range is very selective, and read explain as returned, keys examined, documents examined. Contended transactions abort and retry rather than wait. And write concern one loses acknowledged writes in a failover; majority costs one round trip.

At your desk: the order and review documents, the ESR table and explain output, the aggregation pipeline, the rollback trace and JSONB measurements, and the index-provides-sort exercise.
