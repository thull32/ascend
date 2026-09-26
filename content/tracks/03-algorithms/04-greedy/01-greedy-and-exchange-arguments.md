---
slug: greedy-and-exchange-arguments
title: "Greedy algorithms: when the obvious choice is safe"
description: The greedy-choice property, the exchange argument that proves it, the counterexamples that break it, and the sixty-second procedure for deciding greedy versus DP in an interview.
minutes: 40
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

The greedy-choice property is the one that fails in practice, and it is the one you prove. The standard tool is the exchange argument.

## The exchange argument, written out

Take activity selection: intervals `[start, end)`, choose the largest set with no two overlapping. Greedy rule: always take the remaining interval with the earliest end time.

Here is a concrete instance, already sorted by end time:

| Activity | A | B | C | D | E | F | G | H | I | J | K |
|---|---|---|---|---|---|---|---|---|---|---|---|
| start | 1 | 3 | 0 | 5 | 3 | 5 | 6 | 8 | 8 | 2 | 12 |
| end | 4 | 5 | 6 | 7 | 9 | 9 | 10 | 11 | 12 | 14 | 16 |

Greedy takes A (ends at 4). B, C, E and J start before 4, so they are gone. The next survivor is D (5–7). Then F and G start before 7; H (8–11) is next. I and J are out; K (12–16) is last. Result: `{A, D, H, K}`, four activities.

