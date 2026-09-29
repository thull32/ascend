---
slug: string-matching
title: "String matching: KMP, Rabin-Karp and the Z-algorithm"
description: Why naive search is O(nm) and when that bites (with measurements), how the KMP failure function lets the scan never back up, how a rolling hash finds patterns at memory bandwidth and how to keep it from being broken, what the Z-array is, and what your language's find() and your regex engine really do.
minutes: 45
difficulty: hard
tags: [strings, kmp, rabin-karp, z-algorithm, pattern-matching, rolling-hash]
problems: [longest-repeating-replacement, minimum-window-substring, permutation-in-string]
---
Find every occurrence of a pattern of length `m` in a text of length `n`. The obvious loop tries each of the `n` starting positions and compares up to `m` characters: O(nm). On ordinary English text it runs close to O(n), because most comparisons fail on the first character. On the text `aaaa…a` with pattern `aaa…ab` every alignment matches `m − 1` characters before failing, and the loop really does O(nm) work. A log scanner, a firewall rule, a DNA aligner or a `str.find` in a request handler that is O(nm) on attacker-chosen input is a denial-of-service waiting to happen, and it has happened, repeatedly, in regex engines.

The linear-time algorithms all share one insight: when a comparison fails after matching `k` characters, you have *learned something* about those `k` characters, and you should not throw it away by moving one position and starting over.

## The naive algorithm, and when it is fine

```python
def find_all_naive(text, pattern):
    n, m = len(text), len(pattern)
    return [i for i in range(n - m + 1) if text[i:i + m] == pattern]
```

Worst case O(nm), expected case on random or natural text roughly O(n + m). Counting character comparisons on the adversarial input makes the bound concrete: for `a` × 5,000 against `a` × 49 followed by `b`, the naive loop performs 247,550 comparisons, within 1% of n · m = 250,000. On typical text the same loop does about one comparison per position.

Constant factors decide whether the bound matters, and they favour the naive loop more than the theory suggests. Measured on CPython 3.14 with `a` × 200,000 against `a` × 1,999 followed by `b`: the slice-comparing naive loop took 13 ms, because each `text[i:i+m] == pattern` is a `memcmp` running at tens of gigabytes per second and 4 × 10⁸ byte comparisons finish in the time pure Python spends on 2 × 10⁵ loop iterations; a pure-Python KMP took 12 ms; and `str.find` took 0.4 ms. Scale `n` and `m` by ten each and the naive loop grows a hundredfold to over a second while KMP grows tenfold. The naive algorithm is the right choice when the pattern is short, the text is not adversarial, and the inner comparison is a tight `memcmp`; standard library `find` implementations start from something like it, tuned with a fast first-character scan (`memchr`, which uses SIMD to check 16–64 bytes per instruction), and switch to a cleverer algorithm for long patterns.

## Knuth-Morris-Pratt

Suppose the text is `abababca` and the pattern is `abab`. Align at 0: `a b a b` all match, found one. Naive would now move to position 1 and compare `b` against `a`. KMP notices that the matched text `abab` has a *border*: the suffix `ab` equals the prefix `ab`. So the alignment at position 2 already has its first two characters matched, and the scan can continue comparing pattern[2] against text[4] without ever looking backward in the text.

### The failure function

For each prefix length `j` of the pattern, `lps[j − 1]` (longest proper prefix that is also a suffix) is the length of the longest border of `pattern[0:j]`. When a mismatch happens after matching `j` characters, the next candidate alignment is the one where the pattern's first `lps[j − 1]` characters line up with the last `lps[j − 1]` matched text characters, and you continue comparing from there.

Compute it with the pattern matched against itself:

```python
def failure(p):
    lps = [0] * len(p)
    k = 0                                  # length of the current border
    for i in range(1, len(p)):
        while k > 0 and p[i] != p[k]:
            k = lps[k - 1]                 # fall back to the next shorter border
        if p[i] == p[k]:
            k += 1
        lps[i] = k
    return lps
```

Trace on `aabaaab`:

| i | p[i] | k before | steps | lps[i] |
|---|---|---|---|---|
| 1 | a | 0 | a == p[0] → k = 1 | 1 |
| 2 | b | 1 | b ≠ p[1] → k = lps[0] = 0; b ≠ p[0] | 0 |
| 3 | a | 0 | a == p[0] → 1 | 1 |
| 4 | a | 1 | a == p[1] → 2 | 2 |
| 5 | a | 2 | a ≠ p[2] = b → k = lps[1] = 1; a == p[1] → 2 | 2 |
| 6 | b | 2 | b == p[2] → 3 | 3 |

`lps = [0, 1, 0, 1, 2, 2, 3]`. Row 5 shows the fall-back chain: the border `aa` of `aabaa` cannot extend with `a` (next char would be `b`), so drop to the border of `aa`, which is `a`, and that extends. The `while` loop is the line people get wrong: resetting `k = 0` instead of `k = lps[k − 1]` produces a table that misses shorter borders and a search that misses overlapping matches.

### The search

```python
def kmp_find_all(text, pattern):
    lps = failure(pattern)
    out, j = [], 0                          # j = characters of pattern matched
    for i, ch in enumerate(text):
        while j > 0 and ch != pattern[j]:
            j = lps[j - 1]
        if ch == pattern[j]:
            j += 1
        if j == len(pattern):
            out.append(i - j + 1)
            j = lps[j - 1]                  # continue looking for overlapping matches
    return out
```

Trace on text `abababca`, pattern `abab`, `lps = [0, 0, 1, 2]`:

| i | text[i] | j before | action | j after |
|---|---|---|---|---|
| 0 | a | 0 | match pattern[0] | 1 |
| 1 | b | 1 | match pattern[1] | 2 |
| 2 | a | 2 | match pattern[2] | 3 |
| 3 | b | 3 | match pattern[3]; j = 4 = m, **record 0**, j = lps[3] | 2 |
| 4 | a | 2 | match pattern[2] | 3 |
| 5 | b | 3 | match; **record 2**, j = lps[3] | 2 |
| 6 | c | 2 | c ≠ pattern[2], j = lps[1] = 0; c ≠ pattern[0] | 0 |
| 7 | a | 0 | match pattern[0] | 1 |

Result `[0, 2]`, and the text index `i` only ever moved forward: eight characters read, eight steps.

```viz
{"type": "string", "algorithm": "kmp", "text": "abababca", "pattern": "abab",
 "title": "KMP: the text pointer never backs up", "caption": "On a mismatch the pattern slides by the failure-function amount while the text index stays put. Overlapping matches at 0 and 2 are both found."}
```

### Why it is O(n + m)

The `while` loop looks like it could run many times per character. The amortised argument: `j` increases by at most 1 per iteration of the outer loop (n times total), and every iteration of the inner `while` strictly decreases `j`. Since `j ≥ 0`, the total number of decreases cannot exceed the total number of increases, so the inner loop runs at most `n` times across the whole search. Same argument for the failure function over `m`. Total O(n + m), worst case, no assumptions about the alphabet or the input.

That worst-case guarantee is the point. KMP's constant factor is *worse* than naive on typical text, and it is rarely the fastest on benchmarks; it is the algorithm you use when you cannot afford the naive worst case, and it is the structure inside Aho-Corasick for multi-pattern matching, where the failure links become a trie-wide automaton.

### KMP as a streaming automaton

The search loop's only state is `j`, the number of pattern characters currently matched, and its only memory is the `lps` table: O(m) space regardless of `n`. That makes it a **finite automaton** you can feed one character at a time, which is why it suits a log stream, a network filter or a file too large to hold. Precompute the full transition table `next[j][c]` (m × σ entries) and each character costs one array read with no `while` loop; the [Aho-Corasick lesson](/learn/advanced-data-structures/advanced-strings/aho-corasick) builds that table over a trie of many patterns at once.

## Rabin-Karp: rolling hashes

Instead of comparing characters, compare **hashes**. Hash the pattern once. Hash each length-`m` window of the text; if the window's hash equals the pattern's, verify with a character comparison (a hash match might be a collision). The trick that makes this O(n) rather than O(nm) is that the hash of the next window is computed from the previous one in O(1): treat the window as a number in base `b`, and sliding by one means removing the leading digit's contribution, multiplying by `b`, and adding the new digit, all modulo a prime `q`.

