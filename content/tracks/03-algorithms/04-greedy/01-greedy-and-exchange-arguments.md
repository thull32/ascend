---
slug: greedy-and-exchange-arguments
title: "Greedy algorithms: when the obvious choice is safe"
description: The greedy-choice property, the exchange argument that proves it, the counterexamples that break it, and the sixty-second procedure for deciding greedy versus DP in an interview.
minutes: 55
difficulty: medium
tags: [greedy, exchange-argument, optimal-substructure, pattern:greedy]
problems: [maximum-subarray, hand-of-straights, partition-labels, valid-parenthesis-string, coin-change]
---
You have thirty conference rooms' worth of meeting requests and one room. Pick the schedule that fits the most meetings. The instinct is immediate: take the meeting that ends earliest, throw away everything it overlaps, repeat. That instinct is correct here, and the whole algorithm is a sort and a loop.

Now make change for 6 cents with coins worth 1, 3 and 4. The same instinct says take the biggest coin first: 4, then 1, then 1. Three coins. The right answer is 3 + 3, two coins. The instinct is wrong, and no amount of care in the loop will fix it.

Both algorithms are *greedy*: they make the locally best choice, commit to it, and never look back. The difference between them is not in the code but in a property of the problem. Learning to test for that property in a minute, and to prove it in two more, is the skill this lesson teaches. Everything else about greedy algorithms is a sort.

## What greedy actually means

A greedy algorithm builds a solution one decision at a time. At each step it picks the option that looks best *right now* by some fixed rule (earliest finish, largest coin, highest value per kilogram) and it never revisits a decision. That single fact makes greedy algorithms cheap: no branching, no table of subproblems, usually $O(n \log n)$ for the sort and $O(n)$ for the loop.

It also makes them fragile. Dynamic programming and backtracking explore alternatives and can recover from a bad early choice. Greedy cannot. So a greedy algorithm is only correct when a bad early choice is *impossible*, meaning that the locally best option is always part of some globally optimal solution. That is the property you must establish, and it has a name.

## The two properties you need

Textbooks state two conditions for a greedy algorithm to be correct.

**Greedy-choice property.** There exists an optimal solution that contains the greedy choice. Not "the greedy choice is good"; specifically, *some* optimal solution agrees with it. If every optimal solution disagrees with the greedy choice, greedy is dead on arrival, as in the 1/3/4 coin example: no optimal solution for 6 uses a 4.

**Optimal substructure.** After you make the greedy choice, what remains is a smaller instance of the same problem, and an optimal solution to the whole is the greedy choice plus an optimal solution to the remainder. Dynamic programming needs this property too; the difference is that DP tries every first choice and greedy tries one.

The greedy-choice property is the one that fails on real problems, and it is the one you prove. The standard tool is the exchange argument.

## The exchange argument, written out

Take activity selection: intervals `[start, end)`, choose the largest set with no two overlapping. Greedy rule: always take the remaining interval with the earliest end time.

Here is a concrete instance, already sorted by end time:

| Activity | A | B | C | D | E | F | G | H | I | J | K |
|---|---|---|---|---|---|---|---|---|---|---|---|
| start | 1 | 3 | 0 | 5 | 3 | 5 | 6 | 8 | 8 | 2 | 12 |
| end | 4 | 5 | 6 | 7 | 9 | 9 | 10 | 11 | 12 | 14 | 16 |

Greedy takes A (ends at 4). B, C, E and J start before 4, so they are gone. The next survivor is D (5–7). Then F and G start before 7; H (8–11) is next. I and J are out; K (12–16) is last. Result: `{A, D, H, K}`, four activities.

