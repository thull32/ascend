---
slug: manacher-and-palindromes
title: "Manacher's algorithm: every palindrome in linear time"
description: Why expand-around-centre is O(n²), how Manacher reuses mirrored work to find the longest palindrome at every centre in O(n), and when the quadratic version is still the right answer in an interview.
minutes: 28
difficulty: hard
tags: [manacher, palindrome, string, expand-around-center, linear-time]
problems: [longest-palindromic-substring, palindromic-substrings]
---
"Find the longest palindromic substring" is one of the most-asked string questions in existence, and almost everyone answers it with expand-around-centre: for each of the `2n − 1` centres, grow outward while the characters match. It is short, it is correct, and it is `O(n²)` in the worst case. For a 20-character interview input that is invisible. For a DNA sequence where palindromic (reverse-complement) regions mark restriction sites and hairpin structures, or a text-processing pipeline scanning megabytes for symmetric patterns, quadratic is the difference between seconds and days.

Manacher's algorithm (1975) computes the longest palindrome centred at *every* position in `O(n)`, using a single observation: inside a palindrome you already know about, the left half tells you about the right half.

## Expand-around-centre, and where the time goes

```viz
{"type": "string", "algorithm": "expand-palindrome", "text": "abacabad",
 "title": "Expand around every centre",
 "caption": "Each centre grows until a mismatch. On 'aaaaaaaa' every centre grows to the edge and the total work is quadratic."}
```

The cost is `Σ (radius at each centre)`. On random text most radii are 0 or 1 and the algorithm is effectively linear. On `aaaa…a` every centre expands to the nearest edge: radii `1, 2, 3, …, n/2, …, 3, 2, 1`, summing to about `n²/4`. Strings of repeated characters and long periodic runs are exactly what appears in genomic data and in compressed-log corpora, so the worst case is not theoretical.

The waste is that the expansions overlap. Once you know `abacaba` is a palindrome centred at the middle `c`, you know that the palindrome centred at the second `b` (right of centre) has *at least* the radius of the palindrome centred at the first `b` (left of centre), because the right half mirrors the left. Expand-around-centre throws that knowledge away and rechecks the characters.

## The transformed string

Palindromes have odd or even length, which means two kinds of centre (a character, or a gap between characters). Manacher removes the distinction by inserting a separator between every pair of characters and at both ends:

```text
s = "abaab"
T = "#a#b#a#a#b#"
```

Every palindrome in `T` is now odd-length and centred on a position of `T`. A palindrome of radius `r` in `T` (extending `r` characters each side of its centre) corresponds to a palindrome of **length `r`** in `s`; the separators account for the halving. The even palindrome `aa` in `s` becomes `#a#a#` centred on a `#`, radius 2, length 2 in `s`. Some implementations add sentinels `^` and `$` at the ends so the expansion loop never needs a bounds check; the code below uses explicit bounds instead.

Define `P[i]` as the radius of the longest palindrome centred at `T[i]`. The goal is to fill `P` in `O(n)`.

## The mirror trick

Maintain the palindrome that currently reaches furthest right: its centre `C` and right boundary `R = C + P[C]`. For a new position `i` with `i < R`, its mirror around `C` is `i' = 2C − i`. Since `T[C − P[C] .. C + P[C]]` is a palindrome, the neighbourhood of `i` inside that range is the reflection of the neighbourhood of `i'`. Therefore:

- if the palindrome at `i'` fits entirely inside the big one (`i' − P[i'] > C − P[C]`), then `P[i] = P[i']` exactly;
- if it pokes out on the left, the reflection is only guaranteed up to the boundary, so `P[i] ≥ R − i`, and you must expand from there to find out whether it goes further.

Both cases collapse into `P[i] = min(P[i'], R − i)` followed by an expansion loop. When `i ≥ R` there is no information and you start from 0.

```python
def manacher(s):
    T = "#" + "#".join(s) + "#"
    n = len(T)
    P = [0] * n
    C = R = 0
    for i in range(n):
        if i < R:
            P[i] = min(P[2 * C - i], R - i)
        while (i - P[i] - 1 >= 0 and i + P[i] + 1 < n
               and T[i - P[i] - 1] == T[i + P[i] + 1]):
            P[i] += 1
        if i + P[i] > R:
            C, R = i, i + P[i]
    return P
```

