---
slug: manacher-and-palindromes
title: "Manacher's algorithm: every palindrome in linear time"
description: Why expand-around-centre is O(n²) and by how much (measured), the separator-transformed string and the mirror rule traced position by position, the amortised argument, everything the radius array answers, when the quadratic version is still the right interview answer, what UTF-16 and combining characters do to naive palindrome checks, the eertree, and why DNA "palindromes" are a different thing.
minutes: 28
difficulty: hard
tags: [manacher, palindrome, string, expand-around-center, linear-time, eertree, unicode]
problems: [longest-palindromic-substring, palindromic-substrings]
---
"Find the longest palindromic substring" is one of the most-asked string questions in existence, and almost everyone answers it with expand-around-centre: for each of the `2n − 1` centres, grow outward while the characters match. It is short, it is correct, and it is `O(n²)` in the worst case. For a 20-character interview input that is invisible. For a `10⁶`-character input made of long runs, or a service answering "is this range a palindrome" a hundred thousand times per request, quadratic is the difference between milliseconds and minutes.

Manacher's algorithm (1975) computes the longest palindrome centred at *every* position in `O(n)`, using a single observation: inside a palindrome you already know about, the left half tells you about the right half. This lesson writes out the transformed string, traces the mirror rule position by position, proves the linear bound, and then covers what the textbooks skip: what the runtime does to the string (UTF-16, combining characters, case folding), the eertree, and the fact that a DNA "palindrome" is not a string palindrome at all.

## Expand-around-centre, and where the time goes

```viz
{"type": "string", "algorithm": "expand-palindrome", "text": "abacabad",
 "title": "Expand around every centre",
 "caption": "Each centre grows until a mismatch. On 'aaaaaaaa' every centre grows to the edge and the total work is quadratic."}
```

```python
def longest_expand(s):
    best = (0, 0)                              # (start, end) exclusive end
    for c in range(2 * len(s) - 1):
        l, r = c // 2, c // 2 + (c % 2)       # odd centre when c even, gap when odd
        while l >= 0 and r < len(s) and s[l] == s[r]:
            l -= 1
            r += 1
        if r - l - 1 > best[1] - best[0]:
            best = (l + 1, r)
    return s[best[0]:best[1]]
```

The cost is `Σ (radius at each centre)`. On random text most radii are 0 or 1 and the algorithm is effectively linear. On `aaaa…a` every centre expands to the nearest edge: the successful comparisons sum to about `n²/2` (`a^10,000` costs 50,005,000 of them). Measured in CPython 3.14 on one core: `a^10,000` takes 1.2 s, `a^20,000` takes 4.9 s (four times longer for twice the input, the quadratic signature), while Manacher takes 6 ms on the second. On 10⁵ random lowercase letters the two are indistinguishable: 0.02 s against 0.03 s, and Manacher is slightly slower because of the transformed string. Runs of one character and long periodic blocks are exactly what appears in genomic data, padding and compressed-log corpora, so the worst case is not theoretical.

The waste is that the expansions overlap. Once you know `abacaba` is a palindrome centred at the middle `c`, you know that the palindrome centred at the second `b` (right of centre) has *at least* the radius of the palindrome centred at the first `b` (left of centre), because the right half mirrors the left. Expand-around-centre throws that knowledge away and rechecks the characters.

## The transformed string

Palindromes have odd or even length, which means two kinds of centre (a character, or a gap between characters). Manacher removes the distinction by inserting a separator between every pair of characters and at both ends:

```text
s  =  a b a a b                      indices 0..4
T  =  # a # b # a # a # b #          indices 0..10, length 2n + 1
      0 1 2 3 4 5 6 7 8 9 10
```

`s[k]` sits at `T[2k + 1]`; every even index of `T` is a `#`. Every palindrome in `T` is now odd-length and centred on a position of `T`. A maximal palindrome in `T` always starts and ends on a `#` (if it ended on a letter, the `#`s on both sides would match and it could grow), so a palindrome of radius `r` in `T` (extending `r` positions each side of its centre) contains exactly `r` letters: it corresponds to a palindrome of **length `r`** in `s`. The even palindrome `aa` in `s` becomes `#a#a#` centred on the `#` at index 6, radius 2, length 2 in `s`.

