---
slug: counting-and-combinatorics
title: "Counting and combinatorics: sizing the search space"
description: Permutations, combinations, subsets and paths counted from first principles, plus pigeonhole and inclusion-exclusion, so you can tell in ten seconds whether brute force will finish and how many cases your code must handle.
minutes: 45
difficulty: medium
tags: [math, combinatorics, counting, permutations, combinations]
problems: [subsets, permutations, unique-paths, combination-sum]
---
An interviewer says "the input has at most 20 items; return every valid grouping". A teammate asks how many test cases cover a feature flag matrix. A design review asks how many distinct keys a sharding scheme can produce. Each is a counting question, and each has a known answer if you can recognise which of four or five shapes it is.

Counting is also how you know when *not* to brute force. Before you write a search, you estimate how big the space is; if it is $2^{20}$ you enumerate it and go home, if it is $20!$ you find structure. Engineers who skip this step write code that works on the examples and times out on the real input. This lesson gives you the shapes, the formulas, and the feel for their sizes.

## Two rules everything is built from

**Product rule.** If a choice has $a$ options and an independent second choice has $b$ options, there are $a \cdot b$ combined outcomes. A PIN has $10 \cdot 10 \cdot 10 \cdot 10 = 10^4$ possibilities. A configuration with 5 boolean flags has $2^5 = 32$ states. A feature matrix of 3 browsers, 4 OS versions and 2 locales has 24 cells.

**Sum rule.** If two options are mutually exclusive, add them. A user logs in with a password (one path) *or* a passkey (a second path): the total number of login flows is the sum.

Everything below is these two rules applied carefully. The word "independent" in the product rule is where mistakes live: if the second choice depends on the first, you have to count the dependent cases separately or use a different formula.

## Permutations: ordering matters

How many ways can you arrange $n$ distinct items in a line? The first slot has $n$ options, the second has $n - 1$ (one item is used), the third $n - 2$, and so on:

$$n! = n \cdot (n - 1) \cdot (n - 2) \cdots 2 \cdot 1$$

$3! = 6$: `abc, acb, bac, bca, cab, cba`. $10! = 3{,}628{,}800$. $20! \approx 2.4 \times 10^{18}$, which just fits in a 64-bit unsigned integer; $21!$ does not. Factorials grow faster than exponentials, which is why "try every ordering" is feasible only up to about $n = 11$ or $12$ in practice (the [logarithms lesson](/learn/foundations/math-for-engineers/logarithms-and-exponentials) has the feasibility table).

Choosing and ordering only $k$ of the $n$ items is the same product cut short:

$$P(n, k) = n \cdot (n - 1) \cdots (n - k + 1) = \frac{n!}{(n - k)!}$$

Three medals among eight runners: $8 \cdot 7 \cdot 6 = 336$. Note that you compute it as the short product, not as two factorials divided, because $8!/5!$ forms $40{,}320$ needlessly and for larger $n$ overflows.

Where it appears: [Permutations](/practice/permutations) and its backtracking cousins enumerate $n!$ arrangements; scheduling problems that try every order of $n$ tasks; the travelling salesman brute force ($n!$ tours, which is why TSP is hard).

## Combinations: ordering does not matter

How many ways can you choose $k$ items from $n$ when the order of the chosen items is irrelevant? Start with $P(n, k)$ ordered selections. Each unordered set of $k$ items was counted $k!$ times (once per ordering), so divide:

$$\binom{n}{k} = \frac{P(n, k)}{k!} = \frac{n!}{k!\,(n - k)!}$$

Read "n choose k". Five-card poker hands from 52 cards: $\binom{52}{5} = 2{,}598{,}960$. Choosing 2 replicas out of 5 nodes: $\binom{5}{2} = 10$. Pairs among $n$ items: $\binom{n}{2} = n(n - 1)/2$, which is why any "compare every pair" algorithm is $\Theta(n^2)$.

Properties you will use:

- **Symmetry**: $\binom{n}{k} = \binom{n}{n - k}$. Choosing which 3 of 50 servers to drain is the same as choosing which 47 to keep.
- **Pascal's identity**: $\binom{n}{k} = \binom{n-1}{k-1} + \binom{n-1}{k}$. Either item $n$ is in the set (choose $k - 1$ more from the rest) or it is not (choose all $k$ from the rest). This is the recurrence behind Pascal's triangle and behind the DP you would write if $n$ were large and you needed many values mod a prime.
- **Row sum**: $\sum_k \binom{n}{k} = 2^n$. Every subset has *some* size.
- **The middle is the biggest**: $\binom{n}{n/2}$ dominates. $\binom{30}{15} = 155{,}117{,}520$; $\binom{40}{20} \approx 1.4 \times 10^{11}$. If a problem's search space is "all subsets of size $n/2$", it is nearly as large as all subsets.

### Computing it without overflow

Never compute $n!$ and divide. Even $\binom{60}{30}$ has a manageable answer ($1.2 \times 10^{17}$) while $60!$ is $8 \times 10^{81}$. Use the multiplicative form, which keeps every intermediate value equal to a smaller binomial coefficient (and so an integer):

```python
def n_choose_k(n: int, k: int) -> int:
    if k < 0 or k > n:
        return 0
    k = min(k, n - k)          # symmetry: fewer iterations, smaller values
    result = 1
    for i in range(1, k + 1):
        result = result * (n - k + i) // i    # exact: result is C(n-k+i, i)
    return result
```

Trace $\binom{5}{2}$: $k = 2$. $i = 1$: $1 \cdot 4 / 1 = 4$ (that is $\binom{4}{1}$). $i = 2$: $4 \cdot 5 / 2 = 10$ (that is $\binom{5}{2}$). The division is exact at every step because after multiplying by $(n - k + i)$ the running value is $i \cdot \binom{n-k+i}{i}$, which $i$ divides. Multiply before dividing, always; `result // i * (n-k+i)` would truncate.

Under a modulus you cannot divide, so you either build Pascal's triangle ($O(nk)$ additions) or precompute factorials and their [modular inverses](/learn/foundations/math-for-engineers/number-theory-essentials).

## Subsets and bit strings

Each of $n$ items is either in a subset or out: two choices, $n$ times, $2^n$ subsets. Equivalently, subsets of an $n$-element set correspond one-to-one with $n$-bit integers, bit $i$ saying whether item $i$ is included. The [bit manipulation lesson](/learn/foundations/math-for-engineers/bit-manipulation) turns that correspondence into a loop; here is the same enumeration as a recursion tree, where each level decides one item:

```viz
{"type": "recursion", "algorithm": "subsets", "values": [1, 2, 3], "title": "2^3 = 8 subsets", "caption": "Each level of the tree makes one in-or-out decision, so the leaves number 2 * 2 * 2. The empty subset and the full set are both leaves."}
```

Combinations of a fixed size are the subsets with exactly $k$ bits set:

```viz
{"type": "recursion", "algorithm": "combinations", "values": [1, 2, 3, 4], "k": 2, "title": "C(4, 2) = 6 combinations", "caption": "Same tree, but branches that can no longer reach k items are pruned. Pruning is what makes combination enumeration cheaper than subset enumeration."}
```

Where $2^n$ appears: [Subsets](/practice/subsets), subset-sum and partition problems, bitmask DP over "which items are used", the feature-flag matrix. When $n \le 20$ the space is a million and a plain loop over masks is the intended solution. When $n \approx 40$, meet-in-the-middle splits it into two $2^{20}$ halves.

## Grid paths and stars and bars

Two more shapes that reduce to binomials and appear constantly in interviews.

**Lattice paths.** How many ways to walk from the top-left of an $m \times n$ grid to the bottom-right moving only right or down? Every path is a sequence of $(m - 1)$ downs and $(n - 1)$ rights in some order: $m + n - 2$ moves, of which you choose which $m - 1$ are downs.

