---
slug: recurrences-and-master-theorem
title: "Recurrences and the master theorem"
description: How to write the recurrence for a recursive algorithm, solve it by drawing the recursion tree, by substitution, by the master theorem or by Akra–Bazzi, verify the answer by instrumenting the code, and recognise the handful of recurrences that cover almost every algorithm you will meet.
minutes: 60
difficulty: medium
tags: [complexity, recurrences, master-theorem, recursion-tree, divide-and-conquer, akra-bazzi]
problems: [pow-x-n, merge-k-sorted-lists]
---
You write merge sort, and you know it is $O(n \log n)$ because everyone says so. Then you write something that splits the input into three parts, recurses on two of them and does a linear scan to combine, and you have no idea what it costs. Or you write a recursive solution that calls itself twice on $n - 1$ and cannot say whether that is polynomial or exponential (it is exponential, and the interviewer is waiting for you to notice). Or you write a recursive binary search in Python, slice the list at each call, and ship something that is $\Theta(n)$ while believing it is $\Theta(\log n)$.

Loops you can count directly. Recursion you have to *unroll*, and the tool for that is a recurrence: an equation giving the cost on $n$ in terms of the cost on smaller inputs. This lesson covers writing one from code, four ways to solve it, the recurrences the famous shortcut refuses and how to solve those anyway, and how to check the answer against the running program.

## From code to recurrence

A recurrence has two parts: the non-recursive work a call does, and the recursive calls it makes. Take merge sort:

```python
def merge_sort(xs):
    if len(xs) <= 1:                      # base case: T(1) = O(1)
        return xs
    mid = len(xs) // 2
    left = merge_sort(xs[:mid])           # T(n/2), plus n/2 to copy the slice
    right = merge_sort(xs[mid:])          # T(n/2), plus n/2 to copy the slice
    return merge(left, right)             # O(n) to merge
```

Two calls on half the input, plus linear work (the merge, and in Python the two slice copies, which together are another $n$), so

$$
T(n) = 2\,T(n/2) + \Theta(n), \qquad T(1) = \Theta(1).
$$

Writing the recurrence is mechanical once you ask two questions: **how many recursive calls, on what size**, and **how much work outside the calls**. The second is where mistakes hide: "outside the calls" includes every slice, concatenation and `in` test, not only the line you think of as the combine step.

| Code shape | Recurrence |
|---|---|
| Binary search: one call on half, $O(1)$ work | $T(n) = T(n/2) + 1$ |
| Binary search that slices the list before recursing | $T(n) = T(n/2) + n$ |
| Traverse a linked list recursively | $T(n) = T(n - 1) + 1$ |
| Naive Fibonacci | $T(n) = T(n-1) + T(n-2) + 1$ |
| Towers of Hanoi | $T(n) = 2\,T(n-1) + 1$ |
| Generate all subsets by include/exclude | $T(n) = 2\,T(n-1) + O(1)$ (plus output) |
| Fast exponentiation ($x^n$ via $x^{n/2}$ squared) | $T(n) = T(n/2) + 1$ |
| Strassen matrix multiply | $T(n) = 7\,T(n/2) + O(n^2)$ |
| Karatsuba multiplication | $T(n) = 3\,T(n/2) + O(n)$ |

Floors and ceilings ($n/2$ versus $\lfloor n/2 \rfloor$ and $\lceil n/2 \rceil$) do not change the asymptotic answer for any recurrence in this lesson: the master theorem is proved for the floor-and-ceiling versions, where the tree's depth lies between $\log_b n - 1$ and $\log_b n + 1$ and the extra level costs at most a constant factor. Pretending $n$ is a power of $b$ is a simplification the theorem has already paid for.

## Method 1: draw the recursion tree

The recursion tree is the method to try first, because it shows you *where the cost lives*. Each node is one call, labelled with the non-recursive work that call does; its children are the calls it makes. The total cost is the sum over all nodes, taken level by level. For $T(n) = 2T(n/2) + n$ at $n = 16$:

| Level $k$ | Nodes $2^k$ | Size per node $n/2^k$ | Work per node | Work on the level |
|---|---|---|---|---|
| 0 | 1 | 16 | 16 | 16 |
| 1 | 2 | 8 | 8 | 16 |
| 2 | 4 | 4 | 4 | 16 |
| 3 | 8 | 2 | 2 | 16 |
| 4 (leaves) | 16 | 1 | 1 (base case) | 16 |

Every level does $n$ work, there are $\log_2 n$ levels of merging plus one level of leaves, and the total is $n \log_2 n + n = 80$ for $n = 16$. In general $\Theta(n \log n)$.

```viz
{"type": "recursion", "algorithm": "merge-sort-tree", "values": [38, 27, 43, 3, 9, 82, 10, 5], "title": "Merge sort's recursion tree", "caption": "Eight elements, three levels of splitting. Each level merges a total of eight elements, so the work is n per level times log n levels."}
```

The tree answers three questions: the depth, the work per level, and whether the per-level work is constant, shrinking or growing as you go down. That last question decides everything, and there are exactly three regimes.

**Same work at every level.** The table above: work-per-level times depth, $\Theta(n \log n)$.

