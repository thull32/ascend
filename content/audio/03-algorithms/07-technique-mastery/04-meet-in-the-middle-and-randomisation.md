---
lesson: meet-in-the-middle-and-randomisation
source: 3b46c31c3806bc56
fit: partial
desk:
  - "The subset-sum doubling code, the mask animation, and the closest-sum sweep on 5, minus 7, 3, 5 with goal 4"
  - "The exact-count table with a Counter, and the baby-step giant-step formula"
  - "The quickselect expected-work sum, the universal hashing formula, and the polynomial string-hash code"
  - "Reservoir sampling extensions, Freivalds' argument, and the Fisher-Yates bug count"
  - "The generator and hash-seeding details, the memory numbers, and the approach comparison table"
  - "Exercises: four-array zero-sum count, and closest subset sum by meeting in the middle"
---
## Introduction

You are given 40 integers, each as large as a billion in absolute value, and asked for the subset whose sum is closest to a goal. There are 2 to the 40 subsets, about 1.1 trillion: hours of work even in a compiled language. Dynamic programming over reachable sums is hopeless, because the sums span about 80 billion values. Greedy has no argument. Every textbook technique seems to fail.

Then split the 40 numbers into two halves of 20. Each half has 2 to the 20 subset sums, about a million. Sort one list, and for each sum in the other ask "what is the best partner?" The whole thing takes seconds in Python. That is meet in the middle: it turns 2 to the n into roughly 2 to the n over 2, by solving two half-size problems and combining them in a way that does not multiply their costs.

The second half is the other tool for when determinism fails: randomness. For speed, as with random pivots. For safety, because an adversary who knows your hash function can pick your worst case. And for scale, with samples you can merge and verification far cheaper than recomputation.

## Meet in the middle

Every subset splits into a part from the first half and a part from the second, and its sum is the two parts' sums added. So list every subset sum of the left half, and every subset sum of the right half. The question "which subset is closest to the goal?" becomes "which pair, one sum from each list, adds up closest to the goal?" And that is a two-list pair problem the two-pointer lesson already solved: sort both lists, walk one pointer up the left list and one down the right.

Listing one half's sums is cheap if you double the list for each element: every subset either skips the new element or takes it. No subset is summed from scratch.

A tiny example. The numbers 5, minus 7, 3, 5, and a goal of 4. The left half, 5 and minus 7, has subset sums 0, 5, minus 7 and minus 2. The right half, 3 and 5, has 0, 3, 5 and 8. Every one of the 16 subsets of the whole array is one sum from each list. No pair makes 4, but minus 2 plus 5 makes 3, and 0 plus 5 makes 5. So the closest distance is 1, and the sweep finds it in seven steps without listing all 16. Before I say why: what lets the sweep drop a left value for good once its pair falls below the goal?

[pause]

The pair-table reason: if the current pair is below the goal, the left value with its largest remaining partner is still too small, so every other partner is further away, and that row can be dropped.

Now the cost, and say this part out loud in an interview. Sorting dominates the time. But memory is usually the binding constraint: one entry for every subset of a half. In Python, a half of 2 to the 20 sums is about 45 megabytes, or 8 as a packed 64-bit array. At 50 numbers, each half has about 34 million sums, roughly 1.4 gigabytes in Python. That is where the technique stops on a laptop.

## The signal, and the same idea in other clothes

Counting variants swap the sweep for the right lookup. "How many subsets sum to at most S?" sorts the right list and binary searches for each left sum. "How many sum to exactly S?" counts the right half's sums in a hash map and looks up S minus each left sum. Use a counter, not a set: as soon as two subsets in a half share a sum, a set counts them once, and the answer comes out low.

The signal to recognise: n between about 30 and 45, so 2 to the n is too big and 2 to the n over 2 is fine. Values too large for dynamic programming over sums. And an objective that decomposes as a left choice combined with a right choice, where sorting or hashing can do the combine.

You have met this idea before. Two Sum is meet in the middle with one element per side: for each element, look up its complement. Four arrays summing to zero: hash all n squared sums from the first two arrays with their counts, then for each sum from the other two, add the count of its negation. That is n squared instead of n to the fourth. Bidirectional breadth-first search, from both ends of a graph, expands about two times b to the d over 2 nodes instead of b to the d. For a branching factor of 10 and a distance of 8, that is 100 million against 20 thousand. And in cryptography, encrypting twice with two 56-bit DES keys does not give 112-bit security. An attacker encrypts forward under every first key, decrypts backward under every second key, and matches in the middle, for roughly 2 to the 57 operations plus a very large table. That is why the standard became triple DES.

## Randomisation: two contracts

Randomised algorithms come with one of two guarantees. Las Vegas: always correct, with a random running time, like randomised quickselect or treaps. Monte Carlo: bounded running time, with a small chance of a wrong answer, like Bloom filters or comparing strings by random hashes.

A Monte Carlo algorithm with a fast checker becomes Las Vegas: repeat until the check passes. And independent repetitions multiply error probabilities. If each run is wrong at most half the time, twenty runs are all wrong less than once in a million.

