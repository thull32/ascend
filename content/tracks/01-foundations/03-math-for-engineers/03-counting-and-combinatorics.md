---
slug: counting-and-combinatorics
title: "Counting and combinatorics: sizing the search space"
description: Permutations, combinations, subsets, lattice paths and stars-and-bars derived from two rules and traced by hand, pigeonhole and inclusion-exclusion applied to hash tables, analytics and derangements, the overflow-safe binomial with its exactness proof, and how counting sizes test matrices, replica placement and brute-force budgets.
minutes: 45
difficulty: medium
tags: [math, combinatorics, counting, permutations, combinations, inclusion-exclusion, pigeonhole]
problems: [subsets, permutations, unique-paths, combination-sum]
---
An interviewer says "the input has at most 20 items; return every valid grouping". A teammate asks how many CI jobs a matrix of 3 browsers, 4 OS versions and 3 locales needs. A design review asks how many distinct 3-node replica sets a 12-node cluster can form, and whether that number is good or bad for durability. Each is a counting question, and each has a known answer if you can recognise which of five shapes it is.

Counting is also how you know when *not* to brute force. Before you write a search, you estimate how big the space is; if it is $2^{20}$ you enumerate it and go home, if it is $20!$ you find structure. Engineers who skip this step write code that works on the examples and times out on the real input. This lesson gives you the shapes, the formulas derived from two rules, the traces that show the formulas are right, and the places in production where the count is the decision.

## Two rules everything is built from

**Product rule.** If a choice has $a$ options and an independent second choice has $b$ options, there are $a \cdot b$ combined outcomes. A four-digit PIN has $10^4$ possibilities. A configuration with 5 boolean flags has $2^5 = 32$ states. The CI matrix above has $3 \cdot 4 \cdot 3 = 36$ cells.

**Sum rule.** If two options are mutually exclusive, add them. A user logs in with a password (one path) *or* a passkey (a second path): the total number of login flows is the sum.

Everything below is these two rules applied carefully. The word "independent" in the product rule is where mistakes live: if the second choice depends on the first, you count the dependent cases separately or use a formula that already did. The word "exclusive" in the sum rule is where the other mistakes live, and inclusion–exclusion below is the repair.

## Permutations: ordering matters

How many ways can you arrange $n$ distinct items in a line? The first slot has $n$ options, the second $n - 1$ (one item is used), the third $n - 2$, and so on: the product rule with a dependent second choice, which is fine because the *number* of options at each step does not depend on which item was picked.

$$n! = n \cdot (n - 1) \cdot (n - 2) \cdots 2 \cdot 1$$

$3! = 6$: `abc, acb, bac, bca, cab, cba`. $10! = 3{,}628{,}800$. $12! = 479{,}001{,}600$. $20! = 2{,}432{,}902{,}008{,}176{,}640{,}000$, which fits in an unsigned 64-bit integer ($1.8 \times 10^{19}$); $21! = 5.1 \times 10^{19}$ does not. Factorials grow faster than any exponential, which is why "try every ordering" is feasible only up to about $n = 11$ or $12$ (the [logarithms lesson](/learn/foundations/math-for-engineers/logarithms-and-exponentials) has the feasibility table).

Choosing and ordering only $k$ of the $n$ items is the same product cut short:

$$P(n, k) = n \cdot (n - 1) \cdots (n - k + 1) = \frac{n!}{(n - k)!}$$

Three medals among eight runners: $8 \cdot 7 \cdot 6 = 336$. Compute it as the short product, not as two factorials divided: $8!/5!$ forms $40{,}320$ needlessly, and for $n = 25$ the numerator overflows 64 bits while the answer does not.

Where it appears: [Permutations](/practice/permutations) and its backtracking cousins enumerate $n!$ arrangements; scheduling problems that try every order of $n$ tasks; the travelling salesman brute force ($n!$ tours, which is why TSP is hard).

## Combinations: ordering does not matter

How many ways can you choose $k$ items from $n$ when the order of the chosen items is irrelevant? Start with $P(n, k)$ ordered selections. Each unordered set of $k$ items was counted exactly $k!$ times, once per ordering of its members, so divide:

$$\binom{n}{k} = \frac{P(n, k)}{k!} = \frac{n!}{k!\,(n - k)!}$$

Read "n choose k". Five-card poker hands from 52 cards: $\binom{52}{5} = 2{,}598{,}960$. Choosing 3 replicas out of 12 nodes: $\binom{12}{3} = 220$. Pairs among $n$ items: $\binom{n}{2} = n(n - 1)/2$, which is why every "compare every pair" algorithm is $\Theta(n^2)$ and why the birthday bound in the [next lesson](/learn/foundations/math-for-engineers/probability-for-engineers) is about $n^2$, not $n$.

Properties you will use, each with its one-line reason:

- **Symmetry**: $\binom{n}{k} = \binom{n}{n - k}$. Choosing which 3 of 50 servers to drain is the same choice as which 47 to keep.
- **Pascal's identity**: $\binom{n}{k} = \binom{n-1}{k-1} + \binom{n-1}{k}$. Fix one item: either it is in the set (choose $k - 1$ more from the remaining $n - 1$) or it is not (choose all $k$ from the remaining $n - 1$). Sum rule, exclusive cases. This is the recurrence behind Pascal's triangle and behind the DP you would write if you needed many values modulo a prime.
- **Row sum**: $\sum_k \binom{n}{k} = 2^n$. Every subset has *some* size.
- **The middle is the biggest**: $\binom{30}{15} = 155{,}117{,}520$; $\binom{40}{20} = 137{,}846{,}528{,}820$. If a problem's search space is "all subsets of size $n/2$", it is within a factor of about $\sqrt{n}$ of all $2^n$ subsets, not meaningfully smaller.

### Computing it without overflow, and why the division is exact

Never compute $n!$ and divide. $\binom{60}{30}$ is $1.2 \times 10^{17}$ and fits in 64 bits; $60!$ is $8 \times 10^{81}$ and does not. Use the multiplicative form, which keeps every intermediate value equal to a smaller binomial coefficient:

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

Trace $\binom{10}{3}$:

| $i$ | `result` before | `* (n - k + i)` | `// i` | `result` after | equals |
|---|---|---|---|---|---|
| 1 | 1 | $1 \cdot 8 = 8$ | $8 / 1$ | 8 | $\binom{8}{1}$ |
| 2 | 8 | $8 \cdot 9 = 72$ | $72 / 2$ | 36 | $\binom{9}{2}$ |
| 3 | 36 | $36 \cdot 10 = 360$ | $360 / 3$ | 120 | $\binom{10}{3}$ |

