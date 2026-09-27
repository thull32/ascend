---
slug: longest-increasing-subsequence
title: Longest Increasing Subsequence
difficulty: medium
patterns: [dynamic-programming]
lists: [core-75, ascend-150]
companies: [google, microsoft, amazon, netflix]
order: 11
lesson: interview-patterns/combinatorial-patterns/dp-patterns
hints:
  - "A prefix-based state does not work well here, because whether you can extend depends on the last value chosen. Anchor the state at the last element instead."
  - "Let `lis[i]` be the length of the longest strictly increasing subsequence that ends exactly at index `i`. It is `1 + max(lis[j])` over earlier `j` with `nums[j] < nums[i]`."
  - "For `O(n log n)`: keep `tails[k]` = the smallest possible last value of an increasing subsequence of length `k + 1`. Each new number replaces the first tail that is `≥` it, found by binary search."
signatures:
  python:
    name: length_of_lis
    starter: |
      def length_of_lis(nums: list[int]) -> int:
          pass
  javascript:
    name: length_of_lis
    starter: |
      function length_of_lis(nums) {
      }
tests:
  - args: [[3, 1, 8, 2, 5, 9, 4]]
    expected: 4
  - args: [[5, 5, 5]]
    expected: 1
    label: equal values do not count as increasing
  - args: [[1]]
    expected: 1
    label: single element
  - args: [[9, 7, 4, 2]]
    expected: 1
    label: strictly decreasing
  - args: [[1, 2, 3, 4, 5]]
    expected: 5
  - args: [[4, 10, 4, 3, 8, 9]]
    expected: 3
  - args: [[0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15]]
    expected: 6
    hidden: true
  - args: [[-2, -1, -5, 0, 3, -4, 6]]
    expected: 5
    hidden: true
    label: negatives
  - args: [[2, 2, 3, 3, 4, 1]]
    expected: 3
    hidden: true
time_limit_ms: 4000
---
Given an integer array `nums`, return the length of the longest subsequence whose values are strictly increasing. A subsequence keeps the original order but may skip elements.

### Examples

| Input | Output | Why |
|---|---|---|
| `[3, 1, 8, 2, 5, 9, 4]` | `4` | `1, 2, 5, 9`; candidates such as `3, 5, 9` or `1, 2, 4` are shorter |
| `[5, 5, 5]` | `1` | Strictly increasing: equal values cannot follow each other |
| `[4, 10, 4, 3, 8, 9]` | `3` | `4, 8, 9` or `3, 8, 9` |

### Constraints

- `1 ≤ len(nums) ≤ 2500`
- `-10⁴ ≤ nums[i] ≤ 10⁴`

### Follow-up

The interviewer asks: "Your solution is quadratic. Can you do `O(n log n)`?" Then: "Return one actual longest subsequence, not just its length." And: "What changes if equal values are allowed (non-decreasing)?"

## Solution

### The naive approach

Enumerate all `2ⁿ` subsequences, keep the increasing ones, return the longest. Hopeless beyond `n ≈ 25`.

### The insight

A good state has to capture everything the future needs to know. For "extend an increasing subsequence", the future needs exactly one thing: the value of the last element chosen. So anchor the state at the element a subsequence *ends* on. The best subsequence ending at `i` is `nums[i]` appended to the best subsequence ending at some earlier, smaller element.

### The DP

- **State.** `lis[i]` is the length of the longest strictly increasing subsequence that ends exactly at index `i`.
- **Transition.** `lis[i] = 1 + max(lis[j] for j < i if nums[j] < nums[i])`, or `1` if no such `j` exists.
- **Base case.** Every element alone is a subsequence of length 1, so each `lis[i]` starts at 1.
- **Iteration order.** Increasing `i`: every dependency has a smaller index.
- **Answer.** `max(lis)`, not `lis[n - 1]`: the longest subsequence can end anywhere.

### Worked table for `[3, 1, 8, 2, 5, 9, 4]`

