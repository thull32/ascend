---
slug: graph-time-series-and-vector-databases
title: "Graph, time-series and vector databases: when a specialised store earns its place"
description: The storage trick behind each of three specialised families (index-free adjacency, Gorilla-compressed time-partitioned columns, and HNSW and IVF vector indexes), traced by hand and measured against Postgres (recursive CTEs, BRIN), with the supernode, cardinality and filtered-search failure modes and the point at which Postgres stops being enough.
minutes: 45
difficulty: medium
tags: [graph-database, time-series, vector-database, hnsw, pgvector, gorilla-compression, neo4j]
problems: [k-closest-points]
---
Three tickets land in the same quarter. Product wants "people you may know": friends of friends, ranked by mutual friends, for 50 million users. The platform team wants to keep metrics from 20,000 hosts, each emitting 500 series every 10 seconds, which is a million points a second. The AI team wants semantic search over five million help-centre passages so the chatbot can find the right answer even when the user's words match none of the article's.

Each ticket has a database category built for it: graph, time-series, vector. Each also has a Postgres answer that works up to a point. The skill a senior engineer brings is not knowing the product names. It is knowing the one storage trick that makes each specialised store fast, so you can tell whether your workload needs that trick or only sounds like it does. The Postgres numbers below were measured on PostgreSQL 17.11.

## Graph databases: the query shape, measured

Friends of friends is a two-hop traversal. In SQL, with a `friendships(user_id, friend_id)` table whose primary key is both columns:

```sql
SELECT f2.friend_id AS suggestion, count(*) AS mutual
FROM friendships f1
JOIN friendships f2 ON f2.user_id = f1.friend_id
WHERE f1.user_id = 42
  AND f2.friend_id <> 42
  AND NOT EXISTS (
    SELECT 1 FROM friendships x WHERE x.user_id = 42 AND x.friend_id = f2.friend_id)
GROUP BY f2.friend_id
ORDER BY mutual DESC
LIMIT 10;
```

On a random graph of 100,000 users with an average of 50 friends (5 million directed rows, a 211 MB table and a 195 MB primary key), user 42's 49 friends lead to 2,472 two-hop rows, and the query ran in **1.1 ms** touching 156 cached pages: one index range scan, 49 more, a hash anti-join and an aggregate. Two hops is fine in Postgres. Do not add a graph database for this query.

The shape that hurts is **variable-depth traversal**: "is this new account connected to a known fraud ring within five hops through shared cards, devices or addresses?" Each hop multiplies the frontier by the average degree. A recursive CTE that expands one level per iteration shows how fast:

```sql
WITH RECURSIVE reach(node, depth) AS (
  SELECT 42::bigint, 0
  UNION                                   -- UNION drops duplicate (node, depth) rows
  SELECT f.friend_id, r.depth + 1
  FROM reach r JOIN friendships f ON f.user_id = r.node
  WHERE r.depth < 3
)
SELECT count(DISTINCT node) FROM reach;
```

| Depth | Distinct users reached | Rows produced | Time |
|---|---|---|---|
| 2 | 2,494 | 2,495 | 1.9 ms |
| 3 | 71,427 (71% of the graph) | 73,191 | 43 ms |
| 4 | 100,000 (everyone) | 173,191 | 643 ms |
| 3, enumerating paths with a cycle check (`UNION ALL`, path array) | 71,427 | 126,139 | 76 ms |

Depth 3 already covers most of a random graph with degree 50 (the small-world effect), and each further level costs about 15 times more. Real social graphs are clustered, so frontiers grow more slowly, but the shape holds: the cost is the number of edges touched, and every edge touched in SQL is a B-tree probe.

```viz
{"type": "graph", "algorithm": "bfs", "directed": false, "start": "me",
 "nodes": [{"id": "me"}, {"id": "ana"}, {"id": "raj"}, {"id": "lee"}, {"id": "kim"}, {"id": "ivy"}, {"id": "bo"}, {"id": "zoe"}, {"id": "max"}],
 "edges": [{"from": "me", "to": "ana"}, {"from": "me", "to": "raj"}, {"from": "me", "to": "lee"}, {"from": "ana", "to": "kim"}, {"from": "raj", "to": "kim"}, {"from": "raj", "to": "ivy"}, {"from": "lee", "to": "bo"}, {"from": "kim", "to": "zoe"}, {"from": "ivy", "to": "max"}],
 "title": "A traversal expands hop by hop",
 "caption": "Breadth-first expansion from one user. Level one is your friends; level two is friends of friends (kim is reachable twice, which is what the mutual-friend count measures). With 50 friends each, the frontier grows roughly 50-fold per hop until it saturates the graph."}
```