The division is exact at every step because of the identity $\binom{m}{i} = \binom{m-1}{i-1} \cdot \frac{m}{i}$: after step $i - 1$ the running value is $\binom{n-k+i-1}{i-1}$, multiplying by $n - k + i$ gives $i \cdot \binom{n-k+i}{i}$, an integer multiple of $i$. Multiply *before* dividing, always; `result // i * (n - k + i)` truncates at $i = 2$ in the trace above ($8 // 2 = 4$, then $36$: correct by luck, and at $i = 3$, $36 // 3 = 12$, $12 \cdot 10 = 120$, also luck; on $\binom{10}{4}$ it fails).

In JavaScript this loop is exact as long as the *intermediate product* stays below $2^{53}$. Every $\binom{n}{k}$ with $n \le 56$ is below $2^{53}$ (the largest, $\binom{56}{28} = 7.6 \times 10^{15}$, is under $9.0 \times 10^{15}$); at $n = 57$ the middle coefficient is $1.5 \times 10^{16}$ and the result is silently rounded. Beyond that, `BigInt`. Under a modulus you cannot divide at all, so you either build Pascal's triangle ($O(nk)$ additions) or precompute factorials and their [modular inverses](/learn/foundations/math-for-engineers/number-theory-essentials).

## Subsets and bit strings

Each of $n$ items is either in a subset or out: two choices, $n$ times, $2^n$ subsets. Equivalently, subsets of an $n$-element set correspond one-to-one with $n$-bit integers, bit $i$ saying whether item $i$ is included. The [bit manipulation lesson](/learn/foundations/math-for-engineers/bit-manipulation) turns that correspondence into a loop; here is the same enumeration as a recursion tree, where each level decides one item:

```viz
{"type": "recursion", "algorithm": "subsets", "values": [1, 2, 3], "title": "2^3 = 8 subsets", "caption": "Each level of the tree makes one in-or-out decision, so the leaves number 2 * 2 * 2. The empty subset and the full set are both leaves."}
```

Combinations of a fixed size are the subsets with exactly $k$ bits set:

```viz
{"type": "recursion", "algorithm": "combinations", "values": [1, 2, 3, 4], "k": 2, "title": "C(4, 2) = 6 combinations", "caption": "Same tree, but branches that can no longer reach k items are pruned. Pruning is what makes combination enumeration cheaper than subset enumeration."}
```

Where $2^n$ appears: [Subsets](/practice/subsets), subset-sum and partition problems, bitmask DP over "which items are used", the feature-flag matrix. When $n \le 20$ the space is a million and a plain loop over masks is the intended solution. When $n \approx 40$, meet-in-the-middle splits it into two $2^{20}$ halves: enumerate each half's sums, sort one, and binary-search or two-pointer the other, turning $2^{40}$ into about $2 \cdot 2^{20} \log 2^{20}$.

## Grid paths and stars and bars

**Lattice paths.** How many ways to walk from the top-left of an $m \times n$ grid to the bottom-right moving only right or down? Every path is a sequence of exactly $m - 1$ downs and $n - 1$ rights; the path is determined by *which* of the $m + n - 2$ moves are downs:

$$\text{paths}(m, n) = \binom{m + n - 2}{m - 1}$$

For a $3 \times 3$ grid the six paths are the six arrangements of `DDRR`: `DDRR, DRDR, DRRD, RDDR, RDRD, RRDD`, and $\binom{4}{2} = 6$. A $10 \times 10$ grid: $\binom{18}{9} = 48{,}620$. [Unique Paths](/practice/unique-paths) is exactly this; the DP solution rebuilds Pascal's triangle cell by cell (each cell is the sum of the cell above and the cell to the left, which *is* Pascal's identity), and saying so out loud is worth more than the code.

With an obstacle, count paths *through* the obstacle and subtract: on a $4 \times 4$ grid there are $\binom{6}{3} = 20$ paths; the paths through cell $(2, 2)$ number $\binom{2}{1} \cdot \binom{4}{2} = 2 \cdot 6 = 12$ (paths to it times paths from it, product rule); so $20 - 12 = 8$ avoid it. That subtraction is the simplest case of inclusion–exclusion.

**Stars and bars.** How many ways to distribute $k$ identical items into $n$ distinguishable bins, some possibly empty? Write each distribution as $k$ stars separated by $n - 1$ bars: four requests to three servers as $(2, 1, 1)$ is `** | * | *`, and $(0, 4, 0)$ is `| **** |`. Every arrangement of $k$ stars and $n - 1$ bars is a distribution and vice versa, so the count is the number of ways to choose which $n - 1$ of the $k + n - 1$ positions hold bars:

$$\binom{k + n - 1}{n - 1}$$

Four requests into three servers: $\binom{6}{2} = 15$ load patterns (enumerated: $(4,0,0)$ and its 3 arrangements, $(3,1,0)$ and its 6, $(2,2,0)$ and its 3, $(2,1,1)$ and its 3: $3 + 6 + 3 + 3 = 15$). This counts *multisets*, so it also answers "how many non-decreasing sequences of length $k$ over $n$ values", and it bounds the state space of counting-based DPs.

## The pigeonhole principle

If you put $n + 1$ items into $n$ boxes, some box has at least two. Obvious, and surprisingly sharp:

- Any array of $n + 1$ integers drawn from $1..n$ contains a duplicate. That guarantee is the premise of [Find the Duplicate Number](/practice/find-duplicate-number), where the duplicate's existence lets you use cycle detection instead of a hash set.
- A hash table with $m$ buckets and more than $m$ keys *must* have a collision, no matter how good the hash. Collision handling is not optional.
- Among any 367 people two share a birthday. (With random birthdays you only need 23 for a coin-flip chance; that is probability, not pigeonhole.)
- Any sequence of $n^2 + 1$ distinct numbers contains a monotone subsequence of length $n + 1$ (Erdős–Szekeres): label each element with the length of the longest increasing run ending there; if no label exceeds $n$, some label is shared by $n + 1$ elements, and those must form a decreasing subsequence.
- Any lossless compressor that shrinks some inputs must expand others: there are $2^n$ inputs of $n$ bits and only $2^n - 1$ shorter outputs.

The generalised form: $n$ items in $m$ boxes means some box has at least $\lceil n / m \rceil$. That is the "average chain length is $n/m$, so some chain is at least that" argument for hash tables.

## Inclusion–exclusion

The sum rule needs mutually exclusive cases. When cases overlap, you subtract the overlap:

$$|A \cup B| = |A| + |B| - |A \cap B|$$
$$|A \cup B \cup C| = |A| + |B| + |C| - |A \cap B| - |A \cap C| - |B \cap C| + |A \cap B \cap C|$$

Worked example: how many integers from 1 to 100 are divisible by 2, 3 or 5?

| Set | Members up to 100 | Count |
|---|---|---|
| by 2 | $2, 4, \ldots, 100$ | 50 |
| by 3 | $3, 6, \ldots, 99$ | 33 |
| by 5 | $5, 10, \ldots, 100$ | 20 |
| by 6 (2 and 3) | subtract | 16 |
| by 10 (2 and 5) | subtract | 10 |
| by 15 (3 and 5) | subtract | 6 |
| by 30 (all three) | add back | 3 |

$$50 + 33 + 20 - 16 - 10 - 6 + 3 = 74$$

Brute force agrees: 74. The 30 was subtracted three times (once in each pair) after being added three times (once in each single), so it has to be added back once. The sign pattern continues for any number of sets, and for $k$ sets it needs $2^k - 1$ terms, which is itself a subset enumeration.

**Derangements**, a second worked case: how many permutations of $n$ items leave *no* item in its original place? Count the complement. Let $A_i$ be the permutations that fix item $i$; $|A_i| = (n-1)!$, $|A_i \cap A_j| = (n-2)!$, and so on. Permutations that fix at least one item number $\binom{n}{1}(n-1)! - \binom{n}{2}(n-2)! + \cdots$, so

$$D(n) = n! - \binom{n}{1}(n-1)! + \binom{n}{2}(n-2)! - \cdots = n! \sum_{i=0}^{n} \frac{(-1)^i}{i!}$$

For $n = 4$: $24 - 24 + 12 - 4 + 1 = 9$, and enumerating all 24 permutations of `abcd` confirms 9. The sequence $0, 1, 2, 9, 44, 265$ approaches $n!/e$: about 37% of random shuffles fix nothing, whatever $n$ is. This is the answer to "what fraction of a randomised secret-Santa draw assigns nobody to themselves".

Where inclusion–exclusion appears in engineering: counting users who match *any* of several segments from per-segment counts; "count strings avoiding all forbidden patterns"; the obstacle-path subtraction above; and estimating the cardinality of a union from cardinalities of parts, which is the problem HyperLogLog sidesteps by sketching the union directly.

## Turning counts into decisions

The reason to know these numbers is to make decisions quickly. A reference table for "will brute force finish in about a second?" at roughly $10^8$–$10^9$ simple operations (the [benchmarking lesson](/learn/foundations/complexity/benchmarking-reality) measures what a "simple operation" costs in each runtime; in CPython budget $10^7$):

