---
slug: burst-balloons
title: Burst Balloons
difficulty: hard
patterns: [dynamic-programming]
lists: [ascend-150]
companies: [google, amazon, microsoft]
order: 20
lesson: interview-patterns/combinatorial-patterns/dp-patterns
hints:
  - "Choosing which balloon to burst *first* splits the row, but the two halves still affect each other: their neighbours change as balloons disappear. Choose which balloon bursts *last* instead."
  - "Pad the array with a 1 at each end. If balloon `k` is the last to burst strictly between walls `i` and `j`, its neighbours at that moment are exactly `i` and `j`, and the two sides are independent."
  - "`best[i][j] = max over i < k < j of best[i][k] + p[i]·p[k]·p[j] + best[k][j]`. Fill by increasing interval length."
signatures:
  python:
    name: max_coins
    starter: |
      def max_coins(nums: list[int]) -> int:
          pass
  javascript:
    name: max_coins
    starter: |
      function max_coins(nums) {
      }
tests:
  - args: [[5]]
    expected: 5
    label: single balloon
  - args: [[1, 5]]
    expected: 10
  - args: [[2, 3, 4]]
    expected: 36
  - args: [[0, 0]]
    expected: 0
  - args: [[1, 1, 1]]
    expected: 3
  - args: [[3, 0, 3]]
    expected: 12
    label: burst the zero early
  - args: [[6, 1, 9]]
    expected: 117
  - args: [[9, 76, 64, 21]]
    expected: 116718
    hidden: true
  - args: [[4, 2, 7, 1, 3]]
    expected: 177
    hidden: true
  - args: [[8, 2, 6, 8, 9, 8, 1, 4, 1, 5, 3, 0]]
    expected: 2316
    hidden: true
time_limit_ms: 4000
---
A row of balloons has values `nums[0..n-1]`. You burst them one at a time, in any order you choose, until none are left. Bursting a balloon earns the product of its value and the values of its current left and right neighbours. A missing neighbour (past either end of the current row) counts as `1`. After a burst, the balloon's two neighbours become adjacent.

Return the maximum total you can earn.

### Examples

| Input | Output | Why |
|---|---|---|
| `[1, 5]` | `10` | Burst 1 first: `1·1·5 = 5`, then 5 alone: `1·5·1 = 5` |
| `[2, 3, 4]` | `36` | Burst 3 (`2·3·4 = 24`), then 2 (`1·2·4 = 8`), then 4 (`1·4·1 = 4`) |
| `[3, 0, 3]` | `12` | Burst 0 first (earns 0) so the 3s become neighbours, then `1·3·3 = 9`, then `1·3·1 = 3` |

### Constraints

- `1 ≤ len(nums) ≤ 300`
- `0 ≤ nums[i] ≤ 100`

### Follow-up

The interviewer asks: "Return the order in which to burst the balloons." Then: "Which other classic problem has exactly this recurrence shape?"

## Solution

### The naive approach

Try every burst order: `n!` of them. Memoising on the *set* of remaining balloons brings it to `O(2ⁿ · n)`, still hopeless for `n = 300`.

The natural interval idea also fails at first. If you pick the balloon `k` to burst **first** in a range, the left and right parts are not independent afterwards: when the last balloon on the left side bursts, its right neighbour is whatever is still standing on the right side. The subproblems leak into each other.

### The insight

Flip the question: which balloon bursts **last** in a range? Pad `nums` with a 1 at each end to get `p`, and consider the open interval between walls `i` and `j` (both walls are still standing while everything strictly between them bursts). If `k` is the last balloon to go in that interval, then:

- when `k` bursts, everything else between the walls is gone, so its neighbours are exactly `p[i]` and `p[j]`, earning `p[i]·p[k]·p[j]`;
- before that, the balloons in `(i, k)` burst with `k` standing as their right wall, and the balloons in `(k, j)` burst with `k` standing as their left wall. Neither side can see the other, because `k` is in the way.

So the interval splits into two independent smaller intervals. That independence is the whole trick.

