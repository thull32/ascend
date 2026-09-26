---
slug: top-k-frequent
title: Top K Frequent Elements
difficulty: medium
patterns: [hash-map]
lists: [core-75, ascend-150]
companies: [amazon, meta, apple, bloomberg]
order: 5
lesson: interview-patterns/sequence-patterns/hash-map-patterns
hints:
  - First count how often each value appears. The rest of the problem is "select the k largest counts".
  - A heap of size k over the counts gives O(n log k). Can you avoid the log factor entirely?
  - A frequency can only be between 1 and n. Bucket the values by frequency and walk the buckets from n downward.
signatures:
  python:
    name: top_k_frequent
    starter: |
      def top_k_frequent(nums: list[int], k: int) -> list[int]:
          pass
  javascript:
    name: top_k_frequent
    starter: |
      function top_k_frequent(nums, k) {
      }
tests:
  - args: [[1, 1, 1, 2, 2, 3], 2]
    expected: [1, 2]
    any_order: true
  - args: [[1], 1]
    expected: [1]
    any_order: true
    label: single element
  - args: [[4, 4, 4, 5, 5, 6, 6, 6, 6], 2]
    expected: [6, 4]
    any_order: true
  - args: [[-1, -1, 2, 2, 2, 3], 1]
    expected: [2]
    any_order: true
    label: negatives
  - args: [[5, 5, 5, 5], 1]
    expected: [5]
    any_order: true
  - args: [[2, 3, 2, 3, 2, 3, 4], 2]
    expected: [2, 3]
    any_order: true
  - args: [[1, 2, 3, 4, 5], 5]
    expected: [1, 2, 3, 4, 5]
    any_order: true
    hidden: true
    label: k equals the number of distinct values
  - args: [[7, 7, 8, 8, 8, 9, 9, 9, 9, 10], 3]
    expected: [9, 8, 7]
    any_order: true
    hidden: true
time_limit_ms: 4000
---
You are given an array of integers `nums` and an integer `k`. Return the `k` values that occur most often in `nums`. The answer may be returned in any order.

The input is chosen so that the answer is unique: there is never a tie between the `k`-th most frequent value and the `(k+1)`-th.

### Examples

| Input | Output | Why |
|---|---|---|
| `nums = [1, 1, 1, 2, 2, 3]`, `k = 2` | `[1, 2]` | Counts are `1→3`, `2→2`, `3→1` |
| `nums = [4, 4, 4, 5, 5, 6, 6, 6, 6]`, `k = 2` | `[6, 4]` | `6` appears 4 times, `4` three times, `5` twice |
| `nums = [1, 2, 3, 4, 5]`, `k = 5` | `[1, 2, 3, 4, 5]` | Every value ties at once, and all are requested |

### Constraints

- `1 ≤ len(nums) ≤ 10⁵`
- `-10⁴ ≤ nums[i] ≤ 10⁴`
- `1 ≤ k ≤` number of distinct values in `nums`

### Follow-up

The interviewer asks: "Your solution must run faster than O(n log n). Prove that it does." Then: "The values arrive as an unbounded stream and I want the top k at any moment. What changes?"

## Solution

### The naive approach

Count with a hash map, then sort the distinct values by count descending and take the first `k`. That is `O(n)` to count and `O(d log d)` to sort `d` distinct values, so `O(n log n)` worst case. It is correct, three lines long, and most interviewers will let you write it as a baseline before pushing you to beat the sort.

### The insight

Sorting all `d` counts does more than the question asks. You need the `k` largest, not a total order. Two structures give you that cheaper:

1. **A min-heap of size `k`.** Push each `(count, value)`; when the heap exceeds `k`, pop the smallest. At the end the heap holds the `k` largest. `O(d log k)`.
2. **Bucket by frequency.** A frequency is an integer between `1` and `n`. Make an array of `n + 1` buckets where `buckets[f]` holds every value with frequency `f`. Walk from `buckets[n]` downward, collecting values until you have `k`. No comparison sort anywhere: `O(n)`.

### The optimal approach

```python
def top_k_frequent(nums: list[int], k: int) -> list[int]:
    counts: dict[int, int] = {}
    for x in nums:
        counts[x] = counts.get(x, 0) + 1

    buckets: list[list[int]] = [[] for _ in range(len(nums) + 1)]
    for value, freq in counts.items():
        buckets[freq].append(value)

    out: list[int] = []
    for freq in range(len(nums), 0, -1):
        for value in buckets[freq]:
            out.append(value)
            if len(out) == k:
                return out
    return out
```

Time `O(n)`: one pass to count, one pass over distinct values to bucket, one pass over the bucket array. Space `O(n)` for the counts and the bucket array.

The heap version is worth knowing because it generalises to streams and to "top k by an arbitrary score", where bucketing by an integer range is not available:

```python
def top_k_frequent_heap(nums: list[int], k: int) -> list[int]:
    counts = collections.Counter(nums)
    return [value for _, value in heapq.nlargest(k, ((c, v) for v, c in counts.items()))]
```

### Common mistakes

- Using a max-heap of all `d` elements and popping `k` times. That is `O(d + k log d)`, which is fine, but the candidate usually describes it as `O(n log k)`, which it is not. Know which heap you built.
- Sizing the bucket array by the number of distinct values instead of `n`; a single value repeated `n` times has frequency `n`.
- Returning counts instead of values, or returning more than `k` when a bucket has several values and you forget to stop mid-bucket.

### How to discuss it

Give the count-and-sort baseline in one sentence. Say "I only need the top k, not a full order", present the heap and the bucket approach, and pick bucket sort because frequencies are bounded integers, which is the observation that removes the logarithm. For the proof: every loop is bounded by `n` or by the number of distinct values, and there are no nested data-dependent loops. For the streaming follow-up: exact top-k over an unbounded stream needs unbounded memory in the worst case; the practical answers are a heap over a running count map (exact, memory grows with distinct values) or a sketch such as Count-Min plus a heap (approximate, fixed memory). Naming the trade-off is the senior move; the [heap patterns lesson](/learn/interview-patterns/sequence-patterns/top-k-elements) covers the streaming variants.