| Search space | Formula | $n = 10$ | $n = 15$ | $n = 20$ | $n = 30$ |
|---|---|---|---|---|---|
| Orderings | $n!$ | 3.6 × 10⁶ | 1.3 × 10¹² | 2.4 × 10¹⁸ | 2.7 × 10³² |
| Subsets | $2^n$ | 1,024 | 32,768 | 1.0 × 10⁶ | 1.1 × 10⁹ |
| Half-size subsets | $\binom{n}{n/2}$ | 252 | 6,435 | 184,756 | 1.6 × 10⁸ |
| Pairs | $\binom{n}{2}$ | 45 | 105 | 190 | 435 |
| Triples | $\binom{n}{3}$ | 120 | 455 | 1,140 | 4,060 |

Reading the table: subsets are fine to $n \approx 25$ and borderline at 30. Orderings die at 12. Pairs and triples are fine into the thousands ($\binom{5000}{2} \approx 1.2 \times 10^7$; $\binom{500}{3} \approx 2 \times 10^7$), which is why $O(n^2)$ pair enumeration is acceptable for "n up to a few thousand" and $O(n^3)$ for "n up to a few hundred".

**Test-case counting and pairwise coverage.** Three fields, each valid, empty or malformed, is $3^3 = 27$ combinations; eight boolean flags is $2^8 = 256$; a matrix of eight three-valued options is $3^8 = 6{,}561$ CI jobs. You will not run 6,561 jobs. *Pairwise* testing covers every pair of values of every pair of factors at least once, on the evidence that most interaction bugs involve two factors. For three factors with three values each, nine rows suffice, and here they are, built by the rule $c = (a + b) \bmod 3$:

```text
(0,0,0) (0,1,1) (0,2,2) (1,0,1) (1,1,2) (1,2,0) (2,0,2) (2,1,0) (2,2,1)
```

Check any two columns: all nine value pairs appear exactly once, because for fixed $(a, b)$ the third is determined and for fixed $(a, c)$ or $(b, c)$ the remaining value is determined too. Nine rows instead of 27; for larger matrices, tools (PICT, AllPairs) compute covering arrays, and the count grows roughly with the *log* of the number of factors rather than exponentially.

**Replica placement and the number of copysets.** A 12-node cluster storing each chunk on 3 nodes can use any of $\binom{12}{3} = 220$ node triples. If placement is random, after enough chunks every triple holds some chunk, so *any* simultaneous failure of 3 nodes loses data with probability 1. If placement is restricted to 4 disjoint triples (the copyset idea), only $4/220 \approx 1.8\%$ of 3-node failures hit a set that holds a whole chunk. The trade is recovery parallelism: with 220 sets a failed node's data is rebuilt from 11 peers at once; with 4 sets, from 2. The count $\binom{n}{r}$ is the whole design space, and choosing how much of it to use is the decision.

**ID sizing.** A random 8-character identifier over 62 alphanumerics has $62^8 = 2.18 \times 10^{14}$ values, about 47.6 bits. Whether that is "enough" depends on the birthday bound, not on the count alone, and that is the next lesson.

## Choosing how to enumerate

When you do need every element of a space rather than its size, the enumeration strategy matters as much as the count:

| Strategy | Order produced | Memory | Supports pruning | Speed per item (CPython) | Reach for it when |
|---|---|---|---|---|---|
| Bitmask loop `for m in range(1 << n)` | numeric mask order | $O(1)$ beyond output | no (every mask visited) | fastest, one int per item | $n \le 22$, no pruning possible |
| Recursive include/exclude | lexicographic | $O(n)$ stack | yes, at any depth | slower: a call per node | constraints prune most branches |
| `itertools.combinations` / `permutations` | lexicographic | $O(k)$ state | no | C-implemented, fast | need exactly the $k$-subsets or orderings |
| Gray code (flip one bit per step) | each subset differs from the previous by one item | $O(1)$ | no | fastest when the per-item update is incremental | subset-sum style incremental evaluation |
| Counting DP (Pascal, stars-and-bars) | none: produces counts only | $O(nk)$ table | n/a | $O(nk)$ total, not per item | you need the number, not the items |

