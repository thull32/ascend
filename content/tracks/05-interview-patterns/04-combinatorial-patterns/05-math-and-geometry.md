---
slug: math-and-geometry
title: "Math and geometry: digit arithmetic, fast powers, exact geometry and simulation"
description: Recognise the four shapes behind interview math problems and the statements that only look like them, then see Pow(x, n), Multiply Strings, Detect Squares and Spiral Matrix II traced step by step, with the float, JavaScript-number and Python-integer traps measured.
minutes: 45
difficulty: medium
tags: [math, geometry, fast-exponentiation, simulation, pattern:math]
problems: [pow-x-n, multiply-strings, detect-squares, plus-one, spiral-matrix-ii, reverse-integer, rotate-image, happy-number, sqrt-x]
---
"Implement `pow(x, n)`." "Multiply two numbers given as strings." "Count the squares these points can form." "Fill the matrix in spiral order." These problems have no data-structure trick and no search space to prune. They test whether you can turn arithmetic or geometry you learned at school into code that is exact, does not overflow and has no off-by-one errors, under time pressure. Candidates rarely fail them for lack of the idea. They fail on the details: a negative exponent, a carry that ripples one place too far, a floating-point equality, a JavaScript `%` that returns −1, a spiral that writes over its own corner.

The pattern is to identify which of four shapes you are looking at and use the template whose invariant rules those details out: **digit arithmetic** with an explicit carry, **repeated squaring** over the bits of an exponent, **integer-only geometry** with squared distances, cross products and points as hash keys, and **simulation** with direction vectors and a blocked-cell test. The mathematics lives in [number theory essentials](/learn/foundations/math-for-engineers/number-theory-essentials), [modular arithmetic](/learn/foundations/math-for-engineers/modular-arithmetic-and-hashing-math) and [sweep line and geometry](/learn/algorithms/technique-mastery/sweep-line-and-geometry). This lesson is about recognising the shape from the statement and producing it correctly in forty minutes, in both languages.

## The signal

- **Numbers arrive as strings or digit arrays**, "may have up to 200 digits", or "do not convert to an integer": digit arithmetic ([Plus One](/practice/plus-one), [Multiply Strings](/practice/multiply-strings), adding binary strings or linked-list numbers).
- **An exponent up to 2³¹ or 10¹⁸**: "compute `x^n`", "`a^b mod m`", "the n-th Fibonacci number for huge n": repeated squaring ([Pow(x, n)](/practice/pow-x-n)).
- **Points, coordinates, rectangles, lines, "axis-aligned", "count the shapes"**: integer geometry, usually with a hash map of points ([Detect Squares](/practice/detect-squares)).
- **"Fill in spiral order", "simulate the robot", "rotate", "the next generation"**: simulation with direction vectors ([Spiral Matrix II](/practice/spiral-matrix-ii)).
- **"Return 0 if it overflows 32 bits"**, "the answer modulo 10⁹ + 7": the arithmetic is easy and the width is the question ([Reverse Integer](/practice/reverse-integer)).

What rules it out:

- **An optimum over choices.** "Minimum coins", "maximum points collected" involve numbers but are [DP](/learn/interview-patterns/combinatorial-patterns/dp-patterns) or [greedy](/learn/interview-patterns/combinatorial-patterns/greedy-pattern).
- **A built-in that trivialises the question.** `str(int(a) * int(b))` solves Multiply Strings and `x ** n` solves Pow. Say you know they exist, then ask whether the interviewer wants the algorithm. They almost always do.
- **Real-valued geometry** (float input, angles, circles) needs tolerances and is rare in interviews. When coordinates are integers, which they nearly always are, never leave the integers.

### Near misses

| Statement | Looks like | Actually | The tell |
|---|---|---|---|
| "`a^b mod m`, `b` up to 10¹⁸" | a loop of `b` multiplications | repeated squaring, reducing after every product | `b` is far beyond any loop budget |
| "Count the primes below 5 × 10⁶" | trial division per number | sieve of Eratosthenes, `O(n log log n)` | many numbers, one bound |
| "Most points on one line" | slope as a float | slope as a reduced fraction `(dy/g, dx/g)` with one sign convention | floats merge distinct slopes |
| "Integer square root of `x`" | `int(math.sqrt(x))` | binary search on `r * r <= x`, Newton, or `math.isqrt` | doubles are exact only to 2⁵³ |
| "Does repeatedly summing squared digits reach 1?" ([Happy Number](/practice/happy-number)) | arithmetic until it stops | cycle detection with a set or Floyd's two pointers | values stay bounded, so the sequence must cycle |
| "Rotate the image 90° in place" ([Rotate Image](/practice/rotate-image)) | index arithmetic per cell | transpose, then reverse each row | a composition of two involutions |
| "Reverse the digits of a 32-bit int" | digit arithmetic | digit arithmetic plus an overflow check *before* the multiply | "return 0 if it overflows" |
| "Largest sum of points the robot can collect" | simulation | DP over the grid | a maximum over paths, not one path |

### Questions that change the template

Four clarifying questions, each of which changes the code you write:

- **"Can inputs be negative?"** A negative exponent adds the inversion; negative coordinates make JavaScript's `%` and `Math.trunc` differ from Python's `%` and `//`.
- **"What is the integer width?"** "32-bit signed" means an overflow check before every multiply by 10; "fits in 64 bits" means JavaScript needs `BigInt` for products.
- **"Is the answer taken modulo something?"** Then reduce after every product, never only at the end, or intermediate values grow without bound.
- **"May I use the built-in big integers or `pow`?"** A yes turns Multiply Strings into one line; a no means the digit template, and asking shows you know the difference.

## The templates

Four small templates, one per shape. Each is short because its invariant does the work.

```python
def add_digits(a, b):
    """Digit arithmetic: least significant first, explicit carry, emit the final carry."""
    i, j, carry, out = len(a) - 1, len(b) - 1, 0, []
    while i >= 0 or j >= 0 or carry:           # 'or carry' emits the last carry
        total = carry
        if i >= 0:
            total += a[i]; i -= 1
        if j >= 0:
            total += b[j]; j -= 1
        out.append(total % 10)
        carry = total // 10                    # at most 1 when adding two digits
    return out[::-1]


def power(x, n):
    """Repeated squaring. Invariant: result * x**n equals the original x**n."""
    if n < 0:
        x, n = 1 / x, -n
    result = 1
    while n:
        if n & 1:
            result *= x                        # this bit of n is set: fold the current power in
        x *= x                                 # x, x^2, x^4, x^8, ...
        n >>= 1
    return result


def pow_mod(base, exp, mod):
    """Same loop, reduced after every product so numbers never exceed mod**2."""
    result, base = 1 % mod, base % mod         # 1 % mod: with mod == 1 everything is 0
    while exp:
        if exp & 1:
            result = result * base % mod
        base = base * base % mod
        exp >>= 1
    return result


def cross(o, a, b):
    """Integer geometry: > 0 left turn, < 0 right turn, 0 collinear. Exact, no floats."""
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def dist2(p, q):
    return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2     # compare squared lengths, never sqrt


DIRS = [(0, 1), (1, 0), (0, -1), (-1, 0)]              # right, down, left, up

def spiral_fill(n):
    """Simulation: keep going until blocked, then turn clockwise."""
    grid = [[0] * n for _ in range(n)]
    r = c = d = 0
    for k in range(1, n * n + 1):
        grid[r][c] = k
        nr, nc = r + DIRS[d][0], c + DIRS[d][1]
        if not (0 <= nr < n and 0 <= nc < n) or grid[nr][nc]:
            d = (d + 1) % 4                             # blocked: turn before moving
            nr, nc = r + DIRS[d][0], c + DIRS[d][1]
        r, c = nr, nc
    return grid
```

```javascript
function addDigits(a, b) {
  let i = a.length - 1, j = b.length - 1, carry = 0;
  const out = [];
  while (i >= 0 || j >= 0 || carry) {
    let total = carry;
    if (i >= 0) total += a[i--];
    if (j >= 0) total += b[j--];
    out.push(total % 10);
    carry = Math.floor(total / 10);
  }
  return out.reverse();
}

function power(x, n) {
  if (n < 0) { x = 1 / x; n = -n; }
  let result = 1;
  while (n > 0) {
    if (n % 2 === 1) result *= x;      // % and Math.floor, not & and >>: see below
    x *= x;
    n = Math.floor(n / 2);
  }
  return result;
}

function powMod(base, exp, mod) {       // BigInt: residue products reach 10^18, past 2^53
  const m = BigInt(mod);
  let b = BigInt(base) % m, e = BigInt(exp), r = 1n % m;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return Number(r);
}

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const dist2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;

const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];      // right, down, left, up
function spiralFill(n) {
  const grid = Array.from({ length: n }, () => new Array(n).fill(0));
  let r = 0, c = 0, d = 0;
  for (let k = 1; k <= n * n; k++) {
    grid[r][c] = k;
    let nr = r + DIRS[d][0], nc = c + DIRS[d][1];
    if (nr < 0 || nr >= n || nc < 0 || nc >= n || grid[nr][nc] !== 0) {
      d = (d + 1) % 4;                                // clockwise; never (d - 1) % 4 in JS
      nr = r + DIRS[d][0]; nc = c + DIRS[d][1];
    }
    r = nr; c = nc;
  }
  return grid;
}
```

The JavaScript `power` avoids `n >>= 1` deliberately. Bitwise operators first convert their operand to a 32-bit signed integer, so `2³¹ >> 1` is −1,073,741,824 and the loop stops at once: with `>>`, `power(0.5, 2 ** 31)` returned 1 in Node 24 instead of 0. `n % 2` and `Math.floor(n / 2)` are exact for every integer up to 2⁵³.

The exponent's bits drive repeated squaring:

```viz
{"type": "bits", "algorithm": "count-bits", "values": [13], "title": "The set bits of n = 13 = 1101", "caption": "The visualiser counts set bits by clearing the lowest one each step (13, 12, 8, 0). Each set bit is one multiplication into the result in pow(x, 13); the four bit positions are the four loop iterations, each squaring x."}
```

