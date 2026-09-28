---
slug: vector-search-internals
title: "Vector search internals: brute force, IVF, HNSW and product quantisation"
description: What exact search costs for a million 768-dimensional vectors, IVF cells and the nprobe trade-off traced in 2D, HNSW layer probabilities and greedy descent traced on a drawn graph, product-quantisation distance tables worked by hand, recall@k measured in pure Python, why filters and deletes break indexes, and pgvector versus dedicated stores.
minutes: 55
difficulty: hard
tags: [vector-search, ann, hnsw, ivf, product-quantisation, pgvector, recall, embeddings]
problems: []
---
Your help-centre assistant retrieves from 10 million passages, each a 768-dimensional float32 embedding. Product wants the 10 best passages per question inside a 50 ms p99, at a few hundred queries per second, with a tenant filter on every query. The exact answer compares the query with all 10 million vectors, streaming 30.7 GB through memory. At a generous 100 GB/s that is about 300 ms: six times the budget, for one query.

Every vector index is a way out of that arithmetic, and each pays with something: **recall** (it sometimes misses a true neighbour), **memory** (links, codebooks), **build time**, or the ability to **filter and delete** cleanly. This lesson traces the four designs production systems combine (brute force, IVF, HNSW, product quantisation) on data small enough to check by hand, measures recall in pure Python, and ends with the operational problems that decide which one you can run. [Embeddings and similarity](/learn/ai-and-llms/ml-foundations/embeddings-and-similarity) covered where vectors come from and which distance to use; here every vector is normalised, so the nearest by Euclidean distance is also the best by dot product.

## Brute force, costed

For $N$ vectors of dimension $d$, exact search computes $N$ distances of $d$ multiply-adds each and keeps the best $k$ in a heap. For $N = 10^6$ and $d = 768$:

1. **Bytes read:** $10^6 \times 768 \times 4 = 3.07$ GB of float32.
2. **Arithmetic:** $2 \times 768 \times 10^6 = 1.54$ GFLOP per query (a multiply and an add per dimension).
3. **The bottleneck:** each 3,072-byte vector feeds 1,536 operations, half an operation per byte loaded, far below what a core can compute per byte, so the scan runs at memory bandwidth, not arithmetic speed.

| Where the scan runs | Bandwidth (order of magnitude) | Time for 3.07 GB |
|---|---|---|
| One CPU core | ~15 GB/s | ~205 ms |
| All cores of a server | ~100 GB/s | ~31 ms |
| A data-centre GPU with HBM | ~2 TB/s | ~1.5 ms |

The bandwidths are round assumptions that vary by hardware; time = bytes ÷ bandwidth is exact. Two levers help without an index. **Smaller numbers**: float16 halves the bytes and int8 quarters them, at a small precision cost. **Batching**: $B$ queries become one matrix-matrix product, so each vector loaded serves $B$ queries; FAISS's flat index hands large batches to BLAS for this reason.

Brute force is right more often than teams expect: below a few hundred thousand vectors (200,000 × 768 is 614 MB, milliseconds on a server), over a small filtered subset (measured below), and always as **ground truth**, because recall is defined against it.

```viz
{"type": "ml", "algorithm": "embeddings-similarity", "text": "king queen man woman apple banana",
 "title": "Brute force is this table, one row per query",
 "caption": "Every cell is one cosine similarity between two word vectors. Exact search computes one row of this table against all N stored vectors and keeps the top k; every index in this lesson is a way to skip most of the row."}
```

## Recall@k: how every index is graded

An approximate index returns a list; recall@k asks how much of the true top $k$ it contains:

$$\text{recall@}k = \frac{|\,\text{index top } k \;\cap\; \text{exact top } k\,|}{k},$$

averaged over a sample of queries. If the exact top 3 is {17, 4, 9} and the index returns [17, 9, 30], recall@3 is 2/3. Three rules make the number honest:

- **Measure on production-like queries**, held out from the indexed data, against brute force over the same vectors. Recall is not *relevance*; that belongs to the embedding model and is measured with labelled data, as in [Retrieval-augmented generation](/learn/ai-and-llms/building-with-llms/retrieval-augmented-generation).
- **Slice it.** An average of 0.95 can hide a rare language or a small tenant at 0.6.
- **Fewer than $k$ results count as misses.** That is how filtered-search failures show up, and why an index can pass unfiltered benchmarks and fail in production.

## IVF: search only the nearest cells

The inverted-file index (IVF) partitions the vectors with k-means (traced in [Classical ML you should know](/learn/ai-and-llms/ml-foundations/classical-ml-you-should-know)). The `nlist` centroids form the **coarse quantiser**; each vector is appended to the **inverted list** of its nearest centroid. A query measures all `nlist` centroids, picks the `nprobe` nearest, and scans only those lists.

Trace it on 14 points in 2D. Each centroid is its cell's mean and every point is nearest its own centroid, so k-means has converged:

| Cell | Points | Centroid |
|---|---|---|
| A | (1, 2), (2, 1), (2, 3), (3, 2) | (2.00, 2.00) |
| B | (5.4, 2.2), (8, 1), (8, 3), (9, 2) | (7.60, 2.05) |
| C | (1, 7), (2, 8), (3, 7) | (2.00, 7.33) |
| D | (7, 7), (8, 8), (9, 7) | (8.00, 7.33) |

The query is $q = (4.6, 2.2)$.

1. Distances to the centroids: A 2.61, B 3.00, C 5.75, D 6.16. The A/B boundary sits near $x = 4.8$, and $q$ is on A's side.
2. `nprobe = 1` scans A: distances 3.61, 2.86, 2.72, 1.61. Best: (3, 2) at 1.61. Cost: 4 centroids + 4 vectors = 8 distances, against 14 for brute force.
3. The true nearest neighbour is (5.4, 2.2) at 0.80. k-means put it in B because it is nearer B's centroid (2.20) than A's (3.40). With `nprobe = 1` it is never examined: recall@1 = 0.
4. `nprobe = 2` scans A and B and finds (5.4, 2.2) at 0.80. Cost: 4 + 8 = 12.

