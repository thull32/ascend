---
slug: meet-in-the-middle-and-randomisation
title: "Meet in the middle and randomisation: halving exponents and outwitting adversaries"
description: Split an exponential search into two halves that meet in a sorted list or hash map, then use randomness deliberately, with random pivots, seeded hashes no adversary can target, mergeable samples and Monte Carlo verification.
minutes: 40
difficulty: hard
tags: [meet-in-the-middle, randomisation, hashing, subset-sum, reservoir-sampling, monte-carlo]
problems: [two-sum, target-sum, kth-largest-array, insert-delete-getrandom, word-ladder]
---
You are given 40 integers, each as large as 10⁹ in absolute value, and asked for the subset whose sum is closest to a goal. There are 2⁴⁰ ≈ 1.1 × 10¹² subsets, which is hours of work even in a compiled language. Dynamic programming over reachable sums is hopeless, because the sums span 8 × 10¹⁰ values. Greedy has no argument. Every textbook technique seems to fail.

Then split the 40 numbers into two halves of 20. Each half has 2²⁰ ≈ 1.05 million subset sums. Sort one list, and for each sum in the other ask "what is the best partner?" with a binary search or a two-pointer sweep. The whole thing takes about a second in a compiled language and a few seconds in Python. That is **meet in the middle**: it turns `2^n` into roughly `2^(n/2)` by solving two half-size problems and combining them in a way that does not multiply their costs.

The second half of this lesson covers the other tool for when determinism fails: **randomness**. Sometimes you need it for speed, as with random pivots. Sometimes you need it for safety, because an adversary who knows your hash function can pick your worst case. And sometimes you need it for scale, as with samples you can merge across machines and verification that is far cheaper than recomputation.

## Meet in the middle: the square root of an exponential

Every subset `S` of the input splits into a part `S_A` from the first half `A` and a part `S_B` from the second half `B`, and `sum(S) = sum(S_A) + sum(S_B)`. So:

1. Enumerate `LA`, the `2^(n/2)` subset sums of `A`, and `LB`, those of `B`.
2. The question "which subset is closest to `goal`?" becomes "which pair `x ∈ LA`, `y ∈ LB` makes `x + y` closest to `goal`?"
3. That is a two-list pair problem, and the [two-pointer lesson](/learn/algorithms/technique-mastery/two-pointers-mastery) solved it: sort both lists and walk one pointer up `LA` and one down `LB`.

Enumerating one half's sums takes `O(2^m)` total if you double the list for each element, instead of recomputing each subset's sum from scratch:

```python
def subset_sums(items):
    sums = [0]
    for x in items:
        sums += [s + x for s in sums]      # every subset either skips x or takes it
    return sums
```

Each subset is also a bitmask over its half, which is how you enumerate it if you need the members and not just the sum:

```viz
{"type": "bits", "algorithm": "subset-mask", "values": [5, -7, 3], "title": "One half's subsets as masks", "caption": "Three items give eight masks. For n = 40, each half has 2^20 masks, about a million, instead of the 2^40 subsets of the whole."}
```

Trace `nums = [5, -7, 3, 5]` with `goal = 4`. The halves are `A = [5, -7]`, with sorted sums `[-7, -2, 0, 5]`, and `B = [3, 5]`, with sorted sums `[0, 3, 5, 8]`. Start with `i` at the smallest `A` sum and `j` at the largest `B` sum:

| `A[i]` | `B[j]` | sum | vs goal 4 | best distance so far | move |
|---|---|---|---|---|---|
| −7 | 8 | 1 | below | 3 | `i++` |
| −2 | 8 | 6 | above | 2 | `j--` |
| −2 | 5 | 3 | below | 1 | `i++` |
| 0 | 5 | 5 | above | 1 | `j--` |
| 0 | 3 | 3 | below | 1 | `i++` |
| 5 | 3 | 8 | above | 1 | `j--` |
| 5 | 0 | 5 | above | 1 | `j--`, done |

The answer is 1. The sum 4 is not reachable, and both 3 (`-2 + 5`, that is `5 - 7 + 5`) and 5 are. The walk is correct for the pair-table reason from the two-pointer lesson: a sum below the goal means `A[i]` with the largest remaining partner is still too small, so every other partner is further away and row `i` can be dropped.

**Cost.** Sorting dominates: `O(2^(n/2) · n)` time, and `O(2^(n/2))` memory. Memory is usually the binding constraint. Two lists of 2²⁰ integers are 8 MB each as packed 64-bit values, but a Python list of int objects is several times that. At `n = 50`, 2²⁵ entries per half starts to hurt. Say this out loud, because it is the honest limit of the technique.

