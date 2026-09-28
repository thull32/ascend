---
slug: asymptotic-notation
title: "Asymptotic notation: O, Ω, Θ and the growth classes that matter"
description: What O, Ω and Θ actually claim, the growth classes you will meet from constant to exponential with concrete sizes, the intuition for logarithms, and how to read a complexity off unfamiliar code in under a minute.
minutes: 55
difficulty: intro
tags: [complexity, big-o, big-theta, big-omega, growth-classes, fundamentals]
problems: [contains-duplicate, binary-search-basic]
---
An interviewer asks for the complexity of your solution and you say "$O(n)$". They ask "is that tight?" and you are not sure what they mean. Later they say "the constraint is $n \le 10^5$, so $O(n^2)$ is out". You nod, but you could not have said where that line falls, or why $n \le 10^5$ implies anything.

Both of those come from the same gap: treating Big-O as a label on algorithms rather than as a precise statement about functions. This lesson fixes the definitions, then makes them usable: the growth classes you will actually meet, what sizes each one can handle in about a second and where that budget comes from, how to get an intuition for $\log n$ that you can do in your head, what the constant hiding inside $\log n$ costs on real hardware, and a procedure for reading the class off code.

## What the notations claim

Every notation here compares two functions of $n$, the cost of your code $f(n)$ against a simpler reference $g(n)$, and only cares about large $n$.

**$f(n) = O(g(n))$**: eventually $f$ is bounded above by a constant times $g$. Formally, there exist $c > 0$ and $n_0$ such that $f(n) \le c \cdot g(n)$ for all $n \ge n_0$. It is an upper bound. $3n + 2 = O(n)$ with $c = 4, n_0 = 2$. But $3n + 2 = O(n^2)$ is *also* true, and so is $3n + 2 = O(2^n)$. Big-O is "no worse than", not "equal to".

**$f(n) = \Omega(g(n))$**: eventually $f$ is bounded *below* by a constant times $g$. A lower bound. $n^2/2 - n/2 = \Omega(n^2)$: for $n \ge 2$, $n^2/2 - n/2 \ge n^2/4$.

**$f(n) = \Theta(g(n))$**: both at once. $f$ and $g$ grow at the same rate up to constants. $n^2/2 - n/2 = \Theta(n^2)$. This is the "tight" bound the interviewer was asking about.

Finding the constants is a mechanical hunt, and doing it once makes the definition concrete. Claim: $f(n) = 3n^2 + 500n + 10^6$ is $O(n^2)$. Pick $c = 4$; then you need $n^2 \ge 500n + 10^6$:

| $n$ | $n^2$ | $500n + 10^6$ | $n^2 \ge 500n + 10^6$? |
|---|---|---|---|
| 1,000 | 1,000,000 | 1,500,000 | no |
| 1,250 | 1,562,500 | 1,625,000 | no |
| 1,500 | 2,250,000 | 1,750,000 | yes |

So $c = 4$, $n_0 = 1{,}500$ witnesses the bound. For $\Omega$, $c = 3$ and $n_0 = 1$ work, because $f(n) \ge 3n^2$ for every $n \ge 1$. Together, $f = \Theta(n^2)$. Notice that the $n_0$ is in the thousands: below that, the "lower-order" terms are the majority of the cost. That is the first hint that "drop the constants" is only safe once $n$ is large.

Two rarer notations you should recognise: $f = o(g)$ ("little-o") means $f$ grows *strictly* slower than $g$ (the ratio $f/g$ tends to 0), and $f = \omega(g)$ means strictly faster. $n = o(n \log n)$; $n = O(n)$ but $n \ne o(n)$. They appear in proofs that one algorithm is asymptotically better, not merely no worse.

When an engineer says "this is $O(n)$" they almost always mean $\Theta(n)$: "the cost grows linearly", not "the cost grows at most linearly". The distinction matters when it is pointed out. Saying binary search is $O(n)$ is technically true and practically useless; saying it is $\Theta(\log n)$ in the worst case is the answer. If you want to be exact without being pedantic, say "$O(n)$, and that's tight".

A sharper point about what the bound is *of*. "Worst case $O(n^2)$" and "average case $O(n \log n)$" are statements about different functions: the maximum cost over all inputs of size $n$, versus the expected cost over some distribution of inputs. Quicksort is both, and neither statement contradicts the other. When you give a complexity, you are implicitly picking a case; pick it out loud.

