---
slug: probability-for-engineers
title: "Probability for engineers: expectation, birthdays, sampling and load"
description: Expected value and linearity applied to hash collisions, retries and randomised quicksort, the birthday bound derived and checked against simulation, reservoir sampling with the full proof for any k, the balls-into-bins result behind load balancing and why two random choices beat one exponentially, and the tail arithmetic of fan-out and hedged requests.
minutes: 60
difficulty: medium
tags: [math, probability, expected-value, birthday-paradox, reservoir-sampling, load-balancing, power-of-two-choices]
problems: [insert-delete-getrandom, kth-largest-array]
---
A service generates random 64-bit request IDs. A load balancer sends each request to a random backend. A hash table picks a bucket by hashing. A quicksort picks a pivot at random. A monitoring pipeline keeps a sample of one in a thousand events. A client retries a flaky call. Every one of those is a bet, and the question a senior engineer must answer is not "can it go wrong?" (it can) but "how often, and how badly?"

Answering that needs a small amount of probability used precisely: expected value, one product formula, one approximation, and a handful of results that recur in hashing, sampling, retries and load balancing. How many random 32-bit IDs can you issue before a collision is more likely than not (about 77,000, not two billion)? Why is sending each request to the less loaded of *two* random servers exponentially better than one? Every claim here is derived, and the important ones are checked against a simulation you can rerun.

## Expected value and why linearity is the whole trick

The expected value of a random quantity $X$ is its probability-weighted average: $E[X] = \sum_x x \cdot P(X = x)$. A fair die has $E = (1 + 2 + 3 + 4 + 5 + 6)/6 = 3.5$.

The property that makes expectation useful in engineering is **linearity**: $E[X + Y] = E[X] + E[Y]$, *always*, even when $X$ and $Y$ are dependent. The proof is one line: $\sum_{x,y} (x + y) P(x, y) = \sum_x x \sum_y P(x, y) + \sum_y y \sum_x P(x, y) = E[X] + E[Y]$; the joint distribution never needed to factor. That lets you compute the expectation of a complicated quantity by splitting it into indicator variables (1 if an event happens, 0 if not) and adding their probabilities.

**Worked example: expected collisions in a hash table.** Insert $n$ keys into $m$ buckets with a uniform hash. There are $\binom{n}{2}$ pairs of keys (the [combinatorics lesson](/learn/foundations/math-for-engineers/counting-and-combinatorics) is where that count comes from), and each pair lands in the same bucket with probability $1/m$. Define $X_{ij} = 1$ if pair $(i, j)$ collides; the number of colliding pairs is $\sum X_{ij}$, and by linearity

$$E[\text{colliding pairs}] = \binom{n}{2} \cdot \frac{1}{m} \approx \frac{n^2}{2m}.$$

Check it small: 4 keys into 3 buckets, 6 pairs, each colliding with probability $1/3$: expect 2 colliding pairs. For $n = 1{,}000$ keys in $m = 1{,}000$ buckets: about 500. For a million files fingerprinted with a 32-bit CRC ($m = 2^{32}$): $10^{12} / (2 \cdot 4.3 \times 10^9) \approx 116$ pairs of *distinct* files with the same fingerprint, which is why deduplication by 32-bit hash merges files that differ. With a 64-bit hash the expectation is $2.7 \times 10^{-8}$; with 128 bits, negligible. That the pairs are not independent (if $a$ collides with $b$ and $b$ with $c$, then $a$ collides with $c$) does not matter; linearity does not need independence.

**Worked example: expected chain length.** The key you look up hashes to some bucket; each of the other $n - 1$ keys is in that bucket with probability $1/m$. Expected number of other keys in your chain: $(n - 1)/m \approx \alpha$, the load factor. That single line is the proof that chained hash tables have $O(1 + \alpha)$ expected lookups, which the [hash tables lesson](/learn/data-structures/hashing/hash-tables) builds on.

**Worked example: expected retries.** An operation succeeds with probability $p$ on each independent attempt. The number of attempts until the first success is geometric: $P(K = k) = (1 - p)^{k-1} p$, and $E[K] = \sum_k k (1-p)^{k-1} p = 1/p$ (differentiate the geometric series, or argue: one attempt, then with probability $1 - p$ you start over, so $E = 1 + (1 - p) E$). Simulated with 200,000 trials: $p = 0.9$ gives 1.11 attempts on average, $p = 0.5$ gives 2.00, $p = 0.1$ gives 10.00. The tail is $P(K > k) = (1 - p)^k$: at $p = 0.5$, one request in a thousand needs more than ten tries (simulated: 0.00104; formula: $2^{-10} = 0.00098$).