## Index-free adjacency, under the hood

In Neo4j's classic `standard` record format (deprecated since 5.23 in favour of a `block` format that co-locates a node's data in 128-byte blocks), nodes and relationships are fixed-size records in separate files: 15 bytes per node, 34 per relationship. A node record holds the id of its first relationship; each relationship record holds its two endpoints, its type, and next/previous pointers in each endpoint's relationship chain. Following an edge is `offset = id × record size`, one read (usually from the page cache), independent of graph size. A join follows the same edge by descending a B-tree of 3–4 levels, each a page lookup in the buffer pool, plus comparisons within each page.

Be honest about the size of that win. For a two-hop query on cached data it is a constant factor, a few times at most. It grows with depth and with graph size, and it becomes decisive for deep, branching traversals and path search. Equally important is the query language: variable-length paths and shortest-path search are first-class in Cypher, where SQL needs a carefully written recursive CTE.

```text
MATCH (me:User {id: 42})-[:FRIEND]->(f)-[:FRIEND]->(fof)
WHERE fof <> me AND NOT (me)-[:FRIEND]->(fof)
RETURN fof.id, count(f) AS mutual
ORDER BY mutual DESC
LIMIT 10;

MATCH p = shortestPath(
  (a:Account {id: $suspect})-[:USED_CARD|USED_DEVICE|SHIPPED_TO*..6]-(b:Account {flagged: true}))
RETURN p;
```

## Supernodes and the limits of graph stores

A celebrity with 30 million followers, or a placeholder "unknown" device attached to half the fraud graph, turns any traversal that touches it into a scan of millions of edges. Measured: give user 7 50,000 friends and make user 42 one of them, and the same two-hop query goes from 1.1 ms to **24 ms**, aggregating 52,518 rows instead of 2,472; the depth-3 reach now covers the whole graph. A graph database suffers identically, because index-free adjacency makes each edge cheap, not a million edges. Neo4j groups a dense node's relationships by type and direction once it passes 50 relationships, so a traversal can skip irrelevant types, but production models still cap degree, exclude placeholder nodes, or sample.

Two more limits shape where graph stores fit. **Scaling out**: partitioning a graph means most traversals cross partitions, each crossing a network round trip, so many graph databases scale reads with replicas and keep the working graph on one large machine. **Whole-graph analytics** (PageRank, community detection over billions of edges) is batch work for a Pregel-style engine, not queries for an OLTP graph store. Graph databases fit fraud and identity resolution, recommendations over explicit relationships, dependency analysis and knowledge graphs, when queries are genuinely multi-hop and variable-depth. The [graphs in the real world lesson](/learn/data-structures/graphs/graphs-in-the-real-world) covers the representations.

## Time-series databases: the workload shape

Metrics, IoT readings, prices, application events: data arrives roughly in time order and is almost never updated. Queries select one or a few **series** (a metric name plus labels such as `host` and `region`) over a time range and aggregate: the average per minute for the last hour, the p99 per five minutes for a day. Recent data is read constantly, old data rarely, and very old data is downsampled or deleted. A time-series database exploits every one of those properties: it partitions by time, compresses each series' columns with encodings built for their shape, drops whole partitions for retention, and precomputes rollups.

## Gorilla compression, traced

Facebook's Gorilla paper (VLDB 2015) is the design most TSDBs borrow; Prometheus uses a variant. It encodes timestamps and values separately, per series, in blocks aligned to two-hour windows.

**Timestamps: delta-of-delta.** Store the first timestamp, then the first delta, then for each later point the *change in the delta*, with variable-length codes: `0` for a zero (1 bit), `10` plus 7 bits for −63 to 64 (9 bits), `110` plus 9 bits (12), `1110` plus 12 bits (16), and `1111` plus 32 bits (36). Timestamps `1000, 1010, 1020, 1030, 1041` become `1000, 10, 0, 0, 1`, costing 64 + 32 + 1 + 1 + 9 = 107 bits in the simplified scheme this lesson and its exercise use; the paper stores the block's two-hour-aligned start in the header and the first delta in 14 bits. Scrapers sample on a schedule, so the paper found 96% of timestamps compressed to a single bit.

**Values: XOR with the previous value.** Consecutive readings are often equal or close, and close doubles share their sign, exponent and leading mantissa bits. Trace a temperature gauge:

| Value | Bits that differ from the previous (XOR) | Leading / trailing zeros | Encoding | Bits |
|---|---|---|---|---|
| 24.0 | first value | — | raw 64-bit double | 64 |
| 24.0 | none | — | `0` | 1 |
| 24.5 | one bit (`0x0000800000000000`) | 16 / 47 | `11` + 5-bit leading count + 6-bit length + 1 meaningful bit | 14 |
| 24.25 | two bits (`0x0000C00000000000`) | 16 / 46 | new window: `11` + 5 + 6 + 2 | 15 |
| 24.0 | one bit (`0x0000400000000000`) | 17 / 46 | fits the previous window: `10` + the window's 2 bits | 4 |

