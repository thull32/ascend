---
slug: strings-in-depth
title: Strings in depth
description: Why strings are immutable, what concatenation in a loop really costs and when CPython makes it linear anyway, how CPython (PEP 393), V8, Java, Go and Rust lay out text in memory byte by byte, and the Unicode pitfalls that break "simple" string code.
minutes: 45
difficulty: medium
tags: [strings, unicode, immutability, string-builder, utf-8, pep-393, v8]
problems: [valid-anagram, valid-palindrome, encode-decode-strings]
---
A service builds a 1 MB report by doing `out += line` for 40,000 lines. In one runtime it takes about a millisecond; in another it takes seconds and a garbage-collection storm. Same algorithm, same complexity on paper. The difference is what `+=` on a string means: whether it can extend the existing bytes in place, or has to allocate a fresh copy of everything so far.

Strings are arrays of characters with two extra rules imposed on top: in most languages you cannot change them after creation, and "character" turns out to be a much harder word than it looks. Both rules shape every string operation's cost, and this lesson puts byte counts and measured times on each.

## Why strings are immutable

Python, JavaScript, Java, Go and C# all make strings immutable. Rust has both (`&str` is an immutable view, `String` is an owned, growable buffer). The reasons are practical rather than philosophical:

- **Hashing.** A string used as a dictionary key must not change while it sits in the table, or it lands in the wrong bucket forever. Immutability lets Python and Java cache the hash inside the object: the first `hash(s)` is O(n), every later one reads a field.
- **Sharing.** Immutable strings can be passed to any function, stored in any structure, and aliased freely without defensive copies. Substrings can share the parent's buffer; Java did this until JDK 7u6 (2012) and stopped because a 10-character substring pinned a 10 MB parent in memory. Go still does it (`s[i:j]` is a 16-byte header pointing into the parent), so the pinning hazard is yours to manage.
- **Interning.** Identical literals can be deduplicated into one object; CPython interns identifiers and V8 internalises property names, which makes attribute lookup a pointer comparison.
- **Safety.** Filenames, URLs and SQL fragments cannot be modified by another thread between validation and use.

The cost is that *every* modification is a new allocation plus a copy. That is fine for a single concatenation and disastrous for a loop of them.

## Hand trace: concatenation in a loop

```python
out = ""
for line in lines:      # n lines of k bytes each
    out += line
```

Under the naive model, iteration `i` allocates a new string and copies the `(i − 1) × k` bytes already accumulated plus the `k` new ones. With `k = 25`:

| iteration | length before | copy-everything model: bytes copied | cumulative | extend-in-place model: bytes copied | cumulative |
|---|---|---|---|---|---|
| 1 | 0 | 25 | 25 | 25 | 25 |
| 2 | 25 | 50 | 75 | 25 | 50 |
| 3 | 50 | 75 | 150 | 25 | 75 |
| 4 | 75 | 100 | 250 | 25 | 100 |
| 5 | 100 | 125 | 375 | 25 | 125 |

The left model sums to `k × n(n+1)/2`: for 40,000 lines of 25 bytes that is 2 × 10¹⁰ byte-copies (20 GB of `memcpy`) to produce a 1 MB string. The right model copies each byte once, 1 MB in total.

## Which runtimes make `+=` linear

| Runtime | `s += t` in a loop | Why |
|---|---|---|
| CPython 3.11+ | O(n) total *inside a function, on a local, with no other reference* | The specialised `BINARY_OP_INPLACE_ADD_UNICODE` instruction extends the buffer with `realloc` (next section). Otherwise quadratic. |
| V8 (Node, Chrome) | O(n) total | Concatenation of results 13 characters or longer creates a *cons string* (a two-pointer rope node) in O(1); the flat copy is deferred until something indexes, hashes or compares the string. |
| Java | O(n²) | Each `+` allocates. `javac` rewrites a single expression `a + b + c` into one builder call (`StringBuilder` up to JDK 8, `invokedynamic` since 9), never across loop iterations. |
| Go | O(n²) | `s += t` allocates `len(s) + len(t)` bytes and copies both. Use `strings.Builder`. |
| Rust | O(n) amortised | `String` is a `Vec<u8>` with a UTF-8 guarantee; `push_str` and `s += &t` append in place, doubling capacity when full. |

