---
slug: greedy-pattern
title: "Greedy: the local rule and the one-paragraph proof that it is safe"
description: Recognise when a problem collapses to a single pass with a local decision, learn the three argument shapes that justify greed, and see Jump Game II, Gas Station, Partition Labels and Valid Parenthesis String traced step by step.
minutes: 32
difficulty: medium
tags: [greedy, exchange-argument, invariants, intervals, pattern:greedy]
problems: [maximum-subarray, jump-game, jump-game-ii, gas-station, hand-of-straights, partition-labels, valid-parenthesis-string]
---
"Fewest jumps to reach the end." "Which station can you start from." "Split the string into as many pieces as possible." The DP version of each of these is `O(n²)` and correct. The greedy version is `O(n)` and correct only if a specific argument holds: that a locally best choice never needs to be revisited. Candidates fail greedy problems in two opposite ways. Some propose a greedy rule that feels right and is wrong (largest coin first). Others write the `O(n²)` DP for a problem whose statement was practically begging for a single pass, and run out of time.

The pattern is not "be greedy". It is: *name the local rule, then give the reason no later information can make you regret it*. That reason takes one of three shapes, and once you know the shapes you can tell in a minute whether greed is safe or whether you need [DP](/learn/interview-patterns/combinatorial-patterns/dp-patterns).

## The signal

Reach for greedy when the statement has a superlative *and* one of these structures:

- **A running "furthest reach" or "best so far" that summarises everything relevant about the past** ([Jump Game](/practice/jump-game), [Jump Game II](/practice/jump-game-ii), [Maximum Subarray](/practice/maximum-subarray)). If the state you need to carry is one or two numbers, the DP has already collapsed.
- **A reset argument**: if a prefix fails, no start inside that prefix can succeed either, so skip the whole prefix ([Gas Station](/practice/gas-station), Kadane's "drop a negative prefix").
- **Sorting reveals the order of decisions** ([Hand of Straights](/practice/hand-of-straights), interval scheduling, minimum arrows): after sorting, the smallest or earliest element has only one sensible choice.
- **Boundaries that only grow** ([Partition Labels](/practice/partition-labels)): a decision extends a boundary and never shrinks it, so a single sweep suffices.
- **A range of possible values that is tracked as an interval** ([Valid Parenthesis String](/practice/valid-parenthesis-string)): instead of branching on each wildcard, keep the min and max of a counter.
- **"Exchange" is obvious**: swapping any two elements of the optimal solution into greedy order does not make it worse. Scheduling by earliest finish, Huffman merging, fractional knapsack.

What rules it out:

- **A counterexample to the local rule exists.** Coins `[1, 3, 4]` with amount 6; 0/1 knapsack where the most valuable item does not fit with the rest. If you can construct one in thirty seconds, use DP. If you cannot construct one *and* cannot state an argument, say so and choose DP, because a wrong greedy is worse than a slow DP.
- **The choice depends on a future that is not summarised by the running state.** House Robber: whether to take house `i` depends on whether you took `i − 1`, which is a state, so it is DP with two variables, not greed.
- **The question is a count or "all solutions".** Greedy finds one optimum; it does not count them.

The confusable pattern is DP with two variables, which looks greedy because it is `O(n)` with `O(1)` state. The distinction is whether each step *decides* (greedy: the choice is committed) or *keeps both options open* (DP: `dp[i] = max(take, skip)`). Kadane's algorithm is genuinely on the border, and either name is acceptable as long as you can state the invariant.

## The template

There is no single template, because greed is an argument, not a loop. There are three loop shapes and three argument shapes; match one of each.

```python
def furthest_reach(nums):
    """Loop shape 1: track the best reachable boundary; decide when forced."""
    reach = 0
    for i, x in enumerate(nums):
        if i > reach:
            return False                  # forced: this index is unreachable
        reach = max(reach, i + x)
    return True


def reset_scan(values):
    """Loop shape 2: accumulate; reset when the prefix proves itself useless."""
    total, start, tank = 0, 0, 0
    for i, v in enumerate(values):
        total += v
        tank += v
        if tank < 0:
            start, tank = i + 1, 0        # nothing in [start, i] can be the answer
    return start if total >= 0 else -1


def sorted_sweep(items, key):
    """Loop shape 3: sort so the first element has one sensible choice."""
    items.sort(key=key)
    for x in items:
        ...                               # commit the forced choice for x
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
  let total = 0, start = 0, tank = 0;
  for (let i = 0; i < values.length; i++) {
    total += values[i];
    tank += values[i];
    if (tank < 0) { start = i + 1; tank = 0; }
  }
  return total >= 0 ? start : -1;
}
```

The three argument shapes:

1. **Exchange argument.** Take any optimal solution that differs from greedy's. Swap the first differing choice for greedy's choice. Show the result is still feasible and no worse. Repeat until it equals greedy's. This is the standard proof for sorting-based greedy (earliest finish time, Huffman).
2. **Invariant / "greedy stays ahead".** State a quantity that greedy maximises after every step (furthest reach after `k` jumps, most tasks scheduled by time `t`). Show by induction that no other strategy can be ahead of it at any step.
3. **Reset / dominance argument.** Show that if a prefix fails, every start point inside that prefix fails too, so skipping the whole prefix loses nothing. This is the Gas Station and Kadane shape.

Say which one you are using. "Greedy works here" without a shape is the sentence interviewers push back on.

Watch the reset argument keep the best running sum and discard negative prefixes:

```viz
{"type": "array", "algorithm": "kadane", "values": [-2, 1, -3, 4, -1, 2, 1, -5, 4], "title": "Kadane's scan", "caption": "A running sum that has gone negative is dropped, because any subarray extending it would do better without it."}
```

## Worked problems

### Jump Game II

[Jump Game II](/practice/jump-game-ii): `nums[i]` is the maximum jump length from index `i`; the end is guaranteed reachable. Return the minimum number of jumps.

Think of it as BFS over indices where one jump reaches every index in a range. Level `k` is the set of indices reachable in exactly `k` jumps, and it is always a contiguous range `[lo, hi]` because from any index you can jump any *shorter* distance too. Sweep the current level, compute the furthest index any of its members reaches, and that is the next level's `hi`. Count levels until `hi` covers the last index.

```python
def jump(nums):
    jumps, cur_end, furthest = 0, 0, 0
    for i in range(len(nums) - 1):            # never need to jump FROM the last index
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

Loop ends at `i = 3` (the last index is 4). Answer 2: jump 0 → 1, then 1 → 4. The candidate who jumps to the furthest index each time (0 → 2, then 2 → 3, then 3 → 4) gets 3, which is the wrong greedy; the right greedy is "from the current level, where is the furthest *any* member reaches", which is the BFS frontier.

The argument is the invariant shape: after `k` jumps, `cur_end` is the furthest index reachable in at most `k` jumps, by induction, because level `k + 1` is exactly the union of ranges from level `k`. `O(n)` time, `O(1)` space; the DP is `O(n²)`.

### Gas Station

[Gas Station](/practice/gas-station): circular route; `gas[i]` is available at station `i` and `cost[i]` is needed to reach station `i + 1`. Return the unique starting station from which you can complete the loop, or −1.

Two facts. First, if the total gas is at least the total cost, a solution exists (and it is unique by the problem's guarantee). Second, the reset argument: if you start at `s` and first run dry trying to leave station `i`, then no station in `s..i` can be the answer either, because starting from any of them you arrive at `i` with *less* fuel than you had starting from `s` (you skipped the non-negative surplus you had built up by then). So restart at `i + 1`.

```python
def can_complete_circuit(gas, cost):
    total = tank = start = 0
    for i in range(len(gas)):
        diff = gas[i] - cost[i]
        total += diff
        tank += diff
        if tank < 0:
            start, tank = i + 1, 0
    return start if total >= 0 else -1
```

Trace on `gas = [1, 2, 3, 4, 5]`, `cost = [3, 4, 5, 1, 2]`:

| `i` | `diff` | `total` | `tank` | reset? | `start` |
|---|---|---|---|---|---|
| 0 | −2 | −2 | −2 | yes | 1 |
| 1 | −2 | −4 | −2 | yes | 2 |
| 2 | −2 | −6 | −2 | yes | 3 |
| 3 | 3 | −3 | 3 | no | 3 |
| 4 | 3 | 0 | 6 | no | 3 |

`total = 0 ≥ 0`, answer 3. Verify: start at 3 with 4 gas, pay 1 → station 4 with 3, gain 5 → 8, pay 2 → station 0 with 6, gain 1 → 7, pay 3 → station 1 with 4, gain 2 → 6, pay 4 → station 2 with 2, gain 3 → 5, pay 5 → back at 3 with 0. Exactly enough.

Why does one pass suffice, given the route is circular? Because after the final reset at `start`, the tank stays non-negative through index `n − 1`, and the total being non-negative means the wrap-around segment `0..start−1` has a deficit no larger than the surplus accumulated. `O(n)` time. The `O(n²)` version tries every start; the interviewer expects you to reject it.

### Partition Labels

[Partition Labels](/practice/partition-labels): split a string into as many parts as possible so that each letter appears in at most one part. Return the part sizes.

Each letter's *last* occurrence is a boundary that any part containing that letter must extend to. Sweep left to right keeping `end = max(last[c] for c seen in the current part)`; when `i == end`, the part can close. The boundary only ever grows, so one sweep is enough.

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

Trace on `"ababcbacadefegdehijhklij"`. Last occurrences that matter: `a: 8, b: 5, c: 7, d: 14, e: 15, f: 11, g: 13, h: 19, i: 22, j: 23, k: 20, l: 21`.

| `i` | `c` | `last[c]` | `end` | close? |
|---|---|---|---|---|
| 0 | a | 8 | 8 | |
| 1–7 | b, a, b, c, b, a, c | 5, 8, 5, 7, 5, 8, 7 | 8 | |
| 8 | a | 8 | 8 | **yes**: part of size 9 |
| 9 | d | 14 | 14 | |
| 10–14 | e, f, e, g, d | 15, 11, 15, 13, 14 | 15 | |
| 15 | e | 15 | 15 | **yes**: size 7 |
| 16 | h | 19 | 19 | |
| 17–22 | i, j, h, k, l, i | 22, 23, 19, 20, 21, 22 | 23 | |
| 23 | j | 23 | 23 | **yes**: size 8 |

Answer `[9, 7, 8]`. The argument is exchange-flavoured: any valid partition must keep every letter's first and last occurrence in one part, so the smallest part starting at `start` is the one closing at the maximum last-occurrence of the letters it contains; closing earlier is invalid and closing later only merges parts, which reduces the count. `O(n)` time and `O(1)` space beyond the 26-entry map.

### Valid Parenthesis String

[Valid Parenthesis String](/practice/valid-parenthesis-string): `(`, `)` and `*`, where `*` may be `(`, `)` or empty. Is some interpretation balanced?

The backtracking version branches three ways per `*`: `O(3^k)`. The DP is `O(n²)`. The greedy tracks the *range* of possible open-bracket counts: `lo` assumes every `*` so far was `)` or empty, `hi` assumes every `*` was `(`. A `)` decrements both; a `(` increments both; a `*` widens the range. If `hi` goes negative there are too many `)` under every interpretation; clamp `lo` at 0 because a `*` interpreted as `)` when nothing is open is simply interpreted as empty instead.

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
        lo = max(lo, 0)                   # a '*' need not be ')'
    return lo == 0                        # some interpretation ends balanced
```

