---
slug: asymptotic-notation
title: "Asymptotic notation: O, Ω, Θ and the growth classes that matter"
description: What O, Ω and Θ actually claim, the growth classes you will meet from constant to exponential with concrete sizes, the intuition for logarithms, and how to read a complexity off unfamiliar code in under a minute.
minutes: 45
difficulty: intro
tags: [complexity, big-o, big-theta, big-omega, growth-classes, fundamentals]
problems: [contains-duplicate, binary-search-basic]
---
An interviewer asks for the complexity of your solution and you say "$O(n)$". They ask "is that tight?" and you are not sure what they mean. Later they say "the constraint is $n \le 10^5$, so $O(n^2)$ is out". You nod, but you could not have said where that line falls, or why $n \le 10^5$ implies anything.

Both of those come from the same gap: treating Big-O as a label on algorithms rather than as a precise statement about functions. This lesson fixes the definitions, then makes them usable: the growth classes you will actually meet, what sizes each one can handle in about a second, how to get an intuition for $\log n$ that you can do in your head, and a procedure for reading the class off code.

## What the notations claim

Every notation here compares two functions of $n$, the cost of your code $f(n)$ against a simpler reference $g(n)$, and only cares about large $n$.

**$f(n) = O(g(n))$**: eventually $f$ is bounded above by a constant times $g$. Formally, there exist $c > 0$ and $n_0$ such that $f(n) \le c \cdot g(n)$ for all $n \ge n_0$. It is an upper bound. $3n + 2 = O(n)$ with $c = 4, n_0 = 2$. But $3n + 2 = O(n^2)$ is *also* true, and so is $3n + 2 = O(2^n)$. Big-O is "no worse than", not "equal to".

**$f(n) = \Omega(g(n))$**: eventually $f$ is bounded *below* by a constant times $g$. A lower bound. $n^2/2 - n/2 = \Omega(n^2)$: for $n \ge 2$, $n^2/2 - n/2 \ge n^2/4$.

**$f(n) = \Theta(g(n))$**: both at once. $f$ and $g$ grow at the same rate up to constants. $n^2/2 - n/2 = \Theta(n^2)$. This is the "tight" bound the interviewer was asking about.

When an engineer says "this is $O(n)$" they almost always mean $\Theta(n)$: "the cost grows linearly", not "the cost grows at most linearly". The distinction matters when it is pointed out. Saying binary search is $O(n)$ is technically true and practically useless; saying it is $\Theta(\log n)$ in the worst case is the answer. If you want to be exact without being pedantic, say "$O(n)$, and that's tight".

A sharper point about what the bound is *of*. "Worst case $O(n^2)$" and "average case $O(n \log n)$" are statements about different functions: the maximum cost over all inputs of size $n$, versus the expected cost over some distribution of inputs. Quicksort is both, and neither statement contradicts the other. When you give a complexity, you are implicitly picking a case; pick it out loud.

## The growth classes and what they can afford

A CPU core does on the order of $10^8$ to $10^9$ simple operations per second, and a compiled language gets closer to the top of that range while an interpreted one sits at the bottom. Using $10^8$ per second as a conservative budget for "about a second", here is what each class can process.

| Class | Name | $n$ that fits in ~1 s | Where it comes from |
|---|---|---|---|
| $O(1)$ | constant | any | array index, hash lookup, arithmetic |
| $O(\log n)$ | logarithmic | any | binary search, balanced tree ops, halving loops |
| $O(n)$ | linear | ~$10^8$ | one pass, hash-map counting, two pointers |
| $O(n \log n)$ | linearithmic | ~$5 \times 10^6$ | comparison sorting, divide and conquer, heaps |
| $O(n^2)$ | quadratic | ~$10^4$ | all pairs, nested loops, naive DP tables |
| $O(n^3)$ | cubic | ~500 | all triples, Floyd–Warshall, matrix multiply |
| $O(2^n)$ | exponential | ~26 | every subset, brute-force backtracking |
| $O(n!)$ | factorial | ~11 | every permutation |

This table is how you decode constraints. If a problem says $n \le 10^5$, then $n^2 = 10^{10}$ is a hundred seconds of work; the intended solution is $O(n \log n)$ or $O(n)$. If $n \le 20$, an $O(2^n)$ solution ($\approx 10^6$ subsets) is not only acceptable but probably intended. If $n \le 5000$, $O(n^2) = 2.5 \times 10^7$ is fine and you should not waste time hunting for something cleverer. Reading the constraint before choosing the approach saves more interview time than any other habit.