Measured on CPython 3.14.7 for the 40,000 × 25-byte loop: 1 ms when the three conditions hold, 690 ms when `out` is a module global, 4,100 ms when a second reference to the intermediate string exists, 2,500 ms when the string was hashed before each append. All three slow cases are the 20 GB of copying; they differ only in how the allocator handles the churn.

The portable answer is a **builder**: collect pieces, join once. `"".join(parts)` makes two passes, one to sum the lengths and allocate exactly once, one to copy each piece into place; the same loop with a list and a final join also took 1 ms. JavaScript's `parts.join("")`, Java's `StringBuilder`, Go's `strings.Builder` and Rust's `String::with_capacity` do the same job. The rule to carry: *if you cannot state why your runtime makes `+=` linear, use a builder.*

## Under the hood: CPython's `+=` exception

The optimisation lives in the bytecode interpreter, not in `str`. When the specialising interpreter (3.11+) sees `s += t` or `s = s + t` on two `str` objects where the next instruction is `STORE_FAST` back into the same local, it specialises to `BINARY_OP_INPLACE_ADD_UNICODE`. That instruction drops the stack's reference to `s` (leaving only the local's) and calls `PyUnicode_Append`, which resizes in place when `unicode_modifiable` says it may:

1. the refcount is exactly 1 (no alias, no container holding it, no other frame);
2. the hash has not been computed (`hash == -1`), because a resized string would have a different hash;
3. the string is not interned;
4. it is exactly `str`, not a subclass;
5. the right operand's kind (1, 2 or 4 bytes per code point) is not wider than the left's, since widening needs a new layout.

When all five hold, the C `realloc` extends the block; above glibc's mmap threshold that is often an `mremap` that moves page-table entries rather than bytes. When any fails, `PyUnicode_Concat` allocates and copies. That is why the measured loop was 1 ms as a local and 690 ms as a global (`STORE_GLOBAL` is not the specialised shape), and why `keep = s` or `hash(s)` inside the loop sent it to 4.1 s and 2.5 s. PyPy does not do this at all. Depend on it in a hot path and a refactor that moves the loop to module scope, or logs the intermediate value, silently reintroduces the quadratic.

## Under the hood: CPython's PEP 393 layout

Since Python 3.3, a `str` stores every code point at the same width, chosen as the smallest of 1, 2 or 4 bytes that fits the widest character in the string. Measured with `sys.getsizeof` on CPython 3.14.7:

| string | code points | bytes per code point | `sys.getsizeof` | how it adds up |
|---|---|---|---|---|
| `""` | 0 | 1 (ASCII) | 41 | 40-byte header + 0 + 1 terminator |
| `"hello, world"` | 12 | 1 (ASCII) | 53 | 40 + 12 + 1 |
| `"aé"` | 2 | 1 (Latin-1) | 59 | 56-byte header + 2 + 1 |
| `"€"` | 1 | 2 | 60 | 56 + 2 × (1 + 1) |
| `"😀"` | 1 | 4 | 64 | 56 + 4 × (1 + 1) |
| `"a" * 1000` | 1,000 | 1 | 1,041 | 40 + 1,000 + 1 |
| `"a" * 999 + "é"` | 1,000 | 1 | 1,057 | 56 + 1,000 + 1 |
| `"a" * 999 + "€"` | 1,000 | 2 | 2,058 | 56 + 2 × 1,001 |
| `"a" * 999 + "😀"` | 1,000 | 4 | 4,060 | 56 + 4 × 1,001 |

The 40-byte ASCII header is refcount (8), type pointer (8), length (8), cached hash (8) and a state word (4, padded to 8). Non-ASCII strings carry 16 more bytes: a cached UTF-8 length and pointer, filled in the first time C code asks for the UTF-8 form. (Single Latin-1 characters such as `"é"` are cached singletons that already carry that UTF-8 copy, which is why `sys.getsizeof("é")` reports 61 rather than 59.) On 3.3–3.11 each header was 8 bytes larger because of a since-removed `wstr` pointer, so `sys.getsizeof("")` was 49 there.

Two consequences: `s[i]` is O(1) by code point, because the string is a plain array of fixed-width cells; and one emoji quadruples a large string. A 1 GB in-memory text corpus held as one ASCII `str` becomes 4 GB the moment a single astral-plane character is concatenated into it.

## Under the hood: V8, Java, Go, Rust and Redis

