---
slug: first-missing-positive
title: First Missing Positive
difficulty: hard
patterns: [hash-map]
lists: [ascend-150]
companies: [amazon, microsoft, google, stripe]
order: 10
lesson: interview-patterns/sequence-patterns/hash-map-patterns
hints:
  - The answer is always between 1 and n + 1, where n is the array length. Values outside 1..n can never matter.
  - 'A hash set gives O(n) time but O(n) space. To get O(1) space, use the array itself as the hash table: the value v "belongs" at index v - 1.'
  - Swap each value into its home index until the current slot holds something that cannot be placed. Then the first index i whose value is not i + 1 gives the answer i + 1.
signatures:
  python:
    name: first_missing_positive
    starter: |
      def first_missing_positive(nums: list[int]) -> int:
          pass
  javascript:
    name: first_missing_positive
    starter: |
      function first_missing_positive(nums) {
      }
tests:
  - args: [[1, 2, 0]]
    expected: 3
  - args: [[3, 4, -1, 1]]
    expected: 2
  - args: [[7, 8, 9, 11, 12]]
    expected: 1
    label: nothing small present
  - args: [[]]
    expected: 1
    label: empty input
  - args: [[1]]
    expected: 2
  - args: [[2]]
    expected: 1
  - args: [[2, 1]]
    expected: 3
  - args: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]
    expected: 11
    label: complete run, answer is n + 1
  - args: [[1, 1]]
    expected: 2
    hidden: true
    label: duplicates must not loop forever
  - args: [[0, -5, 3, 2, 1, 1, 5]]
    expected: 4
    hidden: true
time_limit_ms: 4000
---
You are given an unsorted array of integers `nums`, which may contain zeros, negatives and duplicates. Return the smallest positive integer (`1` or greater) that does not appear in the array.

Your solution must run in `O(n)` time and use `O(1)` extra space. You may modify the input array.

### Examples

| Input | Output | Why |
|---|---|---|
| `[3, 4, -1, 1]` | `2` | `1` is present, `2` is not |
| `[7, 8, 9, 11, 12]` | `1` | Nothing small is present at all |
| `[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]` | `11` | Every value from 1 to n is present, so the answer is n + 1 |

### Constraints

- `0 ≤ len(nums) ≤ 10⁵`
- `-2³¹ ≤ nums[i] ≤ 2³¹ - 1`

### Follow-up

The interviewer asks: "Your swap loop is a `while` inside a `for`. Show me why it terminates and why the total is O(n)." Then: "I cannot let you mutate the input. What is the best you can do?"

## Solution

### The naive approach

Sort and scan for the first gap: `O(n log n)` time. Or put everything in a hash set and test `1, 2, 3, …` until one is missing: `O(n)` time but `O(n)` space. The set solution is what you write first; the problem's constraints exist to push you past it.

### The insight

Two observations shrink the problem. First, the answer is in `1..n+1`: if all of `1..n` are present the answer is `n + 1`, and otherwise something in `1..n` is missing. So any value `≤ 0` or `> n` is irrelevant and can be treated as garbage. Second, because the interesting values are exactly the valid indices shifted by one, the array itself can serve as the hash table: value `v` has a natural home at index `v - 1`. If you can move every in-range value to its home, a single scan finds the first index whose occupant is wrong, and that index plus one is the answer.

This "value as index" trick is the cyclic-sort pattern, and it is what "O(1) space hash table" means when the key space is `1..n`.

### The optimal approach

For each position `i`, while `nums[i]` is an in-range value `v` that is not already sitting at its home `nums[v - 1]`, swap it home. Each swap places one value permanently in its correct slot, so the `while` loop can run at most `n` times across the entire pass.

```python
def first_missing_positive(nums: list[int]) -> int:
    n = len(nums)
    for i in range(n):
        while 1 <= nums[i] <= n and nums[nums[i] - 1] != nums[i]:
            home = nums[i] - 1
            nums[i], nums[home] = nums[home], nums[i]
    for i in range(n):
        if nums[i] != i + 1:
            return i + 1
    return n + 1
```

Trace `[3, 4, -1, 1]`. `i = 0`: `3` belongs at index 2, swap → `[-1, 4, 3, 1]`; `-1` is out of range, stop. `i = 1`: `4` belongs at index 3, swap → `[-1, 1, 3, 4]`; `1` belongs at index 0, swap → `[1, -1, 3, 4]`; `-1` stops. `i = 2, 3`: already home. Scan: index 1 holds `-1`, not `2`. Answer `2`.

Time `O(n)`: the outer loop is `n` iterations, and the total number of swaps over the whole run is at most `n` because each swap fixes one value permanently. Space `O(1)`.

### The duplicate trap

The condition `nums[nums[i] - 1] != nums[i]` is what stops `[1, 1]` from looping forever. Without it, index 1 holds `1`, whose home (index 0) already holds a `1`; swapping two equal values changes nothing and the loop never ends. With it, "the home already holds the right value" counts as done. Trace this by hand before you run it; a runaway loop here is the classic way to hang a test runner.

### Common mistakes

- The infinite loop on duplicates above.
- Using `nums[i] - 1` after the swap has already changed `nums[i]`; compute `home` once, as in the code.
- Forgetting the `n + 1` case when everything from `1..n` is present.
- Checking `nums[i] <= n` but not `>= 1`, then indexing with a negative value; Python will happily read `nums[-2]` and give you a wrong answer instead of a crash.

### How to discuss it

Say the hash-set answer first, then observe the answer is bounded by `n + 1`, then say "so the array can be its own hash table with value `v` at slot `v - 1`". Write the swap loop, then give the amortisation argument unprompted: each swap is final, so at most `n` swaps in total. Trace `[1, 1]` to show the duplicate guard. For the no-mutation follow-up: with `O(n)` space the set solution is optimal; with `O(1)` space and a read-only array, you can binary search on the answer (count how many values lie in `[1, mid]` for each probe) for `O(n log n)` time, and it is worth saying that the read-only constraint is exactly what forces the logarithm back in.