```viz
{"type": "bits", "algorithm": "shift", "values": [13, -13], "title": "Halving the exponent with a right shift", "caption": "13 >> 1 = 6 drops the bit the loop has consumed. For -13, an arithmetic shift gives -7, which is floor(-13 / 2), while a logical shift gives a large positive number: the reason the JavaScript template divides instead of shifting."}
```

## Why each template is correct

**Digit arithmetic.** Invariant: after `k` iterations, `out` holds the correct lowest `k` digits of the sum and `carry` holds everything above them divided by 10ᵏ. Adding two digits and a carry gives at most 9 + 9 + 1 = 19, so the carry is 0 or 1; the loop runs while either input has digits *or* a carry remains, which emits the final carry of `999 + 1`.

**Repeated squaring.** Invariant: `result · xⁿ` equals the original `xⁿ`. If `n` is odd, moving one factor of `x` into `result` preserves it; squaring `x` while halving `n` preserves it. When `n` is 0, `result` is the answer, after `⌊log₂ n⌋ + 1` iterations. The same proof holds for any associative multiplication: residues modulo `m`, 2 × 2 matrices, permutations. `% mod` after each product keeps every intermediate below `mod²`.

**Multiplying `m`-digit by `n`-digit numbers.** Both are below 10ᵐ and 10ⁿ, so the product is below 10ᵐ⁺ⁿ and has at most `m + n` digits: an array of `m + n` slots never overflows at index 0.

**Cross product.** `cross(o, a, b)` is the z-component of `(a − o) × (b − o)`, which equals `|oa| · |ob| · sin θ` for the angle θ from `oa` to `ob`. Its sign is the sign of `sin θ`: positive for a counter-clockwise turn, negative for clockwise, zero for collinear. With integer inputs it is an exact integer, so the zero test is exact.

**Simulation.** Invariant: the cells written so far are exactly the first `k` cells of the spiral, and the unwritten cells form a rectangle whose next cell is straight ahead or, when that is blocked, one clockwise turn away. The test must happen before the move; turning after stepping into a filled cell has already overwritten it.

## Worked problems

### Pow(x, n)

[Pow(x, n)](/practice/pow-x-n): `x` to an integer power `n`, where `|n|` can reach 2³¹. The naive loop does up to 2 billion multiplications; repeated squaring does 32. Trace `x = 2`, `n = 13`:

| `n` in binary | low bit | `result` after | `x` after squaring |
|---|---|---|---|
| 1101 | 1 | 1 · 2 = 2 | 4 |
| 110 | 0 | 2 | 16 |
| 11 | 1 | 2 · 16 = 32 | 256 |
| 1 | 1 | 32 · 256 = 8192 | 65536 |
| 0 | stop | | |

8192 = 2¹³, built from `2¹ · 2⁴ · 2⁸`, one factor per set bit of `1101`. The recursive form, `half = power(x, n // 2)` then `half * half` (times `x` if `n` is odd), has the same `O(log n)` cost and a recursion depth of about 32, which is safe; recomputing `power(x, n // 2)` twice instead of storing it turns the recursion back into `O(n)` multiplications. Three edge cases decide a strong pass:

- **Negative `n`.** Invert once. In Java and C++, `n = -n` overflows at −2³¹ because +2³¹ does not fit; widen to 64 bits first.
- **`x = 0` with `n < 0`** divides by zero. State an assumption or ask.
- **`0⁰`** is conventionally 1, which the template returns.

### Multiply Strings

[Multiply Strings](/practice/multiply-strings): the school method with a landing slot for every carry. Digit `i` of `a` times digit `j` of `b` lands at `pos[i + j + 1]`, its carry at `pos[i + j]`.

```python
def multiply(a, b):
    m, n = len(a), len(b)
    pos = [0] * (m + n)                        # the product has at most m + n digits
    for i in range(m - 1, -1, -1):
        for j in range(n - 1, -1, -1):
            mul = (ord(a[i]) - 48) * (ord(b[j]) - 48)
            total = mul + pos[i + j + 1]
            pos[i + j + 1] = total % 10
            pos[i + j] += total // 10          # may exceed 9 until a later product normalises it
    s = "".join(map(str, pos)).lstrip("0")
    return s or "0"                            # "0" * "789" has no non-zero digit
```

Trace `"123" × "45"`, `pos` starting `[0, 0, 0, 0, 0]`:

| `a[i]` | `b[j]` | product | lands at | `pos` after |
|---|---|---|---|---|
| 3 (i=2) | 5 (j=1) | 15 | pos[4] = 5, carry 1 to pos[3] | `[0, 0, 0, 1, 5]` |
| 3 | 4 (j=0) | 12 | 12 + 1 = 13: pos[3] = 3, carry to pos[2] | `[0, 0, 1, 3, 5]` |
| 2 (i=1) | 5 | 10 | 10 + 3 = 13: pos[3] = 3, carry to pos[2] | `[0, 0, 2, 3, 5]` |
| 2 | 4 | 8 | 8 + 2 = 10: pos[2] = 0, carry to pos[1] | `[0, 1, 0, 3, 5]` |
| 1 (i=0) | 5 | 5 | 5 + 0 = 5: pos[2] = 5 | `[0, 1, 5, 3, 5]` |
| 1 | 4 | 4 | 4 + 1 = 5: pos[1] = 5 | `[0, 5, 5, 3, 5]` |

