---
lesson: counting-and-combinatorics
source: 4afdbe55ca86434c
---
## 1

A problem asks you to try every way of assigning 12 tasks to 12 workers, one task each. How many assignments are there, and is brute force plausible?

A, 12 factorial, about 480 million; far beyond any time limit. B, 12 factorial, about 480 million; feasible but borderline. C, 12 to the 12th, about 9 trillion; far too many to try. D, 2 to the 12th, 4,096; feasible and trivially fast.

[think]

The answer is B: 12 factorial, about 480 million; feasible but borderline.

One-to-one assignments are orderings, so n factorial, and 12 factorial is about 479 million. At 100 million to a billion simple operations a second in compiled code, that is seconds, and only with a fast inner loop; in CPython it is minutes, and 13 factorial would be ten times worse. 2 to the 12 counts subsets, not assignments, and 12 to the 12 allows one worker to take several tasks.

## 2

A function computes n choose k by looping i from 1 to k. At each step, it multiplies the running value by n minus k plus i, and then divides by i. Why multiply first, rather than divide first?

A, the order is arbitrary: both orders give the same result. B, after the multiply, i always divides the value exactly. C, dividing first can make the running value go negative. D, multiplying first keeps the intermediate values smaller.

[think]

The answer is B: after the multiply, i always divides the value exactly.

After step i, the running value is itself a binomial coefficient, an integer, so the product before the division is always divisible by i. Dividing first can produce a non-integer that integer division truncates, giving a wrong result, so the order is not arbitrary. Multiplying first actually makes the intermediate value temporarily larger, not smaller.

## 3

A grid has 4 rows and 6 columns. How many paths, moving only right or down, lead from the top-left corner to the bottom-right corner?

A, 56. B, 24. C, 70. D, 126.

[think]

The answer is A: 56.

A path is 3 downs and 5 rights in some order, so the count is 8 choose 3, which is 56. 70 is 8 choose 4, which would be a 5 by 5 grid. 24 is 4 times 6, the number of cells. And 126 is 9 choose 4.

## 4

An array of length 1,001 contains integers between 1 and 1,000. Which claim is guaranteed, without any assumption about randomness?

A, at least one value appears twice. B, exactly one value appears twice. C, no value appears more than twice. D, every value from 1 to 1,000 appears.

[think]

The answer is A: at least one value appears twice.

This is the pigeonhole principle: 1,001 items in 1,000 boxes force some box to hold at least two. Nothing forces the repeated value to be unique, bounds how often it repeats, or requires every value to be present.

## 5

Segment A has 5,000 users, segment B has 3,000, and 1,200 users are in both. How many users are in at least one segment, and what goes wrong if you add the two counts?

A, 6,800: adding counts the shared 1,200 twice. B, 3,800: you must subtract the overlap from both. C, 8,000: the two segment counts add up directly. D, 8,000: each segment already excludes the overlap.

[think]

The answer is A: 6,800, because adding counts the shared 1,200 twice.

The size of the union is the two sizes added, minus the overlap: 5,000 plus 3,000, minus 1,200, is 6,800. Plain addition double-counts the intersection, since the shared users are inside both segment counts. 3,800 subtracts the overlap twice.

## 6

A 12-node cluster stores each chunk on 3 nodes. With random placement, every one of the 220 possible triples eventually holds some chunk; with 4 fixed, disjoint triples, only those hold chunks. What does restricting placement change?

A, nothing about durability: both schemes lose data whenever any 3 nodes fail. B, each chunk becomes more durable, because it is stored on more nodes. C, rebuilds get faster, since fewer triples means less data to copy. D, fewer 3-node failures lose data, 4 of 220, but each rebuild reads from fewer peers.

[think]

The answer is D: fewer 3-node failures lose data, but each rebuild reads from fewer peers.

The number of triples in use is the number of 3-node failure patterns that lose data: 4 of 220, about 1.8 percent, against effectively all of them with random placement. The cost is recovery parallelism: a failed node's data lives on 2 peers instead of 11. The replication factor is unchanged, so durability against fewer than 3 failures is identical.
