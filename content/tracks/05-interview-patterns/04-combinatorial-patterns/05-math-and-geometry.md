---
slug: math-and-geometry
title: "Math and geometry: digit arithmetic, fast powers, exact geometry and simulation"
description: Recognise the four shapes behind interview math problems (digit-by-digit arithmetic, repeated squaring, integer-only geometry and boundary simulation), and see Pow(x, n), Multiply Strings and Detect Squares traced step by step.
minutes: 32
difficulty: medium
tags: [math, geometry, fast-exponentiation, simulation, pattern:math]
problems: [pow-x-n, multiply-strings, detect-squares, plus-one, spiral-matrix-ii]
---
"Implement `pow(x, n)`." "Multiply two numbers given as strings." "Count the squares these points can form." These problems have no data-structure trick and no search space to prune. They test whether you can turn arithmetic or geometry you learned at school into code that is exact, does not overflow and has no off-by-one errors, under time pressure. Candidates rarely fail them for lack of the idea. They fail on the details: a negative exponent, a carry that ripples one place too far, a floating-point equality, a spiral that writes over its own corner.

The pattern is to identify which of four shapes you are looking at and use the template whose invariant rules those details out: **digit arithmetic** with an explicit carry, **repeated squaring** over the bits of an exponent, **integer-only geometry** with squared distances, cross products and points as hash keys, and **simulation** with direction vectors and a blocked-cell test. The [number theory lesson](/learn/foundations/math-for-engineers/number-theory-essentials) covers the mathematics. This lesson is about producing it correctly in forty minutes.

## The signal

- **Numbers arrive as strings or digit arrays**, or "may have up to 200 digits", or "do not convert to an integer": digit arithmetic ([Plus One](/practice/plus-one), [Multiply Strings](/practice/multiply-strings), adding binary strings or linked-list numbers).
- **An exponent up to 2³¹ or 10¹⁸**: "compute `x^n`", "`a^b mod m`", "the n-th Fibonacci number for huge n". This is repeated squaring ([Pow(x, n)](/practice/pow-x-n)).
- **Points, coordinates, rectangles, lines, "axis-aligned", "count the shapes"**: integer geometry, usually with a hash map of points ([Detect Squares](/practice/detect-squares)).
- **"Fill the matrix in spiral order", "simulate the robot", "rotate", "the next generation"**: simulation with direction vectors ([Spiral Matrix II](/practice/spiral-matrix-ii)).
- **A formula replaces iteration**: the sum `1..n`, a missing number from a range, digit sums, gcd. The mathematics *is* the algorithm, and the code is three lines once you see it.

What rules it out:

- **An optimum over choices.** "Minimum number of coins", "maximum points collected" involve numbers but are [DP](/learn/interview-patterns/combinatorial-patterns/dp-patterns) or [greedy](/learn/interview-patterns/combinatorial-patterns/greedy-pattern) problems.
- **A built-in that trivialises the question.** In Python, `str(int(a) * int(b))` solves Multiply Strings, and `x ** n` solves Pow. Say you know they exist, then ask whether the interviewer wants the algorithm. They almost always do.
- **Genuinely real-valued geometry** (floating-point input, angles, circles) needs epsilon comparisons and is rare in interviews. When the coordinates are integers, which they nearly always are, exploit it and never leave the integers.

## The template

Four small templates, one per shape. Each is short because its invariant does the work.

