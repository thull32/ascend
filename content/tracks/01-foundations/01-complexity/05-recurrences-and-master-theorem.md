---
slug: recurrences-and-master-theorem
title: "Recurrences and the master theorem"
description: How to write the recurrence for a recursive algorithm, solve it by drawing the recursion tree, by substitution, or by the master theorem, and recognise the handful of recurrences that cover almost every algorithm you will meet.
minutes: 45
difficulty: medium
tags: [complexity, recurrences, master-theorem, recursion-tree, divide-and-conquer]
problems: [pow-x-n, merge-k-sorted-lists]
---
You write merge sort, and you know it is $O(n \log n)$ because everyone says so. Then you write something that splits the input into three parts, recurses on two of them and does a linear scan to combine, and you have no idea what it costs. Or you write a recursive solution that calls itself twice on $n - 1$ and cannot say whether that is polynomial or exponential (it is exponential, and the interviewer is waiting for you to notice).

Loops you can count directly. Recursion you have to *unroll*, and the tool for that is a recurrence: an equation that gives the cost on $n$ in terms of the cost on smaller inputs. This lesson covers how to write one from code and three ways to solve it, in increasing order of power and decreasing order of how often you need them.

## From code to recurrence

A recurrence has two parts: what the function does at each call (the non-recursive work) and what recursive calls it makes. Take merge sort:

```python
def merge_sort(xs):
    if len(xs) <= 1:                      # base case: T(1) = O(1)
        return xs
    mid = len(xs) // 2
    left = merge_sort(xs[:mid])           # T(n/2)
    right = merge_sort(xs[mid:])          # T(n/2)
    return merge(left, right)             # O(n) to merge (plus O(n) for the slices)
```

Two calls on half the input, plus linear work, so

$$
T(n) = 2\,T(n/2) + O(n), \quad T(1) = O(1).
$$

Writing the recurrence is mechanical once you ask two questions: **how many recursive calls, on what size**, and **how much work outside the calls**. A few more, with the same questions answered:

| Code shape | Recurrence |
|---|---|
| Binary search: one call on half, $O(1)$ work | $T(n) = T(n/2) + 1$ |
| Traverse a linked list recursively | $T(n) = T(n - 1) + 1$ |
| Naive Fibonacci | $T(n) = T(n-1) + T(n-2) + 1$ |
| Towers of Hanoi | $T(n) = 2\,T(n-1) + 1$ |
| Generate all subsets by include/exclude | $T(n) = 2\,T(n-1) + O(1)$ (plus output) |
| Fast exponentiation ($x^n$ via $x^{n/2}$ squared) | $T(n) = T(n/2) + 1$ |
| Strassen matrix multiply | $T(n) = 7\,T(n/2) + O(n^2)$ |
| Karatsuba multiplication | $T(n) = 3\,T(n/2) + O(n)$ |

Ignore floors and ceilings ($n/2$ versus $\lfloor n/2 \rfloor$); they never change the asymptotic answer for the recurrences you will meet, and pretending $n$ is a power of two is a standard, legitimate simplification.

## Method 1: draw the recursion tree

The recursion tree is the method to try first, because it shows you *where the cost lives*, which is the thing you actually want to understand.

For $T(n) = 2T(n/2) + n$: the root does $n$ work and has two children of size $n/2$. Each child does $n/2$ work, so level 1 does $2 \cdot n/2 = n$ total. Level 2 has four nodes of size $n/4$, each doing $n/4$: total $n$ again. Every level does $n$ work, and there are $\log_2 n$ levels before the subproblems reach size 1. Total: $n \log_2 n$.

```viz
{"type": "recursion", "algorithm": "merge-sort-tree", "values": [38, 27, 43, 3, 9, 82, 10, 5], "title": "Merge sort's recursion tree", "caption": "Eight elements, three levels of splitting. Each level merges a total of eight elements, so the work is n per level times log n levels."}
```

The tree method answers three questions: how many levels (the depth), how much work per level, and whether the per-level work is constant, growing or shrinking as you go down. That last question decides everything.

**Same work at every level** ($T(n) = 2T(n/2) + n$): total is work-per-level times depth, $\Theta(n \log n)$.

**Work shrinks geometrically going down** ($T(n) = 2T(n/2) + n^2$): level $k$ does $2^k \cdot (n/2^k)^2 = n^2 / 2^k$. The series $n^2(1 + 1/2 + 1/4 + \cdots)$ converges to $2n^2$; the root dominates and the answer is $\Theta(n^2)$.