$$\text{paths}(m, n) = \binom{m + n - 2}{m - 1}$$

A $3 \times 3$ grid: $\binom{4}{2} = 6$. A $10 \times 10$ grid: $\binom{18}{9} = 48{,}620$. [Unique Paths](/practice/unique-paths) is exactly this; the DP solution rebuilds Pascal's triangle cell by cell, which is a good thing to say out loud when you solve it.

**Stars and bars.** How many ways to distribute $k$ identical items into $n$ distinguishable bins (some possibly empty)? Line up $k$ stars and $n - 1$ bars; each arrangement is a distribution. $\binom{k + n - 1}{n - 1}$ ways. Four identical requests to three servers: $\binom{6}{2} = 15$ load patterns. This counts *multisets*, which is why it also answers "how many non-decreasing sequences of length $k$ over $n$ values", and it bounds the state space of counting-based DPs.

## The pigeonhole principle

If you put $n + 1$ items into $n$ boxes, some box has at least two. Obvious, and surprisingly sharp:

- Any array of $n + 1$ integers drawn from $1..n$ contains a duplicate. That guarantee is the premise of [Find the Duplicate Number](/practice/find-duplicate-number), where the duplicate's existence lets you use cycle detection instead of a hash set.
- A hash table with $m$ buckets and more than $m$ keys *must* have a collision, no matter how good the hash. Collision handling is not optional.
- Among any 367 people two share a birthday. (The [probability lesson](/learn/foundations/math-for-engineers/probability-for-engineers) shows that with random birthdays you only need 23 for a coin-flip chance.)
- Any sequence of $n^2 + 1$ distinct numbers contains a monotone subsequence of length $n + 1$ (Erdős–Szekeres). This is the reason patience sorting and LIS bounds work.
- Any lossless compressor that shrinks some inputs must expand others: there are $2^n$ inputs of $n$ bits and only $2^n - 1$ shorter outputs.

The generalised form: $n$ items in $m$ boxes means some box has at least $\lceil n / m \rceil$. That is the "average chain length is $n/m$, so some chain is at least that" argument for hash tables.

## Inclusion-exclusion

The sum rule needs mutually exclusive cases. When cases overlap, you subtract the overlap:

$$|A \cup B| = |A| + |B| - |A \cap B|$$
$$|A \cup B \cup C| = |A| + |B| + |C| - |A \cap B| - |A \cap C| - |B \cap C| + |A \cap B \cap C|$$

Worked example: how many integers from 1 to 100 are divisible by 2, 3 or 5? Divisible by 2: 50. By 3: 33. By 5: 20. Subtract the pairwise overlaps: by 6: 16, by 10: 10, by 15: 6. Add back the triple overlap, by 30: 3.

$$50 + 33 + 20 - 16 - 10 - 6 + 3 = 74$$

Check the complement: 26 numbers up to 100 are coprime to 30. The sign pattern (add singles, subtract pairs, add triples) continues for any number of sets, and for $k$ sets it needs $2^k - 1$ terms, which is itself a subset enumeration.

Where it appears in engineering: counting users who match *any* of several segments from per-segment counts; the "count strings avoiding all forbidden patterns" family of problems; derangements ("how many permutations move every element", which is $n! \sum_{i=0}^{n} (-1)^i / i! \approx n!/e$); and estimating cardinality of a union from cardinalities of parts, which is the problem HyperLogLog sidesteps.

## Turning counts into decisions

The reason to know these numbers is to make decisions quickly. A reference table for "will brute force finish in about a second?" at roughly $10^8$–$10^9$ simple operations:

| Search space | Formula | $n = 10$ | $n = 15$ | $n = 20$ | $n = 30$ |
|---|---|---|---|---|---|
| Orderings | $n!$ | 3.6 × 10⁶ | 1.3 × 10¹² | 2.4 × 10¹⁸ | 2.7 × 10³² |
| Subsets | $2^n$ | 1,024 | 32,768 | 1.0 × 10⁶ | 1.1 × 10⁹ |
| Half-size subsets | $\binom{n}{n/2}$ | 252 | 6,435 | 184,756 | 1.6 × 10⁸ |
| Pairs | $\binom{n}{2}$ | 45 | 105 | 190 | 435 |
| Triples | $\binom{n}{3}$ | 120 | 455 | 1,140 | 4,060 |

Reading the table: subsets are fine to $n \approx 25$ and borderline at 30. Orderings die at 12. Pairs and triples are fine into the thousands ($\binom{5000}{2} \approx 1.2 \times 10^7$; $\binom{500}{3} \approx 2 \times 10^7$), which is why $O(n^2)$ pair enumeration is acceptable for "n up to a few thousand" constraints and $O(n^3)$ for "n up to a few hundred".

A second use is **test-case counting**. Four boolean feature flags give 16 combinations; if you test only the all-on and all-off cases you have covered 2 of 16. A form with three fields, each valid, empty or malformed, has $3^3 = 27$ combinations. You will not test all 27, but knowing the number tells you how much you are leaving to chance, and *pairwise* testing (every pair of values co-occurs at least once) covers most interaction bugs with far fewer cases: for 3 fields × 3 values, 9 cases instead of 27.

A third use is **entropy and ID sizing**. A random 8-character identifier over 62 alphanumerics has $62^8 \approx 2.2 \times 10^{14}$ values, about 47.6 bits. Whether that is "enough" depends on the birthday bound, not on the count alone, and that is the next lesson.

## Exercises

```exercise
id: n-choose-k
title: Binomial coefficient without overflow
prompt: |
  Return $\binom{n}{k}$, the number of ways to choose `k` items from `n`
  (`0 <= n`). Return 0 when `k < 0` or `k > n`. Do not compute `n!`: use
  the multiplicative formula, multiplying before dividing so every
  intermediate value is an exact integer. All answers fit in a
  JavaScript number (below 2^53); use integer division (`//` in Python,
  `Math.round(x / i)` or a running exact quotient in JavaScript).
languages: [python, javascript]
entry: n_choose_k
starter:
  python: |
    def n_choose_k(n, k):
        # your code here
        return 0
  javascript: |
    function n_choose_k(n, k) {
      // your code here
      return 0;
    }
tests:
  - args: [5, 2]
    expected: 10
  - args: [0, 0]
    expected: 1
    label: one way to choose nothing from nothing
  - args: [5, 7]
    expected: 0
    label: k > n
  - args: [6, 3]
    expected: 20
  - args: [52, 5]
    expected: 2598960
    label: poker hands
  - args: [30, 15]
    expected: 155117520
  - args: [10, 0]
    expected: 1
    hidden: true
  - args: [40, 20]
    expected: 137846528820
    hidden: true
    label: would overflow 32 bits, fits in a double exactly
hints:
  - "Use symmetry first: k = min(k, n - k)."
  - "Loop i from 1 to k, doing result = result * (n - k + i) / i. The division is exact at every step."
  - "In JavaScript the product before division stays under 2^53 for every test, so plain numbers are fine as long as you divide with exact integer results (Math.round guards against 1e-12 float noise)."
```

```exercise
id: grid-paths
title: Count lattice paths
prompt: |
  A robot starts at the top-left cell of an `m`-row by `n`-column grid
  (`m, n >= 1`) and may only move right or down. Return the number of
  distinct paths to the bottom-right cell. Use counting, not a search:
  every path is a choice of which `m - 1` of the `m + n - 2` moves are
  downward moves.
languages: [python, javascript]
entry: grid_paths
starter:
  python: |
    def grid_paths(m, n):
        # your code here
        return 0
  javascript: |
    function grid_paths(m, n) {
      // your code here
      return 0;
    }