### The DP

- **State.** `best[i][j]` is the maximum coins from bursting every balloon strictly between positions `i` and `j` of the padded array `p`, while `p[i]` and `p[j]` stay standing.
- **Transition.** `best[i][j] = max(best[i][k] + p[i]·p[k]·p[j] + best[k][j])` over `i < k < j`.
- **Base cases.** `best[i][i + 1] = 0`: nothing lies strictly between neighbours.
- **Iteration order.** By increasing gap `j - i` (2, 3, …, n + 1), so both halves are always shorter and already filled. Equivalently, `i` from high to low and `j` from low to high.
- **Answer.** `best[0][n + 1]`.

### Worked table for `[2, 3, 4]`

Padded `p = [1, 2, 3, 4, 1]` (positions 0 to 4). Each cell shows `best[i][j]` and the `k` that achieved it.

| `i` \ `j` | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| 0 | 0 | 6 (k=1) | 32 (k=1) | **36** (k=3) |
| 1 | | 0 | 24 (k=2) | 32 (k=3) |
| 2 | | | 0 | 12 (k=3) |
| 3 | | | | 0 |

The top-right cell tries each last balloon:

- `k = 1` (value 2): `best[0][1] + 1·2·1 + best[1][4] = 0 + 2 + 32 = 34`
- `k = 2` (value 3): `best[0][2] + 1·3·1 + best[2][4] = 6 + 3 + 12 = 21`
- `k = 3` (value 4): `best[0][3] + 1·4·1 + best[3][4] = 32 + 4 + 0 = 36`

Reading the choices back: 4 bursts last; in `(0, 3)`, 2 bursts last; in `(1, 3)`, 3 is the only balloon. So the order is 3, 2, 4, which earns `24 + 8 + 4 = 36`.

### Reference solution

```python
def max_coins(nums: list[int]) -> int:
    p = [1] + nums + [1]
    size = len(p)
    best = [[0] * size for _ in range(size)]
    for gap in range(2, size):                     # j - i
        for i in range(0, size - gap):
            j = i + gap
            wall = p[i] * p[j]
            top = 0
            for k in range(i + 1, j):
                value = best[i][k] + wall * p[k] + best[k][j]
                if value > top:
                    top = value
            best[i][j] = top
    return best[0][size - 1]
```

Time `O(n³)`: about `n³/6 ≈ 4.5 × 10⁶` inner steps at `n = 300`, a couple of seconds in CPython and well under that in compiled languages. Space `O(n²)`.

### Space

There is no rolling-array reduction. An interval's value depends on intervals sharing either endpoint at every smaller length, so all `O(n²)` entries must be kept until the end. Say so rather than inventing an optimisation. A memoised top-down version (`@lru_cache` on `(i, j)`) is equivalent and often easier to get right in an interview; its recursion depth is only `O(n)`.

### Common mistakes

- Thinking in terms of the first balloon to burst, which makes the halves dependent and the recurrence wrong.
- Forgetting the padding, then special-casing the ends everywhere.
- Using `nums[i-1]·nums[k]·nums[j+1]` style indices with closed intervals and getting the neighbours wrong. The open-interval formulation with walls avoids this.
- Filling rows top to bottom with `i` ascending, which reads `best[k][j]` for `k > i` before it has been computed.

### How to discuss it

Explain why "first to burst" fails (the halves interact), then flip to "last to burst" and say why the halves become independent: the last balloon is a wall that stays up until the end. Give the state as an open interval with fixed walls, the transition, the fill order by gap, and trace a three-balloon example. That explanation is the actual content of the problem; the code is short once it is clear.

For the order, store the best `k` for each interval and recurse: burst the left part's order, then the right part's, then `k`. The shape "interval `[i, j]`, try every split point `k`, combine the two sides plus a cost depending on `i, k, j`" is **matrix-chain multiplication** (the cost of the final multiplication depends on the outer dimensions and the split), and also optimal binary search trees and polygon triangulation. Recognising "interval DP over a split point" as a family is the senior signal.
