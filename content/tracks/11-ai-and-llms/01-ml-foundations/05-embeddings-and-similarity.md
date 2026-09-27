---
slug: embeddings-and-similarity
title: "Embeddings and similarity: meaning as geometry"
description: How items become dense vectors whose distances mean something, how those vectors are learned, dot product versus cosine versus Euclidean with worked numbers, and what nearest-neighbour search costs at scale.
minutes: 26
difficulty: medium
tags: [machine-learning, embeddings, cosine-similarity, vector-search, nearest-neighbours, semantic-search]
problems: []
---
A customer types "how do I stop being charged every month" into your help centre. The article that answers it is titled "Cancel your subscription". Keyword search finds no word in common with the title, and the article body shares only words like "how" and "do", which also appear in 4,000 other articles. The customer opens a ticket. Every search box, recommendation row, duplicate detector and retrieval-augmented chatbot runs into the same wall: computers compare strings exactly, and people mean things approximately.

**Embeddings** get around the wall by turning each item (a word, a sentence, a product, a user) into a list of numbers such that items with similar meaning end up close together. "Similar" stops being a question about characters and becomes a question about geometry, which you can answer with a dot product. This lesson covers how that works, how the vectors are learned, which distance to use, and what it costs to search a hundred million of them.

## One-hot vectors and why they fail

The obvious way to give a word a vector is **one-hot encoding**: with a vocabulary of 50,000 words, word number 3,172 becomes a 50,000-long vector of zeros with a single 1 at position 3,172. It is exact and it is useless for similarity. The dot product of any two different one-hot vectors is 0, so "cancel" is exactly as similar to "stop" as it is to "banana". Every word is equally unrelated to every other, and the vectors are enormous.

A **dense embedding** instead represents each item with a few hundred to a few thousand real numbers, all of them typically non-zero, learned so that geometry reflects usage. In the toy space below, each word has four dimensions labelled *royal*, *male*, *female* and *food* so you can see why words land where they do. Real embedding dimensions are not individually interpretable; meaning is spread across all of them.

```viz
{"type": "ml", "algorithm": "embeddings-similarity", "text": "king queen man woman apple banana",
 "title": "Cosine similarity between word vectors",
 "caption": "Rows compare each word with every other. Related words point in similar directions; king − man + woman lands nearest queen."}
```

The famous analogy (king − man + woman ≈ queen) shows that *directions* can encode relationships, not just closeness. Treat it as an illustration rather than a law: published analogy results are selected examples, and many analogies fail.

## Where embeddings come from

An embedding table is nothing exotic. It is the first weight matrix of a network: a matrix with one row per vocabulary item, and "looking up" a word's embedding is multiplying its one-hot vector by that matrix, which just selects a row. The rows start random and are shaped by whatever training objective the network has.

- **Predict the context.** Word2vec-style models learn word vectors by predicting which words appear near which. Words used in similar contexts ("cancel", "terminate", "stop") receive similar gradients and drift together. This is the **distributional hypothesis**: a word is characterised by the company it keeps.
- **Contrastive training.** Modern sentence and document embedding models are transformer encoders trained on pairs that should match: a question and the passage that answers it, a title and its article, two paraphrases. For a batch of pairs, the loss pulls each query towards its own passage and pushes it away from the other passages in the batch (the **in-batch negatives**). Formally it is a softmax cross-entropy over similarity scores in which the correct answer is the matching passage. The model is being trained *directly* to make cosine similarity mean relevance.
- **Two-tower recommenders.** A user tower turns viewing history into a vector, an item tower turns each title into a vector, and training makes the dot product predict what the user watches. At serving time you precompute every item vector and retrieve the few hundred closest to the user's vector as candidates for a heavier ranking model. Large streaming and video platforms use this shape for candidate generation.

Language models are built from the same idea: their first layer is a token embedding table, and every layer after it refines those vectors, as you will see in [The transformer](/learn/ai-and-llms/how-llms-work/the-transformer).

## Measuring similarity: dot product, cosine, Euclidean

Three measures, and they do not always agree. Take a query and three documents in a 3-dimensional space:

- $q$ = "cancel subscription" = (0.9, 0.2, 0.1)
- $d_1$ = "stop my plan" = (0.8, 0.3, 0.0)
- $d_2$ = "update payment card" = (0.1, 0.9, 0.3)
- $d_3$ = (1.8, 0.4, 0.2), exactly twice $q$: same direction, twice the length

The **dot product** $a \cdot b = \sum_i a_i b_i$. The **norm** (length) $\|a\| = \sqrt{a \cdot a}$. **Cosine similarity** divides the dot product by both lengths, so it measures only the angle:

$$\cos(a, b) = \frac{a \cdot b}{\|a\|\,\|b\|}$$

It ranges from −1 (opposite) through 0 (unrelated) to 1 (same direction). Work it for $q$ and $d_1$:

1. $q \cdot d_1 = 0.9 \times 0.8 + 0.2 \times 0.3 + 0.1 \times 0.0 = 0.72 + 0.06 + 0 = 0.78$
2. $\|q\| = \sqrt{0.81 + 0.04 + 0.01} = \sqrt{0.86} = 0.927$
3. $\|d_1\| = \sqrt{0.64 + 0.09 + 0} = \sqrt{0.73} = 0.854$
4. $\cos(q, d_1) = 0.78 / (0.927 \times 0.854) = 0.78 / 0.792 = 0.984$

All three documents:

| Document | Dot product | Cosine | Euclidean distance |
|---|---|---|---|
| $d_1$ "stop my plan" | 0.78 | **0.984** | **0.17** |
| $d_2$ "update payment card" | 0.30 | 0.339 | 1.08 |
| $d_3$ (2 × $q$) | **1.72** | **1.000** | 0.93 |

The dot product ranks $d_3$ far above $d_1$ purely because $d_3$ is longer. Cosine says $d_3$ points in exactly the query's direction. Euclidean distance says $d_1$ is nearest and $d_3$ is quite far. Which is right depends on what vector length means in your model. For most text embedding models, length is an artefact (longer or more repetitive inputs can produce larger norms), and the models are trained with cosine similarity.

The practical rule: **normalise every vector to length 1 when you store it**. For unit vectors, $\cos(a, b) = a \cdot b$, and $\|a - b\|^2 = 2 - 2\cos(a, b)$, so dot product, cosine and Euclidean distance all produce the same ranking and you can use whichever your index computes fastest. The exception is a model deliberately trained with raw dot products (some recommenders use the item norm to encode popularity); there you must not normalise. Use the metric the model was trained with.

```python
import numpy as np

def normalise(m):
    norms = np.linalg.norm(m, axis=-1, keepdims=True)
    return m / np.maximum(norms, 1e-12)          # avoid dividing by zero

docs = normalise(np.array([[0.8, 0.3, 0.0],
                           [0.1, 0.9, 0.3],
                           [1.8, 0.4, 0.2]]))
q = normalise(np.array([0.9, 0.2, 0.1]))

scores = docs @ q                                # cosine similarities: 0.984, 0.339, 1.0
k = 2
top = np.argpartition(-scores, k - 1)[:k]        # the k best, unordered, in O(n)
top = top[np.argsort(-scores[top])]              # sort only the winners: [2, 0]
```

## What goes wrong with embeddings in production

- **Spaces are model-specific.** Vectors from two different embedding models, or two versions of the same model, live in unrelated coordinate systems. Comparing them produces confident nonsense. Upgrading the model means re-embedding the entire corpus: 100 million documents of about 500 tokens is 50 billion tokens of embedding work, plus a migration in which you dual-write, backfill, and switch queries only when the new index is complete. Store the model name and version next to every vector.
- **Absolute thresholds do not transfer.** Some models produce similarities that all sit in a narrow band (unrelated pairs at 0.7, related at 0.85), others spread them across the full range. "Cosine above 0.8 means relevant" is a property of one model, not a universal constant. Calibrate thresholds on labelled pairs, and re-calibrate when the model changes.
- **Similar is not the same as relevant or correct.** "How do I cancel my subscription" and "How do I *not* cancel my subscription" embed very close together. Embeddings capture topic and phrasing well and negation, numbers and exact identifiers (error codes, SKUs) poorly. That is why production search usually combines embeddings with keyword search (**hybrid search**) and a reranker, covered in [Retrieval-augmented generation](/learn/ai-and-llms/building-with-llms/retrieval-augmented-generation).
- **Bias.** Embeddings absorb the associations in their training text, including ones about occupations, gender and ethnicity. If similarity feeds a decision about people, audit it.
- **Storage adds up.** A 768-dimensional float32 vector is 3 KB. Ten million documents is 30 GB of vectors before any index overhead; a hundred million is 300 GB. Float16 halves that; int8 quantisation quarters it with a small recall loss; product quantisation (below) compresses to tens of bytes per vector.