$$h_{i+1} = \big( (h_i - t_i \cdot b^{m-1}) \cdot b + t_{i+m} \big) \bmod q$$

```python
def rabin_karp(text, pattern, b=256, q=(1 << 61) - 1):
    n, m = len(text), len(pattern)
    if m > n:
        return []
    hp = ht = 0
    high = pow(b, m - 1, q)                     # b^(m-1) mod q, for removing the leading char
    for i in range(m):
        hp = (hp * b + ord(pattern[i])) % q
        ht = (ht * b + ord(text[i])) % q
    out = []
    for i in range(n - m + 1):
        if hp == ht and text[i:i + m] == pattern:   # verify: hashes can collide
            out.append(i)
        if i + m < n:
            ht = ((ht - ord(text[i]) * high) * b + ord(text[i + m])) % q
    return out
```

Worked with digits, base 10 and a deliberately tiny `q = 13` so that collisions appear. Text `3141592653`, pattern `59`, `hash(59) = 59 mod 13 = 7`:

| Window | Value | mod 13 | Equals 7? |
|---|---|---|---|
| 31 | 31 | 5 | |
| 14 | 14 | 1 | |
| 41 | 41 | 2 | |
| 15 | 15 | 2 | |
| 59 | 59 | 7 | **yes**: verify characters, match at 4 |
| 92 | 92 | 1 | |
| 26 | 26 | 0 | |
| 65 | 65 | 0 | |
| 53 | 53 | 1 | |

Rolling from `31` to `14`: `(5 − 3·10) = −25 ≡ 1 (mod 13)`, then `1·10 + 4 = 14 ≡ 1`. Check: `14 mod 13 = 1`. Now look at the collisions in that table: `14`, `92` and `53` all hash to 1, and `41` and `15` both hash to 2. A search for `92` would find three candidate windows and only the verification step would reject two of them; without verification it would report matches at 1 and 8. That is the whole failure mode of Rabin-Karp in one table.

```viz
{"type": "string", "algorithm": "rabin-karp", "text": "3141592653", "pattern": "59",
 "title": "Rabin-Karp with a rolling hash", "caption": "Each window's hash is derived from the previous one in O(1). Only windows whose hash equals the pattern's are compared character by character."}
```

### Choosing the modulus and base

Expected time is O(n + m) when `q` is large and collisions are rare: two random windows collide with probability about 1/q, so with `q ≈ 2⁶¹` and 10⁹ windows the expected number of false candidates is 10⁹/2⁶¹, about 10⁻⁹. Three rules keep that promise. Use a large prime modulus (2⁶¹ − 1 is a Mersenne prime that lets the product of two residues fit in 128-bit arithmetic). Use a **random base** chosen at start-up, because with a fixed base an adversary can construct two distinct windows with equal hashes offline. And never use "mod 2⁶⁴ by letting the integer wrap": polynomial hashing modulo a power of two is broken by the Thue–Morse strings, a known family where two different strings of length about 2,000 collide for *every* odd base, and any service that accepts user input will meet that input eventually. Double hashing (two independent moduli) squares the collision probability at twice the cost. The worst case with a fixed, guessable hash is O(nm): every window collides and every window is verified.

The trap is trusting the hash. A hash match must be verified, or the modulus and base must be chosen so that you accept a stated error rate, on the order of 2⁻⁶⁰ per comparison, with eyes open. Using Python's built-in `hash()` with a modulus of 10⁹ + 7 and no verification is a bug that shows up on the one input where two windows collide.

### Where rolling hashes run

