---
slug: house-robber-ii
title: House Robber II
difficulty: medium
patterns: [dynamic-programming]
lists: [ascend-150]
companies: [amazon, google, microsoft]
order: 4
lesson: interview-patterns/combinatorial-patterns/dp-patterns
hints:
  - "The only new constraint compared with a straight street is that house 0 and house n - 1 cannot both be taken. In any valid answer, at least one of them is left out."
  - "So solve the straight-street problem twice: once without the last house, once without the first. The answer is the larger."
  - "Handle a single house separately: dropping the first or last house from a one-house street leaves nothing."
signatures:
  python:
    name: rob_circular
    starter: |
      def rob_circular(nums: list[int]) -> int:
          pass
  javascript:
    name: rob_circular
    starter: |
      function rob_circular(nums) {
      }
tests:
  - args: [[5]]
    expected: 5
    label: single house
  - args: [[6, 2, 5]]
    expected: 6
    label: first and last are neighbours
  - args: [[5, 9]]
    expected: 9
  - args: [[2, 1, 1, 2]]
    expected: 3
    label: the straight-street answer (4) is illegal here
  - args: [[3, 1, 1, 8, 1, 6]]
    expected: 15
  - args: [[4, 1, 2, 7, 5, 3, 1]]
    expected: 14
  - args: [[0, 0, 0]]
    expected: 0
  - args: [[10, 1, 1, 10, 1, 1, 10]]
    expected: 21
    hidden: true
  - args: [[1, 3, 1, 3, 100]]
    expected: 103
    hidden: true
  - args: [[3, 8, 4, 6, 2, 9, 1, 7, 5, 4, 8, 3, 6, 2]]
    expected: 44
    hidden: true
  - args: [[9, 2, 3, 9]]
    expected: 12
    hidden: true
time_limit_ms: 4000
---
The houses are now arranged in a ring around a plaza, so house `0` and house `n - 1` are neighbours, as well as every pair `i`, `i + 1`. House `i` holds `nums[i]`. Taking two neighbouring houses on the same night sets off the alarm. Return the largest total you can collect.

### Examples

| Input | Output | Why |
|---|---|---|
| `[6, 2, 5]` | `6` | Houses 0 and 2 are neighbours in the ring, so only one house can be taken |
| `[2, 1, 1, 2]` | `3` | On a straight street you would take both 2s; in the ring they touch |
| `[3, 1, 1, 8, 1, 6]` | `15` | Houses 1, 3 and 5: `1 + 8 + 6`. The straight-street optimum `3 + 8 + 6` uses both ends |

### Constraints

- `1 ≤ len(nums) ≤ 100`
- `0 ≤ nums[i] ≤ 1000`

### Follow-up

The interviewer asks: "Can you do it in one pass instead of two?" Then: "Now the adjacency is an arbitrary graph: some houses across the plaza also share alarms. Does the DP still work?"

## Solution

This builds directly on [House Robber](/practice/house-robber). Solve that first if you have not.

### The naive approach

Enumerate every subset of houses with no two neighbours in the ring. Exponential, as before. Trying to patch the straight-street DP with "if I took house 0, remember it" works but is easy to get wrong in an interview; there is a cleaner reduction.

### The insight

The ring differs from the street in exactly one edge: `0 — (n - 1)`. Any valid selection omits house 0 or omits house `n - 1` (or both). So the optimum is the better of:

- the best straight-street answer on houses `0..n-2` (house `n - 1` removed), and
- the best straight-street answer on houses `1..n-1` (house 0 removed).

Removing either endpoint breaks the ring into a path, where the old DP applies unchanged. Every valid ring selection is a valid selection in at least one of the two paths, and every selection in either path is valid in the ring, so the maximum of the two is exactly right.

### The DP (applied twice)

- **State.** For a path of houses `lo..hi`, `best[i]` is the maximum total from the first `i` houses of that path with no two adjacent.
- **Transition.** `best[i] = max(best[i - 1], best[i - 2] + value of the i-th house)`.
- **Base cases.** `best[0] = 0`; `best[1]` = the first house's value.
- **Iteration order.** Left to right along the path.
- **Answer.** `max(path(0, n - 2), path(1, n - 1))`, or `nums[0]` when `n = 1`.

### Worked table for `[3, 1, 1, 8, 1, 6]`

Path A drops the last house (`[3, 1, 1, 8, 1]`); path B drops the first (`[1, 1, 8, 1, 6]`).

| `i` | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| A: house value | – | 3 | 1 | 1 | 8 | 1 |
| A: `best[i]` | 0 | 3 | 3 | 4 | 11 | **11** |
| B: house value | – | 1 | 1 | 8 | 1 | 6 |
| B: `best[i]` | 0 | 1 | 1 | 9 | 9 | **15** |

The answer is `max(11, 15) = 15`. For contrast, running the straight-street DP on all six houses gives 17 (houses 0, 3, 5), which uses both ends and is illegal in the ring.

### Reference solution

```python
def rob_circular(nums: list[int]) -> int:
    n = len(nums)
    if n == 1:
        return nums[0]

    def rob_path(lo: int, hi: int) -> int:        # inclusive range
        two_back, one_back = 0, 0
        for i in range(lo, hi + 1):
            two_back, one_back = one_back, max(one_back, two_back + nums[i])
        return one_back

    return max(rob_path(0, n - 2), rob_path(1, n - 1))
```

Time `O(n)`: two linear passes. Space `O(1)`: this is already the space-optimised form (two rolling variables per pass, and index ranges instead of slices so nothing is copied). The tabulated form would keep an `O(n)` array per pass.

### Common mistakes

- Forgetting `n = 1`. Both ranges become empty and the function returns 0 instead of `nums[0]`.
- Excluding *both* ends in a single run ("houses `1..n-2`"). That throws away selections that use exactly one end, such as `[9, 2, 3, 9]` → 12 from houses 0 and 2.
- Slicing `nums[:-1]` and `nums[1:]`. Correct, but it copies the array twice; mention the index-range version if space is being discussed.

### How to discuss it

Lead with the reduction: "the ring adds one edge; any answer drops at least one endpoint; so take the max over the two paths". Say why it is exhaustive. Then reuse the House Robber loop.

For the one-pass follow-up, run both DPs side by side in the same loop (four rolling variables), or add a flag to the state: `best[i][took_first]`. Both are `O(n)`; the two-pass version is clearer, and saying so is fine.

For the arbitrary-graph follow-up, the honest answer is no. This problem is maximum-weight independent set, which is NP-hard on general graphs. The path, the cycle and the tree are special because they can be taken apart by removing one vertex or edge at a time (the cycle becomes a path after deleting one vertex; a tree splits at its root). On a general graph you would reach for exponential search with pruning, an ILP solver, or a heuristic (the problem is hard even to approximate well in general). Recognising when a DP stops being possible is as much a senior signal as writing one.
