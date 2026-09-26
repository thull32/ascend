---
slug: string-matching
title: "String matching: KMP, Rabin-Karp and the Z-algorithm"
description: Why naive search is O(nm) and when that bites, how the KMP failure function lets the scan never back up, how a rolling hash finds patterns at memory bandwidth, and what your language's find() really does.
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

Worst case O(nm), expected case on random or natural text roughly O(n + m). It is the right choice when the pattern is short, the text is not adversarial, and you are in a language whose slice comparison is a tight `memcmp`. Most standard library `find` implementations start from something like this, tuned with a fast first-character scan (`memchr`, which uses SIMD to check 16–64 bytes per instruction), and only switch to a cleverer algorithm for long patterns.

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

`lps = [0, 1, 0, 1, 2, 2, 3]`. Row 5 shows the fall-back chain: the border `aa` of `aabaa` cannot extend with `a` (next char would be `b`), so drop to the border of `aa`, which is `a`, and that extends.

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

Trace on text `abababca`, pattern `abab`, `lps = [0, 0, 1, 2]`: `i = 0..3` match a, b, a, b, `j` reaches 4, record 0, reset `j = lps[3] = 2`. `i = 4` (`a`) matches pattern[2], `j = 3`. `i = 5` (`b`) matches pattern[3], `j = 4`, record 2, `j = 2`. `i = 6` (`c`) fails against pattern[2]; fall back to `lps[1] = 0`; fails against pattern[0]. `i = 7` (`a`) matches, `j = 1`. Result `[0, 2]`, and the text index `i` only ever moved forward.

```viz
{"type": "string", "algorithm": "kmp", "text": "abababca", "pattern": "abab",
 "title": "KMP: the text pointer never backs up", "caption": "On a mismatch the pattern slides by the failure-function amount while the text index stays put. Overlapping matches at 0 and 2 are both found."}
```

### Why it is O(n + m)

The `while` loop looks like it could run many times per character. The amortised argument: `j` increases by at most 1 per iteration of the outer loop (n times total), and every iteration of the inner `while` strictly decreases `j`. Since `j ≥ 0`, the total number of decreases cannot exceed the total number of increases, so the inner loop runs at most `n` times across the whole search. Same argument for the failure function over `m`. Total O(n + m), worst case, no assumptions about the alphabet or the input.

That worst-case guarantee is the point. KMP's constant factor is *worse* than naive on typical text, and it is rarely the fastest on benchmarks; it is the algorithm you use when you cannot afford the naive worst case, and it is the structure inside Aho-Corasick for multi-pattern matching, where the failure links become a trie-wide automaton.

## Rabin-Karp: rolling hashes

Instead of comparing characters, compare **hashes**. Hash the pattern once. Hash each length-`m` window of the text; if the window's hash equals the pattern's, verify with a character comparison (a hash match might be a collision). The trick that makes this O(n) rather than O(nm) is that the hash of the next window is computed from the previous one in O(1): treat the window as a number in base `b`, and sliding by one means removing the leading digit's contribution, multiplying by `b`, and adding the new digit, all modulo a prime `q`.

$$h_{i+1} = \big( (h_i - t_i \cdot b^{m-1}) \cdot b + t_{i+m} \big) \bmod q$$

```python
def rabin_karp(text, pattern, b=256, q=1_000_000_007):
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

Worked with digits, base 10, `q = 13`: text `3141592653`, pattern `59`. `hash(59) = 59 mod 13 = 7`. Windows: `31 → 5`, `14 → 1`, `41 → 2`, `15 → 2`, `59 → 7` (hit, verify, match at 4), `92 → 1`, `26 → 0`, `65 → 0`, `53 → 1`. Rolling from `31` to `14`: `(5 − 3·10) = −25 ≡ 1 (mod 13)`, then `1·10 + 4 = 14 ≡ 1`. Check: `14 mod 13 = 1`.

```viz
{"type": "string", "algorithm": "rabin-karp", "text": "3141592653", "pattern": "59",
 "title": "Rabin-Karp with a rolling hash", "caption": "Each window's hash is derived from the previous one in O(1). Only windows whose hash equals the pattern's are compared character by character."}
