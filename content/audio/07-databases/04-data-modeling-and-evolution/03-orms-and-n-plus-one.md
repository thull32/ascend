---
lesson: orms-and-n-plus-one
source: 83cf0d550989caee
fit: great
desk:
  - "The measured table for 10, 100 and 1,000 comments, and the round-trip model at different network distances"
  - "The SQL each fix produces, and the plan flip at 1,000 rows"
  - "The lazy and eager loading table across Django, Rails, SQLAlchemy, Hibernate and SeaORM"
  - "This app's comments query, session lookup and upsert, read closely"
  - "The query-counting test in plain Python"
  - "Exercises: thread comments in one pass, and plan a DataLoader's batches"
---
## Introduction

The comments section under a lesson shows 100 comments, each with its author's name. The page is slow, and the database dashboard says Postgres is nearly idle. Turn on query logging in development and the reason scrolls past: one query for the comments, then one hundred queries that each fetch one user by ID, one per comment. Each is a primary-key lookup that Postgres answers in microseconds.

In the lab, on Postgres 17, with the client on the database host itself, those 101 queries took 11.5 milliseconds, and one join returning the same data took 0.3. That gap is almost all round trips, and round trips get more expensive once the application is on another machine. At a typical half-millisecond round trip inside one cloud zone, the page costs about 62 milliseconds against under one. At 1,000 comments, over half a second. And it gets slower every time someone comments.

Nothing in the code looks like a loop over queries. The loop is in the template, and the query hides behind "comment dot author dot name". That is the N plus one problem: one query to fetch N parent rows, then one more query per row to fetch something related. It is the most common performance bug in applications that use an ORM, and in most ORMs it is the default behaviour.

Four things, then: where it comes from, what a round trip really costs, the three fixes and the case where the obvious one loses, and how to catch it.

## Anatomy of an N plus one

Take Django; Rails, SQLAlchemy and Hibernate's lazy associations behave the same way. You fetch the comments for a lesson and loop over them, rendering each body and its author's name. The author is a lazy relation. The ORM loaded each comment's author ID, but not the user, and on first access it issues a query for that one user. It cannot batch them, because at the moment of the first access it has no idea you are about to access 99 more.

Look at the log and you will often see the same ID twice. Django keeps no identity map, so an author with three comments is fetched three times. Hibernate and SQLAlchemy check their session first, which saves the repeats but not the other queries.

And it compounds. If each author lazily loads an avatar record, the page makes one plus N plus N queries. A GraphQL resolver per field can make hundreds.

## What a round trip costs

Here is the formula worth keeping. A page's database time is roughly its local work plus the number of round trips times the network round-trip time.

In the lab, each author lookup cost about 0.11 milliseconds, a constant price paid N times. Very little of that was Postgres. A cached prepared statement skips parsing, and a primary-key lookup is a few microseconds of work: one B-tree descent and one heap fetch. The rest was the round trip itself: a write into the kernel's socket buffer, a wake-up of the server process, the same again for the reply, and the client decoding the row. An ORM adds its own step per row, mapping columns onto an object, which in Python ORMs is often the largest part of the client's share.

That is why N plus one barely shows up in database metrics. Postgres spends almost nothing per query and is mostly waiting on the client. The cost lives in the application's latency, in connection-pool occupancy, and in CPU on both ends shuttling small messages.

Now move the database. About a tenth of a millisecond on the same host, about half a millisecond within one availability zone, one to two milliseconds across zones. At 100 comments and half a millisecond, the N plus one page takes 62 milliseconds, and the join under one. At two milliseconds, 214 milliseconds against about 2. Moving the database one zone away multiplies an N plus one page's latency and barely moves the fixed-query versions. A proxy in the path adds its hop to every one of the N round trips.

And the pool pays too. Each query holds a pooled connection for its round trip, so that page occupies about 62 milliseconds of connection time. This app's pool has 20 connections, so pages of that shape saturate it at about 320 a second, against about 14 thousand a second for the two-query version.

## Three fixes, and when the join loses

The first fix is a join: one query, one row per result. Django's select related, Rails's eager load, SeaORM's find also related. It is the right fix for to-one relations, where each comment has one author.

For to-many relations, be careful. A join repeats the parent's columns on every child row, and joining two to-many relations at once returns their cartesian product. A post with 20 comments and 10 tags comes back as 200 rows, which the ORM deduplicates back into 31 objects. Worse, a limit on such a join limits joined rows, not parents, so "the first 10 posts with their comments" silently returns fewer posts.

The second fix is batch loading: fetch the parents, collect the foreign keys, and fetch all the related rows in one more query, "where ID equals any of this array". Two round trips regardless of N, no duplication, and it works for to-many relations without a cartesian product. Django calls it prefetch related, Rails calls it preload, SQLAlchemy calls it select-in load. Pass the keys as one array parameter rather than one parameter per key: Postgres plans them the same, but the array form is one statement text whatever the list length.