Is four optimal? Here is the exchange argument. Let `O` be any optimal solution, sorted by end time, and let `o₁` be its first activity. Greedy's first pick `g₁` has the earliest end time of *all* activities, so `end(g₁) ≤ end(o₁)`. Now swap: `O' = O − {o₁} + {g₁}`. Every other activity in `O` starts at or after `end(o₁)`, which is at or after `end(g₁)`, so nothing in `O'` overlaps `g₁`. `O'` is still feasible and still has `|O|` activities, so it is still optimal, and it agrees with greedy on the first choice. Delete `g₁` and everything it overlaps; what is left is a smaller activity-selection problem, and induction finishes the proof.

Run the swap on this instance. `{B, D, I, K}` is also feasible (B ends at 5 and D starts at 5; I ends at 12 and K starts at 12), has four activities, so it is optimal too, and it disagrees with greedy in two places:

| step | solution | first disagreement | swap | still feasible because |
|---|---|---|---|---|
| 0 | B(3–5), D(5–7), I(8–12), K(12–16) | B, where greedy has A | A in, B out | A ends at 4 ≤ 5 = end(B), and D starts at 5 ≥ 4 |
| 1 | A, D, I, K | I, where greedy has H | H in, I out | H ends at 11 ≤ 12 = end(I), and K starts at 12 ≥ 11 |
| 2 | A, D, H, K | none | | this is greedy's answer |

Each swap keeps the count at four and never moves a finish time later, so the solution you end with is greedy's and is still optimal. That is the whole proof, run on real data.

That is the entire template:

1. Take an arbitrary optimal solution.
2. Find the first place it disagrees with greedy.
3. Swap in the greedy choice and show the solution is still feasible and no worse.
4. Repeat until it equals greedy's solution.

Written in an interview it is three sentences: "Suppose an optimal schedule doesn't start with the earliest-ending meeting. Replace its first meeting with the earliest-ending one; nothing overlaps because it ends no later. So there is an optimal schedule that starts with the greedy choice, and I recurse." An interviewer who hears that stops worrying about correctness and moves on to follow-ups.

## Greedy stays ahead

A second proof style is "greedy stays ahead": show that after `k` steps, greedy's partial solution is at least as good as *any* partial solution of `k` steps, by some measure. For activity selection the measure is the finish time of the `k`-th chosen activity: greedy's `k`-th finish is always ≤ the optimal's `k`-th finish (induction on `k`). If the optimal solution had more activities than greedy, its `(m+1)`-th activity would start after the optimal's `m`-th finish, hence after greedy's `m`-th finish, so greedy could have taken it too, contradiction.

On the instance above, against the alternative optimum `{B, D, I, K}`:

| k | greedy's k-th finish | the other solution's k-th finish |
|---|---|---|
| 1 | A: 4 | B: 5 |
| 2 | D: 7 | D: 7 |
| 3 | H: 11 | I: 12 |
| 4 | K: 16 | K: 16 |

Greedy is never behind. A fifth activity in any solution would have to start at or after that solution's fourth finish, which is at or after greedy's fourth finish (16), so greedy would have taken it as well.

Use "stays ahead" when the greedy choice is about a running quantity (furthest reach, earliest finish, least fuel used); use exchange when the choice is about which element to include. Jump Game in the [next-but-one lesson](/learn/algorithms/greedy/classic-greedy-algorithms) is a pure stays-ahead proof.

## Where greedy fails

The counterexamples matter more than the proofs, because in an interview you find the counterexample first.

### Coin change with a non-canonical system

Coins `{1, 3, 4}`, amount 6. Greedy (largest first) gives `4 + 1 + 1`, three coins. The DP finds `3 + 3`:

```viz
{"type": "dp", "algorithm": "coin-change", "coins": [1, 3, 4], "amount": 6,
 "title": "Coin change by DP: the table finds 3 + 3 where greedy takes 4 + 1 + 1",
 "caption": "dp[6] = 1 + min(dp[5], dp[3], dp[2]) = 1 + dp[3] = 2. Greedy's first choice (a 4) forces dp[2] = 2 more coins."}
```

The greedy-choice property fails: no optimal solution for 6 contains a 4. Yet greedy is correct for `{1, 5, 10, 25}` and for every amount. Coin systems where largest-first is always optimal are called **canonical**. US, Euro and UK coins are canonical; `{1, 3, 4}` and the pre-decimal British `{1, 3, 6, 12, 24, 30}` (penny, threepence, sixpence, shilling, florin, half-crown) are not.

Two results settle the question for any concrete system. Kozen and Zaks (1994) proved that if a system `1 = c₁ < c₂ < … < cₘ` is non-canonical, its smallest counterexample lies strictly below `cₘ + cₘ₋₁`, so a brute-force comparison of greedy against the DP over that range is a complete test. Pearson (2005) gave an `O(m³)` test that examines the denominations alone. The brute force is the one you would write, and it is the one that tells you *which* amount fails:

```python
def is_canonical(coins):
    """True if largest-first is optimal for every amount (coins must include 1)."""
    coins = sorted(coins)
    bound = coins[-1] + coins[-2]        # Kozen-Zaks: any counterexample is below this
    dp = [0] + [float("inf")] * bound
    for a in range(1, bound + 1):        # exact answer for every amount up to the bound
        dp[a] = 1 + min(dp[a - c] for c in coins if c <= a)
    for a in range(1, bound):
        greedy, rest = 0, a
        for c in reversed(coins):        # largest-first
            greedy += rest // c
            rest %= c
        if greedy != dp[a]:
            return False                 # a is the smallest counterexample
    return True
