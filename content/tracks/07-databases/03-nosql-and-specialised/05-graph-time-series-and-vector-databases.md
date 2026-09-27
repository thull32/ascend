---
slug: graph-time-series-and-vector-databases
title: "Graph, time-series and vector databases: when a specialised store earns its place"
description: The storage trick behind each of three specialised database families (index-free adjacency, compressed time-partitioned columns, and approximate nearest-neighbour graphs like HNSW), the query shape each is built for, and the point at which Postgres stops being enough.
minutes: 29
difficulty: medium
tags: [graph-database, time-series, vector-database, hnsw, pgvector, gorilla-compression, neo4j]
problems: [k-closest-points]
---
Three tickets land in the same quarter. Product wants "people you may know": friends of friends, ranked by mutual friends, for 50 million users. The platform team wants to keep metrics from 20,000 hosts, each emitting 500 series every 10 seconds, which is a million points a second. The AI team wants semantic search over five million help-centre passages so the chatbot can find the right answer even when the user's words match none of the article's.

Each ticket has a database category built for it: a graph database, a time-series database, a vector database. Each also has a Postgres answer that works up to a point. The skill a senior engineer brings is not knowing the product names. It is knowing the one storage trick that makes each specialised store fast, so you can tell whether your workload needs that trick or only sounds like it does.

## Graph databases

### The query shape

Friends of friends is a two-hop traversal. In SQL, with a `friendships(user_id, friend_id)` table and a primary key on both columns:

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

With 200 friends on average, that is one index range scan returning 200 rows, then 200 index range scans returning about 200 rows each: 40,000 rows aggregated, a few milliseconds on warm data. Two hops is fine in Postgres. Do not add a graph database for this query.

The shape that hurts is **variable-depth traversal**: "is this new account connected to a known fraud ring through shared cards, devices or addresses, within five hops?", "what is the shortest chain of dependencies between these two services?". Each hop multiplies the frontier by the average degree, and in SQL each hop is another self-join or another iteration of a recursive CTE, and every edge followed is a B-tree descent.

```sql
WITH RECURSIVE reach(node, depth, path) AS (
  SELECT 42::bigint, 0, ARRAY[42::bigint]
  UNION ALL
  SELECT e.dst, r.depth + 1, r.path || e.dst
  FROM reach r
  JOIN edges e ON e.src = r.node
  WHERE r.depth < 4 AND e.dst <> ALL (r.path)
)
SELECT DISTINCT node FROM reach;
```

```viz
{"type": "graph", "algorithm": "bfs", "directed": false, "start": "me",
 "nodes": [{"id": "me"}, {"id": "ana"}, {"id": "raj"}, {"id": "lee"}, {"id": "kim"}, {"id": "ivy"}, {"id": "bo"}, {"id": "zoe"}, {"id": "max"}],
 "edges": [{"from": "me", "to": "ana"}, {"from": "me", "to": "raj"}, {"from": "me", "to": "lee"}, {"from": "ana", "to": "kim"}, {"from": "raj", "to": "kim"}, {"from": "raj", "to": "ivy"}, {"from": "lee", "to": "bo"}, {"from": "kim", "to": "zoe"}, {"from": "ivy", "to": "max"}],
 "title": "A traversal expands hop by hop",
 "caption": "Breadth-first expansion from one user. Level one is your friends; level two is friends of friends (kim is reachable twice, which is what the mutual-friend count measures). With 200 friends each, the frontier grows roughly 200-fold per hop."}
```

### Index-free adjacency

A native graph database such as Neo4j stores the graph so that following an edge does not need an index. Nodes and relationships are fixed-size records in separate files. A node record holds the ID of its first relationship; each relationship record holds its two endpoints and pointers to the next and previous relationships of each endpoint. Following an edge means multiplying a record ID by the record size to get a file offset: O(1) per edge, independent of how large the graph is. A relational join pays O(log n) per edge for the B-tree descent, which is three or four page accesses, usually cached.

