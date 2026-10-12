---
lesson: minhash-and-lsh
source: 006396d901214e5b
---
## 1

Two documents have a Jaccard similarity of 0.6. With 128 independent MinHash functions, roughly what fraction of their signature positions will agree?

A, it varies with the two documents' sizes. B, about 0.77, the square root of 0.6. C, about 0.6, whatever the set sizes. D, about 0.36, since both sets must agree.

[think]

The answer is C: about 0.6, whatever the set sizes.

Each position agrees with probability equal to the Jaccard similarity, independent of the set sizes. 0.36, which is 0.6 squared, is the probability that two positions both agree, and the square root plays no role here.

## 2

In the lesson's banding trace, document 1 has the signature 1, 2, 9, 9, and document 2 has 5, 5, 3, 4, split into two bands of two rows. Why are they not a candidate pair?

A, they share no whole band: band 0 differs, and band 1 differs. B, bucket keys ignore the band index, so their shared values cancel out. C, they share only one value in total, and candidates need at least two. D, only documents whose first band matches can become candidates.

[think]

The answer is A: they share no whole band.

A candidate pair must agree on every value of at least one band. Band 0 is 1, 2 against 5, 5, and band 1 is 9, 9 against 3, 4, so neither band matches, and no bucket contains both. The count of individual shared values plays no part, and every band has the same standing.

## 3

Your locality-sensitive hashing uses 20 bands of 5 rows. Pairs with a similarity of 0.4 become candidates about 19 percent of the time, and you cannot afford the verification cost. What is the cheapest change?

A, use more bands of 5 rows each. B, use more rows in each band. C, use a larger shingle size. D, use exact Jaccard on all pairs.

[think]

The answer is B: use more rows in each band.

More rows per band lowers the chance that a band matches, the similarity to the power of the rows, for every similarity below 1. That pushes the S-curve's threshold up and suppresses low-similarity candidates. More bands does the opposite. Shingle size changes what similarity means, not the curve, and exact Jaccard on all pairs is the cost this technique exists to avoid.

## 4

Why does banding produce false negatives, and how do you reduce them?

A, they come from the verification step; skip verification. B, a similar pair can miss in every band; add bands, or shorten them. C, hash collisions hide similar pairs; use a stronger hash. D, MinHash underestimates similarity; use more hash functions.

[think]

The answer is B: a similar pair can miss in every band; add bands, or shorten them.

A pair agrees on a whole band with probability equal to its similarity raised to the number of rows, and if that fails in every band, the pair never becomes a candidate. More bands, or fewer rows per band, raise its chances, at the cost of more false positives, which verification then filters. MinHash itself is an unbiased estimate, so more hash functions alone do not fix it.

## 5

You need the near-duplicate pairs among 2 billion web pages, in a nightly batch job. Which approach fits?

A, MinHash over shingles, bucket by band, and verify the candidates. B, compare every pair with exact Jaccard, on a large cluster. C, build an HNSW index over page embeddings, and query each page. D, sort pages by length, and compare neighbours.

[think]

The answer is A: MinHash over shingles, bucket by band, and verify the candidates.

Banding turns the problem into a group-by on band and bucket, which a batch engine shuffles efficiently, and Jaccard on shingles is the right similarity for near-duplicate text. HNSW is a query-time structure for nearest neighbours among vectors, not a batch join over sets. Comparing every pair would be 2 times 10 to the 18 comparisons.

## 6

Random-hyperplane hashing produces one bit per hyperplane. What does the fraction of agreeing bits between two vectors estimate?

A, 1 minus the angle between them, divided by pi. B, the Jaccard similarity of their non-zero coordinates. C, their dot product, normalised to lie between 0 and 1. D, their Euclidean distance, normalised by length.

[think]

The answer is A: 1 minus the angle between them, divided by pi.

Two vectors fall on the same side of a random hyperplane with probability 1 minus their angle over pi. That is a monotone function of cosine similarity, which is why SimHash fingerprints work for near-duplicate detection, but it is not the cosine value itself.
