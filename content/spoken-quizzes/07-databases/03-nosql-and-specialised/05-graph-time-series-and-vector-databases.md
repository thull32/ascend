---
lesson: graph-time-series-and-vector-databases
source: eae8f90901e1ab98
---
## 1

A team wants a graph database for a feature that shows each user's friends, plus friend-of-friend suggestions ranked by mutual friends. What is the best response?

A, adopt a graph database, since friendships are a graph at any depth. B, use a vector database to find users with similar friend lists. C, stay relational, because a composite index serves two hops in milliseconds. D, use a document store, and embed each user's friends in their record.

[think]

The answer is C: stay relational.

Two fixed hops over a primary-key index on user and friend measured about 1 millisecond for 2,500 two-hop rows, on a graph of 5 million edges, transactional, and with no second system. Index-free adjacency pays off as traversals get deeper and branchier, and a supernode would hurt either store equally.

## 2

After someone adds a customer ID label to a request-latency metric, the Prometheus server's memory triples and it starts crashing. Why?

A, Prometheus stores integer label values uncompressed, unlike strings. B, each label combination is its own series, so the number of series multiplies. C, latency samples now take more bytes, because each one carries an ID. D, each sample is now scraped once per customer, so volume multiplies.

[think]

The answer is B: each label combination is its own series.

Every distinct combination of labels is a separate series, with its own index entries and its own in-memory head chunk, so a high-cardinality label multiplies the series count by the number of customers. Series cardinality, not sample size or scrape volume, drives memory in a time-series database. Unbounded identifiers belong in logs or traces.

## 3

In Gorilla's value encoding, a gauge reads 24.0, and then 24.0 again. How many bits does the second value cost, and why?

A, 64 bits, since every value is stored as a raw double. B, 14 bits, since a new window of meaningful bits is needed. C, 9 bits, since the delta falls in the smallest range. D, 1 bit, since its XOR with the previous value is zero.

[think]

The answer is D: 1 bit, since its XOR with the previous value is zero.

Gorilla XORs each double with the previous one, and identical values give zero, encoded as a single 0 bit. A value that differs in a few bits costs a control prefix plus the meaningful bits, and only the first value is stored raw. The 9-bit range code belongs to timestamps, not values.

## 4

A BRIN index on the timestamp served one-hour queries in about 1 millisecond. After a backfill that loaded historical data one series at a time, the same queries read the whole table. What happened?

A, BRIN only indexes the newest partition, so older rows are skipped. B, BRIN needs analyze after every insert, or its summaries go stale. C, rows no longer follow time order, so every block range spans the whole period. D, the backfill filled BRIN's 24 kilobyte limit, so new ranges are unindexed.

[think]

The answer is C: rows no longer follow time order, so every range spans the period.

BRIN stores only the minimum and maximum timestamp of each range of 128 pages. When rows arrive in time order, the ranges are narrow, and a one-hour query reads about 128 pages. Loading series by series makes every range cover the whole backfill period, so every range matches. Measured, a shuffled copy took 94 milliseconds against 1.1. Reload in time order, or use a B-tree.

## 5

A pgvector query filters to tenant 7, orders by distance to a query embedding, and takes 10. It returns only 3 rows, although the tenant has thousands of chunks. Tenant 7 holds 1 percent of the rows, and the HNSW search breadth, ef search, is 40. What is happening?

A, HNSW yields 40 candidates, and the filter keeps about 1 percent of them. B, the HNSW index is corrupt, and silently skips parts of the graph. C, the limit is applied before the ordering, so rows are cut off too early. D, cosine distance ignores the filter, so matching rows are dropped.

[think]

The answer is A: HNSW yields 40 candidates, and the filter keeps about 1 percent.

The index returns ef search candidates in similarity order, and the filter is applied afterwards. At 1 percent selectivity, 40 candidates leave well under one survivor on average. Iterative scans, in pgvector 0.8.0 and later, a search breadth near k divided by the selectivity, per-tenant partitions or partial indexes, or exact search over the tenant's 50 thousand vectors fix it.

## 6

In reciprocal rank fusion with k of 60, document X is ranked first by vector search and is absent from the keyword results. Document Y is ranked third in both. Which ranks higher?

A, X, because a first place in any single list always wins. B, Y, because two sixty-thirds, about 0.032, beats X's one sixty-first, about 0.016. C, they tie, because the fusion counts only the lists that include each document. D, it depends on the BM25 scores, which the fusion adds in directly.

[think]

The answer is B: Y, with about 0.032 against X's 0.016.

Reciprocal rank fusion sums 1 over 60 plus the rank across the lists, and ignores raw scores. X gets one sixty-first, and Y gets one sixty-third twice. A document that both retrievers agree on accumulates two contributions, which makes hybrid search robust to either retriever's blind spots.
