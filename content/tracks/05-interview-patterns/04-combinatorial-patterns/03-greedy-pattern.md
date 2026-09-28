---
slug: greedy-pattern
title: "Greedy: the local rule and the one-paragraph proof that it is safe"
description: Recognise when a problem collapses to one pass with a committed local decision, know the tempting rules that fail and their counterexample inputs, prove the safe ones with an exchange, stays-ahead or reset argument, and see Jump Game II, Gas Station, Partition Labels and Valid Parenthesis String traced step by step.
minutes: 45
difficulty: medium
tags: [greedy, exchange-argument, invariants, intervals, pattern:greedy]
problems: [maximum-subarray, jump-game, jump-game-ii, gas-station, hand-of-straights, partition-labels, valid-parenthesis-string, non-overlapping-intervals, task-scheduler, reorganize-string, coin-change]
---
"Fewest jumps to reach the end." "Which station can you start from." "Split the string into as many pieces as possible." The DP version of each of these is `O(n²)` and correct. The greedy version is `O(n)` and correct only if a specific argument holds: that a locally best choice never needs to be revisited. Candidates fail greedy problems in two opposite ways. Some propose a rule that feels right and is wrong (largest coin first). Others write the `O(n²)` DP for a problem whose statement was practically begging for a single pass, and time out: on 10⁴ elements the Jump Game DP took 666 ms in CPython 3.14 on this machine, the greedy 0.3 ms.

The pattern is not "be greedy". It is: *name the local rule, then give the reason no later information can make you regret it*. That reason takes one of three shapes, and once you know them you can tell in a minute whether greed is safe or whether you need [DP](/learn/interview-patterns/combinatorial-patterns/dp-patterns). The theory, matroids included, is in [Greedy and exchange arguments](/learn/algorithms/greedy/greedy-and-exchange-arguments); the interval family in [Interval problems](/learn/algorithms/greedy/interval-problems). This lesson is about recognising greed from the statement, killing a wrong rule with a counterexample in thirty seconds, and executing the right one.

## The signal

Reach for greedy when the statement has a superlative *and* one of these structures:

- **A running summary that is one or two numbers**: "furthest reach", "best so far", "current balance" ([Jump Game](/practice/jump-game), [Jump Game II](/practice/jump-game-ii), [Maximum Subarray](/practice/maximum-subarray)). If that is all the past you need, the DP has already collapsed.
- **A reset argument**: if a prefix fails, no start inside it can succeed ([Gas Station](/practice/gas-station), Kadane dropping a negative prefix).
- **Sorting reveals the order of decisions** ([Hand of Straights](/practice/hand-of-straights), [Non-overlapping Intervals](/practice/non-overlapping-intervals)): after sorting, the smallest or earliest-ending element has only one sensible choice.
- **Boundaries that only grow** ([Partition Labels](/practice/partition-labels)): a decision extends a boundary and never shrinks it.
- **A range of possible values tracked as an interval** ([Valid Parenthesis String](/practice/valid-parenthesis-string)): the min and max of a counter instead of a branch per wildcard.
- **The most constrained item goes first**, fed by a heap ([Task Scheduler](/practice/task-scheduler), [Reorganize String](/practice/reorganize-string)).

What rules it out:

- **A counterexample to the rule exists.** If you can build one in thirty seconds, use DP. If you can build neither a counterexample nor an argument, say so and choose DP: a wrong greedy is worse than a slow DP.
- **The choice depends on state the summary drops.** House Robber: whether to take house `i` depends on whether you took `i − 1`, so it is DP with two variables.
- **A count or all solutions.** Greedy commits to one optimum; it does not count them.

The confusable pattern is DP with two variables, which is also `O(n)` with `O(1)` state. The test: does each step *commit* (greedy) or *keep both options open* (`dp[i] = max(take, skip)`)? Kadane sits on the border; name the invariant and the label does not matter.

### Near misses: the rules that fail

