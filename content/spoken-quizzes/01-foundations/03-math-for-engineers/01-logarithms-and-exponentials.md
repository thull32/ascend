---
lesson: logarithms-and-exponentials
source: 3b27d9b692e4c6df
---
## 1

A balanced binary search tree holds 2 to the 40 keys, about a trillion. About how many node visits does a lookup take?

A, about 2 to the 20. B, about 40. C, about 1,000. D, about a million.

[think]

The answer is B: about 40.

A balanced tree's height is log base 2 of its size, so a lookup visits about 40 nodes. This is the sense in which order log n is free: a trillion keys cost forty steps. The tempting answers all scale with n itself, which is exactly what the logarithm avoids.

## 2

Why does big O notation write order log n without specifying the base?

A, because asymptotic analysis always uses the natural log. B, because the base changes the space cost, not the time. C, because any two bases differ only by a constant factor. D, because computers use base 2, so it is always implied.

[think]

The answer is C: because any two bases differ only by a constant factor.

The change-of-base rule says log base a of n is log base b of n, divided by log base b of a, and that divisor is a constant that does not depend on n, which big O ignores. Base 2 is a convention for counting steps, not a requirement. The base matters again only when you want an actual number, such as the height of a B-tree.

## 3

A B-tree index over a billion keys has a fan-out of about 1,000. How many page reads does a lookup need, and what changes if the fan-out rises to 4,096?

A, 10 reads; a fan-out of 4,096 drops the height to about two and a half. B, 3 reads; a fan-out of 4,096 still needs 3, because rounding up absorbs the gain. C, 30 reads; fan-out does not change the height of a balanced tree. D, 3 reads; a fan-out of 4,096 halves the height to a single read.

[think]

The answer is B: 3 reads, and a fan-out of 4,096 still needs 3, because rounding up absorbs the gain.

The height is log base f of n, rounded up, which is log base 2 of n over log base 2 of f. That is about 30 over 10, so 3, at a fan-out of 1,000, and about 30 over 12, two and a half, which rounds up to 3, at 4,096. Change of base is what shrinks 30 to 3, and beyond about 1,000 the rounding swallows further gains for a billion keys. Heights are whole page reads, never fractions.

## 4

A latency dashboard smooths one sample per second with an exponential moving average, using an alpha of 0.01. About how long after latency doubles does the smoothed line get halfway there?

A, about 100 seconds, since the average remembers one over alpha samples. B, about 10 seconds, since 0.01 is one percent of the range. C, about 1 second, since the average weights the newest sample most. D, about 69 seconds: the half-life, natural log of 2 over minus the natural log of 1 minus alpha.

[think]

The answer is D: about 69 seconds, the half-life.

Each sample's weight decays by a factor of 1 minus alpha per step, so the response to a step change reaches half after the natural log of 2 divided by minus the natural log of 0.99, about 69 samples, which here is 69 seconds. One over alpha, 100, is the mean age of the weights, not the half-life. And the newest sample carries only 1 percent of the weight.

## 5

Adding full jitter to exponential backoff does not reduce the number of retries. Why does it still help a dependency recover?

A, it shortens the average wait, so clients succeed before the outage ends. B, it spreads each round's retries across the window, instead of one instant. C, it reduces the total retries by randomly skipping some attempts. D, it makes clients give up sooner, so fewer retries reach the dependency.

[think]

The answer is B: it spreads each round's retries across the window, instead of one instant.

Without jitter, 1,000 clients that failed together retry together, at 100, 300 and 700 milliseconds: spikes of 1,000. Full jitter draws each sleep uniformly from the window, so the same retries arrive at about 10 per millisecond in the first window and 0.6 per millisecond by the fifth. The retry count is unchanged; only its timing is spread. The shorter mean wait is a side effect, not the mechanism.

## 6

Binary search over a 4 gigabyte sorted array of 4-byte integers takes about 2.6 microseconds, while the same search over a 4 kilobyte array takes about 10 nanoseconds. Both are order log n. What explains the gap?

A, each probe on the large array is a cache miss of about 100 nanoseconds, not a 1 nanosecond compare. B, the larger array needs 30 probes instead of 10, so it is three times slower. C, the small search is constant time, because the whole array fits in one cache line. D, the large array needs 64-bit indexes, which double the cost of every probe.

[think]

The answer is A: each probe on the large array is a cache miss of about 100 nanoseconds.

The step count only grows from 10 to 30, but on the 4 gigabyte array about 26 of the 30 probes land on fresh cache lines, and each costs a memory access of roughly 100 nanoseconds. The 4 kilobyte array sits in the fastest cache, and each probe is a register-speed compare. And 4 kilobytes is 64 cache lines, not one. Order log n is free when each step is cheap, and expensive when each step is a memory stall.