Is four optimal? Here is the exchange argument. Let `O` be any optimal solution, sorted by end time, and let `o₁` be its first activity. Greedy's first pick `g₁` has the earliest end time of *all* activities, so `end(g₁) ≤ end(o₁)`. Now swap: `O' = O − {o₁} + {g₁}`. Every other activity in `O` starts at or after `end(o₁)`, which is at or after `end(g₁)`, so nothing in `O'` overlaps `g₁`. `O'` is still feasible and still has `|O|` activities, so it is still optimal, and it agrees with greedy on the first choice. Delete `g₁` and everything it overlaps; what is left is a smaller activity-selection problem, and induction finishes the proof.

That is the entire template:

1. Take an arbitrary optimal solution.
2. Find the first place it disagrees with greedy.
3. Swap in the greedy choice and show the solution is still feasible and no worse.
4. Repeat until it equals greedy's solution.

Written in an interview it is three sentences: "Suppose an optimal schedule doesn't start with the earliest-ending meeting. Replace its first meeting with the earliest-ending one; nothing overlaps because it ends no later. So there is an optimal schedule that starts with the greedy choice, and I recurse." An interviewer who hears that stops worrying about correctness and moves on to follow-ups.

## Greedy stays ahead

A second proof style is "greedy stays ahead": show that after `k` steps, greedy's partial solution is at least as good as *any* partial solution of `k` steps, by some measure. For activity selection the measure is the finish time of the `k`-th chosen activity: greedy's `k`-th finish is always ≤ the optimal's `k`-th finish (induction on `k`). If the optimal solution had more activities than greedy, its `(m+1)`-th activity would start after the optimal's `m`-th finish, hence after greedy's `m`-th finish, so greedy could have taken it too, contradiction.

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

The greedy-choice property fails: no optimal solution for 6 contains a 4. Yet greedy is correct for `{1, 5, 10, 25}` and for every amount. Coin systems where largest-first is always optimal are called **canonical**. US, Euro and UK coins are canonical; `{1, 3, 4}` and the old British `{1, 2, 6, 12, 24, 30}` (shillings and half-crowns) are not. Two facts worth knowing: if a system is non-canonical, the smallest amount where greedy fails is less than the sum of the two largest coins, so you can find a counterexample by brute force over a small range; and there is a polynomial-time test for canonicity, so "just check" is a legitimate answer to "is greedy safe for these denominations?". The interview point is sharper: greedy coin change is *never* the right algorithm for arbitrary denominations, and [Coin Change](/practice/coin-change) is a DP problem. See [the knapsack family](/learn/algorithms/dynamic-programming/knapsack-family) for the DP.

### 0/1 knapsack versus fractional knapsack

Capacity 50. Items `(weight, value)`: `(10, 60)`, `(20, 100)`, `(30, 120)`. Value per unit weight: 6, 5, 4.

*Fractional* knapsack (you may take part of an item): take all of item 1 (10 kg, 60), all of item 2 (20 kg, 100), then 20 of item 3's 30 kg for `120 × 20/30 = 80`. Total 240, and greedy by ratio is optimal. Exchange argument: if an optimal solution carries some of a lower-ratio item while leaving any of a higher-ratio item behind, move weight from the low-ratio item to the high-ratio one; value goes up or stays equal.

*0/1* knapsack (whole items only): greedy by ratio takes items 1 and 2 (30 kg, 160) and cannot fit item 3. Optimal is items 2 and 3 (50 kg, **220**). The exchange breaks because you cannot move "part of" an item. Same data, same greedy rule, and one word in the problem statement decides whether it works.

| Problem | Greedy rule | Correct? | Why / why not |
|---|---|---|---|
| Activity selection | earliest end | yes | exchange: earliest end leaves the most room |
| Fractional knapsack | highest value/weight | yes | exchange: shift weight toward higher ratio |
| 0/1 knapsack | highest value/weight | **no** | cannot shift partial weight; needs DP |
| Coin change, canonical coins | largest coin | yes | property of the denominations |
| Coin change, arbitrary coins | largest coin | **no** | `{1,3,4}` at 6; needs DP |
| Minimum spanning tree | lightest safe edge | yes | cut property (a matroid) |
| Shortest path, non-negative weights | closest unsettled vertex | yes | Dijkstra; fails with negative edges |

## A paragraph on matroids

There is a clean theory underneath some of this. A **matroid** is a set system where independent sets are hereditary (subsets of independent sets are independent) and satisfy an exchange axiom (if `A` and `B` are independent and `|A| < |B|`, some element of `B` can be added to `A` keeping it independent). The theorem: for any matroid, the greedy algorithm "sort by weight, add each element if it keeps the set independent" finds a maximum-weight independent set. Acyclic edge sets of a graph form a matroid, which is exactly why Kruskal's algorithm works. The catch is that matroids are sufficient, not necessary: activity selection is not a matroid, and greedy still works there. So in practice you prove greedy directly with an exchange argument and keep matroids as a one-sentence answer to "why does Kruskal work?".

## Deciding greedy versus DP in an interview

You cannot spend ten minutes on a proof. Use this procedure, which takes about a minute out loud.

1. **State the greedy rule as a sentence.** "Always take the interval that ends first." "Always take the biggest coin." If you cannot say it in one sentence, it is not a greedy problem.
2. **Try to break it with five elements or fewer.** Construct an input where the greedy first choice is *not* in any optimal solution. Two or three coin values, three or four items, an interval that is short but poorly placed. Counterexamples for real greedy failures are almost always tiny.
3. **If you broke it, go to DP.** Say so: "The greedy choice can be wrong here, for example `{1,3,4}` and 6, so I'll define a subproblem instead." That sentence is worth more than a correct greedy that you cannot justify.
4. **If you could not break it, sketch the exchange.** "Any optimal solution can be rewritten to start with the greedy choice without getting worse, because …". Then code.

Signals that lean greedy: the problem asks for a count, a maximum number of non-overlapping things, a minimum number of "covers", or feasibility (can you reach the end?); the input has a natural ordering; and constraints go to `10⁵` or beyond, which rules out `O(n²)` DP. Signals that lean DP: values that must be combined exactly (sum to a target, fill a capacity exactly), the word "ways", or an obvious greedy that fails your five-element test.

The problems attached to this lesson are all greedy with a twist. In [Hand of Straights](/practice/hand-of-straights) the greedy choice is "start a run at the smallest remaining card" (exchange: any run containing the smallest card must start there). In [Partition Labels](/practice/partition-labels) it is "extend the current partition to the last occurrence of every character seen so far". In [Valid Parenthesis String](/practice/valid-parenthesis-string) the greedy tracks a *range* of possible open counts instead of one value, which is the trick that makes a backtracking problem linear.

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

## Senior signals

- You state the greedy rule as one sentence and then **try to break it** with a tiny input before you defend it.
- You can give the **exchange argument** for activity selection in three sentences, and you know the difference between exchange and "greedy stays ahead".
- You know that greedy coin change is only correct for **canonical** denominations and that the interview version of coin change is DP.
- You can explain why the same ratio rule solves **fractional** knapsack and fails **0/1** knapsack, and you use that pair as your go-to example of "one word changes the algorithm".
- You describe Kadane as a **DP with a greedy justification** for its one-number state.
- You mention that Kruskal is greedy on a **matroid** and Dijkstra is greedy on a **cut**, connecting greedy to the graph lessons rather than treating it as an isolated bag of tricks.

## Check yourself

```quiz
- q: >-
    An interviewer gives you coins {1, 5, 8} and asks for the fewest coins for 10. What do you say?
  options: ["Greedy: 8 + 1 + 1 = 3 coins", "Greedy fails here (5 + 5 = 2 coins), so I'll use the coin-change DP", "The problem has no solution", "Sort the coins ascending and greedy works"]
  answer: 1
  explanation: >-
    Largest-first gives 8 + 1 + 1, but 5 + 5 uses two coins, so no optimal solution contains the greedy choice; the greedy-choice property fails. That is the signal to define dp[amount] instead. Sorting ascending does not rescue greedy either.
