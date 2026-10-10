---
slug: numbers-strings-unicode
title: "Numbers, strings and Unicode: the representations behind the bugs"
description: Integer widths and overflow across languages (each behaviour actually run), the IEEE 754 bit layout with a rounding trace of 0.1 + 0.2, what string building really costs in CPython and V8, the four lengths of one string in UTF-8 and UTF-16 bytes, and why the length of an emoji depends on which language you ask.
minutes: 55
difficulty: easy
tags: [integers, overflow, floating-point, ieee-754, strings, unicode, utf-8, utf-16]
problems: [reverse-integer, sum-of-two-integers]
---
A billing job sums a day of transactions in cents and reports a negative total. A JavaScript client receives a 64-bit order ID as JSON and stores it with the last digit changed. A test asserts `0.1 + 0.2 == 0.3` and fails, so someone "fixes" it with rounding and introduces a cent-level drift. A username validator says a name is 7 characters long to a human, 8 in Python, 10 in JavaScript and 15 in Go, and it is the same name. A loop that builds a CSV line by `+=` takes minutes on a file that should take seconds, but only in one of the two services that run the same code.

Every one comes from the gap between the number or text you think you have and the bits the machine stores. This lesson is the map of that gap for integers, floating point and strings, with each language's behaviour actually run (CPython 3.14, Node 24, Go 1.27, Rust 1.98, gcc 13) rather than recalled, because the behaviour differs and the differences are where the incidents are.

## Integers: widths, two's complement, and what happens at the edge

A fixed-width integer is $w$ bits. Unsigned, it holds $0$ to $2^w - 1$. Signed, using **two's complement**, it holds $-2^{w-1}$ to $2^{w-1} - 1$: the top bit is worth $-2^{w-1}$ instead of $+2^{w-1}$. For 8 bits that is $-128$ to $127$; for 32 bits, $-2{,}147{,}483{,}648$ to $2{,}147{,}483{,}647$; for 64 bits, about $\pm 9.2 \times 10^{18}$.

Two's complement is chosen because addition then works with the same circuit for signed and unsigned values. Trace $127 + 1$ in 8 bits: $01111111 + 00000001 = 10000000$. Read unsigned that is $128$; read signed the top bit is worth $-128$, so it is $-128$. No circuit checked anything; the interpretation changed. Negation is "flip all bits and add one": $5 = 00000101$, flipped $11111010$, plus one $11111011 = -5$. Check: $-5 + 5 = 11111011 + 00000101 = 1\,00000000$, and the carried-out ninth bit is discarded, leaving $0$.

```viz
{"type": "bits", "algorithm": "shift", "a": 5, "values": [5, -5, 127], "title": "Bit patterns and shifts", "caption": "Left shift multiplies by two until the bit falls off the end; arithmetic right shift keeps the sign bit, logical right shift does not."}
```

What happens when a result does not fit is the first thing to know about a language. Each row below was run, not recalled:

| Language | Default integer | `INT32_MAX + 1` as run | What that means |
|---|---|---|---|
| Python | arbitrary-precision `int` | `2147483648` | cannot overflow; the object grows (28 bytes for small values, 32 at $2^{30}$, 40 at $2^{100}$) and arithmetic slows with the digit count |
| JavaScript | IEEE 754 double (`number`); `BigInt` separately | `2 ** 53 + 1` gives `9007199254740992`; `(2 ** 31 - 1 + 1) \| 0` gives `-2147483648`; `1 << 32` gives `1` | no integer overflow, but integers above $2^{53}$ lose precision silently; bitwise operators truncate to signed 32 bits and take shift counts mod 32 |
| Go | `int` (64-bit on 64-bit targets), fixed sizes | `int32` max `+ 1` gives `-2147483648`; `uint8` 255 `+ 1` gives `0` | wraps silently in every build mode |
| Rust | `i32` by default, fixed sizes | debug: panics with `attempt to add with overflow`; release: wraps to `-2147483648` | `checked_add` returns `None`, `wrapping_add` gives `-2147483648`, `saturating_add` gives `2147483647`, `overflowing_add` gives `(-2147483648, true)`: you choose |
| Java | `int` 32-bit, `long` 64-bit | wraps silently | `Math.addExact` throws |
| C / C++ | platform-dependent | with `volatile`, `-2147483648`; without it, gcc 13 compiles `x + 1 > x` to the constant `1` even at `-O0` | signed overflow is undefined behaviour; the compiler assumes it never happens and deletes your overflow check |

