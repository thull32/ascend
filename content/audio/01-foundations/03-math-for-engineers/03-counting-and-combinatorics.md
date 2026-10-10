---
lesson: counting-and-combinatorics
source: 40f6565e99bb41da
fit: partial
desk:
  - "The derivations of permutations, combinations, lattice paths and stars and bars"
  - "The multiplicative binomial loop, its trace and the proof that each division is exact"
  - "The inclusion-exclusion table and the derangement formula"
  - "The brute-force feasibility table and the enumeration-strategy table"
  - "The nine-row pairwise array for three three-valued factors"
  - "Exercises: binomial coefficient without overflow, counting lattice paths"
---
## Introduction

An interviewer says the input has at most 20 items, return every valid grouping. A teammate asks how many CI jobs a matrix of 3 browsers, 4 OS versions and 3 locales needs. A design review asks how many distinct 3-node replica sets a 12-node cluster can form, and whether that number is good or bad for durability.

Each is a counting question, and each has a known answer once you recognise which of five shapes it is: orderings, subsets, fixed-size subsets, grid paths, or items into bins. Counting is also how you know when not to brute force. If the space is 2 to the 20, you enumerate it and go home. If it is 20 factorial, you find structure.

Four parts. The two rules everything is built from, and the shapes they produce. Pigeonhole and inclusion-exclusion, the two tools for arguing about overlaps. Computing a count without overflow. And how counts become decisions: brute-force budgets, test matrices and replica placement.

## Two rules and the shapes

The product rule: if one choice has a options and an independent second choice has b, there are a times b outcomes. A four-digit PIN has 10 thousand. Five boolean flags have 32 states. The CI matrix is 3 times 4 times 3, 36 jobs.

The sum rule: if two options are mutually exclusive, add them. Everything in this lesson is those two rules applied carefully. The word independent is where one family of mistakes lives, and the word exclusive is where the other lives.

Orderings first. Arranging n distinct items in a line: n options for the first slot, n minus 1 for the second, and so on down to 1. That is n factorial. 10 factorial is about 3.6 million, 12 factorial about 480 million. 20 factorial fits in an unsigned 64-bit integer and 21 factorial does not. Try every ordering is feasible only up to about 11 or 12. If you only order k of the n, cut the product short: three medals among eight runners is 8 times 7 times 6, 336.

Now selections, where order does not matter. Take the ordered count and notice each unordered set was counted once per ordering of its members, k factorial times. Divide by that, and you have n choose k. Choosing 3 replicas from 12 nodes is 220. Pairs among n items is n times n minus 1 over 2, which is why compare every pair is quadratic.

Two properties earn their keep. Symmetry: choosing which 3 of 50 servers to drain is the same choice as which 47 to keep. And Pascal's identity: fix one item, and either it is in the set or it is not. So n choose k is n minus 1 choose k minus 1, plus n minus 1 choose k. That is the recurrence behind Pascal's triangle.

Subsets: each of n items is in or out, two choices n times, so 2 to the n subsets. That is the same as n-bit integers, each bit saying whether an item is included. Up to 20 items, 2 to the 20 is a million, and a plain loop over the masks is the intended answer. Around 40 items, meet in the middle splits the problem into two halves of 2 to the 20.

Grid paths. Walking from the top-left of a grid to the bottom-right, moving only right or down, every path is a fixed number of downs and rights in some order. On a 3 by 3 grid that is two downs and two rights, and a path is fixed by choosing which two of the four moves are downs: 4 choose 2, six paths. The dynamic programming solution, where each cell is the cell above plus the cell to the left, is Pascal's identity rebuilt cell by cell. Saying so out loud is worth more than the code.

Items into bins, called stars and bars. How many ways can 4 identical requests land on 3 servers? Picture the 4 requests as stars in a row with 2 bars dividing them into 3 groups. Every arrangement of 4 stars and 2 bars is one distribution, so the answer is which 2 of the 6 positions hold bars: 6 choose 2, which is 15 load patterns.

## Pigeonhole and inclusion-exclusion

Pigeonhole: put n plus 1 items into n boxes, and some box holds at least two. Obvious, and surprisingly sharp. An array of 1,001 integers drawn from 1 to 1,000 must contain a duplicate, which is the premise that lets Find the Duplicate Number use cycle detection instead of a hash set. A hash table with more keys than buckets must have a collision, however good the hash. And any lossless compressor that shrinks some inputs must expand others, because there are fewer shorter outputs than inputs. The general form: n items in m boxes means some box holds at least n over m, rounded up.

Inclusion-exclusion repairs the sum rule when cases overlap. Here is the classic analytics bug. Segment A has 5,000 users, segment B has 3,000, and 1,200 are in both. How many users are in at least one?

[pause]

6,800. Add the two and subtract the overlap, because the shared 1,200 sit inside both counts. Add them plainly and you report 8,000, and eventually a "reached by any campaign" number larger than the number of users who exist.