- q: >-
    Which statement correctly describes the greedy-choice property?
  options: ["The greedy choice is the best choice at every step", "There exists an optimal solution that contains the greedy choice", "Every optimal solution contains the greedy choice", "The greedy choice minimises the remaining problem size"]
  answer: 1
  explanation: >-
    The property only needs one optimal solution to agree with the greedy choice; the exchange argument constructs it by rewriting an arbitrary optimal solution. Requiring every optimal solution to agree is too strong (ties exist), and \"best right now\" is the definition of greedy, not of correctness.
- q: >-
    With capacity 50 and items (10 kg, $60), (20 kg, $100), (30 kg, $120), greedy by value density returns $160 for the 0/1 knapsack. Why is that wrong, and what is the optimum?
  options: ["It is correct; $160 is optimal", "Greedy should sort by value instead; the optimum is $220", "Partial items cannot be exchanged, so the density argument breaks; the optimum is $220 from items 2 and 3", "The optimum is $240 by taking a fraction of item 3"]
  answer: 2
  explanation: >-
    Items 2 and 3 fill the bag exactly for $220. The fractional exchange argument moves weight between items, which 0/1 forbids, so greedy has no proof and indeed fails. $240 is the fractional answer, not allowed here; sorting by value alone also fails in general.
- q: >-
    You have proved that after k steps your greedy solution's k-th finish time is never later than any other solution's k-th finish time. Which proof technique is that, and what does it let you conclude?
  options: ["Exchange argument; greedy's solution equals some optimal solution", "Greedy stays ahead; greedy's solution has at least as many elements as any other", "Optimal substructure; the subproblem is smaller", "Matroid exchange; the independent sets form a matroid"]
  answer: 1
  explanation: >-
    Tracking a running measure and showing greedy is never behind is the stays-ahead technique. If another solution had more elements, its extra element would fit after greedy's last finish too, so greedy has at least as many. Exchange rewrites a specific optimal solution rather than comparing running measures.
- q: >-
    Which problem feature most strongly suggests DP rather than greedy?
  options: ["The input can be sorted by one key", "The answer is a count of non-overlapping items", "Values must combine to hit an exact target and a small counterexample breaks the obvious rule", "n can be as large as 100,000"]
  answer: 2
  explanation: >-
    Exact-target combination (sum to k, fill capacity exactly) is where local choices commit you to something that cannot be undone, and a broken five-element example is the definitive signal. A single sort key and non-overlap counts are greedy signals; large n argues against quadratic DP, not for it.
```