```

Expected time O(n + m) when `q` is large and collisions are rare; worst case O(nm) if the hash is adversarially collided, which is why production uses a random base or a 64-bit modulus. Its real advantages over KMP:

- **Multiple patterns of the same length.** Put all pattern hashes in a set; each window does one set lookup. Plagiarism detection and content-defined chunking (rsync, restic, Git's delta compression) are rolling-hash windows compared against a table.
- **2D matching**, where a rectangular pattern is hashed row by row then column by column.
- **Substring-equality queries**: with prefix hashes precomputed, "is `s[i:j]` equal to `s[k:l]`?" is O(1). That is the backbone of many string algorithms in competitive programming and of the [longest duplicate substring binary search](/learn/data-structures/tries-and-string-structures/suffix-structures).

The trap is trusting the hash. A hash match must be verified, or the modulus must be large enough that you accept a 2⁻⁶⁰ error rate with eyes open. Using `hash()` from Python with a modulus of 10⁹ + 7 and no verification is a bug that shows up on the one input where two windows collide.

## The Z-algorithm

For a string `s`, `z[i]` is the length of the longest substring starting at `i` that matches a prefix of `s`. For `aabxaab`: `z = [7, 1, 0, 0, 3, 1, 0]` (position 4 starts `aab`, which matches the prefix `aab`). Pattern matching follows by computing Z on `pattern + "$" + text` with a separator that appears in neither: every `i` with `z[i] == m` is a match.

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

```viz
{"type": "string", "algorithm": "z-algorithm", "text": "aabxaab",
 "title": "Z-array and the Z-box", "caption": "Each z[i] is how far the string at i agrees with its own prefix. Inside the current box the value is copied from the mirror position before any new comparisons."}
```

Z and KMP's failure function contain the same information in different indexing; each can be computed from the other in linear time. Z tends to be easier to reason about for problems like "shortest period of a string" (the smallest `p` with `z[p] == n − p`) and "count occurrences of a prefix", while the failure function is what you need for the streaming form of the search (KMP processes the text one character at a time with O(m) memory; Z needs the concatenation in memory).

## Choosing

| Algorithm | Preprocess | Search | Worst case | Extra memory | Reach for it when |
|---|---|---|---|---|---|
| Naive + `memchr` | none | O(nm) worst, ~O(n) typical | O(nm) | O(1) | Short patterns, non-adversarial text, standard library |
| KMP | O(m) | O(n) | O(n + m) guaranteed | O(m) | Guaranteed linear time; streaming text; the basis of Aho-Corasick |
| Rabin-Karp | O(m) | O(n) expected | O(nm) on collisions | O(1) plus hash set | Many patterns of one length; substring equality queries; 2D |
| Z-algorithm | O(n + m) | included | O(n + m) | O(n + m) | Periods, borders, prefix-occurrence counts; when Z values are the answer |
| Boyer-Moore / Horspool | O(m + σ) | sublinear typical, O(nm) worst (O(n) with Galil rule) | | O(σ) | Long patterns, large alphabets; what `grep` uses |
| Two-Way (Crochemore-Perrin) | O(m) | O(n) | O(n + m) | O(1) | What glibc `memmem` and Python's `str.find` use for long needles |

What your language actually does: Python's `str.find` uses a Horspool-style skip with a bloom-filter of pattern characters for short needles and switched to Two-Way for long ones in 3.10, giving worst-case linear time. glibc's `memmem` and `strstr` are Two-Way. Rust's `str::find` and the `memchr` crate use SIMD-accelerated Two-Way. Go's `strings.Index` uses Rabin-Karp for medium-length patterns after a fast `IndexByte` scan. Java's `String.indexOf` is naive with an intrinsified first-character scan. None of them use KMP, and all of them are faster than a hand-written KMP on ordinary input; write KMP when you need its guarantee or its failure function for something else.

## Interview appearances

- **Repeated substring pattern** (`s` is some `t` repeated ≥ 2 times): compute `lps`; `s` is periodic iff `p = n − lps[n − 1]` divides `n` and `p < n`.
- **Shortest palindrome by prepending**: find the longest palindromic prefix as the border of `s + "#" + reverse(s)`.
- **Count occurrences of each prefix**: Z-array plus a suffix-sum.
- **Sliding-window problems** (`minimum-window-substring`, `permutation-in-string`) are not pattern matching; they compare character *multisets*, which is a hash map and two pointers. Knowing the difference is part of the signal.

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

- You know naive search is O(nm) worst case and can produce the adversarial input in one breath, and you know why regex engines with backtracking have the same problem, only worse.
- You can explain the failure function as "longest border" and derive the amortised O(n + m) bound from the increase/decrease argument.
- You know a rolling hash must be **verified** or sized so that the collision probability is acceptable and stated, and you know its real niche (many patterns, substring equality, chunking).
- You know what your language's `find` actually uses and that it is not KMP, and why that is fine.
- You distinguish pattern matching from sliding-window multiset comparison and do not reach for KMP on an anagram problem.
- You see the periodicity and border tricks (repeated substring, shortest palindrome) as applications of the failure function rather than separate algorithms.

## Check yourself

```quiz
- q: >-
    On which input does the naive string search do its worst-case O(nm) work?
  options: ["Random text and a random pattern", "Text of all a's and a pattern of a's ending in b", "A pattern longer than the text", "A pattern that occurs at every position"]
  answer: 1
  explanation: >-
    Every alignment matches m-1 characters before failing on the final b, so all n alignments cost about m each. Random inputs fail on the first character almost always; a pattern occurring everywhere also costs O(nm) but that is output, not wasted work.