**Counting variants** swap the sweep for the right lookup. "How many subsets sum to at most `S`?" sorts `LB` and, for each `x`, adds `bisect_right(LB, S - x)`. "How many subsets sum to exactly `S`?" builds a `Counter` of `LB` and adds `count[S - x]`. [Target Sum](/practice/target-sum), which assigns `+` or `-` to each number, is the same idea with signed sums. Its values are small enough that DP over sums works too. Meet in the middle is the answer when values are huge and `n` is around 40.

**The signal.** `n` is between about 30 and 45, so `2^n` is too big and `2^(n/2)` is fine. The values are too large for DP over sums. And the objective decomposes as "left choice combined with right choice", with a combine step that sorting or hashing can do.

## The same idea in other clothes

- **Two Sum is meet in the middle with one element per side.** "For each element, look up its complement among the others" is exactly "enumerate the left, look up the matching right" ([Two Sum](/practice/two-sum)).
- **Four arrays summing to zero.** Count `(i, j, k, l)` with `a[i] + b[j] + c[k] + d[l] = 0`. Hash all `n²` sums `a[i] + b[j]` with their counts, then for each `c[k] + d[l]` add the count of its negation: `O(n²)` instead of `O(n⁴)`. That is the first exercise.
- **Bidirectional BFS.** Searching from both ends of a graph with branching factor `b` and distance `d` expands about `2 · b^(d/2)` nodes instead of `b^d`, meeting when the frontiers touch. It is the standard upgrade for [Word Ladder](/practice/word-ladder).
- **Baby-step giant-step.** Solving `a^x ≡ b (mod p)` for `x` takes `O(√p)` time and memory. Write `x = i·m - j` with `m = ⌈√p⌉`, store `b·a^j` for all `j < m` in a hash map, then step through `a^(i·m)` looking for a match.
- **Cryptography.** Encrypting twice with two independent 56-bit DES keys does not give 112-bit security. An attacker encrypts the plaintext under every first key, decrypts the ciphertext under every second key, and matches in the middle, for roughly 2⁵⁷ operations plus a very large table. That is why the standard became *triple* DES.

## Randomisation: two contracts

Randomised algorithms come with one of two guarantees:

- **Las Vegas:** always correct, with a random running time. Randomised quicksort and quickselect, treaps, and rejection sampling.
- **Monte Carlo:** bounded running time, with a small probability of a wrong answer. Freivalds' check, Miller–Rabin primality testing, Bloom filters, and comparing strings by random hashes.

A Monte Carlo algorithm with a fast checker becomes Las Vegas: repeat until the check passes. Independent repetitions multiply error probabilities, so `k` runs that each err with probability at most 1/2 err together with probability at most `2^-k`. Twenty runs bring it below one in a million.

The deeper reason to randomise is where the guarantee comes from. Average-case analysis says "fast on a typical input", and a production system (or an attacker) may not send typical inputs. A randomised algorithm says "**fast on every input**, on average over *my* coin flips". The adversary chooses the input but cannot choose your coins. That sentence is what interviewers are looking for when they ask "why a random pivot?"

### Random pivots

Quickselect that always pivots on the first element is `O(n²)` on sorted input, and sorted input is common in real systems: timestamps, IDs, logs. With a random pivot, the pivot lands in the middle half of the current range with probability 1/2, which leaves at most `3/4` of the elements. On average that takes at most two partitions, so the expected work is at most `2n(1 + 3/4 + (3/4)² + …) = 8n`: `O(n)` expected **for every input**. A tighter analysis gives about `3.4n` comparisons for the median. The [selection lesson](/learn/algorithms/sorting-searching/selection-and-order-statistics) covers the details, and [Kth Largest Element in an Array](/practice/kth-largest-array) is the interview form. Production sorts hedge in a different way: introsort falls back to heapsort when recursion gets too deep, which bounds the worst case deterministically.

### Randomised hashing: seeds against adversaries

A hash table is `O(1)` expected only if keys spread across buckets. An attacker who knows your hash function can choose keys that all land in one bucket, turning `n` inserts into `O(n²)` work. In late 2011, researchers showed that the default hash tables in many web platforms could be attacked this way with nothing more than crafted form-field names in a single request. The industry fix was the same everywhere: a **keyed hash with a per-process random key**. Python hashes `str` and `bytes` with SipHash under a key chosen at startup (the `PYTHONHASHSEED` variable controls it). Rust's default `HashMap` uses SipHash with random keys. Go seeds each map's hash randomly.