```

Its verdicts, with the smallest counterexample and the two coin counts:

| system | canonical? | smallest counterexample |
|---|---|---|
| `{1, 5, 10, 25}` (US) | yes | none below 35 |
| `{1, 2, 5, 10, 20, 50, 100, 200}` (Euro) | yes | none below 300 |
| `{1, 3, 4}` | no | 6: greedy 4+1+1 (3), optimal 3+3 (2) |
| `{1, 4, 5}` | no | 8: greedy 5+1+1+1 (4), optimal 4+4 (2) |
| `{1, 5, 8}` | no | 10: greedy 8+1+1 (3), optimal 5+5 (2) |
| `{1, 5, 10, 21, 25}` | no | 31: greedy 25+5+1 (3), optimal 21+10 (2) |
| `{1, 3, 6, 12, 24, 30}` (pre-decimal UK) | no | 48: greedy 30+12+6 (3), optimal 24+24 (2) |

The DP fallback costs `O(amount × m)` time and `O(amount)` memory: an amount of `10⁴` with 12 denominations is `1.2 × 10⁵` inner steps, on the order of 10 ms in CPython and microseconds in C. That is cheap enough that the interview point is sharp: greedy coin change is *never* the right algorithm for arbitrary denominations, and [Coin Change](/practice/coin-change) is a DP problem. See [the knapsack family](/learn/algorithms/dynamic-programming/knapsack-family) for the DP.

### 0/1 knapsack versus fractional knapsack

Capacity 50. Items `(weight, value)`: `(10, 60)`, `(20, 100)`, `(30, 120)`. Value per unit weight: 6, 5, 4.

*Fractional* knapsack (you may take part of an item): take all of item 1 (10 kg, 60), all of item 2 (20 kg, 100), then 20 of item 3's 30 kg for `120 × 20/30 = 80`. Total 240, and greedy by ratio is optimal. Exchange argument: if an optimal solution carries some of a lower-ratio item while leaving any of a higher-ratio item behind, move weight from the low-ratio item to the high-ratio one; value goes up or stays equal.

*0/1* knapsack (whole items only): greedy by ratio takes items 1 and 2 (30 kg, 160) and cannot fit item 3. Optimal is items 2 and 3 (50 kg, **220**). The exchange breaks because you cannot move "part of" an item. Same data, same greedy rule, and one word in the problem statement decides whether it works.

### Adding weights breaks interval selection

Give each activity a value and ask for the maximum total value instead of the maximum count. Earliest-end greedy is now wrong: with `(0, 10)` worth 10 and three unit activities `(1, 2)`, `(3, 4)`, `(5, 6)` worth 1 each, greedy takes the three small ones for 3 while the long one alone is worth 10. No sort key rescues it; sorting by value takes the long one here and loses when two medium activities together outweigh it. Look at where the exchange argument breaks: swapping the earliest-ending activity into an optimal solution still keeps it feasible, but the swap can now *lower the value*, so step 3 of the template ("no worse") fails. Weighted interval scheduling is a DP: sort by end, let `p(i)` be the last activity that ends at or before `start(i)` (a binary search), and `best[i] = max(best[i − 1], value(i) + best[p(i)])`, `O(n log n)` in total.

| Problem | Greedy rule | Correct? | Why / why not |
|---|---|---|---|
| Activity selection | earliest end | yes | exchange: earliest end leaves the most room |
| Fractional knapsack | highest value/weight | yes | exchange: shift weight toward higher ratio |
| 0/1 knapsack | highest value/weight | **no** | cannot shift partial weight; needs DP |
| Coin change, canonical coins | largest coin | yes | property of the denominations |
| Coin change, arbitrary coins | largest coin | **no** | `{1,3,4}` at 6; needs DP |
| Weighted interval scheduling | earliest end | **no** | swap keeps feasibility but can lose value; DP with binary search |
| Minimum spanning tree | lightest safe edge | yes | cut property (a matroid) |
| Shortest path, non-negative weights | closest unsettled vertex | yes | Dijkstra; fails with negative edges |

## A paragraph on matroids

There is a clean theory underneath some of this. A **matroid** is a set system where independent sets are hereditary (subsets of independent sets are independent) and satisfy an exchange axiom (if `A` and `B` are independent and `|A| < |B|`, some element of `B` can be added to `A` keeping it independent). The theorem: for any matroid, the greedy algorithm "sort by weight, add each element if it keeps the set independent" finds a maximum-weight independent set. Acyclic edge sets of a graph form a matroid, which is exactly why Kruskal's algorithm works. The catch is that matroids are sufficient, not necessary: activity selection is not a matroid, and greedy still works there. So the working procedure is to prove greedy directly with an exchange argument, and to keep matroids as a one-sentence answer to "why does Kruskal work?".

## Deciding greedy versus DP in an interview

You cannot spend ten minutes on a proof. Use this procedure, which takes about a minute out loud.

1. **State the greedy rule as a sentence.** "Always take the interval that ends first." "Always take the biggest coin." If you cannot say it in one sentence, it is not a greedy problem.
2. **Try to break it with five elements or fewer.** Construct an input where the greedy first choice is *not* in any optimal solution. Two or three coin values, three or four items, an interval that is short but poorly placed. Counterexamples for real greedy failures are almost always tiny.
3. **If you broke it, go to DP.** Say so: "The greedy choice can be wrong here, for example `{1,3,4}` and 6, so I'll define a subproblem instead." That sentence is worth more than a correct greedy that you cannot justify.
4. **If you could not break it, sketch the exchange.** "Any optimal solution can be rewritten to start with the greedy choice without getting worse, because …". Then code.

Signals that lean greedy: the problem asks for a count, a maximum number of non-overlapping things, a minimum number of "covers", or feasibility (can you reach the end?); the input has a natural ordering; and constraints go to `10⁵` or beyond, which rules out `O(n²)` DP. Signals that lean DP: values that must be combined exactly (sum to a target, fill a capacity exactly), the word "ways", or an obvious greedy that fails your five-element test.

The problems attached to this lesson are all greedy with a twist. In [Hand of Straights](/practice/hand-of-straights) the greedy choice is "start a run at the smallest remaining card" (exchange: any run containing the smallest card must start there). In [Partition Labels](/practice/partition-labels) it is "extend the current partition to the last occurrence of every character seen so far". In [Valid Parenthesis String](/practice/valid-parenthesis-string) the greedy tracks a *range* of possible open counts instead of one value, which is the trick that makes a backtracking problem linear.

## Under the hood

**The sort is the cost.** A greedy algorithm is a sort followed by a linear pass, so its running time is the sort's. CPython's `list.sort` and `sorted` are Timsort (since 2.3; 3.11 switched the merge policy to powersort with the same $O(n \log n)$ bound): stable, at most about $n \log_2 n$ comparisons (`1.7 × 10⁶` for `n = 10⁵`), and $O(n)$ on input that is already sorted or made of a few sorted runs, which is what you get when intervals arrive from a database ordered by start. A `key=` function is called once per element and the keys are cached in a parallel array, so `sorted(items, key=lambda it: it[1])` costs `n` Python calls plus C-level comparisons of the cached keys; `functools.cmp_to_key` instead runs a Python function on *every* comparison, about `n log n` calls, and is slower by an order of magnitude on `10⁵` elements. JavaScript's `Array.prototype.sort` is stable too (required since ES2019) but compares as strings unless you pass a comparator: `[10, 9, 2].sort()` gives `[10, 2, 9]`, which silently breaks any greedy that sorts numbers.

**Greedy in the kernel and the scheduler.** Linux's CFS scheduler (through kernel 6.5) kept runnable tasks in a red-black tree keyed by virtual runtime and always ran the leftmost one: a greedy "least served so far" choice at $O(\log n)$ per pick. The EEVDF scheduler that replaced it in 6.6 is still greedy, running the eligible task with the earliest virtual deadline; the key changed because minimum-vruntime was fair over long horizons and poor at latency. Kubernetes' default scheduler filters the nodes a pod can run on, scores them, and binds to the best score with no backtracking; when a later pod fits nowhere, earlier placements are not revisited (the separate descheduler component exists to undo them).

**Greedy as a bounded heuristic.** Bin packing is NP-hard, and first-fit-decreasing (sort items by decreasing size, put each in the first bin with room) is the greedy that runs for VM and container placement. Its bound is known and tight: `FFD(I) ≤ 11/9 · OPT(I) + 6/9` bins (Dósa, 2007). The greedy set-cover algorithm is within a factor of about `ln n` of optimal. Production greedy is usually this kind of algorithm rather than an exactly optimal one, and the senior move is to say which kind you are proposing.

## Failure modes

**Symptom: a change-making service returns 3 coins where 2 are possible, for some amounts only.** The sample tests pass; a customer with a custom denomination set reports the bug. *Diagnosis:* run `is_canonical` on the configured denominations; the smallest counterexample it finds is the failing amount. *Fix:* replace the loop with the `O(amount × m)` DP, or validate at configuration time that the set is canonical and reject the rest.

**Symptom: a "maximise the number of jobs" scheduler places fewer jobs than a colleague can by hand.** *Diagnosis:* it sorts by start time or by duration; feed it `[1, 100], [2, 3], [4, 5]` and it keeps one job where three fit. *Fix:* sort by end time. The exchange argument holds for that key and no other.

**Symptom: `ZeroDivisionError` in Python, or `Infinity` and `NaN` sort keys in JavaScript, when ranking items by value density.** An item with weight 0 (a free upgrade, a zero-size file) reached `value / weight`. *Diagnosis:* the density key is a float division. *Fix:* compare densities by cross-multiplication in integers, `v₁ · w₂ > v₂ · w₁`, or sort on `fractions.Fraction`; zero-weight items sort first and cost nothing.

**Symptom: a cluster reports 30% free capacity while large pods sit Pending.** *Diagnosis:* first-fit placement spread small workloads across every node, and per-node free memory shows many small fragments that no single large request fits. *Fix:* when the batch is known, place requests in decreasing size order (FFD); otherwise score nodes to prefer filling partly used ones, and state the bound you are accepting rather than calling the result optimal.

## Greedy against its alternatives

| Approach | Time | Memory | Guarantee | Proof burden | Reach for it when |
|---|---|---|---|---|---|
| Greedy, exact | $O(n \log n)$ | $O(1)$ beyond the sort | optimal, if the exchange argument holds | one exchange argument | count, feasibility or cover problems with a single sort key |
| Dynamic programming | $O(n \cdot \text{states})$ | $O(\text{states})$ | optimal | a correct state and transition | exact targets, weights, "number of ways" |
| Backtracking with pruning | exponential in the worst case | $O(\text{depth})$ | optimal | none, but the clock | tiny inputs, constraints that prune hard |
| Greedy heuristic (FFD, least-connections) | $O(n \log n)$ | $O(1)$ | within a proven or measured factor | the bound, or a benchmark | NP-hard packing and routing at production scale |

## Kadane's algorithm: greedy and DP at once

[Maximum Subarray](/practice/maximum-subarray) is worth a close look because it is the most common place where the two ideas merge. The rule: walk the array keeping `cur`, the best sum of a subarray *ending here*, and set `cur = max(x, cur + x)`.

```viz
{"type": "array", "algorithm": "kadane", "values": [-2, 1, -3, 4, -1, 2, 1, -5, 4],
 "title": "Kadane's algorithm",
 "caption": "cur resets whenever the running sum would drag the next element down; best remembers the peak (6, from [4, -1, 2, 1])."}
