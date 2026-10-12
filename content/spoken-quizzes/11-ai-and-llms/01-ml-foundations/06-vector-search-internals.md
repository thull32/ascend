---
lesson: vector-search-internals
source: 8979fb2143563d06
---
## 1

A flat, brute-force index holds one million 768-dimensional vectors of 32-bit floats, on a server that streams about 100 gigabytes a second from memory across all cores. Roughly how long does one query take, and what limits it?

A, about 3 seconds, limited by the Python loop over the vectors. B, about 30 milliseconds, limited by memory bandwidth over 3 gigabytes. C, about 1 millisecond, limited by 1.5 billion floating-point operations of arithmetic. D, about 300 milliseconds, limited by sorting a million distances.

[think]

The answer is B: about 30 milliseconds, limited by memory bandwidth over 3 gigabytes.

The scan reads a million vectors of 768 four-byte floats, about 3 gigabytes, once, and each byte feeds only a couple of operations, so the time is bytes over bandwidth, about 31 milliseconds. The arithmetic is small for SIMD hardware, and keeping the best k in a heap costs far less than a full sort. Batching queries, or using 16-bit floats, are the levers that change it.

## 2

An IVF index that probes only one cell misses a query's true nearest neighbour, even though that neighbour is very close to the query. What is the most likely reason?

A, the inverted lists are sorted by id rather than by distance. B, the neighbour sits in an adjacent cell, across the boundary. C, k-means placed the neighbour's vector in two separate cells. D, the coarse quantiser stores the vectors at lower precision.

[think]

The answer is B: the neighbour sits in an adjacent cell, across the boundary.

A query near a cell boundary is closest to one centroid, while its nearest neighbour was assigned to the neighbouring cell. Probing two cells finds it. The flat variant of IVF stores full-precision vectors, each vector is in exactly one list, and list order does not matter, because every probed vector is scored.

## 3

In HNSW with M equal to 16, what fraction of nodes appear on layer 2 or above, and what does that imply for a million vectors?

A, a quarter, so about 250,000 nodes, and a top layer near 10. B, one in 16, so about 62,500 nodes, and a top layer near 16. C, one in 256, so about 3,900 nodes, and a top layer near 5. D, one in 32, so about 31,000 nodes, and a top layer near 2.

[think]

The answer is C: one in 256, so about 3,900 nodes, and a top layer near 5.

Levels are drawn so that the chance of reaching layer l is 1 over M to the power l. So layer 2 holds one in 256 of the nodes, about 3,906 of a million. The number of layers is about the log base 16 of a million, roughly 5. One in sixteen is the share for layer 1, not layer 2.

## 4

A multi-tenant pgvector table uses an HNSW index with the default search breadth, ef search, of 40. A tenant owns half a percent of the rows. What do its top-10 queries typically return?

A, under one row, because the filter runs on about 40 candidates. B, ten rows, because Postgres pushes the filter into the index. C, no rows, because HNSW indexes cannot be combined with a filter. D, ten rows, but slower, because the index scans every tenant.

[think]

The answer is A: under one row, because the filter runs on about 40 candidates.

Without iterative scans, the index yields 40 candidates, and the filter runs on them afterwards: 40 times half a percent is 0.2 expected survivors. The filter is legal, it is not pushed into the graph, and nothing forces a full scan. Iterative scans, a partial index or partition for the tenant, or brute force over its rows, fix it.

## 5

Product quantisation splits 768-dimensional 32-bit vectors into 96 sub-vectors, with codebooks of 256 centroids. What does each stored vector cost, and how is a query scored against it?

A, 384 bytes; one 16-bit float per sub-vector centroid, compared directly. B, 3,072 bytes; the codes only select which vectors to compare exactly. C, 96 bytes; the sum of 96 lookups in a per-query distance table. D, 96 bytes; decompress to 768 floats and compute an exact distance.

[think]

The answer is C: 96 bytes, and the sum of 96 lookups in a per-query distance table.

Each sub-vector becomes one byte, an index into 256 centroids, so 96 bytes against 3,072, a 32-fold saving. Asymmetric distance computation precomputes the query-to-centroid distances once, 96 times 256 entries, and scores each code by table lookups, never reconstructing the vector. Exact distances come only in the re-ranking step, on a short list.

## 6

After a year of updates, 40 percent of an HNSW index's nodes are tombstones. What do you expect to observe, and what is the usual fix?

A, faster queries, since dead nodes are skipped; no action is needed. B, an immediate crash, since tombstoned nodes break the graph; restore a backup. C, more distance computations per query; rebuild the index and swap it in. D, wrong neighbours, since tombstones are still returned; filter them out.

[think]

The answer is C: more distance computations per query, so rebuild the index and swap it in.

Tombstoned nodes are still traversed, which keeps the graph connected, but never returned, so the search expands more nodes to collect k live results. In the measured run, work per query rose from 128 to 229 distances at 60 percent deleted, and memory is not reclaimed either. A rebuild, or a concurrent reindex in Postgres, restores it; unlinking dead nodes without repair would fragment the graph instead.
