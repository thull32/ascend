---
slug: numbers-strings-unicode
title: "Numbers, strings and Unicode: the representations behind the bugs"
description: Integer widths and overflow across languages, why floats cannot hold 0.1, what string building really costs, and why the length of an emoji depends on which language you ask.
minutes: 45
difficulty: easy
tags: [integers, overflow, floating-point, strings, unicode, utf-8, utf-16]
problems: [reverse-integer, sum-of-two-integers]
---
A billing job sums a day of transactions in cents and reports a negative total. A JavaScript client receives a 64-bit order ID as JSON and stores it with the last three digits changed. A test asserts `0.1 + 0.2 == 0.3` and fails, so someone "fixes" it with rounding and introduces a cent-level drift. A username validator says a name is 5 characters long in Python, 6 in JavaScript and 9 in Go, and it is the same name. A loop that builds a CSV line by `+=` takes minutes on a file that should take seconds.

None of these are exotic. Every one comes from the gap between the number or text you think you have and the bits the machine actually stores. This lesson is the map of that gap for integers, floating point, and strings, with the behaviour of Python, JavaScript, Go, Rust and Java side by side, because the behaviour differs and the differences are where the incidents are.

## Integers: widths, two's complement, and what happens at the edge

A fixed-width integer is `w` bits. Unsigned, it holds 0 to 2^w − 1. Signed, using **two's complement**, it holds −2^(w−1) to 2^(w−1) − 1: the top bit is worth −2^(w−1) instead of +2^(w−1). For 8 bits that is −128 to 127; for 32 bits, −2,147,483,648 to 2,147,483,647; for 64 bits, about ±9.2 × 10^18.

Two's complement is chosen because addition and subtraction then work with the same circuit for signed and unsigned values, and negation is "flip all bits and add one". `-5` in 8 bits is `11111011`; add `00000101` (5) and you get `1 00000000`, and the carried-out bit is discarded, leaving 0.

```viz
{"type": "bits", "algorithm": "shift", "a": 5, "values": [5, -5, 127], "title": "Bit patterns and shifts", "caption": "Left shift multiplies by two until the bit falls off the end; arithmetic right shift keeps the sign bit, logical right shift does not."}
```

What happens when a result does not fit is the first thing to know about a language:

| Language | Default integer | On overflow |
|---|---|---|
| Python | Arbitrary precision `int` | Cannot overflow; the number just gets bigger (and slower) |
| JavaScript | IEEE-754 double (`number`); `BigInt` separately | No integer overflow, but integers above 2^53 lose precision silently; bitwise operators truncate to 32 bits |
| Go | `int` (64-bit on 64-bit platforms), fixed sizes | Wraps silently, in both debug and release |
| Rust | `i32` by default, fixed sizes | Panics in debug builds, wraps in release; `checked_add`, `wrapping_add`, `saturating_add` make the intent explicit |
| Java | `int` 32-bit, `long` 64-bit | Wraps silently; `Math.addExact` throws |
| C / C++ | Platform-dependent | Signed overflow is undefined behaviour; the optimiser may assume it never happens |

Python's `int` is a sequence of 30-bit digits, so adding two small ints is a few nanoseconds of object allocation plus arithmetic, and multiplying two 10,000-digit numbers uses Karatsuba. The cost is per-operation overhead and memory; the benefit is that `2**100` is simply correct. JavaScript's `number` is the odd one out: there is no integer type. `9007199254740993` (2^53 + 1) literally cannot be represented, and `Number.MAX_SAFE_INTEGER` is the line beyond which `n + 1 === n` becomes possible. That is the 64-bit ID bug: Twitter, Discord and every database that hands out snowflake IDs sends them as JSON *strings* for exactly this reason.

The overflow bugs that recur:

**Midpoint in binary search.** `mid = (lo + hi) / 2` overflows a 32-bit `int` when `lo + hi > 2^31 − 1`, which happens at arrays of over a billion elements. Java's `Arrays.binarySearch` had this bug for years. Write `lo + (hi - lo) / 2`. Python does not care, and that is a habit worth keeping anyway because your interviewer might be reading your code as Java.

**Multiplying before dividing.** `total_bytes * 100 / capacity` for a percentage overflows a 32-bit int at 21 MB of `total_bytes`. Reorder, or widen.

**Hash computations.** A polynomial rolling hash multiplies repeatedly; in Go and Java it wraps (which is fine and intended if you take it modulo something), in Python it grows without bound (which is correct and slow), in Rust debug it panics (which is a test failure you will see once). The [modular arithmetic lesson](/learn/foundations/math-for-engineers/modular-arithmetic-and-hashing-math) covers the overflow-safe form.

**Reversing an integer.** The classic interview problem [Reverse Integer](/practice/reverse-integer) exists only because of overflow: the reverse of 1,534,236,469 is 9,646,324,351, which does not fit in 32 bits, and the problem asks you to detect that *before* it happens, using only 32-bit arithmetic.

Simulating fixed-width behaviour in a language that does not have it is a skill in itself, and the first exercise asks for it.

```exercise
id: wrap-to-int32
title: Simulate 32-bit two's-complement wrapping
prompt: |
  Given an arbitrary integer `n`, return the value it would have after being
  stored in a signed 32-bit two's-complement integer. Values already in
  [-2^31, 2^31 - 1] are returned unchanged; values outside wrap around.

  Do not use language-specific bit tricks such as `n | 0`; use arithmetic
  so the same idea works in Python and JavaScript. Inputs stay below 2^53
  in magnitude.
languages: [python, javascript]
entry: to_int32
starter:
  python: |
    def to_int32(n):
        # your code here
        return n
  javascript: |
    function to_int32(n) {
      // your code here
      return n;
    }
tests:
  - args: [2147483647]
    expected: 2147483647
    label: max fits
  - args: [2147483648]
    expected: -2147483648
    label: one past max wraps to min
  - args: [-2147483649]
    expected: 2147483647
    label: one below min wraps to max
  - args: [0]
    expected: 0
  - args: [4294967296]
    expected: 0
    label: exactly 2^32 wraps to zero
  - args: [3000000000]
    expected: -1294967296
    hidden: true
  - args: [-3000000000]
    expected: 1294967296
    hidden: true
hints:
  - "Shift into the unsigned range by adding 2^31, reduce modulo 2^32, then shift back."
  - "In JavaScript, `%` can return a negative result; use `((x % m) + m) % m` for a true modulo."
```

## Floating point: what a double can and cannot hold

A 64-bit IEEE-754 double has 1 sign bit, 11 exponent bits and 52 fraction bits, representing values of the form ±1.f × 2^e. It is a *binary* fraction. 0.5, 0.25, 0.375 are exact. 0.1 is not, because 1/10 in binary is the repeating fraction 0.000110011..., and 52 bits of it round to 0.1000000000000000055511151231257827. So:

```python
>>> 0.1 + 0.2
0.30000000000000004
>>> 0.1 + 0.2 == 0.3
False
>>> sum([0.1] * 10) == 1.0
False
```

This is not a Python quirk; it is the same in every language that uses doubles, which is all of them. The rules that follow from the representation:

- **Precision is relative, not absolute.** A double has about 15–17 significant decimal digits. Near 1.0 the gap between representable numbers (one *unit in the last place*, ULP) is about 2.2 × 10^−16; near 10^15 it is 0.125; above 2^53 it is 2, which is where whole integers start being skipped.
- **Compare with a tolerance, and choose it deliberately.** `abs(a - b) <= 1e-9` is wrong for numbers near 10^12, where the rounding error alone exceeds that. Use a relative tolerance (`math.isclose`, which combines relative and absolute) and know what your scale is.
- **Order of operations changes the answer.** Summing a million values of varying magnitude left to right accumulates error; summing small to large, or using Kahan compensated summation, or `math.fsum`, gives a correctly rounded result. `numpy.sum` uses pairwise summation for the same reason.
- **`NaN` is not equal to anything, including itself.** `x != x` is the portable NaN test. A `NaN` in a sort key makes comparison-based sorts produce nonsense because the ordering is no longer transitive.
- **Money is not a float.** Store cents as integers, or use a decimal type (`decimal.Decimal`, Java `BigDecimal`, Postgres `numeric`). The drift of a float-based ledger is small per transaction and unbounded over time, and auditors do not accept "approximately".