The engineering consequence is **retry amplification**: if every client retries until success, the dependency sees $1/p$ times the offered load. A dependency that degrades from $p = 0.99$ to $p = 0.5$ suddenly receives double the traffic, which pushes $p$ lower, which multiplies the traffic again. With a cap of 3 retries (4 attempts) at $p = 0.5$: expected attempts $1 + 0.5 + 0.25 + 0.125 = 1.875$, end-to-end success $1 - 0.5^4 = 93.75\%$. This is why retries come with a *budget* (a common rule is that retries may be at most about 10% of first attempts), exponential backoff with jitter, and a circuit breaker that stops sending when $p$ collapses.

**Worked example: randomised quicksort.** Why is its expected cost $O(n \log n)$ on every input? Label the elements by sorted rank $1..n$. Elements $i < j$ are compared exactly when the first pivot chosen from the range $i..j$ is $i$ or $j$ itself (any other pivot from that range separates them for good). That first pivot is uniform over the $j - i + 1$ candidates, so $P(\text{compared}) = 2/(j - i + 1)$. Sum over pairs by linearity:

$$E[\text{comparisons}] = \sum_{i<j} \frac{2}{j - i + 1} \le \sum_{i=1}^{n} \sum_{d=1}^{n} \frac{2}{d} \approx 2n \ln n \approx 1.39\, n \log_2 n.$$

No input can be bad on average, because the randomness is in the pivots, not the data.

## The birthday bound

Draw $n$ values uniformly from a space of size $N$. What is the probability that two are equal?

Start from the probability that they are *all different*. The first value is free. The second avoids the first with probability $(N - 1)/N$. The third avoids both with probability $(N - 2)/N$. So

$$P(\text{no collision}) = \prod_{i=0}^{n-1} \frac{N - i}{N} = \prod_{i=0}^{n-1}\left(1 - \frac{i}{N}\right).$$

Trace it for five people and $N = 365$:

| Person | Must avoid | Factor | Running product |
|---|---|---|---|
| 1 | nothing | $365/365 = 1$ | 1.0000 |
| 2 | 1 date | $364/365$ | 0.9973 |
| 3 | 2 dates | $363/365$ | 0.9918 |
| 4 | 3 dates | $362/365$ | 0.9836 |
| 5 | 4 dates | $361/365$ | 0.9729 |

So five people share a birthday with probability $2.7\%$; continuing the product to 23 people gives $0.4927$, a $50.7\%$ chance of a shared birthday (simulated: 0.504 over 100,000 trials). With 57 people it is 99%. Intuition says you need around 180; the truth is 23, because what matters is the number of *pairs*, $\binom{23}{2} = 253$, not the number of people.

For engineering you want the closed form. Using $1 - x \approx e^{-x}$ for small $x$ (the first term of the Taylor series, accurate to within $x^2/2$):

$$P(\text{no collision}) \approx \exp\left(-\sum_{i<n} \frac{i}{N}\right) = \exp\left(-\frac{n(n-1)}{2N}\right) \approx e^{-n^2 / 2N}.$$

Set that to $1/2$ and solve: the 50% point is at $n \approx \sqrt{2 \ln 2 \cdot N} \approx 1.18\sqrt{N}$. For a small target probability $p$, $n \approx \sqrt{2Np}$. **Collisions become likely at the square root of the space size.** That is the whole birthday paradox, and it is why "the ID space is $2^{32}$" and "we can safely issue $2^{32}$ IDs" are very different claims.

| Space | $N$ | 50% collision at $1.18\sqrt{N}$ | 1% at $\sqrt{0.02N}$ | 1-in-a-million at $\sqrt{2N \cdot 10^{-6}}$ |
|---|---|---|---|---|
| 32-bit | $4.3 \times 10^9$ | ≈ 77,000 | ≈ 9,300 | ≈ 93 |
| 64-bit | $1.8 \times 10^{19}$ | ≈ 5.1 × 10⁹ | ≈ 6.1 × 10⁸ | ≈ 6.1 × 10⁶ |
| 122 random bits (UUIDv4) | $5.3 \times 10^{36}$ | ≈ 2.7 × 10¹⁸ | ≈ 3.3 × 10¹⁷ | ≈ 3.3 × 10¹⁵ |
| 160-bit (SHA-1) | $1.5 \times 10^{48}$ | ≈ 1.4 × 10²⁴ | | |
| 256-bit (SHA-256) | $1.2 \times 10^{77}$ | ≈ 4 × 10³⁸ | | |