```

Read as DP: `best_ending[i] = max(a[i], best_ending[i-1] + a[i])`, a one-dimensional table with $O(1)$ state. Read as greedy: "a prefix with negative sum can never help, so drop it". The exchange argument is one line: if an optimal subarray starts inside a negative-sum prefix, cutting that prefix off increases the sum. Both readings are correct, and saying "this is a DP with a greedy justification for why the state is one number" is exactly the kind of sentence that signals seniority.

```python
def max_subarray(nums):
    best = cur = nums[0]
    for x in nums[1:]:
        cur = max(x, cur + x)      # greedy: drop a negative prefix
        best = max(best, cur)
    return best
```

## Two greedy algorithms to implement

The first is a pure exchange-argument problem. You have people with weights and boats that carry at most two people and at most `limit` total weight. Minimise the boats. Greedy: sort, pair the heaviest person with the lightest if they fit, otherwise the heaviest goes alone. Exchange: the heaviest person `h` must be in some boat; if the lightest person `l` fits with `h` and an optimal solution pairs `h` with someone else (or nobody), swap `l` in; the boat still fits and whoever was displaced fits wherever `l` was, since they are at least as light as `l`'s old partner is heavy. Trace `[3, 2, 2, 1]`, limit 3: sorted `[1, 2, 2, 3]`; `1 + 3 > 3` so 3 goes alone; `1 + 2 ≤ 3` so they share; the last 2 goes alone. Three boats.

```exercise
id: min-boats
title: Minimum boats with a two-person limit
prompt: |
  Each boat carries at most two people and at most `limit` total weight.
  Every person weighs at most `limit`. Return the minimum number of boats
  needed to carry everyone in `people`.

  Aim for O(n log n). The empty list needs 0 boats.