Strip the leading zero: `"5535"` = 123 × 45. Iterating from the right lets every carry land in a slot that a more significant product will visit later, so one pass normalises everything except slot 0, which cannot exceed 9. An equally correct variant accumulates the raw products `pos[i + j + 1] += a[i] · b[j]` first (each slot holds at most `81 · min(m, n)`) and then runs a single carry pass from the right; it does fewer divisions and is the shape vectorised big-number code uses. `O(m · n)`; Karatsuba's `O(n^1.585)` and CPython's own switch to it for large operands are in [classic divide and conquer](/learn/algorithms/divide-and-conquer/classic-divide-and-conquer).

### Detect Squares

[Detect Squares](/practice/detect-squares): `add(point)` (duplicates count separately) and `count(query)`, the number of ways three stored points complete an axis-aligned square of positive area with the query. The diagonal corner `(x, y)` fixes the square when `|x − qx| == |y − qy| != 0`; the other corners are `(qx, y)` and `(x, qy)`, and the counts multiply.

```python
from collections import Counter

class DetectSquares:
    def __init__(self):
        self.cnt = Counter()

    def add(self, point):
        self.cnt[tuple(point)] += 1            # lists are unhashable; tuples are keys

    def count(self, point):
        qx, qy = point
        total = 0
        for (x, y), c in self.cnt.items():
            if abs(x - qx) != abs(y - qy) or x == qx:
                continue                       # not a diagonal, or zero area
            total += c * self.cnt[(qx, y)] * self.cnt[(x, qy)]
        return total
```

| operation | `cnt` after | diagonal candidates checked | returns |
|---|---|---|---|
| add (3, 10) | {(3,10): 1} | | |
| add (11, 2) | {(3,10): 1, (11,2): 1} | | |
| add (3, 2) | {(3,10): 1, (11,2): 1, (3,2): 1} | | |
| count (11, 10) | unchanged | (3,10): dx 8, dy 0, no; (11,2): same column, no; (3,2): 8 and 8, yes: 1 · cnt(11,2) · cnt(3,10) = 1 | **1** |
| count (14, 8) | unchanged | dx, dy = (11, 2), (3, 6), (11, 6): none equal | **0** |
| add (11, 2) | (11,2): 2 | | |
| count (11, 10) | unchanged | (3,2): 1 · 2 · 1 | **2** |

The second copy of `(11, 2)` is a second, distinct corner, so the answer doubles. Iterating diagonal corners is what makes `count` linear: a square with one fixed corner is determined by its opposite corner, so there is one candidate per stored point instead of one per triple of points, `O(P)` rather than `O(P³)`. Checking only `|dx| == |dy|` and `x != qx` is the whole geometry; everything else is counting. `self.cnt[(qx, y)]` on a `Counter` returns 0 for a missing key *without inserting it*; a `defaultdict` would insert, and `count` would grow the map on every call.

### Spiral Matrix II

[Spiral Matrix II](/practice/spiral-matrix-ii): fill `n × n` with `1..n²` in spiral order using `spiral_fill`. Trace `n = 3`; "next" is the cell the walk moves to:

| k | cell written | straight ahead | turn? | direction after | next |
|---|---|---|---|---|---|
| 1 | (0,0) | (0,1) free | | right | (0,1) |
| 2 | (0,1) | (0,2) free | | right | (0,2) |
| 3 | (0,2) | (0,3) out of range | yes | down | (1,2) |
| 4 | (1,2) | (2,2) free | | down | (2,2) |
| 5 | (2,2) | (3,2) out of range | yes | left | (2,1) |
| 6 | (2,1) | (2,0) free | | left | (2,0) |
| 7 | (2,0) | (2,−1) out of range | yes | up | (1,0) |
| 8 | (1,0) | (0,0) filled | yes | right | (1,1) |
| 9 | (1,1) | (1,2) filled | yes | down | loop ends |

Result `[[1, 2, 3], [8, 9, 4], [7, 6, 5]]`. Row 8 is the one boundary-shrinking code gets wrong: the blocker is a filled cell, not the edge, and the "cell is non-zero" test catches it without tracking four boundaries. The boundary version is in [matrix traversal](/learn/interview-patterns/array-patterns/matrix-traversal).

## Variations