Read the 32-bit row twice. A system that tags each in-flight request with a random 32-bit ID and has 100,000 requests in flight has a collision probability of $1 - e^{-10^{10}/(2 \cdot 4.3 \times 10^9)} \approx 1 - e^{-1.16} \approx 69\%$ at any moment. That is not a corner case; it is the steady state. Sixty-four bits gives you hundreds of millions of IDs before a 1% collision chance, and 128 bits (a UUID) puts the first expected collision beyond anything you will ever generate, which is why "use a UUID" is the right answer far more often than "design a coordination scheme".

The same bound governs hash functions: a 32-bit hash of $n$ objects will have a colliding pair by $n \approx 77{,}000$; a 64-bit hash is safe to hundreds of millions; a 128-bit hash to $10^{18}$. Git's move from SHA-1 to SHA-256 is about *adversarial* collisions, which are cheaper for the attacker than the birthday bound (SHA-1's are now practical), but the birthday bound is the floor even against a random adversary.

```python
def people_for_collision(days: int, p: float) -> int:
    """Smallest n such that P(some pair shares a value among n draws) >= p."""
    n, no_collision = 1, 1.0
    while True:
        n += 1
        no_collision *= (days - (n - 1)) / days   # the n-th draw avoids n-1 taken values
        if 1 - no_collision >= p or n > days:     # pigeonhole guarantees n = days + 1
            return n

people_for_collision(365, 0.5)    # 23
people_for_collision(2**32, 0.5)  # 77164
```

The loop terminates because `no_collision` reaches 0 at $n = \text{days} + 1$ (the factor becomes zero), and the explicit `n > days` guard makes that visible.

## Randomised algorithms

There are two kinds, and an interviewer will want to know which one you are proposing.

**Las Vegas**: always correct, running time is random. Randomised quicksort is the standard example (expected $1.39\, n \log_2 n$ comparisons on every input, derived above); quickselect for [Kth Largest Element](/practice/kth-largest-array) is the same idea with expected $O(n)$; hash tables with a randomly seeded hash are Las Vegas, always correct and expected $O(1)$, with the seed preventing an adversary from choosing colliding keys in advance.

**Monte Carlo**: fast, and correct with high probability. A Bloom filter says "definitely absent" or "probably present", with a false-positive rate you choose by sizing. Rabin–Karp without verification is Monte Carlo. Miller–Rabin primality testing has error $\le 4^{-k}$ after $k$ rounds, which at $k = 20$ is one in a trillion, below the probability of a hardware fault during the computation. HyperLogLog counts distinct elements to within about 2% using 1.5 KB of state. The [probabilistic structures module](/learn/advanced-data-structures/probabilistic-structures/bloom-filters) covers these in depth.

| | Las Vegas | Monte Carlo |
|---|---|---|
| Output | always correct | correct with probability $1 - \varepsilon$ |
| Running time | random, bounded in expectation | fixed |
| What you tune | nothing; the randomness is internal | $\varepsilon$, via memory or rounds |
| Failure looks like | a slow run | a wrong answer that looks right |
| Examples | quicksort, quickselect, seeded hashing | Bloom filter, HyperLogLog, Miller–Rabin, sketches |
| Acceptable for | anything | cache admission, dedup hints, analytics, primality; never billing or authorisation |

The engineering judgement is whether the application tolerates the error, and a senior engineer states which kind they are building and its error rate.

## Reservoir sampling

The problem: a stream of unknown length passes by once, and you must keep a uniform random sample of $k$ items using $O(k)$ memory. Log sampling, A/B bucketing of a live stream, "pick a random line from a huge file", and the interview question "pick a random index of a given value in one pass" all reduce to it.

Algorithm R: keep the first $k$ items. For the $i$-th item (1-indexed, $i > k$), pick a random integer $j$ in $[1, i]$; if $j \le k$, replace slot $j$ with the new item.

```python
import random

def reservoir_sample(stream, k: int) -> list:
    reservoir = []
    for i, item in enumerate(stream, start=1):
        if i <= k:
            reservoir.append(item)
        else:
            j = random.randint(1, i)        # uniform in [1, i]
            if j <= k:
                reservoir[j - 1] = item     # replace a uniformly chosen slot
    return reservoir
```

**Proof for $k = 1$.** Claim: after $n$ items, each item is the sample with probability exactly $1/n$. Item $i$ is chosen when it arrives with probability $1/i$. It survives item $i + 1$ with probability $1 - 1/(i+1) = i/(i+1)$, survives item $i + 2$ with probability $(i+1)/(i+2)$, and so on:

$$P(\text{item } i \text{ is the final sample}) = \frac{1}{i} \cdot \frac{i}{i+1} \cdot \frac{i+1}{i+2} \cdots \frac{n-1}{n} = \frac{1}{n}.$$

The product telescopes, and the algorithm never needed to know $n$.

**Proof for general $k$.** Item $i > k$ enters the reservoir with probability $k/i$ (its draw $j$ lands in $[1, k]$). A later item $m > i$ evicts it only if $m$'s draw lands in $[1, k]$ (probability $k/m$) *and* hits its particular slot (probability $1/k$ given that), so item $i$ survives item $m$ with probability $1 - 1/m = (m-1)/m$. Multiply:

$$P(\text{item } i \text{ survives}) = \frac{k}{i} \cdot \frac{i}{i+1} \cdot \frac{i+1}{i+2} \cdots \frac{n-1}{n} = \frac{k}{n}.$$

The first $k$ items enter with probability 1 and survive with the same telescoping product from $k + 1$ onward: $k/n$ as well. Every item ends up in the sample with probability $k/n$. Simulated with $n = 10$, $k = 3$, 200,000 runs: every item's inclusion rate was between 0.297 and 0.301, against the exact 0.3.

Worked trace, $k = 2$, stream `[10, 20, 30, 40, 50]`, with the "random" draws for items 3, 4, 5 being $j = 2, 4, 1$: after items 1–2 the reservoir is `[10, 20]`. Item 3 (30), $j = 2 \le 2$: replace slot 2, reservoir `[10, 30]`. Item 4 (40), $j = 4 > 2$: skip. Item 5 (50), $j = 1 \le 2$: replace slot 1, reservoir `[50, 30]`.

Two production notes. Algorithm R draws one random number per item, which at millions of events per second is the dominant cost; **Algorithm L** instead computes how many items to *skip* before the next replacement (the gap is geometrically distributed, with the parameter shrinking as $i$ grows), needing only $O(k \log(n/k))$ random numbers in total. **Weighted sampling** (keep items with probability proportional to a weight) has its own reservoir algorithm (Efraimidis–Spirakis: assign each item the key $u^{1/w}$ for uniform $u$, keep the top $k$ keys), which is how weighted log sampling and priority sampling are implemented.

| Method | Needs $n$ in advance | Exact sample size | Memory | Random draws | Weighted |
|---|---|---|---|---|---|
| Bernoulli (`random() < p` per item) | no | no, binomial around $pn$ | $O(pn)$ | $n$ | via per-item $p$ |
| Reservoir R | no | yes, $k$ | $O(k)$ | $n$ | no |
| Reservoir L | no | yes, $k$ | $O(k)$ | $O(k \log(n/k))$ | no |
| Efraimidis–Spirakis | no | yes, $k$ | $O(k)$ plus a heap | $n$ | yes |
| Systematic (every $m$-th item) | yes, to set $m$ | yes | $O(n/m)$ | 1 | no; biased if the stream is periodic |

## Balls into bins: load balancing math

Throw $n$ balls into $n$ bins uniformly at random. The average bin holds one ball. How full is the *fullest* bin, and how many bins are empty?

Empty first, because it is one line: a bin misses all $n$ balls with probability $(1 - 1/n)^n \to 1/e \approx 36.8\%$. Simulated with $n = 10^6$: 36.8% of bins empty. "Uniform random" leaves a third of the servers idle at any instant.

The fullest bin is about $\ln n / \ln \ln n$. The argument: a bin receives at least $k$ balls with probability at most $\binom{n}{k} n^{-k} \le 1/k!$; there are $n$ bins, so the expected number of bins with load $\ge k$ is at most $n/k!$, which drops below 1 when $k! \approx n$, and $k! \approx n$ solves to $k \approx \ln n / \ln \ln n$. Simulated: $n = 10^4$ gives a maximum load of 7; $n = 10^6$ gives 9 (the formula gives 4.2 and 5.3; the constant is a little above 1). That is the busiest bucket of a hash table at load factor 1, the busiest backend when a random load balancer spreads $n$ requests across $n$ servers, and the busiest partition when keys are hashed uniformly. The tail latency of the system is the tail of that bin.