## Nearest-neighbour search at scale

Finding the top-$k$ most similar vectors by brute force means one dot product per stored vector: $n \times d$ multiply-adds per query. For one million 768-dimensional float32 vectors that is about 1.5 billion floating-point operations over 3 GB of data. Memory bandwidth dominates, so expect tens of milliseconds per query on a multi-core server, and far less on a GPU or with 16-bit vectors. That is perfectly reasonable for a corpus of a few hundred thousand documents, and it has perfect recall, so do not build an index you do not need. At 100 million vectors and a thousand queries per second it is out of the question.

**Approximate nearest neighbour** (ANN) indexes give up a little recall for orders of magnitude of speed:

| Index family | Idea | Trade-off |
|---|---|---|
| **IVF** (inverted file) | Run k-means to split vectors into, say, 4,096 partitions; at query time search only the closest few partitions | Fast and compact; recall depends on how many partitions you probe |
| **HNSW** (hierarchical navigable small world) | A layered graph linking each vector to its near neighbours; a query walks greedily from a coarse top layer down to the dense bottom layer | Excellent recall and latency; the graph links cost significant extra memory; inserts are slower |
| **PQ** (product quantisation) | Split each vector into chunks and replace each chunk with the id of its nearest centroid from a small codebook | Huge compression; distances become approximate, so rerank the top candidates with full vectors |

Real systems combine them (IVF with PQ-compressed vectors, HNSW over quantised vectors). Every one of them has a knob, such as the number of partitions probed or the width of the graph search, that trades recall for latency. You measure **recall@k**: for a sample of queries, what fraction of the true top-$k$ (found by brute force) the index returned. An index at 0.95 recall@10 misses one true neighbour in twenty, which may or may not matter for your product.

One trap catches almost everyone: **filtering**. If you ask for the 10 nearest vectors and then drop those that belong to other tenants, a tenant with 0.1% of the data will usually get zero results. Filters must be applied inside the search (pre-filtering or filter-aware traversal), which vector databases support to varying degrees. Ask about it before choosing one; [Graph, time-series and vector databases](/learn/databases/nosql-and-specialised/graph-time-series-and-vector-databases) compares the options, and [MinHash and LSH](/learn/advanced-data-structures/probabilistic-structures/minhash-and-lsh) covers the hashing-based alternative for near-duplicate detection.

## Exercise

```exercise
id: cosine-similarity
title: Cosine similarity
prompt: |
  Implement `cosine_similarity(a, b)` for two equal-length, non-empty lists of
  numbers: the dot product divided by the product of the two vectors' Euclidean
  lengths.

  If either vector has length zero (all zeros), the similarity is undefined;
  return `0` in that case rather than dividing by zero.

  Return an unrounded float; results are compared to 6 decimal places.
languages: [python, javascript]
entry: cosine_similarity
starter:
  python: |
    import math

    def cosine_similarity(a, b):
        # your code here
        return 0.0
  javascript: |
    function cosine_similarity(a, b) {
      // your code here
      return 0;
    }
tests:
  - args: [[1, 0], [0, 1]]
    expected: 0
    label: orthogonal vectors
  - args: [[3, 4], [6, 8]]
    expected: 1
    label: same direction, different length
  - args: [[3, 4], [-3, -4]]
    expected: -1
    label: opposite directions
  - args: [[0.9, 0.2, 0.1], [0.8, 0.3, 0.0]]
    expected: 0.984428
    label: the worked example from the lesson
  - args: [[3, 4, 0, 0], [4, 3, 0, 0]]
    expected: 0.96
  - args: [[0, 0, 0], [1, 2, 3]]
    expected: 0
    hidden: true
    label: a zero vector has no direction
  - args: [[0.9, 0.2, 0.1], [0.1, 0.9, 0.3]]
    expected: 0.339118
    hidden: true
hints:
  - "Accumulate the dot product and both squared norms in a single loop."
  - "Check for a zero norm before dividing; `math.sqrt` / `Math.sqrt` of the squared norms gives the lengths."
```