The miss is structural: a query near a boundary has neighbours on both sides, and a centroid says nothing about its cell's edge. `nprobe` is the dial: more cells, more recall, more work.

## IVF at scale: choosing nlist and nprobe

Per query, IVF computes about $\text{nlist} + \text{nprobe} \times N/\text{nlist}$ distances: every centroid, then the probed lists at $N/\text{nlist}$ vectors each on average. Minimising over nlist gives $\text{nlist} = \sqrt{\text{nprobe} \cdot N}$, the source of the rule of thumb "nlist ≈ √N". At the time of writing, FAISS's guidelines suggest a small multiple of √N, and pgvector's documentation suggests rows ÷ 1,000 up to a million rows and √rows beyond. For $N = 10^7$ and nlist = 4,096:

| nprobe | Vectors compared | Share of brute force | Bytes scanned (float32) | Time at 100 GB/s |
|---|---|---|---|---|
| 1 | 6,537 | 0.07% | 20 MB | 0.2 ms |
| 16 | 43,158 | 0.43% | 133 MB | 1.3 ms |
| 64 | 160,346 | 1.6% | 493 MB | 4.9 ms |

Against 307 ms for brute force, nprobe = 16 is a 230-fold saving. Two caveats: lists are uneven (dense regions of the space make big cells), so the p99 query costs more than the average; and recall at a given nprobe depends on your data, measured next.

Training is paid up front. FAISS warns when it gets fewer than 39 training points per centroid; 20 k-means iterations over 160,000 samples and 4,096 centroids is $2 \times 10^{13}$ floating-point operations, tens of seconds on a many-core CPU, and assigning $10^7$ vectors to cells is another $6 \times 10^{13}$.

## Measuring recall in pure Python

What nprobe buys depends on your vectors, so measure it. This standard-library script builds a small IVF, runs held-out queries, and compares against brute force:

```python
import random

def sqdist(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b))

def make_data(n, dim, clusters, rng):
    """Points scattered around `clusters` random centres (0 = no structure)."""
    if clusters == 0:
        return [[rng.gauss(0, 1) for _ in range(dim)] for _ in range(n)]
    centres = [[rng.gauss(0, 1) for _ in range(dim)] for _ in range(clusters)]
    return [[c + rng.gauss(0, 0.35) for c in rng.choice(centres)] for _ in range(n)]

def kmeans(data, k, iters, rng):
    cents = rng.sample(data, k)                       # initialise from data points
    for _ in range(iters):
        groups = [[] for _ in range(k)]
        for v in data:
            groups[min(range(k), key=lambda j: sqdist(v, cents[j]))].append(v)
        cents = [[sum(col) / len(g) for col in zip(*g)] if g else cents[j]
                 for j, g in enumerate(groups)]
    return cents

def build_ivf(data, cents):
    lists = [[] for _ in cents]
    for i, v in enumerate(data):                      # inverted list = ids per cell
        lists[min(range(len(cents)), key=lambda j: sqdist(v, cents[j]))].append(i)
    return lists

def ivf_search(q, data, cents, lists, k, nprobe):
    probe = sorted(range(len(cents)), key=lambda j: sqdist(q, cents[j]))[:nprobe]
    cand = [i for j in probe for i in lists[j]]
    return sorted(cand, key=lambda i: sqdist(q, data[i]))[:k], len(cand)

def brute(q, data, k):
    return sorted(range(len(data)), key=lambda i: sqdist(q, data[i]))[:k]

def experiment(clusters, n=2000, dim=16, nlist=40, k=10, n_queries=100, seed=7):
    rng = random.Random(seed)
    data = make_data(n + n_queries, dim, clusters, rng)
    data, queries = data[:n], data[n:]                # queries are held out
    cents = kmeans(data, nlist, iters=8, rng=rng)
    lists = build_ivf(data, cents)
    truth = [set(brute(q, data, k)) for q in queries]
    for nprobe in (1, 2, 4, 8, 16):
        hits = scanned = 0
        for q, t in zip(queries, truth):
            got, c = ivf_search(q, data, cents, lists, k, nprobe)
            hits += len(t & set(got))
            scanned += c
        print(f"clusters={clusters:>2} nprobe={nprobe:>2}  recall@{k}={hits / (k * len(queries)):.3f}"
              f"  vectors scanned={scanned / len(queries) / n:.1%}")

experiment(clusters=25)   # embedding-like: structure in the data
experiment(clusters=0)    # pure noise: no structure to exploit
```

`random.Random(seed)` makes the run repeatable, and `kmeans` keeps an empty cell's old centroid rather than dividing by zero. Output on CPython 3.14:

| nprobe | Clustered: recall@10 | Clustered: vectors scanned | Noise: recall@10 | Noise: vectors scanned |
|---|---|---|---|---|
| 1 | 0.810 | 2.8% | 0.225 | 2.6% |
| 2 | 0.980 | 5.3% | 0.356 | 5.2% |
| 4 | 1.000 | 10.6% | 0.556 | 10.4% |
| 8 | 1.000 | 21.3% | 0.773 | 20.9% |
| 16 | 1.000 | 41.9% | 0.937 | 41.4% |

On clustered data, two cells out of 40 give 0.98 recall. On noise, 0.94 takes 16 cells and 41% of the data: in high dimensions random points are all at nearly the same distance from each other, so no cell holds a query's neighbours. Real embeddings sit between the two, and where yours sit is the whole question. At this toy size each list is 2.5% of the data; with $10^7$ vectors in 4,096 lists it is about 0.02%.

## HNSW: a graph with express lanes

A **hierarchical navigable small world** graph (Malkov and Yashunin, 2016) stores every vector as a node on layer 0, linked to near neighbours, and promotes a random few to sparser layers where links span longer distances. A search enters at the top, walks greedily towards the query, drops a layer, and repeats. It is a skip list generalised from a line to a metric space.