Now the result every load-balancer designer knows. Pick **two** random bins and put the ball in the less full one. Simulated: maximum load 3 at $n = 10^4$ and 4 at $n = 10^6$, against 7 and 9 for one choice. Formally the maximum drops to $\ln \ln n / \ln 2 + O(1)$: doubly logarithmic, about 4 for any $n$ you will meet. The mechanism: for a bin to reach load $k + 1$, *both* sampled bins must already have load $\ge k$, so the fraction of bins at each level is roughly the *square* of the fraction at the level below. Squaring at every step is doubly exponential decay, and the levels run out after $\log \log n$ steps.

This is "the power of two choices", and it is the algorithm behind Nginx's `random two least_conn`, Envoy's least-request balancer (which samples two hosts by default) and HAProxy's `random` balancer (two draws by default). Choosing among *all* $n$ servers (true least-connections) is only marginally better than two and needs an up-to-date global view of load; two random probes get almost all the benefit with none of the coordination, and they degrade gracefully when load information is stale.

```viz
{"type": "network", "scenario": "load-balancer-least-conn", "title": "Least-loaded routing", "caption": "Each request goes to a backend with fewer active connections. Sampling two backends at random and picking the emptier one gets almost all of this benefit with no global view of the load."}
```

The same idea appears in hashing: two-choice hashing bounds the longest chain at $O(\log \log n)$ instead of $O(\log n / \log \log n)$, and cuckoo hashing goes further, giving every key exactly two candidate slots so that a lookup probes at most two.

## Tails, fan-out and hedging

A single backend is slow (over its latency target) on 1% of requests. A user-facing request fans out to 100 backends and waits for all of them. What fraction of user requests are slow?

$$P(\text{at least one slow}) = 1 - 0.99^{100} \approx 1 - e^{-1} \approx 63\%.$$

Simulated: 63.4%. The backend's p99 has become the frontend's *median*. That is the "tail at scale" problem, and it is why fan-out systems use **hedged requests** (send a second copy after the p95 delay, take the first response), tied requests, and per-backend deadlines. The hedge's arithmetic: if slowness is independent across replicas, both copies are slow with probability $p^2$, so a 1% tail becomes 0.01%, at the cost of at most 5% extra load (only the slowest 5% of requests are hedged). The general formula $1 - (1 - p)^n \approx np$ for small $np$, and $\approx 1 - e^{-np}$ otherwise, is the same $1 - x \approx e^{-x}$ approximation as the birthday bound.

The same computation tells you that a batch job with 10,000 independent tasks each succeeding with probability 0.9999 fails about 63% of the time end to end, so retries are not optional, and that a monitor firing with a 0.1% false-positive rate per check, checked every minute, pages you about once a day.

## Under the hood: where the randomness comes from