**V8** stores strings as one-byte (Latin-1) or two-byte (UTF-16) sequences and caches the hash in the header. Concatenation whose result has 13 or more characters (`ConsString::kMinLength`) produces a cons string: two pointers, no copy. Substrings of 13 or more characters produce a sliced string that shares the parent. Indexing, comparison, hashing or a regex on a cons string first *flattens* it, one O(n) copy, which is the pause that lands in a hot loop after a million cheap concatenations. The maximum length is `2²⁹ − 24` code units (about 536 million) on 64-bit builds; exceeding it throws `RangeError: Invalid string length`.

**Java 9+** uses compact strings: a `byte[]` with a `coder` byte, 1 byte per char when everything fits Latin-1, else UTF-16. The hash is cached in an `int` field. `substring` copies.

**Go** represents a string as a 16-byte header (pointer, length) over immutable UTF-8 bytes. `len(s)` counts bytes, `s[i]` is a byte, and `for _, r := range s` decodes runes. `strings.Builder` appends to a `[]byte` and returns the result without a copy via `unsafe`. **Rust**'s `String` is a 24-byte `Vec<u8>` header and `&str` a 16-byte fat pointer; byte-range slicing panics off a character boundary, and `s.chars().nth(i)` is O(n).

**Redis** stores every key and value as an SDS (simple dynamic string): a small length-prefixed header (3 bytes for strings under 256 bytes) so `STRLEN` is O(1) and the bytes may contain NUL. On growth SDS doubles the allocation while it is below 1 MB and adds 1 MB beyond that, the same amortisation argument as a dynamic array, tuned for its own traffic; see [Key-value stores and Redis](/learn/databases/nosql-and-specialised/key-value-stores-and-redis).

## Code points, code units and grapheme clusters

"Character" hides three things, and string APIs disagree about which one `len` and `s[i]` operate on. A **code point** is a Unicode number (`U+0041` is `A`); a **code unit** is the storage chunk of an encoding (1 byte in UTF-8, 2 in UTF-16); a **grapheme cluster** is what a person sees as one character. The rows below were computed, not assumed:

| text | code points | UTF-8 bytes | UTF-16 units (JS `length`) | Python `len` | grapheme clusters |
|---|---|---|---|---|---|
| `é` as `U+00E9` | 1 | 2 (`C3 A9`) | 1 | 1 | 1 |
| `é` as `e` + `U+0301` (combining acute) | 2 | 3 (`65 CC 81`) | 2 | 2 | 1 |
| `😀` `U+1F600` | 1 | 4 (`F0 9F 98 80`) | 2 (`D83D DE00`, a surrogate pair) | 1 | 1 |
| `👨‍👩‍👧` (`U+1F468 U+200D U+1F469 U+200D U+1F467`) | 5 | 18 | 8 | 5 | 1 |
| `🇬🇧` (`U+1F1EC U+1F1E7`) | 2 | 8 | 4 | 2 | 1 |
| `中` `U+4E2D` | 1 | 3 | 1 | 1 | 1 |

Consequences you will hit in interviews and in production:

1. **"Reverse a string" is not `s[::-1]`.** Reversing `e` + `U+0301` by code point yields `U+0301` + `e`, which renders the accent on the wrong letter. Reversing by UTF-16 unit in JavaScript turns `😀` into two lone surrogates. Correct reversal iterates grapheme clusters (`Intl.Segmenter` in Node 16+ with full ICU, Python's third-party `regex` module with `\X`, Rust's `unicode-segmentation`). In an interview, say "I'll assume ASCII; for Unicode I would reverse grapheme clusters", and move on.
2. **Byte length is not character length.** A `VARCHAR(255)`, a 280-character post limit and an HTTP header size limit are measured in different units. Python's `len(s)` and `len(s.encode("utf-8"))` differ by up to 4×. Truncating a UTF-8 buffer at byte 255 can cut inside the `F0 9F 98 80` of an emoji and produce invalid UTF-8.
3. **Case changes length.** `"ß".upper()` is `"SS"` (two code points); `"ß".casefold()` is `"ss"`. Any index computed before `upper()` is wrong after it.

[Numbers, strings and Unicode](/learn/foundations/how-code-runs/numbers-strings-unicode) covers the encodings themselves.

## The cost of common operations

Assume a string of length `n` and a second string of length `m`.