**Work shrinks geometrically going down.** $T(n) = 2T(n/2) + n^2$ at $n = 16$: the levels do $256, 128, 64, 32$ and the 16 leaves do 16, total $496$. Each level is half the one above, so the sum is bounded by twice the root: $n^2(1 + 1/2 + 1/4 + \cdots) < 2n^2$. The root dominates: $\Theta(n^2)$.

**Work grows geometrically going down.** $T(n) = 4T(n/2) + n$ at $n = 16$: the levels do $16, 32, 64, 128$ and the $256$ leaves do $256$, total $496$ again, but now each level doubles and the *last* one dominates. The leaf count is $4^{\log_2 n} = n^2$, so the answer is $\Theta(n^2)$ for the opposite reason.

For binary search, $T(n) = T(n/2) + 1$: one node per level, constant work, $\log_2 n$ levels, $\Theta(\log n)$.

```viz
{"type": "recursion", "algorithm": "binary-search-recursive", "values": [4, 9, 15, 22, 31, 47, 58, 66, 73, 90], "title": "One branch per level", "caption": "Each call makes a single recursive call on half the range: a chain, not a tree. Depth log n, constant work per node."}
```

For Hanoi, $T(n) = 2T(n-1) + 1$: the tree has depth $n$ (the size drops by one, not by half) and doubles in width at each level, so it has $2^n - 1$ nodes of constant work: $\Theta(2^n)$. Recognise this shape instantly: *two calls that each reduce $n$ by a constant* is exponential.

```viz
{"type": "recursion", "algorithm": "hanoi", "n": 4, "title": "Towers of Hanoi", "caption": "Moving n discs takes 2^n - 1 moves. Each level of the recursion doubles the number of calls and only reduces n by one."}
```

Naive Fibonacci is the same shape with an uneven split, $T(n) = T(n-1) + T(n-2) + 1$. The tree is not full, so the count is $2F(n+1) - 1$ calls rather than $2^n$, growing as $\phi^n$ with $\phi \approx 1.618$. Counted: $\text{fib}(25)$ makes exactly $242{,}785$ calls, about $1.45 \times 1.618^{25}$.

```viz
{"type": "recursion", "algorithm": "fibonacci", "n": 6, "title": "Naive Fibonacci's call tree", "caption": "fib(4) is computed twice, fib(3) three times, fib(2) five times. The repeated subtrees are what memoisation removes."}
```

## Method 2: the master theorem

For recurrences of the exact form

$$
T(n) = a\,T(n/b) + f(n), \qquad a \ge 1,\ b > 1,
$$

the recursion tree argument has been done once and for all. The tree has $\log_b n$ levels; level $k$ has $a^k$ nodes of size $n/b^k$ doing $a^k f(n/b^k)$ work; the leaf level has $a^{\log_b n} = n^{\log_b a}$ nodes. The theorem compares $f(n)$, the root's work, against $n^{\log_b a}$, the leaves' work, and whichever is *polynomially* bigger wins:

| Case | Condition | Result | Tree regime |
|---|---|---|---|
| 1 | $f(n) = O(n^{\log_b a - \varepsilon})$ for some $\varepsilon > 0$ | $T(n) = \Theta(n^{\log_b a})$ | work grows going down; leaves dominate |
| 2 | $f(n) = \Theta(n^{\log_b a})$ | $T(n) = \Theta(n^{\log_b a} \log n)$ | every level equal |
| 3 | $f(n) = \Omega(n^{\log_b a + \varepsilon})$ and $a f(n/b) \le c f(n)$ for some $c < 1$ | $T(n) = \Theta(f(n))$ | work shrinks going down; root dominates |

Three steps: compute $c = \log_b a$, compare $f(n)$ with $n^c$, and if the root wins, check regularity. Each case in full:

### Case 1 worked: Karatsuba, $T(n) = 3T(n/2) + n$

$a = 3$, $b = 2$, so $n^{\log_2 3} = n^{1.585}$. Is $f(n) = n$ polynomially smaller? Yes: $n = O(n^{1.585 - 0.5})$, so $\varepsilon = 0.5$ works. Case 1: $T(n) = \Theta(n^{1.585})$.

The tree at $n = 16$ confirms it and shows why "polynomially" matters:

| Level | Nodes $3^k$ | Size $16/2^k$ | Work on the level |
|---|---|---|---|
| 0 | 1 | 16 | 16 |
| 1 | 3 | 8 | 24 |
| 2 | 9 | 4 | 36 |
| 3 | 27 | 2 | 54 |
| 4 (leaves) | 81 | 1 | 81 |

Each level is $3/2$ times the one above, a geometric series whose sum is at most $3 \times$ its last term, and the last term is the leaf count $3^{\log_2 16} = 81 = 16^{1.585}$. Total 211, within the bound. The geometric growth is what the $\varepsilon$ guarantees: were $f$ only a logarithmic factor smaller than $n^{\log_b a}$, the levels would not shrink geometrically and the leaves would not dominate cleanly (that is the gap case below).

### Case 2 worked: merge sort and binary search

Merge sort: $a = 2$, $b = 2$, $n^{\log_2 2} = n$, and $f(n) = n = \Theta(n)$. Case 2: $\Theta(n \log n)$. The table in Method 1 is the proof.

Binary search: $a = 1$, $b = 2$, $n^{\log_2 1} = n^0 = 1$, and $f(n) = 1 = \Theta(1)$. Case 2: $\Theta(n^0 \log n) = \Theta(\log n)$.