| Variant | Change to the template | Why it stays correct |
|---|---|---|
| Plus One | digit loop from the end with an early exit when a digit is below 9 | the carry stops at the first non-9; all 9s become `[1, 0, …, 0]` |
| [Sqrt(x)](/practice/sqrt-x) | binary search the largest `r` with `r * r <= x`, or Newton `r = (r + x // r) // 2` | the predicate is monotone; Newton from above decreases to the floor |
| Reverse Integer | check `r > (LIMIT − d) // 10` before `r = r * 10 + d` | the test happens before the operation that would overflow |
| Max points on a line | slope key `(dy/g, dx/g)`, sign normalised so `dx > 0`, or `dx == 0, dy == 1` | equal rationals have one reduced form |
| Rectangle overlap | width `max(0, min(r1, r2) − max(l1, l2))`, same for height | intersection of intervals, per axis |
| Rotate 90° | point `(x, y) → (−y, x)`; matrix: transpose, then reverse rows | the two reflections compose to a rotation |
| Happy Number | iterate the digit-square map with a seen set or Floyd | values below 1,000 map below 1,000, so the walk cycles |
| Modular inverse | `pow(a, p − 2, p)` for prime `p`, or `pow(a, -1, m)` in Python 3.8+ | Fermat's little theorem; `a` must be coprime to `m` |
| n-th Fibonacci, `n` up to 10¹⁸ | repeated squaring of `[[1, 1], [1, 0]]` with `% m` | matrix multiplication is associative |

## Complexity, derived

| Problem | Operation count | Time | Extra space |
|---|---|---|---|
| Pow(x, n) | `⌊log₂ n⌋ + 1` squarings, one multiply per set bit | `O(log n)` | `O(1)` |
| `a^b mod m` | the same, each on numbers below `m²` | `O(log b)` word operations if `m` fits a word | `O(1)` |
| Multiply Strings | `m · n` digit products | `O(m · n)` | `O(m + n)` |
| Detect Squares `count` | one check per distinct point | `O(P)`; `O(column size)` indexed | `O(P)` |
| Spiral Matrix II | one write and one test per cell | `O(n²)` | the output |
| Integer square root | `log₂ x` probes, or `O(log log x)` Newton steps once close | `O(log x)` | `O(1)` |

## Under the hood

### Floating point

A double carries 53 significant bits, so `0.1 + 0.2` is `0.30000000000000004` and every integer above 2⁵³ = 9,007,199,254,740,992 has a neighbour it cannot be told apart from. [Numbers, strings and Unicode](/learn/foundations/how-code-runs/numbers-strings-unicode) has the bit layout; three consequences decide interview answers.

Repeated squaring is fast but not accurate on floats. A rounding error of relative size ε in an early square is itself raised to every remaining power, so the final relative error can grow in proportion to `n · ε`. Measured in CPython 3.14 on `1.0000001` to the power 2³¹: the template was off by 1.2 × 10⁻⁸ relative, `x ** n` and `math.pow` by 1.1 × 10⁻¹⁷, and Node 24's `Math.pow` matched the library value. Judges for Pow(x, n) compare at far coarser precision (this platform's version rounds answers to five decimal places), so the template passes; production code calls the library, which evaluates `exp(n · log x)` with extra internal precision.

Floats merge slopes that are not equal. The points `(0, 0)`, `(10⁸, 10⁸ + 1)` and `(10⁸ + 1, 10⁸ + 2)` give identical float slopes, 1.00000001, but the cross product is −1: not collinear.

`int(math.sqrt(x))` is wrong past 2⁵³: for `x = (2⁵³ + 1)²` it returned the wrong root while `math.isqrt` returned the right one. `math.isqrt` also ran 10⁵ square roots of 31-bit integers in 4 ms against 154 ms for a hand-written binary search.

### JavaScript numbers

Every JavaScript number is a double, so integers are exact only up to `Number.MAX_SAFE_INTEGER` = 2⁵³ − 1, and the operators carry two traps that Python does not have, all run here in Node 24:

- **`%` truncates toward zero.** `(-1) % 4` is −1 (Python gives 3), so turning counter-clockwise with `(d - 1) % 4` indexes `DIRS[-1]`, which is `undefined`. Use `(d + 3) % 4` or `((x % m) + m) % m`. Likewise `Math.floor(-7 / 2)` is −4 but `Math.trunc(-7 / 2)` and `(-7 / 2) | 0` are −3.
- **Products of residues exceed 2⁵³.** `999999999 * 999999998 % 1000000007` gives 70; the exact answer is 72. Over 100,000 random `a^b mod (10⁹ + 7)` computations with exponents below 10¹⁵, the plain-`Number` loop was wrong on every one. A `BigInt` loop took 89–118 ms for all 100,000 and a `Number` loop that splits the multiplier into 16-bit halves took 183 ms, both exact.

Additions of two residues stay below 2³¹ and are safe; multiplication is where exactness ends. The same bound bites geometry: coordinates near 10⁹ make cross-product terms near 10¹⁸, and the collinearity test for `(0, 0)`, `(10⁹, 10⁹ − 1)`, `(10⁹ − 1, 10⁹ − 2)` returned 0 with numbers and −1 with `BigInt`.

### Python integers