languages: [python, javascript]
entry: min_boats
starter:
  python: |
    def min_boats(people, limit):
        # sort, then two pointers from both ends
        return 0
  javascript: |
    function min_boats(people, limit) {
      // sort numerically (beware the default string sort), then two pointers
      return 0;
    }
tests:
  - args: [[1, 2], 3]
    expected: 1
  - args: [[3, 2, 2, 1], 3]
    expected: 3
  - args: [[3, 5, 3, 4], 5]
    expected: 4
    label: nobody can share
  - args: [[], 5]
    expected: 0
    label: empty input
  - args: [[5], 5]
    expected: 1
  - args: [[2, 4, 1, 3, 5, 2], 6]
    expected: 3
    hidden: true
  - args: [[1, 1, 1, 1], 2]
    expected: 2
    hidden: true
hints:
  - "Sort ascending. Keep `i` at the lightest and `j` at the heaviest; every iteration sends person `j` on a boat, and adds person `i` to it when `people[i] + people[j] <= limit`."
  - "In JavaScript, `arr.sort()` sorts as strings; use `arr.sort((a, b) => a - b)`."
```

The second is fractional knapsack, the canonical *correct* greedy. Sort by value per unit weight, take whole items while they fit, then a fraction of the next one. The tests use weights and values chosen so that `value * take / weight` is exact; compute the fraction in that order to avoid floating-point noise.

```exercise
id: fractional-knapsack
title: Fractional knapsack by value density
prompt: |
  Items have `weights[i]` and `values[i]`; the knapsack holds `capacity`.
  You may take any fraction of an item. Return the maximum total value.

  Compute the value of a partial item as `values[i] * take / weights[i]`
  (multiply before dividing); the tests are chosen so the answer is exact.
  Capacity 0 or no items gives 0.