### Case 3 worked: $T(n) = 2T(n/2) + n^2$

$a = 2$, $b = 2$, $n^{\log_2 2} = n$, and $f(n) = n^2 = \Omega(n^{1 + 1})$ with $\varepsilon = 1$. Root wins if regularity holds: $a f(n/b) = 2 (n/2)^2 = n^2 / 2 \le c n^2$ with $c = 1/2 < 1$. It holds. Case 3: $\Theta(n^2)$, which matches the shrinking-levels table in Method 1 (496 for $n = 16$, under $2 \cdot 256$).

The regularity condition exists because an oscillating $f$ such as $n(2 - \cos n)$ can be polynomially larger than the leaves at the root yet not shrink going down the tree; for every polynomial-times-log $f$ in real code it holds automatically.

### More applications, one line each

- **Strassen**, $7T(n/2) + n^2$: $n^{\log_2 7} = n^{2.807}$ beats $n^2$; case 1, $\Theta(n^{2.807})$.
- **Three third-size subproblems, linear combine**, $3T(n/3) + n$: $n^{\log_3 3} = n$; case 2, $\Theta(n \log n)$.
- **One half-size subproblem, linear combine**, $T(n/2) + n$ (quickselect on average; a binary search that slices): $n^0 = 1$ loses to $n$, regularity holds; case 3, $\Theta(n)$.

## Where the master theorem does not apply

Four shapes come up regularly that the theorem refuses. Each is solvable in a minute with the tree or a change of variable.

### The gap: $T(n) = 2T(n/2) + n \log n$

$n^{\log_2 2} = n$, and $f(n) = n \log n$ is bigger, but not by a polynomial factor: $n \log n$ is not $\Omega(n^{1 + \varepsilon})$ for any $\varepsilon > 0$, because $\log n$ grows slower than every $n^\varepsilon$. Case 3 fails, case 2 fails (it is not $\Theta(n)$), and the theorem is silent.

The tree is not. Level $k$ has $2^k$ nodes of size $n/2^k$, each doing $(n/2^k) \log(n/2^k)$, so the level does $n (\log n - k)$: at $n = 16$ the levels do $64, 48, 32, 16$. Summing:

$$
\sum_{k=0}^{\log n - 1} n(\log n - k) = n(\log n + (\log n - 1) + \cdots + 1) = n \cdot \frac{\log n (\log n + 1)}{2} = \Theta(n \log^2 n).
$$

For $n = 16$: $16 \cdot 10 = 160 = 64 + 48 + 32 + 16$. The general rule (the extended case 2, provable by the same sum): if $f(n) = \Theta(n^{\log_b a} \log^k n)$ then $T(n) = \Theta(n^{\log_b a} \log^{k+1} n)$. One extra log, always.

### Subtractive recurrences: $T(n) = T(n - 1) + n$

The theorem needs the size to *divide* by $b > 1$; here it drops by 1, and forcing $b = 1$ gives nonsense. Unroll instead:

$$
T(n) = n + T(n-1) = n + (n-1) + T(n-2) = \cdots = n + (n-1) + \cdots + 1 + T(0) = \frac{n(n+1)}{2} + T(0) = \Theta(n^2).
$$

This is quicksort with a pivot that always lands at an end (sorted input, first-element pivot) and selection sort. The rule for one call on $n - c$: $T(n) = T(n - c) + f(n)$ sums to $\Theta(\sum_{i} f(i))$, so $f(n) = 1, n, n^2$ give $\Theta(n), \Theta(n^2), \Theta(n^3)$. The rule for $a \ge 2$ calls on $n - c$: $T(n) = aT(n - c) + f(n)$ is $\Theta(a^{n/c})$ times a polynomial, exponential whatever $f$ is. Hanoi ($a = 2$, $c = 1$) is $\Theta(2^n)$.

### Unequal splits: $T(n) = T(n/3) + T(2n/3) + n$

The tree is lopsided: the shallowest leaf is at depth $\log_3 n$, the deepest at $\log_{3/2} n \approx 1.71 \log_2 n$. Every *full* level still does exactly $n$ work, because a node of size $m$ has children of sizes $m/3$ and $2m/3$, summing to $m$. So the total is between $n \log_3 n$ and $n \log_{3/2} n$: $\Theta(n \log n)$, with a constant set by the lopsidedness.

That argument works whenever the sizes sum to $n$. When they do not, use **Akra–Bazzi**, the general theorem for any recurrence $T(n) = \sum_i a_i T(b_i n) + g(n)$ with constants $a_i > 0$ and $0 < b_i < 1$:

1. Find the unique $p$ with $\sum_i a_i b_i^{\,p} = 1$.
2. Then $T(n) = \Theta\!\left(n^p \left(1 + \int_1^n \frac{g(u)}{u^{p+1}}\,du\right)\right)$.

Worked case, $T(n) = T(n/2) + T(n/4) + n$, a shape the master theorem cannot express because the two halves are unequal and do not sum to $n$:

| Step | Computation |
|---|---|
| Find $p$ | $(1/2)^p + (1/4)^p = 1$. Let $x = (1/2)^p$; then $x + x^2 = 1$, so $x = (\sqrt 5 - 1)/2 \approx 0.618$ and $p = \log_2(1/0.618) \approx 0.694$. |
| The integral | $\int_1^n \frac{u}{u^{1.694}}\,du = \int_1^n u^{-0.694}\,du = \frac{n^{0.306} - 1}{0.306} \approx 3.27\, n^{0.306}$. |
| Assemble | $T(n) = \Theta(n^{0.694}(1 + 3.27\, n^{0.306})) = \Theta(n^{0.694} \cdot n^{0.306}) = \Theta(n)$. |

Cross-check with the tree: each level's sizes sum to $3/4$ of the level above ($n/2 + n/4$), so the per-level work is $n, 3n/4, 9n/16, \ldots$, a geometric series bounded by $4n$. Both methods say $\Theta(n)$: the root dominates because the subproblems shrink faster than they multiply.

Akra–Bazzi also reproduces the gap case: for $2T(n/2) + n \log n$, $p = 1$ and $\int_1^n \frac{\ln u}{u}\,du = \frac{(\ln n)^2}{2}$, giving $\Theta(n \log^2 n)$. It is the master theorem without the "equal sizes" and "polynomial gap" restrictions; the price is a one-line numeric root-find for $p$.

### A shrinking exponent: $T(n) = T(\sqrt{n}) + 1$

Neither a constant factor nor a constant difference. Change variables: let $n = 2^m$, so $\sqrt n = 2^{m/2}$, and define $S(m) = T(2^m)$. Then $S(m) = S(m/2) + 1$, binary search's recurrence in $m$, so $S(m) = \Theta(\log m)$ and $T(n) = \Theta(\log \log n)$. This is interpolation search on uniform data and van Emde Boas trees; a $\log \log n$ in a bound usually means a square-root recursion.

## Method 3: substitution (guess and verify)

When the recurrence is irregular, guess the answer and prove it by induction. It is the method of last resort in interviews but the method of record in proofs, and it is the only method that produces an explicit constant.

Claim: $T(n) = T(\lfloor n/2 \rfloor) + T(\lceil n/2 \rceil) + n$ is $O(n \log n)$. Assume $T(k) \le c\,k \log_2 k$ for all $k < n$. Then

$$
T(n) \le 2 \cdot c \tfrac{n}{2} \log \tfrac{n}{2} + n = c\,n(\log n - 1) + n = c\,n \log n - cn + n \le c\,n \log n
$$

whenever $c \ge 1$. The induction closes with $c = 1$ (the floor/ceiling wobble is absorbed by a slightly larger base case).

Two traps. The first is a true bound whose induction does not close. Proving $T(n) = 2T(n/2) + 1$ is $O(n)$ by assuming $T(k) \le ck$ gives $T(n) \le cn + 1$, which is *not* $\le cn$. Strengthen the hypothesis: assume $T(k) \le ck - 1$, and then $T(n) \le 2(cn/2 - 1) + 1 = cn - 1$. Subtracting a lower-order term to close an induction is a standard move, and the recurrence really is $\Theta(n)$: a binary tree with $n$ leaves has $2n - 1$ nodes.

The second trap is the opposite: the guess is *false*, and no strengthening rescues it. Proving $T(n) = 2T(n/2) + n$ is $O(n)$: assume $T(k) \le ck - d$, get $T(n) \le cn - 2d + n$, and the extra $+n$ cannot be absorbed by any constant. When the leftover grows with $n$, the guess is wrong; when it is a constant, strengthen.

## The recurrences you must recognise on sight

| Recurrence | Solution | Canonical algorithm |
|---|---|---|
| $T(n) = T(n/2) + 1$ | $\Theta(\log n)$ | binary search, fast exponentiation |
| $T(n) = T(n/2) + n$ | $\Theta(n)$ | quickselect (average), the root dominates |
| $T(n) = 2T(n/2) + 1$ | $\Theta(n)$ | tree traversal on a balanced tree |
| $T(n) = 2T(n/2) + n$ | $\Theta(n \log n)$ | merge sort, quicksort (average) |
| $T(n) = 2T(n/2) + n \log n$ | $\Theta(n \log^2 n)$ | a merge step that sorts |
| $T(n) = 3T(n/2) + n$ | $\Theta(n^{1.585})$ | Karatsuba |
| $T(n) = T(n - 1) + 1$ | $\Theta(n)$ | recursive list traversal |
| $T(n) = T(n - 1) + n$ | $\Theta(n^2)$ | quicksort worst case, selection sort |
| $T(n) = 2T(n - 1) + 1$ | $\Theta(2^n)$ | Hanoi, subset enumeration |
| $T(n) = T(n-1) + T(n-2) + 1$ | $\Theta(\phi^n) \approx \Theta(1.618^n)$ | naive Fibonacci |
| $T(n) = n \cdot T(n - 1)$ | $\Theta(n!)$ | permutation enumeration |
| $T(n) = T(\sqrt n) + 1$ | $\Theta(\log \log n)$ | interpolation search, van Emde Boas |

The pattern behind the table: **halving with one call** is logarithmic; **halving with two calls** is linear or linearithmic depending on the combine cost; **decrementing with one call** is linear or quadratic; **decrementing with two calls** is exponential. Place a recursive function in one of those four boxes and you have its complexity in seconds.

## Recurrences in disguise