```python
def add_digits(a, b):
    """Digit arithmetic: least significant first, explicit carry, emit the final carry."""
    i, j, carry, out = len(a) - 1, len(b) - 1, 0, []
    while i >= 0 or j >= 0 or carry:
        total = carry
        if i >= 0:
            total += a[i]; i -= 1
        if j >= 0:
            total += b[j]; j -= 1
        out.append(total % 10)
        carry = total // 10
    return out[::-1]


def power(x, n):
    """Repeated squaring. Invariant: result * x**n equals the original x**n."""
    if n < 0:
        x, n = 1 / x, -n
    result = 1
    while n:
        if n & 1:
            result *= x               # this bit of n is set: fold the current power in
        x *= x                        # x, x^2, x^4, x^8, ...
        n >>= 1
    return result


def cross(o, a, b):
    """Integer geometry: > 0 left turn, < 0 right turn, 0 collinear. Exact, no floats."""
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def dist2(p, q):
    return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2     # compare squared lengths, never sqrt


DIRS = [(0, 1), (1, 0), (0, -1), (-1, 0)]              # right, down, left, up

def walk_spiral(rows, cols, visit):
    """Simulation: keep going until blocked, then turn clockwise."""
    seen = [[False] * cols for _ in range(rows)]
    r = c = d = 0
    for step in range(rows * cols):
        visit(r, c, step)
        seen[r][c] = True
        nr, nc = r + DIRS[d][0], c + DIRS[d][1]
        if not (0 <= nr < rows and 0 <= nc < cols) or seen[nr][nc]:
            d = (d + 1) % 4
            nr, nc = r + DIRS[d][0], c + DIRS[d][1]
        r, c = nr, nc
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

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const dist2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
```

What each invariant buys:

- **Digit arithmetic.** After `k` iterations, `out` holds the correct lowest `k` digits and `carry` holds everything above them. The `or carry` in the loop condition emits the final carry, which is the bug in half of all hand-written adders.
- **Repeated squaring.** `result · x^n` never changes. If `n` is odd, moving one factor of `x` into `result` preserves it. Squaring `x` while halving `n` preserves it. When `n` reaches 0, `result` is the answer, after `⌊log₂ n⌋ + 1` iterations. The JavaScript version avoids `n >>= 1` deliberately: bitwise operators first convert to a 32-bit signed integer, so `2³¹ >> 1` is negative and the loop stops early. `n % 2` and `Math.floor(n / 2)` are exact for every integer up to 2⁵³.
- **Integer geometry.** Cross products and squared distances of integer points are exact integers, so equality tests are exact. The only enemy is overflow: coordinates up to 10⁹ give products up to about 4 × 10¹⁸. That needs 64-bit integers in Java, Go or C++, and `BigInt` in JavaScript, whose doubles hold integers exactly only up to 2⁵³ ≈ 9 × 10¹⁵.
- **Simulation.** The state is a position plus a direction index. Turning is `d = (d + 1) % 4`. "Blocked" means out of bounds or already visited. Test before you move, never after you have written.

The exponent's bits drive repeated squaring. Each set bit is one multiplication into the result, and each bit position is one squaring:

```viz
{"type": "bits", "algorithm": "count-bits", "values": [13], "title": "The bits of n = 13 drive pow(x, 13)", "caption": "13 = 1101 = 8 + 4 + 1, so x^13 = x^8 * x^4 * x^1: three multiplications into the result, one per set bit, and a squaring per bit position."}
```

## Worked problems

### Pow(x, n)

[Pow(x, n)](/practice/pow-x-n): compute `x` raised to the integer power `n`, where `n` may be negative and as large as 2³¹ in magnitude. The naive loop does `|n|` multiplications, about 2 billion for the largest input. Repeated squaring does about 31.

Trace `x = 2`, `n = 13` through the template:

| `n` in binary | low bit | `result` after | `x` after squaring |
|---|---|---|---|
| 1101 | 1 | 1 · 2 = 2 | 4 |
| 110 | 0 | 2 | 16 |
| 11 | 1 | 2 · 16 = 32 | 256 |
| 1 | 1 | 32 · 256 = 8192 | 65536 |
| 0 | stop | | |

The answer is 8192 = 2¹³. The multiplications that happened were `2 · 16 · 256 = 2¹ · 2⁴ · 2⁸`, one factor per set bit of `1101`.

Three edge cases decide whether this is a pass or a strong pass:

- **Negative `n`.** `x^(-n) = (1/x)^n`, so invert once and continue. In Java and C++, `n = -n` overflows when `n` is the minimum 32-bit integer, −2³¹, because +2³¹ does not fit. Copy `n` into a 64-bit variable first. Python and JavaScript are unaffected, but mentioning it is a senior signal.
- **`x = 0` with `n < 0`** is a division by zero. Ask what the function should return, or state your assumption.
- **`0⁰`** is conventionally 1, which the template returns without special handling.