| `i` | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| `nums[i]` | 3 | 1 | 8 | 2 | 5 | 9 | 4 |
| earlier smaller values (their `lis`) | – | – | 3 (1), 1 (1) | 1 (1) | 3 (1), 1 (1), 2 (2) | 3, 1, 8 (2), 2 (2), 5 (3) | 3 (1), 1 (1), 2 (2) |
| `lis[i]` | 1 | 1 | 2 | 2 | 3 | **4** | 3 |
| best predecessor | – | – | 3 | 1 | 2 | 5 | 2 |

Following predecessors back from index 5: 9 ← 5 ← 2 ← 1, which is the subsequence `1, 2, 5, 9`.

### Quadratic reference solution

```python
def length_of_lis_quadratic(nums: list[int]) -> int:
    n = len(nums)
    lis = [1] * n
    for i in range(n):
        for j in range(i):
            if nums[j] < nums[i] and lis[j] + 1 > lis[i]:
                lis[i] = lis[j] + 1
    return max(lis)
```

Time `O(n²)` (about 3 million comparisons at `n = 2500`), space `O(n)`.

### Space and the `O(n log n)` version

There is no rolling-array reduction here: `lis[i]` can depend on any earlier entry, so all of them must stay. The real improvement changes the state instead.

Keep `tails[k]` = the **smallest last value** of any increasing subsequence of length `k + 1` seen so far. `tails` is always strictly increasing: the best length-`k + 1` subsequence contains a length-`k` subsequence that ends on a smaller value, so `tails[k - 1] < tails[k]`. For each new `x`, find the first position where `tails[pos] ≥ x`:

- if there is none, `x` extends the longest subsequence: append it;
- otherwise, `x` is a smaller tail for length `pos + 1`: overwrite `tails[pos] = x`.

The length of `tails` at the end is the answer.

| `x` | 3 | 1 | 8 | 2 | 5 | 9 | 4 |
|---|---|---|---|---|---|---|---|
| action | append | replace 3 | append | replace 8 | append | append | replace 5 |
| `tails` | [3] | [1] | [1, 8] | [1, 2] | [1, 2, 5] | [1, 2, 5, 9] | [1, 2, 4, 9] |

Final length **4**. Note that `[1, 2, 4, 9]` is *not* a subsequence of the input (4 comes after 9). `tails` records the best tail for each length, not a single sequence; replacing 5 with 4 just says "a length-3 subsequence can now end as low as 4", which would help a later 5 or 6.

```python
import bisect

def length_of_lis(nums: list[int]) -> int:
    tails: list[int] = []
    for x in nums:
        pos = bisect.bisect_left(tails, x)     # first tail >= x
        if pos == len(tails):
            tails.append(x)
        else:
            tails[pos] = x
    return len(tails)
```

Time `O(n log n)`, space `O(L)` where `L` is the answer.

```viz
{"type": "dp", "algorithm": "lis", "values": [3, 1, 8, 2, 5, 9, 4], "title": "LIS quadratic table", "caption": "lis[i] looks back at every earlier smaller value and extends the best one."}
```

### Common mistakes

- Returning `lis[n - 1]`. For `[1, 2, 3, 0]` it gives 1, not 3.
- Using `<=` in the comparison and counting equal values as increasing. `[5, 5, 5]` must give 1.
- Using `bisect_right` in the tails version for a *strictly* increasing problem: equal values would append and inflate the length.
- Reporting `tails` as the subsequence itself.

### How to discuss it

Say why a prefix state fails (you need to know the last value) and anchor the state on the ending element. Give the `O(n²)` DP with its table, then offer the tails method, explaining the invariant ("smallest possible tail for each length, kept sorted, so binary search applies") and the trap that `tails` is not a real subsequence.

For reconstruction with the fast version, store for each element the index of the element it extended (the element at `tails[pos - 1]` when it was placed) and keep an index array alongside `tails`; walk back from the last tail. For non-decreasing, switch to `bisect_right` and `<=`. The two-dimensional variant (nest envelopes that must be strictly larger in both width and height) sorts by width ascending and height *descending*, then runs strict LIS on heights; the descending tie-break is what stops two envelopes of equal width from nesting, and it is the follow-up that separates people who memorised this problem from people who understand it.
