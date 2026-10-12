---
lesson: why-big-o
source: fa448ef3d18da013
---
## 1

A function does a single linear pass, and then, inside a loop over all n elements, inserts each one at the front of a Python list, at position zero. The list grows to n elements. What is the function's overall time complexity?

A, order n. B, order n squared. C, order 2 n. D, order n log n.

[think]

The answer is B: order n squared.

Inserting at position zero shifts every existing element right, so each insert costs the current length of the list. Summed over n inserts, that is zero plus one plus two, up to n minus 1, which is order n squared, and it dominates the earlier linear pass. And order 2 n is not a separate class: constants are dropped.

## 2

Two algorithms cost exactly 50 n operations and n squared over 10 operations. For which input sizes is the supposedly worse quadratic one actually cheaper?

A, whenever n is below 500. B, whenever n is below 5. C, whenever n is above 500. D, never: linear always wins.

[think]

The answer is A: whenever n is below 500.

Set n squared over 10 below 50 n and solve: n below 500. Under that size, the quadratic algorithm does fewer operations. Big O describes the limit as n grows. It says nothing about which algorithm wins at a particular small n, which is exactly why you check the constants when n is bounded.

## 3

Summing a 512 megabyte array by random but independent indexes measured about 4 nanoseconds per element. Following a random pointer chain through the same array measured about 100 nanoseconds per hop. What explains the 25 times gap?

A, index arithmetic is vectorised, while pointer loads are scalar. B, the pointer chain touches 25 times more cache lines per element. C, the prefetcher predicts random indexes, but not pointer targets. D, independent misses overlap in flight, while dependent loads serialise.

[think]

The answer is D: independent misses overlap in flight, while dependent loads serialise.

An out-of-order processor can keep dozens of cache misses outstanding at once when the addresses do not depend on each other, so their 100 nanosecond latencies overlap. In a pointer chain, the next address is unknown until the current load returns, so every hop pays the full latency. Both patterns touch one cache line per element, and the prefetcher cannot predict either random pattern.

## 4

A hash map is keyed by strings that average 2 kilobytes long, and it holds n entries. Which statement about the cost of a lookup is the most honest?

A, order n, because long keys cause many more collisions. B, constant time, because hashing is constant time for any key. C, linear in the key's length, because hashing reads every byte. D, order log n, because long keys force a tree-based map.

[think]

The answer is C: linear in the key's length, because hashing reads every byte.

Hashing a 2 kilobyte key touches every byte, and a successful lookup also compares the whole key. That cost does not grow with n, so it is not order n. But calling it constant time hides that every lookup reads about 2 thousand bytes, where a short key reads eight.

## 5

A colleague insists that scanning a list beats a set lookup for fewer than ten elements, citing a C plus plus benchmark. In CPython, the set wins from about three elements. Why does the crossover move?

A, CPython sets skip hashing for lists shorter than ten. B, each list comparison in CPython is a dynamic call that costs about as much as a hash. C, CPython lists store their elements scattered in memory, so scans miss the cache. D, C plus plus hash tables are slower than CPython sets at small sizes.

[think]

The answer is B: each list comparison in CPython is a dynamic call that costs about as much as a hash.

The crossover is where n comparisons cost the same as one hash and one probe. In C plus plus a comparison is about a cycle and a hash about twenty, so the scan wins up to a dozen elements or so. In CPython each comparison is a dynamic call of about 10 nanoseconds, roughly the cost of the whole set lookup, so the set wins almost at once.

## 6

Computing the n-th Fibonacci number iteratively, with two Python integers, takes n additions. Why is calling it order n an understatement when n is large?

A, Python's loop overhead adds a log n factor per iteration. B, the interpreter re-parses the loop body on every iteration. C, each addition allocates a new object, which costs order n in CPython. D, the integers grow to about n digits, so each addition costs order n.

[think]

The answer is D: the integers grow to about n digits, so each addition costs order n.

The n-th Fibonacci number has about a fifth of n decimal digits, so the assumption that an addition is one step fails. The k-th addition costs work proportional to k, and the total is order n squared. Allocating the new integer costs in proportion to its length, not to n, and the loop is compiled to bytecode once.