**Memoisation changes the recurrence.** Naive Fibonacci makes $\Theta(\phi^n)$ calls, but with a memo each distinct $n$ is computed once: $n$ states, $O(1)$ work each, $\Theta(n)$. The recurrence for a memoised function is "distinct states times work per state", the idea behind [dynamic programming](/learn/algorithms/dynamic-programming/the-dp-mindset). Whether the $O(1)$ is honest is a separate question: the numbers reach $\Theta(n)$ digits, so the bit-level total is $\Theta(n^2)$, as the [cost model lesson](/learn/foundations/complexity/why-big-o) measures.

**Unbalanced splits.** A pivot that always lands at the 10th percentile gives $T(n) = T(n/10) + T(9n/10) + n$: each full level does $n$ work and the depth is $\log_{10/9} n \approx 6.6 \log_2 n$, still $\Theta(n \log n)$ with a larger constant. Any *constant-fraction* split gives $n \log n$; only removing a *constant number* of elements degrades to quadratic. That is why a random pivot suffices: a constant-fraction-or-better split has probability at least $1/2$ at every level, so the expected depth is $O(\log n)$.

**Multiple variables.** Merging $k$ sorted lists of total length $n$ by repeatedly merging pairs is $T(k) = 2T(k/2) + n$ in the number of lists, with $n$ fixed: $\log k$ levels of $n$ work, $\Theta(n \log k)$, the same as a heap by a different route. The [k-way merge lesson](/learn/data-structures/heaps/top-k-and-k-way-merge) compares the two.

**Stack depth is a recurrence too.** The tree's depth is the space cost: $\log n$ for $2T(n/2) + n$, $n$ for $2T(n-1) + 1$ even though the time is exponential. The [space complexity lesson](/learn/foundations/complexity/space-complexity-and-memory-hierarchy) covers why that matters; the failure modes below show it mattering.

## Under the hood: checking a recurrence against the running program

A recurrence is a prediction, and predictions can be tested. Two instruments do it.

**Count.** Add a call counter and a per-depth work counter to merge sort. Measured in CPython 3.14.7 on 1,024 elements: 2,047 calls, exactly $2n - 1$; 10 levels of merging, each merging exactly 1,024 elements, $n \log_2 n$ in total. The tree in Method 1 is not a metaphor; it is what the interpreter executes.

**Time, and divide by the prediction.** If $T(n) = \Theta(n \log n)$, then $T(n) / (n \log_2 n)$ should be flat as $n$ grows. Measured on one machine (AMD Ryzen 9 9950X3D, CPython 3.14.7, random floats, best of five runs):

| $n$ | Pure-Python merge sort | ns per unit of $n \log_2 n$ |
|---|---|---|
| 1,024 | 0.60 ms | 59 |
| 8,192 | 5.8 ms | 55 |
| 65,536 | 56 ms | 53 |
| 262,144 | 256 ms | 54 |

Flat at about 54 ns across a 256× range of $n$: the recurrence is right, and the constant is 54 ns per comparison-and-append in the interpreter. On $O(n^2)$ code the ratio climbs in proportion to $n / \log n$; on the slicing binary search below it climbs the same way, which is how that bug is caught.

The built-in `sorted()` on the same data costs 5–6 ns per unit, ten times less, because it runs in C, and its recurrence differs from the textbook's. CPython's `list.sort` is Timsort: it detects runs that are already ordered, extends short runs to 32–64 elements with binary insertion sort, and only then merges (with the powersort merge policy since Python 3.11). So the tree's leaves are runs of 32–64 elements sorted in $\Theta(m^2)$ time with a tiny constant, removing the bottom five or six levels, and on already-sorted input there is one run and the cost is $n - 1$ comparisons, $\Theta(n)$. V8's `Array.prototype.sort` (since V8 7.0) and Java's object sort are also Timsort. The recurrence for "a sort" is a worst-case description of a structure whose real cost depends on the data.

**Recursion depth is enforced, not theoretical.** CPython's default recursion limit is 1,000 frames, so any $T(n - 1) + \ldots$ recurrence raises `RecursionError` once $n$ passes about 1,000, whatever its time complexity. Since Python 3.12 pure-Python calls do not consume the C stack, so raising the limit is bounded by memory (a few hundred bytes per frame) rather than by a segmentation fault; it is still a deliberate fix, not a default. V8 allows on the order of 10,000 frames for a small function, and a native thread in C, Go or Rust has a few megabytes of stack, roughly $10^5$ small frames. A halving recurrence never comes near these; a decrementing one hits them the first time the input is long.

## Failure modes in production

**A divide-and-conquer that copies before it recurses.** *Symptom:* a "binary search" over a million-element list takes milliseconds instead of microseconds, and doubling the list doubles the time. *Diagnosis:* the recursive call slices (`xs[:mid]`, `xs[mid+1:]`), so the recurrence is $T(n/2) + n$, case 3, $\Theta(n)$. Measured (same machine): the slicing version takes 8.7 µs at $n = 10^4$, 291 µs at $10^5$ and 3.3 ms at $10^6$, a factor of 10 per factor of 10; the index-passing version takes 0.6, 0.7 and 0.9 µs. *Fix:* pass `lo` and `hi` instead of slicing, or iterate. The [values and references lesson](/learn/foundations/how-code-runs/values-references-and-mutation) lists which operations copy.

