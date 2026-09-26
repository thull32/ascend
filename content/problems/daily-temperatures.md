---
slug: daily-temperatures
title: Daily Temperatures
difficulty: medium
patterns: [stack]
lists: [ascend-150]
companies: [amazon, google, meta, bloomberg]
order: 5
lesson: interview-patterns/sequence-patterns/stack-patterns
hints:
  - For each day, scanning forward until a warmer day is O(n²). Think about what you could remember from earlier days so that a new day resolves them in bulk.
  - Keep a stack of indices whose answer is still unknown. When a new temperature arrives, it is the answer for every index on the stack with a strictly lower temperature. Pop them all.
  - The stack stays sorted by decreasing temperature from bottom to top, so you only ever compare with the top. Each index is pushed and popped once.
signatures:
  python:
    name: daily_temperatures
    starter: |
      def daily_temperatures(temps: list[int]) -> list[int]:
          pass
  javascript:
    name: daily_temperatures
    starter: |
      function daily_temperatures(temps) {
      }
tests:
  - args: [[73, 74, 75, 71, 69, 72, 76, 73]]
    expected: [1, 1, 4, 2, 1, 1, 0, 0]
  - args: [[30, 40, 50, 60]]
    expected: [1, 1, 1, 0]
    label: strictly increasing
  - args: [[90, 80, 70]]
    expected: [0, 0, 0]
    label: strictly decreasing, nothing ever resolves
  - args: [[50]]
    expected: [0]
    label: single day
  - args: [[]]
    expected: []
    label: empty
  - args: [[70, 70, 70, 75]]
    expected: [3, 2, 1, 0]
    hidden: true
    label: equal temperatures are not warmer
  - args: [[55, 60, 55, 65, 50, 70]]
    expected: [1, 2, 1, 2, 1, 0]
    hidden: true
  - args: [[100, 1, 2, 3, 4, 101]]
    expected: [5, 1, 1, 1, 1, 0]
    hidden: true
    label: a tall early day waits for the very end
time_limit_ms: 4000
---
You are given a list `temps` where `temps[i]` is the forecast temperature on day `i`. For each day, compute how many days you have to wait until a *strictly warmer* day. If no warmer day ever comes, the answer for that day is `0`. Return the answers as a list of the same length.

### Examples

| Input | Output | Why |
|---|---|---|
| `[73, 74, 75, 71, 69, 72, 76, 73]` | `[1, 1, 4, 2, 1, 1, 0, 0]` | Day 2 (75) waits until day 6 (76), four days later |
| `[70, 70, 70, 75]` | `[3, 2, 1, 0]` | `70` is not warmer than `70`; all three wait for the 75 |
| `[90, 80, 70]` | `[0, 0, 0]` | It only gets colder |

### Constraints

- `0 ≤ len(temps) ≤ 10⁵`
- `0 ≤ temps[i] ≤ 200`

### Follow-up

The interviewer asks: "Can you do it in O(1) extra space beyond the output array?" Then: "The temperatures now arrive as a stream and you must emit each day's answer as soon as it is known. What changes?"

## Solution

### The naive approach

For each day, scan forward until you find a warmer one. `O(n²)` in the worst case (a strictly decreasing sequence scans to the end every time). With `n = 10⁵` that is 5 × 10⁹ comparisons; not acceptable, and the interviewer will wait for you to say so.

### The insight

Invert the question. Instead of asking "when is the next warmer day for day `i`?", ask "which earlier days does today resolve?" Today resolves every earlier day that is still waiting and is colder than today. If you keep the waiting days on a stack, the ones today resolves are exactly the top ones, because the stack, by construction, is ordered from warmest at the bottom to coldest at the top. Pop until the top is at least as warm as today, then push today.

### The optimal approach

```python
def daily_temperatures(temps: list[int]) -> list[int]:
    n = len(temps)
    answer = [0] * n
    stack: list[int] = []  # indices with unresolved answers, temps decreasing bottom to top
    for i, t in enumerate(temps):
        while stack and temps[stack[-1]] < t:
            j = stack.pop()
            answer[j] = i - j
        stack.append(i)
    return answer
```

Time `O(n)`: each index is pushed once and popped at most once, so the inner `while` runs `O(n)` times in total across the whole loop, not per iteration. This amortisation argument is the thing to say out loud. Space `O(n)` for the stack (worst case: strictly decreasing input, nothing ever pops).

### Common mistakes

- Storing temperatures on the stack instead of indices; you need the index to compute the distance and to write the answer.
- Using `<=` in the pop condition, which treats equal temperatures as warmer. Test with `[70, 70, 70, 75]`.
- Claiming `O(n²)` because of the nested loop. Count pushes and pops, not loop nestings.

### How to discuss it

Name the structure, "monotonic decreasing stack of unresolved indices", and state the invariant before coding. Trace `[73, 74, 75, 71, 69, 72, 76, 73]` up to day 6 to show a single day popping three entries. For the `O(1)` space follow-up: iterate right to left and use the answer array itself as a linked "next warmer" chain, jumping `j += answer[j]` instead of scanning; each jump skips a resolved block, so it is still `O(n)` amortised. For the streaming version: you cannot emit day `i`'s answer until a warmer day arrives, so latency is unbounded, but the stack version is already online; the answer for day `j` is produced exactly when it is popped. This is the same pattern as [Next Greater Element](/practice/next-greater-element) and the engine behind [Largest Rectangle in a Histogram](/practice/largest-rectangle-histogram).
