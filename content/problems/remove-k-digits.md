---
slug: remove-k-digits
title: Remove K Digits
difficulty: medium
patterns: [monotonic-stack]
lists: [ascend-150]
companies: [google, amazon, microsoft]
order: 2
lesson: interview-patterns/sequence-patterns/monotonic-stack-pattern
hints:
  - Comparing numbers of equal length is lexicographic, so the leftmost digit matters most. Where is the first place a removal makes the number smaller?
  - Removing a digit helps exactly when the digit after it is smaller. Scan left to right keeping a stack of kept digits; while the top is bigger than the incoming digit and you still have removals left, pop it.
  - If removals remain at the end, the kept digits are non-decreasing, so remove from the right. Then strip leading zeros, and return "0" if nothing is left.
signatures:
  python:
    name: remove_k_digits
    starter: |
      def remove_k_digits(num: str, k: int) -> str:
          pass
  javascript:
    name: remove_k_digits
    starter: |
      function remove_k_digits(num, k) {
      }
tests:
  - args: ["1432219", 3]
    expected: "1219"
  - args: ["10200", 1]
    expected: "200"
    label: leading zeros are stripped
  - args: ["10", 2]
    expected: "0"
    label: everything removed
  - args: ["9", 1]
    expected: "0"
  - args: ["112", 1]
    expected: "11"
    label: equal digits, remove from the right
  - args: ["123456", 3]
    expected: "123"
    label: increasing, leftovers removed from the end
  - args: ["54321", 2]
    expected: "321"
    hidden: true
    label: decreasing, removals happen at the front
  - args: ["10001", 1]
    expected: "1"
    hidden: true
    label: removal exposes a run of zeros
  - args: ["100", 1]
    expected: "0"
    hidden: true
  - args: ["12345", 0]
    expected: "12345"
    label: nothing to remove
time_limit_ms: 4000
---
You are given a non-negative integer as a string `num` and an integer `k`. Remove exactly `k` digits so that the remaining digits, read in their original order, form the smallest possible number. Return that number as a string without leading zeros; if every digit is removed or only zeros remain, return `"0"`.

### Examples

| Input | Output | Why |
|---|---|---|
| `num = "1432219"`, `k = 3` | `"1219"` | Remove `4`, `3` and the second `2` |
| `num = "10200"`, `k = 1` | `"200"` | Remove the `1`; the leading `0` then disappears |
| `num = "10"`, `k = 2` | `"0"` | Nothing left |
| `num = "112"`, `k = 1` | `"11"` | Any single removal leaves `11` or `12`; `11` is smaller |

### Constraints

- `1 ≤ len(num) ≤ 10⁵`
- `0 ≤ k ≤ len(num)`
- `num` has no leading zeros unless it is exactly `"0"`

### Follow-up

The interviewer asks: "Make it the *largest* number instead." Then: "Now instead of removing `k` digits, pick a subsequence of length `m` from two strings interleaved, keeping each string's order, that is as large as possible."

## Solution

### The naive approach

Try every way to choose `k` positions to delete: `C(n, k)` candidates, each `O(n)` to build and compare. Exponential. Even a smarter DP over (position, removals used) is `O(n × k)` with string comparisons on top. Neither survives `n = 10⁵`.

### The insight

Two numbers with the same digit count compare lexicographically, so the leftmost digit dominates. To minimise, you want the smallest possible first digit, then the smallest possible second digit, and so on. A digit is worth removing precisely when the digit right after it is smaller: deleting it promotes a smaller digit into a more significant position. If no such "descent" exists, the digits are non-decreasing and the best you can do is drop the largest ones, which are at the end.

That is a greedy with a monotonic stack. Scan left to right, keeping a stack of digits you intend to keep. While the incoming digit is smaller than the stack top and you still have removals, pop. The stack stays non-decreasing, and every pop is a removal that made the number smaller at the most significant position it could.

### The optimal approach

```python
def remove_k_digits(num: str, k: int) -> str:
    stack: list[str] = []
    for d in num:
        while k > 0 and stack and stack[-1] > d:
            stack.pop()
            k -= 1
        stack.append(d)
    if k > 0:
        stack = stack[:-k]  # remaining digits are non-decreasing; drop the largest
    result = "".join(stack).lstrip("0")
    return result or "0"
```

Time `O(n)`: each digit is pushed once and popped at most once. Space `O(n)`.

Trace `"1432219"`, `k = 3`:

| d | pops (k after) | stack |
|---|---|---|
| 1 | | `1` |
| 4 | | `14` |
| 3 | pop 4 (2) | `13` |
| 2 | pop 3 (1) | `12` |
| 2 | | `122` |
| 1 | pop 2 (0) | `121` |
| 9 | | `1219` |

`k` is exhausted, nothing to strip: `"1219"`.

Why is the greedy correct? Suppose an optimal answer keeps a digit `a` that the greedy popped because a later, smaller digit `b` arrived while removals remained. Swapping `a` out for `b` in the optimal answer produces a valid subsequence (same length, same order) that is no larger, since `b < a` at an equal-or-more-significant position and everything after is unchanged or better. So the greedy never loses.

### Common mistakes

- Forgetting the leftover `k` at the end, which fails on `"123456"`.
- Stripping leading zeros before the final truncation, or returning `""` instead of `"0"`.
- Using `>=` in the pop condition. It still gives the right answer here (popping an equal digit changes nothing in value) but wastes removals that could have mattered later; keep it strict and be able to explain why.

### How to discuss it

Say "smallest number of fixed length is lexicographic, so I greedily remove the first digit that is followed by a smaller one; that is a non-decreasing monotonic stack" and then give the exchange argument in two sentences. For the largest-number variant, flip the comparison to `stack[-1] < d`, keep the stack non-increasing, and do not strip zeros. The two-string follow-up (Create Maximum Number) uses this exact routine as its building block: for each split of `m` between the two strings, take the max subsequence of each with this greedy, then merge them lexicographically. Recognising the subroutine is the point. Compare with [Next Greater Element](/practice/next-greater-element): same stack discipline, different payload.