**Quicksort meets sorted input.** *Symptom:* a nightly job that re-sorts an already ordered export takes hours; p99 spikes only for tenants whose data arrives pre-sorted. *Diagnosis:* a first-element pivot on sorted input splits $0 : n - 1$ every time, so the recurrence collapses from $2T(n/2) + n$ to $T(n - 1) + n$: $\Theta(n^2)$ with recursion depth $n$. Measured in CPython: 8,000 random elements sort in 3.6 ms; the same 8,000 pre-sorted take 589 ms, and doubling $n$ quadruples it (37 ms at 2,000, 148 ms at 4,000). With a random pivot, sorted input takes 4 ms. *Fix:* a random or median-of-three pivot, introsort (which switches to heapsort past depth $2 \log_2 n$, as C++ `std::sort` does), or the library sort, which is Timsort and $\Theta(n)$ on sorted input.

**A decrementing recursion on a long chain.** *Symptom:* a recursive linked-list walk, tree walk or JSON flattener passes every test and crashes in production with `RecursionError: maximum recursion depth exceeded` (Python) or `RangeError: Maximum call stack size exceeded` (Node). *Diagnosis:* the time recurrence $T(n - 1) + 1$ is fine; the *depth* recurrence is also $n$, and $n$ was 1,000 in tests and 200,000 in the incident. A BST built from sorted keys is a chain, which turns a "balanced, $\log n$ deep" assumption into this failure. *Fix:* iterate with an explicit stack; for trees, balance them or traverse iteratively. Raising the recursion limit is only a fix when $n$ is bounded.

**A combine step with a hidden quadratic.** *Symptom:* a merge-sort-shaped function is as slow as a bubble sort. *Diagnosis:* the merge builds its output with `result = result + [x]` (which copies `result` each time), or a string with `+=`, or checks `x in result` on a list, so the combine is $\Theta(n^2)$ and the recurrence becomes $2T(n/2) + n^2$, case 3, $\Theta(n^2)$; the divide-and-conquer structure buys nothing. Time the combine alone against its input size to confirm. *Fix:* `append`, a preallocated output, `"".join`, a set for membership.
## Choosing a method

| Method | Applies to | Effort | Gives | Weak spot |
|---|---|---|---|---|
| Recursion tree | anything you can draw | a minute with a table | the answer and *where the cost lives* | summing a series you do not recognise |
| Master theorem | $aT(n/b) + f(n)$ with a polynomial gap | twenty seconds | the answer | silent on gaps, subtractive and unequal splits |
| Akra–Bazzi | any $\sum a_i T(b_i n) + g(n)$ | solve for $p$, one integral | the answer for lopsided splits and log factors | needs the integral; overkill when sizes sum to $n$ |
| Substitution | anything, including floors and ceilings | an induction | a proof with an explicit constant | needs a guess; a bad guess fails without saying why |
| Instrumentation | the code as written | a counter and a timing loop | what the code actually does, including slices and library calls | measures only the $n$ you tried |

```exercise
id: count-recursive-calls
title: Count the calls of a halving recursion
prompt: |
  A recursive function on an input of size `n` returns immediately when `n <= 1`. Otherwise it calls itself on the two halves, sizes `n // 2` and `n - n // 2`, and combines the results.

  Implement `calls(n)` that returns the **total number of calls** to the function (including the top-level one) for an input of size `n ≥ 1`. For `n = 4` the answer is 7: one root call, two calls of size 2, four calls of size 1.

  This is `T(n) = 2T(n/2) + 1`, and your result should satisfy the closed form the lesson derives by substitution.
languages: [python, javascript]
entry: calls
starter:
  python: |
    def calls(n):
        # recursion is fine here: depth is only log n
        return 0
  javascript: |
    function calls(n) {
      // recursion is fine here: depth is only log n
      return 0;
    }
tests:
  - args: [1]
    expected: 1
    label: base case
  - args: [2]
    expected: 3
  - args: [3]
    expected: 5
    label: uneven split
  - args: [4]
    expected: 7
  - args: [8]
    expected: 15
  - args: [100]
    expected: 199
    hidden: true
  - args: [1000]
    expected: 1999
    hidden: true
hints:
  - "calls(n) = 1 + calls(n // 2) + calls(n - n // 2), with calls(1) = 1."
  - "The closed form is 2n - 1: a binary tree with n leaves has n - 1 internal nodes. Either the recursion or the formula passes."
```

```exercise
id: hanoi-move-list
title: Generate the Towers of Hanoi moves
prompt: |
  Return the list of moves that transfers `n` discs from peg `"A"` to peg `"C"` using `"B"` as the spare, obeying the usual rule (never place a larger disc on a smaller one). Each move is a two-element list `[from, to]`.

  Use the standard recursion: move `n - 1` discs to the spare, move the largest disc, move `n - 1` discs onto it. The result has exactly `2^n - 1` moves, which is the solution of `T(n) = 2T(n - 1) + 1`.
languages: [python, javascript]
entry: hanoi
starter:
  python: |
    def hanoi(n):
        moves = []
        def solve(k, src, dst, spare):
            # append [src, dst] moves to `moves`
            pass
        solve(n, "A", "C", "B")
        return moves
  javascript: |
    function hanoi(n) {
      const moves = [];
      function solve(k, src, dst, spare) {
        // push [src, dst] moves onto `moves`
      }
      solve(n, "A", "C", "B");
      return moves;
    }