languages: [python, javascript]
entry: fractional_knapsack
starter:
  python: |
    def fractional_knapsack(weights, values, capacity):
        # sort item indices by values[i] / weights[i], descending
        return 0
  javascript: |
    function fractional_knapsack(weights, values, capacity) {
      // sort item indices by values[i] / weights[i], descending
      return 0;
    }
tests:
  - args: [[10, 20, 30], [60, 100, 120], 50]
    expected: 240
  - args: [[10, 20, 30], [60, 100, 120], 60]
    expected: 280
    label: everything fits
  - args: [[10, 20, 30], [60, 100, 120], 0]
    expected: 0
    label: zero capacity
  - args: [[5], [10], 3]
    expected: 6
    label: a single partial item
  - args: [[2, 3], [4, 3], 4]
    expected: 6
  - args: [[1, 3, 2], [5, 9, 6], 4]
    expected: 14
    hidden: true
  - args: [[4, 6], [8, 6], 5]
    expected: 9
    hidden: true
hints:
  - "Build a list of (ratio, weight, value), sort it descending by ratio, and walk it with a `remaining` counter."
  - "When an item does not fit whole, add `value * remaining / weight` and stop."
```

## Interviewer follow-ups

**"How do you know the greedy is correct here?"** Model answer: name the rule, then give the exchange in three sentences: take any optimal solution, swap in the greedy choice at the first disagreement, show the result is feasible and no worse, recurse. Common wrong answer: "I ran it on the examples and it matched", which is evidence rather than proof, and the interviewer's next input is the counterexample.

**"The denominations are now configurable by the customer. Still greedy?"** Model answer: no. Greedy is only correct for canonical systems and a customer can configure `{1, 3, 4}`. Either run the Kozen–Zaks brute-force check when the set is configured and reject non-canonical sets, or switch to the `O(amount × m)` DP, which is cheap at realistic amounts. Wrong answer: "as long as there is a 1-coin, greedy always returns a valid answer", which is true and irrelevant, because valid is not minimal.

**"Now each meeting has a value. Same algorithm?"** Model answer: no. Weighted interval scheduling is DP over activities sorted by end, with a binary search for the last compatible activity, `O(n log n)`. Wrong answer: "sort by value per unit time", which is the fractional-knapsack instinct applied to an indivisible problem.

**"Can you drop the sort?"** Model answer: if endpoints are small integers, bucket them (a counting sort) and the whole algorithm is `O(n + max_time)`; if the input arrives already sorted from a database index, say so and the pass is linear. Wrong answer: "the sort is always required". The sort exists to make the next greedy choice findable, and any structure that hands you the next earliest-ending element does the same job.

**"You are proposing a greedy for a placement problem that is NP-hard. What is the bound?"** Model answer: name it. First-fit-decreasing uses at most `11/9 · OPT + 6/9` bins; greedy set cover is within about `ln n` of optimal; for anything without a known bound, say you would measure against an exact solver on sampled instances. Wrong answer: claiming optimality for a heuristic, or refusing greedy because it is not optimal when the exact solver would take days.

## What mid-level engineers get wrong

- **Treating a passing test suite as a proof.** The five-element counterexample is not in the tests; it arrives in production with a customer's coin set.
- **Sorting by the key that feels natural.** Sorting activities by start keeps one long early job and loses two; the fix is one word, but only if you know the exchange argument needs earliest *end*.
- **Assuming a 1-coin makes greedy change-making optimal.** It makes it terminate. `{1, 3, 4}` at 6 still returns three coins.
- **Applying the fractional ratio rule to indivisible items.** 0/1 knapsack by density returns 160 on the lesson's instance; the optimum is 220.
- **Reaching for greedy on a "number of ways" question.** Counting problems have no single best choice to commit to; they are DP, and the greedy answer is not even well defined.
- **Dividing by weight to rank items.** Zero weights crash or produce `NaN` keys; cross-multiply in integers.
- **Presenting a heuristic as an optimal algorithm in a design review.** "Greedy" for a packing problem comes with a bound (`11/9 · OPT + 6/9` for FFD), and a senior reviewer will ask for it.

## Senior signals

- You state the greedy rule as one sentence and then **try to break it** with a tiny input before you defend it.
- You can give the **exchange argument** for activity selection in three sentences, and you know the difference between exchange and "greedy stays ahead".
- You know that greedy coin change is only correct for **canonical** denominations and that the interview version of coin change is DP.
- You can explain why the same ratio rule solves **fractional** knapsack and fails **0/1** knapsack, and you use that pair as your go-to example of "one word changes the algorithm".
- You describe Kadane as a **DP with a greedy justification** for its one-number state.
- You mention that Kruskal is greedy on a **matroid** and Dijkstra is greedy on a **cut**, connecting greedy to the graph lessons rather than treating it as an isolated bag of tricks.
- You know the **Kozen–Zaks bound** and can turn "is this coin system safe?" into a brute-force check of every amount below `cₘ + cₘ₋₁`.
- You **name the bound** when you propose a greedy heuristic (`11/9 · OPT + 6/9` for first-fit-decreasing, `ln n` for set cover) and say whether you are proposing an exact algorithm or a heuristic.

## Check yourself

```quiz
- q: >-
    An interviewer gives you coins {1, 5, 8} and asks for the fewest coins for 10. What do you say?
  options: ["Greedy fails since 5 + 5 = 2 coins; use coin-change DP", "Greedy is safe since the set includes a 1-coin: 3 coins", "Greedy: 8 + 1 + 1 = 3 coins, as largest-first is optimal", "Greedy fails; sort ascending and take smallest coins first"]
  answer: 0
  explanation: >-
    Largest-first gives 8 + 1 + 1, but 5 + 5 uses two coins, so no optimal solution contains the greedy choice; the greedy-choice property fails. That is the signal to define dp[amount] instead. Having a 1-coin only guarantees that some answer exists, not that largest-first is optimal, and sorting ascending does not rescue greedy either.