Five points cost 107 + 98 = 205 bits, 5.1 bytes a point, dominated by the 160 bits of raw first timestamp, raw first value and first delta. Over a full two-hour block those are amortised: a flat series costs 2 bits a point (1 for the timestamp, 1 for the value). On Facebook's production data the paper reported 51% of values compressed to one bit and an average of **1.37 bytes per point**, against 16 bytes for a raw timestamp and double, about 12 times smaller.

The trick depends on order: a series' points must be stored together and in time order, and delta and XOR both lose their zeros when readings are noisy (a random float's XOR with its neighbour has few zero bits). That is why TSDBs buffer each series in memory (Prometheus keeps a two-hour in-memory head block, protected by a WAL, and cuts compressed chunks of about 120 samples) rather than appending points to a shared log.

## Chunks, retention, rollups and cardinality

**Time partitioning.** Data is stored in chunks covering a time range: two-hour blocks in Prometheus, compacted into larger ones; seven-day chunks by default in TimescaleDB hypertables (`chunk_time_interval`). A query for the last hour touches one chunk. **Retention** drops whole chunks (Prometheus keeps 15 days by default; TimescaleDB's `add_retention_policy` drops chunks older than an interval), which is instant, instead of a `DELETE` that writes millions of dead tuples for vacuum to clean up.

**Downsampling.** Keep raw points for two weeks, one-minute rollups for three months and hourly rollups for years. TimescaleDB's continuous aggregates refresh rollups incrementally; Prometheus setups use recording rules or a long-term store. Dashboards over long ranges read the rollups.

**The cardinality trap.** Every distinct combination of label values is a separate series, with its own index entries and its own in-memory head chunk, on the order of kilobytes each. Put `user_id` or `request_id` in a metric's labels on a product with ten million users and one metric becomes ten million series: memory explodes and the server falls over. It is the most common way teams take down their own monitoring. High-cardinality identifiers belong in logs and traces; metric labels need bounded value sets. The [metrics and logging platform case study](/learn/system-design/case-studies/metrics-and-logging-platform) designs the ingestion side.

## The Postgres version, measured

Postgres handles modest time-series workloads with native partitioning and a **BRIN** index, which stores only the minimum and maximum of each range of heap pages (128 pages by default):

```sql
CREATE TABLE metrics (
  ts     timestamptz      NOT NULL,
  series int              NOT NULL,
  value  double precision NOT NULL
) PARTITION BY RANGE (ts);

CREATE TABLE metrics_2026_09_26 PARTITION OF metrics
  FOR VALUES FROM ('2026-09-26') TO ('2026-09-27');

CREATE INDEX ON metrics USING brin (ts);

-- Retention is a metadata operation, not a DELETE.
DROP TABLE metrics_2026_06_26;
```

Measured on 4.32 million points (100 series, one point a minute for 30 days, inserted in time order): the heap is 215 MB, **52 bytes per point** (a 23-byte tuple header, a 4-byte line pointer, 20 bytes of data and 5 bytes of alignment padding).

| Access path | Index size | One hour (6,000 rows) | One day (144,000 rows) |
|---|---|---|---|
| No index | — | 43 ms (sequential scan) | 48 ms |
| B-tree on `ts` | 93 MB | 0.56 ms | 14 ms |
| BRIN on `ts` | 24 kB | 1.1 ms (128 pages read, 14,096 rows rechecked and discarded) | 16 ms |
| BRIN, rows physically shuffled | 24 kB | 94 ms: every range spans the month, so every page is read | — |

BRIN is about 3,900 times smaller than the B-tree and nearly as fast for range scans, **only while physical order follows time**. Appending in time order gives that for free; a backfill that loads one series at a time, or updates that move rows, destroys it (loading series by series measured a correlation of 0.02 and 78 ms).

The number that decides between Postgres and a TSDB is storage per point. At a million points a second, 86.4 billion points a day cost 4.5 TB at 52 bytes, against about 120 GB at Gorilla's 1.37 bytes: the 38-fold difference is the design. At 5,000 points a second it is 22 GB a day, and partitioned Postgres (or TimescaleDB, which adds automatic chunking, columnar compression and continuous aggregates as an extension) is the simpler system.

```exercise
id: delta-of-delta
title: Compress timestamps with delta-of-delta
prompt: |
  Implement `encode_timestamps(ts)` for a non-decreasing list of integer
  timestamps, using a simplified version of Gorilla's timestamp encoding.

  Return `{"encoded": [...], "bits": n}` where:
  - `encoded` is `[t0, d1, dod2, dod3, ...]`: the first timestamp, then the
    first delta `t1 - t0`, then for every later point the delta-of-delta
    `(t[i] - t[i-1]) - (t[i-1] - t[i-2])`.
  - `bits` is the encoded size: 64 bits for the first timestamp, 32 bits for
    the first delta, then for each delta-of-delta:
    - 0 → 1 bit
    - between -63 and 64 inclusive → 9 bits
    - between -255 and 256 inclusive → 12 bits
    - between -2047 and 2048 inclusive → 16 bits
    - anything else → 36 bits

  An empty list encodes to `[]` with 0 bits; a single timestamp costs 64 bits.
languages: [python, javascript]
entry: encode_timestamps
starter:
  python: |
    def encode_timestamps(ts):
        return {"encoded": [], "bits": 0}
  javascript: |
    function encode_timestamps(ts) {
      return { encoded: [], bits: 0 };
    }
tests:
  - args: [[1000, 1010, 1020, 1030, 1041]]
    expected: {"encoded": [1000, 10, 0, 0, 1], "bits": 107}
    label: one late sample
  - args: [[]]
    expected: {"encoded": [], "bits": 0}
  - args: [[5]]
    expected: {"encoded": [5], "bits": 64}
  - args: [[0, 60, 120, 180, 240, 300]]
    expected: {"encoded": [0, 60, 0, 0, 0, 0], "bits": 100}
    label: perfectly regular
  - args: [[0, 10, 30, 30, 330, 3330]]
    expected: {"encoded": [0, 10, 10, -20, 300, 2700], "bits": 166}
    hidden: true
  - args: [[0, 100, 137, 174]]
    expected: {"encoded": [0, 100, -63, 0], "bits": 106}
    hidden: true
  - args: [[0, 0, 256, 769]]
    expected: {"encoded": [0, 0, 256, 257], "bits": 124}
    hidden: true
  - args: [[0, 100, 136]]
    expected: {"encoded": [0, 100, -64], "bits": 108}
    hidden: true
hints:
  - "Keep the previous delta in a variable; each new delta-of-delta is the new delta minus it."
  - "Check the ranges from narrowest to widest, and note they are asymmetric (-63 to 64, not -64 to 63)."
```

## Vector databases: the query shape and its exact cost

An embedding model turns a passage (or an image, or a product) into a vector of a few hundred to a few thousand numbers, arranged so that passages with similar meaning land near each other: "How do I reset my password?" and "I forgot my login credentials" share almost no words and sit close together. Semantic search is **k-nearest-neighbour** search: embed the question, find the k closest stored vectors, usually by cosine similarity. [Embeddings and similarity](/learn/ai-and-llms/ml-foundations/embeddings-and-similarity) covers where the vectors come from.

Exact search compares the query with every vector. Five million 768-dimensional float32 vectors are 5,000,000 × 768 × 4 bytes = **15.4 GB**, and one query is 3.84 billion multiply-adds over all of it. Memory bandwidth, not arithmetic, is the limit: at 10–20 GB/s per core that is roughly 0.8–1.5 seconds per query per core, and 100 queries a second would need about 1.5 TB/s. It is the heap-of-distances approach from [K Closest Points](/practice/k-closest-points): correct, and it does not scale. Exact search is still the right tool below about 100,000 vectors, or over a filtered subset that small.

## IVF and HNSW

Approximate nearest-neighbour (ANN) indexes trade a little recall for orders of magnitude less work.

**IVF (inverted file).** k-means clusters the vectors into `lists` cells, each with a centroid, and a query scans only the `probes` cells whose centroids are nearest. With 5 million vectors and √5,000,000 ≈ 2,236 lists, 10 probes scan about 22,000 vectors, 0.45% of the data. Recall falls when a true neighbour sits in a cell whose centroid was not among the nearest, which more probes fix at linear cost. IVF builds fast and is compact, but it needs representative data to train the centroids and drifts as the data changes.

**HNSW (hierarchical navigable small world).** Every vector is a node in the bottom layer, linked to up to 2M near neighbours (M = 16 gives 32). Each node is also promoted to layer 1 with probability 1/M, to layer 2 with 1/M², and so on, like the express lanes of a skip list: for 5 million vectors, about 312,500 nodes in layer 1, 19,500 in layer 2, 1,200 in layer 3, 76 in layer 4 and a handful above, so about six layers. A search enters at the top, moves greedily to whichever neighbour is closer to the query until none is, drops a layer and repeats; on the bottom layer it runs a **beam search** that keeps the best `ef_search` candidates, the exercise below.

```viz
{"type": "ml", "scenario": "vector-search-hnsw",
 "title": "Greedy search down the HNSW layers",
 "caption": "The search starts on the sparse top layer, hops towards the query, then descends and continues on denser layers. It visits a few hundred to a few thousand nodes instead of every vector. A larger ef_search explores more candidates at the bottom, raising recall at the cost of latency."}
```

The knobs and their costs:

- **`M`**: more links per node raise recall and cost memory and build time. The bottom layer alone holds 5,000,000 × 32 links, 0.6–1.3 GB at 4–8 bytes per link.
- **`ef_construction`**: how widely inserts search for neighbours. Build quality is fixed afterwards; each insert is itself a search, so builds take minutes to hours and much memory.
- **`ef_search`**: the query-time beam width, the recall-versus-latency dial. Recall climbs quickly with `ef_search` and then flattens, so the last few points towards 0.99 cost the most latency; public benchmarks such as [ann-benchmarks](https://ann-benchmarks.com/) plot exactly this recall-against-throughput curve per dataset. Measure **recall@10** (the fraction of the true top 10 returned) against exact search on a sample of real queries, and tune until it meets your target.
- **Deletes** leave tombstoned nodes that still route searches; heavy churn degrades recall until a rebuild.

## Memory, quantisation and filtering

HNSW is fast only when vectors and graph are in RAM. Quantisation shrinks the vectors, and the usual practice is to search the compressed vectors and re-rank the top few hundred candidates with full precision:

| Representation of a 768-d vector | Bytes | 5 million vectors | Typical cost |
|---|---|---|---|
| float32 | 3,072 | 15.4 GB | Baseline |
| float16 (`halfvec` in pgvector) | 1,536 | 7.7 GB | Negligible recall loss |
| int8 scalar quantisation | 768 | 3.8 GB | Small recall loss |
| Product quantisation, 96 sub-vectors × 8 bits | 96 | 0.5 GB | Larger loss; re-rank needed |
| Binary, 1 bit per dimension | 96 | 0.5 GB | Only for models trained for it; re-rank needed |

**Filtering is the hard part.** Real queries are "the 10 nearest passages *for this tenant*, *in English*". A **post-filter** takes the index's `ef_search` candidates and drops those that fail: if the filter passes 1% of rows, 40 candidates leave 0.4 survivors on average, and returning 10 needs a beam of about 10 / 0.01 = 1,000. A **pre-filter** applies the predicate first and searches exactly within the subset: a 1% tenant of 5 million is 50,000 vectors, a 154 MB scan, fine for small subsets and hopeless for large ones. **In-filter** search checks the predicate during graph traversal; selective filters can disconnect the graph, which dedicated engines counter with extra filter-aware links. Vector databases differ mainly in how well they do this, so test with your real filters and selectivities.

## pgvector and hybrid search

The `pgvector` extension adds `vector`, `halfvec` and `bit` types, distance operators and HNSW and IVFFlat indexes to Postgres (HNSW defaults: `m = 16`, `ef_construction = 64`, `hnsw.ef_search = 40`; IVFFlat searches `ivfflat.probes = 1` list unless told otherwise):

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE chunks (
  id        bigserial PRIMARY KEY,
  doc_id    bigint      NOT NULL,
  tenant_id int         NOT NULL,
  body      text        NOT NULL,
  embedding vector(768) NOT NULL
);

CREATE INDEX chunks_embedding_idx ON chunks
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

SET hnsw.ef_search = 100;
SET hnsw.iterative_scan = relaxed_order;   -- 0.8.0+: keep scanning until enough rows pass the filter

SELECT id, doc_id, 1 - (embedding <=> $1) AS cosine_similarity
FROM chunks
WHERE tenant_id = 7
ORDER BY embedding <=> $1                   -- <=> is cosine distance
LIMIT 10;
```

The plan is an `Index Scan using chunks_embedding_idx` with `Order By: (embedding <=> …)` and `Filter: (tenant_id = 7)`, a post-filter: before iterative scans (pgvector 0.8.0), a selective tenant could get fewer than ten rows back. Partitioning by tenant, or a partial index per large tenant, turns it into a pre-filter. pgvector keeps embeddings transactionally consistent with their rows, joins and filters with SQL, and adds no system to operate; it handles millions to tens of millions of vectors on one well-provisioned node. Dedicated systems (Qdrant, Weaviate, Milvus, Pinecone and others) earn their place at hundreds of millions of vectors, with distributed indexes, aggressive quantisation, or filtered and hybrid search tuned as first-class features. (pgvector was not installed in this lesson's measurement environment, so no pgvector timings are quoted.)

Embeddings are good at meaning and bad at exact tokens such as product codes, error messages and names; keyword search ([BM25](/learn/databases/nosql-and-specialised/search-engines)) is the reverse. Production retrieval usually runs both and fuses the rankings with **reciprocal rank fusion**: each document scores the sum of 1 / (60 + rank) over the lists it appears in. Ranked 1st by vectors and 5th by keywords: 1/61 + 1/65 = 0.0318. Ranked 2nd in both: 2/62 = 0.0323, which wins; agreement beats a single first place. The [RAG lesson](/learn/ai-and-llms/building-with-llms/retrieval-augmented-generation) builds a pipeline on this.

```exercise
id: hnsw-beam-search
title: Beam search on a proximity graph
prompt: |
  Implement `beam_search(points, graph, entry, query, ef, k)`, the search
  HNSW runs on each layer.

  - `points[i]` is a list of coordinates; distance is squared Euclidean.
  - `graph[i]` lists the neighbours of node `i` (edges are symmetric).
  - Order nodes by (distance to `query`, index): smaller is better.

  Algorithm:
  1. `visited = {entry}`, `candidates = [entry]`, `best = [entry]`.
  2. While `candidates` is not empty: remove the best candidate `c`. If `c`
     is worse than the worst node in `best`, stop. Otherwise, for each
     neighbour `e` of `c` not yet in `visited`: add `e` to `visited`; if
     `best` has fewer than `ef` nodes or `e` is better than the worst node
     in `best`, add `e` to both `candidates` and `best`, then if `best` has
     more than `ef` nodes remove its worst.
  3. Return the first `k` nodes of `best` in order (fewer if `best` is
     smaller).

  With `ef = 1` this is pure greedy search and can stop at a local minimum.
languages: [python, javascript]
entry: beam_search
starter:
  python: |
    import heapq

    def beam_search(points, graph, entry, query, ef, k):
        return []
  javascript: |
    function beam_search(points, graph, entry, query, ef, k) {
      return [];
    }
tests:
  - args: [[[0, 0], [6, 0], [0, 6], [9, 1], [10, 2], [3, 9], [12, -1]], [[1, 2], [0, 2], [0, 1, 3, 5], [2, 4, 6], [3], [2], [3]], 0, [10, 0], 1, 1]
    expected: [1]
    label: ef = 1 stops at a local minimum
  - args: [[[0, 0], [6, 0], [0, 6], [9, 1], [10, 2], [3, 9], [12, -1]], [[1, 2], [0, 2], [0, 1, 3, 5], [2, 4, 6], [3], [2], [3]], 0, [10, 0], 3, 1]
    expected: [3]
    label: a wider beam escapes the trap
  - args: [[[0, 0], [6, 0], [0, 6], [9, 1], [10, 2], [3, 9], [12, -1]], [[1, 2], [0, 2], [0, 1, 3, 5], [2, 4, 6], [3], [2], [3]], 0, [10, 0], 3, 3]
    expected: [3, 4, 6]
    label: the true top 3
  - args: [[[5, 5]], [[]], 0, [0, 0], 3, 1]
    expected: [0]
    label: a single node
  - args: [[[0, 0], [6, 0], [0, 6], [9, 1], [10, 2], [3, 9], [12, -1]], [[1, 2], [0, 2], [0, 1, 3, 5], [2, 4, 6], [3], [2], [3]], 0, [10, 0], 2, 3]
    expected: [1, 0]
    hidden: true
    label: never more than ef results, and ef = 2 is still trapped
  - args: [[[0, 0], [6, 0], [0, 6], [9, 1], [10, 2], [3, 9], [12, -1]], [[1, 2], [0, 2], [0, 1, 3, 5], [2, 4, 6], [3], [2], [3]], 3, [10, 0], 1, 1]
    expected: [3]
    hidden: true
    label: the entry point is already the nearest
  - args: [[[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]], [[1], [0, 2], [1, 3], [2, 4], [3, 5], [4]], 0, [5, 0], 1, 1]
    expected: [5]
    hidden: true
    label: without a trap, greedy search is enough
  - args: [[[0, 0], [1, 0], [-1, 0]], [[1, 2], [0], [0]], 0, [0, 0], 3, 3]
    expected: [0, 1, 2]
    hidden: true
    label: equal distances ordered by index
hints:
  - "Compare nodes by the pair (distance, index) everywhere, including when deciding whether to stop."
  - "A node is marked visited when it is first examined, even if it is not added to best; that is exactly why ef = 1 can miss the true neighbour."
```

## Choosing among the three

| | Graph | Time-series | Vector |
|---|---|---|---|
| Storage trick | Index-free adjacency: edges are record pointers | Time-partitioned, per-series delta and XOR compressed columns | ANN graph (HNSW) or clusters (IVF) in RAM, often quantised |
| Built for | Variable-depth traversals, path patterns | Append-only points, range aggregation, retention | "Most similar to this" over dense vectors |
| Breaks on | Supernodes, sharding, whole-graph analytics | High-cardinality labels, updates, out-of-order backfills | Selective filters, heavy churn, data larger than RAM |
| Postgres alternative | Composite indexes, recursive CTEs | Partitioning, BRIN, TimescaleDB | pgvector with HNSW or IVFFlat |
| Move off Postgres when | Deep, branching traversals are latency-critical | Bytes per point (52 against ~1.4) dominate the cost | Hundreds of millions of vectors, or filtered search at scale |

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| A recommendation query is fast for most users and times out for some | A supernode in the traversal: `EXPLAIN` shows one index scan returning tens of thousands of rows | Cap degree, exclude placeholder nodes, precompute for heavy users |
| Monitoring memory triples after a deploy and the TSDB crashes | A high-cardinality label (`user_id`, `path` with ids) multiplied series count | Drop or bound the label; move identifiers to logs and traces |
| Time-range queries on a BRIN-indexed table suddenly read the whole table | Physical order no longer follows time (a backfill loaded series by series, or updates moved rows); `pg_stats.correlation` near 0 | Reload or `CLUSTER` in time order, or use a B-tree for that table |
| Filtered vector search returns fewer than k results, or irrelevant ones | Post-filtering a selective predicate over `ef_search` candidates | Iterative scans, a larger beam, partitions or partial indexes per tenant, or pre-filter small subsets exactly |
| Vector recall degrades month by month with no code change | Churn left tombstoned nodes, or IVF centroids were trained on old data | Rebuild or reindex on a schedule; track recall@10 against exact search |
| Vector queries slow down by an order of magnitude as data grows | Index no longer fits in RAM and pages from disk | Quantise, shard, or move to a store built for disk-resident indexes |

## Interviewer follow-ups

**"Should we use a graph database for friends-of-friends?"** Model answer: two hops over a composite index is milliseconds in Postgres (measured at about 1 ms for 2,500 two-hop rows); a graph store earns its place for deep, variable-depth traversals and path queries, and supernodes hurt both. Common wrong answer: "it is a graph, so a graph database".

**"How does Gorilla get to under 2 bytes a point?"** Model answer: per-series columns, delta-of-delta timestamps where regular scrapes give a 1-bit zero, and XOR of consecutive doubles storing only the meaningful middle bits; 1.37 bytes on Facebook's data, and it degrades for noisy values. Common wrong answer: "general-purpose compression such as gzip".

**"What does `ef_search` do, and how do you choose it?"** Model answer: it is the beam width of the bottom-layer search; larger explores more candidates, raising recall and latency; choose it by measuring recall@10 against exact search on real queries at the target latency, and raise it when filters discard candidates. Common wrong answer: "higher is always better" or "set it to k".

**"A tenant filter makes vector search return three results instead of ten."** Model answer: post-filtering; the expected survivors are ef × selectivity; fix with iterative scans, a beam near k / selectivity, per-tenant partitions or partial indexes, or exact search for small tenants. Common wrong answer: "the index is corrupt".

**"When does BRIN beat a B-tree?"** Model answer: on large append-only tables whose physical order follows the indexed column: 24 kB against 93 MB for 4.3 million rows, with range scans nearly as fast; it collapses when correlation is lost. Common wrong answer: "BRIN is always faster" or "BRIN is for small tables".

## What mid-level engineers get wrong

- **Adding a graph database for one- or two-hop queries** that Postgres answers in a millisecond.
- **Forgetting supernodes** until one celebrity account takes down the recommendation service.
- **Putting request or user ids in metric labels**, multiplying series count by millions.
- **Backfilling time series out of order** into a BRIN-indexed table and wondering why queries got slow.
- **Trusting ANN results without measuring recall** against exact search.
- **Budgeting RAM for vectors only**, forgetting the graph's links and the build's working memory.
- **Testing vector search without the production filters**, then shipping a search that returns three results.

## Senior signals

- You name the storage trick each specialised store relies on and check whether your workload needs it: two-hop queries do not need a graph database; 5,000 points a second do not need a TSDB.
- You can trace delta-of-delta and XOR encoding bit by bit and explain why 1.37 bytes a point needs regular timestamps and slowly changing values.
- You do the storage arithmetic (52 bytes a row against about 1.4 compressed) and the exact-kNN arithmetic (bytes scanned per query against memory bandwidth) and let them decide.
- You know HNSW's layers, `M`, `ef_construction` and `ef_search`, measure recall@10, budget memory for vectors plus links, and use quantisation with re-ranking.
- You treat filtered vector search as the hard problem and can say what post-, pre- and in-filtering cost at a given selectivity.
- You default to hybrid retrieval with reciprocal rank fusion rather than trusting embeddings alone.

## Check yourself

```quiz
- q: >-
    A team wants a graph database for a feature that shows each user's friends and friend-of-friend suggestions ranked by mutual friends. What is the best response?
  options: ["Adopt a graph database, since friendships are a graph at any depth", "Use a vector database to find users with similar friend lists", "Stay relational; a composite index serves two hops in milliseconds", "Use a document store and embed each user's friends in their record"]
  answer: 2
  explanation: >-
    Two fixed hops over a primary-key index on (user_id, friend_id) measured about 1 ms for 2,500 two-hop rows on a 5-million-edge graph, transactional and with no second system. Index-free adjacency pays off as traversals get deeper and branchier; a supernode would hurt either store equally.
- q: >-
    After someone adds a customer_id label to a request-latency metric, the Prometheus server's memory triples and it starts crashing. Why?
  options: ["Prometheus stores integer label values uncompressed, unlike strings", "Each label combination is its own series, so series multiply", "Latency samples now take more bytes because each carries an ID", "Each sample is now scraped once per customer, so volume multiplies"]
  answer: 1
  explanation: >-
    Every distinct label combination is a separate series with its own index entries and in-memory head chunk, so a high-cardinality label multiplies series count by the number of customers. Series cardinality, not sample size or scrape volume, drives TSDB memory. Unbounded identifiers belong in logs or traces.
- q: >-
    In Gorilla's value encoding, a gauge reads 24.0 and then 24.0 again. How many bits does the second value cost, and why?
  options: ["64 bits, since every value is stored as a raw double", "14 bits, since a new window of meaningful bits is needed", "9 bits, since the delta falls in the smallest range", "1 bit, since its XOR with the previous value is zero"]
  answer: 3
  explanation: >-
    Gorilla XORs each double with the previous one; identical values give zero, encoded as a single 0 bit. A value that differs in a few bits costs a control prefix plus the meaningful bits, and only the first value is stored raw. The 9-bit range code belongs to timestamps, not values.
- q: >-
    A BRIN index on ts served one-hour queries in about 1 ms. After a backfill that loaded historical data one series at a time, the same queries read the whole table. What happened?
  options: ["BRIN only indexes the newest partition, so older rows are skipped", "BRIN needs ANALYZE after every insert, or its summaries go stale", "Rows no longer follow time order, so every range spans the period", "The backfill filled BRIN's 24 kB limit, so new ranges are unindexed"]
  answer: 2
  explanation: >-
    BRIN stores only the minimum and maximum ts of each 128-page range. When rows arrive in time order the ranges are narrow and a one-hour query reads about 128 pages; loading series by series makes every range cover the whole backfill period, so every range matches. Measured, a shuffled copy took 94 ms against 1.1 ms. Reload in time order or use a B-tree.
- q: >-
    A pgvector query with WHERE tenant_id = 7 ORDER BY embedding <=> $1 LIMIT 10 returns only 3 rows, although the tenant has thousands of chunks. Tenant 7 holds 1% of rows and hnsw.ef_search is 40. What is happening?
  options: ["HNSW yields 40 candidates and the filter keeps about 1% of them", "The HNSW index is corrupt and silently skips parts of the graph", "The LIMIT is applied before ORDER BY, so rows are cut off too early", "Cosine distance ignores WHERE clauses, so matching rows are dropped"]
  answer: 0
  explanation: >-
    The index returns ef_search candidates in similarity order and the filter is applied afterwards; at 1% selectivity, 40 candidates leave well under one survivor on average. Iterative scans (pgvector 0.8.0+), a beam near k divided by selectivity, per-tenant partitions or partial indexes, or exact search over the tenant's 50,000 vectors fix it.
- q: >-
    In reciprocal rank fusion with k = 60, document X is ranked 1st by vector search and absent from the keyword results; document Y is ranked 3rd in both. Which ranks higher?
  options: ["X, because a first place in any single list always wins", "Y, because 2/63 ≈ 0.0317 beats X's 1/61 ≈ 0.0164", "They tie, because RRF counts only the lists that include each", "It depends on the BM25 scores, which RRF adds in directly"]
  answer: 1
  explanation: >-
    RRF sums 1/(60 + rank) across lists and ignores raw scores: X gets 1/61 ≈ 0.0164 and Y gets 2/63 ≈ 0.0317. A document both retrievers agree on accumulates two contributions, which makes hybrid search robust to either retriever's blind spots.
```