- **Multiple patterns of the same length.** Put all pattern hashes in a set; each window does one set lookup: O(n + total pattern length) for any number of patterns, which KMP cannot do.
- **Delta transfer and deduplication.** `rsync` computes a cheap rolling checksum over every window of the destination file and a strong checksum (MD5 on old versions; since rsync 3.2.0 the two ends negotiate one, xxHash variants first by default) only for windows whose weak checksum matches a block on the sender, which is Rabin-Karp's candidate-then-verify structure over a network. Backup tools such as restic and Borg use a rolling hash to cut files into **content-defined chunks** at positions where the hash takes a particular value, so that inserting a byte shifts one chunk boundary instead of all of them, and Git's delta compression finds copy candidates with a rolling hash over 16-byte windows.
- **Substring-equality queries.** With prefix hashes precomputed, "is `s[i:j]` equal to `s[k:l]`?" is O(1). That is the backbone of many string algorithms and of the [longest duplicate substring binary search](/learn/data-structures/tries-and-string-structures/suffix-structures).
- **2D matching**, where a rectangular pattern is hashed row by row then column by column.

## The Z-algorithm

For a string `s`, `z[i]` is the length of the longest substring starting at `i` that matches a prefix of `s`. For `aabxaab`: `z = [7, 1, 0, 0, 3, 1, 0]` (position 4 starts `aab`, which matches the prefix `aab`). Pattern matching follows by computing Z on `pattern + "$" + text` with a separator that appears in neither: every `i` with `z[i] == m` is a match. For `abab$abababca` the array is `[13, 0, 2, 0, 0, 4, 0, 4, 0, 2, 0, 0, 1]`, with 4s at positions 5 and 7, which are text offsets 0 and 2.

The O(n) computation keeps the rightmost matched interval `[l, r]` (the *Z-box*) found so far. For `i` inside the box, the substring at `i` mirrors the substring at `i − l` in the prefix, so `z[i]` starts at `min(z[i − l], r − i + 1)` and only extends beyond `r` by fresh comparisons, which push `r` forward. Since `r` only moves right, total comparisons are O(n).

```python
def z_array(s):
    n = len(s)
    z = [0] * n
    z[0] = n
    l = r = 0
    for i in range(1, n):
        if i <= r:
            z[i] = min(r - i + 1, z[i - l])
        while i + z[i] < n and s[z[i]] == s[i + z[i]]:
            z[i] += 1
        if i + z[i] - 1 > r:
            l, r = i, i + z[i] - 1
    return z
```

### Tracing the Z-box

Trace on `aabxaab`:

| i | s[i] | inside box? | starting value | fresh comparisons | z[i] | box [l, r] after |
|---|---|---|---|---|---|---|
| 1 | a | no (r = 0) | 0 | a = a, then a ≠ b | 1 | [1, 1] |
| 2 | b | no | 0 | b ≠ a | 0 | [1, 1] |
| 3 | x | no | 0 | x ≠ a | 0 | [1, 1] |
| 4 | a | no | 0 | a = a, a = a, b = b, end of string | 3 | [4, 6] |
| 5 | a | yes | min(r − i + 1 = 2, z[1] = 1) = 1 | s[1] = a vs s[6] = b, stop | 1 | [4, 6] |
| 6 | b | yes | min(1, z[2] = 0) = 0 | s[0] = a vs s[6] = b, stop | 0 | [4, 6] |

Row 5 is the algorithm's whole idea: position 5 sits inside the box that mirrors positions 1–3 of the prefix, so `z[5]` starts at `z[1]` without re-reading the matched characters, and only one fresh comparison is needed.

```viz
{"type": "string", "algorithm": "z-algorithm", "text": "aabxaab",
 "title": "Z-array and the Z-box", "caption": "Each z[i] is how far the string at i agrees with its own prefix. Inside the current box the value is copied from the mirror position before any new comparisons."}
```

Z and KMP's failure function contain the same information in different indexing; each can be computed from the other in linear time. Z tends to be easier to reason about for problems like "shortest period of a string" (the smallest `p` with `z[p] == n − p`) and "count occurrences of a prefix", while the failure function is what you need for the streaming form of the search (KMP processes the text one character at a time with O(m) memory; Z needs the concatenation in memory).

## Under the hood: what `find()` and regex engines actually do