The most common mismatch is enumerating when only the count was asked for: "how many paths" is $\binom{m+n-2}{m-1}$ in microseconds, and a DFS that lists them all is $48{,}620$ recursive calls for a $10 \times 10$ grid and $1.4 \times 10^{11}$ for $20 \times 20$.

## Under the hood

**`math.comb` and Python's big integers.** `math.comb(n, k)` returns the exact integer using the multiplicative method with big-integer arithmetic; measured, $\binom{52}{5}$ takes 0.3 µs and $\binom{1000}{500}$ (a 300-digit number) about 20 µs. The cost is dominated by multiplying and dividing numbers that grow with the answer's size. Since Python 3.11, converting an integer of more than 4,300 digits to a decimal string raises `ValueError` unless you raise the limit with `sys.set_int_max_str_digits`, because decimal conversion is quadratic in the digit count and was a denial-of-service vector; if you ever print $\binom{100000}{50000}$ you will meet it.

**`itertools.combinations`** keeps an array of $k$ indices and advances the rightmost index that can still move, resetting those after it: lexicographic order with $O(k)$ state and amortised $O(1)$ work per item, all in C. `itertools.permutations` does the same with a rotation scheme. Both are generators, so enumerating $12!$ permutations uses constant memory; `list(permutations(range(12)))` would allocate 479 million tuples and exhaust memory long before it finishes.

**JavaScript numbers.** Every $\binom{n}{k}$ with $n \le 56$ is exact in a double; the loop's intermediate products stay under $2^{53}$ when you multiply then divide in the order shown. $20!$ is not exact in a double ($2.43 \times 10^{18} > 2^{53}$), so a factorial-based formula silently rounds in JavaScript from $n = 19$ upward even where the final answer would fit.

## Failure modes in production

**The CI matrix that grew a dimension.** *Symptom:* adding one more three-valued option triples the job count; a matrix of eight options is 6,561 jobs and the pipeline takes a day. *Diagnosis:* the product rule; every option multiplies. *Fix:* a pairwise covering array (nine rows for three options; tens of rows for eight) for the interaction tests, plus a small set of hand-chosen full-combination smoke tests.

**A factorial or product that overflowed.** *Symptom:* a scheduling service reports a negative or nonsensical number of orderings, or a JavaScript dashboard shows a "count" that ends in suspicious zeros. *Diagnosis:* $21!$ exceeds $2^{64}$; $\binom{57}{28}$ exceeds $2^{53}$; $n!/(k!(n-k)!)$ overflows long before $\binom{n}{k}$ does. *Fix:* the multiplicative formula with symmetry, `BigInt` or arbitrary-precision integers when the answer itself is large, and a test at the boundary ($n = 56$ and $57$ in JavaScript).

**Double-counted users in analytics.** *Symptom:* the "reached by any campaign" number exceeds the number of users who exist. *Diagnosis:* per-segment counts were added; users in two segments were counted twice. *Fix:* inclusion–exclusion when you have the intersections, or compute the union directly with a distinct count (or a HyperLogLog sketch, whose merge *is* a union) when you do not.

**Brute force sized on the example, not the constraint.** *Symptom:* a solution that enumerates subsets passes every sample and times out on the hidden test. *Diagnosis:* the samples had $n = 8$; the constraint said $n \le 40$; $2^{40}$ is $10^{12}$. *Fix:* read the constraint first, size the space, and reach for meet-in-the-middle, DP or pruning when the count says so.

**Enumerating in memory instead of streaming.** *Symptom:* `MemoryError` on a job that "lists the combinations". *Diagnosis:* $\binom{40}{20}$ is $1.4 \times 10^{11}$ items; materialising them is impossible and iterating them takes days. *Fix:* if only the count is needed, compute it; if a search is needed, stream from a generator and prune.

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

## Interviewer follow-ups

**"The constraint is $n \le 40$ and you need the subsets whose sum is $S$. $2^{40}$ is too many. What now?"** *Model answer:* meet in the middle: split into two halves of 20, enumerate each half's $2^{20}$ subset sums, sort one side, and for each sum on the other side binary-search (or two-pointer) for $S - \text{sum}$; about $2^{21} \log 2^{20}$ work instead of $2^{40}$. *Common wrong answer:* "prune the search", which without a bound still explores an exponential tree on adversarial input.