The template works for any associative multiplication. With `% m` after every product it is modular exponentiation (Python's built-in `pow(a, b, m)`), which underlies RSA and Diffie–Hellman. With 2 × 2 matrices, `[[1, 1], [1, 0]]^n` contains the n-th Fibonacci number, so any linear recurrence can be evaluated in `O(log n)` matrix products.

### Multiply Strings

[Multiply Strings](/practice/multiply-strings): given two non-negative integers as decimal strings, return their product as a string, without converting either to a built-in number.

The school method, organised so that every carry has a place to land: the product of an `m`-digit and an `n`-digit number has at most `m + n` digits, so allocate `pos` of length `m + n`. The digit at index `i` of `a` (counting from the left) times the digit at index `j` of `b` lands at `pos[i + j + 1]`, and its carry goes to `pos[i + j]`.

```python
def multiply(a, b):
    m, n = len(a), len(b)
    pos = [0] * (m + n)
    for i in range(m - 1, -1, -1):
        for j in range(n - 1, -1, -1):
            mul = int(a[i]) * int(b[j])
            total = mul + pos[i + j + 1]
            pos[i + j + 1] = total % 10
            pos[i + j] += total // 10
    s = "".join(map(str, pos)).lstrip("0")
    return s or "0"
```

Trace `"123" × "45"`, with `pos` starting as `[0, 0, 0, 0, 0]`:

| `a[i]` | `b[j]` | product | lands at | `pos` after |
|---|---|---|---|---|
| 3 (i=2) | 5 (j=1) | 15 | pos[4] = 5, carry 1 to pos[3] | `[0, 0, 0, 1, 5]` |
| 3 | 4 (j=0) | 12 | 12 + pos[3] = 13: pos[3] = 3, carry 1 to pos[2] | `[0, 0, 1, 3, 5]` |
| 2 (i=1) | 5 | 10 | 10 + pos[3] = 13: pos[3] = 3, carry 1 to pos[2] | `[0, 0, 2, 3, 5]` |
| 2 | 4 | 8 | 8 + pos[2] = 10: pos[2] = 0, carry 1 to pos[1] | `[0, 1, 0, 3, 5]` |
| 1 (i=0) | 5 | 5 | 5 + pos[2] = 5: pos[2] = 5 | `[0, 1, 5, 3, 5]` |
| 1 | 4 | 4 | 4 + pos[1] = 5: pos[1] = 5 | `[0, 5, 5, 3, 5]` |

Strip the leading zero and the answer is `"5535"`, which is 123 × 45. Notice that `pos[i + j]` can temporarily exceed 9. That is fine, because it is normalised when a later, more significant product lands on it, and the final `pos[0]` never overflows since the product fits in `m + n` digits.

The cost is `O(m · n)`. For very large numbers, Karatsuba's divide and conquer does better at about `O(n^1.585)`, and CPython itself switches to Karatsuba above a size threshold. See [classic divide and conquer](/learn/algorithms/divide-and-conquer/classic-divide-and-conquer). The `s or "0"` handles `"0" × "789"`, whose digits are all zero.

### Detect Squares

[Detect Squares](/practice/detect-squares): build a structure with `add(point)`, where duplicate points are allowed and each copy counts separately, and `count(query)`, which returns how many ways three stored points can join the query point to form an axis-aligned square with positive area.

The geometry reduces to one observation. If the query `(qx, qy)` is one corner, the diagonally opposite corner `(x, y)` fixes the square: it needs `|x - qx| == |y - qy| != 0`, and then the other two corners must be `(qx, y)` and `(x, qy)`. So keep a counter of points, iterate over the distinct stored points as candidate diagonals, and multiply the three counts, because each combination of copies is a different square.

```python
from collections import Counter

class DetectSquares:
    def __init__(self):
        self.cnt = Counter()

    def add(self, point):
        self.cnt[tuple(point)] += 1          # lists are unhashable; tuples are keys

    def count(self, point):
        qx, qy = point
        total = 0
        for (x, y), c in self.cnt.items():
            if abs(x - qx) != abs(y - qy) or x == qx:
                continue                      # not a diagonal, or zero area
            total += c * self.cnt[(qx, y)] * self.cnt[(x, qy)]
        return total
```

Trace. Add `(3, 10)`, `(11, 2)` and `(3, 2)`.

| operation | candidate diagonals `(x, y)` | abs dx, abs dy | contribution | result |
|---|---|---|---|---|
| `count(11, 10)` | (3, 10) | 8, 0 | not a diagonal | |
| | (11, 2) | 0, 8 | not a diagonal | |
| | (3, 2) | 8, 8 | cnt(3,2)·cnt(11,2)·cnt(3,10) = 1·1·1 | **1** |
| `count(14, 8)` | all three | 11 and 2, 3 and 6, 11 and 6 | none match | **0** |
| `add(11, 2)` | | | cnt(11,2) becomes 2 | |
| `count(11, 10)` | (3, 2) | 8, 8 | 1 · 2 · 1 | **2** |

The second copy of `(11, 2)` doubles the answer because it gives a second, distinct choice of corner. One detail in the code matters: `self.cnt[(qx, y)]` on a `Counter` returns 0 for a missing key *without inserting it*. With a `defaultdict`, the same lookup would insert zero-count keys, and the loop would slowly fill the map with points that were never added.

Each `count` is `O(P)` for `P` distinct points. The standard refinement indexes points by `x`. A square's vertical side through the query shares `qx`, so iterate only the points in column `qx`. Each gives a side length `d = y - qy`, and you check the squares to the left and right. That makes `count` `O(points in the column)`, which is the answer to the follow-up "what if `count` is called far more often than `add`?"

## Variations

- **[Plus One](/practice/plus-one).** Add 1 to a digit array: walk from the end; a digit below 9 is incremented and you return immediately; a 9 becomes 0 and the carry moves left. All 9s become `[1, 0, …, 0]`. It is the digit template with an early exit, which makes the typical case `O(1)`.
- **[Spiral Matrix II](/practice/spiral-matrix-ii).** Fill an `n × n` matrix with `1..n²` in spiral order: the simulation template with `visit` writing `step + 1`. The boundary-shrinking alternative is in [matrix traversal](/learn/interview-patterns/array-patterns/matrix-traversal). In the simulation version you can use "the cell is non-zero" as the visited test.
- **Integer square root.** [Binary search](/learn/algorithms/sorting-searching/binary-search) on `r * r <= x`, or Newton's method `r = (r + x // r) // 2`, which converges quadratically.
- **Overflow-checked reversal** ([Reverse Integer](/practice/reverse-integer)). Before `r = r * 10 + d`, check `r > (LIMIT - d) // 10`. The check must happen *before* the operation that would overflow.
- **Max points on a line.** Store the slope as a reduced fraction `(dy / g, dx / g)` with a normalised sign, never as a float. Two slopes that are equal as fractions can differ as doubles.
- **Rectangle overlap and area.** The overlap width is `max(0, min(r1, r2) - max(l1, l2))`, and likewise for height. Union area is the sum of the areas minus the overlap.
- **Rotation.** Rotating a point 90° counter-clockwise about the origin maps `(x, y)` to `(-y, x)`. Rotating a matrix in place is a transpose followed by reversing each row ([Rotate Image](/practice/rotate-image)).
- **Cycles in digit processes** ([Happy Number](/practice/happy-number)). Repeatedly summing the squares of the digits must eventually cycle, because the values stay bounded. Detect the cycle with a set or with Floyd's two pointers.

## Pitfalls

- **Negating the minimum integer.** `-n` for `n = -2³¹` overflows in 32-bit languages. Widen first.
- **Floating-point equality in geometry.** `sqrt(dist2) == side` fails on rounding. Compare squared integer distances, and use cross products for collinearity and orientation.
- **Overflow in geometric products.** Squared distances and cross products double the bit width of the coordinates. In JavaScript, anything past 2⁵³ silently loses precision, so use `BigInt` or say that the constraints keep you below it.
- **Arrays as map keys in JavaScript.** `map.get([3, 2])` never finds `map.set([3, 2], 1)`, because arrays compare by reference. Use a string key such as `` `${x},${y}` `` or a numeric encoding like `x * 100003 + y` when the coordinate bounds allow. In Python, lists are unhashable, so use tuples.
- **Forgetting the final carry**, or stripping leading zeros so aggressively that `"0"` becomes `""`.
- **JavaScript bitwise operators on large exponents.** `n >> 1` converts `n` to a 32-bit signed integer first, so `n = 2³¹` (what you get by negating −2³¹) turns negative. Use `% 2` and `Math.floor(n / 2)`, or `BigInt`.
- **Zero-area squares** in Detect Squares. `x == qx` with `dy == 0` passes `|dx| == |dy|`, so exclude it explicitly.
- **Spiral overwrite.** Turning *after* moving into a filled or out-of-range cell writes one cell too far. Test the next cell, turn if blocked, then move.

## Exercise

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

## Senior signals

- You **name the shape** (digit arithmetic, repeated squaring, integer geometry or simulation) and state its invariant, such as "`result · x^n` is constant", before writing the loop.
- You **stay in integers** for geometry: squared distances, cross products, slopes as reduced fractions. You also state the overflow bound and what that means in JavaScript.
- You generalise repeated squaring to **modular exponentiation and matrix powers**, and connect it to Fibonacci in `O(log n)` and to cryptography.
- You raise the edge cases before the interviewer does: **`n = -2³¹`, `0` to a negative power, `"0"` times anything, duplicate points, zero-area shapes**.
- You answer the complexity follow-up for design-flavoured math (Detect Squares) by **indexing points by coordinate** to make the frequent operation cheaper.
- You acknowledge the built-in (`pow`, big integers) and ask whether to implement from scratch, rather than silently using it or silently avoiding it.

## Check yourself

```quiz
- q: >-
    How many loop iterations does iterative repeated squaring take for n = 1,000,000,000?
  options: ["About 1,000,000,000, one per unit of n", "About 30, one per binary digit of n", "About 500,000,000, one per pair of factors", "About 31,623, the square root of n"]
  answer: 1
  explanation: >-
    Each iteration halves n, so the loop runs floor(log2 n) + 1 times, which is 30 for a billion. The multiplications into the result happen once per set bit, so there are at most 30 of those too.
- q: >-
    In Multiply Strings, why is a result array of length m + n always enough?
  options: ["Because each single digit product is at most 81", "It is not always enough; you need m + n + 1 slots", "Because the product of the two is below 10^(m+n)", "Because every carry between slots is at most 1"]
  answer: 2
  explanation: >-
    An m-digit number is below 10^m and an n-digit number is below 10^n, so their product is below 10^(m+n) and has at most m + n digits. Individual pos slots can temporarily exceed 9, and carries can exceed 1, but the final value fits in m + n digits, so pos[0] never overflows.
- q: >-
    Checking whether four integer points form a square by comparing floating-point side lengths from sqrt fails on some inputs. What is the robust fix?
  options: ["Compare the lengths with a larger epsilon tolerance", "Compare squared distances, which are exact integers", "Round every side length to 6 decimal places first", "Sort the four points by polar angle before comparing"]
  answer: 1
  explanation: >-
    sqrt introduces rounding, so equal lengths can compare unequal, and rounding or a wider epsilon only moves the failure elsewhere. Squared distances of integer points are integers, so equality is exact. The only remaining concern is overflow for very large coordinates.
- q: >-
    In JavaScript, a Detect Squares implementation stores counts in a Map keyed by [x, y] arrays. What goes wrong?
  options: ["It works correctly, but each lookup scans the whole map", "Duplicate points overwrite each other's stored counts", "Map objects cannot store arrays as their keys at all", "Fresh [x, y] lookups miss, as arrays compare by reference"]
  answer: 3
  explanation: >-
    Two different array objects with the same contents are different keys, so every lookup with a freshly built [x, y] misses and count always returns 0. Use a string key such as x + ',' + y, or a numeric encoding when the coordinate bounds allow it.
- q: >-
    Your Java pow(x, n) uses n = -n for negative exponents and passes every test except n = -2147483648. Why?
  options: ["Negating -2^31 overflows back to -2^31 in an int", "Floating-point underflow drives the result to zero", "x is zero, so the inversion divides by zero", "The loop runs 2^31 times and exceeds the time limit"]
  answer: 0
  explanation: >-
    The int range is asymmetric: +2^31 is not representable, so -(-2^31) wraps to -2^31, n stays negative, and the loop misbehaves. Copy n into a long before negating. Negation cannot overflow in Python or JavaScript, although JavaScript has its own 32-bit trap if you halve n with >>.
```
