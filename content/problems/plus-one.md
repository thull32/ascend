---
slug: plus-one
title: Plus One
difficulty: easy
patterns: [math]
lists: [ascend-150]
companies: [google, amazon, apple, microsoft]
order: 4
lesson: interview-patterns/combinatorial-patterns/math-and-geometry
hints:
  - "Converting the digits to an integer, adding one and converting back fails once the number is longer than a machine integer can hold. Work on the digits directly, as you would on paper."
  - "Walk from the last digit leftwards. A digit below 9 absorbs the carry: increment it and you are done. A 9 becomes 0 and passes the carry on."
  - "If the carry falls off the front, every digit was 9 and is now 0. The answer is a 1 followed by all those zeros."
signatures:
  python:
    name: plus_one
    starter: |
      def plus_one(digits: list[int]) -> list[int]:
          pass
  javascript:
    name: plus_one
    starter: |
      function plus_one(digits) {
      }
tests:
  - args: [[4, 3, 2]]
    expected: [4, 3, 3]
  - args: [[1, 9]]
    expected: [2, 0]
    label: one carry
  - args: [[9]]
    expected: [1, 0]
    label: single nine grows the array
  - args: [[9, 9, 9]]
    expected: [1, 0, 0, 0]
    label: all nines
  - args: [[0]]
    expected: [1]
    label: zero
  - args: [[8, 9, 9]]
    expected: [9, 0, 0]
  - args: [[2, 0, 9, 9, 0]]
    expected: [2, 0, 9, 9, 1]
    hidden: true
    label: nines that are not at the end do not carry
  - args: [[9, 0, 9]]
    expected: [9, 1, 0]
    hidden: true
  - args: [[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9]]
    expected: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0]
    hidden: true
    label: twenty digits, beyond 64-bit range
time_limit_ms: 4000
---
A non-negative integer is stored as an array `digits`, most significant digit first, one decimal digit per element. Add one to the number and return the result in the same format.

The input has no leading zeros, except for the number zero itself, which is `[0]`.

### Examples

| Input | Output | Why |
|---|---|---|
| `digits = [4, 3, 2]` | `[4, 3, 3]` | `432 + 1 = 433`; no carry |
| `digits = [8, 9, 9]` | `[9, 0, 0]` | Both 9s roll over; the 8 absorbs the carry |
| `digits = [9, 9, 9]` | `[1, 0, 0, 0]` | Every digit rolls over; the result is one digit longer |

### Constraints

- `1 ≤ len(digits) ≤ 100`
- `0 ≤ digits[i] ≤ 9`
- No leading zeros unless the number is `0`.

### Follow-up

The interviewer asks: "Now add two such arrays together." Then: "The digits are stored least significant first, as a linked list. What changes?" (That is [Add Two Numbers](/practice/add-two-numbers).)

## Solution

### The naive approach

Join the digits into an integer, add one, and split it back into digits. In Python it even works, because Python integers are arbitrary precision. In most languages it does not: 100 digits is far beyond a 64-bit integer (about 19 digits), and in JavaScript precision is lost past `2⁵³`, about 16 digits. It also hides the one piece of logic the problem is testing.

### The insight

Adding one only ever changes a **suffix of trailing 9s** plus the digit just before it. Walking from the right:

- If the digit is less than 9, increment it and stop. Nothing to its left changes.
- If it is 9, it becomes 0 and the carry moves one place left.

The only way the carry survives past the front is if every digit was 9. In that case the answer is `1` followed by `len(digits)` zeros, and you can build it directly rather than inserting at the front of the old array.

### The optimal approach

```python
def plus_one(digits: list[int]) -> list[int]:
    out = digits[:]                      # leave the caller's list alone
    for i in range(len(out) - 1, -1, -1):
        if out[i] < 9:
            out[i] += 1
            return out                   # carry absorbed; done
        out[i] = 0                       # 9 rolls over, carry continues
    # Every digit was 9: 99...9 + 1 = 100...0
    return [1] + out
```

Trace `[2, 0, 9, 9, 0]`: the last digit is `0 < 9`, so it becomes `1` and the function returns immediately. The 9s in the middle never see a carry, which is the point of the hidden test: a solution that scans for 9s instead of following the carry breaks here.

Time: `O(n)` in the worst case (all 9s), but `O(1 + t)` in general, where `t` is the number of trailing 9s. Across random inputs the average `t` is tiny, which is why incrementing a counter is effectively constant time. Space: `O(n)` for the output (or `O(1)` extra if you are allowed to modify the input in place, except in the all-9s case).

### Common mistakes

- Converting through an integer (see above). In Python it passes; in an interview it signals you have not seen what the problem is about.
- Inserting at the front with `digits.insert(0, 1)` inside the loop, or building the result by prepending. `insert(0, …)` is `O(n)` per call; do it at most once, at the end.
- Forgetting the all-9s case, so `[9]` returns `[0]`.

### How to discuss it

Say "adding one changes only the trailing 9s and the digit before them", code the right-to-left loop with an early return, and mention the all-9s case before writing it. The follow-up of adding two arrays is the general carry loop: walk both from the right, `total = a + b + carry`, write `total % 10`, carry `total // 10`, and prepend a final carry if one remains. When digits are stored least-significant-first (a linked list, or a big-integer library's limb array), the carry walks forward instead of backward, which is why real bignum libraries store numbers little-endian.