That last cell deserves a second look. The function `int check(int x) { return x + 1 > x; }` is a textbook overflow test, and gcc folds it to `return 1` because a signed addition that overflows is not allowed to happen in a correct program, so the comparison "must" be true. The check compiles to nothing, in the build you tested and the build you shipped. Unsigned overflow in C is defined (it wraps), which is why overflow-safe code in C uses unsigned arithmetic or the `__builtin_add_overflow` intrinsics.

The overflow bugs that recur:

**Midpoint in binary search.** `mid = (lo + hi) / 2` overflows a 32-bit `int` when `lo + hi > 2^31 - 1`. Run in both C and Go with `lo = 2,000,000,000` and `hi = 2,100,000,000`: `(lo + hi) / 2` gives `-97483648`; `lo + (hi - lo) / 2` gives `2050000000`. Java's `Arrays.binarySearch` shipped this bug for about nine years before [Joshua Bloch wrote it up in 2006](https://research.google/blog/extra-extra-read-all-about-it-nearly-all-binary-searches-and-mergesorts-are-broken/). Write `lo + (hi - lo) / 2` everywhere, including Python, where it is harmless, because your interviewer may be reading your code as Java.

**Multiplying before dividing.** `total_bytes * 100 / capacity` for a percentage overflows a 32-bit int at 21 MB of `total_bytes`. Reorder, or widen.

**Hash computations.** A polynomial rolling hash multiplies repeatedly; in Go and Java it wraps (fine and intended if you take it modulo something), in Python it grows without bound (correct and slow), in Rust debug it panics (a test failure you will see once). The [modular arithmetic lesson](/learn/foundations/math-for-engineers/modular-arithmetic-and-hashing-math) covers the overflow-safe form.

