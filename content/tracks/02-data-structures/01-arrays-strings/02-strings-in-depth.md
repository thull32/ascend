---
slug: strings-in-depth
title: Strings in depth
description: Why strings are immutable, what concatenation in a loop really costs, how Python, JavaScript, Rust and Go lay out text in memory, and the Unicode pitfalls that break "simple" string code.
minutes: 40
difficulty: medium
tags: [strings, unicode, immutability, string-builder, utf-8]
problems: [valid-anagram, valid-palindrome, encode-decode-strings]
---
A service builds a 5 MB report by doing `out += line` for 100,000 lines. In one language it takes 20 ms; in another it takes 20 seconds and a garbage-collection storm. Same algorithm, same complexity on paper. The difference is what `+=` on a string means: whether it can extend the existing bytes in place, or has to allocate a fresh copy of everything so far.

Strings are arrays of characters with two extra rules imposed on top: in most languages you cannot change them after creation, and "character" turns out to be a much harder word than it looks. Both rules shape every string operation's cost.

## Why strings are immutable

Python, JavaScript, Java, Go and C# all make strings immutable. Rust has both (`&str` is an immutable view, `String` is an owned, growable buffer). The reasons are practical rather than philosophical:

- **Hashing.** A string used as a dictionary key must not change while it sits in the table, or it lands in the wrong bucket forever. Immutability lets Python cache the hash inside the object (`str` computes it once; a second `hash(s)` is free).
- **Sharing.** Immutable strings can be passed to any function, stored in any structure, and aliased freely without defensive copies. Substrings can share the parent's buffer (Java did this until 2013 and stopped because a 10-character substring pinned a 10 MB parent in memory).
- **Interning.** Identical literals can be deduplicated into one object; Python interns identifiers and short strings, which makes attribute lookup a pointer comparison.
- **Safety.** Filenames, URLs and SQL fragments cannot be modified by another thread between validation and use.

The cost is that *every* modification is a new allocation plus a copy. That is fine for a single concatenation and disastrous for a loop of them.

## Concatenation in a loop

```python
out = ""
for line in lines:      # n lines of average length k
    out += line
```

If each `+=` copies the whole accumulated string, iteration `i` copies about `i × k` bytes, and the total is `k(1 + 2 + … + n) ≈ kn²/2`. For 100,000 lines of 50 bytes that is 2.5 × 10¹¹ byte-copies. Quadratic, and it is one of the most common performance bugs in code review.

What actually happens depends on the runtime:

| Runtime | `s += t` in a loop | Why |
|---|---|---|
| CPython | Usually O(n) total | A special case in the bytecode interpreter: if `s` has a reference count of 1, `+=` calls `realloc` to extend in place. Break the assumption (another reference to `s`, a class attribute, PyPy) and it is quadratic again. |
| V8 (JS) | O(n) total | Concatenation creates a *cons string* (a rope node pointing at both halves) in O(1); the flat copy is deferred until something indexes or hashes the string. `+=` in a loop is idiomatic and fast. |
| Java | O(n²) | Each `+` allocates. The compiler rewrites a single expression `a + b + c` to use `StringBuilder`, but not across loop iterations. |
| Go | O(n²) | Same. Use `strings.Builder` (which grows a byte slice geometrically). |
| Rust | O(n) amortised with `String::push_str` | `String` is a `Vec<u8>` with a UTF-8 guarantee; `+=` on a `String` appends in place. |

The portable answer is a **builder**: collect pieces, join once. Python's `"".join(parts)` computes the total length first, allocates once, and copies each piece exactly once: O(total). JavaScript's `parts.join("")`, Java's `StringBuilder`, Go's `strings.Builder`, Rust's `String::with_capacity` all do the same job. The rule to carry: *if you cannot state why your runtime makes `+=` linear, use a builder.*

## How text is stored: code points, code units and bytes

"Character" hides three different things, and string APIs disagree about which one `len` and `s[i]` operate on.

- A **code point** is a Unicode number: `U+0041` is `A`, `U+00E9` is `é`, `U+1F600` is `😀`.
- A **code unit** is the storage chunk of an encoding: 1 byte in UTF-8, 2 bytes in UTF-16.
- A **grapheme cluster** is what a human calls a character: `é` may be one code point (`U+00E9`) or two (`e` + combining acute `U+0301`); a family emoji can be seven code points joined with zero-width joiners.

| Language | `len("😀")` | Indexing unit | Random access `s[i]` |
|---|---|---|---|
| Python 3 | 1 | Code point | O(1): the string is stored as 1, 2 or 4 bytes per code point depending on the widest character it contains (PEP 393), so it is a plain array |
| JavaScript | 2 | UTF-16 code unit | O(1), but `s[0]` of an emoji is half a surrogate pair |
| Java | 2 | UTF-16 code unit | O(1), same caveat; `codePointAt` for the real thing |
| Go | 4 | Byte (UTF-8) | O(1) for bytes; `for _, r := range s` decodes runes |
| Rust | 4 | Byte (UTF-8) | `s[i]` does not compile; `s.chars().nth(i)` is O(n) |

