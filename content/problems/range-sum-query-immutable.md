---
slug: range-sum-query-immutable
title: Range Sum Query on an Immutable Array
difficulty: easy
patterns: [prefix-sum]
lists: [ascend-150]
companies: [meta, amazon, palantir]
order: 2
lesson: interview-patterns/array-patterns/prefix-sum
hints:
  - The array never changes and there are many queries. Anything you can compute once in the constructor is free per query.
  - Store `prefix[i]` = sum of the first `i` elements, with `prefix[0] = 0`. Then the sum of `nums[left..right]` is `prefix[right + 1] - prefix[left]`.
  - The extra leading zero is what makes `left = 0` need no special case.
signatures:
  python:
    name: NumArray
    starter: |
      class NumArray:
          def __init__(self, nums: list[int]):
              pass

          def sum_range(self, left: int, right: int) -> int:
              pass
  javascript:
    name: NumArray
    starter: |
      class NumArray {
        constructor(nums) {
        }

        sum_range(left, right) {
        }
      }
tests:
  - args: [["__init__", [-2, 0, 3, -5, 2, -1]], ["sum_range", 0, 2], ["sum_range", 2, 5], ["sum_range", 0, 5]]
    expected: [null, 1, -1, -3]
  - args: [["__init__", [5]], ["sum_range", 0, 0]]
    expected: [null, 5]
    label: single element
  - args: [["__init__", [1, 2, 3, 4, 5]], ["sum_range", 1, 3], ["sum_range", 0, 4], ["sum_range", 4, 4]]
    expected: [null, 9, 15, 5]
  - args: [["__init__", [10, -10, 10, -10, 10]], ["sum_range", 0, 1], ["sum_range", 0, 4], ["sum_range", 1, 2], ["sum_range", 3, 4]]
    expected: [null, 0, 10, 0, 0]
  - args: [["__init__", [0, 0, 0]], ["sum_range", 0, 2]]
    expected: [null, 0]
    hidden: true
  - args: [["__init__", [-1, -2, -3, -4]], ["sum_range", 0, 3], ["sum_range", 2, 3], ["sum_range", 1, 1]]
    expected: [null, -10, -7, -2]
    hidden: true
    label: all negative
time_limit_ms: 4000
---
Design a class `NumArray` that is constructed from an array of integers `nums` and answers range-sum queries.

- `NumArray(nums)` stores the array. It is never modified afterwards.
- `sum_range(left, right)` returns the sum of `nums[left] + nums[left + 1] + … + nums[right]`, inclusive on both ends.

Expect many more queries than there are elements. Each query should run in `O(1)` time.

### Examples

Constructing with `[-2, 0, 3, -5, 2, -1]`:

| Call | Returns | Why |
|---|---|---|
| `sum_range(0, 2)` | `1` | `-2 + 0 + 3` |
| `sum_range(2, 5)` | `-1` | `3 - 5 + 2 - 1` |
| `sum_range(0, 5)` | `-3` | The whole array |

### Constraints

- `1 ≤ len(nums) ≤ 10⁴`
- `-10⁵ ≤ nums[i] ≤ 10⁵`
- `0 ≤ left ≤ right < len(nums)`
- Up to `10⁴` calls to `sum_range`

### Follow-up

The interviewer asks: "Now the array is mutable: `update(index, value)` must be supported alongside `sum_range`. What are the trade-offs of the structures you could use?" Then: "Extend to two dimensions: sum of a rectangle in a matrix."

## Solution

### The naive approach

Store the array and loop from `left` to `right` on every query: `O(1)` construction, `O(n)` per query. With `10⁴` queries on `10⁴` elements that is up to `10⁸` additions. Fine for a script, not fine for a service.

### The insight

The array is immutable, so every query is asking about the same data. Precompute the running total once: `prefix[i]` is the sum of the first `i` elements. Then any range sum is the difference of two prefixes: the sum up to `right` minus the sum up to just before `left`. Construction is `O(n)`; every query afterwards is one subtraction.

The convention `prefix[0] = 0` with `prefix` one longer than `nums` is not decoration. It makes `sum_range(0, r)` equal `prefix[r + 1] - prefix[0] = prefix[r + 1]` with no branch, and it is the same convention that [Subarray Sum Equals K](/practice/subarray-sum-equals-k) relies on when it seeds its map with the empty prefix.

### The optimal approach

```python
class NumArray:
    def __init__(self, nums: list[int]):
        self.prefix = [0] * (len(nums) + 1)
        for i, x in enumerate(nums):
            self.prefix[i + 1] = self.prefix[i] + x

    def sum_range(self, left: int, right: int) -> int:
        return self.prefix[right + 1] - self.prefix[left]
```

Trace with `[-2, 0, 3, -5, 2, -1]`: `prefix = [0, -2, -2, 1, -4, -2, -3]`. `sum_range(2, 5) = prefix[6] - prefix[2] = -3 - (-2) = -1`. `sum_range(0, 2) = prefix[3] - prefix[0] = 1`.

Construction `O(n)` time and `O(n)` space; each query `O(1)`.

### Common mistakes

- Off-by-one: `prefix[right] - prefix[left]` (misses `nums[right]`) or `prefix[right] - prefix[left - 1]` (breaks at `left = 0`). Using the length-`n + 1` prefix with a leading zero avoids both.
- Storing prefixes of length `n` and special-casing `left == 0`. It works; it is also the kind of branch that grows a bug in the 2D version.
- Computing the prefix lazily on the first query. Harmless here, but it makes the first call `O(n)` and complicates any concurrent use.

### How to discuss it

State the precomputation trade-off: pay `O(n)` once to make each of many queries `O(1)`. Write the prefix with the leading zero and say why. Trace one query. For the mutable follow-up: with prefix sums an update is `O(n)` (every later prefix changes); a Fenwick tree (binary indexed tree) gives `O(log n)` for both update and query in `n` integers of space and about twenty lines of code, and a segment tree gives the same bounds with more generality (min, max, any associative operation) at the cost of `2n` to `4n` space. Choose by read/write ratio: read-heavy and immutable, prefix sums; mixed, Fenwick; need more than sums, segment tree. For 2D: a prefix rectangle `P[i][j]` = sum of the sub-matrix from the origin to `(i, j)`, and the sum of any rectangle is `P[r2][c2] - P[r1-1][c2] - P[r2][c1-1] + P[r1-1][c1-1]` by inclusion–exclusion, with the same leading row and column of zeros.