| Statement | Tempting rule | Counterexample input | Rule gives | Optimum | Use instead |
|---|---|---|---|---|---|
| Fewest coins, denominations `[1, 3, 4]` | largest coin first | amount 6 | 4 + 1 + 1: 3 coins | 3 + 3: 2 coins | [Coin Change](/practice/coin-change) DP |
| 0/1 knapsack, capacity 50 | best value per kg first | (10 kg, 60), (20 kg, 100), (30 kg, 120) | 160 | 220 | knapsack DP |
| Most non-overlapping meetings | shortest meeting first | `[1,5)`, `[4,7)`, `[6,10)` | 1 | 2 | earliest finish first |
| Most non-overlapping meetings | earliest start first | `[0,10)`, `[1,2)`, `[3,4)` | 1 | 2 | earliest finish first |
| Most *valuable* non-overlapping jobs | earliest finish first | `[0,2)` worth 1, `[2,4)` worth 1, `[0,4)` worth 5 | 2 | 5 | DP by end time plus binary search |
| Fewest jumps | jump as far as possible from here | `[2, 3, 1, 1, 4]` | 3 | 2 | furthest reach of the whole level |
| Longest increasing subsequence | take anything larger than the last taken | `[1, 5, 2, 3, 4]` | 2 | 4 | DP, or sorted tails |