- q: >-
    Which statement correctly describes the greedy-choice property?
  options: ["The greedy choice is the best choice at every step", "Every optimal solution contains the greedy choice", "Some optimal solution contains the greedy choice", "The greedy choice minimises the remaining problem size"]
  answer: 2
  explanation: >-
    The property only needs one optimal solution to agree with the greedy choice; the exchange argument constructs it by rewriting an arbitrary optimal solution. Requiring every optimal solution to agree is too strong (ties exist), and "best right now" is the definition of greedy, not of correctness.
- q: >-
    With capacity 50 and items (10 kg, $60), (20 kg, $100), (30 kg, $120), greedy by value density returns $160 for the 0/1 knapsack. Why is that wrong, and what is the optimum?
  options: ["The rule is fine but stops early; a fraction of item 3 gives $240", "It is correct: density order is optimal for 0/1 as well, so $160", "The key is wrong: sorting by raw value is always optimal, giving $220", "Items can't be split, so the exchange fails; the optimum is $220"]
  answer: 3
  explanation: >-
    Items 2 and 3 fill the bag exactly for $220. The fractional exchange argument moves weight between items, which 0/1 forbids, so greedy has no proof and indeed fails. $240 is the fractional answer, not allowed here; sorting by raw value happens to reach $220 on this data but also fails in general.
