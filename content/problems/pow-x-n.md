---
slug: pow-x-n
title: Pow(x, n)
difficulty: medium
patterns: [math]
lists: [ascend-150]
companies: [meta, google, amazon, linkedin]
order: 1
lesson: interview-patterns/combinatorial-patterns/math-and-geometry
hints:
  - "Multiplying x by itself n times is O(n), and n can be about two billion. How can x⁸ be computed with far fewer than 7 multiplications?"
  - "Square repeatedly: x² = x·x, x⁴ = x²·x², x⁸ = x⁴·x⁴. For any n, write it in binary; xⁿ is the product of the squares x^(2^k) for each set bit k."
  - "Handle negative n by computing (1/x)^|n|. In a language with fixed-width integers, -n overflows when n = -2³¹, so take the absolute value into a wider type (Python does not have this problem, but say it)."
signatures:
  python:
    name: my_pow
    starter: |
      def my_pow(x: float, n: int) -> float:
          # Return x ** n rounded to 5 decimal places: round(result, 5).
          # Do not use **, pow() or math.pow for the main computation.
          pass
  javascript:
    name: my_pow
    starter: |
      function my_pow(x, n) {
        // Return x ** n rounded to 5 decimal places:
        //   Math.round(result * 1e5) / 1e5
        // Do not use **, Math.pow for the main computation.
      }
tests:
  - args: [2.0, 10]
    expected: 1024.0
  - args: [2.5, 3]
    expected: 15.625
  - args: [2.0, -3]
    expected: 0.125
    label: negative exponent
  - args: [1.1, 2]
    expected: 1.21
    label: floating-point noise is rounded away
  - args: [0.5, 0]
    expected: 1.0
    label: zero exponent
  - args: [-2.0, 5]
    expected: -32.0
    label: negative base, odd exponent
  - args: [3.0, -2]
    expected: 0.11111
    label: rounding to 5 decimals
  - args: [1.0, 2147483647]
    expected: 1.0
    hidden: true
    label: huge exponent needs O(log n)
  - args: [-1.0, 2147483647]
    expected: -1.0
    hidden: true
  - args: [2.0, -2147483648]
    expected: 0.0
    hidden: true
    label: most negative 32-bit exponent
  - args: [1.00001, 100000]
    expected: 2.71827
    hidden: true
    label: approaches e
  - args: [-2.0, 4]
    expected: 16.0
    hidden: true
time_limit_ms: 4000
---
Implement `my_pow(x, n)`, which computes `x` raised to the integer power `n`, without using the language's built-in power operator or function (`**`, `pow`, `math.pow`, `Math.pow`) for the main computation.

Floating-point multiplication accumulates tiny errors (`1.1 × 1.1` is `1.2100000000000002` in IEEE 754 doubles), so **return the result rounded to 5 decimal places**: `round(result, 5)` in Python, `Math.round(result * 1e5) / 1e5` in JavaScript. The tests are chosen so that this rounding is never on a knife edge.

### Examples

| Input | Output | Why |
|---|---|---|
| `x = 2.0`, `n = 10` | `1024.0` | `2¹⁰` |
| `x = 2.0`, `n = -3` | `0.125` | `2⁻³ = 1 / 8` |
| `x = 3.0`, `n = -2` | `0.11111` | `1 / 9 = 0.111111…`, rounded to 5 places |

### Constraints

- `-100.0 < x < 100.0`
- `-2³¹ ≤ n ≤ 2³¹ - 1`
- If `x` is `0`, then `n > 0`.
- The true result lies within `[-10⁴, 10⁴]`, or underflows to effectively zero.

### Follow-up

The interviewer asks: "Compute `xⁿ mod m` for integers, where `n` has 18 digits." Then: "Your recursive version: what is its stack depth, and would you ship it?"

## Solution

### The naive approach

Multiply `x` by itself `|n|` times, then invert if `n` is negative. `O(|n|)` time. With `n = 2³¹ - 1` that is about two billion multiplications: several seconds in a compiled language and minutes in Python. The hidden tests with `n = 2147483647` exist precisely to reject this.

### The insight

Squaring doubles the exponent with one multiplication: from `x` you get `x²`, `x⁴`, `x⁸`, … `x^(2^k)` in `k` multiplications. Any `n` is a sum of powers of two (its binary representation), so `xⁿ` is the product of the squares that correspond to set bits:

$$ x^{13} = x^{8} \cdot x^{4} \cdot x^{1} \quad \text{because } 13 = 1101_2 $$

That needs about `log₂ n` squarings plus at most `log₂ n` extra multiplications: 62 operations instead of two billion for the largest `n`. This is **exponentiation by squaring** (binary exponentiation), and it is one of the most reused ideas in computing: modular exponentiation in RSA and Diffie-Hellman, matrix powers for linear recurrences, and doubling tricks in algorithms like binary lifting.

### The optimal approach

The iterative form reads the bits of `n` from least significant to most, keeping `base = x^(2^k)` for the current bit:

```python
def my_pow(x: float, n: int) -> float:
    if n < 0:
        # In C or Java, -n overflows for n = -2**31; widen first. Python ints
        # are arbitrary precision, so this is safe here.
        x, n = 1.0 / x, -n
    result = 1.0
    base = x
    while n > 0:
        if n & 1:            # this bit of n is set: include base
            result *= base
        base *= base         # x^(2^k) -> x^(2^(k+1))
        n >>= 1
    return round(result, 5)
```

Trace `x = 2.5`, `n = 3` (`11₂`):

| n (binary) | bit set? | result | base after squaring |
|---|---|---|---|
| 11 | yes | 2.5 | 6.25 |
| 1 | yes | 15.625 | 39.0625 |
| 0 | loop ends | 15.625 | |

Time `O(log |n|)`, space `O(1)`.

The recursive form, `half = pow(x, n // 2)` then `half * half` (times `x` if `n` is odd), is equally fast and often easier to explain. Its recursion depth is `log₂ n`, about 31, so stack depth is not a real concern; the iterative version is still the one to ship because it has no call overhead and no depth question at all.

### Floating-point and 32-bit details

- **The `-2³¹` trap.** In a language with 32-bit `int`, `n = -2147483648` has no positive counterpart: `-n` overflows back to `-2147483648`, and the loop never runs (or runs forever, depending on how you wrote it). Convert to a 64-bit `long` before negating. Python does not overflow here, but naming the bug is part of a strong answer.
- **JavaScript's bitwise operators are 32-bit.** Negating `-2³¹` is fine in JavaScript (numbers are doubles), but `n & 1` and `n >>= 1` convert `2147483648` to the signed 32-bit value `-2147483648`, so after one iteration `n` is negative, the `while (n > 0)` loop stops, and the function returns `1` instead of `0`. Use `n % 2` and `n = Math.floor(n / 2)` for the exponent in JavaScript.
- **Rounding.** The loop's result for `x = 1.1`, `n = 2` is `1.2100000000000002`. The error is in the last bit or two of the double, far below the 5th decimal, so rounding at the end is safe. Rounding *inside* the loop would compound errors instead.
- **Underflow.** `2⁻²¹⁴⁷⁴⁸³⁶⁴⁸` is far below the smallest positive double (around `5 × 10⁻³²⁴`), so the repeated squaring of `0.5` reaches `0.0` and the answer is `0`.

### Common mistakes

- Recursing as `pow(x, n - 1) * x`. That is still `O(n)` and, recursively, overflows the stack long before `n` reaches two billion.
- Computing `pow(x, n // 2) * pow(x, n // 2)`: two recursive calls per level makes it `O(n)` again. Compute the half once and square it.
- Negating `n` in a 32-bit type (see above), or using `n // 2` with a negative `n` in Python, where floor division rounds toward negative infinity (`-3 // 2 == -2`), silently computing the wrong power.

### How to discuss it

Write out `x¹³ = x⁸ · x⁴ · x¹` next to `13 = 1101₂`; that picture explains the algorithm faster than any prose. Then code the iterative loop and call out the three edge cases unprompted: `n = 0`, negative `n` (and the `-2³¹` overflow), and floating-point rounding. For the modular follow-up, the loop is identical with `% m` after each multiplication; Python's built-in `pow(x, n, m)` does exactly this, and an 18-digit `n` takes about 60 iterations. Mention that the same squaring trick applied to 2 × 2 matrices computes the `n`-th Fibonacci number in `O(log n)`.
