---
slug: counting-bits
title: Counting Bits
difficulty: easy
patterns: [bit-manipulation]
lists: [ascend-150]
companies: [amazon, apple, microsoft, adobe]
order: 3
lesson: interview-patterns/combinatorial-patterns/bit-manipulation-pattern
hints:
  - "Popcounting each number from scratch costs O(log i) per number. Can the answer for i be read off an answer you already computed for a smaller number?"
  - "Shifting i right by one drops its lowest bit: i >> 1 is smaller than i and has the same bits except the last. So bits(i) = bits(i >> 1) + (i & 1)."
  - "Equivalently, i & (i - 1) is i with its lowest set bit removed, so bits(i) = bits(i & (i - 1)) + 1. Either recurrence fills the table left to right in O(1) per entry."
signatures:
  python:
    name: count_bits
    starter: |
      def count_bits(n: int) -> list[int]:
          pass
  javascript:
    name: count_bits
    starter: |
      function count_bits(n) {
      }
tests:
  - args: [0]
    expected: [0]
    label: only zero
  - args: [1]
    expected: [0, 1]
  - args: [4]
    expected: [0, 1, 1, 2, 1]
  - args: [7]
    expected: [0, 1, 1, 2, 1, 2, 2, 3]
  - args: [10]
    expected: [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2]
  - args: [16]
    expected: [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4, 1]
    label: ends on a power of two
  - args: [2]
    expected: [0, 1, 1]
    hidden: true
  - args: [20]
    expected: [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4, 1, 2, 2, 3, 2]
    hidden: true
  - args: [31]
    expected: [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4, 1, 2, 2, 3, 2, 3, 3, 4, 2, 3, 3, 4, 3, 4, 4, 5]
    hidden: true
    label: ends just below a power of two
time_limit_ms: 4000
---
Given a non-negative integer `n`, return a list `ans` of length `n + 1` where `ans[i]` is the number of `1` bits in the binary representation of `i`, for every `i` from `0` to `n`.

Aim for `O(n)` total time: a constant amount of work per number, without calling a built-in popcount.

### Examples

| Input | Output | Why |
|---|---|---|
| `n = 4` | `[0, 1, 1, 2, 1]` | `0, 1, 10, 11, 100` in binary |
| `n = 7` | `[0, 1, 1, 2, 1, 2, 2, 3]` | `7 = 111₂` has three set bits |
| `n = 0` | `[0]` | Just the count for `0` |

### Constraints

- `0 ≤ n ≤ 10⁵`

### Follow-up

The interviewer asks: "Explain why the table has the shape it does: why does the second half of every power-of-two block equal the first half plus one?" Then: "Where does this kind of table-driven bit counting show up outside interviews?"

## Solution

### The naive approach

For each `i`, count its bits with a loop (`i & (i - 1)` until zero, or shift-and-test). That costs `O(log i)` per number, `O(n log n)` in total. It is fine in practice for `n = 10⁵`, but the problem is really asking whether you can see the overlap between neighbouring answers.

### The insight

Every number's bit count is one cheap step away from a **smaller** number's bit count, so the answers can be built as a table, each entry from an earlier entry. This is dynamic programming with an `O(1)` transition. Two transitions work:

- **Drop the lowest bit**: `i >> 1` is `i` with its last bit removed. So `bits(i) = bits(i >> 1) + (i & 1)`. Example: `13 = 1101₂`, `13 >> 1 = 6 = 110₂` has 2 bits, and `13 & 1 = 1`, so `bits(13) = 3`.
- **Drop the lowest set bit**: `i & (i - 1)` removes the lowest `1`. So `bits(i) = bits(i & (i - 1)) + 1` for `i > 0`. Example: `12 = 1100₂`, `12 & 11 = 8 = 1000₂` has 1 bit, so `bits(12) = 2`.

In both, the referenced index is strictly smaller than `i`, so a left-to-right fill always finds it ready.

### The optimal approach

```python
def count_bits(n: int) -> list[int]:
    ans = [0] * (n + 1)
    for i in range(1, n + 1):
        ans[i] = ans[i >> 1] + (i & 1)
    return ans
```

Trace up to `n = 7`:

| i | binary | i >> 1 | ans[i >> 1] | i & 1 | ans[i] |
|---|---|---|---|---|---|
| 1 | 1 | 0 | 0 | 1 | 1 |
| 2 | 10 | 1 | 1 | 0 | 1 |
| 3 | 11 | 1 | 1 | 1 | 2 |
| 4 | 100 | 2 | 1 | 0 | 1 |
| 5 | 101 | 2 | 1 | 1 | 2 |
| 6 | 110 | 3 | 2 | 0 | 2 |
| 7 | 111 | 3 | 2 | 1 | 3 |

Time `O(n)`, space `O(n)` for the output (no extra space beyond it).

### Why the table has its shape

Numbers from `2ᵏ` to `2ᵏ⁺¹ - 1` are exactly the numbers from `0` to `2ᵏ - 1` with one extra leading `1` bit. So each block is the whole table so far plus one: `[0]`, then `[1]`, then `[1, 2]`, then `[1, 2, 2, 3]`, and so on. That gives a third recurrence, `bits(i) = bits(i - 2ᵏ) + 1` where `2ᵏ` is the highest power of two not above `i`. It works, but you must track the current power of two, so the shift version is simpler.

### Common mistakes

- Returning `n` counts instead of `n + 1`: the range includes both `0` and `n`.
- Using `i & (i - 1)` for `i = 0` (it gives `0 & -1 = 0`, then `ans[0] = ans[0] + 1` would be wrong). Start the loop at 1.
- Calling `bin(i).count("1")` for every `i`. It passes, but it is the `O(n log n)` answer dressed up, and interviewers ask for the recurrence.

### How to discuss it

Start with "popcount each number" and its `O(n log n)` cost. Then say "`i >> 1` has the same bits as `i` minus the last one, and it is smaller, so its answer is already in the table". That is a one-line DP and interviewers mainly want the observation said aloud. Explain the block structure for the first follow-up. For the second, byte-wide popcount tables were the standard software popcount before CPUs had a `POPCNT` instruction, and the same "reuse the answer for a smaller prefix" idea underlies Fenwick trees, whose `i & -i` step isolates the lowest set bit.