Trace on `s = "abaab"`, `T = "#a#b#a#a#b#"` (indices 0..10):

| `i` | `T[i]` | `C, R` before | mirror `i'` | initial `P[i]` | after expand | `C, R` after |
|---|---|---|---|---|---|---|
| 0 | `#` | 0, 0 | | 0 | 0 | 0, 0 |
| 1 | `a` | 0, 0 | | 0 | 1 (`#a#`) | 1, 2 |
| 2 | `#` | 1, 2 | 0 | `min(0, 0) = 0` | 0 | 1, 2 |
| 3 | `b` | 1, 2 | | 0 | 3 (`#a#b#a#`) | 3, 6 |
| 4 | `#` | 3, 6 | 2 | `min(0, 2) = 0` | 0 | 3, 6 |
| 5 | `a` | 3, 6 | 1 | `min(1, 1) = 1` | 1 (tries `T[3]` vs `T[7]`: `b` vs `a`, stop) | 3, 6 |
| 6 | `#` | 3, 6 | | 0 (`i = R`, no information) | 4 (`#b#a#a#b#`) | 6, 10 |
| 7 | `a` | 6, 10 | 5 | `min(1, 3) = 1` | 1 (`T[5]` vs `T[9]`: `a` vs `b`, stop) | 6, 10 |
| 8 | `#` | 6, 10 | 4 | `min(0, 2) = 0` | 0 | 6, 10 |
| 9 | `b` | 6, 10 | 3 | `min(3, 1) = 1` | 1 (`T[7]` vs `T[11]`: out of bounds, stop) | 6, 10 |
| 10 | `#` | 6, 10 | 2 | `min(0, 0) = 0` | 0 | 6, 10 |

`P = [0,1,0,3,0,1,4,1,0,1,0]`. The maximum is 4 at `i = 6`, a separator, giving the even palindrome `baab` starting at `(i − P[i]) // 2 = 1` in `s`. Two rows show the mirror trick doing different things. At `i = 5` the mirror said "at least 1" and the boundary was at distance 1, so the expansion tried one more pair and failed. At `i = 9` the mirror `i' = 3` had radius 3, but the boundary was only 1 away, so the start value was clipped to 1; the expansion then hit the end of the string. Without the clip, `P[9]` would have been set to 3 and claimed a palindrome that runs past the end of `T`.

## Why it is linear

Two things happen in the loop: the `while` expands `P[i]`, and `R` moves right. Every successful iteration of the `while` increases `i + P[i]`, and when the loop finishes with `i + P[i] > R`, `R` is set to that value. So every expansion step beyond the initial `min(...)` pushes `R` further right than it has ever been, and `R` can only reach `n`. Total expansion steps across all `i` are therefore at most `n`, plus the `O(1)` per-position bookkeeping: `O(n)` overall, with the transformed string doubling the constant.

The expansions that do *not* push `R` are the ones that stop immediately, because the mirror already gave the exact answer (`P[i'] < R − i`) and the first comparison fails by construction. In the trace above, positions 7, 8 and 10 are of that kind: one failed comparison each, and `R` never moves.

## Recovering the answers

From `P`, everything about palindromes follows:

- **Longest palindromic substring**: `max(P)` is its length; if it occurs at `i`, the substring is `s[(i − P[i]) // 2 : (i + P[i]) // 2]`. For the leftmost longest, scan `i` left to right and update only on a strictly larger radius.
- **Count of palindromic substrings**: `Σ ⌈P[i] / 2⌉`. Each centre with radius `r` in `T` contributes palindromes of lengths `r, r − 2, r − 4, …` down to 1 or 2, which is `⌈r/2⌉` of them. For `abaab`, `P = [0,1,0,3,0,1,4,1,0,1,0]` gives `0+1+0+2+0+1+2+1+0+1+0 = 8`, and indeed `a, b, a, a, b, aba, aa, baab` are the eight.
- **Longest palindromic prefix / suffix**: the largest `i` with `i − P[i] = 0` (prefix) or `i + P[i] = n − 1` (suffix). This is what "shortest palindrome by prepending characters" needs.
- **Is `s[l..r]` a palindrome**, for many queries: it is a palindrome iff `P[centre] ≥ length` where `centre = l + r + 1` in `T`. `O(1)` per query after the `O(n)` build, which no amount of expand-around-centre can match.