Be honest about the size of that win. For a two-hop query on cached data, the difference is a constant factor. It grows with depth and with graph size, and it is decisive for the deep, branching traversals above. Just as important in practice is the query language: path patterns, variable-length relationships and shortest-path search are first-class in Cypher, where in SQL they are a recursive CTE you have to write carefully.

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

### Where graph databases hurt

- **Supernodes.** A celebrity with 30 million followers, or a shared "unknown" device ID attached to half the fraud graph, turns any traversal that touches it into a scan of millions of edges. Production graph models almost always end up capping degree or excluding such nodes.
- **Scaling out.** Partitioning a graph across machines means most traversals cross partitions, and each crossing is a network round trip. Many graph databases scale reads with replicas and keep writes on one machine, and the distributed ones pay for every cross-partition hop. Plan for the whole working graph to fit on one large node.
- **Whole-graph analytics.** PageRank or community detection over billions of edges is batch work for a Pregel-style engine (Spark GraphX and similar), not queries for an OLTP graph store.

Graph databases fit fraud and identity resolution, recommendation over explicit relationships, network and dependency analysis, and knowledge graphs, when queries are genuinely multi-hop and variable-depth. For one or two fixed hops, Postgres with the right composite indexes is simpler and fast enough.

## Time-series databases

### The workload shape

Metrics, IoT readings, prices, application events: the data is appended in roughly time order and almost never updated. Queries select one or a few **series** (a metric name plus labels such as `host` and `region`) over a time range and aggregate: the average per minute over the last hour, the p99 per five minutes over a day. Recent data is read constantly, old data rarely, and very old data is downsampled or deleted.

A time-series database exploits every one of those properties.

**Time partitioning.** Data is stored in chunks covering a time range: two-hour blocks in Prometheus, configurable chunks in TimescaleDB. A query for the last hour touches one chunk. Retention is dropping whole chunks, which is instant, instead of `DELETE`, which in Postgres means writing millions of dead tuples for vacuum to clean up.

**Columnar compression within a series.** Points of one series are stored together, timestamps in one column and values in another, and each column is compressed with a scheme built for its shape. The influential design is from Facebook's Gorilla paper:

- **Timestamps, delta-of-delta.** Samples arrive at nearly regular intervals. Store the first timestamp, then the first delta, then for each later point the *change in the delta*. Regular samples produce zeros, and Gorilla encodes a zero in one bit. Timestamps `1000, 1010, 1020, 1030, 1041` become `1000, 10, 0, 0, 1`.
- **Values, XOR with the previous value.** Consecutive readings of a gauge are often identical or close. XOR of two equal doubles is zero (one bit); XOR of close values has long runs of leading and trailing zeros, so only the meaningful bits in the middle are stored.

Gorilla reported an average of about 1.4 bytes per point on Facebook's monitoring data, against 16 bytes for a raw timestamp and double. Prometheus uses an encoding derived from it.

**Downsampling.** Keep raw points for two weeks, one-minute averages for three months, one-hour averages for years. Dashboards over long ranges read the rollups.

### The cardinality trap

Every distinct combination of label values is a separate series, with its own index entry and its own in-memory buffer for the chunk being written. Put `user_id` or `request_id` in a metric's labels on a product with ten million users, and one metric becomes ten million series. Memory use explodes and the database falls over. It is the most common way teams take down their own monitoring. High-cardinality identifiers belong in logs and traces; metrics get labels with bounded value sets.

### The Postgres version, and the number that decides

Postgres handles modest time-series workloads well with native partitioning:

```sql
CREATE TABLE metrics (
  ts     timestamptz      NOT NULL,
  series int              NOT NULL,
  value  double precision NOT NULL
) PARTITION BY RANGE (ts);

CREATE TABLE metrics_2026_09_26 PARTITION OF metrics
  FOR VALUES FROM ('2026-09-26') TO ('2026-09-27');

CREATE INDEX ON metrics (series, ts);

SELECT date_trunc('minute', ts) AS minute, avg(value)
FROM metrics
WHERE series = 812 AND ts >= now() - interval '1 hour'
GROUP BY 1
ORDER BY 1;

-- Retention is a metadata operation, not a DELETE.
DROP TABLE metrics_2026_06_26;
```