Single-precision `float32` (as in most ML workloads) has 23 fraction bits and about 7 decimal digits; `bfloat16` and `float16` have fewer still. The choice is a throughput-versus-accuracy trade, and knowing that a `float32` cannot distinguish 16,777,216 from 16,777,217 is the kind of fact that explains a model whose counter stopped incrementing.

## Strings: immutable, and therefore built carefully

In Python, JavaScript, Java, Go and Rust's `&str`, a string is immutable: no operation changes an existing string; every "modification" creates a new one. That is what makes strings safe to share as dictionary keys and across threads, and it is what makes naive building quadratic.

```python
line = ""
for field in fields:          # n fields of average length k
    line += field + ","       # allocates a new string of the current length each time
```

Each `+=` copies everything accumulated so far, so the total copying is 1k + 2k + ... + nk = O(n²k). For 100,000 fields of 10 characters that is on the order of 50 billion byte copies. The fix is to collect the parts and join once:

```python
line = ",".join(fields)                     # Python: one allocation, O(total length)
```

```javascript
const line = fields.join(",");              // JavaScript
```

```go
var sb strings.Builder                      // Go: amortised O(1) appends, one final string
for _, f := range fields { sb.WriteString(f); sb.WriteByte(',') }
line := sb.String()
```

The honest complication: CPython has an optimisation that mutates the string in place when `s += t` and the reference count of `s` is exactly one, which makes many `+=` loops linear in practice. It is fragile (any second reference, including a debugger, defeats it), it does not exist in PyPy, and it is not part of the language. V8 and other JS engines represent the result of `a + b` as a **rope** (a tree of the two parts) without copying, so `+=` in a loop is fast until something needs the flat string, at which point the whole rope is flattened at once. Both are reasons `+=` is often fine and neither is a reason to rely on it in code that has to be fast everywhere. `join` and builders are correct in every runtime.

Slicing follows the container rule from the [previous lesson](/learn/foundations/how-code-runs/values-references-and-mutation): Python `s[a:b]` copies, Go `s[a:b]` shares the bytes (O(1), but pins the whole original in memory), Java copies since 7u6 (it used to share and leak), Rust `&s[a..b]` is a borrowed view. A function that takes substrings of a 1 GB log in Python copies; in Go it keeps the gigabyte alive as long as any substring exists.

## Unicode: four different lengths for one string

"Character" is not a unit of storage. There are four different things you might mean, and languages pick different ones as their default.

- **Code point**: a number in the Unicode range 0 to 0x10FFFF, such as U+00E9 (é) or U+1F44D (👍).
- **Code unit**: the storage unit of an encoding. UTF-8 units are bytes (a code point takes 1–4); UTF-16 units are 16-bit (a code point takes 1, or 2 as a *surrogate pair* for anything above U+FFFF); UTF-32 units are 32-bit (always 1).
- **Byte**: what goes on the wire or disk, always in some encoding, almost always UTF-8 today.
- **Grapheme cluster**: what a human calls one character. "é" can be one code point (U+00E9) *or* two (`e` U+0065 followed by combining acute U+0301). "👍🏽" is two code points (thumbs up plus a skin-tone modifier). A family emoji can be seven code points joined with zero-width joiners.

Here is how `len` disagrees, for the string `"héllo 👍🏽"` (h, é as a single code point, l, l, o, space, thumbs up, skin tone modifier):