| Operation | Cost | Notes |
|---|---|---|
| `len(s)` | O(1) | Stored in the header (bytes in Go and Rust, code points in Python, UTF-16 units in JS and Java) |
| `s[i]` | O(1) or O(n) | O(1) in Python, JS, Java, Go (by their own unit); O(n) by character in Rust and Go |
| `s[i:j]` slice | O(j − i) | Copies in Python and Java 7u6+; O(1) view in Rust and Go; sliced string in V8 above 13 characters |
| `s == t` | O(min(n, m)), often O(1) | CPython checks identity, then length and kind, then `memcmp`; a dict lookup compares hashes before calling `==` |
| `hash(s)` | O(n) once | Cached in CPython, Java and V8; recomputed per lookup in Rust and Go (their maps use keyed hashes) |
| `t in s` / `s.includes(t)` | O(n + m) typical | CPython uses a Boyer–Moore–Horspool-style fast search and, since 3.10, the Two-Way algorithm for long needles; V8 uses Boyer–Moore variants; see [String matching](/learn/data-structures/tries-and-string-structures/string-matching) |
| `s.split(sep)` | O(n) | Allocates every piece |
| `sep.join(parts)` | O(total length) | Two passes: measure, then copy |
| `s.replace(a, b)` | O(n + occurrences × m) | New string; original untouched |
| `s.lower()` | O(n) | May change length (`ß` → `SS`) |
| `sorted(s)` | O(n log n) | The anagram trick; a 26-slot count array is O(n) |

The line that matters most for interviews is slicing. `s[1:]` in a recursive function copies the rest of the string, so a recursion that peels one character per call copies `n²/2` bytes: 200 MB for a 20,000-character string, 5 × 10¹¹ bytes for a million. Pass indices, not slices.

## Builders and their internals

A builder is a dynamic array of bytes or code units with the same geometric growth as [dynamic arrays](/learn/data-structures/arrays-strings/arrays-and-dynamic-arrays). Python does not expose one directly (`io.StringIO` is close; a list plus `join` is idiomatic). Rust's `String` *is* one:

```rust
let mut out = String::with_capacity(lines.iter().map(|l| l.len() + 1).sum());
for line in &lines {
    out.push_str(line);
    out.push('\n');
}
```

Pre-sizing removes every reallocation. In Java, `new StringBuilder(expectedLength)` does the same; in Go, `builder.Grow(n)`.

V8's rope is the other design: never copy on concatenation, build a tree, flatten lazily. It makes `+=` cheap but makes the *first* `s[i]` after a million concatenations an O(n) flatten. Node code that streams a large response as chunks or `Buffer`s avoids both the flatten and the 2²⁹ length ceiling.

## Interview patterns that live on strings

Most string questions are array questions with a costume:

- **Counting characters.** For ASCII, an array of 128 (or 26) counters indexed by `ord(c) - ord('a')` is a perfect hash table: no hashing, one or two cache lines, and it makes "are these anagrams?" an O(n) pass with O(1) space. For arbitrary Unicode, use a hash map. [Valid Anagram](/practice/valid-anagram) is the canonical version.
- **Two pointers.** Palindromes, reversing words, comparing with skips: [Valid Palindrome](/practice/valid-palindrome). Python strings are immutable, so in-place work means converting to a `list` first and joining at the end.
- **Sliding window with counts.** Longest substring without repeats, anagram windows: a map (or 128-array) of counts in the window; the technique lesson is [Sliding window mastery](/learn/algorithms/technique-mastery/sliding-window-mastery).
- **Encoding.** Length-prefixed framing (`"5#hello3#foo"`) is how you make a string list round-trip through one string with no escape characters, and it is how Redis's SDS and every binary protocol work; see [Encode and Decode Strings](/practice/encode-decode-strings).
- **Run-length encoding.** Compress `"aaabcc"` to `"a3bc2"`: a read pointer that advances over a run and a builder for the output. This is the first exercise below.

```viz
{"type": "string", "algorithm": "run-length", "text": "aaabccdddd", "title": "Run-length encoding with a run pointer"}
```

The reverse-words visualiser shows the two-pointer version of a reversal that respects word boundaries:

```viz
{"type": "string", "algorithm": "reverse-words", "text": "the quick brown fox", "title": "Reverse words in place: reverse all, then each word"}
```

## Unicode pitfalls that ship bugs

