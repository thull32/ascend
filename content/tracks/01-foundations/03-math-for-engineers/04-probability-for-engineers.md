---
slug: probability-for-engineers
title: "Probability for engineers: expectation, birthdays, sampling and load"
description: Expected value and linearity, the birthday bound that governs every random ID and hash, reservoir sampling with its proof, randomised algorithms, and the balls-into-bins math behind load balancing and tail latency.
minutes: 50
difficulty: medium
tags: [math, probability, expected-value, birthday-paradox, reservoir-sampling, load-balancing]
problems: [insert-delete-getrandom, kth-largest-array]
---
A service generates random 64-bit request IDs. A load balancer sends each request to a random backend. A hash table picks a bucket by hashing. A quicksort picks a pivot at random. A monitoring pipeline keeps a sample of one in a thousand events. Every one of those is a bet, and the question a senior engineer must answer is not "can it go wrong?" (it can) but "how often, and how badly?"

Answering that needs a small amount of probability used precisely. Not measure theory, not Bayesian statistics: expected value, one product formula, one approximation, and a handful of results that recur in hashing, sampling and load balancing. Most engineers can compute the probability of one coin flip. Fewer can say how many random 32-bit IDs you can issue before a collision is more likely than not (about 77,000, not two billion), or why sending each request to the less loaded of *two* random servers is exponentially better than sending it to one.

## Expected value and why linearity is the whole trick

The expected value of a random quantity $X$ is its probability-weighted average: $E[X] = \sum_x x \cdot P(X = x)$. A fair die has $E = (1 + 2 + 3 + 4 + 5 + 6)/6 = 3.5$.

The property that makes expectation useful in engineering is **linearity**: $E[X + Y] = E[X] + E[Y]$, *always*, even when $X$ and $Y$ are dependent. That lets you compute the expectation of a complicated quantity by splitting it into simple pieces and adding.

**Worked example: expected collisions in a hash table.** Insert $n$ keys into $m$ buckets with a uniform hash. How many colliding pairs? There are $\binom{n}{2}$ pairs of keys, and each pair collides with probability $1/m$. Define $X_{ij} = 1$ if pair $(i, j)$ collides, else 0; the total collisions are $\sum X_{ij}$, and by linearity

$$E[\text{collisions}] = \binom{n}{2} \cdot \frac{1}{m} \approx \frac{n^2}{2m}$$

For $n = 1{,}000$ keys in $m = 1{,}000$ buckets: about 500 colliding pairs. For $n = 1{,}000$ in $m = 10^6$: about 0.5. That the pairs are not independent (if $a$ collides with $b$ and $b$ with $c$, then $a$ collides with $c$) does not matter; linearity does not need independence.

**Worked example: expected chain length.** The key you look up hashes to some bucket; each of the other $n - 1$ keys is in that bucket with probability $1/m$. Expected number of other keys in your chain: $(n - 1)/m \approx \alpha$, the load factor. That single line is the proof that chained hash tables have $O(1 + \alpha)$ expected lookups.

**Worked example: expected retries.** An operation succeeds with probability $p$ on each independent attempt. The number of attempts until the first success is geometric with $E = 1/p$. A flaky dependency at $p = 0.9$ costs $1.11$ attempts on average; at $p = 0.5$, two; at $p = 0.1$, ten. And the tail is fat: the chance of needing more than $k$ attempts is $(1 - p)^k$, so at $p = 0.5$ one request in a thousand needs more than ten tries.

## The birthday bound

The question: draw $n$ values uniformly from a space of size $N$. What is the probability that two are equal?

Start from the probability that they are *all different*. The first value is free. The second avoids the first with probability $(N - 1)/N$. The third avoids both with probability $(N - 2)/N$. So

$$P(\text{no collision}) = \prod_{i=0}^{n-1} \frac{N - i}{N} = \prod_{i=0}^{n-1}\left(1 - \frac{i}{N}\right)$$