Two consequences you will hit in interviews and in production:

1. **"Reverse a string" is not `s[::-1]`.** Reversing by code point turns `e` + combining acute into acute + `e`, attaching the accent to the wrong letter. Reversing by UTF-16 code unit in JavaScript splits every emoji into two invalid halves. Correct reversal iterates grapheme clusters (`Intl.Segmenter`, Python's `regex` module with `\X`, Rust's `unicode-segmentation`). In an interview, say "I'll assume ASCII; for Unicode I'd reverse grapheme clusters", and move on.
2. **Byte length ≠ character length.** A `VARCHAR(255)` column, a 280-character tweet limit and an HTTP header size limit are all measured in different units. Python's `len(s)` and `len(s.encode("utf-8"))` differ by up to 4×. Truncating a UTF-8 byte buffer at byte 255 can cut a character in half and produce invalid UTF-8.

Python's PEP 393 layout deserves one more note because it explains a real performance cliff: a string of a million ASCII characters is 1 MB; add a single emoji and it becomes 4 MB, because every code point is now stored in 4 bytes.

## The cost of common operations

Assume a string of length `n` and a second string of length `m`.

| Operation | Cost | Notes |
|---|---|---|
| `len(s)` | O(1) | Stored in the header |
| `s[i]` | O(1) or O(n) | See table above |
| `s[i:j]` slice | O(j − i) | Copies in Python and Java; `&s[i..j]` in Rust and `s[i:j]` in Go are O(1) views |
| `s == t` | O(min(n, m)), often O(1) | Length check first; Python compares cached hashes for interned strings; V8 compares pointers for internalised strings |
| `hash(s)` | O(n) once | Cached in Python and Java; recomputed each time in Rust/Go |
| `t in s` / `s.includes(t)` | O(n + m) typical, O(nm) worst | CPython uses a two-way/Crochemore–Perrin variant for longer needles; V8 uses Boyer–Moore–Horspool heuristics |
| `s.split(sep)` | O(n) | Allocates every piece |
| `sep.join(parts)` | O(total length) | Two passes: measure, then copy |
| `s.replace(a, b)` | O(n + occurrences × m) | New string; original untouched |
| `s.lower()` | O(n) | Unicode case mapping can change length: `"ß".upper()` is `"SS"` |
| `sorted(s)` | O(n log n) | The standard anagram trick |

The line that matters most for interviews is slicing. `s[1:]` in a recursive function is a full copy, so a recursion that peels one character per call is O(n²) even if the logic is linear. Pass indices, not slices.

## Builders and their internals

A builder is a dynamic array of bytes or code units with the same doubling strategy as [dynamic arrays](/learn/data-structures/arrays-strings/arrays-and-dynamic-arrays). Python does not expose one directly (`io.StringIO` is close; a list plus `join` is idiomatic). Rust's `String` *is* one:

```rust
let mut out = String::with_capacity(lines.iter().map(|l| l.len() + 1).sum());
for line in &lines {
    out.push_str(line);
    out.push('\n');
}
```

Pre-sizing removes every reallocation. In Java, `new StringBuilder(expectedLength)` does the same; in Go, `builder.Grow(n)`.

V8's rope approach is the other design: never copy on concatenation, build a tree, and flatten lazily. It makes `+=` cheap but makes the *first* `s[i]` after a million concatenations an O(n) flatten, which is a surprise when it lands inside a hot loop.

## Interview patterns that live on strings

Most string questions are array questions with a costume:

- **Counting characters.** For ASCII, an array of 128 (or 26) counters indexed by `ord(c) - ord('a')` is a perfect hash table: no hashing, one cache line, and it makes "are these anagrams?" an O(n) pass with O(1) space. For arbitrary Unicode, use a hash map. [Valid Anagram](/practice/valid-anagram) is the canonical version.
- **Two pointers.** Palindromes, reversing words, comparing with skips: [Valid Palindrome](/practice/valid-palindrome). Python strings are immutable, so in-place work means converting to a `list` first and joining at the end.
- **Sliding window with counts.** Longest substring without repeats, anagram windows: a map (or 128-array) of counts in the window; the technique lesson is [Sliding window mastery](/learn/algorithms/technique-mastery/sliding-window-mastery).
- **Encoding.** Length-prefixed framing (`"5#hello3#foo"`) is how you make a string list round-trip through one string with no escape characters, and it is also how every binary protocol works; see [Encode and Decode Strings](/practice/encode-decode-strings).
- **Run-length encoding.** Compress `"aaabcc"` to `"a3bc2"`: a read pointer that advances over a run and a builder for the output. This is the first exercise below.