| Measure | Value | Who reports it |
|---|---|---|
| Grapheme clusters | 7 | A human; `\X` in a Unicode-aware regex; Swift `String.count` |
| Code points | 8 | Python `len`, Rust `s.chars().count()`, Go `utf8.RuneCountInString` |
| UTF-16 code units | 10 | JavaScript `.length`, Java `String.length()` (each emoji code point is a surrogate pair) |
| UTF-8 bytes | 15 | Go `len(s)`, Rust `s.len()`, the size on disk (é is 2 bytes; each emoji code point is 4) |

Check the byte count: h(1) + é(2) + l(1) + l(1) + o(1) + space(1) + 👍(4) + 🏽(4) = 15. The UTF-16 count: six BMP characters at one unit each plus two supplementary code points at two units each = 10.

The bugs this produces:

- **Truncation in the middle of a character.** `s[:10]` in Go can cut a 3-byte code point in half, producing invalid UTF-8. `s.slice(0, 10)` in JavaScript can split a surrogate pair, producing a lone surrogate that will fail to encode. Python slicing is code-point safe but can still split a grapheme.
- **Reversing a string.** Reversing by code point turns "e" + combining acute into acute + "e" and moves the accent to the wrong letter; reversing by UTF-16 unit in JavaScript corrupts every emoji. The interview answer is "reverse by grapheme cluster, which needs a library", and knowing that is the point.
- **Database column limits.** MySQL `VARCHAR(255)` counts characters, but its old `utf8` charset is 3-byte-max and rejects emoji; `utf8mb4` is real UTF-8. Postgres `varchar(n)` counts characters. Redis and most byte-oriented stores count bytes. A "255-character" limit enforced in JavaScript by `.length` admits up to 1,020 bytes of emoji.
- **Equality.** "é" (U+00E9) and "é" render identically and compare unequal. Normalise (NFC composes, NFD decomposes; `unicodedata.normalize`, `String.prototype.normalize`) before comparing user input, and casefold rather than lowercase for case-insensitive matches ("ß".casefold() is "ss").
- **Indexing cost.** A Python 3 `str` stores each string in the narrowest fixed width that fits all its code points (1, 2 or 4 bytes per code point, PEP 393), so `s[i]` is O(1) but one emoji makes the whole string 4 bytes per character. Go and Rust store UTF-8, so `s[i]` gives a *byte* and finding the i-th code point is O(n). JavaScript's `s[i]` gives a UTF-16 unit, which is half an emoji.

The second exercise makes the encoding rule concrete: how many bytes does a string cost in UTF-8?

```exercise
id: utf8-byte-length
title: Count UTF-8 bytes without encoding
prompt: |
  Return the number of bytes `s` occupies when encoded as UTF-8, computed
  from the code points alone (do not call an encoding function such as
  `encode`, `TextEncoder` or `Buffer`). The rule: a code point below U+0080
  takes 1 byte, below U+0800 takes 2, below U+10000 takes 3, otherwise 4.

  In Python, iterate the string to get code points and use `ord`. In
  JavaScript, use `for (const ch of s)` (which yields whole code points,
  not UTF-16 units) and `ch.codePointAt(0)`.
languages: [python, javascript]
entry: utf8_length
starter:
  python: |
    def utf8_length(s):
        # your code here
        return 0
  javascript: |
    function utf8_length(s) {
      // your code here
      return 0;
    }
tests:
  - args: ["hello"]
    expected: 5
    label: ASCII is one byte per character
  - args: [""]
    expected: 0
    label: empty string
  - args: ["héllo"]
    expected: 6
    label: é is two bytes
  - args: ["€"]
    expected: 3
    label: euro sign is three bytes
  - args: ["😀"]
    expected: 4
    label: emoji is four bytes (two UTF-16 units)
  - args: ["日本語"]
    expected: 9
    hidden: true
  - args: ["a😀b"]
    expected: 6
    hidden: true
hints:
  - "Map each code point to 1, 2, 3 or 4 with three comparisons and sum."
  - "In JavaScript `s.length` counts UTF-16 units, so `😀`.length is 2; `for...of` avoids that trap."
```