- q: >-
    The KMP inner while loop can execute several times for a single text character. Why is the overall search still O(n + m)?
  options: ["Because the pattern is short", "Because j increases at most once per text character and every inner iteration decreases j, so total decreases cannot exceed n", "Because the failure function is precomputed", "Because mismatches are rare in practice"]
  answer: 1
  explanation: >-
    This is an amortised argument: the inner loop spends the increments accumulated by earlier characters, and j never goes below zero, so there are at most n decrements in total.
- q: >-
    A Rabin-Karp implementation returns a match whenever the window hash equals the pattern hash, with no character comparison. What is the consequence?
  options: ["Nothing; hashes are unique", "False positives on hash collisions, which an adversary can manufacture if the base and modulus are known", "It becomes O(nm)", "It misses overlapping matches"]
  answer: 1
  explanation: >-
    Hashes map a large space to a small one, so collisions exist. With a fixed base and modulus, colliding windows can be constructed deliberately. Verify on hash match, or use a randomised base and a 64-bit modulus and accept a stated error probability.
- q: >-
    For the string s of length n with failure array lps, when is s a repetition of a shorter string?
  options: ["When lps[n-1] > 0", "When p = n - lps[n-1] divides n and p < n", "When lps[n-1] == n/2", "When all lps values are non-zero"]
  answer: 1
  explanation: >-
    n - lps[n-1] is the smallest period of s. The string is a whole number of repetitions exactly when that period divides n; lps[n-1] > 0 alone only says some border exists (abcab has one but is not periodic).
- q: >-
    Python's str.find, glibc's memmem and Rust's str::find do not use KMP. What do they use and why?
  options: ["Naive search, because it is simplest", "Horspool-style skipping and the Two-Way algorithm, which are sublinear on typical input while keeping a linear worst case", "Suffix arrays over the text", "Rabin-Karp, because hashing is fast"]
  answer: 1
  explanation: >-
    KMP examines every text character. Skip-based algorithms jump over most of the text on large alphabets, and Two-Way provides the linear worst-case guarantee with O(1) extra memory. KMP's value is its guarantee and its failure function, not raw speed.
```