**`random` is not `secrets`.** CPython's `random` module is a Mersenne Twister (MT19937): a 19,937-bit state, a period of $2^{19937} - 1$, excellent statistical properties, and *complete predictability* after observing 624 outputs. It is right for sampling, shuffling and simulations and wrong for tokens, session IDs or anything an attacker benefits from guessing; those use `secrets` or `os.urandom`, which read the operating system's cryptographic generator (on Linux, the `getrandom` system call). V8's `Math.random()` is xorshift128+, which [V8's own write-up](https://v8.dev/blog/math-random) says is not cryptographically secure; `crypto.getRandomValues` is the secure one. A UUIDv4 has 122 random bits, and Python's `uuid4` draws them from `os.urandom`.

**Uniform integers without modulo bias.** `rand() % n` is biased whenever the generator's range is not a multiple of $n$: with a 32-bit generator and $n = 3$, $2^{32} \bmod 3 = 1$, so the value $0$ gets one extra chance and is more likely than $1$ or $2$ by a relative $3 / 2^{32}$. Negligible for $n = 3$; not for $n$ near $2^{31}$. CPython's `randint` and `randrange` use rejection sampling on `getrandbits` (draw enough bits, reject values $\ge n$, repeat), which is exact.

**Seeded hashing.** CPython randomises `str` and `bytes` hashes per process with SipHash (the 1-3 variant since 3.11), keyed by a random seed at start-up, so that an attacker cannot precompute keys that collide in your dictionaries. Rust's `HashMap` uses SipHash-1-3 with random keys; Go gives every map its own random hash seed. That seed is what makes the hash table Las Vegas rather than a target.

**Two-choice balancers as implemented.** [Envoy's least-request policy](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers) samples two healthy hosts and compares their active-request counters, switching to a weighted round robin with load-adjusted weights when host weights differ; the counters are local to the proxy, so the "load" it sees is its own view, not the backend's global load, and the doubly logarithmic bound still holds because the choice only has to be *better than random*, not exact.

## Failure modes in production

**Request IDs colliding in flight.** *Symptom:* traces occasionally merge two unrelated requests; a cache keyed by request ID serves the wrong response. *Diagnosis:* 32-bit random IDs with $10^5$ in flight give a 69% collision probability at any moment (birthday bound). *Fix:* 64-bit IDs for in-flight scopes, 128-bit (UUID) for anything stored, and no arithmetic on the IDs in JavaScript.

**A retry storm.** *Symptom:* a dependency's success rate dips to 50%; within a minute its traffic doubles, its success rate drops further, and it collapses. *Diagnosis:* unbounded retries multiply load by $1/p$; at $p = 0.5$ that is 2×, at $p = 0.1$ it is 10×. *Fix:* a retry budget (retries capped at about 10% of first attempts), exponential backoff with full jitter so that retries do not synchronise, and a circuit breaker that fails fast when the dependency is down.

**A hot partition under a "uniform" hash.** *Symptom:* one Kafka partition or one shard runs at 5–9× the average, with a perfectly uniform hash. *Diagnosis:* balls into bins: with $n$ keys over $n$ partitions the busiest holds $\ln n / \ln \ln n$ times the average, and real key distributions are far more skewed than uniform. *Fix:* many more partitions than consumers (so the maximum load averages out), two-choice assignment for stateless work, and explicit splitting of known-hot keys.

**A biased sample.** *Symptom:* "a 0.1% sample of events" over-represents the morning, or the first tenants, or the first 1,000 events of each hour. *Diagnosis:* the sample was "the first $k$" or "every $m$-th" on a periodic stream, not uniform. *Fix:* Bernoulli sampling per event when a variable-size sample is fine, reservoir sampling when exactly $k$ are needed from an unknown $n$, and a hash-of-ID sample (`hash(id) mod 1000 == 0`) when the same entities must be sampled consistently across systems.

**A Monte Carlo structure whose error rate silently grew.** *Symptom:* a Bloom filter sized for one million keys at 1% is holding ten million, and its false-positive rate is over 99% (the standard formula with the original 9.6 bits and 7 hashes per key); the cache admission it guards has stopped admitting. *Diagnosis:* the error rate of a sketch is a function of its size and its fill; nobody monitored the fill. *Fix:* measure the false-positive rate in production (probe with keys known to be absent), alarm on fill, and resize or rotate.

## Exercises

```exercise
id: people-for-collision
title: The birthday threshold
prompt: |
  Values are drawn uniformly at random from a space of `space` distinct
  values. Return the smallest number of draws `n` (with `n >= 2`) such
  that the probability that some two draws are equal is at least `p`
  (`0 < p < 1`). Compute the exact product
  P(all different) = ∏ (1 - i/space) for i = 0..n-1, incrementally, and stop
  as soon as `1 - P(all different) >= p`. Floating-point is fine; the
  test thresholds are not within rounding error of a boundary.
languages: [python, javascript]
entry: people_for_collision
starter:
  python: |
    def people_for_collision(space, p):
        # your code here
        return 2
  javascript: |
    function people_for_collision(space, p) {
      // your code here
      return 2;
    }
tests:
  - args: [365, 0.5]
    expected: 23
    label: the classic birthday problem
  - args: [365, 0.99]
    expected: 57
  - args: [2, 0.5]
    expected: 2
    label: two draws from two values collide half the time
  - args: [10, 0.9]
    expected: 7
  - args: [1000, 0.5]
    expected: 38
  - args: [1048576, 0.5]
    expected: 1206
    hidden: true
    label: 2^20 space, about 1.18 * sqrt(N)
  - args: [4294967296, 0.5]
    expected: 77164
    hidden: true
    label: 32-bit IDs
hints:
  - "Keep a running product q of (space - i) / space; after the n-th draw, q is P(all n distinct)."
  - "Add one draw at a time and return n the first time 1 - q >= p."
```

```exercise
id: reservoir-sample
title: Reservoir sampling, made deterministic
prompt: |
  Implement Algorithm R. Keep the first `k` items of `stream`. For each
  later item at 0-based index `i` (so `i >= k`), the test supplies the
  "random" draw `draws[i - k]`, an integer in `[0, i]`. If the draw is
  less than `k`, replace `reservoir[draw]` with the item; otherwise skip
  it. Return the reservoir. If the stream has fewer than `k` items,
  return all of them in order.
languages: [python, javascript]
entry: reservoir_sample
starter:
  python: |
    def reservoir_sample(stream, k, draws):
        # your code here
        return []
  javascript: |
    function reservoir_sample(stream, k, draws) {
      // your code here
      return [];
    }
tests:
  - args: [[10, 20, 30, 40, 50], 2, [1, 3, 0]]
    expected: [50, 30]
    label: the worked trace
  - args: [[1, 2], 3, []]
    expected: [1, 2]
    label: stream shorter than k
  - args: [[7, 8, 9, 10], 1, [0, 2, 0]]
    expected: [10]
  - args: [[1, 2, 3, 4, 5, 6], 3, [3, 4, 5]]
    expected: [1, 2, 3]
    label: every draw misses, reservoir unchanged
  - args: [[], 2, []]
    expected: []
    hidden: true
    label: empty stream
  - args: [["a", "b", "c", "d"], 2, [0, 1]]
    expected: ["c", "d"]
    hidden: true
hints:
  - "Copy the first k items, then loop i from k to len(stream) - 1 using draws[i - k]."
  - "Only replace when the draw is strictly less than k."
```

## Interviewer follow-ups

**"How many random 64-bit IDs can we issue before the collision probability reaches 1%?"** *Model answer:* $n \approx \sqrt{2Np}$ with $N = 2^{64}$ and $p = 0.01$: about $6 \times 10^8$; for one in a million, about $6 \times 10^6$. If the system will ever issue more, use 128 bits. *Common wrong answer:* "billions, it's 64 bits", which confuses the space with its square root.

**"Prove reservoir sampling is uniform for general $k$."** *Model answer:* item $i$ enters with probability $k/i$ and survives each later item $m$ with probability $(m - 1)/m$; the product telescopes to $k/n$; the first $k$ items enter with probability 1 and get the same product. *Common wrong answer:* proving the $k = 1$ case and asserting "the same for $k$", or claiming later items are favoured.

**"Why not use true least-connections instead of two random choices?"** *Model answer:* least-connections needs an accurate global view of every backend's load, which is stale or expensive at scale; two random probes achieve a maximum load of $O(\log \log n)$, within a small constant of the global optimum, using only local counters, and they are robust to stale information because the choice only needs to beat random. *Common wrong answer:* "two choices is a cheap approximation that is much worse", when the gap from one choice to two is exponential and from two to all is marginal.

**"Our dependency is at 50% success and clients retry up to 3 times. What load does it see and what is the end-to-end success?"** *Model answer:* expected attempts per request $1 + 0.5 + 0.25 + 0.125 = 1.875$, so 1.875× the offered load; success $1 - 0.5^4 = 93.75\%$. Without a cap the load is $1/p = 2\times$ and rising as $p$ falls, which is the retry storm; I would add a retry budget and backoff with jitter. *Common wrong answer:* "retries fix it", with no number for the load they add.

**"Is a Bloom filter's false-positive rate a bug?"** *Model answer:* no, it is a Monte Carlo trade the structure makes explicitly; the rate is set by the bits per key and the number of hash functions, grows as the filter fills, and must be monitored; a Las Vegas alternative (an exact set) costs an order of magnitude more memory. *Common wrong answer:* "it's a hash set, so lookups are exact".

## What mid-level engineers get wrong

- **Sizing an ID space by its count rather than its square root.** $2^{32}$ IDs collide at 77,000.
- **Retrying without a budget.** Load multiplies by $1/p$ and the dependency being retried is the one least able to absorb it.
- **Expecting "uniform" to mean "even".** With $n$ balls in $n$ bins a third of the bins are empty and the fullest is several times the average.
- **Taking "the first 1,000" as a random sample.** Uniformity over a stream of unknown length needs reservoir sampling or a per-item coin.
- **Using `random` (or `Math.random`) for tokens.** Both are predictable from their outputs.
- **Promising a p99 without doing the fan-out arithmetic.** A 1% backend tail across 100 backends is a 63% frontend tail; hedging and deadlines are the fix, not a faster backend.
- **Multiplying probabilities that are not independent.** Correlated failures (same rack, same deploy, same bad input) make $1 - (1 - p)^n$ an underestimate, sometimes wildly.

## Senior signals

- You quote the birthday bound: collisions are likely at $\sqrt{N}$, so 32-bit random IDs collide within ~77,000 draws and 64-bit within ~5 billion (1% at $6 \times 10^8$); you choose UUIDs by arithmetic, not habit.
- You use linearity of expectation to get results like "expected collisions $\approx n^2/2m$" and "randomised quicksort makes $2n \ln n$ comparisons" in a few lines, and you know it holds without independence.
- You compute retry amplification ($1/p$ uncapped; $1 + q + q^2 + \cdots$ capped) before proposing retries, and you pair retries with a budget, jittered backoff and a breaker.
- You distinguish Las Vegas from Monte Carlo, state the error rate of anything Monte Carlo you propose, and monitor it in production.
- You can prove reservoir sampling uniform for general $k$ with the telescoping product, and you know the skip-ahead and weighted variants exist and when they matter.
- You know that uniform random placement gives a max load of $\Theta(\log n / \log \log n)$ and a third of bins empty, that two random choices cut the max to $\Theta(\log \log n)$, and you can name a load balancer that uses it.
- You compute $1 - (1 - p)^n$ for fan-out before promising a latency SLO, and you reach for hedged requests with the $p^2$ arithmetic and the 5% load cost stated.

## Check yourself

```quiz
- q: >-
    A system tags requests with random 32-bit IDs and typically has 100,000 requests in flight. Roughly how likely is it that two in-flight requests share an ID at a given moment?
  options: ["About 1%, since 32 bits is ample for 10^5 IDs", "About 0.002%, since 100,000 / 2^32 is tiny", "Zero until 2^32 requests have been issued", "About 70%, since the pair count grows as n^2"]
  answer: 3
  explanation: >-
    Collisions depend on pairs, not draws: 1 - exp(-n^2 / 2N) with n = 10^5 and N ≈ 4.3 × 10^9 gives 1 - e^(-1.16) ≈ 0.69. The tempting first answer is the chance that one specific new ID collides, not that any pair does.
- q: >-
    You insert 10,000 keys into a hash table with 10,000 buckets using a uniform hash. Which statement about the fullest bucket is right?
  options: ["It holds exactly 1 key, since the load factor is 1", "It holds about sqrt(n) keys, around 100 here", "It holds about 5 to 7 keys, like ln n / ln ln n", "It holds about 2 keys, twice the average load"]
  answer: 2
  explanation: >-
    Uniform placement of n balls into n bins gives a maximum load of Θ(log n / log log n) with high probability, which simulated at 7 for n = 10^4. The average is 1 but the maximum is what sets the worst-case probe length; sqrt(n) is far too large.
- q: >-
    Why is picking the less-loaded of two random servers so much better than picking one random server?
  options: ["It makes the load on every server exactly equal", "It is not better; it only adds an extra round trip", "Max load falls from log n / log log n to log log n", "It halves the number of requests each server receives"]
  answer: 2
  explanation: >-
    For a server to reach load k + 1 both sampled servers must already be at k, so the fraction at each level is the square of the level below: doubly exponential decay, a maximum of about 4 for any realistic n (simulated: 4 at n = 10^6 against 9 for one choice). The total request count is unchanged and the load is not exactly equal, only far tighter.
- q: >-
    In reservoir sampling with k = 1, the i-th item replaces the current sample with probability 1/i. After n items, why does the first item still have probability 1/n of being the sample?
  options: ["Because it starts at probability 1 and is rarely replaced", "Because the algorithm re-randomises the sample at the end", "It does not; earlier items are more likely to be kept", "Because the survival odds (i-1)/i telescope to 1/n"]
  answer: 3
  explanation: >-
    The first item is kept initially (probability 1) and survives each later item i with probability 1 - 1/i = (i-1)/i. The product 1 × (1/2) × (2/3) × ... × ((n-1)/n) telescopes to 1/n, matching every other item. Starting at probability 1 does not make it favoured, and no final pass is needed.
- q: >-
    A user request waits on 50 backends, each of which exceeds its latency target on 2% of calls independently. What fraction of user requests exceed the target?
  options: ["About 100%", "About 2%", "About 4%", "About 64%"]
  answer: 3
  explanation: >-
    P(at least one slow) = 1 - 0.98^50 ≈ 1 - e^(-1) ≈ 63%. Fan-out turns a per-backend tail into a front-end median, which is why hedged requests and per-backend deadlines exist.
- q: >-
    A dependency's success rate drops from 99% to 50% and every client retries until it succeeds. What happens to the load the dependency receives?
  options: ["It rises by 50%, one retry for each failed first attempt", "It falls, since clients back off after the first failure", "It is unchanged, because retries replace failed requests", "It doubles, since expected attempts per request are 1/p = 2"]
  answer: 3
  explanation: >-
    The number of attempts until success is geometric with mean 1/p, so at p = 0.5 each request costs two attempts on average and the dependency sees twice the offered load; as p falls further the multiplier grows (10× at p = 0.1), which is the retry storm. Backoff delays the retries but does not remove them; only a retry budget or a circuit breaker caps the multiplier.
```
