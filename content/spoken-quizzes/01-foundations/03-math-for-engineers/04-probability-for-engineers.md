---
lesson: probability-for-engineers
source: 43f6e043be910b00
---
## 1

A system tags requests with random 32-bit IDs and typically has 100 thousand requests in flight. Roughly how likely is it that two in-flight requests share an ID at a given moment?

A, about 1 percent, since 32 bits is ample for 100 thousand IDs. B, about 0.002 percent, since 100 thousand over 2 to the 32 is tiny. C, zero until 2 to the 32 requests have been issued. D, about 70 percent, since the number of pairs grows as n squared.

[think]

The answer is D: about 70 percent, since the number of pairs grows as n squared.

Collisions depend on pairs, not draws. The birthday bound gives one minus e to the minus 1.16, about 69 percent, for 100 thousand IDs in a 32-bit space. The tempting second answer is the chance that one specific new ID collides, not that any pair does.

## 2

You insert 10 thousand keys into a hash table with 10 thousand buckets, using a uniform hash. Which statement about the fullest bucket is right?

A, it holds exactly 1 key, since the load factor is 1. B, it holds about the square root of n keys, around 100 here. C, it holds about 5 to 7 keys, like log n over log log n. D, it holds about 2 keys, twice the average load.

[think]

The answer is C: about 5 to 7 keys, like log n over log log n.

Placing n balls uniformly into n bins gives a maximum load of order log n over log log n, with high probability, and a simulation at 10 thousand gave 7. The average is 1, but the maximum is what sets the worst-case probe length. The square root of n is far too large.

## 3

Why is picking the less loaded of two random servers so much better than picking one random server?

A, it makes the load on every server exactly equal. B, it is not better: it only adds an extra round trip. C, the maximum load falls from about log n over log log n to about log log n. D, it halves the number of requests each server receives.

[think]

The answer is C: the maximum load falls from about log n over log log n to about log log n.

For a server to reach the next load level, both sampled servers must already be at the level below, so the fraction at each level is the square of the one below. That is doubly exponential decay: a maximum of about 4 for any realistic n. Simulated at a million, it was 4 with two choices against 9 with one. The total number of requests is unchanged, and the load is not exactly equal, only far tighter.

## 4

In reservoir sampling with a sample of one, the i-th item replaces the current sample with probability one over i. After n items, why does the first item still have probability one over n of being the sample?

A, because it starts at probability 1, and is rarely replaced. B, because the algorithm re-randomises the sample at the end. C, it does not: earlier items are more likely to be kept. D, because its survival odds, i minus 1 over i at each step, telescope to one over n.

[think]

The answer is D: because its survival odds, i minus 1 over i at each step, telescope to one over n.

The first item is kept at the start, with probability 1, and survives each later item i with probability 1 minus one over i. The product, one half times two thirds times three quarters, and so on up to n minus 1 over n, telescopes to one over n, matching every other item. Starting at probability 1 does not make it favoured, and no final pass is needed.

## 5

A user request waits on 50 backends, and each one independently exceeds its latency target on 2 percent of calls. What fraction of user requests exceed the target?

A, about 100 percent. B, about 2 percent. C, about 4 percent. D, about 64 percent.

[think]

The answer is D: about 64 percent.

The chance that at least one backend is slow is one minus 0.98 to the 50th, which is about one minus one over e, or 63 percent. Fan-out turns a per-backend tail into a front-end median, which is why hedged requests and per-backend deadlines exist.

## 6

A dependency's success rate drops from 99 percent to 50 percent, and every client retries until it succeeds. What happens to the load the dependency receives?

A, it rises by 50 percent, one retry for each failed first attempt. B, it falls, since clients back off after the first failure. C, it is unchanged, because retries replace failed requests. D, it doubles, since the expected attempts per request are one over p, which is 2.

[think]

The answer is D: it doubles, since the expected attempts per request are one over p, which is 2.

The number of attempts until success is geometric, with a mean of one over p, so at a success rate of one half each request costs two attempts on average. As the rate falls further, the multiplier grows, to 10 times at one in ten: that is the retry storm. Backoff delays the retries but does not remove them; only a retry budget or a circuit breaker caps the multiplier.