With three sets you add the singles, subtract the pairs, and add back the triple, because the triple was added three times and subtracted three times. The lesson works through how many numbers from 1 to 100 are divisible by 2, 3 or 5, and gets 74; the table is worth doing once at your desk.

The same tool gives derangements: permutations that leave no item in its original place. For 4 items there are 9 of the 24. As n grows, the fraction approaches 1 over e, about 37 percent of random shuffles, whatever n is. That is the fraction of secret-Santa draws in which nobody draws themselves.

## Computing a count without overflow

Never compute n factorial and divide. 60 choose 30 is about 1.2 times 10 to the 17, which fits in 64 bits. 60 factorial is about 8 times 10 to the 81, which does not.

Use the multiplicative form instead. Loop i from 1 to k, and at each step multiply the running value by the next numerator term, then divide by i. The running value at every step is itself a smaller binomial coefficient, so it stays close to the answer. One tiny trace by ear: 10 choose 3. Start at 1. Times 8, divide by 1: 8. Times 9, divide by 2: 36. Times 10, divide by 3: 120.

Now the trap. Why multiply before dividing, and not the other way round?

[pause]

Because after the multiply, i always divides the value exactly; the product is i times a binomial coefficient. Divide first and the integer division truncates. On 10 choose 3 dividing first happens to work by luck, but on 10 choose 4 it computes 7 divided by 2 as 3 and ends wrong. And note that multiplying first makes the intermediate temporarily larger, not smaller; the point is exactness, not size.

In JavaScript, every n choose k with n up to 56 fits a double exactly, but the product before each division is larger than the answer, so the loop is exact for every n up to 55. Beyond that, BigInt. Factorial-based formulas fail much sooner, because factorials stop being exact in a double after 22 factorial. And under a modulus you cannot divide at all: build Pascal's triangle with additions, or precompute factorials and their modular inverses.

## Turning counts into decisions

The feasibility table, in sentences. At roughly 10 to the 8 or 10 to the 9 simple operations a second, subsets are fine up to about 25 items and borderline at 30. Orderings die at 12. Pairs and triples are fine into the thousands: pairs among 5,000 items is about 12 million. That is why quadratic pair enumeration is acceptable for n up to a few thousand, and cubic for a few hundred. In CPython, budget only about 10 to the 7.

Test matrices. Eight options with three values each is 3 to the 8, 6,561 CI jobs. You will not run them. Pairwise testing covers every pair of values of every pair of factors at least once. For three factors with three values each, nine rows suffice instead of 27; the lesson builds them by setting the third value to the sum of the first two, mod 3. The evidence for pairwise is NIST's studies of real failures, which found most were triggered by one or two parameters. And for larger matrices, the row count grows roughly with the log of the number of factors, not exponentially.

Replica placement. A 12-node cluster stores each chunk on 3 nodes. There are 220 possible node triples. Place chunks randomly and, after enough chunks, every triple holds something, so any simultaneous failure of 3 nodes loses data. Restrict placement to 4 disjoint triples, the copysets idea, and only 4 of 220 three-node failures, about 1.8 percent, lose a chunk. The price is recovery parallelism: a failed node's data is rebuilt from 2 peers instead of 11. The count is the whole design space, and choosing how much of it to use is the decision.

One more trap: enumerating when only the count was asked. How many paths cross a 10 by 10 grid is a binomial computed in microseconds. A search that lists them visits 48,620 paths, and on a 20 by 20 grid about 35 billion.

## In the interview

Here is a follow-up the lesson expects. The constraint is n up to 40, and you need the subsets whose sum is S. 2 to the 40 is too many. What now?

[pause]

Meet in the middle. Split the items into two halves of 20. Enumerate each half's 2 to the 20 subset sums, sort one side, and for each sum on the other side binary search for S minus that sum. About 2 to the 21 times log of 2 to the 20 work, instead of 2 to the 40. The wrong answer is "prune the search", which without a bound still explores an exponential tree on adversarial input.

And another: you need n choose k modulo 10 to the 9 plus 7 for a million queries. Precompute factorials and inverse factorials modulo the prime once, and each query becomes three multiplications. Division does not exist under a modulus, so the inverse factorial replaces it. Running the multiplicative loop per query with integer division is wrong under the modulus, and slow besides.

## Recap

Four things to remember. Everything is the product rule and the sum rule, and the five shapes are orderings at n factorial, subsets at 2 to the n, n choose k, grid paths, and stars and bars. Size the search space before choosing an approach: subsets to about 25, orderings to about 12. Compute binomials multiplicatively, multiplying before dividing, never through factorials. And correct overlaps with inclusion-exclusion, use pigeonhole as a proof tool, and treat n choose r as a design space when placing replicas or cutting a test matrix.

At your desk: the derivations of each shape, the binomial loop with its exactness proof, the inclusion-exclusion and derangement working, the feasibility and enumeration tables, the nine-row pairwise array, and the two exercises.