**Work grows geometrically going down** ($T(n) = 4T(n/2) + n$): level $k$ does $4^k \cdot n/2^k = 2^k n$. At the bottom level $k = \log_2 n$, that is $n \cdot n = n^2$, and the geometric series is dominated by its last term: $\Theta(n^2)$. The leaves dominate.

For binary search, $T(n) = T(n/2) + 1$: one node per level doing constant work, $\log_2 n$ levels, $\Theta(\log n)$.

```viz
{"type": "recursion", "algorithm": "binary-search-recursive", "values": [4, 9, 15, 22, 31, 47, 58, 66, 73, 90], "title": "One branch per level", "caption": "Each call makes a single recursive call on half the range: a chain, not a tree. Depth log n, constant work per node."}
```

For Hanoi, $T(n) = 2T(n-1) + 1$: the tree has depth $n$ (the size drops by one, not by half) and doubles in width at each level, so it has $2^n - 1$ nodes each doing constant work: $\Theta(2^n)$. This is the shape to recognise instantly: *two calls that each reduce $n$ by a constant* is exponential.

```viz
{"type": "recursion", "algorithm": "hanoi", "n": 4, "title": "Towers of Hanoi", "caption": "Moving n discs takes 2^n - 1 moves. Each level of the recursion doubles the number of calls and only reduces n by one."}
```

## Method 2: the master theorem

For recurrences of the exact form

$$
T(n) = a\,T(n/b) + f(n), \qquad a \ge 1,\ b > 1,
$$

the recursion tree argument above has been done once and for all. Compare $f(n)$, the work at the root, against $n^{\log_b a}$, the number of leaves (there are $a^{\log_b n} = n^{\log_b a}$ of them). Whichever is bigger dominates:

| Case | Condition | Result | Meaning |
|---|---|---|---|
| 1 | $f(n) = O(n^{\log_b a - \varepsilon})$ for some $\varepsilon > 0$ | $T(n) = \Theta(n^{\log_b a})$ | leaves dominate |
| 2 | $f(n) = \Theta(n^{\log_b a})$ | $T(n) = \Theta(n^{\log_b a} \log n)$ | every level equal |
| 3 | $f(n) = \Omega(n^{\log_b a + \varepsilon})$ and $a f(n/b) \le c f(n)$ for some $c < 1$ | $T(n) = \Theta(f(n))$ | root dominates |

Worked applications:

- **Merge sort**, $a = 2, b = 2, f(n) = n$. $n^{\log_2 2} = n^1$. $f(n) = \Theta(n)$: case 2, $\Theta(n \log n)$.
- **Binary search**, $a = 1, b = 2, f(n) = 1$. $n^{\log_2 1} = n^0 = 1$. Case 2, $\Theta(\log n)$.
- **Strassen**, $a = 7, b = 2, f(n) = n^2$. $n^{\log_2 7} \approx n^{2.807}$. $n^2$ is polynomially smaller: case 1, $\Theta(n^{2.807})$.
- **Karatsuba**, $a = 3, b = 2, f(n) = n$. $n^{\log_2 3} \approx n^{1.585}$. Case 1, $\Theta(n^{1.585})$, which is why it beats the $\Theta(n^2)$ schoolbook multiplication for large numbers.
- **Four subproblems of half size with linear combine**, $a = 4, b = 2, f(n) = n$. $n^{\log_2 4} = n^2$. Case 1, $\Theta(n^2)$.
- **$T(n) = 2T(n/2) + n^2$**: $n^{\log_2 2} = n$, $f(n) = n^2$ is polynomially larger, regularity holds ($2(n/2)^2 = n^2/2 \le c n^2$ with $c = 1/2$): case 3, $\Theta(n^2)$.

Two gaps to know about. The theorem says nothing when $f(n)$ falls *between* the cases by less than a polynomial factor: $T(n) = 2T(n/2) + n \log n$ is not case 2 (not $\Theta(n)$) and not case 3 ($n \log n$ is not $\Omega(n^{1 + \varepsilon})$ for any $\varepsilon$). The recursion tree still works: level $k$ does $n \log(n/2^k)$, summing to $\Theta(n \log^2 n)$. And it does not apply to *subtractive* recurrences like $T(n) = 2T(n-1) + 1$ or $T(n) = T(n-1) + n$ at all; those go back to the tree (or to a direct sum: $T(n) = T(n-1) + n$ is $1 + 2 + \cdots + n = \Theta(n^2)$).