```viz
{"type": "string", "algorithm": "run-length", "text": "aaabccdddd", "title": "Run-length encoding with a run pointer"}
```

The reverse-words visualiser shows the two-pointer version of a reversal that respects word boundaries:

```viz
{"type": "string", "algorithm": "reverse-words", "text": "the quick brown fox", "title": "Reverse words in place: reverse all, then each word"}
```

## Unicode pitfalls that ship bugs

- **Normalisation.** `"café"` typed on macOS may be `c a f e ◌́` (NFD) while the database has `c a f é` (NFC). They print identically, compare unequal, and hash differently. Normalise at the boundary (`unicodedata.normalize("NFC", s)`) before comparing, deduplicating or hashing.
- **Case folding is locale-sensitive.** In Turkish, `"i".upper()` is `"İ"`. `"ß".upper()` is `"SS"` (length changes). Use `casefold()` rather than `lower()` for case-insensitive comparison.
- **Sorting is not code-point order.** `sorted(["b", "a", "é"])` puts `é` after `z` because `U+00E9 > U+007A`. Human-order sorting needs a collation (ICU); most systems just accept code-point order and document it.
- **Invalid input.** Bytes that are not valid UTF-8 exist in every real dataset. Python raises `UnicodeDecodeError`; Go silently yields `U+FFFD`; Rust's `String::from_utf8` returns an error you must handle. Decide what your service does with them before the first customer file arrives.
- **Homoglyphs.** `"paypal"` with a Cyrillic `а` is a different string that renders identically. Any system that uses strings as identifiers (usernames, domains, package names) needs a confusables check.

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

- You can say precisely why `s += t` in a loop is linear in CPython and V8 and quadratic in Java and Go, and you use a builder when you cannot.
- You distinguish code points, code units and grapheme clusters, and you know which one your language's `len` counts.
- You know that slicing copies in Python and Java and is a view in Rust and Go, so you pass indices in recursive string code.
- You normalise Unicode at system boundaries before comparing or hashing, and you use `casefold` rather than `lower` for case-insensitive matching.
- You reach for a 26- or 128-slot count array for ASCII problems and can explain why it beats a hash map.
- You know that a single non-Latin-1 character quadruples a CPython string's memory, and that V8 ropes defer the copy until the first index.

## Check yourself

```quiz
- q: >-
    A Java method builds a 10 MB string by concatenating 200,000 pieces with `+=` in a loop. What is the dominant cost?
  options: ["Garbage-collecting the 200,000 pieces, which are freed one at a time", "Recopying the accumulated string on every iteration, O(n²) in total", "Hashing each intermediate string, which Java does on every allocation", "Encoding every piece to UTF-16, which doubles each ASCII character"]
  answer: 1
  explanation: >-
    Java strings are immutable and the compiler only uses StringBuilder within a single expression. Each `+=` copies everything accumulated so far, giving roughly n²/2 character copies, on the order of 10¹² here. The garbage is a symptom; the copying is the cause. Java computes a string's hash lazily, only when something asks for it.
- q: >-
    In JavaScript, `"👍".length` is 2 and `"👍".split("").reverse().join("")` produces garbage. Why?
  options: ["The emoji is a grapheme cluster of two code points that split separates", "split works on UTF-16 code units, cutting the emoji's surrogate pair in half", "split skips Unicode normalisation, so the reversed emoji ends up in NFD form", "split works on UTF-8 bytes, so it breaks the emoji's multi-byte encoding apart"]
  answer: 1
  explanation: >-
    U+1F44D is a single code point outside the Basic Multilingual Plane, stored as two UTF-16 code units; that is why length is 2. Splitting by code unit separates the pair and reversing produces two lone surrogates. It is not a multi-code-point grapheme cluster. Iterating with `for...of` or `Array.from` splits by code point instead.
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
    NFC and NFD encode the same visible text as different code-point sequences (é versus e plus a combining accent), so equality and hashing differ. Normalise at the boundary before comparing. Storage encoding does not affect equality after decoding, and interning never changes what `==` returns.
- q: >-
    Why does Python cache the hash inside a str object?
  options: ["It keeps dict buckets valid when a key string is modified in place", "Hash seeds are randomised per process, so recomputing could change it", "Strings are immutable, so a cached hash can never go stale", "Caching the hash lets equal strings share a single object in memory"]
  answer: 2
  explanation: >-
    Hashing is O(n) in the length. Immutability guarantees the cached value stays valid, so repeated dictionary lookups with the same string object skip the work. Strings cannot be modified in place, which is exactly why caching is safe; the seed is fixed for the life of the process; and sharing objects is interning, a separate mechanism. Caching costs 8 bytes per string.
```