The deeper reason to randomise is where the guarantee comes from. Average-case analysis says "fast on a typical input", and a production system, or an attacker, may not send typical inputs. A randomised algorithm says "fast on every input, on average over my coin flips". The adversary chooses the input, but cannot choose your coins. That sentence is what interviewers want when they ask "why a random pivot?"

Here is the concrete case. Quickselect that always pivots on the first element is quadratic on sorted input, and sorted input is common: timestamps, IDs, logs. With a random pivot, half the time the pivot lands in the middle half of the range, which leaves at most three quarters of the elements. So on average it takes at most two partitions to shrink by a quarter, and the work adds up to at most 8n. Linear, in expectation, for every input.

## Hashing against adversaries

A hash table is constant time only if keys spread across buckets. An attacker who knows your hash function can choose keys that all land in one bucket, turning n inserts into quadratic work. In late 2011, researchers showed that the default hash tables in many web platforms could be attacked this way with nothing more than crafted form-field names in a single request.

The fix was the same everywhere: a keyed hash, with a random key per process. Python hashes strings and bytes with SipHash under a key chosen at startup. Rust's default map uses SipHash with random keys. Go seeds each map randomly. The theory is universal hashing: choose the hash function at random from a family, and any two fixed distinct keys collide with probability at most one over the number of buckets. The guarantee holds for every pair of keys, because the randomness is in the function, not in the data.

One gap to know: Python does not randomise integer hashes. An integer hashes to itself, which is what makes prefix-sum maps fast, and also what lets an adversary build colliding integer keys.

The same reasoning applies to polynomial string hashing, which compares substrings in constant time. The popular "base 31, let it overflow at 2 to the 64" scheme is broken on purpose by problem setters: a Thue-Morse string and its complement collide for every odd base. Use a random base chosen at run time and a prime modulus, such as 2 to the 61 minus 1. Then two different strings of length L collide only if the base is a root of a polynomial of degree below L, a probability below L over 2 to the 61.

## Sampling, verification and shuffles

Sampling first. Reservoir sampling picks uniformly from a stream of unknown length. The extension worth knowing at senior level is the mergeable sample: give every item a hash of its ID as a key, and keep the k smallest keys. Samples from different shards merge by taking the k smallest of their union. And because it is a hash, not a fresh random number, the same user lands in the same experiment bucket in every service that computes it.

Verification next: Freivalds' check. To check whether A times B equals C for n by n matrices, multiplying out is cubic. Instead, pick a random vector of 0s and 1s, and compare A times B times the vector with C times the vector: three matrix-vector products, quadratic. If the product is wrong, some row of the difference is non-zero, and for any coordinate where that row is non-zero, at most one of its two values in the vector can hide the error. So a wrong answer survives a round at most half the time, and twenty rounds miss it with probability below one in a million. The idea, verify with randomness instead of recomputing, shows up in distributed systems too: spot-checking replicas, sampling rows to validate a migration.

And the shuffle. Fisher-Yates walks from the last position down, swapping each with a random position at or before it. That gives n factorial equally likely executions, one per permutation. The classic bug swaps every position with a random position anywhere in the array. That gives n to the n equally likely executions. For three elements, that is 27 executions over 6 permutations, and 27 does not divide evenly by 6, so some orders must be more likely than others. The measured split is 4, 5, 5, 4, 5, 4. Every order possible is not the same as every order equally likely.

Last, the generator. Python's default random generator, the Mersenne Twister, is fast and well distributed, and completely predictable from 624 consecutive outputs. Right for pivots, shuffles and simulations. Wrong for session or password-reset tokens, which belong to the secrets module and the operating system's entropy source.

## In the interview

Here is the follow-up the lesson expects. What if n is 60?

[pause]

Then each half has 2 to the 30 sums, about a billion, which is 8 gigabytes even as packed 64-bit integers. Meet in the middle is out. Ask about the values. If they are bounded, dynamic programming over sums. If the target is close to zero or to the total, branch and bound with a prefix-sum bound prunes hard. Otherwise the problem is NP-hard, and an approximation or an integer programming solver is the honest answer. The wrong answer is "split into four quarters", which does not compose, because combining two pairs of lists is again a problem of size 2 to the n over 2.

And a second: why sort one side instead of hashing it? A hash answers exact-sum questions in constant time, but "closest" and "at most" are order questions, which need a sorted list and a binary search or a sweep. The same split as in the two-pointer lesson.

## Recap

Four things to remember. Meet in the middle turns 2 to the n into 2 to the n over 2 by splitting, enumerating each half, and combining with a sort or a hash; recognise it by n around 30 to 45 with large values, and quote its memory, which stops it around 50. Las Vegas is always right with random time; Monte Carlo is fast with a small error, and repetition shrinks the error exponentially. Randomness gives "fast for every input, averaged over my coin flips", which is why pivots are random and production hashes are seeded. And for shuffles, draw from a shrinking range, or the permutations are provably not equally likely.

At your desk: the subset-sum code and sweep trace, the counting table, the hashing formulas and string-hash code, the sampling and Freivalds details, the comparison table, and the two exercises.
