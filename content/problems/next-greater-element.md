---
slug: next-greater-element
title: Next Greater Element
difficulty: easy
patterns: [monotonic-stack]
lists: [ascend-150]
companies: [amazon, google, bloomberg]
order: 1
lesson: interview-patterns/sequence-patterns/monotonic-stack-pattern
hints:
  - The brute force scans right from every index; that is O(n²). Flip it around and ask, when a new value arrives, which earlier values does it answer?
  - Keep a stack of indices still waiting for their answer. A new value is the answer for every waiting index whose value is strictly smaller; pop those and record it.
  - Anything left on the stack when the input ends has no greater element to its right; those get -1.
signatures:
  python:
    name: next_greater
    starter: |
      def next_greater(nums: list[int]) -> list[int]:
          pass
  javascript:
    name: next_greater
    starter: |
      function next_greater(nums) {
      }
tests:
  - args: [[2, 1, 2, 4, 3]]
    expected: [4, 2, 4, -1, -1]
  - args: [[1, 3, 2, 4]]
    expected: [3, 4, 4, -1]
  - args: [[5, 4, 3, 2, 1]]
    expected: [-1, -1, -1, -1, -1]
    label: strictly decreasing
  - args: [[1, 2, 3]]
    expected: [2, 3, -1]
    label: strictly increasing
  - args: [[7]]
    expected: [-1]
    label: single element
  - args: [[]]
    expected: []
    label: empty
  - args: [[3, 3, 3, 4]]
    expected: [4, 4, 4, -1]
    hidden: true
    label: equal values are not greater
  - args: [[6, 2, 9, 1, 8, 3]]
    expected: [9, 9, -1, 8, -1, -1]
    hidden: true
  - args: [[0, 0, 1]]
    expected: [1, 1, -1]
    hidden: true
time_limit_ms: 4000
---
For each element of an array `nums`, find the *next greater element*: the first value to its right that is strictly larger than it. If no such value exists, use `-1`. Return the results as a list aligned with the input.

### Examples

| Input | Output | Why |
|---|---|---|
| `[2, 1, 2, 4, 3]` | `[4, 2, 4, -1, -1]` | For the first `2`, the `1` and the second `2` are not greater; `4` is |
| `[3, 3, 3, 4]` | `[4, 4, 4, -1]` | Equal is not greater; all three `3`s wait for the `4` |
| `[5, 4, 3, 2, 1]` | `[-1, -1, -1, -1, -1]` | Nothing to the right is ever larger |

### Constraints

- `0 ≤ len(nums) ≤ 10⁵`
- `0 ≤ nums[i] ≤ 10⁹` (non-negative, so `-1` is unambiguous)

### Follow-up

The interviewer asks: "Now the array is circular: the element after the last is the first. Can you keep O(n)?" Then: "Give me the *previous smaller* element instead. What changes, and what does not?"

## Solution

### The naive approach

For each `i`, scan `j = i+1, i+2, …` until `nums[j] > nums[i]`. `O(n²)` in the worst case (a decreasing array scans to the end from every index). Fine for `n = 1000`; not for `10⁵`.

### The insight

Instead of each element searching forward for its answer, let each new element *deliver* answers backward. Maintain a stack of indices that are still waiting. When `nums[i]` arrives, every waiting index with a smaller value has just found its next greater element, and those indices are exactly the top of the stack, because the stack is always decreasing in value from bottom to top. Why is it decreasing? Any index with a value smaller than the newcomer gets popped before the newcomer is pushed, so what remains beneath it is at least as large.

### The optimal approach

```python
def next_greater(nums: list[int]) -> list[int]:
    result = [-1] * len(nums)
    stack: list[int] = []  # indices; nums[stack] is non-increasing bottom to top
    for i, x in enumerate(nums):
        while stack and nums[stack[-1]] < x:
            result[stack.pop()] = x
        stack.append(i)
    return result
```

Time `O(n)`: each index is pushed exactly once and popped at most once, so the `while` body runs at most `n` times in total. Space `O(n)`.

Trace `[2, 1, 2, 4, 3]`:

| i | x | pops | stack after |
|---|---|---|---|
| 0 | 2 | | `[0]` |
| 1 | 1 | | `[0, 1]` |
| 2 | 2 | `1` → 2 | `[0, 2]` (2 is not < 2, so index 0 stays) |
| 3 | 4 | `2` → 4, `0` → 4 | `[3]` |
| 4 | 3 | | `[3, 4]` |

Indices 3 and 4 remain: `-1`. Result `[4, 2, 4, -1, -1]`.

### Common mistakes

- Popping on `<=`, which makes `[3, 3, 3, 4]` return `[3, 3, 4, -1]`.
- Pushing values instead of indices, then having nowhere to write the answer.
- Initialising `result` inside the loop or forgetting the `-1` default for survivors.

### How to discuss it

State the invariant first: "the stack holds indices whose answers are pending, with values non-increasing from bottom to top; a newcomer pops and answers everything smaller." Then say the amortised argument. For the circular follow-up, iterate `i` from `0` to `2n - 1` using `nums[i % n]`, but only push indices during the first pass; the second pass exists only to pop. Still `O(n)`. For previous smaller: iterate the same direction, keep the stack *increasing*, and the answer for index `i` is the stack top *after* popping everything `≥ nums[i]`, read at push time instead of pop time. The four variants (next/previous × greater/smaller) are the same loop with two knobs, and being able to say that is what separates knowing the trick from knowing the pattern. See [Daily Temperatures](/practice/daily-temperatures) for the distance variant and [Largest Rectangle in a Histogram](/practice/largest-rectangle-histogram) for both sides at once.