Trace on `"(*))"`:

| `c` | `lo` | `hi` | note |
|---|---|---|---|
| ( | 1 | 1 | |
| * | 0 | 2 | range widens: 0, 1 or 2 open |
| ) | −1 → 0 | 1 | clamp `lo` |
| ) | −1 → 0 | 0 | |

`hi` never went negative and `lo == 0` at the end: valid (interpret `*` as `(`, giving `(())`). On `"(*)))"`: after the fourth character `lo = 0, hi = 0`; the fifth `)` makes `hi = −1`: invalid.

The argument is that the set of achievable open counts is always a contiguous range (each `*` extends it by one on each side), so two integers describe it exactly. That is why a range is a complete summary and greedy is safe. `O(n)` time, `O(1)` space.

## Variations

- **Maximum Subarray** ([Maximum Subarray](/practice/maximum-subarray)): the reset scan with "best sum ending here"; covered as Kadane in [Kadane and subarrays](/learn/interview-patterns/array-patterns/kadane-and-subarrays). The greedy framing is "a negative running prefix never helps".
- **Jump Game** ([Jump Game](/practice/jump-game)): the furthest-reach loop returning whether `reach ≥ n − 1`.
- **Hand of Straights** ([Hand of Straights](/practice/hand-of-straights)): sort (or use a counter and iterate keys in order); the smallest remaining card must start a group, so consume `card, card+1, …, card+k−1` from the counts. Failure to find a consecutive card is failure overall.
- **Interval scheduling and its family** (non-overlapping intervals, minimum arrows, meeting rooms): sort by end time and take the earliest-ending compatible interval. Covered in [Intervals](/learn/interview-patterns/array-patterns/intervals); the argument is the exchange argument.
- **Task scheduling with cooldown** ([Task Scheduler](/practice/task-scheduler)): the most frequent task determines the frame; the formula `(maxFreq − 1) · (n + 1) + countOfMax` versus `len(tasks)` is a greedy with a counting argument.
- **Two-pass greedy** (candy distribution, trapping rain water with two arrays): one left-to-right pass fixes one constraint, one right-to-left pass fixes the other, and the pointwise max satisfies both.
- **Greedy plus heap** ([Reorganize String](/practice/reorganize-string), Huffman): the heap supplies "the current best candidate" at each step; the greedy rule says what to do with it.

