---
slug: longest-consecutive-sequence
title: Longest Consecutive Sequence
difficulty: medium
patterns: [hash-map]
lists: [core-75, ascend-150]
companies: [google, amazon, microsoft]
order: 8
lesson: interview-patterns/sequence-patterns/hash-map-patterns
hints:
  - "Sorting makes runs adjacent, but costs O(n log n). To beat it you need O(1) membership queries: put every value in a set."
  - Not every value should start a walk. `x` is the start of a run only if `x - 1` is absent from the set.
  - With that guard, each value is visited by at most one walk, so the total work over all walks is O(n) even though there is a loop inside a loop.
signatures:
  python:
    name: longest_consecutive
    starter: |
      def longest_consecutive(nums: list[int]) -> int:
          pass
  javascript:
    name: longest_consecutive
    starter: |
      function longest_consecutive(nums) {
      }
tests:
  - args: [[100, 4, 200, 1, 3, 2]]
    expected: 4
  - args: [[0, 3, 7, 2, 5, 8, 4, 6, 0, 1]]
    expected: 9
  - args: [[]]
    expected: 0
    label: empty input
  - args: [[5]]
    expected: 1
    label: single element
  - args: [[1, 2, 0, 1]]
    expected: 3
    label: duplicate inside a run
  - args: [[2, 2, 2]]
    expected: 1
  - args: [[-3, -2, -1, 0, 10]]
    expected: 4
    hidden: true
    label: negatives
  - args: [[9, 1, 4, 7, 3, -1, 0, 5, 8, -1, 6]]
    expected: 7
    hidden: true
time_limit_ms: 4000
---
You are given an unsorted array of integers `nums`. Return the length of the longest run of consecutive integers that all appear in `nums`, in any order and regardless of duplicates.

A run is a set of values `x, x+1, x+2, …, x+L-1` each of which occurs in the array. Its length is `L`.

Your solution must run in `O(n)` time.

### Examples

| Input | Output | Why |
|---|---|---|
| `[100, 4, 200, 1, 3, 2]` | `4` | `1, 2, 3, 4` |
| `[0, 3, 7, 2, 5, 8, 4, 6, 0, 1]` | `9` | `0` through `8`; the duplicate `0` does not count twice |
| `[2, 2, 2]` | `1` | A single distinct value is a run of length 1 |

### Constraints

- `0 ≤ len(nums) ≤ 10⁵`
- `-10⁹ ≤ nums[i] ≤ 10⁹`

### Follow-up

The interviewer asks: "Your inner loop is inside an outer loop. Convince me this is O(n) and not O(n²)." Then: "Values now arrive one at a time and I need the current longest run after each insert."

## Solution

### The naive approach

Sort, then scan for the longest stretch where each element is exactly one more than the previous (skipping equal neighbours). `O(n log n)` time, and honestly the approach most engineers would ship. The problem asks for `O(n)`, which rules out comparison sorting and pushes you toward hashing.

### The insight

Put every value in a hash set. Now "is `x + 1` present?" costs `O(1)`, so you can walk a run upward from its start without sorting. The trap is starting a walk from every element: for the input `1..n` that walks `n + (n-1) + … + 1` steps, which is `O(n²)`.

The fix is to walk only from the *start* of each run. `x` starts a run if and only if `x - 1` is not in the set. With that guard, every value is stepped over by exactly one walk (the walk that started at the bottom of its run), so all walks together touch each value once.

### The optimal approach

```python
def longest_consecutive(nums: list[int]) -> int:
    values = set(nums)
    best = 0
    for x in values:
        if x - 1 in values:
            continue                 # not the start of a run
        length = 1
        while x + length in values:
            length += 1
        best = max(best, length)
    return best
```

Iterating over the set rather than the list handles duplicates for free: `[2, 2, 2]` becomes `{2}` and is examined once.

Trace `[100, 4, 200, 1, 3, 2]`. The set is `{1, 2, 3, 4, 100, 200}`. `1`: `0` absent, walk `2, 3, 4`, length 4. `2`, `3`, `4`: each has its predecessor present, skipped. `100`, `200`: starts, length 1 each. Answer 4.

Time `O(n)` expected: building the set is `O(n)`, the outer loop is `O(n)`, and the inner loops sum to at most `n` steps in total. Space `O(n)`.

### Common mistakes

- Omitting the "is this a start?" guard. The code still returns the right answer but is quadratic on sorted-ish input, and a good interviewer will hand you `range(10**5)` and watch.
- Iterating the original list instead of the set, which repeats work for every duplicate (still correct, but wasteful, and it muddies the complexity argument).
- Using `while x + length in nums` on the list instead of the set. That `in` is `O(n)` and the whole thing becomes `O(n²)` or worse.
- Returning `0` for a non-empty array because `best` was never updated when every element is a start with length 1; the code above handles it, but check with `[5]`.

### How to discuss it

State the sort solution and its cost, then say the `O(n)` requirement means hashing. Present the set walk, then *immediately* raise the quadratic trap yourself and fix it with the start-of-run guard; explaining why the guard makes the total linear ("each element is walked over exactly once, by the walk from its run's bottom") is the argument the interviewer is waiting for. For the streaming follow-up, a hash map from run endpoint to run length lets you merge runs on insert: when `x` arrives, look up the lengths of the runs ending at `x - 1` and starting at `x + 1`, merge them into a run of `left + 1 + right`, and update the two new endpoints. That is amortised `O(1)` per insert and is the same idea as union-find on integer neighbours.