**"You need $\binom{n}{k} \bmod 10^9 + 7$ for $10^6$ queries with $n \le 10^6$."** *Model answer:* precompute factorials and inverse factorials modulo the prime once ($O(n)$ plus one modular exponentiation), then each query is three multiplications; division does not exist under a modulus, so the inverse factorial replaces it. *Common wrong answer:* running the multiplicative loop per query with `//`, which is wrong under the modulus and $O(k)$ per query.

**"How many test cases for five boolean flags and three browsers, and how would you cut it?"** *Model answer:* $2^5 \cdot 3 = 96$ full combinations; a pairwise covering array needs on the order of a dozen rows (the largest pair of factor sizes, $3 \times 2 = 6$, is the floor), which catches every two-factor interaction; I would keep a handful of full-combination smoke tests for the shipped defaults. *Common wrong answer:* "test all 96" or "test the defaults", with no principle for what was skipped.

**"Why is the division in the multiplicative binomial formula exact?"** *Model answer:* after step $i - 1$ the running value is $\binom{n-k+i-1}{i-1}$; multiplying by $n-k+i$ gives $i \cdot \binom{n-k+i}{i}$ by the identity $\binom{m}{i} = \frac{m}{i}\binom{m-1}{i-1}$, which is divisible by $i$. *Common wrong answer:* "because the final answer is an integer", which says nothing about the intermediate steps and is why dividing first fails.

**"Count grid paths that avoid one blocked cell."** *Model answer:* total paths minus paths through the cell, where paths through it are (paths to it) × (paths from it) by the product rule; for several blocked cells, inclusion–exclusion over subsets of them or, more practically, the DP that sets blocked cells to zero. *Common wrong answer:* subtracting the paths through each blocked cell independently when they overlap, which double-subtracts.

## What mid-level engineers get wrong

- **Computing $n!/(k!(n-k)!)$ literally.** Overflows 64 bits at $n = 21$ and a double at $n = 19$, long before $\binom{n}{k}$ does; the multiplicative form never exceeds the answer.
- **Dividing before multiplying in the multiplicative loop.** Truncates on many inputs and passes the small tests by luck.
- **Adding overlapping counts.** Segment sizes, "any of" filters, blocked-cell subtractions: without inclusion–exclusion the union is over-counted.
- **Treating $2^{30}$ as "about a million".** It is a billion; subsets are fine at 20 and not at 30 in an interpreted language.
- **Confusing $P(n, k)$ with $\binom{n}{k}$.** Orderings versus selections; "choose 3 servers to drain" is $\binom{n}{3}$, "assign 3 distinct roles" is $P(n, 3)$, a factor of $3! = 6$ apart.
- **Enumerating when the count was the question.** Listing $48{,}620$ paths to report $48{,}620$, or materialising $\binom{40}{20}$ combinations.
- **Sizing the brute force on the sample input.** The constraint, not the example, decides whether $2^n$ is affordable.

## Senior signals

- You size the search space before choosing an approach: "$2^{20}$, enumerate it" or "$15!$, we need pruning or DP", said within the first minute, and you convert it to seconds using the runtime's cost per operation.
- You compute binomials with the multiplicative formula, can prove the division is exact at every step, know the JavaScript limit ($n \le 56$), and know that under a modulus you need Pascal's triangle or modular inverses instead.
- You recognise the five shapes (orderings, subsets, $k$-subsets, lattice paths, stars-and-bars) in a problem statement even when it is dressed up as servers, tasks, robots or replicas.
- You use pigeonhole as a *proof* tool: "there are $n + 1$ values in a range of $n$, so a duplicate exists, so cycle detection applies."
- You correct overlapping counts with inclusion–exclusion rather than double-counting, can derive derangements from it, and know that estimating a union from parts is what makes distinct-count analytics hard.
- You count test combinations and consciously choose pairwise coverage, and you can write down the nine-row array for three three-valued factors.
- You treat $\binom{n}{r}$ as a design space (replica placement, copysets) and choose how much of it to use, stating the durability-versus-recovery trade.