Every counterexample above was checked against brute force. The shapes repeat: a rule that ignores *what the choice uses up* (weight, time after it ends, the next jump's reach) fails on three items.

## The templates

Greed is an argument, not a loop, but three loop shapes cover the interview set. The fourth block is the habit that separates a senior answer: check the rule against brute force on random small inputs before trusting it.

```python
import random
from itertools import combinations
from operator import itemgetter

def furthest_reach(nums):
    """Shape 1: carry the best reachable boundary; fail when forced."""
    reach = 0
    for i, x in enumerate(nums):
        if i > reach:
            return False                  # nothing before i reaches i
        reach = max(reach, i + x)
    return True


def reset_scan(values):
    """Shape 2: accumulate; drop a prefix the moment it proves useless."""
    total = tank = start = 0
    for i, v in enumerate(values):
        total += v
        tank += v
        if tank < 0:
            start, tank = i + 1, 0        # no start in [start, i] can succeed
    return start if total >= 0 else -1


def max_non_overlapping(intervals):
    """Shape 3: sort so the first element has one sensible choice."""
    count, end = 0, float("-inf")
    for s, e in sorted(intervals, key=itemgetter(1)):   # earliest finish first
        if s >= end:                      # half-open [s, e): touching is allowed
            count += 1
            end = e
    return count


def brute_max_non_overlapping(intervals):
    for r in range(len(intervals), 0, -1):
        for pick in combinations(sorted(intervals), r):
            if all(a[1] <= b[0] for a, b in zip(pick, pick[1:])):
                return r
    return 0


def check_greedy(trials=2000):
    for _ in range(trials):
        iv = [(s, s + random.randint(1, 8)) for s in random.choices(range(20), k=6)]
        assert max_non_overlapping(iv) == brute_max_non_overlapping(iv), iv
```

```javascript
function furthestReach(nums) {
  let reach = 0;
  for (let i = 0; i < nums.length; i++) {
    if (i > reach) return false;
    reach = Math.max(reach, i + nums[i]);
  }
  return true;
}

function resetScan(values) {
  let total = 0, tank = 0, start = 0;
  for (let i = 0; i < values.length; i++) {
    total += values[i];
    tank += values[i];
    if (tank < 0) { start = i + 1; tank = 0; }
  }
  return total >= 0 ? start : -1;
}

function maxNonOverlapping(intervals) {
  const sorted = [...intervals].sort((a, b) => a[1] - b[1]);  // a number, never a boolean
  let count = 0, end = -Infinity;
  for (const [s, e] of sorted) {
    if (s >= end) { count++; end = e; }
  }
  return count;
}
```

The checker is not decoration. On 2,000 random sets of six intervals, "shortest first" failed 52 times, first at trial 29; "earliest start" failed 408 times, first at trial 3; earliest finish never failed. Largest-coin-first on random three-coin systems containing 1 failed on 291 of 2,000 (system, amount) pairs, first at trial 13. A wrong greedy is found in seconds by a test you can write in two minutes.

Watch the reset argument drop negative prefixes, then the table that beats largest-coin-first:

```viz
{"type": "array", "algorithm": "kadane", "values": [-2, 1, -3, 4, -1, 2, 1, -5, 4], "title": "Kadane's scan", "caption": "A running sum that has gone negative is dropped, because any subarray extending it would do better without it."}
```

```viz
{"type": "dp", "algorithm": "coin-change", "coins": [1, 3, 4], "amount": 6, "title": "Where largest-coin-first fails", "caption": "Greedy takes 4 and is left with 2, which costs two 1s: three coins. The table finds dp[6] = dp[3] + 1 = 2, using 3 + 3."}
```

## Why greedy is correct: three argument shapes

1. **Exchange.** Take any optimal solution that differs from greedy's. Swap its first differing choice for greedy's. Show the result is still feasible and no worse. Repeat until it equals greedy's. The standard proof for sort-then-sweep (earliest finish, Huffman).
2. **Greedy stays ahead.** Name a quantity greedy maximises after every step (furthest index reachable in `k` jumps). Show by induction that no strategy is ahead at any step.
3. **Reset (dominance).** Show that if a prefix fails, every start inside it fails too, so skipping it loses nothing (Gas Station, Kadane).

Say which one you are using; "greedy works here" without a shape is the sentence interviewers push back on.

### An exchange, carried out

Intervals `a = [1,3)`, `b = [2,5)`, `c = [4,7)`, `d = [6,9)`, `e = [9,12)`. Earliest finish takes `a`, skips `b` (starts before 3), takes `c`, skips `d` (starts before 7), takes `e`: three. Another optimum is `{b, d, e}`. Turn it into greedy's:

| step | optimum being rewritten | first difference | swap | still compatible because |
|---|---|---|---|---|
| 0 | `b, d, e` | `b` versus greedy's `a` | `b → a` | `a` ends at 3 ≤ 5 where `b` ended, so `d` (starts 6) still fits |
| 1 | `a, d, e` | `d` versus greedy's `c` | `d → c` | `c` starts at 4 ≥ 3 and ends at 7 ≤ 9, so `e` (starts 9) still fits |
| 2 | `a, c, e` | none | | equals greedy's choice, same size |

Each swap replaces an interval by one that ends no later, which can only leave more room for the rest. The count never drops, so greedy's count is optimal. The same argument breaks for weighted jobs: swapping `[0,4)` worth 5 for `[0,2)` worth 1 keeps feasibility but loses value, and the exchange no longer proves "no worse".

## Worked problems

### Jump Game II

[Jump Game II](/practice/jump-game-ii): `nums[i]` is the maximum jump from `i`; the end is reachable; return the fewest jumps.

This is BFS over indices. Level `k` is the set of indices reachable in exactly `k` jumps, and it is a contiguous range, because from any index you may also jump shorter. Sweep the current level, track the furthest index any member reaches; that is the next level's end.

```python
def jump(nums):
    jumps, cur_end, furthest = 0, 0, 0
    for i in range(len(nums) - 1):            # never jump FROM the last index
        furthest = max(furthest, i + nums[i])
        if i == cur_end:                      # finished scanning this level
            jumps += 1
            cur_end = furthest
    return jumps
```

Trace on `[2, 3, 1, 1, 4]`:

| `i` | `i + nums[i]` | `furthest` | `i == cur_end`? | `jumps`, `cur_end` after |
|---|---|---|---|---|
| 0 | 2 | 2 | yes (0) | 1, 2 |
| 1 | 4 | 4 | no | |
| 2 | 3 | 4 | yes (2) | 2, 4 |
| 3 | 4 | 4 | no | |

Answer 2 (0 → 1 → 4). Jumping as far as possible from where you stand goes 0 → 2 → 3 → 4, three jumps: the right rule looks at the whole level, not the landing square. The argument is **stays ahead**: after `k` jumps, `cur_end` is the furthest index reachable in at most `k` jumps, because level `k + 1` is exactly the union of ranges from level `k`. `O(n)` time, `O(1)` space.

### Gas Station

[Gas Station](/practice/gas-station): circular route; `gas[i]` is picked up at station `i`, `cost[i]` spent to reach `i + 1`. Return the unique start that completes the loop, or −1.

Two facts. If total gas ≥ total cost, a start exists. And the **reset**: if starting at `s` you first run dry leaving station `i`, then no station in `s..i` works either, because from any of them you reach `i` with no more fuel than you had from `s` (you gave up a non-negative surplus). Restart at `i + 1`. The code is `reset_scan` on `gas[i] − cost[i]`.

Trace on `gas = [1, 2, 3, 4, 5]`, `cost = [3, 4, 5, 1, 2]`:

| `i` | `diff` | `total` | `tank` | reset? | `start` |
|---|---|---|---|---|---|
| 0 | −2 | −2 | −2 | yes | 1 |
| 1 | −2 | −4 | −2 | yes | 2 |
| 2 | −2 | −6 | −2 | yes | 3 |
| 3 | 3 | −3 | 3 | no | 3 |
| 4 | 3 | 0 | 6 | no | 3 |

`total = 0`, answer 3. Check: from 3 with 4 gas, pay 1, gain 5, pay 2, gain 1, pay 3, gain 2, pay 4, gain 3, pay 5: back at 3 with exactly 0. One pass suffices on a circle because after the last reset the tank stays non-negative to the end, and `total ≥ 0` means the wrap-around deficit of `0..start − 1` is covered by that surplus.

### Partition Labels

[Partition Labels](/practice/partition-labels): split a string into as many parts as possible so each letter appears in at most one part.

A part containing letter `c` must extend to `c`'s last occurrence. Sweep with `end = max(last[c])` over the letters seen in the current part; close the part when `i == end`.

```python
def partition_labels(s):
    last = {c: i for i, c in enumerate(s)}    # last index of each letter
    out, start, end = [], 0, 0
    for i, c in enumerate(s):
        end = max(end, last[c])
        if i == end:
            out.append(end - start + 1)
            start = i + 1
    return out
```

On `"ababcbacadefegdehijhklij"` (last `a` 8, `b` 5, `c` 7, `d` 14, `e` 15, `f` 11, `g` 13, `h` 19, `i` 22, `j` 23, `k` 20, `l` 21):

| `i` | letters | `end` after | close? |
|---|---|---|---|
| 0–7 | a b a b c b a c | 8 | |
| 8 | a | 8 | **yes**: size 9 |
| 9–14 | d e f e g d | 15 | |
| 15 | e | 15 | **yes**: size 7 |
| 16–22 | h i j h k l i | 23 | |
| 23 | j | 23 | **yes**: size 8 |

Answer `[9, 7, 8]`. The argument is an exchange on part boundaries: every valid partition keeps each letter's first and last occurrence in one part, so the shortest valid first part closes at the maximum last occurrence of its letters; closing earlier is invalid, closing later merges parts and lowers the count.

### Valid Parenthesis String

[Valid Parenthesis String](/practice/valid-parenthesis-string): `(`, `)` and `*`, where `*` may be `(`, `)` or empty. Is some reading balanced?

Backtracking branches three ways per `*`: `O(3^k)`. The DP is `O(n²)`. The greedy tracks the *range* of possible open counts: `lo` if every `*` so far was `)` or empty, `hi` if every `*` was `(`.

```python
def check_valid_string(s):
    lo = hi = 0
    for c in s:
        if c == "(":
            lo += 1; hi += 1
        elif c == ")":
            lo -= 1; hi -= 1
        else:
            lo -= 1; hi += 1
        if hi < 0:
            return False                  # too many ')' even if every '*' is '('
        lo = max(lo, 0)                   # a '*' read as ')' can be read as empty instead
    return lo == 0
```

Trace on `"(*))"`: `(` gives `lo, hi = 1, 1`; `*` gives 0, 2; `)` gives −1 → clamped 0, and 1; `)` gives −1 → 0, and 0. `hi` never went negative and `lo == 0`: valid, reading `*` as `(`. On `"(*)))"` the fifth character makes `hi = −1`: invalid. The argument: the achievable open counts always form a contiguous range (each `*` widens it by one each side), so two integers describe the set exactly and committing to them loses nothing.

### Hand of Straights

[Hand of Straights](/practice/hand-of-straights): can the cards be split into groups of `w` consecutive values? The smallest card still in the hand cannot sit in the middle or at the end of a run, because nothing smaller is left to precede it. So every copy of it must *start* a run: a forced move, which is the strongest kind of greedy argument.

```python
from collections import Counter

def is_n_straight_hand(hand, w):
    if len(hand) % w:
        return False
    count = Counter(hand)
    for card in sorted(count):
        c = count[card]
        if c == 0:
            continue
        for x in range(card, card + w):       # every copy of the smallest card starts a run
            if count[x] < c:
                return False
            count[x] -= c
    return True
```

Trace on `[1, 2, 3, 6, 2, 3, 4, 7, 8]`, `w = 3`:

| smallest card left | copies `c` | cards consumed | counts after (1, 2, 3, 4, 6, 7, 8) |
|---|---|---|---|
| start | | | 1, 2, 2, 1, 1, 1, 1 |
| 1 | 1 | 1, 2, 3 | 0, 1, 1, 1, 1, 1, 1 |
| 2 | 1 | 2, 3, 4 | 0, 0, 0, 0, 1, 1, 1 |
| 6 | 1 | 6, 7, 8 | all 0: **true** |

On `[1, 1, 2, 2, 3, 4]` with `w = 3`, the two 1s need two 3s and there is one: false at the first card. Consuming `c` copies at once makes the loop `O(k log k + k · w)` for `k` distinct values, and cross-checked against a brute-force grouping on 3,000 random hands it never disagreed. `Counter` returns 0 for a missing card without inserting it, which is what `count[x] < c` relies on.

## Variations

| Variant | Change to the template | Why it stays correct |
|---|---|---|
| [Jump Game](/practice/jump-game) | `furthest_reach`, return `reach ≥ n − 1` | stays ahead on reach |
| [Maximum Subarray](/practice/maximum-subarray) | reset when the running sum drops below 0 | a negative prefix never helps ([Kadane](/learn/interview-patterns/array-patterns/kadane-and-subarrays)) |
| [Non-overlapping Intervals](/practice/non-overlapping-intervals) | removals = `n − max_non_overlapping` | exchange on earliest finish |
| Minimum arrows to burst balloons | same sweep, closed intervals: `s > end` | touching intervals share an arrow |
| Meeting rooms | sort by start, min-heap of end times | the room freed earliest is the only candidate |
| [Task Scheduler](/practice/task-scheduler) | `max(len(tasks), (maxFreq − 1)(n + 1) + countOfMax)` | the most frequent task fixes the frame |
| [Reorganize String](/practice/reorganize-string) | max-heap by count, never repeat the last letter | the most frequent letter is the most constrained |
| Candy, trapping water | one pass left to right, one right to left, pointwise max | each pass satisfies one side's constraint |

## Complexity, derived

The scan is `O(n)` with `O(1)` state in every shape above; the cost is whatever puts the input in decision order. Sorting is `O(n log n)`: 1,000,000 intervals sorted by end in 269 ms with `key=itemgetter(1)` and 353 ms with a `lambda` in CPython 3.14, and in 345–399 ms with a comparator in Node 24, so the sort, not the sweep, is the running time. Heap-driven greed (meeting rooms, Reorganize String) is `O(n log k)` for a heap of `k`. The DP it replaces is typically `O(n²)`: 666 ms for Jump Game on 10⁴ elements, and on the order of a minute at 10⁵, where the greedy took 3 ms.

## Under the hood

**Sort order is the algorithm.** Python's `sorted` is Timsort, stable, and calls the `key` function once per element, then compares the cached keys; `functools.cmp_to_key` calls a Python comparator `O(n log n)` times instead. V8's `Array.prototype.sort` has also been Timsort since 2018 and is stable, which ES2019 requires. Stability matters when the greedy breaks ties by a second key: sort by the secondary key first, then the primary, or use a tuple key.

**JavaScript's two sort traps.** With no comparator, elements are compared as strings: `[10, 9, 1, 2].sort()` is `[1, 10, 2, 9]`. A comparator must return a number; `(a, b) => a > b` returns a boolean, `false` becomes 0, "equal", and the sort is left arbitrary: in Node 24 `[3, 1, 2].sort((a, b) => a > b)` returned `[3, 1, 2]` unchanged. Both pass small hand tests that happen to be sorted.

**Heaps.** `heapq` is a min-heap over a list; a max-heap pushes negated keys, and ties on the first tuple element fall through to the second, so `(count, letter)` tuples are fine but `(count, obj)` with incomparable objects raises `TypeError`. JavaScript has no heap; greedy-with-heap answers need the 20-line binary heap or a sorted structure.

**Floats and fractions.** "Best value per kilogram" compares ratios: compare `v1 * w2` with `v2 * w1` in integers instead of `v1 / w1 > v2 / w2`, which can tie or invert on large values.

## Failure modes

**Symptom: passes the samples, fails a hidden test by one or two.** Diagnosis: a rule with no argument (shortest first, largest first) that holds on the samples. Fix: the random brute-force check above, which found "shortest first" failing at trial 29.

**Symptom: an interval sweep over-counts when intervals touch.** Diagnosis: `s > end` where the intervals are half-open, or `s >= end` where they are closed (balloons at the same x share an arrow). Fix: decide open or closed from the statement and write the comparison with a comment.

**Symptom: the JavaScript version returns a different answer from the Python one on unsorted input.** Diagnosis: default string sort, or a boolean comparator. Fix: `(a, b) => a[1] - b[1]`.

**Symptom: Gas Station returns a start when no tour exists.** Diagnosis: the total check is missing; the reset scan always ends with some `start`. Fix: `return start if total >= 0 else -1`.

**Symptom: Jump Game II answers one too many.** Diagnosis: the loop runs to `n − 1` and counts a jump from the last index when a level ends exactly there. Fix: `range(len(nums) − 1)`.

**Symptom: Valid Parenthesis String rejects `"(*)"`-style inputs.** Diagnosis: `lo < 0` treated as failure instead of clamped. Fix: fail only on `hi < 0`; clamp `lo`; accept on `lo == 0`.

## Trade-offs

| Approach | Time | Proof burden | Handles weights and values | Counts or lists solutions |
|---|---|---|---|---|
| Greedy scan | `O(n)` or `O(n log n)` with a sort | an exchange, stays-ahead or reset argument | only when the argument survives them | no, one optimum |
| DP | `O(n²)` or states × transition | the recurrence | yes | yes, counts; lists with backtracking |
| Brute force | exponential | none | yes | yes |
| Greedy plus brute-force check | greedy's cost at run time | the check replaces nothing, but catches wrong rules in seconds | as greedy | no |

## Interviewer follow-ups

**"Prove that earliest finish is optimal."** Model answer: the exchange above: the first interval of any optimum can be replaced by greedy's first, which ends no later, and the rest stays compatible; induct. Common wrong answer: "it leaves the most room", which is the intuition, not the proof.

**"Now each meeting has a value; maximise the total."** Model answer: the exchange fails (it keeps feasibility, not value), so sort by end, and `dp[i] = max(dp[i − 1], value[i] + dp[p(i)])` where `p(i)` is the last job ending by `start[i]`, found by binary search: `O(n log n)`. Common wrong answer: sort by value per unit time.

**"`n` is 10⁵ and your DP is quadratic."** Model answer: name the summary that makes the DP collapse (the furthest reach of the level, the running balance), which is the greedy; measured, the Jump Game DP needs 666 ms at 10⁴ and on the order of a minute at 10⁵, the greedy 3 ms. Common wrong answer: memoising the DP, which leaves `n²` transitions.

**"Return every optimal partition" or "count the optimal schedules."** Model answer: greedy produces one optimum and says nothing about the others; counting needs a DP over the same order (for interval scheduling, the number of maximum-size schedules ending at each interval), listing needs backtracking. Common wrong answer: rerunning the greedy with shuffled ties.

**"The array is spread over 100 machines."** Model answer: summarise each chunk and combine the summaries with an associative operator. For Kadane the summary is `(total, best prefix, best suffix, best)`; for Gas Station it is `(total, minimum prefix)`. The combine is `O(1)`, so the answer is one pass per machine plus a tree of merges. Common wrong answer: "run Kadane on each chunk and take the max", which misses subarrays that cross a boundary.

## What mid-level engineers get wrong

- **Proposing a greedy with no argument shape**, then defending it with examples.
- **Not having a counterexample ready**: `[1, 3, 4]` for coins, three items for knapsack by density, `[2, 3, 1, 1, 4]` for jump-as-far-as-possible.
- **Sorting by the wrong key**: start instead of end for interval selection.
- **Writing the quadratic DP for Jump Game II or Gas Station**, which times out at 10⁵.
- **Using JavaScript's default sort or a boolean comparator**, which passes sorted test data.
- **Calling a two-variable DP greedy** (House Robber) and then being unable to say what is committed.
- **Forgetting the global feasibility check** (total gas) that the local scan cannot see.

## Exercises

```exercise
id: minimum-jumps
title: Minimum jumps to the end
prompt: |
  `nums[i]` is the maximum distance you can jump forward from index `i`.
  Starting at index 0, return the minimum number of jumps needed to reach
  the last index. The last index is guaranteed to be reachable. An array
  of length 1 needs 0 jumps.

  Use the level-by-level greedy: track the end of the current level and
  the furthest index reachable from any index in it.
languages: [python, javascript]
entry: min_jumps
starter:
  python: |
    def min_jumps(nums):
        # your code here
        return 0
  javascript: |
    function min_jumps(nums) {
      // your code here
      return 0;
    }
tests:
  - args: [[2, 3, 1, 1, 4]]
    expected: 2
  - args: [[2, 3, 0, 1, 4]]
    expected: 2
  - args: [[0]]
    expected: 0
    label: already at the end
  - args: [[1, 1, 1, 1]]
    expected: 3
    label: one step at a time
  - args: [[5, 1, 1, 1, 1]]
    expected: 1
    label: one jump covers everything
  - args: [[1, 2, 3]]
    expected: 2
    hidden: true
  - args: [[2, 1]]
    expected: 1
    hidden: true
  - args: [[1, 2, 1, 1, 1]]
    expected: 3
    hidden: true
hints:
  - "Loop i from 0 to len(nums) - 2 (you never need to jump from the last index)."
  - "Keep furthest = max(furthest, i + nums[i]); when i reaches the current level's end, increment jumps and set the end to furthest."
  - "Think of it as BFS: each level is the set of indices reachable in exactly k jumps, and it is a contiguous range."
```

```exercise
id: gas-station-reset
title: Where to start the circuit
prompt: |
  Stations 0..n-1 sit on a circular road. At station `i` you receive
  `gas[i]` units, and driving from station `i` to station `i + 1` (station
  0 after the last) costs `cost[i]` units. The tank starts empty and has
  no limit. Return the index of the station from which you can drive all
  the way round once, or -1 if no station works. When a station works it
  is unique.

  Use one pass: keep the total of gas[i] - cost[i] and a running tank;
  when the tank goes negative, restart from the next station with an
  empty tank.
languages: [python, javascript]
entry: can_complete_circuit
starter:
  python: |
    def can_complete_circuit(gas, cost):
        # your code here
        return -1
  javascript: |
    function can_complete_circuit(gas, cost) {
      // your code here
      return -1;
    }
tests:
  - args: [[1, 2, 3, 4, 5], [3, 4, 5, 1, 2]]
    expected: 3
  - args: [[2, 3, 4], [3, 4, 3]]
    expected: -1
    label: not enough gas in total
  - args: [[5], [4]]
    expected: 0
    label: single station
  - args: [[4], [5]]
    expected: -1
  - args: [[3, 1, 1], [1, 2, 2]]
    expected: 0
    label: arrives back with exactly zero
  - args: [[5, 1, 2, 3, 4], [4, 4, 1, 5, 1]]
    expected: 4
    hidden: true
  - args: [[1, 2, 3, 4, 5, 5, 70], [2, 3, 4, 3, 9, 6, 2]]
    expected: 6
    hidden: true
    label: the answer is the last station
  - args: [[2, 0, 1], [1, 1, 2]]
    expected: -1
    hidden: true
hints:
  - "If the sum of gas is less than the sum of cost, no start works."
  - "If the tank goes negative leaving station i after starting at s, no station in s..i can be the start: restart at i + 1 with an empty tank."
  - "Return the last restart point when the total is non-negative."
```

## Senior signals

- You state **the local rule and its argument shape** (exchange, stays ahead, reset) before writing code, and can carry the exchange out on a concrete optimum.
- You produce **a counterexample on demand** for the tempting rules (coins `[1, 3, 4]`, density knapsack, shortest meeting first, jump as far as possible) and use it to justify DP when the argument is missing.
- You explain Jump Game II as **BFS over contiguous ranges**, Gas Station by the **reset argument**, and Valid Parenthesis String by **range tracking**, and say why each summary is complete.
- You **test the greedy against brute force** on random small inputs, and know that a wrong rule usually fails within the first few dozen trials.
- You know **when weights break the exchange** and give the `O(n log n)` DP for weighted scheduling.
- You know the **sort is the running time**, sort by the key the argument needs, and avoid JavaScript's string sort and boolean comparators.
- You parallelise scans by **associative summaries**, not by running the greedy per chunk.

## Check yourself

```quiz
- q: >-
    Jump Game II on [2, 3, 1, 1, 4]. A candidate always jumps as far as possible from the current index. How many jumps, and what is optimal?
  options: ["2 jumps, which is also the optimum here", "4 jumps, while 3 are optimal via index 2", "3 jumps, while 2 are optimal via index 1", "3 jumps, which is also the optimum here"]
  answer: 2
  explanation: >-
    Jumping as far as possible goes 0 -> 2 -> 3 -> 4: from index 2 the reach is only 3. Index 1 reaches 4 in one more jump, so 2 jumps suffice. The level-based rule compares the furthest reach over every index of the current level, which is why it finds index 1.
- q: >-
    In Gas Station, the tank goes negative leaving station i after starting at s. Why can every station in s..i be skipped as a start?
  options: ["They cannot be skipped; each one must still be tried", "Any later start reaches i with no more fuel than s did", "Because the problem guarantees the answer is unique", "Because they all come before station i in the array"]
  answer: 1
  explanation: >-
    The tank was non-negative at every station between s and i, otherwise the scan would have reset earlier, so the stretch from s to any later t contributed a non-negative surplus. Starting at t gives that surplus up, so you reach i with at most the same fuel and still fail. That makes the scan linear.
- q: >-
    Meetings [1,5), [4,7) and [6,10) must share one room. Which rule picks the most meetings, and what does shortest-meeting-first return?
  options: ["Shortest first is optimal and returns 2 meetings", "Earliest finish first, and shortest first returns 1", "Latest start first, and shortest first returns 3", "Earliest start first, and shortest first returns 2"]
  answer: 1
  explanation: >-
    The shortest meeting, [4,7), overlaps both others, so shortest-first keeps one meeting. Earliest finish takes [1,5), then [6,10), for 2, and the exchange argument proves it optimal: swapping any optimum's first meeting for the earliest-ending one keeps the rest compatible.
- q: >-
    Earliest-finish-first is optimal for the number of meetings. Why does it fail when each meeting has a value to maximise?
  options: ["It still works, as long as ties go to the higher value", "The exchange keeps feasibility but can lose value", "Values make the problem NP-hard, so nothing is exact", "The sort by end time is unstable once values tie"]
  answer: 1
  explanation: >-
    The exchange swaps an optimum's interval for one that ends no later, which preserves feasibility and count, but the swapped-in interval may be worth less: [0,2) worth 1 replacing [0,4) worth 5. Weighted interval scheduling is solved exactly by DP over intervals sorted by end, with binary search for the last compatible one, in O(n log n).
- q: >-
    A JavaScript interval solution sorts with intervals.sort((a, b) => a[1] > b[1]). What happens?
  options: ["It sorts correctly, since true and false act as 1 and 0", "false reads as equal, so the order is left arbitrary", "It throws a TypeError, as comparators must return numbers", "It sorts in descending order of end instead of ascending"]
  answer: 1
  explanation: >-
    The comparator's result is converted to a number, so false becomes 0, which tells the sort the two elements are equal, and it never learns when a should come first. In Node 24, [3, 1, 2].sort((a, b) => a > b) came back unchanged. Return a[1] - b[1].
- q: >-
    Maximum subarray sum over an array split across 100 machines. What is the correct way to combine the machines' work?
  options: ["Run Kadane per machine, then take the largest result", "Sort every chunk, then run Kadane on the merged output", "Merge (total, best prefix, best suffix, best) summaries", "Send every element to one machine and run Kadane there"]
  answer: 2
  explanation: >-
    The best subarray may cross a chunk boundary, so the maximum of per-chunk answers misses it. Each chunk's four-number summary combines associatively: the best of two adjacent chunks is the larger of each best and the left suffix plus the right prefix. Merging summaries in a tree gives the exact answer with O(1) data per chunk; sorting destroys contiguity.
```