## Senior signals

- You state the integer type and overflow behaviour of the language you are writing before you write arithmetic on large values, and you write `lo + (hi - lo) // 2` by reflex.
- You know that JavaScript has no integer type, where 2^53 comes from, and why 64-bit IDs travel as strings.
- You never compare floats with `==` in production code, you pick a tolerance with a stated scale, and you keep money in integers or decimals.
- You build strings with `join` or a builder and you can explain why `+=` is quadratic in principle even when your runtime rescues it.
- You can say what "length" means in each of four units, give the UTF-8 byte count of an emoji, and name the normalisation step before comparing user-entered text.
- You know which of your storage layers count bytes and which count characters, and you set limits accordingly.

## Check yourself

```quiz
- q: >-
    A Java method computes `int mid = (lo + hi) / 2` in a binary search over an array of 1.5 billion elements. What goes wrong and when?
  options: ["Nothing; ints are 32-bit and 1.5 billion fits", "lo + hi exceeds 2^31 - 1 once the search range is in the upper part of the array, wraps negative, and mid becomes a negative index", "The division truncates and the search misses the last element", "The array cannot exceed 1 billion elements in Java"]
  answer: 1
  explanation: >-
    1.5 billion fits in an int, but lo + hi can reach 3 billion, which wraps to a negative value. Use lo + (hi - lo) / 2. The truncation is normal and harmless.
- q: >-
    A JSON API returns `{"id": 9007199254740993}`. A JavaScript client parses it with JSON.parse. What does the client hold?
  options: ["9007199254740993, exactly", "9007199254740992, because the value exceeds 2^53 and rounds to the nearest representable double", "A BigInt, because JSON.parse detects large integers", "A string"]
  answer: 1
  explanation: >-
    JSON.parse produces a double; 2^53 + 1 is not representable and rounds to 2^53. Neither BigInt nor a string is produced automatically. This is why large IDs are sent as strings.
- q: >-
    You need to check whether two doubles a and b, both around 10^12, are "equal". Which test is appropriate?
  options: ["a == b", "abs(a - b) < 1e-9", "abs(a - b) <= 1e-9 * max(abs(a), abs(b))", "round(a) == round(b)"]
  answer: 2
  explanation: >-
    Near 10^12 the spacing between adjacent doubles is about 10^-4, so an absolute tolerance of 10^-9 is smaller than a single rounding step and will spuriously fail. A relative tolerance scales with the magnitude. Rounding to integers discards real differences.
- q: >-
    In JavaScript, `"👍🏽".length` is 4 and `[..."👍🏽"].length` is 2. Why?
  options: ["The first counts bytes; the second counts characters", "The first counts UTF-16 code units (two surrogate pairs); the second iterates by code point (thumbs up plus skin-tone modifier)", "The first is a bug in V8", "The second counts grapheme clusters"]
  answer: 1
  explanation: >-
    .length is UTF-16 units and each of the two supplementary code points needs a surrogate pair. Spreading iterates by code point, giving 2. A human sees one grapheme cluster; nothing built into JavaScript counts that without Intl.Segmenter.
- q: >-
    A Go service reads a 50 MB response body into a string and stores a 12-byte substring of it in a long-lived map. What is the memory consequence?
  options: ["12 bytes per entry, as expected", "The whole 50 MB stays alive as long as the substring does, because Go substrings share the original's bytes", "The substring is copied, so the 50 MB is freed but the copy costs O(n)", "Go strings are reference counted, so the body is freed when the reader closes"]
  answer: 1
  explanation: >-
    Go slicing shares the backing bytes and the garbage collector keeps the entire original alive while any slice of it is reachable. Clone the small part (strings.Clone) to release the body.
```
