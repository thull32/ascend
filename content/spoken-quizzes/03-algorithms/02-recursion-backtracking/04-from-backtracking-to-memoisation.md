---
lesson: from-backtracking-to-memoisation
source: f46fdfc68739b134
---
## 1

A backtracking function counts valid completions from position i. It also takes the path, the list of choices so far, which does not affect the count. What is the right memo key?

A, i together with the path, as a tuple. B, the path alone, as a tuple. C, the length of the path. D, i alone.

[think]

The answer is D: i alone.

Only arguments that affect the result belong in the key. Including the path makes every call unique, so the cache never hits. Keying on i alone gives n states. The path's length is usually i again, but only if it is truly determined by i.

## 2

You add Python's LRU cache decorator to the naive recursive Fibonacci and call it on 50 thousand. What happens in CPython?

A, it hangs, since the unbounded cache fills memory. B, it returns a wrong answer, since the integers overflow 64 bits. C, a recursion error, because the first call nests 50 thousand frames deep. D, it returns instantly, since each value is computed once.

[think]

The answer is C: a recursion error, because the first call nests 50 thousand frames deep.

Memoisation removes repeated work, not stack depth. The first call still recurses 50 thousand frames deep before anything is cached, and the default limit is about 1,000. Bottom-up tabulation, or a loop, is the fix. Python integers do not overflow, and 50 thousand cached values are a trivial amount of memory.

## 3

Which problem does not benefit from memoisation?

A, the number of ways to segment a string into dictionary words. B, whether a subset of the numbers sums to a target. C, the minimum edits to turn one string into another. D, the list of all permutations of 9 distinct items.

[think]

The answer is D: the list of all permutations of 9 distinct items.

The output has 9 factorial entries, and no caching can produce them faster than writing them out. The other three are count, decide and minimise questions with polynomial state spaces: an index; an index and a sum; two indices.

## 4

A memoised recursive function reads a global list that another part of the program changes between calls. What symptom should you expect?

A, stale answers that depend on the order of calls. B, a key error when the cache sees the new list. C, a recursion error once the list grows long. D, correct results, but more cache misses.

[think]

The answer is A: stale answers that depend on the order of calls.

The cache key does not include the global, so the cache never notices the change: no miss, no error. Once an answer is cached, it is returned even after the data changes. Bugs like this are intermittent and hard to reproduce, which is why a memoised function must be pure in its arguments.

## 5

Target Sum asks how many ways there are to put a plus or a minus sign on each of n numbers to hit a target. Two sign patterns that both reach index i with a running sum of 7 are the same subproblem. Why?

A, their remaining choices and remaining target match. B, both must have used the same sign pattern so far. C, their sign patterns share a common prefix up to index i. D, they used equally many plus and minus signs so far.

[think]

The answer is A: their remaining choices and remaining target match.

However 7 was reached, what is left is identical, so the future depends only on the index and the running sum; the signs themselves may differ entirely. That collapses 2 to the n paths into at most n times the range of sums, which is the point of choosing the state to be the history's effect, not the history itself.

## 6

A service memoises a pure function of two integers with an unbounded LRU cache, and its memory grows by about a gigabyte a day. What is the most likely explanation?

A, each cached pair costs over 100 bytes, and the key space is unbounded. B, the cache retains every stack frame of the recursion that created each entry. C, the linked list of recently used entries is never trimmed without a maximum size. D, tuple keys are rehashed on every hit, leaking one hash object per call.

[think]

The answer is A: each cached pair costs over 100 bytes, and the key space is unbounded.

A tuple-keyed entry measured about 116 bytes in CPython, so ten million distinct argument pairs a day is about a gigabyte, and with no maximum size nothing is ever evicted. An unbounded cache has no linked list at all, hashes do not leak, and frames are released when calls return. A maximum size, a TTL cache, or caching at the data layer is the fix.
