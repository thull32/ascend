---
lesson: probability-for-engineers
source: 8f918e04d0180ca0
fit: partial
desk:
  - "The one-line proof of linearity of expectation, and the randomised quicksort derivation"
  - "The birthday product traced for five people, and the square-root closed form derived"
  - "The reservoir sampling proofs for k equal to 1 and for general k, and the worked trace"
  - "The balls-into-bins maximum-load argument and the sampling-methods table"
  - "Exercises: the birthday threshold, reservoir sampling made deterministic"
---
## Introduction

A service generates random 64-bit request IDs. A load balancer sends each request to a random backend. A hash table picks a bucket by hashing, a quicksort picks a random pivot, a monitoring pipeline keeps one event in a thousand, and a client retries a flaky call. Every one of those is a bet. The senior question is not "can it go wrong?" It can. The question is how often, and how badly.

Answering that takes a small amount of probability used precisely. How many random 32-bit IDs can you issue before a collision is more likely than not? About 77 thousand, not two billion. And why is sending each request to the less loaded of two random servers exponentially better than one?

Five ideas: linearity of expectation, the birthday bound, the two kinds of randomised algorithm, reservoir sampling, and balls into bins. Then the tail arithmetic of fan-out.

## Expectation and linearity

The expected value of a random quantity is its probability-weighted average. A fair die averages 3.5.

The property that makes expectation useful is linearity. The expectation of a sum is the sum of the expectations, always, even when the pieces are dependent. That lets you split a complicated quantity into on-off indicators, one per event, and just add their probabilities.

Here is the classic use. Insert n keys into m buckets with a uniform hash. There are n choose 2 pairs of keys, and each pair lands in the same bucket with probability one over m. So the expected number of colliding pairs is about n squared over 2m. Tiny check: 4 keys into 3 buckets is 6 pairs, each colliding with probability a third, so expect 2. Now a million files fingerprinted with a 32-bit checksum: about 116 pairs of different files with the same fingerprint. That is why deduplicating by a 32-bit hash merges files that differ.

The same one-liner proves chained hash tables are fast. The key you look up has about the load factor's worth of other keys in its bucket, on average.

Expected retries. If each attempt succeeds with probability p, the expected number of attempts is one over p. At 90 percent success, about 1.11 attempts. At 50 percent, 2. At 10 percent, 10.

That gives you retry amplification. If every client retries until success, the dependency sees one over p times its normal load. A dependency that degrades from 99 percent to 50 percent success suddenly gets double the traffic, which pushes its success lower, which multiplies the traffic again. That is the retry storm. With a cap of 3 retries at 50 percent, expected attempts are 1 plus a half plus a quarter plus an eighth, 1.875, and end-to-end success is about 94 percent. Which is why retries come with a budget, about 10 percent of first attempts, backoff with jitter, and a circuit breaker.

And randomised quicksort, by the same trick, makes about 1.39 n log n comparisons on every input. No input can be bad on average, because the randomness lives in the pivots, not in the data.

## The birthday bound

Draw values uniformly from a space of size N. When do two collide? Start from the chance they are all different. The second value avoids the first, the third avoids both, and so on, multiplying.

For birthdays, 23 people give just over a 50 percent chance of a shared birthday, and 57 people give 99 percent. Intuition says around 180. The truth is 23, because what matters is the number of pairs, and 23 people make 253 pairs.

The closed form is the sentence to keep: collisions become likely at the square root of the space size. The 50 percent point is about 1.18 times the square root of N. For a 32-bit space, that is about 77 thousand. For 64 bits, about 5 billion, and a 1 percent chance at around 600 million. A version 4 UUID has 122 random bits, which puts the first expected collision beyond anything you will ever generate.

Now try one. A system tags each in-flight request with a random 32-bit ID and typically has 100 thousand requests in flight. How likely is a collision at any given moment?

[pause]

About 69 percent. That is not a corner case; it is the steady state. Traces merge unrelated requests, and a cache keyed by request ID serves the wrong response. The tempting answer, 100 thousand over 4 billion, is the chance that one specific new ID collides, not that any pair does. "The ID space is 2 to the 32" and "we can safely issue 2 to the 32 IDs" are very different claims, and "use a UUID" is the right answer far more often than "design a coordination scheme".

## Two kinds of randomised algorithm

An interviewer will want to know which kind you are proposing.

Las Vegas algorithms are always correct, and their running time is random. Randomised quicksort, quickselect, and hash tables with a randomly seeded hash. The seed stops an adversary from choosing colliding keys in advance. When a Las Vegas algorithm fails, it looks like a slow run.