- q: >-
    You have proved that after k steps your greedy solution's k-th finish time is never later than any other solution's k-th finish time. Which proof technique is that, and what does it let you conclude?
  options: ["Optimal substructure; the remaining subproblem is solved optimally", "Exchange argument; greedy's first pick is in some optimal solution", "Greedy stays ahead; no other solution has more elements", "Matroid exchange; the chosen activities form a matroid basis"]
  answer: 2
  explanation: >-
    Tracking a running measure and showing greedy is never behind is the stays-ahead technique. If another solution had more elements, its extra element would fit after greedy's last finish too, so greedy has at least as many. Exchange rewrites a specific optimal solution rather than comparing running measures, and activity selection is not a matroid at all.
- q: >-
    Which problem feature most strongly suggests DP rather than greedy?
  options: ["The input has a natural order you can sort by", "The answer is a count of non-overlapping items", "Values must combine to hit an exact target", "Constraints let n reach 100,000 or more"]
  answer: 2
  explanation: >-
    Exact-target combination (sum to k, fill capacity exactly) is where local choices commit you to something that cannot be undone; confirm it by breaking the obvious rule with a five-element counterexample. A single sort key and non-overlap counts are greedy signals; large n argues against quadratic DP, not for it.
- q: >-
    A customer configures denominations {1, 5, 10, 21, 25}. What is a complete, cheap way to decide before serving any request whether largest-first change-making is safe?
  options: ["Compare greedy with the DP for amounts up to 1000 and extrapolate", "Compare greedy with the DP for every amount below 25 + 21", "Confirm each coin divides the next, which is what canonical means", "Confirm the set contains 1, which makes largest-first optimal"]
  answer: 1
  explanation: >-
    Kozen and Zaks showed that a non-canonical system has its smallest counterexample below the sum of its two largest coins, so checking amounts up to 45 is a complete test; here it finds 31, where greedy gives 25 + 5 + 1 and the optimum is 21 + 10. Containing 1 only guarantees termination. Each coin dividing the next is sufficient but not necessary: it would reject the canonical US set, since 25 is not a multiple of 10. There is no scaling argument that lets a check up to 1000 cover larger amounts.
```