The theory behind the fix is **universal hashing**. Pick a prime `p` larger than any key, and random `a ∈ [1, p-1]`, `b ∈ [0, p-1]`. Then `h(x) = ((a·x + b) mod p) mod m` collides on any two *fixed* distinct keys with probability at most `1/m`. The guarantee holds for every pair of keys, because the randomness is in the function and not in the data.

The same reasoning applies to **polynomial string hashing**, which you use to compare substrings in `O(1)`:

```python
import random

MOD = (1 << 61) - 1                        # a Mersenne prime: fast reduction, tiny collision odds
BASE = random.randrange(256, MOD - 1)      # chosen at run time, unknown to whoever wrote the input

def prefix_hashes(s):
    h = [0] * (len(s) + 1)
    for i, ch in enumerate(s):
        h[i + 1] = (h[i] * BASE + ord(ch)) % MOD
    return h

def substring_hash(h, powers, i, j):       # hash of s[i:j]; powers[k] = BASE**k % MOD
    return (h[j] - h[i] * powers[j - i]) % MOD
```

`substring_hash` is the prefix-difference idea from [the previous lesson](/learn/algorithms/technique-mastery/prefix-sums-and-hashing-tricks), with multiplication by a power of the base shifting the prefix into place. Two different strings of length `L` collide only if `BASE` is a root of their difference polynomial. That polynomial has degree below `L`, so it has fewer than `L` roots, and the collision probability for a random base is below `L / 2^61`. Contrast this with the popular "fixed base 31, let it overflow mod 2⁶⁴" approach. Thue–Morse strings make that collide for essentially any base, a construction that competitive-programming problem setters use on purpose. Randomise the base and use a prime modulus.

### Sampling: reservoir sampling and beyond

The [probability lesson](/learn/foundations/math-for-engineers/probability-for-engineers) proves that reservoir sampling picks a uniform element from a stream of unknown length. At senior level you should also know three extensions:

- **`k` items, and skipping ahead.** Keep the first `k` items. Item `i` (0-indexed) replaces a random slot with probability `k / (i + 1)`. Algorithm L computes how many items to *skip* before the next replacement, drawing only `O(k(1 + log(n/k)))` random numbers instead of `n`, which matters when the stream is enormous.
- **Weighted sampling.** Give an item of weight `w` the key `u^(1/w)` for a uniform `u` in `(0, 1)`, and keep the `k` largest keys in a min-heap (the Efraimidis–Spirakis method). Heavier items tend to get larger keys.
- **Mergeable samples.** Assign every item a random key, or better a hash of its ID, and keep the `k` smallest keys. Samples from different shards merge by taking the `k` smallest of their union: a bottom-`k` sketch. With a hash instead of a random number, each item is in or out of the sample *consistently*, so the same user lands in the same experiment bucket in every service that computes it.

### Monte Carlo verification: Freivalds' check

To check whether `A · B = C` for `n × n` matrices, multiplying out costs `O(n³)` naively. Instead, pick a random vector `r` of 0s and 1s and compare `A(Br)` with `Cr`, which is three matrix-vector products at `O(n²)`. If `AB ≠ C`, the difference `D = AB - C` has a non-zero row `d`. Pick a coordinate `k` where `d_k ≠ 0`, and fix every coordinate of `r` except `r_k`. At most one of the two values of `r_k` can make `d · r = 0`. So a wrong `C` passes a round with probability at most 1/2, and twenty rounds miss it with probability below 10⁻⁶. "Verify with randomness instead of recomputing" appears in distributed systems as well: spot-checking replicas, sampling rows to validate a migration.

### Randomness in interview problems

- **Fisher–Yates shuffle.** For `i` from `n - 1` down to 1, swap `a[i]` with `a[randint(0, i)]`. That gives `n!` equally likely executions, one per permutation. The classic bug swaps with `randint(0, n - 1)` at every step. That gives `n^n` equally likely executions, and `n^n` is not divisible by `n!` for `n ≥ 3` (27 executions cannot spread evenly over 6 permutations), so the shuffle is provably biased.
- **Random pick with weights.** Build prefix sums of the weights, draw `r` uniformly in `[0, total)`, and binary search for the first prefix greater than `r`. That combines two lessons in eight lines.
- **Insert, delete and get-random in `O(1)`.** An array plus a value-to-index map, where delete swaps the victim with the last element ([Insert Delete GetRandom](/practice/insert-delete-getrandom)). It is covered as a design pattern in [design problems](/learn/interview-patterns/combinatorial-patterns/design-problems).
- **Testing randomised code.** Seed the generator in tests (`random.Random(42)`) so failures reproduce. Check distributions with generous statistical tolerances over many runs, never "exactly 25% of 1,000 draws". Compare against a brute force on small random inputs.