tests:
  - args: [0]
    expected: []
    label: no discs
  - args: [1]
    expected: [["A", "C"]]
  - args: [2]
    expected: [["A", "B"], ["A", "C"], ["B", "C"]]
  - args: [3]
    expected: [["A", "C"], ["A", "B"], ["C", "B"], ["A", "C"], ["B", "A"], ["B", "C"], ["A", "C"]]
  - args: [4]
    expected: [["A", "B"], ["A", "C"], ["B", "C"], ["A", "B"], ["C", "A"], ["C", "B"], ["A", "B"], ["A", "C"], ["B", "C"], ["B", "A"], ["C", "A"], ["B", "C"], ["A", "B"], ["A", "C"], ["B", "C"]]
    hidden: true
    label: 15 moves
hints:
  - "solve(k, src, dst, spare): if k == 0 return; solve(k-1, src, spare, dst); record [src, dst]; solve(k-1, spare, dst, src)."
  - "The roles of the pegs swap at each level; pass them as parameters rather than hard-coding letters inside the recursion."
```

## Interviewer follow-ups

**"Your merge sort is $O(n \log n)$ time. What is the recurrence for its space?"** *Model answer:* the stack is the tree's depth, $S(n) = S(n/2) + O(1) = O(\log n)$ frames; the live buffers are at most the current call's $n$ plus its ancestors' halves, $n + n/2 + n/4 + \cdots < 2n$, so $O(n)$ auxiliary. Total allocation over the run is $O(n \log n)$, but peak live is what matters. *Common wrong answer:* "$O(n \log n)$ space, one $n$ per level", which confuses total allocation with peak occupancy.

**"Apply the master theorem to $T(n) = 2T(n/2) + n \log n$."** *Model answer:* it does not apply: $f$ exceeds $n$ by only a log factor, not $n^\varepsilon$. Summing the tree gives $n(\log n + (\log n - 1) + \cdots + 1) = \Theta(n \log^2 n)$; the extended case 2 says the same. *Common wrong answer:* "case 3, $\Theta(n \log n)$" or "case 2, $\Theta(n \log n)$", both losing a logarithm.

**"One half's result is used twice, so you call the function three times on $n/2$. How much does that cost?"** *Model answer:* $3T(n/2) + n$ instead of $2T(n/2) + n$, which is $\Theta(n^{1.585})$ instead of $\Theta(n \log n)$: a polynomial factor, because the extra call is made at *every* node. Compute each subresult once and return both. *Common wrong answer:* "it is $3/2$ times slower", true only if the extra call happened once at the top.

**"How would you check that your recurrence is right?"** *Model answer:* count calls and per-depth work and compare to the tree; time at several $n$ and divide by the prediction, looking for a flat ratio; or the doubling test (for $n \log n$, doubling $n$ costs a bit more than 2×; for $n^2$, 4×). *Common wrong answer:* "run it on the sample input and see that it is fast", which measures one $n$ and cannot tell $n \log n$ from $n^2$.

**"Is memoised Fibonacci $O(n)$?"** *Model answer:* $O(n)$ additions, so $O(n)$ in the RAM model; but $\text{fib}(n)$ has $\Theta(n)$ digits, so the bit-level cost is $\Theta(n^2)$. Modulo a prime the digits stay bounded and it is genuinely $O(n)$; matrix exponentiation gets $O(\log n)$. *Common wrong answer:* "$O(n)$" with no mention of number size, or "$O(\log n)$ with memoisation", which confuses the memo with a different algorithm.

## What mid-level engineers get wrong

- **Applying the master theorem to $T(n - 1)$ shapes.** It needs division by $b > 1$; subtractive recurrences are sums or exponentials, solved by unrolling.
- **Reading the depth as the time.** "$\log n$ deep, so $O(\log n)$" holds only for one call per level; two calls per level with $\log n$ depth means $n$ leaves and at least $\Theta(n)$.
- **Forgetting that slicing is work.** A Python recursion that slices its input has $+n$ in its combine whether or not the code "does anything" with the slice; it turns $\Theta(\log n)$ binary search into $\Theta(n)$.
- **Believing lopsided splits are quadratic.** A $1 : 99$ split is still $\Theta(n \log n)$; only removing a constant *number* of elements is quadratic. The converse mistake is assuming quicksort is always $n \log n$ and shipping a first-element pivot.
- **Analysing the code they meant to write.** The recurrence must match the call graph as written: the redundant second call to the same subproblem, the `in` test on a list inside the merge, the string built with `+=`.
- **Ignoring the base case's cost.** Real sorts switch to insertion sort at 16–64 elements; that sets the constant, and leaves costing $\Theta(m^2)$ for fixed $m$ is the honest description of `sorted()`.

## Senior signals

- You write the recurrence from code by answering "how many calls, on what size, plus what work", and "what work" includes slices, concatenations and membership tests.
- You solve by recursion tree first, name the regime (root-dominated, leaf-dominated, equal per level) and can produce the level table for a small $n$ on a whiteboard.
- You state the master theorem's three cases from memory, apply it to $a = 3, b = 2$ style questions in seconds, check regularity for case 3, and know the four shapes it refuses (log-factor gaps, subtractive recurrences, unequal splits, square-root shrinkage) and the tool for each.
- You can run Akra–Bazzi on $T(n) = T(n/2) + T(n/4) + n$ and cross-check the $\Theta(n)$ answer against the geometric per-level sum.
- You recognise "two calls on $n - 1$" as exponential and "two calls on $n/2$ with linear combine" as $n \log n$ instantly, and you know any constant-fraction split, however lopsided, is still $n \log n$.
- You explain that memoisation replaces the recurrence with (distinct states) × (work per state); you give the recursion depth as the space cost, know CPython's 1,000-frame default, and convert decrementing recursions to iteration when $n$ is unbounded.
- Before trusting a recurrence for code that will see a growing $n$, you instrument it: count calls, divide the time by the prediction, look for a flat line.

## Check yourself

```quiz
- q: >-
    An algorithm splits its input into three equal parts, recurses on all three, and combines the results in linear time. What is its complexity?
  options: ["Θ(n^1.585)", "Θ(n²)", "Θ(n log n)", "Θ(n)"]
  answer: 2
  explanation: >-
    T(n) = 3T(n/3) + n; here a = 3, b = 3, so n^(log₃ 3) = n, which matches f(n) = n: master theorem case 2, Θ(n log n). The n^1.585 figure is for a = 3, b = 2 (Karatsuba), where the problem sizes halve but there are three of them. Θ(n) would need the combine step to be cheaper than n, and Θ(n²) would need more subproblems than the split factor.