The third fix is to shape the result in SQL. When the response is a nested document, Postgres can aggregate the children into JSON itself and return one row per parent. One round trip, no duplicated columns on the wire, but the ORM is mostly out of the picture and the query is harder to compose and test.

Now the surprise. At 100 comments, the join took 0.3 milliseconds and the batch 0.42. At 1,000 comments, which was faster?

[pause]

The batch. The join took 4 milliseconds and the two queries 1.35, three times faster. At 100 rows, the planner chose a nested loop of 100 primary-key probes. At 1,000, with the default random page cost of 4, it estimated that 1,000 index probes would cost more than reading the table, so it built a hash of all 100 thousand users. The batched lookup gave the planner no such choice: one index scan for 994 distinct IDs. One query is not automatically the fastest shape. Check the plan at realistic N.

## Lazy and eager across ORMs

Every ORM offers the same three loading strategies under different names: lazy, eager by join, and eager by a second query. Most default to lazy for relations. The senior move in a dynamic-language codebase is to make lazy loading an error in tests and development, so an accidental N plus one fails loudly instead of shipping. Rails has strict loading, SQLAlchemy has raise load, and Hibernate already throws when a lazy load happens outside its session.

SeaORM, which this app uses, has no lazy properties at all. A model has no author field that fetches on access; you ask for related rows explicitly, with an await. So N plus one in SeaORM is visible in the code: an await on a query inside a loop over rows. Review becomes the first line of defence, and the smell is any database call inside a loop.

Its batch loader is worth knowing precisely. It collects and deduplicates the parents' keys and issues one query per relation hop, with one bind parameter per distinct key. So a page with 50 distinct authors and one with 51 produce different statement texts, each prepared separately and competing for a 100-entry statement cache. And a Postgres statement carries at most 65,535 parameters, so a bigger key list fails and must be chunked. A hand-written query with one array parameter has neither problem.

This app's own comments query shows that the right query count is not the end of review. The first version joined comments to users in one query, served by the index on target and creation time: not N plus one. But the join selected every user column for every comment, including email and password hash, when only the display name was used. Nothing leaked, but a public endpoint was loading credential hashes into memory, one careless serialisation change away from sending them. The fix selects the comment's columns plus exactly one user column. Review projections as well as query counts.

## Detecting it

N plus one is invisible in code review in dynamic ORMs and obvious in data. So detect it with data: count statements per unit of work.

In tests, render an endpoint with realistic fan-out and assert the number of queries. The assertion is on the shape, which must not depend on N. Django has this built in. In SeaORM, a metric callback fires on every statement, and a counter there gives a test the count per request.

In production, the statement statistics extension shows the fingerprint: a cheap statement whose call count is a large multiple of the request count. Sort by calls, not by mean time. But it needs a restart to load, and many self-managed servers do not have it. Two cheaper signals exist, and one of them misleads. Which one do you think fooled the lab: the transaction commit counter, or the index scan counter on the users primary key?

[pause]

The index scan counter. Loading the 100-comment page moved it by 100 for the N plus one version, but also by 102 for the join, because a nested loop probes the index once per comment. Index counters cannot tell N plus one from a join. The commit counter can: each autocommit query is a transaction, and it moved by 106 for the N plus one page and by 4 or 5 for the join and the batch.

Two more places to look. A distributed trace shows N plus one as a waterfall of identical short database spans under one request. And not the slow query log, where each N plus one query is far too fast to appear.

## In the interview

The follow-up the lesson expects: each query takes a tenth of a millisecond. Why is the page 60 milliseconds?

[pause]

Count them. A hundred round trips at a half-millisecond same-zone round trip is 50 milliseconds of network alone, plus pool acquires and row mapping. The database's execution time is the smallest term, which is why its dashboards look idle. The wrong answer is "add an index", when each lookup is already a primary-key probe.

And the classic: join or two queries? Join for to-one relations and modest result sizes. Two queries, with an array parameter, for to-many relations, for deep graphs, and when a large join might flip to hashing the whole related table, as it did at 1,000 rows. "Always one query, round trips are the enemy" ignores cartesian products and plan flips.

## Recap

Four things to remember. A page's database time is round trips times the network round-trip time plus work, so an N plus one page at 100 rows is about 60 milliseconds in the same zone before Postgres does anything, and it eats the connection pool. Join for to-one relations, batch with one array parameter for to-many, and check the plan at realistic N, because a join can flip to hashing the whole related table. Detect it by counting statements per request, in tests and in production; index scan counters and the slow query log will not show it. And make lazy loading an error where your ORM allows it, and review projections as well as counts.

At your desk: the measured and modelled tables, the SQL for each fix, the loading strategies across ORMs, this app's queries read closely, the query-counting test, and the two exercises on threading comments and planning a DataLoader's batches.