The TimescaleDB extension adds automatic chunking, columnar compression and continuous aggregates on top, and moves the threshold a long way. The number that decides is storage per point. A plain Postgres row carries a 23-byte tuple header, a 4-byte line pointer and alignment padding, so a timestamp, an integer and a double cost roughly 50 bytes before any index. At a million points a second:

- 86.4 billion points a day × 50 bytes ≈ 4.3 TB a day in plain rows;
- × 1.5 bytes ≈ 130 GB a day with Gorilla-style compression.

At that rate the thirty-fold difference is the design. At 5,000 points a second it is 22 GB a day raw, and a partitioned Postgres table (or TimescaleDB) is the simpler system.

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

## Vector databases

### The query shape

An embedding model turns a passage of text (or an image, or a product) into a vector of a few hundred to a few thousand numbers, arranged so that passages with similar meaning land near each other. "How do I reset my password?" and "I forgot my login credentials" share almost no words and sit close together. Semantic search is then **k-nearest-neighbour** search: embed the question, find the k stored vectors closest to it, usually by cosine similarity. [Embeddings and similarity](/learn/ai-and-llms/ml-foundations/embeddings-and-similarity) covers where the vectors come from; this section is about finding the neighbours.

Exact search compares the query with every stored vector: `n × d` multiply-adds. For five million 768-dimensional vectors that is almost four billion multiply-adds over 15 GB of floats per query. Memory bandwidth, not arithmetic, is the limit: on the order of a second on one core, and far too slow at a hundred queries a second. It is the heap-of-distances approach from [K Closest Points](/practice/k-closest-points), which is correct and does not scale.

### Approximate nearest neighbours: HNSW

Vector databases give up exactness for speed with an approximate nearest-neighbour (ANN) index. The dominant one is **HNSW** (hierarchical navigable small world), a layered proximity graph. Every vector is a node in the bottom layer, linked to its `M` nearest neighbours; a random subset is also promoted into each higher layer, which is sparser, like the express lanes of a skip list. A search enters at the top, greedily moves to whichever neighbour is closest to the query until no neighbour is closer, drops a layer and repeats, then at the bottom runs a beam search keeping the best `ef_search` candidates.

```viz
{"type": "ml", "scenario": "vector-search-hnsw",
 "title": "Greedy search down the HNSW layers",
 "caption": "The search starts on the sparse top layer, hops towards the query, then descends and continues on denser layers. It visits a few dozen nodes instead of every vector. A larger ef_search explores more candidates at the bottom, raising recall at the cost of latency."}
```

What you tune and what it costs:

- **`M`** (neighbours per node, 16 is typical): higher improves recall and costs memory and build time.
- **`ef_construction`**: how hard the build searches for good neighbours. Build quality is fixed afterwards.
- **`ef_search`**: the query-time beam width, the main recall-versus-latency dial. Measure **recall@10** (the fraction of the true top 10 the index returns) against exact search on a sample of real queries, and tune until it meets your target, often around 0.95.
- **Memory.** HNSW performs well only when the vectors and graph are in RAM. Five million 768-dimensional float32 vectors are 5,000,000 × 768 × 4 bytes ≈ 15 GB before the graph. **Quantisation** shrinks that: int8 scalar quantisation is four times smaller, product quantisation and binary quantisation far more, each at some recall cost.
- **Writes.** Inserting means searching the graph for neighbours, so it is much slower than a B-tree insert, and deletes leave tombstones that degrade the graph until it is rebuilt.

The main alternative is **IVF** (inverted file): k-means clusters the vectors into `lists` cells, and a query scans only the `nprobe` nearest cells. It builds faster and uses less memory, but at the same recall its queries are usually slower than HNSW's.

### Filtering is the hard part