- q: >-
    Which recurrence describes an exponential-time algorithm?
  options: ["T(n) = 2T(n/2) + n", "T(n) = T(n - 1) + n²", "T(n) = 2T(n - 1) + 1", "T(n) = 4T(n/2) + n²"]
  answer: 2
  explanation: >-
    Two calls that each shrink n by only a constant produce a tree of depth n that doubles in width each level: 2^n nodes. 2T(n/2) + n is n log n and T(n - 1) + n² is cubic (1² + 2² + ... + n²). 4T(n/2) + n² has more branches, but they shrink n by a constant factor, so the depth is only log n and it is polynomial: Θ(n² log n).
- q: >-
    A recursive binary search in Python passes `xs[:mid]` or `xs[mid + 1:]` to the recursive call. Measured, it takes 3.3 ms on a million elements against 0.9 µs for the index-passing version. Which recurrence explains the gap?
  options: ["T(n) = 2T(n/2) + 1, so both halves are visited", "T(n) = T(n - 1) + 1, because slicing removes one element", "T(n) = T(n/2) + log n, which adds a log factor", "T(n) = T(n/2) + n, case 3, so the search is Θ(n)"]
  answer: 3
  explanation: >-
    The slice copies half the list before every call, so the non-recursive work is Θ(n), not Θ(1). With a = 1 and b = 2 the leaves cost n^0 = 1, f(n) = n is polynomially larger, regularity holds, and the root dominates: Θ(n). The code still visits one half, and each call still halves the size; the copying is the whole problem.
- q: >-
    You memoise the naive recursive Fibonacci function. How does the complexity change, and why?
  options: ["It becomes Θ(n), since each of the n arguments is computed once", "It becomes Θ(n²), since each call scans the memo table", "It becomes Θ(log n), as with fast matrix exponentiation", "It stays Θ(φ^n), because the call tree is unchanged"]
  answer: 0
  explanation: >-
    Memoisation means the recurrence no longer describes the cost; the cost becomes the number of distinct states (n) times the work per state (constant in the RAM model), and repeated calls return from the memo instead of re-expanding the tree. Θ(log n) needs a different algorithm (matrix powers), not a cache. The recursion depth is still n, so the auxiliary space is Θ(n).
- q: >-
    For T(n) = 2T(n/2) + n log n, why does the master theorem not apply, and what is the answer?
  options: ["f exceeds n only by a log factor, not n^ε; Θ(n log² n)", "Case 2 applies since f(n) is about n; Θ(n log n)", "Case 3 applies since f(n) grows faster than n; Θ(n log n)", "Case 1 applies since the leaves dominate; Θ(n)"]
  answer: 0
  explanation: >-
    Compare f(n) = n log n with n^(log₂ 2) = n. Case 3 needs f(n) = Ω(n^(1+ε)), and n log n is not that for any ε > 0, because it is larger by only a logarithmic factor; case 2 needs f(n) = Θ(n), which is also false. Summing the tree levels (n log n + n log(n/2) + ...) gives Θ(n log² n), and Akra–Bazzi with p = 1 gives the same.
- q: >-
    For T(n) = T(n/2) + T(n/4) + n, Akra–Bazzi gives p ≈ 0.694 and the answer Θ(n). What is the quickest independent check of that answer?
  options: ["The leaf count is n^0.694, which is smaller than n, so the leaves cannot dominate", "The sizes at each level sum to 3/4 of the level above, so the work is a geometric series under 4n", "Substitution with T(k) ≤ ck fails, which shows the bound is at least n log n", "The depth is log₂ n and each level does n work, so the total is n log n"]
  answer: 1
  explanation: >-
    A node of size m has children of sizes m/2 and m/4, so each level does 3/4 of the work of the level above: n, 3n/4, 9n/16, ... which sums to less than 4n. The root dominates and the total is Θ(n). The levels do not each do n work (that needs sizes summing to n), and substitution with T(k) ≤ ck does close here (T(n) ≤ 3cn/4 + n ≤ cn for c ≥ 4), which confirms rather than refutes the linear bound.
```
