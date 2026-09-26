---
slug: contains-duplicate
title: Contains Duplicate
difficulty: easy
patterns: [hash-map]
lists: [core-75, ascend-150]
companies: [amazon, apple, google]
order: 2
lesson: interview-patterns/sequence-patterns/hash-map-patterns
hints:
  - Comparing every pair is O(n²). What is the question you ask about each element, and which structure answers it in O(1)?
  - A set of values seen so far. Stop as soon as the element you are looking at is already in it.
  - "Ask the interviewer whether early exit matters: for a stream that is mostly unique you want to return on the first hit, not build the whole set."
signatures:
  python:
    name: contains_duplicate
    starter: |
      def contains_duplicate(nums: list[int]) -> bool:
          pass
  javascript:
    name: contains_duplicate
    starter: |
      function contains_duplicate(nums) {
      }
tests:
  - args: [[1, 2, 3, 1]]
    expected: true
  - args: [[1, 2, 3, 4]]
    expected: false
  - args: [[]]
    expected: false
    label: empty input
  - args: [[7]]
    expected: false
    label: single element
  - args: [[3, 1, 4, 1, 5]]
    expected: true
  - args: [[0, 0]]
    expected: true
    hidden: true
    label: duplicate zeros
  - args: [[-1, 1, -1]]
    expected: true
    hidden: true
    label: negative duplicate
  - args: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]
    expected: false
    hidden: true
time_limit_ms: 4000
---
You are given an array of integers `nums`. Return `true` if any value appears at least twice, and `false` if every value is distinct.

### Examples

| Input | Output | Why |
|---|---|---|
| `nums = [1, 2, 3, 1]` | `true` | `1` appears at indices 0 and 3 |
| `nums = [1, 2, 3, 4]` | `false` | All four values are distinct |
| `nums = [3, 1, 4, 1, 5]` | `true` | `1` repeats |

### Constraints

- `0 ≤ len(nums) ≤ 10⁵`
- `-10⁹ ≤ nums[i] ≤ 10⁹`

### Follow-up

The interviewer asks: "The array does not fit in memory; it arrives as a stream of 10⁹ values. What can you do with 1 GB of RAM?" Then: "What if I only need a probably-correct answer?"

## Solution

### The naive approach

Compare every pair: two nested loops, `O(n²)` time, `O(1)` space. For `n = 10⁵` that is about 5 billion comparisons. Say it exists, say why it is too slow, move on.

Sorting first gives `O(n log n)` time and `O(1)` extra space if you may sort in place: after sorting, duplicates are adjacent, so one linear scan comparing `nums[i]` with `nums[i - 1]` finds them. This is the right answer when memory is the constraint, and interviewers like hearing that you know it.

### The insight

The inner loop of the brute force asks "have I seen this value before?" That is a membership query. A hash set answers it in expected `O(1)`, so the whole scan is `O(n)`.

### The optimal approach

Walk the array, keeping a set of values seen so far. If the current value is already in the set, return `true` immediately; otherwise add it. If the loop finishes, every value was new.

```python
def contains_duplicate(nums: list[int]) -> bool:
    seen: set[int] = set()
    for x in nums:
        if x in seen:
            return True
        seen.add(x)
    return False
```

Time `O(n)` expected, space `O(n)` worst case. The early return matters in practice: on an input whose first two elements are equal, this does two set operations regardless of `n`.

The one-liner `len(set(nums)) < len(nums)` is correct and idiomatic, but it always materialises the whole set. Mention it, then say why you might not use it.

### Common mistakes

- Using `nums.count(x)` inside the loop, which quietly turns the solution back into `O(n²)`.
- Forgetting the empty and single-element cases return `false`; the loop handles them naturally, but say so when you test.
- Claiming hash sets are "O(1)" without qualification. They are expected `O(1)` with a good hash function; a senior candidate knows adversarial keys can degrade a naive table, and that Python's `dict` and `set` use open addressing with randomised hashing for strings.

### How to discuss it

State the brute force, then sorting, then the set, with the time/space trade-off of each. Write the set version. For the streaming follow-up: you cannot store 10⁹ distinct 8-byte integers in 1 GB, so you either sort external chunks and merge (exact, disk-bound), or use a Bloom filter (probabilistic: no false negatives, tunable false-positive rate, a few bits per element). Naming the Bloom filter and being able to say what "false positive" means for this problem, that it may report a duplicate that does not exist but never misses a real one, is the senior signal.