- **Normalisation.** `"café"` typed on macOS may arrive as `c a f e U+0301` (NFD) while the database holds `c a f U+00E9` (NFC). They print identically, compare unequal (`"é" == "é"` is `False`) and hash differently. Normalise at the boundary (`unicodedata.normalize("NFC", s)`) before comparing, deduplicating or hashing.
- **Case folding is locale-sensitive.** In Turkish, `"i".upper()` is `"İ"`. Use `casefold()` rather than `lower()` for case-insensitive comparison.
- **Sorting is not code-point order.** `sorted(["b", "a", "é"])` puts `é` after `z` because `U+00E9 > U+007A`. Human-order sorting needs a collation (ICU); most systems accept code-point order and document it.
- **Invalid input.** Bytes that are not valid UTF-8 exist in every real dataset. Python raises `UnicodeDecodeError`; Go silently yields `U+FFFD`; Rust's `String::from_utf8` returns an error you must handle. Decide what your service does with them before the first customer file arrives.
- **Homoglyphs.** `"paypal"` with a Cyrillic `а` (`U+0430`) is a different string that renders identically. Any system that uses strings as identifiers needs a confusables check.
- **Hash flooding.** Attacker-chosen string keys with colliding hashes turn a dict into a linked list; CPython randomises its string hash per process (SipHash) for this reason. [Hash functions](/learn/data-structures/hashing/hash-functions) has the attack.

## Production failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| A Java or Go report generator pegs a core and its runtime grows with the square of the output size; GC logs show constant allocation of ever-larger byte arrays | `out += line` per line: each iteration copies everything accumulated so far | `StringBuilder` / `strings.Builder`, pre-sized from the expected total |
| MySQL `Incorrect string value` or Postgres `invalid byte sequence for encoding "UTF8"` on names with emoji | A 255-*byte* truncation cut through a 4-byte sequence, leaving invalid UTF-8 | Truncate by grapheme cluster, then check the encoded length against the column's unit |
| Accented users can log in from one OS but not another | NFC vs NFD forms of the same name, compared byte-for-byte | Normalise to NFC at every input boundary; migrate stored keys once |
| A Python process holding a large in-memory text index grew from 1 GB to 4 GB after a deploy that added emoji support | PEP 393 widened the whole string to 4 bytes per code point | Keep large corpora as UTF-8 `bytes`, or in chunks so widening is local |
| Node throws `RangeError: Invalid string length`, or a request stalls on its first `charAt` after building a huge string | The 2²⁹ − 24 length ceiling, or the deferred flatten of a cons string | Stream chunks / `Buffer`s; never materialise the whole response as one string |

## Trade-offs: string representations

| Representation | Used by | Index by code point | ASCII memory | CJK memory | Astral plane (emoji) | Concatenation |
|---|---|---|---|---|---|---|
| UTF-8 bytes | Go, Rust, Redis, files, HTTP | O(n) scan | 1 B per char | 3 B per char | 4 B, no surrogates | copy (Go), in-place append (Rust) |
| UTF-16 code units | JavaScript, Java (pre-9), Windows APIs | O(1) by unit, wrong across pairs | 2 B per char | 2 B per char | surrogate pairs; `length` counts 2 | ropes (V8), copy (Java) |
| Latin-1 or UTF-16 chosen per string | Java 9+ compact strings, V8 one-byte/two-byte | O(1) by unit | 1 B per char | 2 B per char | pairs, as above | as above |
| 1, 2 or 4 bytes chosen per string (PEP 393) | CPython 3.3+ | O(1) by code point | 1 B per char | 2 B per char | whole string widens to 4 B per char | copy, or in place under five conditions |
| Rope / cons tree | V8, text editors | O(depth) until flattened | as the leaves | as the leaves | as the leaves | O(1), paid back on first flatten |

## Interviewer follow-ups

**"Why is `s += t` in a loop fine in CPython but a bug in Java?"** Model answer: CPython's interpreter resizes the buffer in place when the string has a refcount of 1, no cached hash, is not interned, is exactly `str`, and the loop stores back into the same local; Java strings are immutable with no such path, and `javac` only fuses concatenations within one expression. Common wrong answer: "Python strings are mutable".

**"What is the length of `👨‍👩‍👧`?"** Model answer: it depends on the unit: 5 code points (`len` in Python), 8 UTF-16 units (`length` in JavaScript and Java), 18 UTF-8 bytes (`len` in Go), 1 grapheme cluster. Common wrong answer: 1, or 3.

**"How would you truncate a display name to 20 characters safely?"** Model answer: normalise to NFC, segment into grapheme clusters, keep the first 20, then encode and check the byte length against the storage limit; never `s[:20]` and never `s.encode()[:20]`. Common wrong answer: slice the string and pad.

