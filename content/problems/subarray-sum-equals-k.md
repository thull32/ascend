---
slug: subarray-sum-equals-k
title: Subarray Sum Equals K
difficulty: medium
patterns: [prefix-sum]
lists: [ascend-150]
companies: [meta, amazon, google, bloomberg]
order: 1
lesson: interview-patterns/array-patterns/prefix-sum
hints:
  - Negative numbers break the sliding window, because growing the window does not always grow the sum. You need a different tool.
  - The sum of `nums[i..j]` is `prefix[j+1] - prefix[i]`. A subarray ending at `j` sums to `k` exactly when some earlier prefix equals `prefix[j+1] - k`.
  - "Count how many times each prefix sum has occurred so far in a hash map, and seed it with `{0: 1}` for the empty prefix."
signatures:
  python:
    name: subarray_sum
    starter: |
      def subarray_sum(nums: list[int], k: int) -> int:
          pass
  javascript:
    name: subarray_sum
    starter: |
      function subarray_sum(nums, k) {
      }
tests:
  - args: [[1, 1, 1], 2]
    expected: 2
  - args: [[1, 2, 3], 3]
    expected: 2
  - args: [[1], 0]
    expected: 0
    label: no match
  - args: [[5], 5]
    expected: 1
    label: single element matches
  - args: [[0, 0, 0], 0]
    expected: 6
    label: zeros create many subarrays
  - args: [[1, -1, 1, -1], 0]
    expected: 4
    label: negatives
  - args: [[2, 2, 2, 2], 4]
    expected: 3
  - args: [[3, 4, 7, 2, -3, 1, 4, 2], 7]
    expected: 4
    hidden: true
  - args: [[-1, -1, 1], 0]
    expected: 1
    hidden: true
time_limit_ms: 4000
---
You are given an array of integers `nums` and an integer `k`. Return the number of contiguous, non-empty subarrays whose elements sum to exactly `k`.

Subarrays at different positions count separately even if they contain the same values.

### Examples

| Input | Output | Why |
|---|---|---|
| `nums = [1, 2, 3]`, `k = 3` | `2` | `[1, 2]` and `[3]` |
| `nums = [0, 0, 0]`, `k = 0` | `6` | Three of length 1, two of length 2, one of length 3 |
| `nums = [1, -1, 1, -1]`, `k = 0` | `4` | `[1, -1]` twice, `[-1, 1]`, and the whole array |

### Constraints

- `0 ≤ len(nums) ≤ 2 × 10⁴`
- `-1000 ≤ nums[i] ≤ 1000`
- `-10⁷ ≤ k ≤ 10⁷`

### Follow-up

The interviewer asks: "Why does a sliding window not work here, when it works for the positive-only version?" Then: "Return the number of subarrays whose sum is *divisible* by k."

## Solution

### The naive approach

Every pair `(i, j)`, summing as you extend `j`: `O(n²)` time, `O(1)` space. For `n = 2 × 10⁴` that is 2 × 10⁸ additions; borderline, and the interviewer wants `O(n)`.

The tempting `O(n)` idea is a sliding window: grow while the sum is below `k`, shrink while above. It is *wrong* for this problem. With negative numbers, extending the window can decrease the sum, so "too large, shrink" is not a valid decision. `[1, -1, 1]` with `k = 1` has three matching subarrays and a window finds fewer. Say this explicitly; recognising when a pattern does *not* apply is the senior skill.

### The insight

Let `prefix[i]` be the sum of the first `i` elements, with `prefix[0] = 0`. The sum of `nums[i..j]` is `prefix[j+1] - prefix[i]`. So a subarray ending at `j` sums to `k` exactly when some earlier prefix `prefix[i]` equals `prefix[j+1] - k`. That is a "how many earlier values equal `x`?" question, which a hash map from prefix sum to occurrence count answers in `O(1)`.

Because prefix sums are used as *differences*, negatives are no problem: nothing about the argument needs the prefix to be monotone.

### The optimal approach

```python
def subarray_sum(nums: list[int], k: int) -> int:
    seen: dict[int, int] = {0: 1}     # the empty prefix
    running = 0
    count = 0
    for x in nums:
        running += x
        count += seen.get(running - k, 0)
        seen[running] = seen.get(running, 0) + 1
    return count
```

The order inside the loop matters: look up *before* inserting the current prefix, so a subarray cannot be empty (a prefix cannot pair with itself unless `k = 0`, and even then only via a genuinely earlier equal prefix).

Trace `[0, 0, 0]`, `k = 0`. `seen = {0: 1}`. `x = 0`: running 0, `seen[0] = 1` → count 1, then `seen[0] = 2`. Next: count += 2 → 3, `seen[0] = 3`. Next: count += 3 → 6. Answer 6.

Trace `[3, 4, 7, 2, -3, 1, 4, 2]`, `k = 7`. Prefixes after each element: `3, 7, 14, 16, 13, 14, 18, 20`. Lookups of `prefix - 7`: `-4` (0), `0` (1: `[3, 4]`), `7` (1: `[7]`), `9` (0), `6` (0), `7` (1: `[7, 2, -3, 1]`), `11` (0), `13` (1: `[1, 4, 2]`). Total 4.

Time `O(n)`, space `O(n)` for the map.

### Common mistakes

- Forgetting to seed `{0: 1}`, which loses every subarray that starts at index 0.
- Inserting the current prefix before looking up, which for `k = 0` counts the empty subarray at every position.
- Storing prefix sums in a set rather than a count map, which undercounts when the same prefix value recurs (`[0, 0, 0]`).
- Reaching for a sliding window because the title says "subarray". Check the sign of the elements first.

### How to discuss it

Say why the window fails, then say "sum of a range is a difference of prefixes, so I count earlier prefixes with a hash map". Write it, state the seed and the lookup-before-insert order, and trace the all-zeros example, because that is where both subtle bugs show. For the divisibility follow-up: store prefix sums modulo `k` instead of raw, and count pairs of equal residues; take care that Python's `%` is already non-negative for positive `k` while JavaScript's is not, so normalise with `((x % k) + k) % k`. The pair-counting can also be done in one closed form at the end (`c · (c - 1) / 2` per residue), which is the same idea expressed as combinatorics.