## The growth classes and what they can afford

The [previous lesson](/learn/foundations/complexity/why-big-o) measured the simplest CPython loop at about 11 ns per iteration (CPython 3.14 on a fast desktop core), which is roughly $10^8$ trivial iterations per second; a loop body with a dictionary lookup and a couple of comparisons is closer to $3 \times 10^7$ per second, and the same loop compiled from Go or Rust runs at $10^9$ or more. Using $10^8$ per second as a conservative budget for "about a second", here is what each class can process.

| Class | Name | $n$ that fits in ~1 s | Where it comes from |
|---|---|---|---|
| $O(1)$ | constant | any | array index, hash lookup, arithmetic |
| $O(\log n)$ | logarithmic | any | binary search, balanced tree ops, halving loops |
| $O(n)$ | linear | ~$10^8$ | one pass, hash-map counting, two pointers |
| $O(n \log n)$ | linearithmic | ~$4.5 \times 10^6$ | comparison sorting, divide and conquer, heaps |
| $O(n^2)$ | quadratic | ~$10^4$ | all pairs, nested loops, naive DP tables |
| $O(n^3)$ | cubic | ~460 | all triples, Floyd–Warshall, matrix multiply |
| $O(2^n)$ | exponential | 26 | every subset, brute-force backtracking |
| $O(n!)$ | factorial | 11 | every permutation |

The last column is exact arithmetic against the $10^8$ budget ($464^3 = 9.99 \times 10^7$, $2^{26} = 6.7 \times 10^7$, $11! = 3.99 \times 10^7$, $4{,}545{,}454 \times 22 \approx 10^8$); the exercise at the end of this lesson has you compute it. Competitive-programming judges typically allow one to two seconds, which is where the folklore "$10^8$ simple operations" comes from. In a service with a 50 ms latency budget, divide every row by 20.

This table is how you decode constraints. If a problem says $n \le 10^5$, then $n^2 = 10^{10}$ is a hundred seconds of work; the intended solution is $O(n \log n)$ or $O(n)$. If $n \le 20$, an $O(2^n)$ solution ($\approx 10^6$ subsets) is not only acceptable but probably intended. If $n \le 5000$, $O(n^2) = 2.5 \times 10^7$ is fine and you should not waste time hunting for something cleverer. Reading the constraint before choosing the approach saves more interview time than any other habit.

Two rows deserve a closer look.

**$O(n \log n)$ is almost linear.** For $n = 10^6$, $\log_2 n \approx 20$; the sort costs about twenty passes' worth of work. That is why "sort first, then do a linear pass" is such a common winning strategy: sorting is cheap enough that it is rarely the bottleneck, and sorted input makes many things trivial.

**$O(2^n)$ is a cliff.** Doubling $n$ from 20 to 40 does not double the work; it multiplies it by a million. Any approach that enumerates subsets is only viable for $n$ in the twenties, which is a useful tell: if the constraint is $n \le 20$, the problem setter is telling you subsets are fine.

## Getting an intuition for log

$\log_2 n$ answers one question: how many times can you halve $n$ before you reach 1? Or, equivalently, how many bits does $n$ take to write down (minus one)? Halve a million and count:

| Halving | Value | Halving | Value |
|---|---|---|---|
| 0 | 1,000,000 | 10 | 976 |
| 1 | 500,000 | 15 | 30 |
| 2 | 250,000 | 18 | 3 |
| 5 | 31,250 | 19 | 1 |

Nineteen halvings to reach 1, twenty to reach 0: $\log_2 10^6 = 19.93$, and $10^6$ needs 20 bits. The pattern generalises:

| $n$ | $\log_2 n$ |
|---|---|
| 1,000 | ~10 |
| 1,000,000 | ~20 |
| 1,000,000,000 | ~30 |
| $10^{12}$ | ~40 |

Every factor of a thousand adds about ten, because $2^{10} = 1{,}024$. So a billion-element sorted array needs at most 30 probes for binary search, and a balanced binary tree of a billion nodes is about 30 levels tall. Those are the numbers behind the claim that "$\log n$ is effectively constant": no realistic input makes $\log_2 n$ larger than about 60, because $2^{60}$ bytes is more than most data centres hold.

```viz
{"type": "array", "algorithm": "binary-search", "values": [3, 7, 11, 15, 19, 24, 31, 38, 44, 52, 61, 70, 85, 93, 99, 104], "target": 85, "title": "Sixteen elements, four probes", "caption": "Each probe halves the remaining range. log₂(16) = 4, so at most four probes for any target."}
```

