---
lesson: minhash-and-lsh
source: ffd16c0608b47724
fit: partial
desk:
  - "The four-permutation signature trace, and the MinHasher code"
  - "The banding trace with four documents, and the pipeline diagram"
  - "The S-curve table for three band layouts, with the threshold formula"
  - "The datasketch, Spark, SimHash and corpus-deduplication details, the trade-offs table and the failure modes"
  - "Exercises: Jaccard similarity of two shingle lists; shingle a string; find candidate pairs by banding"
---
## Introduction

A web crawler has fetched a billion pages, and a large fraction of them are near-duplicates. The same article with a different sidebar. The same product page with a different tracking parameter. Indexing all of them wastes storage, pollutes search results, and if the corpus is training data for a language model, teaches the model to memorise boilerplate. You want every pair of pages that is, say, 80 percent similar.

Comparing every pair is about 5 times 10 to the 17th comparisons. At a billion comparisons a second, that is sixteen years.

So you need two things. A way to estimate similarity from a small fixed-size fingerprint. And a way to find candidate pairs without enumerating pairs at all. Those are MinHash and locality-sensitive hashing, LSH. Three ideas, then: the one property MinHash rests on and its two-sentence proof, how banding turns that property into a bucket you can group by, and why vector search moved on from LSH while deduplication did not.

## Similarity as set overlap

First decide what similar means. For documents the workhorse is Jaccard similarity: the size of the intersection of two sets divided by the size of their union. Identical sets score 1, disjoint sets score 0. The set a, b, c, d against the set c, d, e shares two elements out of five in the union, so it scores 0.4. Hold onto that example; it comes back.

To turn a document into a set, shingle it: take every run of k consecutive characters, or k consecutive words. Shingles capture local word order, which a bag of words does not, so the same words in a different order share few shingles. The choice of k is a trade-off. Too small, and unrelated documents look similar because they share common short strings. Too large, and a one-character edit destroys k shingles at once.

Now a document is a set of a few thousand hashed integers. That answers what similarity is, and solves none of the scale problem.

## MinHash: a fingerprint whose collisions measure similarity

Pick a random ordering of every possible shingle. For a set, its minhash is whichever of its elements comes first in that ordering. Here is the property everything rests on: the probability that two sets have the same minhash equals their Jaccard similarity.

The proof is two sentences. Walk the union of the two sets in that random order and stop at the first element; every element of the union is equally likely to be first. If it is in both sets, both minhashes equal it; if it is in only one, the minhashes differ, so they agree with probability exactly the intersection over the union.

Try it on the example. A is a, b, c, d. B is c, d, e. Take the ordering c first. The first element of the union is c, which is in both, so both minhashes are c, and they agree. Now take an ordering that starts with e. The first element of the union is e, which only B has. A's minhash is something else, and they disagree. Over many random orderings, they agree 40 percent of the time.

So one random ordering is a biased coin whose bias is the Jaccard similarity. Flip many coins, and the fraction of agreements estimates it. A signature is the list of a set's minhashes under, typically, 128 orderings. That is 512 bytes per document, whatever its size, and comparing two documents is comparing two short lists position by position.

The precision: the standard error shrinks with the square root of the number of hashes. With four, it is about 0.24, which is useless; the lesson's four-permutation trace estimated 0.5 for a true 0.4. With 128, it is about 0.04. Telling 0.8 from 0.9 needs hashes in the low hundreds.

In practice you cannot store a random ordering of a 64-bit universe, so you use random hash functions instead and take the minimum hash value. And a bonus: the signature of a union is the position-wise minimum of the two signatures. That is what makes MinHash answer the intersection question HyperLogLog could not. Estimate the Jaccard similarity from the signatures, estimate the union's size, and the intersection is their product.

## LSH: finding the pairs without the loop

Signatures make each comparison cheap, but a billion documents still means the same astronomical number of pairs. Locality-sensitive hashing inverts the problem. Instead of comparing pairs, hash each document into buckets so that similar documents are likely to share a bucket and dissimilar ones are not. Then compare only within buckets.

For MinHash, the construction is banding. Split the signature into b bands of r values each. Hash each band's values together into a bucket. Two documents become a candidate pair if they land in the same bucket in at least one band.

Why that shape? A pair with similarity s agrees on one signature value with probability s. It agrees on a whole band of r values with probability s to the r, which is small unless s is high. And it gets at least one chance per band. Put together, the probability of becoming a candidate traces an S-curve: near zero for dissimilar pairs, near one for similar pairs, with a steep middle.