**Layer assignment.** Each inserted node draws $\ell = \lfloor -\ln(U) \cdot m_L \rfloor$ with $U$ uniform on $(0, 1]$ and $m_L = 1/\ln M$. Then $P(\ell \ge l) = P(U \le e^{-l/m_L}) = e^{-l \ln M} = M^{-l}$, so each layer holds about $1/M$ of the one below. For $N = 10^6$ and $M = 16$ ($m_L = 0.361$):

| Layer $l$ | $P(\ell \ge l)$ | Expected nodes on layer $l$ |
|---|---|---|
| 0 | 1 | 1,000,000 |
| 1 | 1/16 | 62,500 |
| 2 | 1/256 | 3,906 |
| 3 | 1/4,096 | 244 |
| 4 | 1/65,536 | 15 |
| 5 | about 1/10⁶ | about 1 |

The top layer is 4 or 5, close to $\log_{16} 10^6 = 4.98$. A node's expected number of upper-layer memberships is $1/16 + 1/256 + \dots = 1/15$, so upper layers add under 7% to the link count.

**Insertion.** A new node greedy-searches from the top down to its own level. On each layer from there to 0 it runs a beam search of width **efConstruction** for candidate neighbours, links to M of them (**M0 = 2M** on layer 0 in the reference implementation), and adds reverse links, pruning any list that overflows. The pruning heuristic keeps a candidate only if it is nearer the new node than to any neighbour already kept, which preserves links in different directions rather than M links into one clump; those diverse links keep the graph navigable.

## Greedy descent, traced

The visualiser builds a 12-node, 3-layer graph with a deterministic rule in place of the random draw (node $i$ is on layer $l$ when $3^l$ divides $i$, so layer 2 = {n0, n9} and layer 1 = {n0, n3, n6, n9}), links each node to its 2 nearest on upper layers and 3 nearest on layer 0 (undirected, so some nodes get more), and searches for $q = (7.2, 3.1)$.

Nodes: n0 (1, 1), n1 (3, 2), n2 (5, 1.5), n3 (7, 2.5), n4 (9, 1), n5 (2, 4), n6 (4, 5), n7 (6, 4.5), n8 (8, 5), n9 (1.5, 7), n10 (4, 8), n11 (7, 7.5). Links on layer 2: n0–n9. Layer 1: n0–n3, n0–n6, n0–n9, n3–n6, n6–n9. Layer 0, for the nodes the searches below touch: n3 links to n2, n4, n7, n8; n6 to n5, n7, n9, n10; n5 to n0, n1, n6, n9; n1 to n0, n2, n5.

| Step | Layer | At (distance to q) | Neighbours (distance to q) | Move |
|---|---|---|---|---|
| 1 | 2 | n0 (6.55) | n9 6.91 | none closer: descend |
| 2 | 1 | n0 (6.55) | n6 3.72, n9 6.91, n3 0.63 | to n3 |
| 3 | 1 | n3 (0.63) | n6 3.72, n0 6.55 | none closer: descend |
| 4 | 0 | n3 (0.63) | n2 2.72, n7 1.84, n4 2.77, n8 2.06 | none closer: stop |

The result is n3 at 0.63, the exact nearest neighbour, after 10 distance computations against 12 for brute force. At 12 nodes the graph barely pays; the saving grows because hops grow roughly with $\log N$ and a scan with $N$.

```viz
{"type": "ml", "algorithm": "vector-search-hnsw",
 "points": [[1,1],[3,2],[5,1.5],[7,2.5],[9,1],[2,4],[4,5],[6,4.5],[8,5],[1.5,7],[4,8],[7,7.5]],
 "query": [7.2, 3.1],
 "title": "HNSW: greedy descent from layer 2 to layer 0",
 "caption": "The same graph and query as the trace table: one long jump on layer 1 from n0 to n3, then no neighbour on layer 0 is closer, so n3 is returned after 10 distance computations."}
```

## When greedy gets stuck: the ef beam

Move the query to $q = (4.1, 2.6)$. Layer 1 takes n0 → n6 (2.40); n6's layer-1 neighbours (n0 3.49, n3 2.90, n9 5.11) are further, so it descends. On layer 0, n6's neighbours are n5 2.52, n7 2.69, n9 5.11 and n10 5.40: none is closer, so greedy search stops at n6. The true nearest is n1 at 1.25, reachable only through n5, which is further than n6. A greedy walk cannot step uphill.

HNSW's layer-0 search is therefore a **beam search**: it keeps a candidate queue and a result set of the best **ef** (efSearch) nodes, expands the nearest unexpanded candidate, and stops when that candidate is further than the worst member of the result set. Trace ef = 2 from n6:

| Expand | Result set (best 2) | Candidate queue after |
|---|---|---|
| n6 (2.40) | n6 2.40, n5 2.52 | n5 2.52 |
| n5 (2.52) | n1 1.25, n6 2.40 | n1 1.25 |
| n1 (1.25) | n1 1.25, n2 1.42 | n2 1.42 |
| n2 (1.42) | n1 1.25, n2 1.42 | empty: stop |

With a second slot, n5 enters the result set although it is worse than n6, and expanding it reaches n1. The price is 16 distance computations (7 on upper layers, 9 on layer 0), more than a 12-vector scan. Over a grid of 9,191 query positions on this graph, ef = 1 returns a wrong nearest neighbour for 73 (0.8%) and ef = 2 for none, at 11.7 distance computations per query instead of 10.9.

```viz
{"type": "ml", "algorithm": "vector-search-hnsw",
 "points": [[1,1],[3,2],[5,1.5],[7,2.5],[9,1],[2,4],[4,5],[6,4.5],[8,5],[1.5,7],[4,8],[7,7.5]],
 "query": [4.1, 2.6],
 "title": "A greedy miss: stuck at n6",
 "caption": "The visualiser walks greedily (ef = 1) and stops at n6, 2.40 from the query; the exact nearest is n1 at 1.25. The beam trace above shows ef = 2 reaching n1 through n5."}
```

