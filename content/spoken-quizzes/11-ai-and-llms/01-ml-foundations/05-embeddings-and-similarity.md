---
lesson: embeddings-and-similarity
source: d1af1057274782e5
---
## 1

Document A is a short answer, and document B is A's text repeated five times, which gives B's embedding a larger length in the same direction. With raw dot-product scoring, what happens?

A, A and B score the same, because they point in the same direction. B, the score is undefined, because the vectors have different lengths. C, B scores higher, because the dot product grows with the vector's length. D, A scores higher, because the dot product favours shorter documents.

[think]

The answer is C: B scores higher, because the dot product grows with the vector's length.

The dot product is the cosine multiplied by both lengths, so a longer vector in the same direction scores higher, even though B adds no information. Equal direction gives equal scores only under cosine similarity. Cosine, or normalising the vectors before a dot product, removes the length effect and scores A and B equally.

## 2

In a contrastive training batch at temperature 0.1, a query has similarity 0.55 to a wrong passage about refunds, and 0.30 to a wrong passage about payment cards. Which receives the larger push away?

A, the payment passage, since it is the least similar and most wrong. B, both equally, since in-batch negatives share the gradient evenly. C, the refunds passage, since its softmax probability is far higher. D, neither, since only the correct passage's similarity is updated.

[think]

The answer is C: the refunds passage, since its softmax probability is far higher.

The push on each negative is its softmax probability divided by the temperature: about 0.75 for the refunds passage, against about 0.06 for the payment one. Hard negatives carry the learning signal, and easy ones are already far away. An even split happens only at a high temperature, where the softmax is nearly uniform.

## 3

Your team upgrades to a better embedding model and embeds new documents with it, while the 50 million existing documents keep their old vectors. What happens to search quality?

A, it improves gradually, as more documents get the better model's vectors. B, vectors from two unrelated spaces are compared, so results degrade. C, only the similarity threshold needs re-tuning for the new model. D, nothing changes, because both models output the same dimension.

[think]

The answer is B: vectors from two unrelated spaces are compared, so results degrade.

Each model's space is learned independently, and an equal dimension does not make their axes correspond. A query embedded with one model is compared against vectors from an unrelated coordinate system. Every vector compared must come from the same model version, so an upgrade means re-embedding the corpus, usually backfilled into a new index before switching queries.

## 4

For vectors of length one, which statement is true?

A, the dot product always lies between 0 and 1, so it acts as a probability. B, Euclidean distance and cosine can still rank neighbours differently. C, cosine similarity is always 1, because both vectors have the same length. D, dot product, cosine and Euclidean distance rank neighbours identically.

[think]

The answer is D: dot product, cosine and Euclidean distance rank neighbours identically.

With lengths of 1, the dot product equals the cosine, and the squared distance works out to 2 minus twice the cosine. The three measures are monotonic transformations of each other, so they cannot disagree on ranking. Equal lengths say nothing about direction, so cosine is not always 1, and the dot product of unit vectors can be negative, down to minus 1.

## 5

Answers that appear late in long product manuals are never retrieved, although short documents work well. What is the most likely cause?

A, cosine similarity penalises long documents for their larger length. B, the approximate nearest neighbour index drops vectors from documents above a set size. C, long documents need a lower similarity threshold to match. D, the embedding model truncated each manual at its input limit.

[think]

The answer is D: the embedding model truncated each manual at its input limit.

Embedding models accept a bounded number of tokens, and cut off or reject the rest, so the end of a long manual never reaches the vector; chunking below the limit fixes it. Cosine ignores length by construction, approximate indexes store whatever vector they are given, and a threshold cannot recover text that was never embedded.

## 6

You need semantic search over 200,000 help-centre passages, at 20 queries a second. What is the simplest sound design for the search step?

A, keyword search only, since embeddings stop scaling past 100,000 documents. B, an HNSW index, since approximate search is required at any real scale. C, brute-force dot products over normalised vectors held in memory. D, k-means with 200,000 clusters, searching by the nearest centroid first.

[think]

The answer is C: brute-force dot products over normalised vectors held in memory.

Brute force is exact, and fast enough here: about 150 million multiply-adds over 600 megabytes of vectors per query, milliseconds to tens of milliseconds on one server, with perfect recall and no index to tune. Approximate search becomes worthwhile at tens of millions of vectors or high query rates. Embeddings scale far beyond this size.
