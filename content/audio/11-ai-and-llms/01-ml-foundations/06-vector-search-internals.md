---
lesson: vector-search-internals
source: 3ca016ea15ae374c
fit: partial
desk:
  - "The IVF trace on 14 points in two dimensions, and the nlist and nprobe table"
  - "The recall experiment code and its clustered-versus-noise results"
  - "The HNSW layer probabilities, the greedy descent trace and the ef beam trace"
  - "The product-quantisation distance tables worked by hand"
  - "The filtered-search, tombstone and trade-off tables, and the pgvector SQL"
  - "Exercises: measure recall at k, and product-quantisation distance tables"
---
## Introduction

Your help-centre assistant retrieves from 10 million passages, each a 768-dimensional embedding. Product wants the 10 best per question inside 50 milliseconds at the 99th percentile, at a few hundred queries a second, with a tenant filter on every query.

The exact answer streams all 30 gigabytes of vectors through memory. At a generous 100 gigabytes a second, that is about 300 milliseconds: six times the budget, for one query.

Every vector index is a way out of that arithmetic, and each one pays with something: recall, because it sometimes misses a true neighbour, or memory, or build time, or the ability to filter and delete cleanly. The plan: cost brute force, then three designs, IVF, HNSW and product quantisation, then the operational problems that decide which one you can actually run.

## Brute force, and how indexes are graded

Exact search over a million 768-dimensional vectors reads 3 gigabytes and does about one and a half billion operations per query. Each byte feeds only about half an operation, so the scan runs at memory bandwidth, not arithmetic speed. Time is bytes divided by bandwidth. One CPU core: about 200 milliseconds. All the cores of a server: about 30. A data-centre GPU: about one and a half.

Two levers help without any index. Smaller numbers: half precision halves the bytes. And batching: many queries become one matrix product, so each vector loaded serves them all.

Brute force is right more often than teams expect. Below a few hundred thousand vectors, it is milliseconds on a server. Over a small filtered subset, it is exact and cheap. And it is always the ground truth, because recall is defined against it.

Recall at k asks: of the true top k, how many did the index return? If the exact top 3 is items 17, 4 and 9, and the index returns 17, 9 and 30, recall at 3 is two thirds. Three rules keep it honest. Measure on held-out, production-like queries. Slice it, because an average of 0.95 can hide a small tenant at 0.6. And count fewer than k results as misses, which is how filtered-search failures show up. Also, recall is not relevance. Relevance belongs to the embedding model.

## IVF: search only the nearest cells

The inverted-file index, IVF, runs k-means over the vectors and files each vector under its nearest centroid. A query measures every centroid, picks the few nearest, and scans only their lists. How many it scans is called nprobe.

The lesson traces it in two dimensions, and here is the picture. Two neighbouring cells, A and B. The query sits just on A's side of the boundary. Its true nearest neighbour sits just on B's side, because it was a little closer to B's centre. With nprobe of 1, the index scans only A and never even looks at the true neighbour. Recall zero. With nprobe of 2, it finds it. That miss is structural: a query near a boundary has neighbours on both sides. nprobe is the dial: more cells, more recall, more work.

At scale, the rule of thumb is roughly the square root of N cells. For 10 million vectors and about 4 thousand cells, probing 16 cells compares about 43 thousand vectors, under half a percent of the data, in about a millisecond and a half, against 300 for brute force. Training is paid up front: k-means over a sample, then assigning every vector.

But what nprobe buys depends on your data, and the lesson measured it. On clustered, embedding-like data, two cells out of 40 gave 0.98 recall. On pure noise, 2 cells gave about a third, and reaching 0.94 took 16 cells and 41 percent of the data. In high dimensions random points are all nearly equidistant, so no cell holds a query's neighbours. Real embeddings sit between the two, and where yours sit is the whole question. Do not tune by a vendor benchmark.

## HNSW: a graph with express lanes

HNSW, the hierarchical navigable small world graph, stores every vector as a node on the bottom layer, linked to near neighbours, and promotes a random few to sparser layers above, whose links span longer distances. A search enters at the top, walks greedily towards the query, drops a layer, and repeats. Think of a skip list, generalised from a line to a space.

Each layer holds about one M-th of the layer below, where M is the number of links per node. With M of 16 and a million vectors: about 62 thousand nodes on layer 1, about 4 thousand on layer 2, a couple of hundred on layer 3, and a top layer around 5. The upper layers add little memory.

The lesson traces a descent on a 12-node graph. One long jump on layer 1 lands right next to the query, nothing on the bottom layer is closer, and it returns the exact nearest neighbour after 10 distance computations. At 12 nodes that barely pays, but hops grow roughly with the logarithm of N, and a scan grows with N.

Then it moves the query, and greedy search gets stuck. Before I tell you why: a greedy walk only ever steps to a closer neighbour. What happens when the true nearest is only reachable through a node that is further away?

[pause]

It never gets there. Greedy cannot step uphill. In the trace, it stops at a node 2.4 away, while the true nearest, 1.25 away, sits behind a slightly worse neighbour. So HNSW's bottom-layer search is a beam search. It keeps the best ef nodes, not just one. With a second slot, the slightly worse neighbour gets in, expanding it reaches the true nearest, and the cost goes from 10 to 16 distance computations. Over about 9 thousand query positions on that little graph, a beam of 1 got 0.8 percent wrong, and a beam of 2 got none.

