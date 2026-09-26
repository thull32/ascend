---
slug: first-bad-version
title: First Bad Version
difficulty: easy
patterns: [binary-search]
lists: [ascend-150]
companies: [meta, google, microsoft]
order: 8
lesson: interview-patterns/array-patterns/binary-search
hints:
  - The array is all `false` then all `true`. That is a monotone predicate, and the question is "where does it flip?"
  - Keep the invariant "the first `true` is in `[lo, hi]`". If `is_bad[mid]` is true, the answer is `mid` or earlier, so `hi = mid`; otherwise `lo = mid + 1`.
  - Use `while lo < hi` and return `lo`. Do not return early on a `true`; the first `true` might be earlier.
signatures:
  python:
    name: first_bad_version
    starter: |
      def first_bad_version(is_bad: list[bool]) -> int:
          pass
  javascript:
    name: first_bad_version
    starter: |
      function first_bad_version(is_bad) {
      }
tests:
  - args: [[false, false, false, true, true]]
    expected: 3
  - args: [[true]]
    expected: 0
    label: only version is bad
  - args: [[false, true]]
    expected: 1
  - args: [[true, true, true]]
    expected: 0
    label: everything is bad
  - args: [[false, false, false, false, true]]
    expected: 4
    label: only the last is bad
  - args: [[false, false, false, false, false, false, false, true, true, true]]
    expected: 7
    hidden: true
  - args: [[false, false, true, true, true, true, true, true]]
    expected: 2
    hidden: true
  - args: [[false, true, true, true]]
    expected: 1
    hidden: true
time_limit_ms: 4000
---
Your product has `n` versions, numbered `0` to `n - 1` in the order they were built. At some point a version introduced a bug, and because each version is built on top of the previous one, every later version is also bad. You are given `is_bad`, a list of booleans where `is_bad[i]` is `true` exactly when version `i` is bad. It is guaranteed to be some number of `false` values followed by at least one `true`.

Return the index of the first bad version. Each lookup of `is_bad[i]` should be thought of as an expensive call (a full CI run), so the solution must use `O(log n)` lookups; a linear scan is not acceptable even though the array is in memory.

### Examples

| Input | Output | Why |
|---|---|---|
| `[false, false, false, true, true]` | `3` | Versions 0–2 are good, 3 is the first bad one |
| `[true]` | `0` | The only version is bad |
| `[false, false, false, false, true]` | `4` | Only the last version is bad |

### Constraints

- `1 ≤ len(is_bad) ≤ 2³¹ - 1` (in principle; tests are small)
- At least one element is `true`, and no `true` is followed by a `false`

### Follow-up

The interviewer asks: "Each check is flaky and returns the wrong answer 1% of the time. What do you do?" Then: "The checks take ten minutes each but you can run several in parallel. How does that change the search?"

## Solution

### The naive approach

Scan from index 0 and return the first `true`. `O(n)` lookups. When each lookup is a CI run, `n = 1000` commits is a week of machine time. This is why `git bisect` exists.

### The insight

The array is monotone: `false…false true…true`. Checking the middle tells you which side the boundary is on. If `is_bad[mid]` is `true`, the first bad version is at `mid` or before it, so keep `mid` in the window. If it is `false`, the first bad version is strictly after `mid`. Each check halves the window, so `⌈log₂ n⌉` checks suffice: about 10 for a thousand versions, 31 for two billion.

### The optimal approach

```python
def first_bad_version(is_bad: list[bool]) -> int:
    lo, hi = 0, len(is_bad) - 1
    while lo < hi:
        mid = lo + (hi - lo) // 2
        if is_bad[mid]:
            hi = mid          # first bad is mid or earlier
        else:
            lo = mid + 1      # first bad is after mid
    return lo
```

`O(log n)` lookups, `O(1)` space.

This is the cleanest instance of the *first true* template, worth memorising as a unit: `while lo < hi`; `hi = mid` on true; `lo = mid + 1` on false; return `lo`. Termination: `mid < hi` whenever `lo < hi` (floor division), so `hi = mid` strictly shrinks, and `lo = mid + 1` strictly grows. Correctness: the invariant "the answer is in `[lo, hi]`" holds initially because a `true` is guaranteed, and each branch preserves it.

Trace `[false, false, false, true, true]`: `lo = 0, hi = 4, mid = 2 → false`, `lo = 3`. `mid = 3 → true`, `hi = 3`. `lo == hi == 3`.

### Common mistakes

- Returning `mid` as soon as `is_bad[mid]` is true; that is *a* bad version, not the first.
- `hi = mid - 1` on true, which skips the answer when `mid` is it.
- `while lo <= hi` combined with `hi = mid`, which never terminates once `lo == hi`.
- Computing `mid = (lo + hi) / 2` in a language where it overflows or produces a float.

### How to discuss it

Say "monotone predicate, find the first true, binary search" and write the four-line template. Mention `git bisect` as the same algorithm on commits. For flaky checks: a single wrong answer sends the search to the wrong half permanently, so either repeat each check until you have a confident majority (costs a constant factor), or use a noisy binary search that keeps a probability distribution over the boundary and probes its median; the second is what real fault-localisation tools do. For parallel checks with `p` workers: probe `p` evenly spaced points at once, which cuts the window by a factor of `p + 1` per round instead of 2, so the number of rounds drops from `log₂ n` to `log_{p+1} n`; with 9 workers on a thousand versions that is 3 rounds instead of 10. This is the same template as [Koko Eating Bananas](/practice/koko-eating-bananas) with a lookup in place of a computed predicate.