Python integers are arbitrary precision, stored as arrays of 30-bit digits, so nothing overflows and the problem becomes cost. Multiplying two 1,000-digit integers took 5.2 µs in CPython 3.14; the digit-by-digit Multiply Strings loop took 83 ms on the same inputs, and `str(int(a) * int(b))` including both conversions took 63 µs. The built-in three-argument `pow(b, e, m)` ran 100,000 modular powers in 140 ms against 310 ms for the hand loop.

Converting between `int` and decimal `str` is limited to 4,300 digits by default since Python 3.11 and the September 2022 security releases 3.7.14, 3.8.14, 3.9.14 and 3.10.7, because the conversion is quadratic and was a denial-of-service vector (CVE-2020-10735). `int("9" * 5000)` and `str(10 ** 5000)` both raised `ValueError: Exceeds the limit (4300 digits) for integer string conversion`. `sys.set_int_max_str_digits(0)` lifts it; a solution that stays in digit arrays never meets it.

## Failure modes

**Symptom: a spiral or robot simulation crashes in JavaScript with "Cannot read properties of undefined" on the first left turn.** Diagnosis: `(d - 1) % 4` is −1 when `d` is 0. Fix: `(d + 3) % 4`.

**Symptom: Max Points on a Line reports three collinear points where there are two.** Diagnosis: slopes stored as floats; `(10⁸ + 1)/10⁸` and `(10⁸ + 2)/(10⁸ + 1)` round to the same double. Fix: reduced-fraction keys, or compare with the integer cross product.

**Symptom: a modular answer is right for small inputs and wrong for large ones in JavaScript only.** Diagnosis: `a * b % MOD` with `a, b` near 10⁹ rounds before the remainder. Fix: `BigInt`, or split the multiplier so every partial product stays below 2⁵³.

**Symptom: an orientation test calls two different turns collinear when coordinates reach 10⁹.** Diagnosis: cross-product terms near 10¹⁸ lose their low bits in a double. Fix: `BigInt`, or state the coordinate bound that keeps products under 2⁵³ (about 6.7 × 10⁷ per coordinate difference).

**Symptom: a big-number solution raises `ValueError` on a hidden test in Python 3.11+.** Diagnosis: `int()` or `str()` on more than 4,300 digits. Fix: work in digit arrays, or `sys.set_int_max_str_digits(0)` when the input is trusted.

**Symptom: Java `pow(x, n)` fails only for `n = -2147483648`.** Diagnosis: `-n` overflows back to −2³¹. Fix: copy `n` into a `long` before negating.

**Symptom: the spiral's last cells are wrong or one value is overwritten.** Diagnosis: the walk moves, then checks. Fix: compute the next cell, turn if it is blocked, then move.

## Trade-offs

| Approach | Exactness | Speed | Memory | When |
|---|---|---|---|---|
| Built-in big integers (`int`, `BigInt`) | exact | fastest in Python; `BigInt` fine in Node | grows with the value | when the interviewer allows them |
| Digit arrays by hand | exact | `O(m · n)` Python-level work | `O(m + n)` | when the question is the algorithm |
| Doubles | 53 bits, rounding | fastest | fixed | real-valued input with a stated tolerance |
| Split multiplication in `Number` | exact below 2⁵³ | 1.5–2× the `BigInt` loop here | fixed | JavaScript without `BigInt` |
| Reduced fractions for slopes | exact | one gcd per pair | two ints per key | any equality on ratios |

## Interviewer follow-ups

**"The answer must be returned modulo 10⁹ + 7, and you are writing JavaScript."** Model answer: sums of two residues are safe, but a product of two residues reaches 10¹⁸, so multiply with `BigInt` (or split one factor into 16-bit halves) and reduce after every operation. Common wrong answer: reducing only at the end, or trusting `a * b % M` because it runs without an error.

**"`count` is called far more often than `add`."** Model answer: index points by column. The query's vertical side shares `qx`, so iterate the points in column `qx`, take `d = y − qy`, and check the squares on both sides: `O(points in the column)` per query. Measured in CPython with 20,000 random points and 2,000 queries: 11 ms indexed against 1,815 ms scanning every point. Common wrong answer: precomputing every square at `add` time, which is `O(P)` per add and unbounded memory.

**"Make Detect Squares safe for a read-heavy service."** Model answer: `add` is a read-modify-write on up to two counters and `count` reads many, so one lock makes a query see a consistent snapshot; a read-write lock lets queries run in parallel; per-counter atomics (a concurrent map of `LongAdder`s in Java) scale writes but let a query observe half of a concurrent `add`, which is acceptable only if the product says so. Common wrong answer: "`Counter` updates are atomic", which the free-threaded CPython build and every other runtime do not promise for `+=`.

**"The coordinates are floats."** Model answer: exact equality is gone; if the input has a fixed number of decimal places, scale to integers and stay exact; otherwise compare with a tolerance relative to the magnitude, and name robust orientation predicates as the production answer. Common wrong answer: `abs(a - b) < 1e-9` regardless of scale, which is too strict at 10⁹ and too loose at 10⁻⁹.