The base of the logarithm does not matter inside Big-O. $\log_2 n = \log_{10} n / \log_{10} 2 \approx 3.32 \log_{10} n$, a constant factor, so $O(\log_2 n) = O(\log_{10} n) = O(\ln n)$ and you write $O(\log n)$. It does matter for exact counts: a B-tree with fan-out 1,000 is $\log_{1000} n$ levels tall, which for a billion keys is 3 rather than 30, and that factor of ten is exactly why databases use B-trees rather than binary trees on disk. The [logarithms lesson](/learn/foundations/math-for-engineers/logarithms-and-exponentials) goes further.

One more shape you will see: $O(\log \log n)$ and $O(\sqrt{n})$. $\sqrt{10^{12}} = 10^6$, so a $\sqrt{n}$ algorithm on a trillion is still fast. And $\log \log n$ is for practical purposes a small constant (about 5 for $n = 10^{9}$); it shows up in the analysis of interpolation search and randomised load balancing and you rarely need more than "it's tiny".

## Under the hood: the constant inside log n

"Thirty probes" sounds free until you ask what one probe costs. Binary search on a sorted array of 8-byte integers, measured in C on one desktop machine (best of three runs over a million random targets; the figures are specific to that CPU's 32 KB L1, 1 MB L2 and 96 MB L3, but the shape holds everywhere):

| $n$ | Array size | Probes | Time per search | Time per probe |
|---|---|---|---|---|
| $2^{10}$ | 8 KB (L1) | 10 | 36 ns | 3.6 ns |
| $2^{14}$ | 128 KB (L2) | 14 | 56 ns | 4.0 ns |
| $2^{18}$ | 2 MB (L3) | 18 | 94 ns | 5.2 ns |
| $2^{22}$ | 32 MB (L3) | 22 | 210 ns | 9.6 ns |
| $2^{26}$ | 512 MB (DRAM) | 26 | 474 ns | 18 ns |

The probe count grows exactly as $\log_2 n$ predicts. The cost per probe does not stay constant; it rises fivefold, and the reason is the memory hierarchy. Every search starts at the same midpoint, then one of the same two quarter-points, then one of the same four eighth-points: the top $k$ levels of the implicit search tree touch only $2^k$ distinct cache lines, and for $k$ up to about 20 those million lines (64 MB) stay resident in L3 across searches. Only the bottom $\log_2 n - 20$ levels, whose midpoints are spread across the whole array, miss to DRAM at roughly 70–100 ns each. For $n = 2^{26}$ that is about six DRAM misses plus twenty cheap probes, which is what the 474 ns is made of.

This is the mechanism behind two design decisions. B-trees pack hundreds of keys per node so that a lookup makes three or four node visits instead of thirty, each of which is a sequential scan within one cache line or page. The Eytzinger layout stores a sorted array in breadth-first order so that the next probe's candidates are adjacent in memory and can be prefetched. Both leave the algorithm at $\Theta(\log n)$ and cut the constant by three to ten times. "$\log n$" tells you the count; the hardware tells you the price.

## Comparing growth rates

You will need to order expressions that do not appear in the table. The ordering, from slowest-growing to fastest, is:

$$
1 \prec \log n \prec \sqrt{n} \prec n \prec n \log n \prec n^2 \prec n^3 \prec 2^n \prec n! \prec n^n
$$

Some rules for anything not on that line:

- **Polynomials sort by exponent**: $n^{1.5} \prec n^2$, and $n^2 \log n \prec n^{2.1}$ because any positive power of $n$ eventually beats any power of $\log n$.
- **Any exponential beats any polynomial**: $1.01^n$ eventually exceeds $n^{100}$, though "eventually" here means $n$ around 120,000 (solve $n \ln 1.01 = 100 \ln n$), and below that the polynomial is larger.
- **In a sum, keep the largest term**: $n^2 + n \log n + 10^6 = \Theta(n^2)$.
- **Multiple variables stay multiple**: a loop over a matrix with $r$ rows and $c$ columns is $O(rc)$, not $O(n^2)$, unless the matrix is square. A graph algorithm that touches every vertex and every edge is $O(V + E)$, and you should not collapse that to $O(V^2)$ unless the graph is dense. Interviewers notice when you silently assume $E = V^2$.

A quick way to compare two expressions: take the logarithm of each. $\log(2^n) = n$ and $\log(n^{10}) = 10 \log n$; since $n$ grows faster than $10 \log n$, $2^n$ grows faster than $n^{10}$.

## Reading complexity off code

Here is the procedure, in order.

1. **Find the input size.** Usually $n$ is the length of an array or the number of nodes. For two inputs, keep two variables. For a number as input (e.g. "is $k$ prime?"), the size is the number of *digits*, which changes everything: a loop to $k$ is exponential in the input size. This is why trial division is not a polynomial-time primality test.
2. **Find the innermost work** and how many times it runs. Count loops; for each, work out its iteration count as a function of $n$: linear, halving, triangular.
3. **Price every call** to something you did not write. Library calls are not free.
4. **Multiply nested things, add sequential things, keep the biggest.**

Try it on this.

```python
def closest_pair_sum(nums, target):
    nums.sort()                          # O(n log n)
    best = float('inf')
    lo, hi = 0, len(nums) - 1
    while lo < hi:                       # each iteration moves lo or hi: ≤ n iterations
        s = nums[lo] + nums[hi]
        if abs(s - target) < abs(best - target):
            best = s
        if s < target:
            lo += 1
        else:
            hi -= 1
    return best
```

The sort is $O(n \log n)$. The while loop looks like it could run forever, but every iteration moves `lo` up or `hi` down and they start $n - 1$ apart, so it runs at most $n - 1$ times. Trace it on `[1, 3, 4, 6, 8, 11, 14]` with target 15:

| Iteration | `lo` | `hi` | `s` | `best` | Move |
|---|---|---|---|---|---|
| 1 | 0 | 6 | 15 | 15 | `hi -= 1` |
| 2 | 0 | 5 | 12 | 15 | `lo += 1` |
| 3 | 1 | 5 | 14 | 15 | `lo += 1` |
| 4 | 2 | 5 | 15 | 15 | `hi -= 1` |
| 5 | 2 | 4 | 12 | 15 | `lo += 1` |
| 6 | 3 | 4 | 14 | 15 | `lo += 1` |
| stop | 4 | 4 | | 15 | `lo < hi` fails |

Six iterations for $n = 7$: the gap `hi - lo` starts at 6 and shrinks by exactly one per iteration, so the loop runs at most $n - 1$ times whatever the data. Total $O(n \log n) + O(n) = O(n \log n)$. That "every iteration makes progress on a bounded quantity" argument is the standard way to bound a loop with a non-obvious counter; the [invariants lesson](/learn/foundations/problem-solving/invariants-and-loop-reasoning) turns it into a habit.

```viz
{"type": "array", "algorithm": "two-pointers-sum", "values": [1, 3, 4, 6, 8, 11, 14], "target": 15, "title": "Two pointers: at most n steps", "caption": "lo and hi only ever move toward each other, so the loop runs at most n - 1 times regardless of the data."}
```

Now one that catches people.

```python
def build_string(parts):
    s = ""
    for p in parts:      # n iterations
        s += p           # copies the whole of s each time: O(len(s))
    return s
```

Strings are immutable, so `s += p` allocates a new string and copies both operands. With eight one-character parts the copies are 0, 1, 2, 3, 4, 5, 6, 7 characters: 28 in total, and for $n$ parts $0 + 1 + \cdots + (n - 1) = n(n-1)/2$, so $\Theta(n^2)$ characters copied. `"".join(parts)` measures the total length once, allocates once, and copies each part once: $\Theta(n)$. (CPython has an optimisation that resizes the string in place when its reference count is 1, which makes `+=` look linear in a micro-benchmark and then fail in code where another reference exists. The [strings lesson](/learn/foundations/how-code-runs/numbers-strings-unicode) has the details.)

And one where the input size is the trap.

```python
def is_prime(k):
    if k < 2:
        return False
    for d in range(2, int(k ** 0.5) + 1):   # ~sqrt(k) iterations
        if k % d == 0:
            return False
    return True
```

This runs $O(\sqrt{k})$ divisions. If $k$ has $b$ bits, $k \approx 2^b$, so $\sqrt{k} = 2^{b/2}$: exponential in the size of the input. For a 64-bit $k$ that is up to $4 \times 10^9$ divisions. It is fine for $k$ up to about $10^{12}$ and hopeless beyond; the [number theory lesson](/learn/foundations/math-for-engineers/number-theory-essentials) has the tools that scale.

## Best, worst and the one you should report

For a given algorithm and $n$, different inputs cost different amounts. Linear search takes 1 step if the target is first and $n$ if it is last or absent. The three standard summaries:

- **Worst case**: the maximum over inputs of size $n$. The default in interviews and in any system that must meet a latency bound. Your p99 is a worst-case-ish number.
- **Average case**: the expected cost over a distribution of inputs. Only meaningful if you say what the distribution is. "Hash table lookups are $O(1)$ on average" assumes the hash spreads keys uniformly, which a hostile client can break.
- **Best case**: rarely useful, except to note that an algorithm is adaptive (insertion sort is $O(n)$ on already-sorted input; Timsort exploits that).

There is a fourth, **amortised**, which is a worst-case bound on a *sequence* of operations rather than on one; it gets [its own lesson](/learn/foundations/complexity/amortized-analysis). The senior habit is to give the worst case, then name the average case if it is meaningfully better and say what assumption it rests on.

## Lower bounds: when Ω is the useful one

Upper bounds describe your algorithm. Lower bounds describe the *problem*, and they are how you answer "can you do better?" without guessing.

Any algorithm that must look at every input element is $\Omega(n)$: searching an unsorted array, summing, finding a maximum. No cleverness beats that, so an $O(n)$ solution to those is optimal and you can say so.

Sorting by comparisons is $\Omega(n \log n)$, and the argument is short enough to give in an interview. A comparison-based sort is a decision tree: each comparison has two outcomes, and the algorithm must be able to reach a different leaf for each of the $n!$ possible input orderings. A binary tree with $n!$ leaves has depth at least $\log_2 n!$, and by Stirling's approximation $\log_2 n! \approx n \log_2 n - 1.44n$. So some input forces at least that many comparisons. For $n = 10^6$ that is about 18.5 million comparisons; a top-down merge sort does about $n \log_2 n - n$, roughly 19 million, so it sits within a few percent of the bound. The way past the bound is to stop comparing: counting sort and radix sort inspect digits instead, and run in $O(n + k)$ or $O(nd)$; the [non-comparison sorts lesson](/learn/algorithms/sorting-searching/non-comparison-sorts-and-lower-bounds) covers when that is allowed.

The interview move: when asked "can you do better than $O(n \log n)$?", answer with the lower bound ("not by comparing; only if the keys are bounded integers, in which case counting sort is $O(n + k)$") rather than with a shrug.

## The notations side by side

| Notation | Claims | Analogy | Use it when | Common misuse |
|---|---|---|---|---|
| $O(g)$ | $f \le c \cdot g$ eventually | "at most" ($\le$) | bounding your algorithm's worst case | reading it as "exactly", so $O(n^2)$ sounds like a promise of quadratic time |
| $\Omega(g)$ | $f \ge c \cdot g$ eventually | "at least" ($\ge$) | lower bounds on a problem; showing a bound is tight | quoting a best-case $\Omega$ as though it limited the worst case |
| $\Theta(g)$ | both | "exactly, up to constants" ($=$) | the answer to "is that tight?" | writing $\Theta$ for an average case without stating the distribution |
| $o(g)$ | $f / g \to 0$ | "strictly less" ($<$) | proving one algorithm is asymptotically better | confusing $o$ with $O$; $n = O(n)$ but $n \ne o(n)$ |
| Amortised | total over $m$ ops $\le m \cdot c$ | "on average over a sequence, guaranteed" | dynamic arrays, hash tables, union-find | assuming it bounds a single operation's latency |

## Failure modes in production

**A "linear" job that is quadratic in a variable nobody named.** *Symptom:* a nightly reconciliation that took 20 minutes at 50,000 accounts takes 80 minutes at 100,000, then misses its window at 200,000. *Diagnosis:* doubling $n$ quadrupled the time, so something is $\Theta(n^2)$; the profile shows a per-account scan over all accounts ("find matching transactions" implemented as a nested loop, or a list membership test inside the loop). *Fix:* index the inner structure (a dictionary keyed by account, a sort plus a merge), then confirm the runtime doubles when $n$ doubles.

**Collapsing two variables into one.** *Symptom:* a "friends of friends" endpoint is fast for almost everyone and times out for a few thousand users. *Diagnosis:* the cost is $O(d^2)$ in the user's degree $d$, not $O(n)$ in anything; for a user with $10^5$ connections that is $10^{10}$ pair checks. Averages hid it because the median degree is 200. *Fix:* bound the work explicitly (cap $d$, sample, precompute for high-degree nodes) and report the complexity in the variable that actually varies.

**Measuring the wrong input size.** *Symptom:* a validation routine that "loops once" takes minutes on some requests. *Diagnosis:* the loop runs up to the *value* of a numeric field (a count, a timestamp, an ID), not the length of the input; a client sent $10^{12}$ and the loop obliged. *Fix:* make the loop bound a property of the data's size or a hard cap, and reject values above it at the boundary.

**Ignoring the base of the logarithm on disk.** *Symptom:* a lookup structure that is "$O(\log n)$" costs 30 ms per query once the data outgrows RAM. *Diagnosis:* it is a binary tree with one node per disk page: 30 levels means 30 dependent page reads at about 1 ms each on a spinning disk, or 30 × 100 µs on an SSD. *Fix:* a B-tree or a sorted-run structure whose fan-out matches the page size: 3–4 levels, 3–4 reads. Same class, tenfold fewer I/Os.

```exercise
id: count-halvings
title: How many times can n be halved?
prompt: |
  Implement `halvings(n)` that returns how many times you can replace `n` with `n // 2` (integer division) before it becomes 0, for a non-negative integer `n`. For example, `halvings(8)` is 4 because 8 → 4 → 2 → 1 → 0 takes four halvings.

  This is exactly the number of probes binary search needs in the worst case on `n` elements, and the number of bits in `n`'s binary representation. Do not use a logarithm function; a loop is fine and shows the mechanism.
languages: [python, javascript]
entry: halvings
starter:
  python: |
    def halvings(n):
        # count how many n // 2 steps reach 0
        return 0
  javascript: |
    function halvings(n) {
      // count how many Math.floor(n / 2) steps reach 0
      return 0;
    }
tests:
  - args: [0]
    expected: 0
    label: already zero
  - args: [1]
    expected: 1
  - args: [8]
    expected: 4
  - args: [1000]
    expected: 10
  - args: [1000000]
    expected: 20
  - args: [7]
    expected: 3
    hidden: true
  - args: [1073741824]
    expected: 31
    hidden: true
    label: 2^30
hints:
  - "Loop while n > 0, halving each time and counting; 1000 halves 10 times because 2^10 = 1024 > 1000 ≥ 2^9."
  - "In JavaScript use Math.floor(n / 2) or n >>> 1 (the unsigned shift keeps 2^30 positive)."
```

```exercise
id: largest-input-for-budget
title: Decode a constraint from an operation budget
prompt: |
  Implement `largest_input(budget, cls)`: the largest integer `n ≥ 1` whose cost does not exceed `budget` operations, or `0` if even `n = 1` is over budget. The cost of `n` for each class is defined exactly as:

  - `"linear"`: `n`
  - `"linearithmic"`: `n * floor(log2(n))` (so `n = 1` costs 0)
  - `"quadratic"`: `n * n`
  - `"cubic"`: `n * n * n`
  - `"exponential"`: `2 ** n`
  - `"factorial"`: `n!`

  `budget` is at most 10⁹. Every cost function is non-decreasing in `n`, so you can binary search on `n` (double an upper bound until it is over budget, then bisect) instead of scanning; the linear class would otherwise need a billion steps. Do not use floating-point logarithms for `floor(log2(n))`; use `bit_length() - 1` in Python or `31 - Math.clz32(n)` in JavaScript.
languages: [python, javascript]
entry: largest_input
starter:
  python: |
    def largest_input(budget, cls):
        def cost(n):
            # return the cost of n under cls
            return n
        # find the largest n with cost(n) <= budget
        return 0
  javascript: |
    function largest_input(budget, cls) {
      function cost(n) {
        // return the cost of n under cls
        return n;
      }
      // find the largest n with cost(n) <= budget
      return 0;
    }
tests:
  - args: [100000000, "quadratic"]
    expected: 10000
  - args: [100000000, "cubic"]
    expected: 464
  - args: [100000000, "exponential"]
    expected: 26
  - args: [100000000, "factorial"]
    expected: 11
  - args: [1000000, "linearithmic"]
    expected: 65535
  - args: [1, "exponential"]
    expected: 0
    label: n = 1 costs 2, over budget
  - args: [0, "linear"]
    expected: 0
    label: zero budget
  - args: [100000000, "linear"]
    expected: 100000000
    hidden: true
    label: a linear scan would take 10^8 steps
  - args: [100000000, "linearithmic"]
    expected: 4545454
    hidden: true
  - args: [1000000000, "factorial"]
    expected: 12
    hidden: true
hints:
  - "Grow hi by doubling while cost(hi) <= budget, then bisect between lo (known to fit) and hi (known not to). The invariant is cost(lo) <= budget < cost(hi)."
  - "For the factorial class compute n! with a loop; for n up to 13 it stays below 2^53, and 13! already exceeds 10^9."
```

## Interviewer follow-ups

**"You said O(n log n). Is that tight, and for which case?"** *Model answer:* it is $\Theta(n \log n)$ in the worst case because the sort dominates and the sort is $\Theta(n \log n)$ on every input for merge sort (or on average for quicksort); the two-pointer pass after it is $\Theta(n)$. *Common wrong answer:* "yes, it's $O(n \log n)$", restating the upper bound without saying whether anything smaller is possible or which case is meant.

**"Can you beat O(n log n) here?"** *Model answer:* not with comparisons, because any comparison sort is $\Omega(n \log n)$ by the decision-tree argument; if the keys are integers in a bounded range I can counting-sort in $O(n + k)$, and if I only need the top $k$ elements a heap gives $O(n \log k)$. *Common wrong answer:* "no, sorting is always $n \log n$", which is false for bounded keys, or "yes, with a hash map", which does not produce a sorted order.

**"Your graph solution is O(n). What is n?"** *Model answer:* I should say $O(V + E)$: the traversal visits each vertex once and scans each adjacency list once, so the cost is the vertex count plus the edge count, and on a dense graph that is $O(V^2)$. *Common wrong answer:* collapsing to $O(V)$ (forgetting edges) or to $O(V^2)$ (assuming density) without saying which.

**"log n is effectively constant, so is binary search O(1)?"** *Model answer:* no; it is $\Theta(\log n)$ and the constant per probe is not small: on a 512 MB array the last several probes are DRAM misses, so a search costs about half a microsecond, ten times what it costs when the array fits in L1. "Effectively constant" is a remark about the count of probes, not their price. *Common wrong answer:* "yes, 30 probes is nothing", which ignores that 30 dependent cache misses are 3 µs.

**"The constraint says n ≤ 10⁵ and you proposed O(n²). What now?"** *Model answer:* $10^{10}$ operations is about 100 s in Python and tens of seconds compiled, so the quadratic approach is out; the constraint tells me the intended class is $O(n \log n)$ or $O(n)$, which usually means sorting, a hash map, two pointers or a sliding window. *Common wrong answer:* "I'll optimise the inner loop", which shaves a constant off a class that is 100× over budget.

## What mid-level engineers get wrong

- **Using O and Θ interchangeably**, then being unable to answer "is that tight?". The consequence is looking unsure about a definition on the first question of the interview.
- **Reading a constraint after designing the solution** instead of before, so the first ten minutes go into an approach the constraint already ruled out.
- **Collapsing variables** ($O(V + E)$ into $O(n)$, $O(nm)$ into $O(n^2)$), which hides exactly the case (a dense graph, a long second input) where the system falls over.
- **Treating $\log n$ as free**, then designing a structure with 30 dependent memory accesses per lookup where a B-tree or a sorted array with a cache-friendly layout would do three.
- **Measuring input size by value rather than by length**, calling trial division "linear" or a loop over a numeric field "one pass".
- **Reporting the average case with no assumption attached**, which is an invitation for the interviewer to supply the adversarial input.

## Senior signals

- You say "$\Theta(n \log n)$, and that's tight" rather than the vaguer "$O(n \log n)$", and you know that $O$ is an upper bound that permits slack.
- You can produce $c$ and $n_0$ for a concrete bound on request and you know the $n_0$ is often in the thousands, which is why constants matter below it.
- You decode a constraint like $n \le 10^5$ into "quadratic is out, $n \log n$ is intended" before you start designing, and $n \le 20$ into "subset enumeration is fine", and you can say where the $10^8$-per-second budget comes from.
- You keep separate variables for separate inputs ($O(V + E)$, $O(nm)$, $O(n \cdot L)$) and do not collapse them without saying what you assumed.
- You can do $\log_2$ of a billion in your head (about 30), explain why base does not matter asymptotically but does matter for a B-tree, and put a price on a probe (nanoseconds from cache, about 100 ns from DRAM, tens of microseconds from disk).
- You answer "can you do better?" with a lower bound when one exists, and you know the comparison-sorting bound and how counting sort steps around it.
- You state which case (worst, average, amortised) you are reporting and what distributional assumption the average rests on.
- When the input is a number, you know the input size is its digit count and can say why trial division is exponential.

## Check yourself

```quiz
- q: >-
    Binary search on a sorted array of n elements is correctly described as which of the following?
  options: ["Ω(n), because any algorithm must read its input", "Θ(log n) worst case, and O(n) is also true", "Θ(1), because log n is effectively constant", "O(log n) only; calling it O(n) would be false"]
  answer: 1
  explanation: >-
    The tight worst-case bound is Θ(log n). Because Big-O is only an upper bound, O(n) is also a true (if uninformative) statement; treating O as if it meant "tight" confuses it with Θ. Binary search does not read the whole input, so Ω(n) is false. "Effectively constant" is an engineering remark, not a complexity class.
- q: >-
    A problem states 1 ≤ n ≤ 200,000. Which complexity is the intended solution most likely to have?
  options: ["O(n log n) or O(n)", "O(2^n) with memoisation", "O(n³), small constants", "O(n²), tight inner loop"]
  answer: 0
  explanation: >-
    n² = 4 × 10¹⁰ operations is minutes of work, so quadratic is ruled out however tight the inner loop; n log n ≈ 3.6 × 10⁶ is comfortable. Exponential and cubic are far worse. The constraint is the setter telling you the target class.
- q: >-
    Binary search over a 512 MB sorted array measured about 18 ns per probe, while over an 8 KB array it measured under 4 ns per probe. Which explanation is right?
  options: ["The compiler vectorises searches on small arrays but not on large ones", "Only the bottom few probes miss cache; the top of the search tree stays resident", "The larger array needs more probes, so each one is slower", "Every probe on the large array is a 100 ns DRAM miss, averaged with loop overhead"]
  answer: 1
  explanation: >-
    Every search visits the same midpoints at the top levels, so those cache lines stay hot across searches; only the last several probes, whose positions are spread over the whole array, miss to DRAM. That is why the per-probe average rises to 18 ns rather than to 100 ns. Probe count does not change per-probe cost, and binary search cannot be vectorised.
- q: >-
    A function loops over an array of n strings and, for each, checks membership in a Python list that accumulates the results so far. What is its complexity, and what one change fixes it?
  options: ["O(n²); switch the results to a set", "O(n log n); sort the list before looping", "O(n); the loop is already linear", "O(n²); preallocate the list up front"]
  answer: 0
  explanation: >-
    `x in a_list` scans the list, O(k) at step k, so the total is O(n²). A set turns each membership test into expected O(1), making the whole thing O(n). Preallocation does not change scan cost; sorting does not help a membership test that runs inside the loop.
- q: >-
    An interviewer asks whether you can sort n arbitrary comparable objects faster than O(n log n). What is the senior answer?
  options: ["Yes; a hash map groups equal keys in O(n) and then reads them out in order", "No; the comparison lower bound is Ω(n log n), unless the keys allow a non-comparison sort", "No; sorting is Θ(n log n) for every algorithm regardless of the key type", "Yes; Timsort runs in O(n) on real-world data, so the bound does not apply"]
  answer: 1
  explanation: >-
    A decision tree with n! leaves has depth at least log₂(n!) ≈ n log₂ n − 1.44n, so any comparison sort needs that many comparisons on some input. Counting and radix sorts escape the bound by inspecting digits of bounded keys. A hash map has no order, and Timsort's O(n) best case is for already-sorted runs, not a general guarantee.
- q: >-
    Checking whether an integer k is prime by trial division up to √k runs in O(√k) divisions. Why is this not considered a polynomial-time algorithm?
  options: ["Input size is the bit count b, and √k = 2^(b/2)", "Each trial division costs O(k) time, not O(1)", "Its worst case tries every divisor up to k, not √k", "It is polynomial, since O(√k) equals O(k^0.5)"]
  answer: 0
  explanation: >-
    Complexity is measured against the size of the input, and a number's size is its digit or bit count b. A 64-bit number takes up to 2^32 divisions; doubling the bit count squares the work. So √k = 2^(b/2) is exponential in the input size even though it looks like a small power of k; calling it polynomial measures against the value k instead of its size.
```