## Exercises

```exercise
id: four-sum-count
title: Count zero-sum tuples across four arrays
prompt: |
  Given four integer arrays `a`, `b`, `c` and `d`, return the number of
  index tuples `(i, j, k, l)` such that
  `a[i] + b[j] + c[k] + d[l] == 0`.

  Meet in the middle: count every sum `a[i] + b[j]` in a hash map, then
  for every `c[k] + d[l]` add the count of its negation. Aim for
  O(n^2) time with arrays of length n.
languages: [python, javascript]
entry: four_sum_count
starter:
  python: |
    def four_sum_count(a, b, c, d):
        # your code here
        return 0
  javascript: |
    function four_sum_count(a, b, c, d) {
      // your code here
      return 0;
    }
tests:
  - args: [[1, 2], [-2, -1], [-1, 2], [0, 2]]
    expected: 2
  - args: [[0], [0], [0], [0]]
    expected: 1
  - args: [[], [1], [2], [3]]
    expected: 0
    label: an empty array means no tuples
  - args: [[1, 1], [-1, -1], [0, 0], [0, 0]]
    expected: 16
    label: duplicates multiply
  - args: [[-1, -1], [-1, 1], [-1, 1], [1, -1]]
    expected: 6
    hidden: true
  - args: [[1], [2], [3], [4]]
    expected: 0
    hidden: true
  - args: [[0, 1, -1, 2, -2, 3], [1, -3, 2, 0, 4, -1], [-2, 2, 5, -5, 0, 1], [3, -1, 0, -4, 2, 1]]
    expected: 100
    hidden: true
hints:
  - "Store counts, not a set: two different (i, j) pairs with the same sum are two different tuples."
  - "For each c[k] + d[l] = s, add counts[-s] (0 if absent)."
```

```exercise
id: closest-subset-sum
title: Closest subset sum by meeting in the middle
prompt: |
  Given an integer array `nums` (up to about 40 elements, values may be
  large or negative) and an integer `goal`, return the minimum possible
  value of `|sum(subset) - goal|` over all subsets, including the empty
  subset (sum 0).

  Split `nums` into two halves, list every subset sum of each half,
  sort one list, and for each sum in the other find the best partner by
  binary search or a two-pointer sweep. Brute force over all subsets
  will time out on the hidden tests.
languages: [python, javascript]
entry: closest_subset_sum
starter:
  python: |
    def closest_subset_sum(nums, goal):
        # your code here
        return 0
  javascript: |
    function closest_subset_sum(nums, goal) {
      // your code here
      return 0;
    }
tests:
  - args: [[5, -7, 3, 5], 6]
    expected: 0
  - args: [[7, -9, 15, -2], -5]
    expected: 1
  - args: [[1, 2, 3], -7]
    expected: 7
    label: the empty subset is best
  - args: [[], 5]
    expected: 5
    label: empty input
  - args: [[10], 3]
    expected: 3
  - args: [[17, -4, 29, -11, 8, 3, -26, 14, 5, -9, 21, -2], 37]
    expected: 0
    hidden: true
  - args: [[3, -8, 12], 100]
    expected: 85
    hidden: true
  - args: [[-320874, 987816, -683648, -171996, 365108, -898738, -848092, 722336, 123826, -802596, -233096, 222194, -878368, 907786, 64168, -549746, -921366, -819756, -90580, -123030, -853504, -495294, -809762, 155628], 1234567]
    expected: 1
    hidden: true
    label: 24 elements, 16 million subsets
hints:
  - "Build each half's sums by doubling: start from [0] and, for each x, append s + x for every existing s."
  - "Sort both lists. Put i at the start of the left list and j at the end of the right list; move i up when the sum is below goal, j down when above, and stop on an exact hit."
```

## Senior signals

- You recognise the **meet-in-the-middle constraint profile**: `n` around 30 to 45, values too large for DP, and an objective that splits into two halves combined by sorting or hashing. You state the `O(2^(n/2))` memory cost, not just the time.
- You connect it to things you already know: **Two Sum, 4Sum-count, bidirectional BFS and baby-step giant-step** are the same idea.
- You distinguish **Las Vegas from Monte Carlo** and explain amplification by repetition.
- You justify random pivots with **"fast for every input, averaged over my coin flips"**, not "fast on average inputs".
- You know why production hash tables use **seeded hashes** (hash flooding), and you randomise the base of polynomial string hashes with a prime modulus.
- You can produce **Fisher–Yates** with its correctness argument, name the `n^n` versus `n!` bug, and describe mergeable bottom-`k` samples for distributed data.

