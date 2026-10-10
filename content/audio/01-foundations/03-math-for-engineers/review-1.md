---
review: math-for-engineers
source: 03d7ba573f11b060
---
## Introduction

Twelve questions from the math-for-engineers module. Answer out loud before the answer comes.

They run through the module in order: logarithms, modular arithmetic and hashing, counting, probability, bit manipulation, and number theory. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A balanced binary search tree holds 2 to the 40 keys, about a trillion. About how many node visits does a lookup take?

A, about 2 to the 20. B, about 40. C, about 1,000. D, about a million.

[think]

The answer is B: about 40.

A balanced tree's height is log base 2 of its size, so a lookup visits about 40 nodes. This is the sense in which order log n is free: a trillion keys cost forty steps. The tempting answers all scale with n itself, which is exactly what the logarithm avoids.

## Question 2

Binary search over a 4 gigabyte sorted array of 4-byte integers takes about 2.6 microseconds, while the same search over a 4 kilobyte array takes about 10 nanoseconds. Both are order log n. What explains the gap?

A, each probe on the large array is a cache miss of about 100 nanoseconds, not a 1 nanosecond compare. B, the larger array needs 30 probes instead of 10, so it is three times slower. C, the small search is constant time because the whole array fits in one cache line. D, the large array needs 64-bit indices, which double the cost of every probe.

[think]

The answer is A: each probe on the large array is a cache miss of about 100 nanoseconds.

The step count only grows from 10 to 30, but on the 4 gigabyte array about 26 of the 30 probes land on fresh cache lines, and each costs a memory access of roughly 100 nanoseconds. The 4 kilobyte array sits in the fastest cache, and each probe is a register-speed compare. And 4 kilobytes is 64 cache lines, not one. Order log n is free when each step is cheap, and expensive when each step is a memory stall.

## Question 3

In Java, a key's hash code mod the table length throws an array-index-out-of-bounds exception in production once a week. What is happening?

A, the hash code can be negative, and Java's remainder keeps its sign. B, overflow in the hash code yields values the remainder cannot reduce. C, the table length is not prime, so some buckets overflow. D, the hash code can exceed the table length and the remainder fails to wrap it.

[think]

The answer is A: the hash code can be negative, and Java's remainder keeps its sign.

Java's hash code is a signed integer, and Java's remainder truncates toward zero, so a negative hash gives a negative index. Exceeding the table length is exactly what the remainder fixes, and no integer is too large for it to reduce; only the sign escapes. Primality is irrelevant. Use floor mod, or mask with a power-of-two size.

## Question 4

Eight keys allocated in steps of 4, 1000, 1004, and so on up to 1028, are put into a table of 8 buckets by taking the key mod 8. How many buckets are used, and what fixes it?

A, 8 buckets; the modulus spreads any arithmetic sequence evenly. B, 4 buckets; doubling the table to 16 restores full spread. C, 2 buckets; a prime size, or a mixing step before the mask. D, 2 buckets; only a larger power-of-two size can fix it.

[think]

The answer is C: 2 buckets; a prime size, or a mixing step before the mask.

4 and 8 share a factor of 4, so the keys cycle through only 8 divided by 4 residues, 0 and 4. Doubling to 16 gives 4 buckets, still a quarter of the table. A prime size shares no factor with any smaller step and uses every bucket. A power-of-two size works only if the hash is mixed first, which is what Java's shift-and-XOR spread and CPython's perturbation do.

## Question 5

A problem asks you to try every way of assigning 12 tasks to 12 workers, one task each. How many assignments are there, and is brute force plausible?

A, 12 factorial, about 480 million; far beyond any time limit. B, 12 factorial, about 480 million; feasible but borderline. C, 12 to the 12th, about 9 trillion; far too many to try. D, 2 to the 12th, 4,096; feasible and trivially fast.

[think]

The answer is B: 12 factorial, about 480 million; feasible but borderline.

One-to-one assignments are orderings, so n factorial, and 12 factorial is about 479 million. At 100 million to a billion simple operations a second in compiled code that is seconds, and only with a fast inner loop; in CPython it is minutes, and 13 factorial would be ten times worse. 2 to the 12 counts subsets, not assignments, and 12 to the 12 allows one worker to take several tasks.

## Question 6

A 12-node cluster stores each chunk on 3 nodes. With random placement, every one of the 220 possible triples eventually holds some chunk; with 4 fixed, disjoint triples, only those hold chunks. What does restricting placement change?

A, nothing about durability; both schemes lose data whenever any 3 nodes fail. B, each chunk becomes more durable, because it is stored on more nodes. C, rebuilds get faster, since fewer triples means less data to copy. D, fewer 3-node failures lose data, 4 of 220, but each rebuild reads from fewer peers.

[think]

The answer is D: fewer 3-node failures lose data, but each rebuild reads from fewer peers.

The number of triples in use is the number of 3-node failure patterns that lose data: 4 of 220, about 1.8 percent, against effectively all of them with random placement. The cost is recovery parallelism: a failed node's data lives on 2 peers instead of 11. The replication factor is unchanged, so durability against fewer than 3 failures is identical.