Some implementations add sentinels, `T = ^#a#b#a#a#b#$`, so the expansion loop never needs a bounds check (`^` and `$` match nothing, including each other). That shifts every index by one: `s[k]` is then at `T[2k + 2]`, and the start of the palindrome centred at `i` with radius `P[i]` is `(i − P[i] − 1) / 2` instead of `(i − P[i]) / 2`. Mixing the two conventions is the most common off-by-one in this algorithm. The code below uses the `#`-only form with explicit bounds.

Define `P[i]` as the radius of the longest palindrome centred at `T[i]`. The goal is to fill `P` in `O(n)`.

## The mirror rule

Maintain the palindrome that currently reaches furthest right: its centre `C` and right boundary `R = C + P[C]`. For a new position `i < R`, its mirror around `C` is `i' = 2C − i`. Since `T[C − P[C] .. C + P[C]]` is a palindrome, the neighbourhood of `i` inside that range is the reflection of the neighbourhood of `i'`. Therefore:

- if the palindrome at `i'` fits inside the big one (`i' − P[i'] > C − P[C]`), then `P[i] = P[i']` exactly, and the first expansion attempt fails by construction;
- if it pokes out on the left, the reflection is only guaranteed up to the boundary, so `P[i] ≥ R − i`, and you must expand from there.

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

## The trace, position by position

`s = "abaab"`, `T = "#a#b#a#a#b#"`:

| `i` | `T[i]` | `C, R` before | mirror `i'` | `P[i']`, `R − i` | `P[i]` before expanding | comparisons made | `P[i]` after | `C, R` after |
|---|---|---|---|---|---|---|---|---|
| 0 | `#` | 0, 0 | none (`i ≥ R`) | | 0 | `T[−1]`: out of bounds | 0 | 0, 0 |
| 1 | `a` | 0, 0 | none | | 0 | `T[0]=T[2]` (`#=#`) yes; `T[−1]` out | 1 | 1, 2 |
| 2 | `#` | 1, 2 | none (`i = R`) | | 0 | `T[1]` vs `T[3]`: `a` vs `b` no | 0 | 1, 2 |
| 3 | `b` | 1, 2 | none | | 0 | `#=#`, `a=a`, `#=#` yes; `T[−1]` out | 3 | 3, 6 |
| 4 | `#` | 3, 6 | 2 | 0, 2 | `min(0, 2) = 0` | `T[3]` vs `T[5]`: `b` vs `a` no | 0 | 3, 6 |
| 5 | `a` | 3, 6 | 1 | 1, 1 | `min(1, 1) = 1` | `T[3]` vs `T[7]`: `b` vs `a` no | 1 | 3, 6 |
| 6 | `#` | 3, 6 | none (`i = R`) | | 0 | `a=a`, `#=#`, `b=b`, `#=#` yes; `T[1]` vs `T[11]` out | 4 | 6, 10 |
| 7 | `a` | 6, 10 | 5 | 1, 3 | `min(1, 3) = 1` | `T[5]` vs `T[9]`: `a` vs `b` no | 1 | 6, 10 |
| 8 | `#` | 6, 10 | 4 | 0, 2 | `min(0, 2) = 0` | `T[7]` vs `T[9]`: `a` vs `b` no | 0 | 6, 10 |
| 9 | `b` | 6, 10 | 3 | 3, 1 | `min(3, 1) = 1` | `T[7]` vs `T[11]`: out of bounds | 1 | 6, 10 |
| 10 | `#` | 6, 10 | none (`i = R`) | | 0 | `T[9]` vs `T[11]`: out of bounds | 0 | 6, 10 |