## Check yourself

```quiz
- q: >-
    A problem asks you to try every way of assigning 12 tasks to 12 workers, one task each. How many assignments are there, and is brute force plausible?
  options: ["12! ≈ 4.8 × 10^8; far beyond any time limit", "12! ≈ 4.8 × 10^8; feasible but borderline", "12^12 ≈ 8.9 × 10^12; far too many to try", "2^12 = 4,096; feasible and trivially fast"]
  answer: 1
  explanation: >-
    One-to-one assignments are orderings, n!, and 12! is about 479 million. At 10^8 to 10^9 simple operations per second in compiled code that is seconds, feasible but borderline, and only with a fast inner loop; in CPython it is minutes, and 13! would be ten times worse. 2^12 counts subsets, not bijections, and 12^12 counts assignments where one worker may take several tasks.
- q: >-
    Why does `n_choose_k` multiply by `(n - k + i)` before dividing by `i` in each iteration, rather than dividing first?
  options: ["The order is arbitrary; both orders give the same result", "After the multiply, i always divides the value exactly", "Dividing first can make the running value go negative", "Multiplying first keeps the intermediate values smaller"]
  answer: 1
  explanation: >-
    After step i the running value equals C(n - k + i, i), an integer, because the numerator i * C(n-k+i, i) is divisible by i. Dividing the previous value by i first can produce a non-integer that integer division truncates, giving a wrong result, so the order is not arbitrary. Multiplying first actually makes the intermediate value temporarily larger, not smaller.
- q: >-
    A grid has 4 rows and 6 columns. How many right/down paths lead from the top-left to the bottom-right corner?
  options: ["56", "24", "70", "126"]
  answer: 0
  explanation: >-
    A path is 3 downs and 5 rights in some order: C(8, 3) = 56. 70 is C(8, 4), which would be a 5 × 5 grid; 24 is 4 × 6, the number of cells; 126 is C(9, 4).
- q: >-
    An array of length 1,001 contains integers between 1 and 1,000. Which claim is guaranteed, without any assumption about randomness?
  options: ["At least one value appears twice", "Exactly one value appears twice", "No value appears more than twice", "Every value from 1 to 1,000 appears"]
  answer: 0
  explanation: >-
    Pigeonhole: 1,001 items in 1,000 boxes forces some box to hold at least two. Nothing forces uniqueness of the repeated value, bounds how often it repeats, or requires every value to be present.
- q: >-
    Segment A has 5,000 users, segment B has 3,000, and 1,200 users are in both. How many users are in at least one segment, and what goes wrong if you add the two counts?
  options: ["6,800; adding counts the shared 1,200 twice", "3,800; you must subtract the overlap from both", "8,000; the two segment counts add up directly", "8,000; each segment already excludes the overlap"]
  answer: 0
  explanation: >-
    |A ∪ B| = |A| + |B| - |A ∩ B| = 5,000 + 3,000 - 1,200 = 6,800. Plain addition double-counts the intersection, since the shared users are inside both segment counts. 3,800 subtracts it twice.
- q: >-
    A 12-node cluster stores each chunk on 3 nodes. With random placement every one of the C(12, 3) = 220 triples eventually holds some chunk; with 4 fixed disjoint triples only those hold chunks. What does restricting placement change?
  options: ["Nothing about durability; both schemes lose data whenever any 3 nodes fail", "Each chunk becomes more durable because it is stored on more nodes", "Rebuilds get faster, since fewer triples means less data to copy", "Fewer 3-node failures lose data (4 of 220), but each rebuild reads from fewer peers"]
  answer: 3
  explanation: >-
    The number of triples in use is the number of 3-node failure patterns that lose data: 4/220 ≈ 1.8% for the restricted scheme against effectively 100% for random placement across all 220. The cost is recovery parallelism: a failed node's data lives on 2 peers instead of 11. Replication factor is unchanged, so per-chunk durability against fewer than 3 failures is identical.
```