| Library | Algorithm | Worst case |
|---|---|---|
| CPython `str.find` | `memchr` for one character; a Horspool-style skip with a 64-bit "bloom" mask of needle characters for short needles; since 3.10, Crochemore–Perrin **Two-Way** once haystack and needle pass the size thresholds in `fastsearch.h` | linear since 3.10 |
| glibc `memmem`, `strstr` | since 2.30, a modified Horspool with a hashed-pair shift table for needles up to 256 bytes and Two-Way above that; Two-Way throughout before 2.30 | linear (the 256-byte cap bounds the Horspool case) |
| Rust `str::find`; `memchr` crate | `str::find` is Two-Way (`str::contains` adds an SSE2 prefilter for needles up to 32 bytes); `memchr::memmem` runs a SIMD scan for a rare byte pair before Two-Way | linear |
| Go `strings.Index` | assembly `IndexByte`/short-pattern scan, then brute force that switches to Rabin-Karp after too many failed alignments | linear expected |
| Java `String.indexOf` | naive loop with a vectorised first-character scan (HotSpot intrinsic) | O(nm) |
| GNU `grep` | Boyer–Moore for one fixed string, Aho-Corasick for several (gnulib's `kwset`) | sublinear typical |
| `ripgrep` | SIMD multi-pattern "Teddy" plus a lazy DFA regex engine | linear |

None of them use KMP, and all of them are faster than a hand-written KMP on ordinary input: skip-based algorithms jump over most of the text, and Two-Way gives the linear guarantee with O(1) extra memory. Write KMP when you need its guarantee in your own code, its failure function for a border problem, or its automaton for streaming.

Regex engines are the place the naive worst case still lives. Backtracking engines (PCRE, Python's `re`, Java's `java.util.regex`, JavaScript) try alternatives recursively, and a pattern with nested unbounded quantifiers over overlapping choices, such as `(a+)+b`, retries an exponential number of ways to split the input before failing. Measured on CPython 3.14: `re.match(r"(a+)+b", "a" * 20)` took 20 ms, 22 a's took 79 ms, 24 took 316 ms, doubling per character, so 40 a's would take about a year. Cloudflare's July 2019 outage was a rule with this shape (`.*.*=.*`) on every request. Automaton engines (RE2, Rust's `regex`, Go's `regexp`) compile to an NFA and simulate it with a lazy DFA in guaranteed linear time, at the cost of not supporting backreferences. The senior rule: user-supplied or user-facing patterns go through a linear-time engine, or through a backtracking engine with a step limit and a timeout.

## Choosing

| Algorithm | Preprocess | Search | Worst case | Extra memory | Reach for it when |
|---|---|---|---|---|---|
| Naive + `memchr` | none | O(nm) worst, ~O(n) typical | O(nm) | O(1) | Short patterns, non-adversarial text, standard library |
| KMP | O(m) | O(n) | O(n + m) guaranteed | O(m) | Guaranteed linear time; streaming text; the basis of Aho-Corasick |
| Rabin-Karp | O(m) | O(n) expected | O(nm) on collisions | O(1) plus hash set | Many patterns of one length; substring equality queries; 2D; chunking |
| Z-algorithm | O(n + m) | included | O(n + m) | O(n + m) | Periods, borders, prefix-occurrence counts; when Z values are the answer |
| Boyer-Moore / Horspool | O(m + σ) | sublinear typical, O(nm) worst (O(n) with the Galil rule) | | O(σ) | Long patterns, large alphabets; what `grep` uses |
| Two-Way (Crochemore-Perrin) | O(m) | O(n) | O(n + m) | O(1) | What glibc `memmem` uses for needles over 256 bytes and Python's `str.find` for long inputs |

## Production failure modes

**A regex takes down the edge.** Symptom: CPU at 100% on every node after a rule change; requests time out; the culprit is one pattern. Diagnosis: nested unbounded quantifiers in a backtracking engine, exponential on inputs that almost match. Fix: rewrite without nested quantifiers, move to RE2/Rust `regex`, or enforce a step limit and timeout.

**`indexOf` in a request path scanner goes quadratic.** Symptom: a Java service's p99 explodes on certain uploads; a profile shows `String.indexOf`. Diagnosis: the JDK's `indexOf` is the naive loop; a payload of repeated characters against a long repeated needle hits O(nm). Fix: a Two-Way or KMP implementation for long needles on untrusted input, or bound the needle length.

**Deduplication silently corrupts data.** Symptom: two different blocks are treated as identical; restored files differ from originals. Diagnosis: a weak rolling checksum was used as identity without the strong-hash verification step. Fix: verify candidates with a cryptographic hash (as `rsync` does with its strong checksum) or compare bytes.

**Rolling hash "modulo 2⁶⁴" collides in production.** Symptom: a substring-equality check returns true for different strings on specific inputs. Diagnosis: wrap-around arithmetic is polynomial hashing mod a power of two, broken by Thue–Morse-shaped input. Fix: a large prime modulus, a random base, and verification where exactness matters.

**KMP returns the wrong positions.** Symptom: overlapping matches are missed. Diagnosis: the fall-back line resets `k = 0` (or `j = 0`) instead of following `lps[k − 1]`, discarding shorter borders. Fix: the fall-back chain, and a test with an overlapping pattern such as `aa` in `aaaa`.

**Matches split characters.** Symptom: a byte-level search finds a "match" inside a multi-byte UTF-8 sequence, or a code-point search fails to find `é` typed as `e` plus a combining accent. Diagnosis: the algorithm is correct over its alphabet and the alphabet was wrong for the question. Fix: normalise and search over code points (or graphemes) as the [strings lesson](/learn/data-structures/arrays-strings/strings-in-depth) explains; for UTF-8 with a valid needle, byte-level matches cannot start mid-character, because continuation bytes never equal a lead byte.

## Interview appearances

- **Repeated substring pattern** (`s` is some `t` repeated ≥ 2 times): compute `lps`; `s` is periodic iff `p = n − lps[n − 1]` divides `n` and `p < n`. For `abcabcabc`, `p = 3` divides 9; for `abcab`, `p = 3` does not divide 5.
- **Shortest palindrome by prepending**: find the longest palindromic prefix as the border of `s + "#" + reverse(s)`.
- **Count occurrences of each prefix**: Z-array plus a suffix-sum.
- **Sliding-window problems** (`minimum-window-substring`, `permutation-in-string`) are not pattern matching; they compare character *multisets*, which is a hash map and two pointers. Knowing the difference is part of the signal.

## Interviewer follow-ups

**"The text is a live stream and does not fit in memory. Which algorithm and what state?"** Model answer: KMP, keeping only `lps` and the matched count `j`, O(m) memory, one step per character; Rabin-Karp also works with a window buffer of `m` characters. Common wrong answer: Z, which needs the concatenated string in memory.

**"Find any of 10,000 patterns in a 1 GB log."** Model answer: Aho-Corasick (a trie with failure links) in O(n + total pattern length + matches), or Rabin-Karp with a hash set when all patterns share a length. Common wrong answer: running KMP 10,000 times, which is O(10,000 · n).

**"Your Rabin-Karp reports a match. Is it one?"** Model answer: only after verification, or with a stated collision probability from a large prime modulus and a random base; and explain why mod 2⁶⁴ is not acceptable. Common wrong answer: "a 64-bit hash never collides".

**"Why does the standard library not use KMP?"** Model answer: KMP reads every character; Horspool-style skips and Two-Way run faster on real text and Two-Way still guarantees linear time with O(1) space. Common wrong answer: "because KMP is O(nm)".

**"Is `s` a rotation of `t`?"** Model answer: same length and `t` occurs in `s + s`, one linear search. Common wrong answer: try every rotation, O(n²).

## What mid-level engineers get wrong

- **Reaching for KMP to beat `str.find`** and shipping code that is slower and longer.
- **Resetting the fall-back to 0** in the failure function, which passes the simple tests and misses overlaps.
- **Trusting a hash match** and skipping verification, or hashing mod 2⁶⁴ with a fixed base.
- **Writing `(a+)+b`-shaped regexes** against user input in a backtracking engine.
- **Using KMP on an anagram problem**, which is a multiset comparison, not a pattern match.
- **Comparing bytes when the question is about characters**, or the reverse.

## Exercises

```exercise
id: failure-function
title: Compute the KMP failure function
prompt: |
  Return the failure (LPS) array of `pattern`: `lps[i]` is the length of the
  longest proper prefix of `pattern[0..i]` that is also a suffix of it.
  `lps[0]` is always 0; the empty pattern returns `[]`.

  Use the O(m) algorithm that falls back through `lps[k - 1]` on a
  mismatch, not a quadratic check of every prefix.
languages: [python, javascript]
entry: failure_function
starter:
  python: |
    def failure_function(pattern):
        lps = [0] * len(pattern)
        return lps
  javascript: |
    function failure_function(pattern) {
      const lps = new Array(pattern.length).fill(0);
      return lps;
    }
tests:
  - args: ["aabaaab"]
    expected: [0, 1, 0, 1, 2, 2, 3]
  - args: ["abcabd"]
    expected: [0, 0, 0, 1, 2, 0]
  - args: ["aaaa"]
    expected: [0, 1, 2, 3]
    label: all equal characters
  - args: ["a"]
    expected: [0]
  - args: [""]
    expected: []
    label: empty pattern
  - args: ["abacabab"]
    expected: [0, 0, 1, 0, 1, 2, 3, 2]
    hidden: true
    label: fall-back chain of length two
hints:
  - "Keep k = lps[i-1]. While k > 0 and pattern[i] != pattern[k], set k = lps[k-1]. Then if they match, k += 1. Store lps[i] = k."
  - "The while loop can run several times; that is the fall-back chain and it is still O(m) amortised."
```

```exercise
id: kmp-find-all
title: Find all occurrences with KMP
prompt: |
  Return the starting indices (ascending) of every occurrence of
  `pattern` in `text`, including **overlapping** occurrences. `pattern` is
  non-empty. Return `[]` when there is no match or `text` is shorter than
  `pattern`.

  Use the failure function so the text index never moves backwards; the
  solution must be O(n + m).
languages: [python, javascript]
entry: kmp_find_all
starter:
  python: |
    def kmp_find_all(text, pattern):
        out = []
        return out
  javascript: |
    function kmp_find_all(text, pattern) {
      const out = [];
      return out;
    }
tests:
  - args: ["abababca", "abab"]
    expected: [0, 2]
    label: overlapping matches
  - args: ["aaaa", "aa"]
    expected: [0, 1, 2]
  - args: ["abc", "d"]
    expected: []
  - args: ["", "a"]
    expected: []
    label: empty text
  - args: ["hello", "hello"]
    expected: [0]
    label: pattern equals text
  - args: ["aabaaabaaab", "aabaaab"]
    expected: [0, 4]
    hidden: true
  - args: ["mississippi", "issi"]
    expected: [1, 4]
    hidden: true
hints:
  - "After a full match at text index i, record i - m + 1 and set j = lps[m - 1] to keep scanning for overlaps."
  - "Mismatch handling is identical to the failure-function loop: while j > 0 and text[i] != pattern[j], j = lps[j - 1]."
```

## Senior signals

- You know naive search is O(nm) worst case, can produce the adversarial input in one breath, and can also say why it is often the fastest choice anyway (a `memcmp` inner loop, measured).
- You can explain the failure function as "longest border", trace the fall-back chain by hand, and derive the amortised O(n + m) bound from the increase/decrease argument.
- You know KMP's state is one integer and one table, which is what makes it a streaming automaton and the basis of Aho-Corasick.
- You know a rolling hash must be **verified** or sized so that the collision probability is acceptable and stated, why the base must be random and the modulus a large prime, and its real niche (many patterns, substring equality, chunking, delta transfer).
- You know what your language's `find` actually uses and that it is not KMP, and why that is fine.
- You treat regexes on user input as a denial-of-service surface and can name a linear-time engine.
- You distinguish pattern matching from sliding-window multiset comparison and do not reach for KMP on an anagram problem.

## Check yourself

```quiz
- q: >-
    On which input does the naive string search do its worst-case O(nm) work?
  options: ["Random text over a small alphabet and a random pattern", "Text of all a's and a pattern of a's ending in b", "A pattern whose first character never appears in the text", "Text of all a's and a pattern of b's ending in a"]
  answer: 1
  explanation: >-
    Every alignment matches m-1 characters before failing on the final b, so all n alignments cost about m each. Swapping the letters (b's ending in a) fails on the first character at every alignment, which is O(n). Random inputs also fail almost immediately, and a pattern whose first character never appears fails on the first comparison at every alignment, which is O(n) in total.
- q: >-
    The KMP inner while loop can execute several times for a single text character. Why is the overall search still O(n + m)?
  options: ["The failure table is precomputed, so each fall-back step is a single O(1) table lookup", "j grows at most once per text character, and every inner iteration makes j smaller", "The inner loop runs only on a mismatch, and every mismatch moves the text index forward", "Mismatches after a partial match are rare, so the fall-back chain is short on average"]
  answer: 1
  explanation: >-
    This is an amortised argument: j increases by at most 1 per text character, every inner iteration strictly decreases it, and j never goes below zero, so there are at most n decrements in total. Precomputing the table makes each fall-back step O(1), but on its own says nothing about how many steps there are; the bound is worst case, not a claim about typical input.
- q: >-
    A Rabin-Karp implementation returns a match whenever the window hash equals the pattern hash, with no character comparison. What is the consequence?
  options: ["Missed matches when the rolling update wraps around the modulus", "False positives whenever two different windows collide on the hash", "Missed matches wherever two occurrences of the pattern overlap", "Nothing, because a hash modulo a large prime is unique per window"]
  answer: 1
  explanation: >-
    Hashes map a large space to a small one, so collisions exist, and with a fixed base and modulus an adversary can construct colliding windows deliberately. The modular rolling update is exact, so a true occurrence always hashes equal and is never missed; the error is only ever a false positive. Verify on hash match, or use a randomised base and a large prime modulus and accept a stated error probability.
- q: >-
    A rolling hash uses 64-bit wrap-around arithmetic (mod 2^64) with a fixed odd base to avoid the cost of a modulo. The risk is:
  options: ["Nothing, since 2^64 possible values make accidental collisions negligible", "Known input families collide for every odd base, so an adversary can force O(nm) or false matches", "The hash of a window can exceed the modulus, so the rolling update loses characters", "Wrap-around makes the rolling update non-invertible, so windows cannot be removed"]
  answer: 1
  explanation: >-
    Polynomial hashing modulo a power of two is broken by the Thue–Morse strings: two different strings of length about 2,000 collide regardless of the base. Accidental collisions are indeed rare, but adversarial ones are not, which is why a large prime modulus and a random base are the rule. The rolling update remains invertible under any modulus.
- q: >-
    For the string s of length n with failure array lps, when is s a repetition of a shorter string?
  options: ["When p = n - lps[n-1] divides n and p < n", "When lps[n-1] > 0, i.e. s has a non-empty border", "When lps[n-1] == n/2, so the two halves are equal", "When every lps value after index 0 is non-zero"]
  answer: 0
  explanation: >-
    n - lps[n-1] is the smallest period of s. The string is a whole number of repetitions exactly when that period divides n; lps[n-1] > 0 alone only says some border exists (abcab has one but is not periodic), and abcabcabc is periodic with lps[n-1] = 6, not n/2.
- q: >-
    Python's str.find, glibc's memmem and Rust's str::find do not use KMP. What do they use and why?
  options: ["Horspool-style skipping and Two-Way, sublinear on typical text with a linear worst case", "Suffix arrays built over the text, which answer each query in O(m log n) time", "Rabin-Karp rolling hashes, which scan at memory bandwidth with O(1) extra space", "Naive search with a SIMD first-byte scan, fast on typical text but O(nm) in the worst case"]
  answer: 0
  explanation: >-
    KMP examines every text character. Skip-based algorithms jump over most of the text on large alphabets, and Two-Way provides the linear worst-case guarantee with O(1) extra memory. Naive-plus-memchr is Java's indexOf and Rabin-Karp is Go's fallback for longer patterns, but these three libraries chose Two-Way precisely to avoid the naive worst case. KMP's value is its guarantee and its failure function, not raw speed.
```