## M, efConstruction and efSearch, measured

A pure-Python HNSW (layer draw, beam search and pruning heuristic as above, about 60 lines) over the same two datasets and queries, M = 8, efConstruction = 40:

| efSearch | Clustered: recall@10 | Distances per query | Noise: recall@10 | Distances per query |
|---|---|---|---|---|
| 10 | 0.941 | 89 | 0.756 | 158 |
| 20 | 0.985 | 109 | 0.912 | 236 |
| 40 | 1.000 | 128 | 0.969 | 371 |
| 80 | 1.000 | 165 | 0.992 | 598 |
| 160 | 1.000 | 368 | 0.999 | 924 |

Varying the build parameters on the noise data, with efSearch fixed at 20:

| M | efConstruction | Build distances per insert | recall@10 | Distances per query |
|---|---|---|---|---|
| 4 | 40 | 219 | 0.700 | 148 |
| 8 | 40 | 304 | 0.912 | 236 |
| 16 | 40 | 368 | 0.964 | 315 |
| 8 | 10 | 115 | 0.778 | 200 |
| 8 | 160 | 653 | 0.913 | 239 |

These are small, illustrative runs; the directions are what transfer. **efSearch** is the query-time dial: raise it until recall meets the target, and pay roughly in proportion. **M** raises recall per query at the cost of more distances, more memory and a slower build. **efConstruction** is paid once: going from 10 to 40 lifted recall from 0.78 to 0.91 at the same efSearch, going to 160 doubled the build for nothing, and a poorly built graph cannot be rescued at query time.

Memory is where M bites. With M0 = 2M slots of 4 bytes each, $10^6$ vectors at M = 16 need 128 MB of layer-0 links (plus about 4 MB above). That is 4% of the 3.07 GB of float32 vectors, but 133% of 96-byte compressed codes: once vectors are compressed, the graph dominates.

## Product quantisation: 3 KB to 96 bytes

IVF and HNSW reduce how many vectors you touch; **product quantisation** (PQ; Jégou, Douze and Schmid, 2011) reduces the bytes each one costs. Split each $d$-dimensional vector into $m$ sub-vectors. For each sub-space, run k-means with 256 centroids on training data: one **codebook** per sub-space. Encode a vector by replacing each sub-vector with the one-byte index of its nearest centroid.

| m (sub-vectors) | Bytes per 768-d vector | Compression vs 3,072 B | 10M vectors | Distance table per query |
|---|---|---|---|---|
| 48 | 48 | 64× | 0.48 GB | 12,288 entries (49 KB) |
| 96 | 96 | 32× | 0.96 GB | 24,576 entries (98 KB) |
| 192 | 192 | 16× | 1.92 GB | 49,152 entries (197 KB) |

The codebooks are tiny (786 KB for m = 96), yet together they describe $256^{96}$ possible reconstructions: the "product" in the name.

**Asymmetric distance computation** (ADC) makes scoring fast. The query stays uncompressed. Before scanning, compute the squared distance from each query sub-vector to every centroid of its sub-space, a table of $m \times 256$ numbers that fits in cache; each stored vector then costs $m$ lookups and additions.

Trace it with 4-dimensional vectors, $m = 2$, 4 centroids per codebook. Codebook 1 (dimensions 1–2): c0 (0, 0), c1 (1, 0), c2 (0, 1), c3 (1, 1). Codebook 2 (dimensions 3–4): c0 (0, 0), c1 (2, 0), c2 (0, 2), c3 (2, 2). Query $q = (0.9, 0.2, 1.8, 0.1)$.

First build the two tables, one squared distance per centroid:

| Centroid | T1: from (0.9, 0.2) | T2: from (1.8, 0.1) |
|---|---|---|
| c0 | 0.81 + 0.04 = 0.85 | 3.24 + 0.01 = 3.25 |
| c1 | 0.01 + 0.04 = 0.05 | 0.04 + 0.01 = 0.05 |
| c2 | 0.81 + 0.64 = 1.45 | 3.24 + 3.61 = 6.85 |
| c3 | 0.01 + 0.64 = 0.65 | 0.04 + 3.61 = 3.65 |

Then score each stored code with two lookups:

| Vector | Codes | ADC = T1 + T2 | Exact squared distance |
|---|---|---|---|
| x1 (1.1, 0.1, 2.1, −0.2) | (1, 1) | 0.05 + 0.05 = 0.10 | 0.23 |
| x2 (0.2, 0.9, 1.9, 0.3) | (2, 1) | 1.45 + 0.05 = 1.50 | 1.03 |
| x3 (0.8, 0.1, 0.2, 1.7) | (1, 2) | 0.05 + 6.85 = 6.90 | 5.14 |
| x4 (0.7, 0.3, 1.6, 0.4) | (1, 1) | 0.05 + 0.05 = 0.10 | 0.18 |

The ranking survives, but distances are off by 30–60%, and x1 and x4 share a code, so ADC ties them although x4 is nearer. Production PQ therefore **re-ranks**: take the top 100 or so by ADC, fetch their full vectors (307 KB), and sort by exact distance.

**IVF-PQ** combines both: IVF picks the cells, PQ encodes each vector's **residual** (the vector minus its centroid, which has a smaller spread and quantises more accurately). At $10^7$ vectors, nlist 4,096 and m = 96, codes plus 8-byte ids take 1.04 GB against 30.8 GB for IVF-Flat, and nprobe = 16 scans about 39,000 codes (3.75 MB). ADC caps recall below 1 however many cells you probe; re-ranking buys it back.

## Filtered search

Real queries carry predicates such as `tenant_id = 42` or `lang = 'de'`. Of the three ways to combine one with an ANN index, two fail.