```viz
{"type": "dp", "algorithm": "palindrome-substrings", "a": "abaab",
 "title": "Contrast: the O(n²) DP table for palindromic substrings",
 "caption": "dp[i][j] = (s[i] == s[j]) and dp[i+1][j-1]. It answers the same questions with n² memory. Manacher answers them with n integers."}
```

## When expand-around-centre is the right answer

An interviewer who asks for the longest palindromic substring in a 45-minute slot is usually checking that you can handle odd and even centres and write a clean helper. Expand-around-centre does that in fifteen lines with `O(1)` extra space, and it is what you should write *first*. Say the complexity honestly (`O(n²)` worst case, close to linear on typical text), and then say that Manacher achieves `O(n)`, sketch the mirror idea, and offer to write it if they want. That ordering demonstrates judgement: you picked the simplest correct tool, you know its limit, and you know what replaces it.

Write Manacher when the problem says `n` up to `10⁶`, when the input is adversarial (repeated characters, DNA), when you need `P` for every centre (counting, prefix queries, many range queries), or when the interviewer explicitly asks for linear time. Also note the `O(n²)` dynamic-programming table (`dp[i][j]`): it is never the right choice for the longest substring alone, because expand-around-centre has the same time bound with `O(1)` space, but it is worth knowing because it generalises to palindromic *subsequences*, which Manacher does not.

## Where palindromes matter outside interviews

- **Bioinformatics.** Restriction enzymes cut at reverse-complement palindromes (`GAATTC` reads the same on the complementary strand backwards). Finding hairpin loops and inverted repeats across a genome is a Manacher-style scan with complement-aware equality.
- **Text normalisation and detection.** Symmetric sequences of tokens signal certain kinds of spam and generated text; the linear scan is cheap enough to run on every message.
- **Compression and dedup research.** Palindromic runs are one of the structures that LZ-style compressors do not exploit directly, and "eertree" (palindromic tree) structures, a cousin of Manacher, enumerate distinct palindromes for this purpose.

Do the exercise, then work [Longest Palindromic Substring](/practice/longest-palindromic-substring) with expand-around-centre first and Manacher second, and [Palindromic Substrings](/practice/palindromic-substrings) with the `Σ ⌈P[i]/2⌉` formula.

## Exercise

```exercise
id: manacher-longest-palindrome
title: Longest palindromic substring in O(n)
prompt: |
  Return the longest palindromic substring of `s`. If several have the
  maximum length, return the one that starts earliest. Return `""` for the
  empty string.

  Implement Manacher's algorithm: build the separator-transformed string,
  fill the radius array with the mirror trick, and convert the best
  centre back to a slice of `s`. An expand-around-centre solution passes
  the tests but is O(n²); write the linear one.
languages: [python, javascript]
entry: longest_palindrome
starter:
  python: |
    def longest_palindrome(s):
        T = "#" + "#".join(s) + "#"
        n = len(T)
        P = [0] * n
        # TODO: C = R = 0; for each i: mirror init, expand, update C/R
        # then pick the i with the largest P[i] (first one wins) and return
        # s[(i - P[i]) // 2 : (i + P[i]) // 2]
        return ""
  javascript: |
    function longest_palindrome(s) {
      const T = "#" + s.split("").join("#") + "#";
      const n = T.length;
      const P = new Array(n).fill(0);
      // TODO: C = R = 0; for each i: mirror init, expand, update C/R
      // then pick the i with the largest P[i] (first one wins) and return
      // s.slice((i - P[i]) / 2, (i + P[i]) / 2)
      return "";
    }
tests:
  - args: ["babad"]
    expected: "bab"
    label: two answers of length 3, leftmost wins
  - args: ["cbbd"]
    expected: "bb"
    label: even length
  - args: ["a"]
    expected: "a"
  - args: ["abacdfgdcaba"]
    expected: "aba"
  - args: ["forgeeksskeeg"]
    expected: "geeksskeeg"
  - args: ["abcba"]
    expected: "abcba"
    hidden: true
    label: whole string
  - args: ["aaaa"]
    expected: "aaaa"
    hidden: true
    label: the quadratic worst case for expansion
  - args: [""]
    expected: ""
    hidden: true
    label: empty
hints:
  - "When i < R, start P[i] at min(P[2*C - i], R - i); otherwise start at 0. Then expand while T[i - P[i] - 1] == T[i + P[i] + 1] within bounds."
  - "After expanding, if i + P[i] > R, set C = i and R = i + P[i]."
  - "P[i] is the length of the palindrome in the original string; its start in s is (i - P[i]) / 2, always an integer."
```