Monte Carlo algorithms have a fixed running time and are correct with high probability. A Bloom filter says definitely absent or probably present. Miller-Rabin primality testing has an error of at most one in 4 to the k after k rounds, one in a trillion at 20 rounds. HyperLogLog counts distinct elements to within about 2 percent in 1.5 kilobytes. When a Monte Carlo algorithm fails, it is a wrong answer that looks right. Fine for cache admission, analytics or dedup hints; never for billing or authorisation.

And Monte Carlo error can grow silently. A Bloom filter sized for a million keys at 1 percent, holding ten million, has a false-positive rate over 99 percent. Measure it in production and alarm on fill.

## Reservoir sampling

The problem: a stream of unknown length passes once, and you must keep a uniform random sample of k items in memory proportional to k. Picking a random line from a huge file is the same problem.

The algorithm. Keep the first k items. For the i-th item after that, draw a random number from 1 to i. If it lands at k or below, replace that slot with the new item. Otherwise, skip it.

Why is that uniform? Take k equal to 1. Before I give the argument: the first item starts as the sample with certainty. Does that make it more likely to be the final sample than the last item?

[pause]

No. The first item survives the second with probability one half, the third with two thirds, the fourth with three quarters, and so on up to n minus 1 over n. Multiply those together and everything cancels except one over n, the same as every other item. The product telescopes, and the algorithm never needed to know n. The general proof, where every item ends with probability k over n, uses the same telescoping product; work it through at your desk.

The production failure here is a biased sample. "The first 1,000 events of each hour", or every m-th item on a periodic stream, over-represents some slice. Use a per-event coin when the sample size can vary, a reservoir when you need exactly k, and a hash of the ID when the same entities must be sampled consistently across systems.

## Balls into bins

Throw n balls into n bins at random. The average bin holds one. How many are empty, and how full is the fullest?

Empty first. Each bin misses every ball with probability approaching one over e, about 37 percent. Uniform random leaves a third of your servers idle at any instant.

The fullest bin holds about log n over log log n. Simulated, 10 thousand balls in 10 thousand bins gave a maximum of 7, and a million gave 9. That is the busiest hash bucket at load factor 1, the busiest backend under a random load balancer, and the busiest partition under a uniform hash. And your tail latency is the tail of that bin.

Now the result every load-balancer designer knows. Pick two random bins and put the ball in the less full one. The maximum falls to 3 at 10 thousand and 4 at a million: doubly logarithmic, about 4 for any n you will meet. The mechanism: for a bin to climb a level, both sampled bins must already be at the level below. So the fraction at each level is roughly the square of the fraction below, and squaring at every step runs out of levels fast.

This is the power of two choices. Nginx, Envoy's least-request balancer and HAProxy all use it. True least-connections, choosing among all servers, is only marginally better and needs an up-to-date global view of load. Two random probes get almost all the benefit with local counters, and degrade gracefully when the load information is stale.

## Tails, fan-out and hedging

A backend is slow on 1 percent of requests. A user request fans out to 100 backends and waits for all of them. The chance at least one is slow is one minus 0.99 to the 100th, about 63 percent. The backend's 99th percentile has become the frontend's median.

The fix is hedged requests: send a second copy after the 95th percentile delay and take whichever answers first. If slowness is independent, both copies are slow with probability p squared, so a 1 percent tail becomes 0.01 percent, for at most 5 percent extra load. One warning: correlated failures, the same rack, the same deploy, the same bad input, make these products an underestimate, sometimes wildly.

## In the interview

Here is a follow-up the lesson expects. Why not use true least-connections instead of two random choices?

[pause]

Least-connections needs an accurate global view of every backend's load, which is stale or expensive at scale. Two random probes get a maximum load of order log log n, within a small constant of the global optimum, using only local counters, and they are robust to stale information because the choice only has to beat random. The wrong answer is that two choices is a cheap approximation that is much worse. The gap from one choice to two is exponential; from two to all, marginal.

And another: how many random 64-bit IDs before a 1 percent collision chance? The square root of 2 times N times p: about 600 million. One in a million, about 6 million. If the system will ever issue more, use 128 bits. The wrong answer is "billions, it's 64 bits", which confuses the space with its square root.

## Recap

Five things to remember. Linearity of expectation needs no independence, and gives expected collisions of about n squared over 2m in one line. Collisions become likely at the square root of the space, so 32-bit IDs collide by 77 thousand. Retries multiply load by one over p, so they need a budget, jitter and a breaker. Reservoir sampling is uniform because the survival odds telescope to k over n. And two random choices cut the busiest bin from about log n over log log n to about 4, while fan-out turns a 1 percent tail into a 63 percent one unless you hedge.

At your desk: the linearity and quicksort derivations, the birthday product and its closed form, the reservoir proofs and trace, the balls-into-bins argument, and the two exercises.