**"Compute the n-th Fibonacci number modulo 10⁹ + 7 for `n = 10¹⁸`."** Model answer: `[[1, 1], [1, 0]]ⁿ` holds `F(n)`; repeated squaring needs about 60 squarings of a 2 × 2 matrix, eight multiplications each, reduced mod `m`. Common wrong answer: the `O(n)` loop, which is 10¹⁸ steps.

## What mid-level engineers get wrong

- **Comparing floats with `==`** for lengths, slopes or square roots. Consequence: a hidden test with large coordinates merges two slopes or rejects a valid square.
- **Using `>>` and `&` on large JavaScript numbers.** Consequence: an exponent of 2³¹ becomes negative and Pow returns 1.
- **Trusting JavaScript `%` on negatives or on products of residues near 10⁹.** Consequence: a crash on the first left turn, or modular answers that are wrong with no error.
- **Checking overflow after the operation.** Consequence: in a fixed-width language the check reads an already-wrapped value and passes.
- **Forgetting the final carry, or stripping `"0"` down to `""`.** Consequence: `999 + 1` returns 000 and `"0" × "5"` returns an empty string.
- **Scanning every stored point per query in Detect Squares** without offering the column index. Consequence: the frequency follow-up finds no answer, and the solution is 165 times slower on the measured workload.
- **Using the built-in silently, or refusing to mention it.** Consequence: either the interviewer thinks you dodged the question or you spend twenty minutes on a solved problem; ask which they want.

## Exercises

```exercise
id: valid-square
title: Do four points form a square?
prompt: |
  Given four points in the plane with integer coordinates, each as
  `[x, y]` and in no particular order, return `true` if they are the
  corners of a square with positive area. The square may be rotated; it
  need not be axis-aligned.

  Stay in integers: compute the six pairwise squared distances. A square
  has four equal, non-zero sides and two equal diagonals, and each
  diagonal's squared length is twice a side's.
languages: [python, javascript]
entry: valid_square
starter:
  python: |
    def valid_square(p1, p2, p3, p4):
        # your code here
        return False
  javascript: |
    function valid_square(p1, p2, p3, p4) {
      // your code here
      return false;
    }
tests:
  - args: [[0, 0], [1, 1], [1, 0], [0, 1]]
    expected: true
  - args: [[0, 0], [1, 1], [1, 0], [0, 12]]
    expected: false
  - args: [[1, 0], [-1, 0], [0, 1], [0, -1]]
    expected: true
    label: rotated 45 degrees
  - args: [[0, 0], [0, 0], [0, 0], [0, 0]]
    expected: false
    label: zero area
  - args: [[0, 0], [2, 0], [2, 1], [0, 1]]
    expected: false
    label: rectangle, not a square
  - args: [[0, 0], [1, 2], [3, 1], [2, -1]]
    expected: true
    hidden: true
    label: tilted square
  - args: [[0, 0], [2, 1], [3, 3], [1, 2]]
    expected: false
    hidden: true
    label: rhombus with unequal diagonals
  - args: [[1, 1], [1, 1], [2, 2], [2, 2]]
    expected: false
    hidden: true
    label: duplicate points
hints:
  - "Collect the six values dist2(pi, pj) for i < j and sort them."
  - "Valid if d[0] > 0, d[0] == d[1] == d[2] == d[3], d[4] == d[5], and d[4] == 2 * d[0]."
```

```exercise
id: pow-mod
title: Modular exponentiation without overflow
prompt: |
  Given non-negative integers `base`, `exp` and `mod` (with `mod >= 1`),
  return `base` raised to `exp`, modulo `mod`. `exp` can be as large as
  2^53 - 1 and `mod` as large as 10^9 + 7, so a loop of `exp`
  multiplications is far too slow: use repeated squaring, reducing after
  every product. By convention anything to the power 0 is 1 (then reduced
  modulo `mod`).

  In JavaScript, the product of two residues below 10^9 + 7 can reach
  10^18, beyond the 2^53 where doubles stop being exact, so a plain
  `(a * b) % mod` gives wrong answers. Use BigInt for the multiplications
  (and return a Number), or split one factor so every partial product
  stays below 2^53.
languages: [python, javascript]
entry: pow_mod
starter:
  python: |
    def pow_mod(base, exp, mod):
        # your code here (do not call the built-in pow)
        return 0
  javascript: |
    function pow_mod(base, exp, mod) {
      // your code here
      return 0;
    }
tests:
  - args: [2, 10, 1000]
    expected: 24
  - args: [3, 0, 7]
    expected: 1
    label: exponent 0
  - args: [5, 3, 1]
    expected: 0
    label: modulus 1
  - args: [10, 3, 7]
    expected: 6
    label: base larger than the modulus
  - args: [2, 1000000, 1000000007]
    expected: 235042059
  - args: [123456789, 987654321, 1000000007]
    expected: 652541198
    hidden: true
    label: products of residues pass 2^53
  - args: [999999999, 1000000000000000, 1000000007]
    expected: 599496534
    hidden: true
    label: exponent 10^15
  - args: [7, 9007199254740991, 1000000007]
    expected: 714166273
    hidden: true
    label: exponent 2^53 - 1
hints:
  - "Start with result = 1 % mod and base = base % mod; while exp > 0: if exp is odd, result = result * base % mod; base = base * base % mod; halve exp."
  - "In JavaScript halve with Math.floor(exp / 2), not exp >> 1, which truncates to 32 bits; or convert everything to BigInt and use e >>= 1n."
  - "With BigInt, return Number(result) so the answer compares equal to a plain number."
```