Two rows deserve a closer look.

**$O(n \log n)$ is almost linear.** For $n = 10^6$, $\log_2 n \approx 20$; the sort costs about twenty passes' worth of work. That is why "sort first, then do a linear pass" is such a common winning strategy: sorting is cheap enough that it is rarely the bottleneck, and sorted input makes many things trivial.

**$O(2^n)$ is a cliff.** Doubling $n$ from 20 to 40 does not double the work; it multiplies it by a million. Any approach that enumerates subsets is only viable for $n$ in the twenties, which is a useful tell: if the constraint is $n \le 20$, the problem setter is telling you subsets are fine.

## Getting an intuition for log

$\log_2 n$ answers one question: how many times can you halve $n$ before you reach 1? Or, equivalently, how many bits does $n$ take to write down (minus one)?

| $n$ | $\log_2 n$ |
|---|---|
| 1,000 | ~10 |
| 1,000,000 | ~20 |
| 1,000,000,000 | ~30 |
| $10^{12}$ | ~40 |

The pattern: every factor of a thousand adds about ten. So a billion-element sorted array needs at most 30 probes for binary search, and a balanced binary tree of a billion nodes is about 30 levels tall. Those are the numbers behind the claim that "$\log n$ is effectively constant": no realistic input makes $\log_2 n$ larger than about 60, because $2^{60}$ is more bytes than exist in most data centres.

```viz
{"type": "array", "algorithm": "binary-search", "values": [3, 7, 11, 15, 19, 24, 31, 38, 44, 52, 61, 70, 85, 93, 99, 104], "target": 85, "title": "Sixteen elements, four probes", "caption": "Each probe halves the remaining range. log₂(16) = 4, so at most four probes for any target."}
```

The base of the logarithm does not matter inside Big-O. $\log_2 n = \log_{10} n / \log_{10} 2 \approx 3.32 \log_{10} n$, a constant factor, so $O(\log_2 n) = O(\log_{10} n) = O(\ln n)$ and you just write $O(\log n)$. It does matter for exact counts: a B-tree with fan-out 1,000 is $\log_{1000} n$ levels tall, which for a billion keys is 3 rather than 30, and that factor of ten is exactly why databases use B-trees rather than binary trees on disk. The [logarithms lesson](/learn/foundations/math-for-engineers/logarithms-and-exponentials) goes further.

One more shape you will see: $O(\log \log n)$ and $O(\sqrt{n})$. $\sqrt{10^{12}} = 10^6$, so a $\sqrt{n}$ algorithm on a trillion is still fast. And $\log \log n$ is for practical purposes a small constant (about 5 for $n = 10^{9}$); it shows up in the analysis of interpolation search and randomised load balancing and you rarely need more than "it's tiny".

## Comparing growth rates

You will need to order expressions that do not appear in the table. The ordering, from slowest-growing to fastest, is:

$$
1 \prec \log n \prec \sqrt{n} \prec n \prec n \log n \prec n^2 \prec n^3 \prec 2^n \prec n! \prec n^n
$$

Some rules for anything not on that line:

- **Polynomials sort by exponent**: $n^{1.5} \prec n^2$, and $n^2 \log n \prec n^{2.1}$ because any positive power of $n$ eventually beats any power of $\log n$.
- **Any exponential beats any polynomial**: $1.01^n$ eventually exceeds $n^{100}$, though "eventually" here is $n$ in the many thousands.
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

The sort is $O(n \log n)$. The while loop looks like it could run forever, but every iteration moves `lo` up or `hi` down and they start $n - 1$ apart, so it runs at most $n - 1$ times, each iteration $O(1)$. Total $O(n \log n) + O(n) = O(n \log n)$. That "every iteration makes progress on a bounded quantity" argument is the standard way to bound a loop with a non-obvious counter; the [invariants lesson](/learn/foundations/problem-solving/invariants-and-loop-reasoning) turns it into a habit.

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