Here are numbers from the lesson, with 100 signature values split into 20 bands of 5 rows. Pairs at similarity 0.3 become candidates about 5 percent of the time. At 0.5, 47 percent. At 0.7, 97 percent. The steep part sits near 0.55.

The threshold is roughly one over b, raised to the power one over r. More rows per band raises the threshold and sharpens the curve. More bands lowers it and catches more pairs. Ten bands of ten rows moves the threshold to about 0.79. Fifty bands of two moves it to 0.14 and makes nearly everything a candidate, which is a pairwise comparison in disguise.

Before I say it: which of the two errors can you recover from?

[pause]

False positives, yes. With 20 bands of 5, a pair at 0.4 becomes a candidate 19 percent of the time, and the verification step, an exact Jaccard on the candidates only, throws it out at the cost of wasted work. False negatives, no. A pair at 0.6 is missed about 20 percent of the time, and it is gone for good. If you cannot afford misses at your threshold, add bands and pay for more verification.

The cost model is why this works at scale. One pass of hashing per document. Candidates come from grouping on band and bucket, which is a sort or a shuffle in a batch job. Then exact similarity for candidate pairs only. Hours, not years.

## In real systems

Language-model corpus deduplication. The paper that showed deduplication improves language models used 9 thousand minhashes per document, split into 450 bands of 20, which made pairs at 0.8 similarity candidates about 99.4 percent of the time, then kept only candidates whose edit similarity exceeded 0.8. The Falcon RefinedWeb corpus reused those settings for five trillion tokens, with banding as a distributed group-by.

Google's crawler used SimHash instead: a 64-bit fingerprint per page, and a Hamming distance of 3 or less meant near-duplicate, across 8 billion pages. Eight bytes per page. SimHash is a different LSH family, built on random hyperplanes: draw a random direction, record one bit for which side of it a vector falls on, and two vectors agree on that bit with a probability that falls as the angle between them grows.

The standard Python library, datasketch, uses 128 permutations by default and chooses bands and rows for you from a threshold, by minimising the weighted false-positive and false-negative probabilities over the curve. Spark's MinHash LSH uses one hash per table, so its curve is permissive by construction, and the distance filter after the join does the real selection.

Two production traps. Empty and near-empty documents all hash to the same minima, so one bucket collects a million documents and verification runs for days; drop documents below a minimum shingle count. And a shingle size that is too small, or a threshold that is too low, removes every page that shares a header and footer.

## LSH and vector search

Embedding vectors from a language model live in hundreds to thousands of dimensions, and "find the ten nearest neighbours" is the query behind semantic search and retrieval. Random-hyperplane LSH was the standard answer for a decade.

It is no longer the default. In high dimensions, LSH needs many tables to reach high recall, and memory grows with the tables. Graph indexes, above all HNSW, reach over 95 percent recall at a fraction of the query cost by greedily walking a graph of near neighbours. The mainstream vector stores, pgvector, Qdrant, Weaviate and Elasticsearch, index with HNSW or an IVF-style partitioning.

But LSH still wins in three places. When the data is sets rather than vectors: MinHash has no graph competitor for Jaccard. When you need a batch join over billions of items, because bucketing shuffles beautifully and graph search does not. And when the index must be built in one streaming pass with no training step. Say that when an interviewer asks "why not just use a vector database?" for a deduplication problem.

## In the interview

A follow-up the lesson expects. Near-duplicate detection across 2 billion pages, nightly. Sketch the pipeline and its cost.

[pause]

Shingle each page into 5-grams. Compute 128 to 256 MinHash values per page. Band them into band-and-bucket keys. A distributed group-by emits candidate pairs. Verify each candidate with exact Jaccard. Then union-find the duplicate clusters. The cost is hashing linear in the pages, one shuffle, and verifying a few times as many pairs as there are pages: hours, not years. The wrong answer is comparing every pair on a big cluster, which is 2 times 10 to the 18th comparisons.

And the proof question, which you can now answer in two sentences. Under a random ordering, the first element of the union is uniformly random; the minhashes agree exactly when it lies in the intersection. "Because hashes are uniform" explains nothing about the intersection.

## Recap

Four things to remember. Define similarity first: Jaccard on shingles for documents, and k trades boilerplate matches against edit sensitivity. MinHash collides with probability equal to Jaccard, so 128 values, 512 bytes, estimate it to about 0.04. Banding makes an S-curve whose threshold is about one over b to the power one over r; false positives are filtered by verification, false negatives are lost. And HNSW replaced LSH for embedding search, while LSH still owns set similarity, batch joins and single-pass builds.

At your desk: the signature and banding traces, the S-curve table, the library and corpus details with the failure modes, and three exercises: Jaccard, shingling, and banding.