## Question 7

A system tags requests with random 32-bit IDs and typically has 100 thousand requests in flight. Roughly how likely is it that two in-flight requests share an ID at a given moment?

A, about 1 percent, since 32 bits is ample for 100 thousand IDs. B, about 0.002 percent, since 100 thousand over 2 to the 32 is tiny. C, zero until 2 to the 32 requests have been issued. D, about 70 percent, since the number of pairs grows as n squared.

[think]

The answer is D: about 70 percent.

Collisions depend on pairs, not draws. The birthday bound gives one minus e to the minus 1.16, about 69 percent, for 100 thousand IDs in a 32-bit space. The tempting second answer is the chance that one specific new ID collides, not that any pair does. Collisions become likely at the square root of the space size.

## Question 8

Why is picking the less loaded of two random servers so much better than picking one random server?

A, it makes the load on every server exactly equal. B, it is not better; it only adds an extra round trip. C, the maximum load falls from about log n over log log n to about log log n. D, it halves the number of requests each server receives.

[think]

The answer is C: the maximum load falls from about log n over log log n to about log log n.

For a server to reach the next load level, both sampled servers must already be at the level below, so the fraction at each level is roughly the square of the one below. That is doubly exponential decay: a maximum of about 4 for any realistic n. Simulated at a million, it was 4 with two choices against 9 with one. The total number of requests is unchanged, and the load is not exactly equal, only far tighter.

## Question 9

In JavaScript, 1 shifted left by 31 evaluates to minus 2,147,483,648, and 1 shifted left by 32 evaluates to 1. Why?

A, left shift is an arithmetic shift in JavaScript, keeping the sign. B, shifting past bit 31 overflows and wraps back around to 1. C, JavaScript stores all numbers as 32-bit signed integers. D, bitwise operators use a signed 32-bit view, and shift counts are taken mod 32.

[think]

The answer is D: bitwise operators use a signed 32-bit view, and shift counts are taken mod 32.

JavaScript numbers are 64-bit floats, but every bitwise operator works on a signed 32-bit view of its operands. Bit 31 is the sign bit, and the shift count is masked to 5 bits, so 32 becomes 0, and 1 shifted by 32 is 1 shifted by 0. Overflowing past bit 31 would give 0, not 1.

## Question 10

An array holds every integer from 0 to n exactly once, except one that is missing. Which approach finds it in linear time and constant space, with no risk of overflow in a fixed-width language?

A, sort the array in place, then scan for the gap. B, sum 0 to n with the formula n times n plus 1 over 2, and subtract the array's sum. C, XOR together all the indices from 0 to n and all the array values. D, insert all values into a hash set, then probe 0 to n.

[think]

The answer is C: XOR together all the indices and all the array values.

Every value that is present appears twice, once as an index and once as an element, and cancels, leaving the missing one. The sum approach is also constant space, but n times n plus 1 over 2 can overflow a 32-bit integer for large n. Sorting is n log n, and a hash set uses linear space.

## Question 11

A colleague computes the modular inverse as a to the m minus 2, mod m, for a modulus m of one million, which is not prime. What is the outcome?

A, correct for odd a, since only even a shares a factor with m. B, wrong in general: the Fermat shortcut needs a prime modulus. C, correct, since Fermat's theorem holds for any modulus. D, a runtime error, since Python rejects composite moduli.

[think]

The answer is B: wrong in general, because the Fermat shortcut needs a prime modulus.

a to the m minus 2 is the inverse only when a to the m minus 1 is 1, which Fermat guarantees for a prime modulus. Measured: for 3, it returns 888,889, and 3 times that leaves 666,667, not 1, even though 3 and one million are coprime and the true inverse, 666,667, exists. Nothing raises. Extended Euclid handles any coprime pair and reports when no inverse exists.

## Question 12

A Miller-Rabin round on 221, with n minus 1 written as 4 times 55, gives the sequence 128 then 30 for base 2. For base 174 it gives 47 then 220. What do the two rounds tell you?

A, the rounds conflict, so Miller-Rabin cannot decide 221. B, both rounds prove 221 prime, since neither sequence starts at 1. C, base 2 proves 221 composite; base 174 is a liar that says probably prime. D, base 2 says probably prime; base 174 proves 221 composite.

[think]

The answer is C: base 2 proves 221 composite, and base 174 is a liar.

A prime must produce a sequence that starts at 1 or passes through n minus 1, here 220. Base 2 gives 128 then 30, neither, so 221 is certainly composite and 2 is a witness. Base 174 reaches 220, which is consistent with primality, so it is a liar; 221 is 13 times 17. One witness settles it, and at most a quarter of bases lie for any composite, which is why several bases are used.

## Recap

The questions kept returning to three ideas. First, a number's size is not its cost: log n is free only when each step is cheap, collisions arrive at the square root of a space, and two random choices beat one exponentially. Second, structure leaks through arithmetic: shared factors collapse a hash table, signs survive a remainder, and JavaScript's bitwise operators see only 32 bits. Third, every shortcut has a precondition: Fermat's inverse needs a prime, brute force needs the count to fit the budget, and a probabilistic test needs enough bases.