## Senior signals

- You explain embeddings as **learned coordinates where distance tracks the training objective**, and you ask what objective a model was trained on before trusting its similarities for your task.
- You **normalise at write time** and know that for unit vectors dot product, cosine and Euclidean rankings coincide, except for models trained to use the norm.
- You treat the embedding model as a **versioned dependency**: vectors are stored with their model version, never mixed across versions, and a model upgrade is planned as a re-embedding migration.
- You start with **brute force** when the corpus is small, and when you adopt ANN you measure **recall@k** against brute force and design **filtering** into the search.
- You know embeddings are weak on **negation, numbers and exact identifiers**, and you pair them with keyword search and reranking.

## Check yourself

```quiz
- q: >-
    Document A is a short answer and document B is A's text repeated five times, which gives B's embedding a larger norm in the same direction. With raw dot-product scoring, what happens?
  options: ["A and B score the same", "B scores higher than A even though it adds no information, because the dot product grows with vector length", "A scores higher because shorter documents are preferred", "The dot product is undefined for vectors of different length"]
  answer: 1
  explanation: >-
    The dot product is the cosine multiplied by both lengths, so a longer vector in the same direction scores higher. Cosine similarity, or normalising vectors before a dot product, removes the length effect and scores A and B equally.
- q: >-
    Your team upgrades to a better embedding model and embeds new documents with it, while the 50 million existing documents keep their old vectors. What happens to search quality?
  options: ["It improves gradually as new documents arrive", "Nothing changes as long as both models have the same dimension", "Only the similarity threshold needs adjusting", "Queries embedded with one model are compared against vectors from another, unrelated coordinate system, so results become unreliable"]
  answer: 3
  explanation: >-
    Two models' spaces are independently learned; equal dimension does not make their axes correspond. Every vector compared must come from the same model version, so an upgrade requires re-embedding the corpus (typically backfilled into a new index before switching queries).
- q: >-
    For unit-length vectors, which statement is true?
  options: ["The dot product equals the cosine similarity, and squared Euclidean distance equals 2 − 2·cosine, so all three rank neighbours identically", "Euclidean distance and cosine similarity can rank neighbours differently", "Cosine similarity is always 1", "The dot product is always between 0 and 1"]
  answer: 0
  explanation: >-
    With norms of 1, the cosine formula's denominator is 1, and expanding the squared distance gives 1 + 1 − 2·(a·b). So the three measures are monotonic transformations of each other. The dot product of unit vectors can be negative, down to −1.
- q: >-
    A multi-tenant app retrieves the 10 nearest vectors from a shared ANN index, then removes those that belong to other tenants. What goes wrong for a small tenant?
  options: ["Nothing; ANN indexes are exact after filtering", "Their queries become slower than other tenants' queries", "Their results are often empty or poor, because the 10 global neighbours mostly belong to larger tenants and are filtered out afterwards", "Their vectors are overwritten by larger tenants"]
  answer: 2
  explanation: >-
    Post-filtering keeps only the survivors of a global top-10, and a tenant with a tiny share of the data rarely has any vectors in it. The filter must be applied during the search (pre-filtering, filter-aware traversal, or per-tenant indexes).
- q: >-
    You need semantic search over 200,000 help-centre passages at 20 queries per second. What is the simplest sound design for the search step?
  options: ["An HNSW index is mandatory at any scale", "Brute-force dot products over normalised vectors in memory; it is exact and fast enough at this size", "k-means clustering with k = 200,000", "Keyword search only, since embeddings do not scale past 100,000 documents"]
  answer: 1
  explanation: >-
    200,000 × 768 is about 150 million multiply-adds over 600 MB of float32 vectors per query: milliseconds to tens of milliseconds on one server, comfortably fast enough at 20 queries per second, with perfect recall and no index to tune. ANN becomes worthwhile at tens of millions of vectors or high query rates. Embeddings scale far beyond this size.
```
