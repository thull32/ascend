---
slug: multiply-strings
title: Multiply Strings
difficulty: medium
patterns: [math]
lists: [ascend-150]
companies: [meta, amazon, google, microsoft]
order: 2
lesson: interview-patterns/combinatorial-patterns/math-and-geometry
hints:
  - "Do what you do on paper, but notice a shortcut: the digit at index i of num1 times the digit at index j of num2 always contributes to the same position of the product. Which one?"
  - "Counting from the right, digit i and digit j land in position i + j of the product. With left-to-right indices in strings of lengths m and n, the product has at most m + n digits and the pair (i, j) adds into slot i + j + 1, carrying into slot i + j."
  - "Accumulate every digit-pair product into an int array of length m + n, propagate carries, strip leading zeros, and return '0' if nothing is left."
signatures:
  python:
    name: multiply
    starter: |
      def multiply(num1: str, num2: str) -> str:
          # Do not convert the whole strings to integers (no int(num1), no BigInt).
          pass
  javascript:
    name: multiply
    starter: |
      function multiply(num1, num2) {
        // Do not convert the whole strings to numbers (no Number(), no BigInt).
      }
tests:
  - args: ["12", "34"]
    expected: "408"
  - args: ["0", "98765"]
    expected: "0"
    label: zero operand
  - args: ["999", "999"]
    expected: "998001"
    label: carries everywhere
  - args: ["1", "1"]
    expected: "1"
  - args: ["123456789", "987654321"]
    expected: "121932631112635269"
    label: exceeds 2^53
  - args: ["25", "4"]
    expected: "100"
  - args: ["1000", "0"]
    expected: "0"
    hidden: true
    label: zero with other trailing zeros
  - args: ["9", "99"]
    expected: "891"
    hidden: true
  - args: ["50", "20"]
    expected: "1000"
    hidden: true
  - args: ["31415926535897932384", "27182818284590452353"]
    expected: "853973422267356706510386982199967699552"
    hidden: true
    label: forty-digit product
time_limit_ms: 4000
---
You are given two non-negative integers `num1` and `num2` written as decimal strings. Return their product, also as a decimal string, with no leading zeros (the product zero is `"0"`).

You must not convert the whole inputs into built-in integers (`int(num1)`, `Number(num1)`, `BigInt`), because the point is to implement the arithmetic yourself. The inputs can be long enough that a 64-bit integer, let alone a double, cannot hold them.

### Examples

| Input | Output | Why |
|---|---|---|
| `num1 = "12"`, `num2 = "34"` | `"408"` | `12 × 34` |
| `num1 = "999"`, `num2 = "999"` | `"998001"` | Every column carries; the product has `3 + 3` digits |
| `num1 = "0"`, `num2 = "98765"` | `"0"` | Not `"00000"`: strip leading zeros, keep one |

### Constraints

- `1 ≤ len(num1), len(num2) ≤ 200`
- Both contain only digits and have no leading zeros, except the number `"0"` itself.

### Follow-up

The interviewer asks: "Your algorithm is `O(mn)`. What do real big-integer libraries do for very large numbers?" Then: "Why does `123456789 * 987654321` give the wrong answer if you use JavaScript numbers?"

## Solution

### The naive approach

School multiplication taken literally: multiply `num1` by each digit of `num2`, producing a string for each partial product, pad with zeros, and add all the strings with a string-addition helper. It works and is `O(mn)` digit operations, but it creates `n` intermediate strings of length up to `m + n` and needs a correct string adder too. Lots of code, lots of places for off-by-one errors.

### The insight

In the column method, the digit `num1[i]` times the digit `num2[j]` always lands in the same column. If the strings have lengths `m` and `n` and are indexed from the left, the digit `num1[i]` has place value `10^(m-1-i)` and `num2[j]` has `10^(n-1-j)`. Their product has place value `10^(m+n-2-i-j)`.

Allocate an array `pos` of `m + n` slots, where `pos[k]` holds the digit with place value `10^(m+n-1-k)`. Then the product of `num1[i]` and `num2[j]` belongs in slot `i + j + 1`, and any carry goes one slot left, to `i + j`. The product of an `m`-digit and an `n`-digit number has at most `m + n` digits (`99 × 99 = 9801`), so the array is always big enough.

No intermediate strings, no separate adder: one array of small integers.

### The optimal approach

```python
def multiply(num1: str, num2: str) -> str:
    if num1 == "0" or num2 == "0":
        return "0"
    m, n = len(num1), len(num2)
    pos = [0] * (m + n)
    # Walk from the least significant digits so carries move leftwards.
    for i in range(m - 1, -1, -1):
        a = ord(num1[i]) - ord("0")
        for j in range(n - 1, -1, -1):
            b = ord(num2[j]) - ord("0")
            total = a * b + pos[i + j + 1]
            pos[i + j + 1] = total % 10
            pos[i + j] += total // 10
    # At most one leading zero (when the product has m + n - 1 digits).
    digits = "".join(map(str, pos)).lstrip("0")
    return digits or "0"
```

Trace `"12" × "34"`, `pos` has 4 slots:

| i, j | a × b | slot i+j+1 before | total | pos after |
|---|---|---|---|---|
| 1, 1 | 2 × 4 = 8 | 0 | 8 | `[0, 0, 0, 8]` |
| 1, 0 | 2 × 3 = 6 | 0 | 6 | `[0, 0, 6, 8]` |
| 0, 1 | 1 × 4 = 4 | 6 | 10 | `[0, 1, 0, 8]` |
| 0, 0 | 1 × 3 = 3 | 1 | 4 | `[0, 4, 0, 8]` |

Strip the leading zero: `"408"`.

`pos[i + j]` may temporarily exceed 9, but it is always normalised when the loop later processes that slot as an `i + j + 1` position, or, for slot 0, it is at most 9 because the product has at most `m + n` digits. Time `O(mn)`, space `O(m + n)`.

### Common mistakes

- Returning `"0000"` for a zero product. Strip leading zeros and fall back to `"0"`.
- Using `int(num1) * int(num2)` in Python. It passes every test, which is exactly why interviewers forbid it; Python's integers are arbitrary precision, so the "overflow" the problem is about never happens.
- Using JavaScript numbers for intermediate products of whole numbers. Doubles represent integers exactly only up to `2⁵³ ≈ 9 × 10¹⁵`; `123456789 × 987654321 ≈ 1.2 × 10¹⁷` is silently rounded. Single-digit products never get near that limit, which is why the digit-array approach is safe.
- Carrying into `pos[i + j + 1]` instead of `pos[i + j]`, which double-counts.

### How to discuss it

State the paper method, then point out the positional fact ("digit `i` times digit `j` lands in slot `i + j + 1`, carry to `i + j`") and draw the four-slot array for a two-digit example. That removes all string padding from the discussion. For the big-number follow-up: schoolbook `O(mn)` is what libraries use for small sizes; above a threshold they switch to Karatsuba, which replaces four half-size multiplications with three for `O(n^1.585)`, then Toom-Cook, and for enormous numbers FFT-based methods near `O(n log n)`. CPython uses Karatsuba for large ints; GMP goes all the way to FFT. Libraries also use base `2³²` or `10⁹` "limbs" rather than decimal digits, which divides the work by the digit count of the limb. Knowing *that* the fast algorithms exist and roughly where the crossover lies is the senior signal; implementing Karatsuba in an interview is rarely asked.