`P = [0, 1, 0, 3, 0, 1, 4, 1, 0, 1, 0]`. The maximum is 4 at `i = 6`, a separator, giving the even palindrome `baab` starting at `(6 − 4) / 2 = 1` in `s`. Three rows show the mirror rule doing different things. At `i = 7` the mirror's radius (1) was smaller than the distance to `R` (3), so the answer was copied exactly and the one comparison failed as predicted. At `i = 5` the mirror said "at least 1" and the boundary was at distance 1, so the expansion tried one more pair and failed. At `i = 9` the mirror `i' = 3` had radius 3, but the boundary was only 1 away, so the start value was clipped to 1; without the clip, `P[9]` would have claimed a palindrome running past the end of `T`.

## Why it is linear

Count comparisons. The `while` loop makes some number of *successful* comparisons (each increments `P[i]`) and then exactly one *failed* comparison or bounds check per position.

- Failed: one per `i`, so `2n + 1` in total.
- Successful: each one increases `i + P[i]`. When `i < R` and `P[i'] < R − i`, the first comparison fails (the mirror argument guarantees it), so there are no successful ones. Otherwise `P[i]` started at `R − i` or at 0 with `i ≥ R`, meaning `i + P[i] ≥ R` before the loop, and every success pushes `i + P[i]`, and therefore the new `R`, strictly beyond the old `R`. `R` never decreases and cannot exceed `2n`, so successful comparisons total at most `2n + 1`.

In the trace, 8 successful comparisons and 11 loop exits for `|T| = 11`: 19 comparisons in total, under the `2|T| + 2` the argument allows. `O(n)` overall, with the transformed string doubling the constant. The only positions that ever expand are those at or beyond `R` and those whose mirror touches the boundary; everything else is a copy plus one failed check.

## Recovering the answers

From `P`, everything about palindromes follows:

- **Longest palindromic substring**: `max(P)` is its length; if it occurs at `i`, the substring is `s[(i − P[i]) // 2 : (i + P[i]) // 2]`. For the leftmost longest, scan `i` left to right and update only on a strictly larger radius.
- **Count of palindromic substrings**: `Σ ⌈P[i] / 2⌉`. A centre with radius `r` in `T` contributes palindromes of lengths `r, r − 2, r − 4, …` down to 1 or 2, which is `⌈r / 2⌉` of them. For `abaab`: `0+1+0+2+0+1+2+1+0+1+0 = 8`: `a, aba, b, baab, a, aa, a, b` by start position. The *distinct* ones number five (`a, b, aa, aba, baab`); a string of length `n` has at most `n` distinct palindromic substrings, a fact the eertree below is built on.
- **Longest palindromic prefix / suffix**: the largest `i` with `i − P[i] = 0` (prefix) or `i + P[i] = 2n` (suffix). This is what "shortest palindrome by prepending characters" needs.
- **Is `s[l..r]` a palindrome**, for many queries: yes if and only if `P[l + r + 1] ≥ r − l + 1`, because the centre of `s[l..r]` in `T` is `l + r + 1` and its length is `r − l + 1`. `O(1)` per query after the `O(n)` build. For `abaab`: `[0, 2]` (`aba`) checks `P[3] = 3 ≥ 3`, yes; `[2, 3]` (`aa`) checks `P[6] = 4 ≥ 2`, yes; `[0, 4]` checks `P[5] = 1 ≥ 5`, no; `[3, 4]` (`ab`) checks `P[8] = 0 ≥ 2`, no.

```viz
{"type": "dp", "algorithm": "palindrome-substrings", "a": "abaab",
 "title": "Contrast: the O(n²) DP table for palindromic substrings",
 "caption": "dp[i][j] = (s[i] == s[j]) and dp[i+1][j-1]. It answers the same questions with n² memory. Manacher answers them with 2n + 1 integers."}
```

## Choosing the tool

| method | time | extra space | what it answers | reach for it when |
|---|---|---|---|---|
| Two-pointer check | `O(n)` per string | `O(1)` | is this one string a palindrome | one check; never Manacher |
| Expand-around-centre | `O(n²)` worst, near-linear on random text | `O(1)` | longest, count | interview default; inputs short or non-repetitive |
| Manacher | `O(n)` | `2n + 1` integers | radius at every centre; longest, count, prefix/suffix, `O(1)` range queries | `n ≥ 10⁵`, adversarial input, many queries |
| Interval DP table | `O(n²)` time and space | `n²` booleans | every `dp[l][r]`; generalises to palindromic *subsequences* and partitioning | the [string DP](/learn/algorithms/dynamic-programming/string-dp) family, never for the longest substring alone |
| Eertree | `O(n log σ)` online, `O(n)` with array children | `≤ n + 2` nodes | distinct palindromes, occurrence counts, per-position palindromic suffixes | distinct or online questions |
| Rolling hash + binary search | `O(n log n)` expected | `O(n)` | longest, probabilistically | you cannot recall Manacher and must beat `O(n²)` |

An interviewer who asks for the longest palindromic substring in a 45-minute slot is usually checking that you handle odd and even centres and write a clean helper. Write expand-around-centre *first*, state the complexity honestly (`O(n²)` worst case, the `a^n` input, near-linear on typical text), then name Manacher, sketch the mirror rule in two sentences, and offer to write it. That ordering shows judgement: the simplest correct tool, its limit, and what replaces it. Write Manacher when the problem says `n` up to `10⁶`, when the input is adversarial, when you need `P` for every centre, or when linear time is asked for. Practise both orders on [Longest Palindromic Substring](/practice/longest-palindromic-substring) (expand first, Manacher second) and [Palindromic Substrings](/practice/palindromic-substrings) (the `Σ ⌈P[i] / 2⌉` formula).

## Under the hood: what the runtime does to your string

Manacher's inner loop is `T[i − P[i] − 1] == T[i + P[i] + 1]`: indexed access to a string. What that costs, and what it compares, depends on the language, and the [numbers, strings and Unicode lesson](/learn/foundations/how-code-runs/numbers-strings-unicode) has the background.

**CPython.** A `str` is a compact array of code points at 1, 2 or 4 bytes each (PEP 393), so indexing is `O(1)` and compares whole code points. `"#".join(s)` allocates `T` once, `2n + 1` code points; `P` as a `list` costs 8 bytes per slot plus 28-byte `int` objects for radii above 256 (smaller ints are cached singletons), so `array('i')` or NumPy `int32` cuts a `10⁶`-element `P` from 8 MB of pointers to 4 MB. What indexing does **not** do is see grapheme clusters: `"é"` (`e` plus combining acute) is two code points, and its precomposed form `"é"` is one. The string that displays as `éé` written as `é e ́` reversed by code points is not equal to itself; after `unicodedata.normalize("NFC", s)` it is.

**JavaScript.** Strings are UTF-16 code units and `s[i]` returns one unit. `"😀".length` is 2 and `"😀".split("").reverse().join("")` is two swapped surrogate halves, so a naive check reports that a one-character string is not a palindrome. Iterate code points with `Array.from(s)` or `[...s]`, graphemes with `Intl.Segmenter` (ES2022), and normalise with `s.normalize("NFC")`. `new Array(n).fill(0)` for `P` is a packed small-integer array at 4 bytes per element under pointer compression (Chrome) or 8 (Node.js by default); `new Int32Array(n)` is 4 either way.

**Rust.** `&str` is UTF-8 and `s.as_bytes()[i]` is a byte, so a byte-level palindrome check breaks on any multi-byte character; `s.chars().rev()` compares code points, `unicode-segmentation` gives graphemes, and `unicode-normalization` gives NFC. Manacher over a `Vec<char>` (4 bytes each) or over bytes when the input is known ASCII.

**Case folding** changes lengths: `"İ".lower()` is two code points (`i` plus combining dot) and `"ß".casefold()` is `ss`, so an index in the folded string is not an index in the original. Fold a copy for the check and report positions from a mapping, or restrict folding to ASCII when the input allows it.

## Under the hood: the eertree

Manacher gives the longest palindrome at each centre but nothing about which palindromes are *distinct* or how often each occurs. The **eertree**, or palindromic tree (Rubinchik and Shur, 2015), stores one node per distinct palindromic substring: an edge labelled `c` from node `X` to node `cXc`, a suffix link from each node to its longest proper palindromic suffix, and two roots (the imaginary palindrome of length `−1` and the empty one). Its size bound comes from a counting fact: appending one character to a string creates at most one new distinct palindrome, the longest palindromic suffix of the new string, because any shorter palindromic suffix is a mirror image of one that already occurred inside it. So a string of length `n` has at most `n` distinct palindromic substrings and the tree has at most `n + 2` nodes.

The online build appends characters one at a time: from the node of the current longest palindromic suffix, follow suffix links until the character before that suffix equals the new character, then create or reuse the child. With a map per node it is `O(n log σ)`; with an array of `σ` children per node it is `O(n)`. What it answers that `P` does not: the number of distinct palindromes (`nodes − 2`; five for `abaab`), the occurrence count of each (propagate counts along suffix links from longest to shortest), the number of palindromic suffixes ending at each position (depth in the suffix-link tree), and all of it online, which Manacher is not.

## Palindromes in DNA are not string palindromes

Molecular biology uses the word for a different symmetry. DNA is double-stranded and the strands are antiparallel; a sequence is called palindromic when it equals its **reverse complement**: reverse the string and swap `A↔T`, `C↔G`. Restriction enzymes cut at such sites:

| enzyme | site | reverse complement | string palindrome? |
|---|---|---|---|
| EcoRI | `GAATTC` | `GAATTC` | no (`GAATTC` reversed is `CTTAAG`) |
| BamHI | `GGATCC` | `GGATCC` | no |
| HindIII | `AAGCTT` | `AAGCTT` | no |

Two consequences. First, a base is never its own complement, so a reverse-complement palindrome can never have a single base at its centre: every one is even-length, and only the gap centres matter. Second, Manacher *does* generalise: replace the equality test with `T[i − k] == complement(T[i + k])`. The mirror argument survives because if `s[C − k] = comp(s[C + k])` for the enclosing palindrome and `s[i' − k] = comp(s[i' + k])` at the mirror, then substituting gives `s[i − k] = comp(s[i + k])`, the same inequality-free reasoning as before. So "longest exact reverse-complement palindrome" is a linear scan with a complement-aware comparison.

What genome tools actually search for is looser: inverted repeats with a loop between the arms and a few mismatches (EMBOSS `palindrome` and `einverted`), and RNA hairpins, whose base pairing (`A–U`, `G–C`, `G–U`) is scored by folding algorithms such as Nussinov and Zuker that are `O(n³)` dynamic programmes. Those are alignment problems, not palindrome problems; the exact-match scan is at most a prefilter for them.

## Production failure modes

| symptom | diagnosis | fix |
|---|---|---|
| A string that displays as a palindrome (`éé`, `noël` in decomposed form) is reported as not one; the same string pasted from another source passes | Combining characters: the two `é` are encoded differently (precomposed `U+00E9` vs `e` + `U+0301`), and code-point comparison sees different sequences | Normalise to NFC (or NFD) before any character-level comparison; compare grapheme clusters when the input can carry emoji sequences |
| A one-character input such as `😀` fails the palindrome check in JavaScript or Java, passes in Python | UTF-16 code units: the character is a surrogate pair and reversing the units swaps them | Iterate code points (`Array.from`, `codePointAt`) or graphemes (`Intl.Segmenter`); in Java, `codePoints()` |
| Returned substring is off by one character, or slicing throws at the string boundary | Sentinel convention mixed: `(i − P[i]) / 2` used with a `^…$` transformed string, whose letters sit at `T[2k + 2]`, or the reverse | Pick one transform and derive the mapping once (`s[k] ↔ T[2k + 1]` without sentinels, `T[2k + 2]` with); test on a string whose longest palindrome touches an end |
| Case-insensitive check reports the wrong span, or misses `İ…i` | Full case mapping changed the length (`İ` → 2 code points, `ß` → `ss`), so indices in the folded copy do not map back | Simple (1:1) case folding, or fold a copy and translate indices through a map |
| A validation endpoint with a 10 kB limit shows p99 of seconds on some inputs | Expand-around-centre on inputs that are long runs of one character (padding, repeated separators): 4.9 s for `a^20,000` in CPython | Manacher, 6 ms on the same input; or reject inputs that are one repeated character before scanning |
| Code review asks why a single "is this string a palindrome" check allocates `2n + 1` characters and `n` integers | Manacher used where a two-pointer scan answers the question in `O(n)` time and `O(1)` space | Two pointers over code points (or graphemes); Manacher only when every centre's radius is needed |

## Interviewer follow-ups

**"Count the palindromic substrings of a string of length 10⁵."** Model answer: Manacher's `P`, then `Σ ⌈P[i] / 2⌉`, `O(n)`; each centre of radius `r` holds `⌈r / 2⌉` nested palindromes. Common wrong answer: the `O(n²)` interval DP, correct but 10¹⁰ cells.

**"Is 'A man, a plan, a canal: Panama' a palindrome? Now with arbitrary Unicode."** Model answer: normalise (NFC), case-fold, keep only letters and digits, then two pointers over code points, or graphemes if emoji sequences are possible; `O(n)` and `O(1)` extra space if you skip non-alphanumerics in place. Common wrong answer: `s == s[::-1]` on the raw string, which fails on punctuation, on decomposed accents, and in UTF-16 languages on any astral character.

**"Shortest palindrome by prepending characters to `s`?"** Model answer: find the longest palindromic *prefix* (largest `i` with `i − P[i] = 0`), then prepend the reverse of the remainder; equivalently, KMP's failure function on `s + '#' + reverse(s)`. Common wrong answer: test each prefix with a two-pointer scan, `O(n²)`.

**"Manacher has a while loop inside a for loop. Why is it linear?"** Model answer: every successful comparison pushes the right boundary `R` to a new maximum and `R ≤ 2n`; failed comparisons are one per position. Common wrong answer: "the mirror gives the answer directly", which is only the case when the mirror's palindrome sits strictly inside the enclosing one.

**"A biologist asks for palindromes in a genome. What do you build?"** Model answer: clarify that they mean reverse-complement palindromes, which are even-length and can be found exactly with Manacher using complement-aware equality over gap centres; then ask about mismatches and loops, because real inverted-repeat and hairpin searches allow them and are alignment or folding problems. Common wrong answer: run the string-palindrome code, which finds `ATTA` and misses `GAATTC`.

## What mid-level engineers get wrong

- **Leading with Manacher in the interview.** A subtle-index algorithm written under time pressure, for no extra credit when the simple version was acceptable; the bug usually lands in the sentinel arithmetic.
- **Claiming expand-around-centre is `O(n)`** because it was fast on the tests. It is near-linear on random text and `n²/2` comparisons on `a^n`.
- **Getting the count wrong.** `Σ P[i]` counts nothing meaningful; `Σ ⌈P[i] / 2⌉` counts palindromic substrings, with even and odd centres already unified by the separators.
- **Reversing the string to check a palindrome in JavaScript** and shipping a function that fails on any emoji.
- **Comparing bytes or code points without normalising** and shipping a function that fails on `é` depending on where the text was typed.
- **Reaching for Manacher for palindromic subsequences or partitioning**, which need the interval DP; the radius array says nothing about subsequences.

## Exercises

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

```exercise
id: manacher-range-queries
title: Answer palindrome range queries in O(1) each
prompt: |
  Implement `palindrome_queries(s, queries)`. Each query is `[l, r]` with
  `0 <= l <= r < len(s)`, inclusive on both ends. Return a list of
  booleans, one per query, saying whether `s[l..r]` is a palindrome.

  Precompute Manacher's radius array once, then answer each query in
  O(1): in the transformed string the centre of `s[l..r]` is index
  `l + r + 1` and the substring is a palindrome exactly when the radius
  there is at least `r - l + 1`. `queries` may be empty, and `s` may be
  empty (then `queries` is empty too).
languages: [python, javascript]
entry: palindrome_queries
starter:
  python: |
    def palindrome_queries(s, queries):
        # 1. P = manacher radius array over "#" + "#".join(s) + "#"
        # 2. for each [l, r]: P[l + r + 1] >= r - l + 1
        return []
  javascript: |
    function palindrome_queries(s, queries) {
      // 1. P = manacher radius array over "#" + s.split("").join("#") + "#"
      // 2. for each [l, r]: P[l + r + 1] >= r - l + 1
      return [];
    }
tests:
  - args: ["abaab", [[0, 2], [2, 3], [1, 4], [0, 4], [0, 0], [3, 4]]]
    expected: [true, true, true, false, true, false]
    label: the lesson's trace string
  - args: ["aaaa", [[0, 3], [1, 2], [0, 1]]]
    expected: [true, true, true]
  - args: ["abc", [[0, 1], [1, 1], [0, 2]]]
    expected: [false, true, false]
  - args: ["", []]
    expected: []
    label: empty string, no queries
  - args: ["racecar", [[0, 6], [1, 5], [2, 4], [0, 5], [3, 3]]]
    expected: [true, true, true, false, true]
    hidden: true
    label: nested odd palindromes and one that is not
  - args: ["abcba", [[0, 4], [1, 3], [0, 3], [4, 4]]]
    expected: [true, true, false, true]
    hidden: true
hints:
  - "Reuse the manacher function from the previous exercise; it is the only precomputation you need."
  - "Odd-length ranges have a letter at their centre (odd index of T) and even-length ranges a separator (even index); l + r + 1 lands on the right one in both cases."
  - "A single character [l, l] is always a palindrome: P[2l + 1] is at least 1."
```

## Senior signals

- You write expand-around-centre first, state its `O(n²)` worst case with the input that triggers it and a measured figure, then name Manacher and explain the mirror rule in two sentences.
- You explain why the separator string makes even and odd palindromes one case, why radius in `T` equals length in `s`, and how the index mapping changes when sentinels are added.
- You can argue the linear bound by counting: successful comparisons push `R` to a new maximum, failed ones are one per position.
- You know what the radius array gives beyond the longest substring: counts, prefix and suffix palindromes, `O(1)` range queries, and that the eertree is the structure for *distinct* palindromes.
- You know that a naive palindrome check breaks on UTF-16 surrogates, combining characters and length-changing case folds, and what to normalise and iterate by.
- You know that a DNA palindrome is a reverse-complement match, always even-length, and that real biological searches allow mismatches and loops, which makes them alignment problems.
- You keep palindromic *subsequence* problems separate and know they need DP, not Manacher.

## Check yourself

```quiz
- q: >-
    Why does Manacher insert a separator between every pair of characters?
  options: ["So both odd and even palindromes are centred on a single index of T", "So the expansion loop can never run past either end of the string", "To mark character boundaries, so radii count characters, not bytes", "To double the length, so the mirror step has more work to amortise"]
  answer: 0
  explanation: >-
    Even-length palindromes are centred between characters. With separators, that gap becomes a real index (a '#'), so one radius array and one expansion loop cover both kinds, and the radius in the transformed string equals the palindrome's length in the original. Guarding the ends is what the optional ^ and $ sentinels do, not the separators.
- q: >-
    At position i inside the current rightmost palindrome (centre C, right edge R), the mirror i' has radius 5 and R - i = 3. What is the starting radius for i, and why not 5?
  options: ["8, the mirror's radius plus the distance to R", "3, because the reflection is only known up to R", "0, because nothing is known about i until it expands", "5, because the mirror's radius carries over exactly"]
  answer: 1
  explanation: >-
    The palindrome at i' pokes outside the big palindrome on the left, so its reflection is only guaranteed up to the boundary at distance R - i. Copying 5 would assume characters beyond R match, which nothing has checked; the expansion loop then tests whether it extends further.
- q: >-
    Which input makes expand-around-centre quadratic but leaves Manacher linear?
  options: ["A string with no palindromes longer than 1, such as 'abcdefgh'", "A long run of one repeated character, such as 'aaaaaaaa'", "One long palindrome of distinct letters, such as 'abcdcba'", "A random string of lowercase letters, such as 'qhzbtkwa'"]
  answer: 1
  explanation: >-
    Every centre in a run of identical characters expands to the nearest edge, so the successful comparisons sum to about n²/2 (4.9 s for 20,000 characters in CPython). Manacher's mirror step supplies most of each radius for free and the total expansion work stays bounded by the length of T. A single long palindrome costs expansion only at its one centre, so it stays linear.
- q: >-
    You need to answer 10⁵ queries "is s[l..r] a palindrome" on a fixed string of length 10⁵. What do you precompute?
  options: ["Nothing; checking each query with two pointers is fast enough", "A hash set of every palindromic substring, looked up per query", "The O(n²) DP table dp[l][r], filled once and read per query", "Manacher's radius array, then one check at each query's centre"]
  answer: 3
  explanation: >-
    One O(n) pass gives the maximal radius at every centre; s[l..r] is a palindrome exactly when the radius at index l + r + 1 of the transformed string is at least r - l + 1, an O(1) check. Direct checking is O(n) per query, up to 10¹⁰ steps in total, and the DP table needs 10¹⁰ cells.
- q: >-
    A JavaScript function reverses a string and compares it to the original. It reports that the one-character string containing a single emoji is not a palindrome. Why?
  options: ["Emoji have no defined ordering, so string comparison on them is unspecified", "The reverse method drops non-ASCII characters, so the reversed string is empty", "The engine normalises the original string to NFD but not the reversed copy", "Strings are UTF-16 code units, so reversing swaps the emoji's two surrogate halves"]
  answer: 3
  explanation: >-
    An astral character such as an emoji occupies two UTF-16 code units, and unit-wise reversal swaps them, producing a different sequence. Iterating by code point (Array.from or the spread operator) or by grapheme (Intl.Segmenter) fixes it; no normalisation happens on its own, and reversal drops nothing.
- q: >-
    In a 45-minute interview you are asked for the longest palindromic substring. The strongest opening is:
  options: ["The O(n²) DP table, since it is the textbook answer and easy to verify", "Brute force over all substrings, then optimise once it passes tests", "Expand-around-centre, stating its O(n²) bound and Manacher's O(n)", "Manacher straight away, since linear time is what earns the credit"]
  answer: 2
  explanation: >-
    The simple correct solution with an honest bound, plus knowledge of the linear alternative, shows judgement. Leading with Manacher risks a sentinel bug under time pressure for no credit; the DP table uses n² memory for the same time bound as expansion.
```
