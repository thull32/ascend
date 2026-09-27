---
slug: house-robber
title: House Robber
difficulty: medium
patterns: [dynamic-programming]
lists: [core-75, ascend-150]
companies: [amazon, google, microsoft, linkedin]
order: 3
lesson: interview-patterns/combinatorial-patterns/dp-patterns
hints:
  - "Look at the last house. Either you take it, and then the house before it is off limits, or you skip it. What is left in each case?"
  - "Let `best[i]` be the most you can take from the first `i` houses. Then `best[i] = max(best[i - 1], best[i - 2] + nums[i - 1])`."
  - "Only the previous two values are ever read, so two variables replace the array."
signatures:
  python:
    name: rob
    starter: |
      def rob(nums: list[int]) -> int:
          pass
  javascript:
    name: rob
    starter: |
      function rob(nums) {
      }
tests:
  - args: [[7]]
    expected: 7
    label: single house
  - args: [[2, 9, 4]]
    expected: 9
    label: one big middle house beats both ends
  - args: [[6, 1, 1, 6]]
    expected: 12
    label: skip two in a row
  - args: [[4, 1, 2, 7, 5, 3, 1]]
    expected: 14
  - args: [[0, 0, 0]]
    expected: 0
  - args: [[5, 9]]
    expected: 9
  - args: [[10, 1, 1, 10, 1, 1, 10]]
    expected: 30
    hidden: true
  - args: [[3, 8, 4, 6, 2, 9, 1, 7, 5, 4, 8, 3, 6, 2]]
    expected: 44
    hidden: true
  - args: [[1, 3, 1, 3, 100]]
    expected: 103
    hidden: true
    label: neither alternating pattern is optimal
time_limit_ms: 4000
---
You are planning a night's work along a single street of houses. House `i` holds `nums[i]` in valuables. Neighbouring houses share an alarm link: if two adjacent houses are both broken into on the same night, the alarm goes off. Return the largest total you can collect without ever taking two adjacent houses.

### Examples

| Input | Output | Why |
|---|---|---|
| `[2, 9, 4]` | `9` | Taking both ends gives only 6 |
| `[6, 1, 1, 6]` | `12` | Houses 0 and 3; skipping two houses in a row is allowed |
| `[4, 1, 2, 7, 5, 3, 1]` | `14` | Houses 0, 3 and 5: `4 + 7 + 3` |

### Constraints

- `1 ≤ len(nums) ≤ 100`
- `0 ≤ nums[i] ≤ 400`

### Follow-up

The interviewer asks: "Return which houses to take, not just the total." Then: "The street is now a binary tree: each house has up to two child houses, and a house and its direct child are linked. What is the state now?"

## Solution

### The naive approach

Try every subset of houses with no two adjacent and keep the best sum. The number of such subsets grows like the Fibonacci numbers, about `1.618ⁿ`, which is around `10²⁰` for `n = 100`. The equivalent recursion ("take house `i` and jump to `i + 2`, or skip to `i + 1`") recomputes the same suffixes over and over.

### The insight

Look only at the last house. There are two exhaustive cases:

1. You skip it. Then the answer is the best you can do with all the earlier houses.
2. You take it. Then its neighbour is forbidden, and the answer is its value plus the best you can do with the houses before that neighbour.

Both cases shrink the problem to a *prefix* of the street. So the state is a prefix length, and there are only `n + 1` of them.

A tempting shortcut is "take all even-indexed or all odd-indexed houses, whichever sums higher". It fails on `[1, 3, 1, 3, 100]`: evens give 102, odds give 6, but houses 1 and 4 give 103. Optimal selections can skip two in a row, and the DP accounts for that without any special handling.

### The DP

- **State.** `best[i]` is the maximum total from the first `i` houses (indices `0..i-1`) with no two adjacent taken.
- **Transition.** `best[i] = max(best[i - 1], best[i - 2] + nums[i - 1])` for `i ≥ 2`: skip house `i - 1`, or take it and fall back two.
- **Base cases.** `best[0] = 0` (no houses), `best[1] = nums[0]`.
- **Iteration order.** Increasing `i`.
- **Answer.** `best[n]`.

### Worked table for `[4, 1, 2, 7, 5, 3, 1]`

| `i` | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| house value `nums[i-1]` | – | 4 | 1 | 2 | 7 | 5 | 3 | 1 |
| skip: `best[i-1]` | – | – | 4 | 4 | 6 | 11 | 11 | 14 |
| take: `best[i-2] + nums[i-1]` | – | – | 1 | 6 | 11 | 11 | 14 | 12 |
| `best[i]` | 0 | 4 | 4 | 6 | 11 | 11 | 14 | **14** |

Walk back from `i = 7`: skip won (14 = 14), so house 6 is not taken. At `i = 6`, take won, so house 5 (value 3) is taken; jump to `i = 4`, where take won: house 3 (value 7); jump to `i = 2`, where skip won; at `i = 1`, house 0 (value 4). Houses `{0, 3, 5}`, total 14.

### Tabulated version

```python
def rob_table(nums: list[int]) -> int:
    n = len(nums)
    best = [0] * (n + 1)
    best[1] = nums[0]
    for i in range(2, n + 1):
        best[i] = max(best[i - 1], best[i - 2] + nums[i - 1])
    return best[n]
```

Time `O(n)`, space `O(n)`.

### Space-optimised version

```python
def rob(nums: list[int]) -> int:
    two_back, one_back = 0, 0            # best[i - 2], best[i - 1]
    for x in nums:
        two_back, one_back = one_back, max(one_back, two_back + x)
    return one_back
```

Time `O(n)`, space `O(1)`. Starting both variables at 0 makes the first iteration compute `best[1] = max(0, 0 + nums[0])`, so no separate base case is needed.

```viz
{"type": "dp", "algorithm": "house-robber", "values": [4, 1, 2, 7, 5, 3, 1], "title": "House Robber on the worked example", "caption": "Each cell is max(skip = cell to the left, take = two to the left + this house)."}
```

### Common mistakes

- Greedy on the largest value, or the even/odd split. Both fail; see `[2, 9, 4]` and `[1, 3, 1, 3, 100]`.
- Indexing confusion between `best[i]` over prefix *length* and `nums[i]` over *index*. Decide which one your state uses and say it out loud; the off-by-one lives here.
- Crashing on a single house because the table code reads `nums[1]` unconditionally.

### How to discuss it

Say the two cases on the last house, give the state as a prefix, and write the rolling-variable loop. Trace one small input. Mention explicitly that the two cases are exhaustive and exclusive, which is what makes `max` correct.

For the path follow-up, keep the array and walk back as in the table above. For the tree version, the state is no longer a prefix but a subtree, and one number per subtree is not enough: return a pair `(best if this node is taken, best if it is not)` from a post-order DFS. Taken = `node.val + left.not_taken + right.not_taken`; not taken = `max(left) + max(right)`. That is `O(n)` time, `O(h)` stack. Moving from "prefix state" to "subtree state returning a tuple" is exactly the generalisation a senior interviewer wants to hear.
