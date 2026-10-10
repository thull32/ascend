---
lesson: graph-time-series-and-vector-databases
source: 49b717771e1ed1fb
fit: great
desk:
  - "The friends-of-friends SQL, the recursive CTE and its depth table"
  - "The Cypher examples"
  - "The Gorilla value-encoding trace, bit by bit"
  - "The BRIN measurements table and the quantisation table"
  - "The pgvector schema and filtered query"
  - "Exercises: compress timestamps with delta-of-delta; beam search on a proximity graph"
---
## Introduction

Three tickets land in the same quarter. Product wants "people you may know": friends of friends, ranked by mutual friends, for 50 million users. The platform team wants to keep metrics from 20 thousand hosts, each emitting 500 series every 10 seconds, a million points a second. And the AI team wants semantic search over five million help-centre passages, so the chatbot finds the right answer even when the user's words match none of the article's.

Each ticket has a database category built for it: graph, time-series, vector. Each also has a Postgres answer that works up to a point. The senior skill is not knowing product names. It is knowing the one storage trick that makes each specialised store fast, so you can tell whether your workload needs that trick, or only sounds like it does.

## Graphs: the query shape decides

Friends of friends is a two-hop traversal. In Postgres, with a friendships table keyed on both user and friend, the lesson measured it on 100 thousand users with about 50 friends each, 5 million rows. User 42's 49 friends led to about 2,500 two-hop rows, and the whole ranked query ran in 1.1 milliseconds. Two hops is fine in Postgres. Do not add a graph database for that.

The shape that hurts is variable-depth traversal: is this new account connected to a known fraud ring within five hops, through shared cards, devices or addresses? Each hop multiplies the frontier by the average degree. A recursive query in Postgres reached about 2,500 users at depth two in 2 milliseconds, 71 thousand at depth three in 43 milliseconds, and the entire graph at depth four, in 643. Each extra level cost about 15 times more. Every edge touched in SQL is a B-tree probe.

A graph database's trick is index-free adjacency. Nodes and relationships are fixed-size records, and each relationship stores pointers to the next relationship for each endpoint. Following an edge is one multiplication to find an offset, and one read, independent of graph size. A join follows the same edge by descending a B-tree of three or four levels.

Be honest about the size of that win. For a two-hop query on cached data, it is a constant factor, a few times at most. It grows with depth and graph size, and becomes decisive for deep, branching traversals and path search. The query language matters too: variable-length paths and shortest path are first-class in Cypher, where SQL needs a careful recursive query.

Now the failure. A celebrity with 30 million followers, or a placeholder "unknown device" attached to half the fraud graph. The lesson gave one user 50 thousand friends and made user 42 one of them. The two-hop query went from 1.1 milliseconds to 24. A graph database suffers identically, because index-free adjacency makes each edge cheap, not a million edges. Production models cap degree, exclude placeholder nodes, or sample. And graphs are hard to shard, because most traversals then cross the network; many graph databases keep the working graph on one large machine.

## Time series: Gorilla compression

Metrics, sensor readings, prices: data arrives roughly in time order and is almost never updated. Queries pick a few series over a time range and aggregate. Recent data is read constantly, old data rarely. A time-series database exploits all of that: it partitions by time, compresses each series with encodings built for its shape, drops whole partitions for retention, and precomputes rollups.

The design most of them borrow is Facebook's Gorilla, and it has two tricks. Timestamps: store the first one, then the first gap, then for each later point only the change in the gap. Scrapers sample on a schedule, so the change is almost always zero, and zero costs a single bit. The paper found 96 percent of timestamps compressed to one bit.

Values: XOR each reading with the previous one. If a gauge reads 24 and then 24 again, how many bits does the second value cost?

[pause]

One. The XOR is zero, and zero is a single bit. When the value changes a little, close numbers share their sign, exponent and leading bits, so only a short window of meaningful middle bits is stored. A flat series costs 2 bits a point. On Facebook's production data the average was 1.37 bytes a point, against 16 bytes for a raw timestamp and value: about 12 times smaller.

The trick depends on order. A series' points must be stored together and in time order, and noisy values lose their zeros. That is why these databases buffer each series in memory, Prometheus keeps a two-hour head block, rather than appending points to a shared log.

## Chunks, cardinality and the Postgres version

Data is stored in time chunks. A query for the last hour touches one chunk, and retention drops whole chunks instantly, instead of a delete that writes millions of dead rows for vacuum. Downsampling keeps raw points for a couple of weeks, minute rollups for months, hourly ones for years.

The cardinality trap is the most common way teams take down their own monitoring. Every distinct combination of label values is a separate series, with its own index entries and in-memory chunk. Put a user ID in a metric's labels on a product with ten million users, and one metric becomes ten million series. Memory explodes and the server falls over. Identifiers belong in logs and traces; metric labels need bounded value sets.