## Pitfalls

- **A plausible rule with no argument.** "Always take the biggest" is the classic; test it on a five-element counterexample before committing. If none comes to mind, say "I cannot immediately prove this; the safe version is DP" and be ready to do either.
- **Jumping to the furthest index** in Jump Game II. The level structure, not the individual jump target, is what is greedy.
- **Forgetting the total-gas check** in Gas Station, or returning `start` without it. The reset scan alone returns a station even when no solution exists.
- **Iterating to `n` instead of `n − 1`** in Jump Game II. Counting a jump from the last index gives one too many when the last level ends exactly at `n − 1`.
- **Closing a partition when the letter's last index is reached** instead of when `i == end`. A later letter in the part may have pushed `end` further; check the running boundary.
- **Not clamping `lo`** in Valid Parenthesis String; `lo` can go negative legitimately (a `*` that would be `)` is instead empty) and must be reset to 0, not treated as failure.
- **Returning `hi == 0`** at the end instead of `lo == 0`. `hi` counts the maximum possible open brackets; what matters is whether zero is achievable.
- **Sorting the wrong key** in interval problems (by start when the argument needs end).
- **Confusing greedy with DP with two variables.** If your loop keeps both `take` and `skip` alive, it is DP; call it that.

## Exercise

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
    label: jumping to the furthest index each time is not optimal here
hints:
  - "Loop i from 0 to len(nums) - 2 (you never need to jump from the last index)."
  - "Keep furthest = max(furthest, i + nums[i]); when i reaches the current level's end, increment jumps and set the end to furthest."
  - "Think of it as BFS: each level is the set of indices reachable in exactly k jumps, and it is a contiguous range."