**Post-filtering** asks the index for $k'$ candidates and discards those that fail. If the predicate holds for a fraction $s$ of vectors, independently of similarity, $k's$ survive on average and none survive with probability $(1 - s)^{k'}$:

| Selectivity $s$ | $k' = 10$ | $k' = 100$ | $k' = 1{,}000$ |
|---|---|---|---|
| 1% | 0.1 survivors; 90% of queries empty | 1.0; 37% empty | 10; under 0.01% empty |
| 0.1% | 0.01; 99% empty | 0.1; 90% empty | 1.0; 37% empty |

pgvector's documentation states the same arithmetic for its HNSW index: with the default `hnsw.ef_search` of 40 and a condition matching 10% of rows, about 4 rows survive on average.

**Restricting the traversal** to nodes that pass the predicate breaks navigability: the links among passing nodes do not form a connected graph, so the search strands in a fragment. Measured on the pure-Python HNSW (2,000 clustered vectors, M = 8, efSearch 40), each cell showing results returned out of 10, recall@10, and distance computations per query:

| Strategy | Selectivity 10% (199 vectors pass) | Selectivity 1% (22 vectors pass) |
|---|---|---|
| Post-filter, ef 40 | 4.1 / 0.41 / 128 | 0.4 / 0.04 / 128 |
| Post-filter, ef 400 | 10 / 1.00 / 778 | 5.2 / 0.52 / 778 |
| Traverse passing nodes only | 1.8 / 0.15 / 29 | 0.1 / 0.01 / 28 |
| Traverse all, collect passing only | 10 / 1.00 / 786 | 10 / 1.00 / 2,026 |
| Brute force over the passing set | 10 / 1.00 / 199 | 10 / 1.00 / 22 |

The last two rows carry the lesson. Filter-aware traversal is correct, but at 1% selectivity it visited the whole graph, while an exact scan of the 22 passing vectors cost 22 distances. Engines that filter well therefore **plan**: estimate the predicate's cardinality from a payload index, brute-force the passing set when it is small, walk the graph collecting only passing nodes when it is large; some add extra links per indexed filter value to keep filtered subgraphs connected. For a few large, stable partitions (tenants, languages), a **separate index per partition** (in Postgres, a partial index or a partition) turns the filter into the choice of index. At the time of writing, recent pgvector releases (0.8 onwards) add iterative index scans (`hnsw.iterative_scan`) that keep pulling candidates until enough rows pass.

## Build, update and delete costs

**HNSW build** is one insert per vector, each a beam search of width efConstruction plus pruning: 115 to 653 distance computations per insert in the runs above. For $10^6$ × 768 at about $10^3$ per insert that is on the order of $10^{12}$ floating-point operations, but as random reads across gigabytes, so memory latency and lock contention set the pace: expect minutes to tens of minutes on a multi-core server, growing with M and efConstruction. The graph must fit in RAM while it builds; pgvector builds much faster when it fits in `maintenance_work_mem`.

**IVF build** is k-means on a sample plus one assignment pass; later inserts are cheap (nearest centroid, append). The hidden cost is **drift**: if new documents land where there were few training points (a new product line, a new language), they pile into a few lists and queries hitting them slow down. Track list sizes and retrain when the largest grow several times past the mean.

**Deletes.** Removing a graph node orphans the nodes that reached the rest of the graph through it, so HNSW implementations **tombstone** it instead: still traversed, never returned. The pure-Python graph again, efSearch 40:

| Deleted | Tombstones: recall@10 / distances per query | Removed without repair: recall@10 | Pieces of the live layer-0 graph |
|---|---|---|---|
| 0% | 1.000 / 128 | 1.000 | 1 |
| 30% | 1.000 / 137 | 0.984 | 7 |
| 60% | 0.998 / 229 | 0.047 | 51 |

Tombstones keep recall but cost work (the search wades through dead nodes to collect $k$ live ones) and memory; removal without repair fragments the graph, and at 60% the descent strands in the wrong piece. Libraries differ: hnswlib marks deletions and can reuse the slot, pgvector repairs neighbour lists during `VACUUM` (slow on large HNSW indexes), some libraries cannot remove at all. Under heavy churn, rebuild offline and swap, the same versioned-index move used to re-embed a corpus.

## pgvector versus dedicated stores

pgvector adds a `vector` type, distance operators and two index methods to Postgres:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE passages (
  id        bigserial PRIMARY KEY,
  tenant_id bigint NOT NULL,
  body      text   NOT NULL,
  embedding vector(768) NOT NULL          -- normalised before insert
);

-- HNSW: can be created on an empty table and maintained as rows arrive.
CREATE INDEX passages_hnsw ON passages
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- IVFFlat alternative: create only AFTER loading data, because its lists
-- are k-means centroids trained on the rows present at CREATE INDEX time.
-- CREATE INDEX ON passages USING ivfflat (embedding vector_cosine_ops) WITH (lists = 1000);
-- SET ivfflat.probes = 32;               -- default is 1

SET hnsw.ef_search = 100;                 -- default 40; per session or SET LOCAL
SELECT id, body
FROM passages
WHERE tenant_id = 42                      -- applied after the index scan
ORDER BY embedding <=> $1                 -- cosine distance; <-> is L2, <#> negative inner product
LIMIT 10;
```

The non-obvious lines: the index serves only `ORDER BY <operator> LIMIT`, and only when the operator matches the operator class (`<=>` with `vector_cosine_ops`); a mismatch silently becomes a sequential scan. The `WHERE` clause post-filters the `ef_search` candidates unless iterative scans are on. The m and ef_construction shown are pgvector's defaults at the time of writing.

Postgres is the right first home when vectors live beside relational data: one transaction writes the row and its embedding, joins and row-level permissions work, and backups and replicas already exist. Its limits are why teams move: the index lives in 8 KB pages behind the buffer cache, so an HNSW index that outgrows RAM turns hops into disk reads; it scales up rather than out; float32 vectors index only up to about 2,000 dimensions at the time of writing (half precision allows more); and its filter planning is simpler than engines built around it.

**FAISS** is a library: every index type here plus GPU kernels, in process, with no persistence, filtering, replication or access control beyond what you build. **Dedicated vector databases** (Milvus, Qdrant, Weaviate, Pinecone, Vespa, vector fields in Elasticsearch and OpenSearch) add sharding, replication, payload indexes with filter-aware search, quantisation and on-disk indexes; features change quickly, so verify them when you choose. The cost is a second system kept consistent with the source of truth, usually by change data capture. [Graph, time-series and vector databases](/learn/databases/nosql-and-specialised/graph-time-series-and-vector-databases) compares it with the other specialised stores.

## Under the hood

- **hnswlib's layout.** Layer 0 is one contiguous array of fixed-size records: a link count, M0 four-byte neighbour ids, the vector and an 8-byte label. Slots are preallocated, so memory follows M, not the actual degree; upper-layer lists are allocated separately for the few nodes that have them; a deletion sets a flag in the record header.
- **FAISS inverted lists** hold, per cell, an array of codes and a parallel array of 64-bit ids: 8% on top of 96-byte PQ codes, 25% on top of 32-byte ones.
- **SIMD kernels.** A 768-dimensional float32 dot product is 48 AVX-512 fused multiply-adds (16 lanes) or 96 with AVX2 (8 lanes). FAISS's "fast scan" PQ uses 4-bit codes, so a 16-entry table fits in a SIMD register and lookups become shuffle instructions.
- **Smaller numbers.** Float16 halves bandwidth and memory, int8 quarters it, binary quantisation (96 bytes for 768 dimensions) cuts it 32-fold; all are paired with re-ranking on full vectors.
- **On-disk graphs.** DiskANN (Microsoft Research, 2019) navigates with PQ codes in RAM and keeps full vectors and the graph on SSD; each hop is an SSD read of order 100 µs, so the graph is built to need few hops.

## Trade-offs

| | Brute force | IVF-Flat | IVF-PQ | HNSW | On-disk graph (DiskANN-style) |
|---|---|---|---|---|---|
| RAM per 768-d vector | 3,072 B | ~3,080 B (vector + id) | ~104 B (m = 96) | ~3,200 B (vector + ~128 B links at M = 16) | ~100 B; rest on SSD |
| Work per query | all $N$ | nlist + nprobe·N/nlist | same count, far cheaper per vector | hundreds to thousands of nodes | tens of SSD reads |
| Recall ceiling | exact | 1.0 as nprobe → nlist | below 1 without re-ranking | near 1 with a large ef | near 1 with re-ranking |
| Build | none | k-means + assignment | k-means + codebooks | slowest; whole graph in RAM | slow; usually offline |
| Inserts and deletes | trivial | cheap; centroids drift | cheap; codebooks drift | inserts fine; deletes tombstoned | batch rebuilds typical |
| Filtered queries | exact over the subset | scans cells, may find few | same as IVF-Flat | needs filter-aware traversal or planning | engine-dependent |

## Failure modes

**Recall decays after churn.** *Symptom:* weeks after launch, answers worsen and HNSW latency creeps up with no deploy. *Diagnosis:* much of the graph is tombstones (an update is a delete plus an insert); recall@10 against brute force on a query sample has fallen and distances per query have risen. *Fix:* rebuild and swap (`REINDEX INDEX CONCURRENTLY` in Postgres), and alert on the deleted fraction.

**Small tenants get empty results.** *Symptom:* large customers' search works; small ones see "no results" for questions their documents answer. *Diagnosis:* post-filtering: 40 candidates × 0.5% is 0.2 rows; `EXPLAIN` shows the tenant predicate as a filter above the index scan. *Fix:* iterative scans, brute force for small tenants, partial indexes or partitions for the largest, or an engine that plans filtered queries.

**An IVFFlat index built too early.** *Symptom:* recall is poor from day one. *Diagnosis:* a migration created the index on an empty or seed-data table, so the centroids describe a few hundred rows and list sizes are wildly uneven. *Fix:* create IVF indexes after bulk loading and rebuild when the data changes shape, or use HNSW, which has no training step.

**The index outgrew memory.** *Symptom:* p99 jumps from milliseconds to hundreds as the corpus grows, with CPU idle. *Diagnosis:* index plus vectors exceed RAM, so graph hops became disk reads; the buffer hit ratio fell. *Fix:* quantise (half precision, int8, or PQ with re-ranking), lower M, shard, or move to an on-disk graph.

**The index is silently unused.** *Symptom:* a 5 ms query takes 800 ms after a refactor. *Diagnosis:* the operator no longer matches the operator class (L2 against a cosine index), or the `LIMIT` was dropped, so the planner chose a sequential scan. *Fix:* assert on `EXPLAIN` for hot queries in tests, and define the metric in one place.

## Exercises

```exercise
id: recall-at-k
title: Measure recall@k
prompt: |
  An ANN index returned `retrieved[i]` (a list of ids, best first) for query
  `i`, and brute force says the exact neighbours are `truth[i]` (best first,
  at least `k` ids). Return the mean over all queries of

      |set(retrieved[i][:k]) ∩ set(truth[i][:k])| / k

  Only the first `k` ids of each list count. An index that returned fewer
  than `k` ids (for example after a filter) is penalised by the missing ones,
  and a repeated id counts once. There is at least one query. Return an
  unrounded float; results are compared to 6 decimal places.
languages: [python, javascript]
entry: recall_at_k
starter:
  python: |
    def recall_at_k(retrieved, truth, k):
        # your code here
        return 0.0
  javascript: |
    function recall_at_k(retrieved, truth, k) {
      // your code here
      return 0;
    }
tests:
  - args: [[[1, 2, 3], [4, 5, 6]], [[1, 2, 4], [4, 5, 6]], 3]
    expected: 0.8333333333
    label: two queries, one miss
  - args: [[[3, 2, 1]], [[1, 2, 3]], 3]
    expected: 1.0
    label: order within the top k does not matter
  - args: [[[7]], [[7, 8, 9]], 3]
    expected: 0.3333333333
    label: fewer results than k count as misses
  - args: [[[]], [[1, 2]], 2]
    expected: 0.0
    label: empty result list
  - args: [[[1], [2], [3], [4]], [[1], [2], [9], [9]], 1]
    expected: 0.5
  - args: [[[5, 6, 1, 2]], [[1, 2, 3, 4]], 2]
    expected: 0.0
    hidden: true
    label: ids beyond position k do not count
  - args: [[[1, 1, 1]], [[1, 2, 3]], 3]
    expected: 0.3333333333
    hidden: true
    label: a repeated id counts once
hints:
  - "Truncate both lists to k before comparing, then intersect them as sets."
  - "Divide each query's hit count by k, not by the number of ids returned, then average over queries."
```

```exercise
id: adc-distances
title: Product-quantisation distance tables
prompt: |
  Implement asymmetric distance computation. `query` is a list of floats of
  length m × s. `codebooks` is a list of m codebooks; codebook j is a list
  of centroids, each a list of s floats, for dimensions j*s .. j*s + s - 1.
  `codes` is a list of stored vectors, each a list of m centroid indexes.

  First build the table: for each sub-space j and each centroid c in it,
  the squared Euclidean distance between the query's j-th sub-vector and c.
  Then return, for each stored code, the sum over j of
  table[j][code[j]], in the same order as `codes`. Return unrounded floats;
  results are compared to 6 decimal places.
languages: [python, javascript]
entry: adc_distances
starter:
  python: |
    def adc_distances(query, codebooks, codes):
        # your code here
        return []
  javascript: |
    function adc_distances(query, codebooks, codes) {
      // your code here
      return [];
    }
tests:
  - args: [[0.9, 0.2, 1.8, 0.1], [[[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [2, 0], [0, 2], [2, 2]]], [[1, 1], [2, 1], [1, 2], [1, 1]]]
    expected: [0.1, 1.5, 6.9, 0.1]
    label: the worked example, including the x1/x4 tie
  - args: [[3, 4], [[[0, 0], [3, 0]]], [[0], [1]]]
    expected: [25, 16]
    label: one sub-space is plain nearest-centroid distance
  - args: [[0.9, 0.2, 1.8, 0.1], [[[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [2, 0], [0, 2], [2, 2]]], []]
    expected: []
    label: no stored vectors
  - args: [[1, 2, 3], [[[0], [1]], [[0], [2]], [[0], [4]]], [[1, 1, 1], [0, 0, 0], [1, 0, 1]]]
    expected: [1, 14, 5]
    hidden: true
    label: one dimension per sub-space
  - args: [[-1, 0.5, 2, -2], [[[-1, 0], [0, 1]], [[2, -2], [0, 0], [1, 1]]], [[0, 0], [1, 2], [0, 1]]]
    expected: [0.25, 11.25, 8.25]
    hidden: true
    label: negative values and codebooks of different sizes
hints:
  - "The sub-vector for codebook j is query[j*s:(j+1)*s], with s = len(query) // len(codebooks)."
  - "Compute the whole table before touching any code; scoring a code is then m lookups and additions."
```

## Interviewer follow-ups

**"10 million 768-dimensional vectors, 50 ms p99, a few hundred QPS. Which index?"** *Model answer:* brute force streams 30.7 GB per query, about 300 ms at 100 GB/s, so it is out. HNSW over float32 needs about 32 GB of RAM and gives the best recall per millisecond; if that memory is too dear, IVF-PQ at about 1 GB with re-ranking, or HNSW over half-precision vectors. Parameters come from measuring recall@10 on held-out queries, and I ask about filters before choosing. *Common wrong answer:* "a vector database", with no numbers for memory, recall or the filter.

**"Why does recall drop when you add a tenant filter?"** *Model answer:* the filter runs after the index returns ef candidates, so survivors average $k's$, 0.4 at ef 40 and 1% selectivity; restricting traversal to passing nodes disconnects the graph. Fix with filter-aware traversal plus a planner that brute-forces small subsets, iterative scans, or per-tenant indexes. *Common wrong answer:* "increase k", which helps linearly while tiny tenants still get nothing.

**"How do you know the index is good enough?"** *Model answer:* recall@k against brute force on a few hundred held-out, production-like queries, sliced by query class and tenant size, re-measured after every rebuild, parameter change or model upgrade, next to p99 latency; relevance is a separate, labelled measurement. *Common wrong answer:* "the vendor benchmark says 0.99", measured on someone else's vectors without your filters.

**"Why can't HNSW delete a node outright?"** *Model answer:* other nodes may reach parts of the graph only through it; removal without repair fragments the graph (51 pieces and recall 0.05 after deleting 60% above), so implementations tombstone and reclaim at rebuild or vacuum. *Common wrong answer:* "like any database delete", missing that recall and latency degrade with the deleted fraction.

**"When does PQ beat HNSW?"** *Model answer:* when memory is the constraint: 96 bytes against about 3,200 per 768-dimensional vector, which at $10^8$ vectors is 10 GB against 320 GB, paid for with approximate distances repaired by re-ranking. They also combine, as a graph over compressed vectors. *Common wrong answer:* treating them as rivals rather than answers to different constraints (vectors touched versus bytes per vector).

## What mid-level engineers get wrong

- **Indexing 100,000 vectors.** A 300 MB scan is milliseconds and exact; the index adds recall loss and operational work for nothing.
- **Tuning by vendor benchmark.** In the experiment, nprobe = 2 gave 0.98 recall on clustered vectors and 0.36 on noise. Measure on your vectors.
- **Post-filtering and calling it filtering.** Survivors average $k's$; small tenants get nothing, and averages hide it.
- **Creating an IVF index before loading data.** Its centroids are trained on whatever rows exist at creation time.
- **Forgetting graph memory once vectors are compressed.** At M = 16, 128 bytes of links per vector outweigh 96-byte PQ codes.
- **Treating deletes as free.** Tombstones accumulate, recall and latency drift, and nobody schedules the rebuild.
- **Mismatching the metric.** An L2 query against a cosine index, or unnormalised vectors with inner product, gives a sequential scan or wrong neighbours.

## Senior signals

- You cost brute force first (bytes ÷ bandwidth) and adopt an index only when the arithmetic says so, keeping brute force as ground truth.
- You grade indexes by **recall@k against brute force** on held-out, production-like queries, sliced by query class and tenant, next to p99 latency.
- You explain IVF's nprobe, HNSW's M, efConstruction and efSearch, and PQ's m as three different dials (cells probed, graph quality, bytes per vector), each with its recall, latency and memory cost.
- You design **filtering** in from the start: selectivity arithmetic, planning between graph traversal and exact scans, per-tenant partitions for the largest tenants.
- You plan the **lifecycle**: build memory, IVF drift, tombstones and scheduled rebuilds, and versioned indexes swapped under traffic.
- You start in **pgvector** when vectors live beside relational data and can name the signals to move: RAM, filtered recall, horizontal scale.

## Check yourself

```quiz
- q: >-
    A flat (brute-force) index holds one million 768-dimensional float32 vectors on a server that streams about 100 GB/s from memory across all cores. Roughly how long does one query take, and what limits it?
  options: ["About 30 ms, limited by memory bandwidth over 3 GB", "About 1 ms, limited by the 1.5 GFLOP of arithmetic", "About 300 ms, limited by sorting a million distances", "About 3 s, limited by the Python loop over vectors"]
  answer: 0
  explanation: >-
    The scan reads 10^6 × 768 × 4 bytes = 3.07 GB once, and each byte feeds only a couple of operations, so time is bytes over bandwidth, about 31 ms. The arithmetic is small for SIMD hardware, and keeping the best k in a heap costs far less than a full sort. Batching queries or using float16 are the levers that change it.
- q: >-
    An IVF index with nprobe = 1 misses a query's true nearest neighbour even though that neighbour is very close to the query. What is the most likely reason?
  options: ["The neighbour sits in an adjacent cell across the boundary", "The coarse quantiser stores the vectors at lower precision", "k-means placed the neighbour's vector in two separate cells", "The inverted lists are sorted by id rather than by distance"]
  answer: 0
  explanation: >-
    A query near a cell boundary is closest to one centroid while its nearest neighbour was assigned to the neighbouring cell, as in the 2D trace where (5.4, 2.2) sat in cell B and the query probed only A. Raising nprobe to 2 finds it. IVF-Flat stores full-precision vectors, each vector is in exactly one list, and list order does not matter because every probed vector is scored.
- q: >-
    With HNSW and M = 16, what fraction of nodes appear on layer 2 or above, and what does that imply for a million vectors?
  options: ["1/256, so about 3,900 nodes and a top layer near 5", "1/32, so about 31,000 nodes and a top layer near 2", "1/16, so about 62,500 nodes and a top layer near 16", "1/4, so about 250,000 nodes and a top layer near 10"]
  answer: 0
  explanation: >-
    Levels are drawn as floor(-ln(U) / ln M), which gives P(level ≥ l) = M^-l, so layer 2 holds 1/256 of the nodes: about 3,906 of a million. The number of layers is about log base 16 of 10^6, roughly 5. One in sixteen is the share for layer 1, not layer 2.
- q: >-
    A multi-tenant pgvector table uses an HNSW index with the default hnsw.ef_search of 40. A tenant owns 0.5% of the rows. What do its top-10 queries typically return?
  options: ["Under one row, because the filter runs on about 40 candidates", "Ten rows, because Postgres pushes the filter into the index", "Ten rows, but slower, because the index scans every tenant", "No rows, because HNSW indexes cannot be combined with WHERE"]
  answer: 0
  explanation: >-
    Without iterative scans the index yields ef_search candidates and the WHERE clause filters them afterwards: 40 × 0.005 = 0.2 expected survivors. The filter is legal, not pushed into the graph, and nothing forces a full scan. Iterative scans, a partial index or partition for the tenant, or brute force over its rows fix it.
- q: >-
    Product quantisation splits 768-dimensional float32 vectors into 96 sub-vectors with 256-centroid codebooks. What does each stored vector cost, and how is a query scored against it?
  options: ["96 bytes; the sum of 96 lookups in a per-query distance table", "96 bytes; decompress to 768 floats and compute an exact distance", "384 bytes; one float16 per sub-vector centroid compared directly", "3,072 bytes; the codes only select which vectors to compare exactly"]
  answer: 0
  explanation: >-
    Each sub-vector becomes one byte (an index into 256 centroids), so 96 bytes against 3,072, a 32-fold saving. Asymmetric distance computation precomputes the query-to-centroid distances once (96 × 256 entries) and scores each code by table lookups, never reconstructing the vector. Exact distances come only in the re-ranking step on a short list.
- q: >-
    After a year of updates, 40% of an HNSW index's nodes are tombstones. What do you expect to observe, and what is the usual fix?
  options: ["More distance computations per query; rebuild the index and swap it in", "An immediate crash, since tombstoned nodes break the graph; restore a backup", "Faster queries, since dead nodes are skipped; no action is needed", "Wrong neighbours returned, since tombstones are still returned; filter them"]
  answer: 0
  explanation: >-
    Tombstoned nodes are still traversed (which keeps the graph connected) but never returned, so the search expands more nodes to collect k live results: in the measured run, work per query rose from 128 to 229 distances at 60% deleted. Memory is not reclaimed either. A rebuild, or REINDEX CONCURRENTLY in Postgres, restores it; unlinking dead nodes without repair would fragment the graph instead.
```