**"Why does CPython cache a string's hash and Rust does not?"** Model answer: CPython owns an 8-byte header field and the hash function is fixed per process; Rust's `&str` is a 16-byte fat pointer with nowhere to put a hash, and each `HashMap` can use a different keyed hasher, so a cached value would be per-map, not per-string. Common wrong answer: "Rust strings are mutable so the hash could go stale".

## What mid-level engineers get wrong

- **Calling `s[::-1]` a Unicode-safe reversal.** Consequence: combining marks migrate to the wrong letter and surrogate pairs split in JavaScript; the bug surfaces only on non-ASCII input.
- **Using `len(s)` as a byte length.** Consequence: values that pass validation fail at the database or the wire, with an error that names the encoding rather than the code.
- **Using `lower()` for case-insensitive comparison.** Consequence: `ß`, Turkish `İ` and other folding cases compare unequal to their own variants.
- **Recursing with `s[1:]`.** Consequence: an O(n²) algorithm that passes small tests and times out at 10⁵ characters.
- **Trusting CPython's in-place `+=` in a hot path.** Consequence: a refactor that moves the loop to module scope or keeps a reference reintroduces a quadratic without changing a line of the loop.

## Exercises

```exercise
id: run-length-encode
title: Run-length encode a string
prompt: |
  Return the run-length encoding of `s`. Each maximal run of the same
  character becomes the character followed by the run length, except that a
  run of length 1 is written as the bare character. `"aaabccdddd"` becomes
  `"a3bc2d4"`. The empty string encodes to the empty string.

  Use a builder (a list you join at the end in Python; an array you join or
  a string you append to in JavaScript), not repeated slicing.
languages: [python, javascript]
entry: run_length_encode
starter:
  python: |
    def run_length_encode(s):
        # your code here
        return ""
  javascript: |
    function run_length_encode(s) {
      // your code here
      return "";
    }
tests:
  - args: ["aaabccdddd"]
    expected: "a3bc2d4"
  - args: [""]
    expected: ""
    label: empty string
  - args: ["abc"]
    expected: "abc"
    label: all runs of length 1
  - args: ["aabbaa"]
    expected: "a2b2a2"
    label: a character can start a new run later
  - args: ["zzzzzzzzzzzz"]
    expected: "z12"
    hidden: true
    label: multi-digit count
  - args: ["a"]
    expected: "a"
    hidden: true
hints:
  - "Keep an index `i`; advance a second index `j` while `s[j] == s[i]`; the run length is `j - i`."
  - "Append the character, then the count only if the run length is greater than 1."
```

```exercise
id: first-unique-char
title: First non-repeating character
prompt: |
  Return the index of the first character in `s` that appears exactly once,
  or -1 if there is none. The comparison is case-sensitive and the string is
  ASCII. Aim for two passes and O(1) extra space (a fixed-size count array).
languages: [python, javascript]
entry: first_unique_char
starter:
  python: |
    def first_unique_char(s):
        # your code here
        return -1
  javascript: |
    function first_unique_char(s) {
      // your code here
      return -1;
    }
tests:
  - args: ["swiss"]
    expected: 1
  - args: ["aabb"]
    expected: -1
    label: nothing unique
  - args: [""]
    expected: -1
    label: empty string
  - args: ["z"]
    expected: 0
  - args: ["abcabcx"]
    expected: 6
    hidden: true
  - args: ["aA"]
    expected: 0
    hidden: true
    label: case-sensitive
hints:
  - "First pass: count each character in an array of 128 indexed by its char code."
  - "Second pass: return the first index whose count is 1."
```

## Senior signals

- You can say precisely why `s += t` in a loop is linear in CPython (five conditions, local variable, no alias, no hash) and V8 (cons strings), quadratic in Java and Go, and you use a builder when you cannot.
- You can put byte counts on a CPython string (41 bytes empty, 40- or 56-byte header, 1/2/4 bytes per code point) and explain why one emoji quadruples a large ASCII string.
- You distinguish code points, code units and grapheme clusters, and you know which one your language's `len` counts for `👨‍👩‍👧`.
- You know that slicing copies in Python and Java and is a view in Rust and Go, so you pass indices in recursive string code.
- You normalise Unicode at system boundaries before comparing or hashing, truncate by grapheme cluster, and use `casefold` rather than `lower` for case-insensitive matching.
- You reach for a 26- or 128-slot count array for ASCII problems and can explain why it beats a hash map.
- You know V8 defers the copy until the first index and caps strings near 2²⁹ code units, so large responses are streamed rather than built.