For the classic case $N = 365$, $n = 23$: the product is $0.4927$, so the probability of a shared birthday is $50.7\%$. With 57 people it is 99%. With 70, 99.9%. Intuition says you need around 180 (half of 365); the truth is 23, because what matters is the number of *pairs*, $\binom{23}{2} = 253$, not the number of people.

For engineering you want the approximation. Using $1 - x \approx e^{-x}$ for small $x$:

$$P(\text{no collision}) \approx \exp\left(-\frac{n(n-1)}{2N}\right) \approx e^{-n^2 / 2N}$$

Set that to $1/2$ and solve: the 50% point is at $n \approx \sqrt{2 \ln 2 \cdot N} \approx 1.18\sqrt{N}$. **Collisions become likely at the square root of the space size.** That is the whole birthday paradox, and it is why "the ID space is $2^{32}$" and "we can safely issue $2^{32}$ IDs" are very different claims.

| Space | $N$ | 50% collision at $1.18\sqrt{N}$ | 1-in-a-million collision at $\sqrt{2N \cdot 10^{-6}}$ |
|---|---|---|---|
| 32-bit | $4.3 \times 10^9$ | ≈ 77,000 | ≈ 93 |
| 64-bit | $1.8 \times 10^{19}$ | ≈ 5.1 × 10⁹ | ≈ 6.1 × 10⁶ |
| 122 random bits (UUIDv4) | $5.3 \times 10^{36}$ | ≈ 2.7 × 10¹⁸ | ≈ 3.3 × 10¹⁵ |
| 160-bit (SHA-1) | $1.5 \times 10^{48}$ | ≈ 1.4 × 10²⁴ | |
| 256-bit (SHA-256) | $1.2 \times 10^{77}$ | ≈ 4 × 10³⁸ | |

Read the 32-bit row twice. A system that tags each in-flight request with a random 32-bit ID and has 100,000 requests in flight has a collision probability of $1 - e^{-10^{10}/(2 \cdot 4.3 \times 10^9)} \approx 1 - e^{-1.16} \approx 69\%$ at any moment. That is not a corner case; it is the steady state. Sixty-four bits gives you billions of IDs before a coin-flip collision, and 128 bits (a UUID) puts the first expected collision beyond anything you will ever generate, which is why "just use a UUID" is the right answer far more often than "design a coordination scheme".

The same bound governs hash functions. A 32-bit hash of $n$ objects will have a colliding pair by $n \approx 77{,}000$; deduplicating a million files by 32-bit hash *will* merge distinct files. A 64-bit hash is safe to hundreds of millions; a 128-bit hash is safe to $10^{18}$. Git's move from SHA-1 to SHA-256 is about adversarial collisions, which are a different (cheaper for the attacker) problem, but the birthday bound is the floor even against a random adversary.

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

**Las Vegas**: always correct, running time is random. Randomised quicksort is the standard example. Choosing a random pivot makes the *expected* running time $O(n \log n)$ for every input; there is no input that is reliably bad, only unlucky pivot sequences, and the chance of an unlucky sequence long enough to matter is astronomically small. Quickselect for [Kth Largest Element](/practice/kth-largest-array) is the same idea with expected $O(n)$. Hash tables with a randomly seeded hash are Las Vegas: always correct, expected $O(1)$, and the random seed is what prevents an adversary from choosing a bad input in advance.

**Monte Carlo**: fast, and correct with high probability. A Bloom filter says "definitely absent" or "probably present", with a false-positive rate you choose by sizing. Rabin–Karp without verification is Monte Carlo. Miller–Rabin primality testing is Monte Carlo with error $\le 4^{-k}$ after $k$ rounds, which at $k = 20$ is one in a trillion, below the probability of a hardware fault during the computation. HyperLogLog counts distinct elements to within about 2% using 1.5 KB of state. The [probabilistic structures module](/learn/advanced-data-structures/probabilistic-structures/bloom-filters) covers these in depth.