If each part has constant length, the $k$-th iteration copies about $k$ characters (strings are immutable, so `+=` allocates a new one). Summed: $\Theta(n^2)$ characters copied for $n$ parts. `"".join(parts)` is $\Theta(n)$. (CPython has an optimisation that sometimes makes `+=` in-place when the string's refcount is 1, which makes this look fine in a microbenchmark and then fail in code where it does not apply. The [strings lesson](/learn/foundations/how-code-runs/numbers-strings-unicode) has the details.)

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

## Senior signals

- You say "$\Theta(n \log n)$, and that's tight" rather than the vaguer "$O(n \log n)$", and you know that $O$ is an upper bound that permits slack.
- You decode a constraint like $n \le 10^5$ into "quadratic is out, $n \log n$ is intended" before you start designing, and $n \le 20$ into "subset enumeration is fine".
- You keep separate variables for separate inputs ($O(V + E)$, $O(nm)$, $O(n \cdot L)$) and do not collapse them without saying what you assumed.
- You can do $\log_2$ of a billion in your head (about 30) and explain why base does not matter asymptotically but does matter for a B-tree.
- You state which case (worst, average, amortised) you are reporting and what distributional assumption the average rests on.
- When the input is a number, you know the input size is its digit count and can say why trial division is exponential.

## Check yourself

```quiz
- q: >-
    Binary search on a sorted array of n elements is correctly described as which of the following?
  options: ["O(n) only", "Θ(log n) worst case, and also O(n), since O is an upper bound", "Ω(n) because it must read the input", "Θ(1) because log n is effectively constant"]
  answer: 1
  explanation: >-
    The tight worst-case bound is Θ(log n). Because Big-O is only an upper bound, O(n) is also a true (if uninformative) statement. Binary search does not read the whole input, so Ω(n) is false. "Effectively constant" is an engineering remark, not a complexity class.
- q: >-
    A problem states 1 ≤ n ≤ 200,000. Which complexity is the intended solution most likely to have?
  options: ["O(n²), since 200,000² is manageable", "O(n log n) or O(n)", "O(2^n)", "O(n³)"]
  answer: 1
  explanation: >-
    n² = 4 × 10¹⁰ operations is minutes of work, so quadratic is ruled out; n log n ≈ 3.6 × 10⁶ is comfortable. Exponential and cubic are far worse. The constraint is the setter telling you the target class.
- q: >-
    Which expression grows fastest as n → ∞?
  options: ["n² log n", "n^2.5", "2^(log₂ n) · n", "1.5^n"]
  answer: 3
  explanation: >-
    Any exponential with base > 1 eventually beats every polynomial, so 1.5^n wins. Note 2^(log₂ n) · n simplifies to n · n = n², and n^2.5 beats n² log n since a power of n beats any power of log n.
- q: >-
    A function loops over an array of n strings and, for each, checks membership in a Python list that accumulates the results so far. What is its complexity, and what one change fixes it?
  options: ["O(n); nothing to fix", "O(n²); use a set for the membership check", "O(n log n); sort first", "O(n²); the list must be preallocated"]
  answer: 1
  explanation: >-
    `x in a_list` scans the list, O(k) at step k, so the total is O(n²). A set turns each membership test into expected O(1), making the whole thing O(n). Preallocation does not change scan cost; sorting does not help a membership test that runs inside the loop.
- q: >-
    A graph algorithm visits every vertex once and, for each vertex, scans its adjacency list once. An interviewer asks for the complexity. The best answer is:
  options: ["O(V²)", "O(V + E), which is O(V²) only for dense graphs", "O(E)", "O(V log V)"]
  answer: 1
  explanation: >-
    The work is V vertex visits plus the total length of all adjacency lists, which is E (or 2E undirected). Collapsing to O(V²) silently assumes a dense graph; O(E) alone forgets isolated vertices. Keeping both variables is the senior answer.
- q: >-
    Checking whether an integer k is prime by trial division up to √k runs in O(√k) divisions. Why is this not considered a polynomial-time algorithm?
  options: ["Because square roots are slow to compute", "Because the input size is the number of bits b in k, and √k = 2^(b/2) is exponential in b", "Because it is O(k), which is linear", "It is polynomial; the claim is a myth"]
  answer: 1
  explanation: >-
    Complexity is measured against the size of the input, and a number's size is its digit or bit count. A 64-bit number takes up to 2^32 divisions; doubling the bit count squares the work. That is exponential in the input size even though it looks like a small power of k.
```