## Method 3: substitution (guess and verify)

When the recurrence is irregular, guess the answer and prove it by induction. It is the method of last resort in interviews but the method of record in proofs.

Claim: $T(n) = T(\lfloor n/2 \rfloor) + T(\lceil n/2 \rceil) + n$ is $O(n \log n)$. Assume $T(k) \le c\,k \log_2 k$ for all $k < n$. Then

$$
T(n) \le c \tfrac{n}{2} \log \tfrac{n}{2} \cdot 2 + n = c\,n(\log n - 1) + n = c\,n \log n - cn + n \le c\,n \log n
$$

whenever $c \ge 1$. The induction closes, so $T(n) = O(n \log n)$ with $c = 1$ (ignoring the floor/ceiling wobble, which a slightly more careful base case absorbs).

The trap in substitution is guessing a bound that is true but whose induction does not close. Trying to prove $T(n) = 2T(n/2) + 1$ is $O(n)$ by assuming $T(k) \le ck$ gives $T(n) \le cn + 1$, which is *not* $\le cn$. The fix is to strengthen the hypothesis: assume $T(k) \le ck - 1$, and then $T(n) \le 2(cn/2 - 1) + 1 = cn - 1$. Subtracting a lower-order term to make an induction close is a standard move, and the recurrence really is $\Theta(n)$ (it is the number of nodes in a binary tree with $n$ leaves, $2n - 1$).

## The recurrences you must recognise on sight

Most recursive code you will ever analyse reduces to one of these. Learn the answers.

| Recurrence | Solution | Canonical algorithm |
|---|---|---|
| $T(n) = T(n/2) + 1$ | $\Theta(\log n)$ | binary search, fast exponentiation |
| $T(n) = T(n/2) + n$ | $\Theta(n)$ | quickselect (average), the root dominates |
| $T(n) = 2T(n/2) + 1$ | $\Theta(n)$ | tree traversal on a balanced tree |
| $T(n) = 2T(n/2) + n$ | $\Theta(n \log n)$ | merge sort, quicksort (average) |
| $T(n) = T(n - 1) + 1$ | $\Theta(n)$ | recursive list traversal |
| $T(n) = T(n - 1) + n$ | $\Theta(n^2)$ | quicksort worst case, selection sort |
| $T(n) = 2T(n - 1) + 1$ | $\Theta(2^n)$ | Hanoi, subset enumeration |
| $T(n) = T(n-1) + T(n-2) + 1$ | $\Theta(\phi^n) \approx \Theta(1.618^n)$ | naive Fibonacci |
| $T(n) = n \cdot T(n - 1)$ | $\Theta(n!)$ | permutation enumeration |

The pattern behind the table: **halving with one call** is logarithmic; **halving with two calls** is linear or linearithmic depending on the combine cost; **decrementing with one call** is linear or quadratic; **decrementing with two calls** is exponential. When you can place a recursive function in one of those four boxes, you have its complexity within a couple of seconds.

## Recurrences in disguise

A few places the recurrence shows up where you might not expect it.

**Memoisation changes the recurrence.** Naive Fibonacci makes $\Theta(\phi^n)$ calls, but with a memo each distinct $n$ is computed once, so there are $n$ distinct calls each doing $O(1)$ work: $\Theta(n)$. The recurrence for a memoised function is "number of distinct states times work per state", which is the whole idea behind [dynamic programming](/learn/algorithms/dynamic-programming/the-dp-mindset).

**Unbalanced splits.** Quicksort with a pivot that always lands at the 10th percentile gives $T(n) = T(n/10) + T(9n/10) + n$. The tree is lopsided, but each level still does $n$ work and the depth is $\log_{10/9} n \approx 22 \log_2 n / 3.3$: still $\Theta(n \log n)$, with a larger constant. Any *constant-fraction* split gives $n \log n$; only a split that removes a *constant number* of elements ($T(n - 1)$) degrades to quadratic. This is why a random pivot is good enough in practice.

**Multiple variables.** Merging $k$ sorted lists of total length $n$ by repeatedly merging pairs is $T(k) = 2T(k/2) + n$ in the number of lists, with $n$ fixed: $\log k$ levels each doing $n$ work, $\Theta(n \log k)$. Same result as using a heap, reached by a different route. The [k-way merge lesson](/learn/data-structures/heaps/top-k-and-k-way-merge) compares the two.

