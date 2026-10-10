---
review: probabilistic-structures
source: a19b9a073512b020
---
## Introduction

Twelve questions from the probabilistic-structures module. Answer out loud before the answer comes.

They run through the module in order: Bloom filters, then the count-min sketch and HyperLogLog, then MinHash and locality-sensitive hashing. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A Bloom filter reports "not present" for a key. What can you conclude?

A, the key was definitely never added. B, the key was probably never added. C, nothing, without checking the backing store. D, the key was added and later deleted.

[think]

The answer is A: the key was definitely never added.

Adding a key sets all of its bits, so if any one of them is zero, the key was never added. "Probably" describes the positive answer, not the negative one. And a plain Bloom filter has no deletion, so "added and later deleted" cannot happen.

## Question 2

You sized a filter for a million keys at a 1 percent false-positive rate, about 9.6 bits per key with 7 hash functions. Then you inserted two million keys. Roughly what is the false-positive rate now?

A, about 16 percent. B, about 50 percent. C, about 1 percent. D, about 2 percent.

[think]

The answer is A: about 16 percent.

Bits per key halve to 4.8 while the hash count stays at 7, and the formula gives about 0.16. The rate does not scale linearly with the number of keys, so 2 percent is the tempting wrong answer. It degrades much faster once the array is more than half full.

## Question 3

Why does RocksDB's cache-local Bloom filter put all of a key's bits inside one 64-byte block?

A, so the false-positive rate drops, because bits are packed more densely. B, so the filter can be updated in place when keys are deleted. C, so a query costs one cache miss instead of one per hash, at a slightly higher false-positive rate. D, so the filter can be built without knowing the number of keys.

[think]

The answer is C: one cache miss instead of one per hash, at a slightly higher false-positive rate.

With independent positions, a query touches a random cache line per hash, which on a large filter is a memory miss each. Confining the probes to one line makes it one miss. But packing keys into blocks makes the bits less uniform, so the false-positive rate rises a little for the same bits per key. Blocking does nothing for deletion or for an unknown key count.

## Question 4

Which use case is a poor fit for a Bloom filter?

A, answering "is this username taken?" exactly, at signup. B, avoiding re-crawling URLs a crawler has already visited. C, admitting a URL to a CDN cache on its second request. D, skipping a disk read for keys not in an SSTable.

[think]

The answer is A: answering "is this username taken?" exactly, at signup.

Signup needs an exact answer, and a false positive tells a user their name is taken when it is not. The other three tolerate a false positive, an extra read, a delayed admission, a skipped URL, and need to avoid false negatives, which is exactly the Bloom filter's guarantee.

## Question 5

A count-min sketch estimates a key's count as 1,200. Which statement is guaranteed?

A, the true count is at least 1,200. B, the true count is at most 1,200. C, the true count is within 1 percent of 1,200. D, the true count is exactly 1,200.

[think]

The answer is B: the true count is at most 1,200.

Every counter a key touches holds its true count plus any collisions, so each row is at least the truth, and so is their minimum. The sketch never underestimates. It can be exact, but that is not guaranteed.

## Question 6

You have a count-min sketch with a thousand columns, over a stream of 10 billion events. Which key count can it report usefully?

A, a key with 100 million events. B, none; the stream is too large. C, a key with 50 thousand events. D, a key with just 500 events.

[think]

The answer is A: a key with 100 million events.

The error bound is additive in total traffic: about twice the total divided by the width, which is 20 million here. Only counts well above that, the heavy hitters, are meaningful. The 500 and 50 thousand event keys are lost in collision noise.

## Question 7

Two data centres each keep a HyperLogLog of unique users. How do you get the global unique count?

A, add the two estimates together. B, take the larger of the two estimates. C, take the register-wise maximum and estimate from that. D, they cannot be combined; recount from the raw logs.

[think]

The answer is C: take the register-wise maximum and estimate from that.

A register holds the longest leading-zero run of the elements routed to it, so the maximum over both structures is exactly what one structure over the union would hold. Adding the estimates double-counts users seen in both centres. Taking the larger ignores users seen only in the other.

## Question 8

Why does HyperLogLog combine its registers with a harmonic mean, rather than an ordinary average of their estimates?

A, registers are stored as reciprocals to save space. B, one register with a freak long run of zeros would dominate. C, the harmonic mean is unbiased, so no correction is needed. D, it is cheaper to compute than an ordinary average.

[think]

The answer is B: one register with a freak long run of zeros would dominate.

Each register's estimate is heavy-tailed: one lucky hash gives a huge value, which would swamp an ordinary average. The harmonic mean is dominated by the small values, so it shrugs off that outlier. It is not unbiased, though; it still needs a correction constant.

## Question 9

Two documents have a Jaccard similarity of 0.6. With 128 independent MinHash functions, roughly what fraction of their signature positions will agree?

A, it varies with the two documents' sizes. B, about 0.77, the square root of 0.6. C, about 0.6, whatever the set sizes. D, about 0.36, since both sets must agree.

[think]

The answer is C: about 0.6, whatever the set sizes.

Each position agrees with probability equal to the Jaccard similarity, independent of how big the sets are. 0.36, which is 0.6 squared, is the probability that two positions both agree, and the square root plays no role at all.

## Question 10

Your LSH uses 20 bands of 5 rows. Pairs at similarity 0.4 become candidates about 19 percent of the time, and you cannot afford the verification cost. What is the cheapest change?

A, use more bands of 5 rows each. B, use more rows in each band. C, use a larger shingle size. D, use exact Jaccard on all pairs.

[think]

The answer is B: use more rows in each band.

More rows per band makes a whole band harder to match for every similarity below 1, which pushes the S-curve's threshold up and suppresses low-similarity candidates. More bands does the opposite. Shingle size changes what similarity means, not the curve, and exact Jaccard on every pair is the cost LSH exists to avoid.

## Question 11

You need the near-duplicate pairs among 2 billion web pages in a nightly batch job. Which approach fits?

A, MinHash over shingles, bucket by band, and verify the candidates. B, compare every pair with exact Jaccard on a large cluster. C, build an HNSW index over page embeddings and query each page. D, sort pages by length and compare adjacent neighbours.

[think]

The answer is A: MinHash over shingles, bucket by band, and verify the candidates.

Banding turns the problem into a group-by on band and bucket, which a batch engine shuffles efficiently, and Jaccard on shingles is the right similarity for near-duplicate text. HNSW is a query-time structure for vector nearest neighbours, not a batch join over sets. And every pair is 2 times 10 to the 18th comparisons.

## Question 12

Random-hyperplane hashing produces one bit per hyperplane. What does the fraction of agreeing bits between two vectors estimate?

A, one minus the angle between them divided by pi. B, the Jaccard similarity of their non-zero coordinates. C, their dot product, scaled to lie between zero and one. D, their Euclidean distance, scaled by length.

[think]

The answer is A: one minus the angle between them divided by pi.

Two vectors fall on the same side of a random hyperplane with exactly that probability. It is a monotone function of cosine similarity, which is why SimHash fingerprints work for near-duplicate detection, but it is not the cosine value itself.

## Recap

Three ideas kept coming back. The error is one-sided, and you must know which side: a Bloom filter never gives a false negative, and a count-min sketch never underestimates. Accuracy is bought with a budget you size up front, bits per key, columns, registers or rows per band, and it is relative to something: the key count you planned for, or the total traffic. And mergeability decides what a sketch is for: HyperLogLogs merge by register-wise maximum, while intersections and near-duplicate joins belong to MinHash and banding.