tests:
  - args: [1, 1]
    expected: 1
    label: already there
  - args: [2, 2]
    expected: 2
  - args: [3, 3]
    expected: 6
  - args: [3, 7]
    expected: 28
  - args: [4, 4]
    expected: 20
  - args: [1, 5]
    expected: 1
    hidden: true
    label: a single row has one path
  - args: [10, 10]
    expected: 48620
    hidden: true
hints:
  - "The answer is C(m + n - 2, m - 1). Reuse the multiplicative binomial formula."
```

## Senior signals

- You size the search space before choosing an approach: "$2^{20}$, enumerate it" or "$15!$, we need pruning or DP", said within the first minute.
- You compute binomials with the multiplicative formula and can say why the division is exact at every step, and you know that under a modulus you need Pascal's triangle or modular inverses instead.
- You recognise the four shapes (orderings, subsets, $k$-subsets, lattice paths) in a problem statement even when it is dressed up as servers, tasks or robots.
- You use pigeonhole as a *proof* tool: "there are $n + 1$ values in a range of $n$, so a duplicate exists, so cycle detection applies."
- You correct overlapping counts with inclusion-exclusion rather than double-counting, and you know that estimating a union from parts is what makes distinct-count analytics hard.
- You count test combinations and consciously choose pairwise coverage instead of pretending three cases cover a 27-cell matrix.

## Check yourself

```quiz
- q: >-
    A problem asks you to try every way of assigning 12 tasks to 12 workers, one task each. How many assignments are there, and is brute force plausible?
  options: ["2^12 = 4,096; trivially", "12^2 = 144; trivially", "12! ≈ 4.8 × 10^8; borderline, feasible only with a fast inner loop", "12! ≈ 4.8 × 10^8; impossible"]
  answer: 2
  explanation: >-
    One-to-one assignments are orderings, n!, and 12! is about 479 million. At 10^8 to 10^9 simple operations per second that is seconds, feasible but borderline; 13! would be ten times worse. 2^12 counts subsets, not bijections.
- q: >-
    Why does `n_choose_k` multiply by `(n - k + i)` before dividing by `i` in each iteration, rather than dividing first?
  options: ["It is faster", "The running value after the multiplication is i times a binomial coefficient, so the division is exact; dividing first can truncate", "Division by i is only defined after multiplication in Python", "It avoids negative numbers"]
  answer: 1
  explanation: >-
    After step i the running value equals C(n - k + i, i), an integer, because the numerator i * C(n-k+i, i) is divisible by i. Dividing the previous value by i first can produce a non-integer that integer division truncates, giving a wrong result.
- q: >-
    A grid has 4 rows and 6 columns. How many right/down paths lead from the top-left to the bottom-right corner?
  options: ["24", "56", "70", "126"]
  answer: 1
  explanation: >-
    A path is 3 downs and 5 rights in some order: C(8, 3) = 56. 70 is C(8, 4), which would be a 5 × 5 grid; 24 is 4 × 6, the number of cells; 126 is C(9, 4).
- q: >-
    An array of length 1,001 contains integers between 1 and 1,000. Which claim is guaranteed, without any assumption about randomness?
  options: ["The array is sorted", "At least one value appears twice", "Exactly one value appears twice", "No value appears more than twice"]
  answer: 1
  explanation: >-
    Pigeonhole: 1,001 items in 1,000 boxes forces some box to hold at least two. Nothing forces uniqueness of the repeated value or bounds how often it repeats.
- q: >-
    Segment A has 5,000 users, segment B has 3,000, and 1,200 users are in both. How many users are in at least one segment, and what goes wrong if you just add?
  options: ["8,000; nothing goes wrong", "6,800; adding counts the 1,200 shared users twice", "3,800; you must subtract both overlaps", "8,000; the overlap is already excluded from each segment"]
  answer: 1
  explanation: >-
    |A ∪ B| = |A| + |B| - |A ∩ B| = 5,000 + 3,000 - 1,200 = 6,800. Plain addition double-counts the intersection. 3,800 subtracts it twice.
```