The engineering judgement is whether the application tolerates the error. A cache admission filter can be wrong 1% of the time. A billing system cannot. A senior engineer says which kind they are building and what the error rate is; a mid-level engineer says "it uses hashing so it's fast".

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

**Why it is uniform**, for $k = 1$ (the general case is the same argument with a factor of $k$). Claim: after processing $n$ items, each item is the sample with probability exactly $1/n$. Item $i$ is chosen when it arrives with probability $1/i$. It survives item $i + 1$ with probability $1 - 1/(i+1) = i/(i+1)$, survives item $i + 2$ with probability $(i+1)/(i+2)$, and so on. Multiply:

$$P(\text{item } i \text{ is the final sample}) = \frac{1}{i} \cdot \frac{i}{i+1} \cdot \frac{i+1}{i+2} \cdots \frac{n-1}{n} = \frac{1}{n}$$

The product telescopes. Every item ends up with probability $1/n$ regardless of its position, and the algorithm never needed to know $n$ in advance. That telescoping product is the proof to give in an interview; it takes four lines.

Worked trace, $k = 2$, stream `[10, 20, 30, 40, 50]`, with the "random" draws for items 3, 4, 5 being $j = 2, 4, 1$: after items 1–2 the reservoir is `[10, 20]`. Item 3 (30), $j = 2 \le 2$: replace slot 2, reservoir `[10, 30]`. Item 4 (40), $j = 4 > 2$: skip. Item 5 (50), $j = 1 \le 2$: replace slot 1, reservoir `[50, 30]`.

Two production notes. First, `random.randint` per item costs a random number per element; Algorithm L skips ahead geometrically and is what you want at millions of events per second. Second, weighted sampling (keep items in proportion to a weight) has its own reservoir algorithm (Efraimidis–Spirakis: key $= u^{1/w}$, keep the top $k$ keys), which is how weighted log sampling and priority sampling are implemented.

## Balls into bins: load balancing math

Throw $n$ balls into $n$ bins uniformly at random. The average bin holds one ball. How full is the *fullest* bin?

Intuition says "one or two". The answer is about $\ln n / \ln \ln n$: for $n = 10^6$, roughly 6 or 7; for $n = 10^9$, about 9. Formally the maximum load is $\Theta(\log n / \log \log n)$ with high probability. This is the load on the busiest bucket of a hash table at load factor 1, the busiest backend when a random load balancer spreads $n$ requests across $n$ servers, and the busiest partition when keys are hashed uniformly. "Uniform random" does not mean "evenly spread"; it means "some bin is several times the average, and the tail latency of the system is the tail of that bin".

Now the result every load-balancer designer knows. Instead of one random bin, pick **two** random bins and put the ball in the less full one. The maximum load drops to about $\ln \ln n / \ln 2 + O(1)$: for $n = 10^6$, about 4, and for $n = 10^9$, still about 4. Exponentially better for one extra random choice and one comparison. This is "the power of two choices", and it is the algorithm behind Nginx's `random two least_conn` mode, Envoy's least-request balancer (which samples two hosts by default), HAProxy's two-draw `random` balancer, and the choice-of-two picker Netflix described for Zuul. Choosing among *all* $n$ servers (true least-connections) is only marginally better than two and needs global state; two random probes get you almost all the benefit with none of the coordination.

```viz
{"type": "network", "scenario": "load-balancer-least-conn", "title": "Least-loaded routing", "caption": "Each request goes to a backend with fewer active connections. Sampling two backends at random and picking the emptier one gets almost all of this benefit with no global view of the load."}
```

The same idea appears in hashing: Cuckoo hashing and two-choice hashing bound the longest chain at $O(\log \log n)$ instead of $O(\log n / \log \log n)$, which is why some high-performance tables give every key two candidate buckets.

## Tails, fan-out and "the 1% is the p99"

A last piece of arithmetic that senior engineers do reflexively.

A single backend is slow (over its latency target) on 1% of requests. A user-facing request fans out to 100 backends and waits for all of them. What fraction of user requests are slow?