## Senior signals

- You **name the shape** (digit arithmetic, repeated squaring, integer geometry or simulation) and state its invariant, such as "`result · xⁿ` is constant", before writing the loop.
- You **stay in integers**: squared distances, cross products, slopes as reduced fractions, `math.isqrt`, and you can produce a pair of points that float slopes merge.
- You know the **number model of each language**: doubles exact to 2⁵³, JavaScript's truncating `%` and 32-bit bitwise operators, `BigInt` for residue products, Python's unbounded integers with a 4,300-digit string limit.
- You generalise repeated squaring to **modular exponentiation, matrix powers and inverses**, and say why the library `pow` is more accurate on floats than the template.
- You raise the edge cases before the interviewer does: **`n = −2³¹`, `0` to a negative power, `"0"` times anything, duplicate points, zero-area shapes, a left turn in JavaScript**.
- You answer the frequency follow-up by **indexing by coordinate**, with a number for the speed-up, and the concurrency follow-up by what a query may observe mid-update.
- You acknowledge the built-in and ask whether to implement from scratch.

## Check yourself

```quiz
- q: >-
    How many loop iterations does iterative repeated squaring take for n = 1,000,000,000?
  options: ["About 1,000,000,000, one per unit of n", "About 30, one per binary digit of n", "About 31,623, the square root of n", "About 500,000,000, one per pair of factors"]
  answer: 1
  explanation: >-
    Each iteration halves n, so the loop runs floor(log2 n) + 1 times, which is 30 for a billion. The multiplications into the result happen once per set bit, so there are at most 30 of those too.
- q: >-
    In Multiply Strings, why is a result array of length m + n always enough?
  options: ["Because every carry between slots is at most 1", "It is not always enough; you need m + n + 1 slots", "Because each single digit product is at most 81", "Because the product of the two is below 10^(m+n)"]
  answer: 3
  explanation: >-
    An m-digit number is below 10^m and an n-digit number is below 10^n, so their product is below 10^(m+n) and has at most m + n digits. Individual slots can temporarily exceed 9 and carries can exceed 1, but the final value fits, so slot 0 never overflows.
- q: >-
    A JavaScript robot simulation turns left with d = (d - 1) % 4 and crashes on its first left turn from direction 0. Why?
  options: ["% truncates toward zero, so (0 - 1) % 4 is -1", "d becomes NaN because it was declared with const", "% on a negative operand throws a RangeError", "The direction array must be declared with a length"]
  answer: 0
  explanation: >-
    JavaScript's remainder takes the sign of the dividend, so -1 % 4 is -1, and DIRS[-1] is undefined. Python's % takes the sign of the divisor and gives 3. Turning left as (d + 3) % 4, or normalising with ((x % m) + m) % m, works in both languages.
- q: >-
    In JavaScript, 999999999 * 999999998 % 1000000007 returns 70, but the true value is 72. What went wrong?
  options: ["% on large numbers rounds the divisor down", "The literals were parsed as 32-bit integers", "The product passed 2^53 and was rounded first", "Integer multiplication wrapped around at 2^63"]
  answer: 2
  explanation: >-
    The product is about 10^18, above 2^53, so the double that holds it has lost its low bits before the remainder is taken. Multiplying as BigInt, or splitting one factor so each partial product stays below 2^53, gives the exact 72. Nothing wraps; the error is silent rounding.
- q: >-
    Max Points on a Line keys each pair by the float slope dy / dx. On (0, 0), (10^8, 10^8 + 1) and (10^8 + 1, 10^8 + 2) it reports three collinear points. What is the robust fix?
  options: ["Compare slopes with a tolerance of 1e-9", "Round every slope to nine decimal places", "Key by (dy/g, dx/g), g = gcd, sign fixed", "Use the angle from atan2 instead of the slope"]
  answer: 2
  explanation: >-
    The two slopes differ by about 10^-16 and round to the same double, although the cross product is -1. Rounding, tolerances and angles are all floats and only move the failure. Equal rationals have exactly one reduced form once the sign is normalised, so the integer pair is an exact key.
- q: >-
    Your repeated-squaring pow(1.0000001, 2^31) differs from math.pow in the eighth significant digit. Why, and does it matter?
  options: ["An early rounding error is raised to later powers", "It is a bug; squaring must match math.pow exactly", "Squaring overflows to infinity and then recovers", "math.pow is less accurate, since it uses logarithms"]
  answer: 0
  explanation: >-
    An error of relative size epsilon in an early square is itself squared on every later step, so the final relative error grows to about n times epsilon: 1.2e-8 was measured here, against 1e-17 for the library, which evaluates exp(n log x) with extra precision. Pow(x, n) judges accept about 1e-5, so the template passes, but production code calls the library.
```