```

## Senior signals

- You **state the local rule and then the argument shape** (exchange, invariant, reset) in two sentences, before writing code.
- You can **produce a counterexample** to a tempting wrong greedy on demand (`[1, 3, 4]` for coins; jump-to-furthest for Jump Game II) and use that to justify DP when the argument is missing.
- You explain Jump Game II as **BFS over contiguous ranges**, which is why it is `O(n)` and why the "wrong greedy" fails.
- You give the **reset argument** for Gas Station precisely: any start inside a failed prefix arrives at the failure point with no more fuel.
- You recognise **range tracking** (min and max of a counter) as the way to avoid branching on wildcards, and can say why the set of possibilities is always an interval.
- You know **when greedy and DP coincide** (Kadane) and do not argue about the name; you state the invariant instead.
- You mention that in production you would **test the greedy against a brute force on random small inputs** before trusting it, because greedy proofs are the ones engineers get wrong.

## Check yourself

```quiz
- q: >-
    Jump Game II on [1, 2, 1, 1, 1]. A candidate always jumps to the furthest reachable index. How many jumps does that take, and what is optimal?
  options: ["4 and 3; the rule wastes a jump on the middle 1s", "3 and 3; the furthest-index rule is safe in general", "3 and 3 here, but it fails on [2, 3, 1, 1, 4]", "2 and 2; one long jump from index 1 reaches the end"]
  answer: 2
  explanation: >-
    On this input the furthest-index rule gives 0 -> 1 -> 3 -> 4, three jumps, which is also optimal. The point is that the rule is not safe in general: from index 0 in [2, 3, 1, 1, 4] it picks index 2 (reach 3) over index 1 (reach 4) and needs 3 jumps where 2 suffice. The level-based rule considers the furthest reach over the whole current level.
- q: >-
    In Gas Station, the tank goes negative when trying to leave station i after starting at s. Why can every station in s..i be skipped as a candidate start?
  options: ["Because they all come before station i in the array", "Any later start reaches i with no more fuel than s did", "They cannot be skipped; each one must still be tried", "Because the problem guarantees the answer is unique"]
  answer: 1
  explanation: >-
    The tank was non-negative at every intermediate station (otherwise you would have reset earlier), so the segment from s to any t in (s, i] contributed a non-negative surplus. Starting at t gives that up, so you reach i with at most the same fuel and still fail. That is the reset argument, and it makes the scan linear.
- q: >-
    Valid Parenthesis String tracks lo and hi. After processing a prefix, lo is -1 before clamping and hi is 2. What does the clamp to 0 mean?
  options: ["hi should be reduced by one as well to stay consistent", "A * read as ) with nothing open is reread as empty", "The string is already invalid and the scan can stop", "The most recent * must be interpreted as ( instead"]
  answer: 1
  explanation: >-
    lo is the minimum open count over interpretations, but an interpretation that closes more than it opened is not valid, and the same wildcard can be empty instead, so the minimum achievable open count is 0, not -1. Clamping keeps the range honest. hi going negative is different: it means even all-( fails.
- q: >-
    Which is a correct greedy argument shape for interval scheduling by earliest finish time?
  options: ["Range tracking: keep min and max of open intervals", "Speed: greedy is faster than DP, so it must be right", "Exchange: swap greedy's first pick into any optimum", "Reset: if a prefix fails, skip every start inside it"]
  answer: 2
  explanation: >-
    Take any optimal schedule: its first interval finishes no earlier than greedy's first, so swapping in greedy's first keeps the rest compatible and the count equal; repeat until the schedules match. Earliest-finish leaves the most room for the rest, and the exchange argument formalises that. The other shapes belong to different problems.
- q: >-
    The interviewer proposes coin change with denominations [1, 5, 10, 25] and asks whether largest-first greedy is optimal. What is the senior answer?
  options: ["No; greedy is never optimal for coin change", "Only when the amount to make is under 100", "Yes for this canonical set, but not in general", "Yes; greedy is always optimal for coin change"]
  answer: 2
  explanation: >-
    Whether greedy works depends on the denominations. For [1, 5, 10, 25] it happens to be optimal, but on [1, 3, 4] with amount 6 greedy gives 4 + 1 + 1 while 3 + 3 is better, so in general you use DP unless the coin system is known to be canonical. Knowing the counterexample and the term shows you understand the boundary rather than a rule of thumb.
```