$$P(\text{at least one slow}) = 1 - 0.99^{100} \approx 1 - e^{-1} \approx 63\%$$

The backend's p99 has become the frontend's *median*. That is the "tail at scale" problem, and it is why fan-out systems use hedged requests (send a second copy after the p95 delay, take the first response), tied requests, and per-backend deadlines. The general formula $1 - (1 - p)^n \approx np$ for small $np$, and $\approx 1 - e^{-np}$ otherwise, is the same $1 - x \approx e^{-x}$ approximation as the birthday bound; you now know it from two directions.

The same computation tells you that a batch job with 10,000 independent tasks each succeeding with probability 0.9999 fails about 63% of the time end to end, so retries are not optional, and that a monitor firing with a 0.1% false-positive rate per check, checked every minute, pages you about once a day.

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

## Senior signals

- You quote the birthday bound: collisions are likely at $\sqrt{N}$, so 32-bit random IDs collide within ~77,000 draws and 64-bit within ~5 billion; you choose UUIDs by arithmetic, not habit.
- You use linearity of expectation to get results like "expected collisions $\approx n^2/2m$" in one line, and you know it holds without independence.
- You distinguish Las Vegas from Monte Carlo and state the error rate of anything Monte Carlo you propose.
- You can prove reservoir sampling uniform with the telescoping product, and you know the weighted and skip-ahead variants exist.
- You know that uniform random placement gives a max load of $\Theta(\log n / \log \log n)$ and that two random choices cut it to $\Theta(\log \log n)$, and you can name a load balancer that uses it.
- You compute $1 - (1 - p)^n$ for fan-out before promising a latency SLO, and you reach for hedged requests and retries with a number, not a feeling.

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
  options: ["It holds about sqrt(n) keys, around 100 here", "It holds about 5 or 6 keys, like ln n / ln ln n", "It holds about 2 keys, twice the average load", "It holds exactly 1 key, since the load factor is 1"]
  answer: 1
  explanation: >-
    Uniform placement of n balls into n bins gives a maximum load of Θ(log n / log log n) with high probability, which is around 5 or 6 for n = 10^4. The average is 1 but the maximum is what sets the worst-case probe length; sqrt(n) is far too large.
- q: >-
    Why is picking the less-loaded of two random servers so much better than picking one random server?
  options: ["It makes the load on every server exactly equal", "Max load falls from log n / log log n to log log n", "It is not better; it only adds an extra round trip", "It halves the number of requests each server receives"]
  answer: 1
  explanation: >-
    The power of two choices drops the max load from Θ(log n / log log n) to Θ(log log n), roughly 4 for any realistic n: an exponential improvement for one extra comparison and no global state. The total request count is unchanged and the load is not exactly equal, just far tighter.
- q: >-
    In reservoir sampling with k = 1, the i-th item replaces the current sample with probability 1/i. After n items, why does the first item still have probability 1/n of being the sample?
  options: ["Because it starts at probability 1 and is rarely replaced", "Because the survival odds (i-1)/i telescope to 1/n", "It does not; earlier items are more likely to be kept", "Because the algorithm re-randomises the sample at the end"]
  answer: 1
  explanation: >-
    The first item is kept initially (probability 1) and survives each later item i with probability 1 - 1/i = (i-1)/i. The product 1 × (1/2) × (2/3) × ... × ((n-1)/n) telescopes to 1/n, matching every other item. Starting at probability 1 does not make it favoured, and no final pass is needed.
- q: >-
    A user request waits on 50 backends, each of which exceeds its latency target on 2% of calls independently. What fraction of user requests exceed the target?
  options: ["About 2%", "About 4%", "About 64%", "About 100%"]
  answer: 2
  explanation: >-
    P(at least one slow) = 1 - 0.98^50 ≈ 1 - e^(-1) ≈ 63%. Fan-out turns a per-backend tail into a front-end median, which is why hedged requests and per-backend deadlines exist.
```