Real queries are never "the 10 nearest vectors". They are "the 10 nearest passages *for this tenant*, *in English*, *published*". An HNSW search produces `ef_search` candidates in similarity order; if a filter then removes most of them, you get three results instead of ten. If you filter first, you are back to exact search over the subset. Vector databases differ mainly in how cleverly they handle this, and it is the first thing to test with your real filters and selectivities.

### pgvector

The `pgvector` extension adds a `vector` type, distance operators and HNSW and IVFFlat indexes to Postgres:

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

SET hnsw.ef_search = 100;          -- default 40

EXPLAIN (ANALYZE)
SELECT id, doc_id, 1 - (embedding <=> $1) AS cosine_similarity
FROM chunks
WHERE tenant_id = 7
ORDER BY embedding <=> $1          -- <=> is cosine distance
LIMIT 10;
```

```text
Limit  (actual time=2.911..3.402 rows=10 loops=1)
  ->  Index Scan using chunks_embedding_idx on chunks  (actual time=2.909..3.398 rows=10 loops=1)
        Order By: (embedding <=> '[0.0123,-0.0456,...]'::vector)
        Filter: (tenant_id = 7)
        Rows Removed by Filter: 58
Execution Time: 3.451 ms
```

`Rows Removed by Filter: 58` is the filtering problem in miniature. With the default `ef_search` of 40, the same query would have seen only 40 candidates and could have returned fewer than ten rows. Recent pgvector versions add iterative index scans (`SET hnsw.iterative_scan = relaxed_order`) that keep searching until enough rows pass the filter; partitioning by tenant or a partial index per large tenant also help.

The trade against a dedicated vector database (Qdrant, Weaviate, Milvus, Pinecone and others) follows the pattern of this whole module. pgvector keeps embeddings transactionally consistent with the rows they describe, lets you join and filter with ordinary SQL, and adds no new system to operate; it comfortably handles millions to tens of millions of vectors on one well-provisioned node. Dedicated systems earn their place at hundreds of millions of vectors, when you need distributed indexes, aggressive quantisation, or filtered search and hybrid ranking tuned as first-class features.

### Hybrid search

Embeddings are good at meaning and bad at exact tokens: product codes, error messages, names. Keyword search (the [BM25 ranking](/learn/databases/nosql-and-specialised/search-engines) from the previous lesson) is the reverse. Most production retrieval runs both and fuses the rankings, commonly with **reciprocal rank fusion**, which scores each document by summing `1 / (60 + rank)` over the lists it appears in. A passage ranked 1st by vectors and 5th by keywords scores 1/61 + 1/65 ≈ 0.0318; one ranked 2nd in both scores 2/62 ≈ 0.0323 and wins. Agreement between the two retrievers beats a single first place. The [RAG lesson](/learn/ai-and-llms/building-with-llms/retrieval-augmented-generation) builds a full pipeline on this.

## Choosing among the three

| | Graph | Time-series | Vector |
|---|---|---|---|
| Storage trick | Index-free adjacency: edges are pointers | Time-partitioned, per-series compressed columns | Approximate nearest-neighbour graph (HNSW) or clusters (IVF) in RAM |
| Built for | Variable-depth traversals, path patterns | Append-only points, range scans with aggregation, retention | "Most similar to this" over dense vectors |
| Breaks on | Supernodes, sharding, whole-graph analytics | High-cardinality labels, updates, cross-series joins | Selective filters, heavy writes and deletes, datasets larger than RAM |
| Postgres alternative | Composite indexes and recursive CTEs | Native partitioning, BRIN, TimescaleDB | pgvector with HNSW |
| Move off Postgres when | Traversals are deep, branching and latency-critical | Point rates and retention make row storage cost 30× too much | Hundreds of millions of vectors, or filtered search at scale |

## Senior signals

- You name the storage trick each specialised store relies on, and you check whether your workload actually needs it (two-hop queries do not need a graph database; 5,000 points a second do not need a TSDB).
- You know supernodes and cross-partition traversals are why graph databases tend to scale up rather than out.
- You treat label cardinality as the first design question for metrics and keep request- or user-level IDs out of labels.
- You can do the storage arithmetic for time series (rows at around 50 bytes per point against compressed columns at 1–2 bytes) and let it make the decision.
- You measure ANN recall against exact search, tune `ef_search` deliberately, budget RAM for vectors plus graph, and test with your real filters.
- You default to hybrid retrieval (BM25 plus vectors with reciprocal rank fusion) rather than trusting embeddings alone.

## Check yourself

```quiz
- q: >-
    A team wants a graph database for a feature that shows each user's direct friends and the count of mutual friends with one other user. What is the best response?
  options: ["Use a vector database to find users with similar friend lists", "Adopt a graph database, since friendships are a graph at any depth", "Stay relational; a composite index serves one or two hops quickly", "Use a document store and embed each user's friends in their record"]
  answer: 2
  explanation: >-
    Index-free adjacency pays off as traversals get deeper and branchier. For one or two fixed hops, a relational join over a composite index on (user_id, friend_id) runs in milliseconds, is transactional and needs no second system. A graph database earns its place for deep, variable-depth traversals.