**The 64-bit ID in JSON.** `JSON.parse('{"id": 9007199254740993}').id` is `9007199254740992` in Node: the parser produces a double, $2^{53} + 1$ is not representable, and it rounds to the nearest even significand. `Number.MAX_SAFE_INTEGER` is $2^{53} - 1$, the line beyond which `n + 1 === n` becomes possible. APIs that hand out 64-bit IDs send them as JSON *strings* for this reason (X, formerly Twitter, returns both `id` and `id_str` in its v1.1 API and [strings by default in v2](https://docs.x.com/fundamentals/x-ids)), and a client that needs arithmetic on them uses `BigInt` (`9007199254740993n + 1n` is `9007199254740994n`, exactly).

**Reversing an integer.** [Reverse Integer](/practice/reverse-integer) exists only because of overflow: the reverse of 1,534,236,469 is 9,646,324,351, which does not fit in 32 bits, and the problem asks you to detect that *before* it happens, using only 32-bit arithmetic.

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

## Floating point: the bits of a double

A 64-bit IEEE 754 double is 1 sign bit, 11 exponent bits (biased by 1023) and 52 fraction bits, representing $(-1)^s \times 1.f \times 2^{e - 1023}$. The leading 1 is implied and not stored. Here are real values, unpacked with `struct` (sign | exponent | fraction):

| Value | Sign | Exponent (biased, unbiased) | Fraction (52 bits, hex) |
|---|---|---|---|
| `1.0` | 0 | 1023, 0 | `0000000000000` |
| `0.5` | 0 | 1022, −1 | `0000000000000` |
| `0.1` | 0 | 1019, −4 | `999999999999a` |
| `0.2` | 0 | 1020, −3 | `999999999999a` |
| `0.3` | 0 | 1021, −2 | `3333333333333` |
| `0.1 + 0.2` | 0 | 1021, −2 | `3333333333334` |
| `2 ** 53` | 0 | 1076, 53 | `0000000000000` |
| `2 ** 53 + 2` | 0 | 1076, 53 | `0000000000001` |
| `-0.0` | 1 | 0 | `0000000000000` |
| `inf` | 0 | 2047 | `0000000000000` |
| `nan` | 0 | 2047 | `8000000000000` (any non-zero fraction) |

Read the table. `0.1` and `0.2` have the *same* fraction bits and exponents one apart, because $0.2 = 2 \times 0.1$ exactly in binary. `0.3` and `0.1 + 0.2` are adjacent doubles: fractions `…3333` and `…3334`, one unit in the last place apart. At $2^{53}$ the exponent is 53 and the fraction's last bit is worth $2^{53 - 52} = 2$, so the next representable number after $2^{53}$ is $2^{53} + 2$; there is no double for $2^{53} + 1$. That is where JavaScript's safe-integer limit comes from.

### Why 0.1 is not 0.1

$1/10$ in binary is the repeating fraction $0.0\overline{0011}$: $0.000110011001100110011\ldots$. A double keeps 53 significant bits (52 stored plus the implied 1). Written out, the significand of 0.1 is

```text
1.1001100110011001100110011001100110011001100110011001|1001100...
 |<-------------------- 52 stored bits -------------------->| next bits
```

The bits after the cut begin `1001…`, which is more than half a unit in the last place, so the stored value rounds *up*: the last stored bits become `…1010`, which is the `a` at the end of `999999999999a`. The stored value is exactly

$$
0.1000000000000000055511151231257827021181583404541015625 = \frac{3602879701896397}{2^{55}}.
$$

Likewise `0.2` is $\frac{3602879701896397}{2^{54}}$ (the same numerator, one exponent higher) and `0.3` rounds *down* to $\frac{5404319552844595}{2^{54}} = 0.299999999999999988897769753748\ldots$

### The rounding trace of 0.1 + 0.2

The hardware adds the exact values, then rounds once to the nearest double. Step by step:

1. **Align exponents.** `0.1` has exponent −4, `0.2` has exponent −3. Shift `0.1`'s significand right by one bit so both are in units of $2^{-55}$: `0.1` is $3602879701896397 \times 2^{-55}$, `0.2` is $7205759403792794 \times 2^{-55}$.
2. **Add exactly.** $3602879701896397 + 7205759403792794 = 10808639105689191$, so the exact sum is $10808639105689191 \times 2^{-55}$.
3. **Normalise.** The result lies in $[0.25, 0.5)$, exponent −2, where doubles are spaced $2^{-54}$ apart: representable values are *even* multiples of $2^{-55}$. The sum's multiplier, $10808639105689191$, is odd, so it is not representable.
4. **Round.** The two neighbours are $10808639105689190 \times 2^{-55}$ (which is the double `0.3`) and $10808639105689192 \times 2^{-55}$. The exact sum is *exactly halfway* between them. IEEE 754's default rounding is round-half-to-even: pick the neighbour whose significand is even. $10808639105689190 / 2 = 5404319552844595$, odd; $10808639105689192 / 2 = 5404319552844596$, even. The tie goes up.
5. **Result.** $5404319552844596 \times 2^{-54} = 0.3000000000000000444089209850062616\ldots$, printed by Python's shortest-round-trip algorithm as `0.30000000000000004`.

So `0.1 + 0.2 != 0.3` is not "floating point is imprecise"; it is two representation roundings and one tie broken by a rule you can name. The same trace on `0.1 * 3` gives the same answer, and on `0.5 + 0.25` gives exactly `0.75`, because halves and quarters are binary fractions.

### Rules that follow from the representation

- **Precision is relative.** The gap between adjacent doubles (one *unit in the last place*, `math.ulp`) is $2.2 \times 10^{-16}$ near 1, $1.2 \times 10^{-4}$ near $10^{12}$, $0.125$ near $10^{15}$, and $2$ at $2^{53}$. About 15.95 significant decimal digits, everywhere.
- **Compare with a tolerance whose scale you chose.** Measured: `math.isclose(1e12, 1e12 + 0.0002, rel_tol=1e-9)` is `True`; `abs(a - b) <= 1e-9` on the same pair is `False`, because $10^{-9}$ is smaller than the spacing of doubles at that magnitude. Use a relative tolerance, or an absolute one derived from your units.
- **Order of operations changes the answer.** `(1e16 + 1.0) - 1e16` is `0.0` because `1e16 + 1.0` rounds back to `1e16` (the spacing there is 2). Summing many values of mixed magnitude accumulates this; `math.fsum` (exactly rounded), Kahan compensated summation, and NumPy's pairwise summation exist to control it.
- **`NaN` is not equal to anything, including itself**, and it poisons ordering. Run it: `sorted([3.0, nan, 1.0, 2.0, nan, 0.5])` returns `[3.0, nan, 1.0, 2.0, nan, 0.5]`, *unchanged*, because every comparison with `nan` is false and the sort's invariant collapses. `x != x` is the portable NaN test; filter NaNs before sorting or use a key that maps them to an end.
- **Money is not a float.** `0.1 * 3` is `0.30000000000000004`; `Decimal("0.1") * 3` is `0.3`. Store cents (or the smallest unit) as integers, or use a decimal type (`decimal.Decimal`, Java `BigDecimal`, Postgres `numeric`). The drift of a float ledger is small per transaction and unbounded over time.
- **Compile-time constants may be exact.** Go prints `0.1 + 0.2` as `0.3`, not because Go's floats differ but because its untyped constants are arbitrary-precision at compile time and rounded once at the end. The same expression on two runtime variables gives `0.30000000000000004`. Reading a language's behaviour off a constant expression is a classic way to be misled.

Single-precision `float32` has 23 fraction bits and about 7 decimal digits; measured, `float32(16777217)` is `16777216`, because $2^{24} + 1$ needs 25 significant bits. A counter kept in `float32` stops incrementing at 16,777,216, which is a real bug in ML pipelines and game engines. `bfloat16` and `float16` have fewer bits still; the choice is a throughput-versus-accuracy trade.

| Representation | Exact for | Range | Cost | Use for |
|---|---|---|---|---|
| `int64` of smallest units (cents) | all integers to $9.2 \times 10^{18}$ | fixed | one machine word, one instruction | money, counters, IDs |
| Arbitrary-precision int (Python `int`, `BigInt`) | every integer | unbounded | allocation per result, cost grows with digits | hashes and factorials in Python, IDs beyond $2^{53}$ in JavaScript |
| Decimal (`Decimal`, `BigDecimal`, `numeric`) | decimal fractions to chosen precision | huge | software arithmetic, many times slower than a hardware double | financial arithmetic with fractions of a unit, tax rates |
| `float64` | binary fractions with $\le 53$ significant bits | $\pm 1.8 \times 10^{308}$ | one instruction, vectorisable | physics, statistics, anything measured |
| `float32` / `bfloat16` | 24 / 8 significant bits | narrower | half or a quarter of the memory bandwidth | ML weights and activations, graphics |

## Strings: immutable, and therefore built carefully

In Python, JavaScript, Java, Go and Rust's `&str`, a string is immutable: no operation changes an existing string; every "modification" creates a new one. That is what makes strings safe to share as dictionary keys and across threads, and it is what makes naive building quadratic in principle:

```python
line = ""
for field in fields:          # n fields of average length k
    line += field + ","       # a new string of the current length each time, in principle
```

Each `+=` copies everything accumulated so far, so the total copying is $k + 2k + \cdots + nk = O(n^2 k)$. The measured reality is more interesting than the principle, because runtimes rescue it in different ways, and the rescue is fragile:

| Building 100,000 six-character pieces | Time | Why |
|---|---|---|
| CPython, `s += piece` on a local variable | 1.46 ms | the specialised bytecode `BINARY_OP_INPLACE_ADD_UNICODE` sees that `s` has exactly one reference and the next instruction stores back to `s`, so it extends the buffer in place: linear |
| CPython, same loop with a second reference to `s` alive | 668 ms | the reference count is 2, the fast path is skipped, every `+=` copies: quadratic (doubling the pieces roughly quadruples the time) |
| CPython, `"".join(pieces)` | 0.21 ms | two passes, one allocation |
| V8, `s += piece` | 7.6 ms | `+` builds a **cons string** (a rope: a node pointing at both halves) without copying; the string is flattened once, on first indexed access, in 0.6 ms |
| V8, `parts.push(piece)` then `join("")` | 3.1 ms | one allocation of the final size |

The CPython fast path is not part of the language: it needs the target to be a local (a module-level `s` is stored with `STORE_NAME`, not `STORE_FAST`, and the same loop at module level took 4 seconds for 100,000 pieces), it needs the reference count to be exactly one (a debugger, a closure, a `keep = s` line, or a list holding an old value defeats it), and [PyPy's performance notes](https://www.pypy.org/performance.html) say the same loop is quadratic there. V8's rope is more robust but costs an extra flatten and more memory. `join` and builders (`strings.Builder` in Go, `String::with_capacity` plus `push_str` in Rust, `StringBuilder` in Java) are linear in every runtime and are the answer when the code must be fast everywhere:

```python
line = ",".join(fields)                     # Python: one allocation, O(total length)
```

```go
var sb strings.Builder                      // Go: amortised O(1) appends, one final string
for _, f := range fields { sb.WriteString(f); sb.WriteByte(',') }
line := sb.String()
```

Slicing follows the container rule from the [previous lesson](/learn/foundations/how-code-runs/values-references-and-mutation): Python `s[a:b]` copies, Go `s[a:b]` shares the bytes ($O(1)$, but pins the whole original in memory), Java copies since 7u6 (it used to share, and a kept substring pinned its parent), Rust `&s[a..b]` is a borrowed view. A function that takes substrings of a 1 GB log in Python copies; in Go it keeps the gigabyte alive as long as any substring exists.

## Unicode: four different lengths for one string

"Character" is not a unit of storage. There are four different things you might mean, and languages pick different ones as their default.

- **Code point**: a number in the range 0 to 0x10FFFF, such as U+00E9 (é) or U+1F44D (👍).
- **Code unit**: the storage unit of an encoding. UTF-8 units are bytes (a code point takes 1–4); UTF-16 units are 16-bit (a code point takes 1, or 2 as a *surrogate pair* for anything above U+FFFF); UTF-32 units are 32-bit (always 1).
- **Byte**: what goes on the wire or disk, always in some encoding, almost always UTF-8 today.
- **Grapheme cluster**: what a human calls one character, defined by Unicode's segmentation rules (UAX #29).

Take `"héllo 👍🏽"`: h, é as the single code point U+00E9, l, l, o, space, thumbs-up U+1F44D, skin-tone modifier U+1F3FD. The actual bytes:

```text
UTF-8  (15 bytes):  68 | c3 a9 | 6c | 6c | 6f | 20 | f0 9f 91 8d | f0 9f 8f bd
UTF-16 (10 units):  0068 | 00e9 | 006c | 006c | 006f | 0020 | d83d dc4d | d83c dffd
```

| Measure | Value | Who reports it |
|---|---|---|
| Grapheme clusters | 7 | a human; `Intl.Segmenter` (measured: 7); `\X` in a Unicode-aware regex; Swift `String.count` |
| Code points | 8 | Python `len`, Rust `s.chars().count()`, Go `utf8.RuneCountInString`, JavaScript `[...s].length` |
| UTF-16 code units | 10 | JavaScript `.length`, Java `String.length()` |
| UTF-8 bytes | 15 | Go `len(s)`, Rust `s.len()`, `TextEncoder` (measured: 15), the size on disk |

### Deriving the bytes by hand

UTF-8 packs a code point's bits into a leading byte that says how long the sequence is, followed by continuation bytes of the form `10xxxxxx`:

| Code point range | Layout | Example |
|---|---|---|
| U+0000–U+007F | `0xxxxxxx` | `h` = 0x68 |
| U+0080–U+07FF | `110xxxxx 10xxxxxx` | é U+00E9 = `000 11101001` → `110 00011`, `10 101001` = `c3 a9` |
| U+0800–U+FFFF | `1110xxxx 10xxxxxx 10xxxxxx` | € U+20AC = `0010 000010 101100` → `e2 82 ac` |
| U+10000–U+10FFFF | `11110xxx 10xxxxxx 10xxxxxx 10xxxxxx` | 😀 U+1F600 = `000 011111 011000 000000` → `f0 9f 98 80` |

UTF-16 stores U+0000–U+FFFF directly and splits anything above into a surrogate pair. For 👍 U+1F44D: subtract 0x10000 to get 0xF44D (20 bits: `0000111101 0001001101`); the high surrogate is 0xD800 + the top ten bits, $0xD800 + 0x3D = 0xD83D$; the low surrogate is 0xDC00 + the bottom ten bits, $0xDC00 + 0x04D = 0xDC4D$. That is the `d83d dc4d` in the dump, and it is why one emoji is two of JavaScript's "characters".

Grapheme clusters are the messiest unit because they are defined by rules, not arithmetic: a base character plus any number of combining marks is one cluster; an emoji plus a skin-tone modifier is one; emoji joined by U+200D (zero-width joiner) are one; a pair of regional-indicator symbols (a flag) is one; Hangul syllables compose from jamo. The family emoji 👨‍👩‍👧‍👦 measures 7 code points, 25 UTF-8 bytes, 11 UTF-16 units, and 1 grapheme cluster (`Intl.Segmenter` says 1). No language's built-in `len` counts clusters; you need the segmentation library (`Intl.Segmenter`, ICU, Rust's `unicode-segmentation`, Python's `regex` module with `\X`).

### The bugs this produces

- **Truncation in the middle of a character.** Go's `s[:2]` on `"héllo…"` returns `"h\xc3"`, half of é, invalid UTF-8 that a JSON encoder later rejects or replaces with U+FFFD. JavaScript's `"👍".slice(0, 1)` returns `"\ud83d"`, a lone surrogate that cannot be encoded to UTF-8 at all. Python slicing is code-point safe but can still split a grapheme (the modifier from its emoji).
- **Reversing a string.** `"ab👍".split("").reverse().join("")` in JavaScript produces two broken surrogates followed by `ba`; `[..."ab👍"].reverse().join("")` gives `👍ba`, correct for this string and still wrong for `"é"` (the accent moves to the wrong letter). The interview answer is "reverse by grapheme cluster, which needs a library", and knowing that is the point.
- **Database column limits.** MySQL `VARCHAR(255)` counts characters, but its legacy `utf8` charset is 3-byte-max and rejects emoji (`Incorrect string value`); `utf8mb4` is real UTF-8. Postgres `varchar(n)` counts characters. Redis and most byte-oriented stores count bytes. A "255-character" limit enforced in JavaScript by `.length` admits up to 765 bytes (255 three-byte characters such as CJK), and one enforced by counting code points admits up to 1,020 bytes of emoji.
- **Equality.** `"é"` (U+00E9) and `"é"` (e plus combining acute) render identically and compare unequal (`len` 1 versus 2). Normalise (NFC composes, NFD decomposes; `unicodedata.normalize`, `String.prototype.normalize`) before comparing user input, and casefold rather than lowercase for case-insensitive matches: `"Straße".casefold()` is `"strasse"` while `.lower()` leaves `ß` alone.
- **Indexing cost.** Python's `str` stores each string in the narrowest fixed width that fits all its code points (PEP 393), so `s[i]` is $O(1)$; Go and Rust store UTF-8, so `s[i]` is a *byte* and the $i$-th code point is $O(n)$ away; JavaScript's `s[i]` is a UTF-16 unit, half an emoji.

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

## Under the hood: what the runtimes store

**CPython integers** are arrays of 30-bit digits (`ob_digit`) with a sign and a digit count in the header. Measured with `sys.getsizeof`: `0` and `1` are 28 bytes, $2^{30}$ is 32 (a second digit), $2^{60}$ is 36, $2^{100}$ is 40. Values from −5 to 256 are preallocated singletons; everything else is allocated per result, which is why `s += x` in a loop costs an allocation per iteration and why the [cost model lesson](/learn/foundations/complexity/why-big-o) measured 11 ns per addition. Multiplication switches to Karatsuba above 70 digits.

**CPython strings** (PEP 393) pick the narrowest width that holds every code point in the string: 1 byte per code point for Latin-1, 2 for anything up to U+FFFF, 4 otherwise. Measured: `"abc"` is 44 bytes (41 of header), `"abé"` 60 (still 1 byte per code point, but a non-ASCII string also caches its UTF-8 form's length), `"ab€"` 64 (2 bytes per code point), `"ab😀"` 72 (4 per code point). One hundred ASCII characters cost 141 bytes; ninety-nine ASCII characters plus one emoji cost 460, because the whole string is promoted to 4 bytes per code point. That is the price of $O(1)$ indexing.

**V8** stores small integers as tagged immediates (Smis) inside the pointer word (31 bits with pointer compression, as in Chrome; 32 bits in a default 64-bit Node build), and every other number as a heap-allocated double (HeapNumber). Strings come in several representations: sequential one-byte (Latin-1) or two-byte (UTF-16), cons strings (ropes, the result of `+`), sliced strings (views into a parent, for substrings longer than about 13 characters) and external strings. `s.length` is stored, not computed; indexing a cons string flattens it first, which is the 0.6 ms in the table above.

**Go** strings are a two-word header (pointer, byte length) over immutable UTF-8 bytes; `s[a:b]` copies the header and shares the bytes, and `range` decodes UTF-8 on the fly, yielding runes. Nothing guarantees the bytes are valid UTF-8, which is how `s[:2]` can produce `"h\xc3"`. **Rust** `String` and `&str` guarantee valid UTF-8 at the type level: slicing at a non-boundary panics rather than producing garbage, and `.chars()` decodes.

## Failure modes in production

**IDs off by a few in a JavaScript client.** *Symptom:* a client fetches record `9007199254740993` and displays or updates `9007199254740992`; the bug appears only for IDs issued after the ID space crossed $2^{53}$, years into a system's life. *Diagnosis:* `JSON.parse` produced a double; check whether any ID in the payload exceeds `Number.MAX_SAFE_INTEGER`. *Fix:* serialise 64-bit IDs as strings server-side, and on the client keep them as strings or parse with a `BigInt` reviver; never do arithmetic on them as `number`.

**Emoji rejected or mangled by the database.** *Symptom:* inserts fail with `Incorrect string value: '\xF0\x9F...'`, or names come back with `?`. *Diagnosis:* a MySQL column or connection in the legacy `utf8` (3-byte) charset; the 4-byte sequences for anything above U+FFFF do not fit. *Fix:* `utf8mb4` on the column, the table and the connection; re-check any `VARCHAR(255)` indexes, whose byte budget shrinks when each character may be 4 bytes.

**A length limit that means four different things.** *Symptom:* the front end accepts a 255-"character" display name, the API accepts it, the database rejects or silently truncates it. *Diagnosis:* the front end counted UTF-16 units, the API counted code points, the store counted bytes; 127 emoji plus one letter is 255 units, 128 code points and 509 bytes. *Fix:* pick one unit (bytes of UTF-8 is the honest one for storage; grapheme clusters for what a user sees), enforce it at every layer with the same function, and state it in the API contract.

**Cent-level drift in a ledger.** *Symptom:* two systems that sum the same transactions disagree by a few cents at month end; the difference grows with volume. *Diagnosis:* one system sums in `float64`; each addition can be off by half an ulp of the running total, and after a million additions of values near $10^{6}$ the total is near $10^{12}$, where an ulp is $1.2 \times 10^{-4}$, so a million roundings of up to $6 \times 10^{-5}$ each surface as cents. *Fix:* integer cents (or micros) end to end, `Decimal` where fractions of a cent are contractual, and a reconciliation check that treats any non-zero difference as a bug rather than rounding.

## Interviewer follow-ups

**"Why is `0.1 + 0.2 != 0.3`, precisely?"** *Model answer:* 0.1 and 0.2 are both rounded up when converted to binary (the same 52-bit fraction, exponents one apart); their exact sum lands exactly halfway between two doubles near 0.3, and round-half-to-even picks the upper one, which is one ulp above the double nearest 0.3. *Common wrong answer:* "floats are imprecise", which is true and explains nothing, or "Python has a bug".

**"How would you compare two floats for equality in a test?"** *Model answer:* with a tolerance that matches the scale: a relative tolerance (`math.isclose` with `rel_tol`) for values whose magnitude varies, an absolute tolerance in the quantity's units when it is near zero; and if the values are money, the test is wrong to have floats at all. *Common wrong answer:* `abs(a - b) < 1e-9` regardless of magnitude, which fails near $10^{12}$ and passes everything near $10^{-12}$.

**"What is the length of `"👍🏽"`?"** *Model answer:* it depends on the unit: 1 grapheme cluster, 2 code points, 4 UTF-16 units (JavaScript's `.length`), 8 UTF-8 bytes; I would ask which the requirement means before validating, and store the byte count if the limit is about storage. *Common wrong answer:* a single number.

**"Your binary search uses `(lo + hi) / 2`. Any issue?"** *Model answer:* in a 32-bit language it overflows once `lo + hi` exceeds $2^{31} - 1$, which happens for arrays over about a billion elements; `lo + (hi - lo) / 2` cannot overflow. In Python it is harmless. *Common wrong answer:* "no, the array can't be that big", which is the assumption that shipped the bug in Java's standard library.

## What mid-level engineers get wrong

- **Writing an overflow check in C that the compiler deletes.** `x + 1 > x` is folded to true; the shipped binary has no check. Use unsigned arithmetic or the overflow intrinsics.
- **Rounding money to "fix" float drift.** It hides the error; integer cents remove it.
- **Enforcing a string limit with `.length` in JavaScript and expecting it to bound bytes.** It bounds UTF-16 units; the UTF-8 byte count can be three times as large.
- **Reversing or truncating by index.** Any of the four units can split a character that a human sees as one; only grapheme segmentation is safe, and it needs a library.
- **Relying on the `+=` fast path.** A second reference or a non-local target turns a 1 ms loop into a 4 s one with no code change.

## Senior signals

- You state the overflow behaviour of your language before writing arithmetic on large values, know that C's signed overflow is undefined, and write `lo + (hi - lo) // 2` by reflex.
- You know that JavaScript has no integer type, where $2^{53}$ comes from in the bit layout, and why 64-bit IDs travel as strings.
- You can unpack a double into sign, exponent and fraction, explain why 0.1 rounds up and 0.3 rounds down, and trace the tie-to-even that makes `0.1 + 0.2` land one ulp high.
- You compare floats with a tolerance of stated scale, keep money in integers or decimals, and know that a NaN breaks sorting.
- You build strings with `join` or a builder and can name the fast paths that make `+=` linear (CPython's refcount-one resize, V8's cons strings) and what defeats them.
- You can say what "length" means in four units, derive UTF-8 bytes and UTF-16 surrogates by hand, and normalise user text before comparing it.
- You know which of your storage layers count bytes and which count characters, and you set limits accordingly.

## Check yourself

```quiz
- q: >-
    A Java method computes `int mid = (lo + hi) / 2` in a binary search over an array of 1.5 billion elements. What goes wrong and when?
  options: ["It fails at once, since Java arrays cap at 1 billion elements", "lo + hi overflows in the upper half, so mid goes negative", "Nothing; ints are 32-bit and 1.5 billion fits", "The division truncates, so the search skips the last element"]
  answer: 1
  explanation: >-
    1.5 billion fits in an int, but lo + hi can reach 3 billion once the search range is in the upper part of the array, which exceeds 2^31 - 1 and wraps to a negative index. Use lo + (hi - lo) / 2. The truncation is normal and harmless.
- q: >-
    A JSON API returns `{"id": 9007199254740993}`. A JavaScript client parses it with JSON.parse. What does the client hold?
  options: ["9007199254740993 exactly, since doubles hold integers", "9007199254740992, rounded to the nearest double", "A BigInt, because JSON.parse detects large integers", "A string, since the value is too big for a number"]
  answer: 1
  explanation: >-
    JSON.parse produces a double; 2^53 + 1 exceeds the range where doubles hold every integer (the fraction's last bit is worth 2 there), so it rounds to 2^53. Neither BigInt nor a string is produced automatically. This is why large IDs are sent as strings.
- q: >-
    The exact sum of the doubles 0.1 and 0.2 lies exactly halfway between two representable doubles. Which one does the hardware return, and why?
  options: ["The upper one, because ties round to the even significand", "Whichever is closer to the decimal 0.3, which is the lower one", "The upper one, because the hardware always rounds up on ties", "The lower one, because ties round toward zero"]
  answer: 0
  explanation: >-
    IEEE 754's default mode is round-half-to-even: on an exact tie, pick the neighbour whose significand is even. The upper neighbour's significand (5404319552844596) is even and the lower's (5404319552844595, the double nearest 0.3) is odd, so the result is one ulp above 0.3. Rounding toward zero and always-up are other modes, not the default, and the decimal value of 0.3 plays no part in the decision.
- q: >-
    You need to check whether two doubles a and b, both around 10^12, are "equal". Which test is appropriate?
  options: ["isclose(a, b, rel_tol=0, abs_tol=1e-9)", "abs(a - b) <= 1e-9 * max(a, b)", "int(a * 1e9) == int(b * 1e9)", "round(a, 9) == round(b, 9)"]
  answer: 1
  explanation: >-
    Near 10^12 the spacing between adjacent doubles is about 1.2 × 10^-4, so an absolute tolerance of 10^-9 (which is all isclose does when rel_tol is 0) is smaller than a single rounding step and will spuriously fail. A relative tolerance scales with the magnitude (for positive values max(a, b) is the scale). Rounding or truncating to nine decimals changes nothing at that scale, so two values one rounding step apart still compare unequal.
- q: >-
    In JavaScript, `"👍🏽".length` is 4 and `[..."👍🏽"].length` is 2. Why?
  options: ["The first counts UTF-8 bytes; the second, characters", "The first double-counts the emoji due to a V8 bug", "The first counts code points; the second, grapheme clusters", "The first counts UTF-16 units; the second, code points"]
  answer: 3
  explanation: >-
    .length is UTF-16 units and each of the two supplementary code points (thumbs up plus skin-tone modifier) needs a surrogate pair, d83d dc4d and d83c dffd. Spreading iterates by code point, giving 2. The UTF-8 encoding would be 8 bytes, not 4. A human sees one grapheme cluster; only Intl.Segmenter counts that.
- q: >-
    A CPython loop builds a string with `s += piece` in 1.5 ms for 100,000 pieces. A colleague adds `previous = s` inside the loop for logging and the same loop takes 668 ms. What happened?
  options: ["The interpreter switched from ropes to flat strings when memory grew", "The extra assignment doubles the work, so it should be about 3 ms", "The second reference defeats the in-place resize, so every += now copies", "Logging forces the string to be re-encoded as UTF-8 on each iteration"]
  answer: 2
  explanation: >-
    BINARY_OP_INPLACE_ADD_UNICODE extends the buffer in place only when the target string's reference count is exactly one and the result is stored back to the same local. A second reference makes the string shared, so each += allocates and copies the whole accumulated string: quadratic, which is what a 450× slowdown at n = 100,000 looks like. CPython has no ropes (that is V8), and no encoding happens on concatenation.
```