**Stack depth is a recurrence too.** The depth of the recursion tree is the space cost. For $T(n) = 2T(n/2) + n$ the depth is $\log n$; for $T(n) = 2T(n-1) + 1$ it is $n$, even though the *time* is exponential. The [space complexity lesson](/learn/foundations/complexity/space-complexity-and-memory-hierarchy) covers why that matters.

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

## Senior signals

- You write the recurrence from code by answering "how many calls, on what size, plus what work" before you say anything about the answer.
- You solve by recursion tree first and can say which of the three regimes applies: root-dominated, leaf-dominated, or equal per level.
- You state the master theorem's three cases from memory, apply it to $a = 3, b = 2$ style questions in seconds, and know the two situations where it does not apply (non-polynomial gaps, subtractive recurrences).
- You recognise "two calls on $n - 1$" as exponential and "two calls on $n/2$ with linear combine" as $n \log n$ instantly, and you know that any constant-fraction split, however lopsided, is still $n \log n$.
- You explain that memoisation replaces the recurrence with (distinct states) × (work per state), and you use that to bound DP solutions.
- You give the recursion depth as the space cost alongside the time, without being asked.

## Check yourself

```quiz
- q: >-
    An algorithm splits its input into three equal parts, recurses on all three, and combines the results in linear time. What is its complexity?
  options: ["Θ(n)", "Θ(n²)", "Θ(n log n)", "Θ(n^1.585)"]
  answer: 2
  explanation: >-
    T(n) = 3T(n/3) + n; here a = 3, b = 3, so n^(log₃ 3) = n, which matches f(n) = n: master theorem case 2, Θ(n log n). The n^1.585 figure is for a = 3, b = 2 (Karatsuba), where the problem sizes halve but there are three of them. Θ(n) would need the combine step to be cheaper than n, and Θ(n²) would need more subproblems than the split factor.
- q: >-
    Which recurrence describes an exponential-time algorithm?
  options: ["T(n) = T(n - 1) + n²", "T(n) = 4T(n/2) + n²", "T(n) = 2T(n/2) + n", "T(n) = 2T(n - 1) + 1"]
  answer: 3
  explanation: >-
    Two calls that each shrink n by only a constant produce a tree of depth n that doubles in width each level: 2^n nodes. 2T(n/2) + n is n log n and T(n - 1) + n² is cubic (1² + 2² + ... + n²). 4T(n/2) + n² has more branches, but they shrink n by a constant factor, so the depth is only log n and it is polynomial: Θ(n² log n).
- q: >-
    Quicksort's pivot always lands at the 1% mark, splitting the array 1:99. What is the resulting complexity?
  options: ["Θ(n), because each level discards most of the array", "Θ(n^1.99), from the 99% side of the split", "Θ(n²), because the split is so unbalanced", "Θ(n log n), since the depth is still logarithmic"]
  answer: 3
  explanation: >-
    The depth is log base 100/99 of n, which is about 69 log₂ n: logarithmic, just with a bigger constant. Each level still does n total work, since quicksort recurses on both sides. Only splits that remove a constant number of elements (T(n-1)) make the depth linear and the total quadratic.
- q: >-
    You memoise the naive recursive Fibonacci function. How does the complexity change, and why?
  options: ["It becomes Θ(n), since each of the n arguments is computed once", "It becomes Θ(log n), as with fast matrix exponentiation", "It stays Θ(φ^n), because the call tree is unchanged", "It becomes Θ(n²), since each call scans the memo table"]
  answer: 0
  explanation: >-
    Memoisation means the recurrence no longer describes the cost; the cost becomes the number of distinct states (n) times the work per state (constant), and repeated calls return from the memo instead of re-expanding the tree. Θ(log n) needs a different algorithm (matrix powers), not a cache. The recursion depth is still n, so the auxiliary space is Θ(n).
- q: >-
    For T(n) = 2T(n/2) + n log n, why does the master theorem not apply, and what is the answer?
  options: ["Case 1 applies since the leaves dominate; Θ(n)", "Case 3 applies since f(n) grows faster than n; Θ(n log n)", "f exceeds n only by a log factor, not n^ε; Θ(n log² n)", "Case 2 applies since f(n) is about n; Θ(n log n)"]
  answer: 2
  explanation: >-
    Compare f(n) = n log n with n^(log₂ 2) = n. Case 3 needs f(n) = Ω(n^(1+ε)), and n log n is not that for any ε > 0, because it is larger by only a logarithmic factor; case 2 needs f(n) = Θ(n), which is also false. Summing the tree levels (n log n + n log(n/2) + ...) gives Θ(n log² n).
```