- q: >-
    After someone adds a customer_id label to a request-latency metric, the Prometheus server's memory triples and it starts crashing. Why?
  options: ["Prometheus stores integer label values uncompressed, unlike strings", "Each label combination is its own series, so series count multiplies", "Latency values now take more bytes, since each carries a customer ID", "Each sample is now scraped once per customer, so volume multiplies"]
  answer: 1
  explanation: >-
    Each distinct label combination is a separate series with its own index entry and in-memory head chunk, so a high-cardinality label multiplies the number of series by the number of customers. Series cardinality, not point size or scrape volume, drives TSDB memory. Identifiers with unbounded values belong in logs or traces; metrics should use bounded labels such as region or status class.
- q: >-
    Why does delta-of-delta encoding compress timestamps so well for metrics?
  options: ["Consecutive timestamps XOR to zero, so each point needs one bit", "It keeps a dictionary of common timestamps shared across series", "It stores only every tenth timestamp and interpolates the ones between", "Samples arrive at near-fixed intervals, so most delta changes are 0"]
  answer: 3
  explanation: >-
    Scrapers sample on a schedule, so consecutive deltas are almost always equal. Encoding the difference between deltas turns most points into a 0, which costs one bit; occasional jitter costs a few more bits. XOR is the trick Gorilla uses for values, not timestamps, and nothing is dropped or interpolated.
- q: >-
    A pgvector query with WHERE tenant_id = 7 ORDER BY embedding <=> $1 LIMIT 10 sometimes returns only 3 rows, although the tenant has thousands of chunks. What is happening?
  options: ["Cosine distance ignores WHERE clauses, so matches are dropped", "HNSW yields ef_search candidates and the tenant filter drops most of them", "The LIMIT is applied before ORDER BY, so rows get cut off too early", "The HNSW index is corrupt and silently skips parts of the graph"]
  answer: 1
  explanation: >-
    An ANN index returns a bounded candidate set in similarity order, and filtering happens afterwards. When the filter is selective relative to the candidate set, too few rows survive. Raise ef_search, enable iterative scans, or partition or index per tenant. This is the central practical problem of filtered vector search.
- q: >-
    In reciprocal rank fusion with k = 60, document X is ranked 1st by vector search and absent from the keyword results; document Y is ranked 3rd in both. Which ranks higher?
  options: ["X, because a first place in any single list always wins", "Y, because 2/63 ≈ 0.0317 beats X's 1/61 ≈ 0.0164", "They tie, because RRF only counts the lists that include each", "It depends on the BM25 scores, which RRF uses directly"]
  answer: 1
  explanation: >-
    RRF sums 1/(k + rank) across lists and ignores raw scores: X gets 1/61 ≈ 0.0164 and Y gets 1/63 + 1/63 ≈ 0.0317. A document that both retrievers agree on accumulates two contributions, which is why hybrid search is robust to either retriever's blind spots.
```