## Check yourself

```quiz
- q: >-
    You have n = 36 integers with absolute values up to 10^12 and must count the subsets that sum exactly to S. Which approach fits?
  options: ["DP over reachable sums, with a count table indexed by every sum up to S", "Greedy by largest value, adding each item while the running total stays within S", "Meet in the middle: hash one half's 2^18 sums, look up S − x for the other", "Brute force over all 2^36 subsets, pruning branches whose sum passes S"]
  answer: 2
  explanation: >-
    The value range rules out DP, and 2^36 is about 69 billion subsets; pruning at S does not help, because values can be negative and a sum that passes S can come back. Two halves of 2^18, about 262,000 sums each, combined by counting one half's sums in a hash map and adding count[S − x] for each sum x of the other, take well under a second. Greedy has no correctness argument for subset sums.
- q: >-
    Why is a random pivot better than a median-of-three pivot against an adversary?
  options: ["Median-of-three is O(n²) on every input, while random pivots average O(n log n)", "An adversary can target a known rule's bad input, but not your coin flips", "Random pivots guarantee O(n log n) even in the worst case, whatever the input", "A random pivot is cheaper to compute than the median of three sampled values"]
  answer: 1
  explanation: >-
    Any deterministic rule has a known bad input, and "median-of-3 killer" sequences exist. With random pivots the expected time is O(n log n) (or O(n) for quickselect) for every input, because the adversary chooses the input but not the coin flips. Randomisation moves the guarantee from the input distribution to the algorithm's own randomness. It is still an expected bound, not a worst-case one, and median-of-three is fast on most inputs, just not on crafted ones.
- q: >-
    A shuffle swaps a[i] with a[randint(0, n - 1)] for every i from 0 to n - 1. What is wrong with it?
  options: ["It can swap an element with itself, which wastes a draw and skews the odds", "It makes n swaps instead of n − 1, so the last swap undoes part of the mixing", "Nothing; every element can reach every position, so all orders can occur", "Its n^n equally likely runs cannot split evenly over the n! permutations"]
  answer: 3
  explanation: >-
    For n = 3 there are 27 executions and 6 permutations, and 27 is not divisible by 6, so some permutations must be more likely than others (for any n ≥ 3). Every order being possible is not the same as every order being equally likely. Fisher–Yates draws from a shrinking range, giving n * (n-1) * ... * 1 = n! executions, exactly one per permutation; it allows self-swaps too, so those are not the problem.
- q: >-
    Freivalds' check multiplies by a random 0/1 vector r and compares A(Br) with Cr. If AB is not equal to C, what bounds the probability that one round wrongly reports equality?
  options: ["Close to 1 for some inputs, when AB − C has only a single non-zero entry", "It is 0, because a non-zero AB − C always changes A(Br) − Cr for any r", "At most 1/n, since each of the n rows of AB − C gets its own chance to differ", "At most 1/2, as at most one r_k value makes a non-zero row d give d · r = 0"]
  answer: 3
  explanation: >-
    Some row d of AB − C is non-zero; pick a coordinate k with d_k ≠ 0 and fix the other coordinates of r, and at most one of the two values of r_k makes d · r zero. Even a single non-zero entry is caught whenever r_k = 1, which is half the time. This is a Monte Carlo algorithm with one-sided error. Each round catches a wrong C with probability at least 1/2, so k independent rounds miss it with probability at most 2^-k, at O(n^2) per round.
- q: >-
    Why do Python, Rust and Go all seed their string or map hashing with randomness chosen at start-up or per map?
  options: ["So a keyed hash can double as a checksum that detects corrupted entries", "So each process can use a faster, shorter hash than a fixed secure one", "So typical keys spread more evenly across buckets than with a fixed hash", "So an attacker cannot precompute many keys that all collide in one bucket"]
  answer: 3
  explanation: >-
    With a fixed, public hash function, crafted keys can all collide, degrading each operation from O(1) to O(n) and making n inserts cost O(n^2) (hash flooding). A keyed hash with a secret random key makes collisions unpredictable, which restores the expected O(1) bound for any input. For ordinary keys a good fixed hash spreads just as evenly; the randomness matters only against inputs chosen by someone who knows the function.
```