Three dials, measured on a small pure-Python HNSW. efSearch is the query-time dial: raise it until recall meets the target, and pay roughly in proportion. M raises recall at the cost of more distances, memory and build time. efConstruction is paid once at build: going from 10 to 40 lifted recall from 0.78 to 0.91, while 160 doubled the build for nothing. A poorly built graph cannot be rescued at query time.

And M bites in memory. At M of 16, a million vectors need about 128 megabytes of bottom-layer links. That is 4 percent of the full-precision vectors, but more than the vectors themselves once you compress them.

## Product quantisation

IVF and HNSW cut how many vectors you touch. Product quantisation cuts the bytes each one costs. Split each vector into, say, 96 pieces. Run k-means with 256 centroids in each piece's sub-space. Then store each piece as one byte: the index of its nearest centroid. A 768-dimensional vector goes from about 3 kilobytes to 96 bytes, a 32-fold saving, and 10 million of them fit in under a gigabyte.

Scoring is fast thanks to a trick called asymmetric distance computation. The query stays uncompressed. Before scanning, compute the distance from each query piece to every centroid in that piece's codebook: a small table that fits in cache. Then each stored vector costs 96 lookups and additions.

The price is approximation. In the lesson's hand-worked example, the ranking survives but distances are off by 30 to 60 percent, and two vectors that share a code tie, although one is genuinely nearer. So production systems re-rank: fetch the full vectors of the top hundred or so and sort them exactly. IVF-PQ combines both ideas: IVF picks the cells, and PQ encodes each vector relative to its cell's centre. At 10 million vectors that is about 1 gigabyte, against 31 for uncompressed IVF.

## Filters, deletes, and where to run it

Real queries carry a filter, like "tenant equals 42". Post-filtering asks the index for some candidates and discards the ones that fail. Picture HNSW with pgvector's default beam of 40, and a tenant owning half a percent of the rows. On average, 40 times half a percent survive: 0.2 rows. The small tenant gets nothing.

Restricting the walk to passing nodes is no better: the links among them do not form a connected graph, so the search strands in a fragment. Walking the whole graph and collecting only passing nodes is correct, but at 1 percent selectivity it visited the entire graph, about 2 thousand distances, while an exact scan of the 22 passing vectors cost 22. So engines that filter well plan. Estimate how many rows pass, brute-force them when few, and walk the graph collecting passing nodes when many. For a few large tenants, give each its own index. pgvector added iterative scans that keep pulling candidates until enough rows pass.

Deletes are the other trap. Removing a graph node orphans the nodes that reached the rest of the graph through it, so implementations tombstone it: still traversed, never returned. Tombstones keep recall, but cost work; at 60 percent deleted, distances per query rose from 128 to 229. Removing without repair is far worse: at 60 percent deleted, recall fell to about 5 percent and the graph broke into 51 pieces. Under heavy churn, rebuild offline and swap. IVF has its own lifecycle problem, drift: new kinds of documents pile into a few lists, so track list sizes and retrain.

Where to run it? Postgres with pgvector is the right first home when vectors live beside relational data: one transaction writes the row and its embedding, joins and permissions work, and backups exist. Teams move when the index outgrows RAM and graph hops become disk reads, when they need to scale out rather than up, or when they need smarter filter planning. FAISS is a library with every index here and GPU kernels, but no replication. Dedicated vector databases add sharding, replication and filter-aware search, at the cost of a second system kept consistent with the source of truth.

The failures follow. Recall decays after months of updates, because the graph is full of tombstones: rebuild, and alert on the deleted fraction. Small tenants get empty results: post-filtering. An IVF index built by a migration on an empty table has centroids that describe a few hundred seed rows: build after loading, or use HNSW. And a 5 millisecond query takes 800 after a refactor, because the distance operator no longer matches the index, so Postgres silently scans the table. Assert on the query plan in tests.

## In the interview

The follow-up the lesson expects. 10 million 768-dimensional vectors, 50 milliseconds at the 99th percentile, a few hundred queries a second. Which index?

[pause]

Brute force is about 300 milliseconds a query, so it is out. HNSW over full-precision vectors needs about 32 gigabytes of RAM and gives the best recall per millisecond. If that memory is too dear, IVF-PQ at about 1 gigabyte with re-ranking, or HNSW over half-precision vectors. Tune on held-out recall at 10, and ask about filters first. The weak answer is "a vector database", with no numbers for memory, recall or the filter.

And: when does PQ beat HNSW? When memory is the constraint: 96 bytes against about 3,200 per vector. But they are not rivals. One cuts the vectors you touch, the other the bytes each costs, and they combine.

## Recap

Four things to remember. Cost brute force first, as bytes divided by bandwidth; below a few hundred thousand vectors it wins, and it is always your ground truth. Grade every index by recall at k against brute force, on held-out queries, sliced by tenant. IVF's nprobe, HNSW's M and ef, and PQ's code size are different dials: cells probed, graph quality, and bytes per vector. And design filtering and deletes in from the start: post-filtering starves small tenants, and tombstones need scheduled rebuilds.

At your desk: the IVF trace and recall experiment, the HNSW descent and beam traces, the product-quantisation tables, the filter, tombstone and trade-off tables, the pgvector SQL, and the two exercises.