## Senior signals

- You write expand-around-centre first, state its `O(n²)` worst case and give the input that triggers it, then name Manacher and explain the mirror idea in two sentences.
- You explain why the separator string makes even and odd palindromes one case, and why radius in `T` equals length in `s`.
- You can argue the linear bound: every expansion step beyond the mirror value pushes `R` to a new maximum, and `R ≤ n`.
- You know what the radius array gives beyond the longest substring: counts, prefix/suffix palindromes, and `O(1)` "is this range a palindrome" queries.
- You keep palindromic *subsequence* problems separate and know they need DP, not Manacher.

## Check yourself

```quiz
- q: >-
    Why does Manacher insert a separator between every pair of characters?
  options: ["To make the string longer so the algorithm has more work to amortise", "So every palindrome, odd or even length, is centred on a single index and the same expansion loop handles both", "To mark word boundaries", "To avoid comparing equal adjacent characters"]
  answer: 1
  explanation: >-
    Even-length palindromes are centred between characters. With separators, that gap becomes a real index (a '#'), so one radius array covers both kinds and the radius in the transformed string equals the palindrome's length in the original.
- q: >-
    At position i inside the current rightmost palindrome (centre C, right edge R), the mirror i' has radius 5 and R - i = 3. What is the starting radius for i, and why not 5?
  options: ["5, because mirrors are exact", "3, because the reflection is only guaranteed inside the known palindrome; beyond R nothing is known and you must expand", "0, because i is inside another palindrome", "8, the sum"]
  answer: 1
  explanation: >-
    The palindrome at i' pokes outside the big palindrome on the left, so its reflection is only guaranteed up to the boundary at distance R - i. The expansion loop then tests whether it extends further.
- q: >-
    Which input makes expand-around-centre quadratic but leaves Manacher linear?
  options: ["A random string of letters", "A string of one repeated character such as 'aaaaaaaa'", "A string with no palindromes longer than 1", "The empty string"]
  answer: 1
  explanation: >-
    Every centre in a run of identical characters expands to the nearest edge, so the radii sum to about n²/4. Manacher's mirror step supplies most of each radius for free and the total expansion work stays bounded by n.
- q: >-
    You need to answer 10⁵ queries "is s[l..r] a palindrome" on a fixed string of length 10⁵. What do you precompute?
  options: ["Nothing; check each query directly", "Manacher's radius array: s[l..r] is a palindrome iff the radius at its centre is at least its length", "A hash set of all palindromic substrings", "The O(n²) DP table"]
  answer: 1
  explanation: >-
    One O(n) pass gives the maximal radius at every centre; a range is a palindrome exactly when it fits inside that maximal one, an O(1) check. Direct checking is O(n) per query and the DP table needs 10¹⁰ cells.
- q: >-
    In a 45-minute interview you are asked for the longest palindromic substring. The strongest opening is:
  options: ["Write Manacher immediately to show mastery", "Write expand-around-centre, state its O(n²) worst case, and mention that Manacher gives O(n) if needed", "Write the O(n²) DP table because it is the textbook answer", "Ask whether the string is a palindrome"]
  answer: 1
  explanation: >-
    The simple correct solution with an honest bound, plus knowledge of the linear alternative, shows judgement. Leading with Manacher risks a bug under time pressure for no credit; the DP table uses n² memory for the same time bound as expansion.
```
