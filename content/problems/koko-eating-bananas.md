---
slug: koko-eating-bananas
title: Koko Eating Bananas
difficulty: medium
patterns: [binary-search]
lists: [ascend-150]
companies: [google, amazon, meta]
order: 3
lesson: interview-patterns/array-patterns/binary-search
hints:
  - You are not searching the array; you are searching for the *answer*. For a given speed `k`, can you check in O(n) whether all piles are finished within `h` hours?
  - If speed `k` works, every faster speed also works. That monotone yes/no structure over `1 .. max(piles)` is exactly what binary search needs.
  - Hours for a pile of size `p` at speed `k` is `ceil(p / k)`, which in integers is `(p + k - 1) // k`. Sum over piles and compare to `h`.
signatures:
  python:
    name: min_eating_speed
    starter: |
      def min_eating_speed(piles: list[int], h: int) -> int:
          pass
  javascript:
    name: min_eating_speed
    starter: |
      function min_eating_speed(piles, h) {
      }
tests:
  - args: [[3, 6, 7, 11], 8]
    expected: 4
  - args: [[30, 11, 23, 4, 20], 5]
    expected: 30
    label: exactly one hour per pile forces the maximum
  - args: [[30, 11, 23, 4, 20], 6]
    expected: 23
  - args: [[1], 1]
    expected: 1
    label: single small pile
  - args: [[1000000000], 2]
    expected: 500000000
    label: large pile, split across two hours
  - args: [[5, 5, 5], 3]
    expected: 5
    hidden: true
  - args: [[2, 2], 4]
    expected: 1
    hidden: true
    label: plenty of time, slowest speed wins
  - args: [[7, 13, 22], 6]
    expected: 8
    hidden: true
  - args: [[3, 6, 7, 11], 4]
    expected: 11
    label: hours equal to piles
time_limit_ms: 4000
---
Koko has `n` piles of bananas; pile `i` contains `piles[i]` bananas. The guards return in `h` hours. Koko picks an eating speed `k` (bananas per hour) and keeps it for the whole session. Each hour she chooses one pile and eats `k` bananas from it; if the pile has fewer than `k` left, she finishes it and does not eat anything else that hour.

Return the smallest integer speed `k` such that Koko can finish every pile within `h` hours. You are guaranteed `h ≥ n`, so a solution always exists.

### Examples

| Input | Output | Why |
|---|---|---|
| `piles = [3, 6, 7, 11]`, `h = 8` | `4` | At `k = 4` the piles take `1 + 2 + 2 + 3 = 8` hours; at `k = 3` they take `1 + 2 + 3 + 4 = 10` |
| `piles = [30, 11, 23, 4, 20]`, `h = 5` | `30` | Five piles in five hours means one pile per hour, so `k` must cover the biggest |
| `piles = [2, 2]`, `h = 4` | `1` | There is enough time to eat one banana an hour |

### Constraints

- `1 ≤ n ≤ 10⁴`
- `n ≤ h ≤ 10⁹`
- `1 ≤ piles[i] ≤ 10⁹`

### Follow-up

The interviewer asks: "Why is the answer bounded above by `max(piles)`?" Then: "Suppose Koko could switch piles mid-hour. Does the problem get easier or harder, and what is the answer then?"

## Solution

### The naive approach

Try `k = 1, 2, 3, …` and for each one compute the total hours in `O(n)`; stop at the first `k` that fits. Correct, `O(n · answer)`, and the answer can be `10⁹`. Too slow, but the *checker* it uses, "does speed `k` finish in `h` hours?", is the right building block.

### The insight

Define `feasible(k)` as "total hours at speed `k` is at most `h`". Eating faster never takes longer, so `feasible` is `false` for small `k` and `true` from some threshold onwards: a monotone predicate over the integers `1 .. max(piles)`. The smallest `k` with `feasible(k) == true` is found by binary search on `k`, using the `O(n)` checker at each probe. This is *binary search on the answer*: the sorted thing is not the input but the implicit sequence of answers to a yes/no question.

The upper bound is `max(piles)`: at that speed every pile takes one hour, `n` hours total, and `h ≥ n`. Any faster speed is pointless because an hour never spans two piles.

### The optimal approach

```python
def min_eating_speed(piles: list[int], h: int) -> int:
    def hours_at(k: int) -> int:
        return sum((p + k - 1) // k for p in piles)

    lo, hi = 1, max(piles)
    while lo < hi:
        mid = lo + (hi - lo) // 2
        if hours_at(mid) <= h:
            hi = mid        # mid works; the answer is mid or slower
        else:
            lo = mid + 1    # mid is too slow
    return lo
```

Time `O(n log M)` where `M = max(piles)`; about 30 probes of an `O(n)` check. Space `O(1)`.

Note the loop shape: `while lo < hi`, `hi = mid` on success, `lo = mid + 1` on failure, return `lo`. This is the "first true" template. It never returns early, and it never leaves `mid` in the range on the failure side, so it terminates. `mid` rounds down, so `hi = mid` always shrinks the range when `lo < hi`.

Trace `[3, 6, 7, 11]`, `h = 8`: `lo = 1, hi = 11`. `mid = 6 → 1+1+2+2 = 6 ≤ 8`, `hi = 6`. `mid = 3 → 1+2+3+4 = 10 > 8`, `lo = 4`. `mid = 5 → 1+2+2+3 = 8 ≤ 8`, `hi = 5`. `mid = 4 → 1+2+2+3 = 8 ≤ 8`, `hi = 4`. `lo == hi == 4`. Answer 4.

### Common mistakes

- Using `math.ceil(p / k)` with floats. It works for these bounds, but it is a habit that fails silently on large integers; use `(p + k - 1) // k` or `-(-p // k)`.
- Starting `lo = 0`, which divides by zero on the first probe.
- Mixing templates: `hi = mid - 1` on success loses the answer when `mid` was the smallest feasible speed.
- Early-exiting the hour sum when it exceeds `h`. That is a valid optimisation; forgetting the comparison and returning a bool from `hours_at` is not.

### How to discuss it

Say "the answer is monotone in `k`, so I'll binary search on `k` with an `O(n)` feasibility check" before writing anything, and say the bounds and why. The first follow-up is answered above: `n` piles in `n` hours at `k = max`. For the switch-piles variant, the total work is `sum(piles)` bananas and the constraint becomes `k · h ≥ sum`, so the answer is `ceil(sum / h)` in `O(n)` with no search at all; the *inability* to split an hour is the only thing that makes this problem non-trivial, and saying so shows you understand where the difficulty lives. The same template solves capacity-to-ship, minimise-max-subarray-sum, and [Square Root](/practice/sqrt-x); the lesson [Binary search](/learn/interview-patterns/array-patterns/binary-search) has the general form.