## Check yourself

```quiz
- q: >-
    A Java method builds a 10 MB string by concatenating 200,000 pieces with `+=` in a loop. What is the dominant cost?
  options: ["Garbage-collecting the 200,000 pieces, which are freed one at a time", "Recopying the accumulated string on every iteration, O(n²) in total", "Hashing each intermediate string, which Java does on every allocation", "Encoding every piece to UTF-16, which doubles each ASCII character"]
  answer: 1
  explanation: >-
    Java strings are immutable and the compiler only fuses concatenations within a single expression. Each `+=` copies everything accumulated so far, giving roughly n²/2 character copies, on the order of 10¹² here. The garbage is a symptom; the copying is the cause. Java computes a string's hash lazily, only when something asks for it.
- q: >-
    Inside a function, `s += piece` in a loop runs in linear time on CPython 3.12. Which change makes the same loop quadratic?
  options: ["Keeping a second reference to `s` alive across the iteration", "Storing the pieces as bytes objects rather than str objects", "Appending a piece that is longer than the accumulated string", "Running the loop more than 1,000 times, past the realloc threshold"]
  answer: 0
  explanation: >-
    The in-place resize requires a refcount of exactly 1 after the stack reference is dropped, so an alias, a container holding the string, a cached hash, interning or a store into a global rather than a local all fall back to allocate-and-copy. Piece length and iteration count do not change the path, and bytes objects are a different type with their own copy behaviour.
- q: >-
    In JavaScript, `"👍".length` is 2 and `"👍".split("").reverse().join("")` produces garbage. Why?
  options: ["The emoji is a grapheme cluster of two code points that split separates", "split works on UTF-16 code units, cutting the emoji's surrogate pair in half", "split skips Unicode normalisation, so the reversed emoji ends up in NFD form", "split works on UTF-8 bytes, so it breaks the emoji's multi-byte encoding apart"]
  answer: 1
  explanation: >-
    U+1F44D is a single code point outside the Basic Multilingual Plane, stored as the two UTF-16 code units D83D DC4D; that is why length is 2. Splitting by code unit separates the pair and reversing produces two lone surrogates. It is not a multi-code-point grapheme cluster. Iterating with `for...of` or `Array.from` splits by code point instead.
- q: >-
    A 1,000-character ASCII string occupies 1,041 bytes in CPython 3.14. About how large is it after one emoji is appended?
  options: ["1,045 bytes, because only the emoji needs a 4-byte cell", "4,060 bytes, because every code point is now stored in 4 bytes", "1,057 bytes, because only the header grows to 56 bytes", "2,058 bytes, because the string switches to UTF-16 storage"]
  answer: 1
  explanation: >-
    PEP 393 chooses one width for the whole string from its widest character, so an astral-plane emoji forces 4 bytes per code point for all 1,001 of them: 56 + 4 × (1,001 + 1) = 4,060 bytes, measured with sys.getsizeof. A Latin-1 character such as é would only add the 16-byte non-ASCII header (1,057), and a BMP character such as € would double the cells (2,058).
- q: >-
    A recursive palindrome check calls itself with `s[1:-1]`. For a string of length n, what is the time complexity?
  options: ["O(n), because there are n/2 calls that each compare two characters", "O(n), because Python slices are O(1) views into the original buffer", "O(n²), because each call's slice copies the remaining string", "O(n log n), because the string halves at each level of the recursion"]
  answer: 2
  explanation: >-
    Python slicing allocates and copies. The call at depth d copies about n − 2d characters, so the total is quadratic even though there are only n/2 calls. Slices are O(1) views in Go and Rust, not in Python. Passing indices makes it linear.
- q: >-
    Two user records have names that print identically but fail to match on login. The most likely cause is:
  options: ["One was stored as UTF-8 and the other as UTF-16 before being decoded", "The column's collation sorts by code point, which breaks equality checks", "They use different normalisation forms (NFC vs NFD) of an accented letter", "One string is interned, so equality compares object identity instead"]
  answer: 2
  explanation: >-
    NFC and NFD encode the same visible text as different code-point sequences (U+00E9 versus e plus U+0301), so equality and hashing differ. Normalise at the boundary before comparing. Storage encoding does not affect equality after decoding, and interning never changes what `==` returns.
```