Postgres handles modest time series with partitioning and a BRIN index, which stores only the minimum and maximum timestamp for each range of 128 pages. On 4.3 million points, the B-tree was 93 megabytes and BRIN was 24 kilobytes, about 3,900 times smaller, and one-hour queries were nearly as fast: about one millisecond. But only while physical order follows time. Shuffle the rows, or backfill one series at a time, and every range spans the whole month: the same query took 94 milliseconds and read everything.

Here is the number that decides between Postgres and a time-series database: storage per point. A Postgres row costs 52 bytes, mostly header and padding. At a million points a second, that is 4.5 terabytes a day, against about 120 gigabytes at Gorilla's 1.37 bytes. That 38-fold difference is the design. At 5,000 points a second it is 22 gigabytes a day, and partitioned Postgres, or the TimescaleDB extension, is the simpler system.

## Vectors: exact cost and HNSW

An embedding model turns a passage into a vector of a few hundred to a few thousand numbers, arranged so that similar meanings land near each other. "How do I reset my password" and "I forgot my login credentials" share almost no words and sit close together. Semantic search is nearest-neighbour search: embed the question, find the closest stored vectors.

Exact search compares the query with every vector. Five million 768-dimensional vectors are 15.4 gigabytes, and memory bandwidth is the limit: roughly one second per query per core. A hundred queries a second would need about one and a half terabytes a second. Exact search is still right below about 100 thousand vectors, or over a filtered subset that small.

Approximate indexes trade a little recall for orders of magnitude less work. IVF clusters the vectors and scans only the few clusters nearest the query: ten probes out of about 2,200 clusters scan under half a percent of the data. HNSW builds a layered graph, like the express lanes of a skip list. Every vector sits in the bottom layer with up to 32 links; one in sixteen is also promoted to the layer above, one in 256 to the next, and so on, so five million vectors make about six layers. A search enters at the top, hops greedily towards the query, drops a layer, and repeats. On the bottom layer it keeps a beam of the best candidates, whose width is the ef search setting.

That setting is the recall-versus-latency dial. Recall climbs quickly and then flattens, so the last few points towards 0.99 cost the most. Measure recall at ten, the fraction of the true top ten you return, against exact search on real queries, and tune until it meets your target. And HNSW is only fast in RAM, so budget for the links as well as the vectors: the bottom layer's links alone are 0.6 to 1.3 gigabytes here. Quantisation helps: 8-bit integers cut the vectors from 15.4 gigabytes to 3.8 at a small recall loss, and you re-rank the top few hundred at full precision.

## Filtering and hybrid search

Filtering is the hard part. Real queries are "the ten nearest passages for this tenant, in English". A post-filter takes the index's candidates and drops those that fail. A pgvector query for one tenant holding 1 percent of the rows, with the default beam of 40, returns only three results. Why?

[pause]

Forty candidates at 1 percent selectivity leave well under one survivor on average. To return ten, you need a beam of about ten divided by the selectivity, a thousand. The fixes: pgvector's iterative scans, which keep searching until enough rows pass the filter; a larger beam; per-tenant partitions or partial indexes; or exact search, because a 1 percent tenant of five million is 50 thousand vectors. Vector databases differ mainly in how well they handle this, so test with your real filters.

pgvector keeps embeddings transactionally consistent with their rows, filters and joins with SQL, adds no system, and handles millions to tens of millions of vectors on one node. Dedicated systems earn their place at hundreds of millions, or when filtered and hybrid search must be first-class.

Hybrid search, because embeddings are good at meaning and bad at exact tokens like product codes and error messages, and keyword search is the reverse. Run both and fuse with reciprocal rank fusion: each document scores one over 60 plus its rank, summed across lists. First by vectors and fifth by keywords scores 0.0318. Second in both scores 0.0323, and wins. Agreement beats a single first place.

## In the interview

Should we use a graph database for friends of friends?

[pause]

No. Two hops over a composite index is milliseconds in Postgres, measured at about one millisecond for 2,500 two-hop rows. A graph store earns its place for deep, variable-depth traversals and path queries, and supernodes hurt both. The wrong answer is "it is a graph, so a graph database."

And: what does ef search do, and how do you choose it? It is the beam width of the bottom-layer search. Larger explores more candidates, raising recall and latency. Choose it by measuring recall at ten against exact search on real queries at your target latency, and raise it when filters discard candidates. "Higher is always better" and "set it to k" are both wrong.

## Recap

Five things to remember. Name the storage trick and check whether your workload needs it: two hops do not need a graph database, and 5,000 points a second do not need a time-series database. Supernodes hurt every store; cap degree. Gorilla gets to 1.37 bytes a point through one-bit unchanged timestamps and XORed values, against 52 bytes for a Postgres row, and high-cardinality labels kill a time-series database. BRIN is tiny and fast only while physical order follows time. And for vectors: measure recall against exact search, budget RAM for the graph, treat filtering as the hard problem, and fuse with keyword search.

At your desk: the friends-of-friends and recursive queries, the Gorilla bit trace, the BRIN and quantisation tables, the pgvector query, and the two exercises, delta-of-delta encoding and beam search.
